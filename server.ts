import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import express, { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_ROOT = path.resolve(__dirname, 'data', 'wardrobe');
const SAFE_UID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_IMAGE_ID_REGEX = /^img_[a-zA-Z0-9_-]{4,64}$/;
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let firebaseProjectId = '';
try {
  const cfgRaw = fs.readFileSync(
    path.resolve(__dirname, 'firebase-applet-config.json'),
    'utf8'
  );
  const cfg = JSON.parse(cfgRaw) as { projectId?: string };
  firebaseProjectId = typeof cfg.projectId === 'string' ? cfg.projectId.trim() : '';
} catch {
  firebaseProjectId = '';
}

let cachedFirebaseCerts: Record<string, string> = {};
let cachedCertsExpiresAt = 0;

async function getFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && now < cachedCertsExpiresAt && Object.keys(cachedFirebaseCerts).length > 0) {
    return cachedFirebaseCerts;
  }
  const resp = await fetch(FIREBASE_CERTS_URL);
  if (!resp.ok) {
    throw new Error('Firebase 인증 공개키를 불러오지 못했습니다.');
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  cachedFirebaseCerts = certs;
  cachedCertsExpiresAt = now + maxAgeSec * 1000;
  return certs;
}

async function verifyFirebaseIdToken(token: string): Promise<{ uid: string }> {
  if (!firebaseProjectId) {
    throw new Error('Firebase 프로젝트 설정을 찾을 수 없습니다.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('유효하지 않은 토큰 형식입니다.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(
    Buffer.from(headerB64, 'base64url').toString('utf8')
  ) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('지원하지 않는 토큰 서명 알고리즘입니다.');
  }

  let certs = await getFirebasePublicCerts(false);
  let cert = certs[header.kid];
  if (!cert) {
    certs = await getFirebasePublicCerts(true);
    cert = certs[header.kid];
  }
  if (!cert) {
    throw new Error('토큰 서명 키를 확인할 수 없습니다.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSig = verifier.verify(cert, Buffer.from(sigB64, 'base64url'));
  if (!isValidSig) {
    throw new Error('토큰 서명 검증에 실패했습니다.');
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8')
  ) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email_verified?: boolean;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== firebaseProjectId) {
    throw new Error('토큰 대상(aud)이 일치하지 않습니다.');
  }
  if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    throw new Error('토큰 발급자(iss)가 일치하지 않습니다.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('토큰이 만료되었습니다.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('토큰 발급 시각이 유효하지 않습니다.');
  }
  if (payload.email_verified !== true) {
    throw new Error('이메일 인증이 완료된 계정이 필요합니다.');
  }
  if (typeof payload.sub !== 'string' || !SAFE_UID_REGEX.test(payload.sub)) {
    throw new Error('유효하지 않은 사용자 식별자입니다.');
  }

  return { uid: payload.sub };
}

async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token.length > 8192) {
    res.status(401).json({ error: '유효한 인증 토큰이 아닙니다.' });
    return;
  }
  try {
    const verified = await verifyFirebaseIdToken(token);
    res.locals.authUid = verified.uid;
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : '인증에 실패했습니다.',
    });
  }
}

function getConfinedUserDir(uid: string): string {
  if (!SAFE_UID_REGEX.test(uid)) {
    throw new Error('유효하지 않은 사용자 경로입니다.');
  }
  const resolved = path.resolve(STORAGE_ROOT, uid);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error('허용되지 않은 파일 경로입니다.');
  }
  return resolved;
}

function getConfinedImageFilePath(
  uid: string,
  imageId: string,
  ext: 'webp' | 'jpg' | 'png'
): string {
  if (!SAFE_IMAGE_ID_REGEX.test(imageId)) {
    throw new Error('유효하지 않은 이미지 ID입니다.');
  }
  const imagesDir = path.resolve(getConfinedUserDir(uid), 'images');
  const filePath = path.resolve(imagesDir, `${imageId}.${ext}`);
  if (!filePath.startsWith(imagesDir + path.sep)) {
    throw new Error('허용되지 않은 이미지 경로입니다.');
  }
  return filePath;
}

function detectImageFormatFromMagicBytes(
  buf: Buffer
): { ext: 'webp' | 'jpg' | 'png'; contentType: string } | null {
  if (buf.length < 12) return null;
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: 'png', contentType: 'image/png' };
  }
  return null;
}

async function atomicWriteFile(filePath: string, data: string | Buffer): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsPromises.writeFile(tmpPath, data);
  await fsPromises.rename(tmpPath, filePath);
}

const CATEGORY_TREE: Record<string, string[]> = {
  상의: ['니트/스웨터', '티셔츠', '셔츠/블라우스', '맨투맨/후드'],
  바지: ['청바지', '슬랙스', '트레이닝/조거', '반바지'],
  아우터: ['가디건', '패딩/다운', '코트', '자켓/점퍼'],
  신발: [
    '스니커즈',
    '로퍼',
    '구두',
    '플랫슈즈',
    '워커',
    '앵클부츠',
    '부츠',
    '레인부츠',
    '샌들',
    '기타',
  ],
  치마: ['미니스커트', '롱/미디스커트', '데님 스커트'],
  원피스: ['미니 원피스', '미디/롱 원피스', '니트 원피스'],
  스포츠웨어: ['골프웨어', '러닝', '수영복', '요가/필라테스', '테니스/기타'],
  가방: ['백팩', '토트백', '크로스/숄더백'],
  액세서리: ['스카프', '목도리', '모자', '장갑', '벨트'],
};

const VALID_CATEGORIES = Object.keys(CATEGORY_TREE);

const VALID_COLORS = [
  '블랙',
  '화이트/아이보리',
  '그레이',
  '차콜',
  '네이비',
  '데님 블루',
  '라이트 블루',
  '베이지/카멜',
  '브라운',
  '올리브/카키',
  '청록색',
  '버건디/레드',
  '핑크',
  '연보라',
  '퍼플',
];

const VALID_SEASONS = ['봄', '여름', '가을', '겨울'];
const VALID_PATTERNS = [
  '무지',
  '스트라이프',
  '체크',
  '로고/그래픽',
  '케이블/짜임',
  '플로럴',
];

function createAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '4mb' }));

  app.post('/api/analyze-clothing', async (req, res) => {
    try {
      const { imageDataUrl } = req.body as { imageDataUrl?: string };
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        res.status(400).json({ error: 'imageDataUrl이 필요합니다.' });
        return;
      }

      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        res.status(400).json({ error: '유효한 이미지 data URL 형식이 아닙니다.' });
        return;
      }

      const ai = createAiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY가 설정되어 있지 않아 기본 인식 모드를 사용합니다.',
        });
        return;
      }

      const prompt = [
        '이 사진 속 패션/의류 아이템을 분석해서 한국어 옷장 앱에 바로 넣을 수 있는 기본 정보를 JSON으로 추출해 주세요.',
        '규칙:',
        '1. genericName: 브랜드명이나 색상, 수식어 없이 옷의 형태를 나타내는 일반적이고 자연스러운 한국어 대표 품목명만 짧게 작성하세요. (예: "가디건", "라운드 티", "니트 티", "재킷", "트렌치 코트", "패딩", "블라우스", "옥스포드 셔츠", "청바지", "슬랙스", "반바지", "롱 스커트", "미니 원피스", "골프웨어", "러닝복", "수영복", "스니커즈", "백팩", "토트백", "스카프", "목도리", "모자", "장갑")',
        `2. category: 반드시 다음 중 하나를 선택하세요: ${VALID_CATEGORIES.join(', ')}`,
        `3. subCategory: 선택한 category에 맞는 세부 카테고리 중 하나를 선택하세요: ${JSON.stringify(CATEGORY_TREE)}`,
        `4. colorName: 옷 자체의 주된 색상을 다음 중 가장 가까운 하나로 선택하세요(배경색은 무시): ${VALID_COLORS.join(', ')}`,
        `5. pattern: 다음 중 하나를 선택하세요: ${VALID_PATTERNS.join(', ')}`,
        `6. seasons: 입기 좋은 계절을 1~4개 선택하세요 (${VALID_SEASONS.join(', ')})`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              genericName: {
                type: Type.STRING,
                description: '일반적인 한국어 의류 품목명 (예: 가디건, 라운드 티, 니트 티, 재킷)',
              },
              category: {
                type: Type.STRING,
                description: '상위 카테고리',
              },
              subCategory: {
                type: Type.STRING,
                description: '세부 카테고리',
              },
              colorName: {
                type: Type.STRING,
                description: '옷의 주된 색상명',
              },
              pattern: {
                type: Type.STRING,
                description: '옷의 패턴',
              },
              seasons: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '착용 계절 목록',
              },
            },
            required: ['genericName', 'category', 'subCategory', 'colorName'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: '분석 결과를 받지 못했습니다.' });
        return;
      }

      const data = JSON.parse(rawText) as {
        genericName?: string;
        category?: string;
        subCategory?: string;
        colorName?: string;
        pattern?: string;
        seasons?: string[];
      };

      const category = VALID_CATEGORIES.includes(String(data.category))
        ? String(data.category)
        : undefined;
      const validSubs = category ? CATEGORY_TREE[category] : [];
      const subCategory =
        category && validSubs.includes(String(data.subCategory))
          ? String(data.subCategory)
          : category
            ? validSubs[0]
            : undefined;
      const colorName = VALID_COLORS.includes(String(data.colorName))
        ? String(data.colorName)
        : undefined;
      const pattern = VALID_PATTERNS.includes(String(data.pattern))
        ? String(data.pattern)
        : undefined;
      const seasons = Array.isArray(data.seasons)
        ? data.seasons.filter((s) => VALID_SEASONS.includes(String(s)))
        : undefined;
      const genericName =
        typeof data.genericName === 'string' && data.genericName.trim()
          ? data.genericName.trim().slice(0, 40)
          : undefined;

      res.json({
        genericName,
        category,
        subCategory,
        colorName,
        pattern,
        seasons: seasons && seasons.length > 0 ? seasons : undefined,
      });
    } catch (err) {
      console.error('Clothing photo analysis failed:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : '의류 사진 분석 중 오류가 발생했습니다.',
      });
    }
  });

  app.post('/api/isolate-clothing-image', async (req, res) => {
    try {
      const { imageDataUrl, itemHint } = (req.body ?? {}) as {
        imageDataUrl?: string;
        itemHint?: string;
      };

      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        res.status(400).json({ error: 'imageDataUrl이 필요합니다.' });
        return;
      }

      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        res.status(400).json({ error: '유효한 이미지 data URL 형식이 아닙니다.' });
        return;
      }

      const ai = createAiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY가 설정되어 있지 않아 이미지 생성 기능을 사용할 수 없습니다.',
        });
        return;
      }

      const targetDescription =
        typeof itemHint === 'string' && itemHint.trim()
          ? ` (${itemHint.trim()})`
          : '';

      const prompt = [
        `Extract ONLY the main clothing item or fashion accessory${targetDescription} from this photo and generate a clean e-commerce studio product image of that single garment alone on a solid pure white (#FFFFFF) background.`,
        'Requirements:',
        '- Preserve the exact color, fabric texture, pattern, stitching, buttons, collar, and proportions of the garment from the original photo.',
        '- Completely remove the background, room, floor, bed, hanger, hands, face, person/model, mannequin, and any unrelated objects or clutter.',
        '- If the item is currently worn by a person or on a hanger, reconstruct the garment neatly as a standalone flat-lay or invisible-mannequin studio garment centered with clean margin inside the 1:1 square frame.',
        '- Do not include any text, logos not on the garment, watermarks, frames, or extra props. Solid pure white (#FFFFFF) background only.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let generatedDataUrl: string | null = null;
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          generatedDataUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedDataUrl) {
        res.status(502).json({
          error: '옷 부분만 남긴 이미지를 생성하지 못했습니다. 다른 사진으로 다시 시도해 주세요.',
        });
        return;
      }

      res.json({ imageDataUrl: generatedDataUrl });
    } catch (err) {
      console.error('Clothing image isolation failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : '옷 이미지 생성 중 오류가 발생했습니다.';
      if (message.includes('API_KEY') || message.includes('PERMISSION_DENIED') || message.includes('403')) {
        res.status(403).json({
          error: '유료 API 키 설정(Settings > Secrets)을 확인한 뒤 다시 시도해 주세요.',
        });
        return;
      }
      if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        res.status(429).json({
          error: '이미지 생성 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/illustrate-clothing-image', async (req, res) => {
    try {
      const { imageDataUrl, itemHint, colorName, category, subCategory } = (req.body ?? {}) as {
        imageDataUrl?: string;
        itemHint?: string;
        colorName?: string;
        category?: string;
        subCategory?: string;
      };

      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        res.status(400).json({ error: 'imageDataUrl이 필요합니다.' });
        return;
      }

      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        res.status(400).json({ error: '유효한 이미지 data URL 형식이 아닙니다.' });
        return;
      }

      const ai = createAiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY가 설정되어 있지 않아 그림 아이콘 생성 기능을 사용할 수 없습니다.',
        });
        return;
      }

      const hintParts = [itemHint, category, subCategory, colorName]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());
      const hintLine =
        hintParts.length > 0 ? `Item context: ${hintParts.join(' / ')}.` : '';

      const prompt = [
        'Create a clean, refined, borderless 2D flat-lay garment graphic (wardrobe-app item thumbnail) of the exact clothing item or accessory shown in the reference photo.',
        hintLine,
        'Strict fidelity & style rules:',
        '- Match the EXACT silhouette, proportions, neckline/collar, sleeve length, cuffs, hem cut, buttons/zippers, pockets, pleats, and structural details from the uploaded photo.',
        '- Match the EXACT main color, accent trims, and fabric pattern (such as stripes, plaid, knit ribbing, or graphic placement) from the uploaded photo.',
        '- NO black outlines, NO dark contour lines, NO ink borders, and NO cartoon/comic line-art anywhere on the garment edges, seams, or details.',
        '- Define the shape and folds purely with clean color surfaces and soft, self-colored tonal shading (for white or very light garments, use only subtle pale warm-gray fabric shading—never dark or black outlines).',
        '- Render as a smooth, modern minimalist wardrobe graphic (front-facing flat-lay view, tidy silhouette without photographic noise or messy wrinkles).',
        '- Place the single garment centered with balanced clean margin inside a 1:1 square frame on a completely solid pure white (#FFFFFF) background.',
        '- Exclude any person, face, hands, mannequin, hanger, floor, room, background clutter, text, or watermarks.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let generatedDataUrl: string | null = null;
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          generatedDataUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedDataUrl) {
        res.status(502).json({
          error: '옷 그림 아이콘 이미지를 생성하지 못했습니다. 다시 시도해 주세요.',
        });
        return;
      }

      res.json({ imageDataUrl: generatedDataUrl });
    } catch (err) {
      console.error('Clothing illustration generation failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : '옷 그림 아이콘 생성 중 오류가 발생했습니다.';
      if (message.includes('API_KEY') || message.includes('PERMISSION_DENIED') || message.includes('403')) {
        res.status(403).json({
          error: '유료 API 키 설정(Settings > Secrets)을 확인한 뒤 다시 시도해 주세요.',
        });
        return;
      }
      if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        res.status(429).json({
          error: '이미지 생성 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recommend-pinterest', async (req, res) => {
    try {
      const {
        name = '',
        category = '',
        subCategory = '',
        colorName = '',
        pattern = '',
        material = '',
        seasons = [],
        tpo = '',
      } = (req.body ?? {}) as {
        name?: string;
        category?: string;
        subCategory?: string;
        colorName?: string;
        pattern?: string;
        material?: string;
        seasons?: string[];
        tpo?: string;
      };

      if (!category && !subCategory && !name) {
        res.status(400).json({ error: '추천을 위한 아이템 정보가 필요합니다.' });
        return;
      }

      const ai = createAiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY가 설정되어 있지 않아 기본 추천 모드를 사용합니다.',
        });
        return;
      }

      const seasonText = Array.isArray(seasons) && seasons.length > 0 ? seasons.join(', ') : '';
      const prompt = [
        '다음 옷장 아이템과 색상·종류가 가장 비슷한 옷을 활용한 실제 코디 착장을 Google 검색으로 Pinterest(site:pinterest.com)에서 찾아 4가지 스타일링 추천을 만들어 주세요.',
        '',
        `[아이템 정보]`,
        `- 아이템명: ${name || subCategory || category}`,
        `- 카테고리: ${category}${subCategory ? ` > ${subCategory}` : ''}`,
        `- 색상: ${colorName || '미지정'}`,
        pattern ? `- 패턴: ${pattern}` : '',
        material ? `- 소재: ${material}` : '',
        seasonText ? `- 계절: ${seasonText}` : '',
        tpo ? `- 착용 상황(TPO): ${tpo}` : '',
        '',
        '출력 규칙 (반드시 JSON 배열만 출력, 다른 설명 문장 금지):',
        '- 정확히 4개의 추천 착장 객체를 담은 JSON 배열을 반환하세요.',
        '- 각 객체 필드:',
        '  1. "title": 한눈에 들어오는 한국어 코디 제목 (20자 이내, 예: "크림 팬츠와 매치한 데일리 룩")',
        '  2. "tip": 이 옷의 색감과 어울리는 하의/상의/아우터/신발 조합 한 줄 팁 (한국어 45자 이내)',
        '  3. "query": Pinterest에서 가장 비슷한 착장 사진이 잘 검색되는 핵심 검색어 (영어 또는 한국어 3~5단어, 예: "lavender cardigan outfit street style")',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = (response.text ?? '').trim();
      const jsonMatch = /\[[\s\S]*\]/.exec(rawText);
      let parsedItems: Array<{ title?: string; tip?: string; query?: string }> = [];
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            parsedItems = parsed;
          }
        } catch {
          parsedItems = [];
        }
      }

      // Extract grounded Pinterest URLs from Google Search groundingMetadata
      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundedPinterestLinks: Array<{ uri: string; title: string }> = [];
      const seenUris = new Set<string>();

      for (const chunk of chunks) {
        const uri = chunk.web?.uri?.trim();
        const title = chunk.web?.title?.trim() ?? '';
        if (!uri || seenUris.has(uri)) continue;
        const lowerUri = uri.toLowerCase();
        const lowerTitle = title.toLowerCase();
        if (lowerUri.includes('pinterest') || lowerTitle.includes('pinterest')) {
          seenUris.add(uri);
          groundedPinterestLinks.push({
            uri,
            title: title || 'Pinterest 착장',
          });
        }
      }

      const recommendations = parsedItems
        .filter((it) => it && (it.title || it.query))
        .slice(0, 4)
        .map((it, idx) => {
          const query = (it.query || `${colorName} ${subCategory || name} 코디`).trim();
          const grounded = groundedPinterestLinks[idx];
          const url = grounded
            ? grounded.uri
            : `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
          return {
            title: (it.title || `${colorName} ${subCategory || category} 코디`).trim().slice(0, 40),
            tip: (it.tip || '비슷한 컬러와 실루엣의 Pinterest 착장을 모아봤어요.').trim().slice(0, 100),
            url,
            sourceLabel: grounded ? 'Pinterest 핀' : 'Pinterest 검색',
            query,
          };
        });

      res.json({
        recommendations,
        groundedCount: groundedPinterestLinks.length,
      });
    } catch (err) {
      console.error('Pinterest outfit recommendation failed:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Pinterest 코디 추천을 불러오는 중 오류가 발생했습니다.',
      });
    }
  });

  // ---------- Authenticated File-Based Wardrobe Storage API ----------

  app.get('/api/storage/wardrobe', requireFirebaseAuth, async (_req, res) => {
    try {
      const uid = String(res.locals.authUid);
      const userDir = getConfinedUserDir(uid);
      const filePath = path.resolve(userDir, 'wardrobe.json');
      if (!filePath.startsWith(userDir + path.sep)) {
        res.status(400).json({ error: '잘못된 경로 요청입니다.' });
        return;
      }

      try {
        const raw = await fsPromises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as {
          items?: unknown[];
          dailyLooks?: unknown[];
          updatedAt?: string;
        };
        res.json({
          exists: true,
          items: Array.isArray(parsed.items) ? parsed.items : [],
          dailyLooks: Array.isArray(parsed.dailyLooks) ? parsed.dailyLooks : [],
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          res.json({ exists: false, items: [], dailyLooks: [], updatedAt: '' });
          return;
        }
        throw err;
      }
    } catch (err) {
      console.error('Failed to read wardrobe file:', err);
      res.status(500).json({ error: '옷장 데이터 파일을 불러오지 못했습니다.' });
    }
  });

  app.put('/api/storage/wardrobe', requireFirebaseAuth, async (req, res) => {
    try {
      const uid = String(res.locals.authUid);
      const body = (req.body ?? {}) as {
        items?: unknown;
        dailyLooks?: unknown;
        updatedAt?: unknown;
      };

      if (!Array.isArray(body.items) || !Array.isArray(body.dailyLooks)) {
        res.status(400).json({ error: 'items 및 dailyLooks 배열이 필요합니다.' });
        return;
      }
      if (body.items.length > 5000 || body.dailyLooks.length > 10000) {
        res.status(413).json({ error: '허용된 최대 항목 수를 초과했습니다.' });
        return;
      }

      // Reject bloated inline base64 payloads inside JSON metadata file
      for (const rawItem of body.items) {
        if (!rawItem || typeof rawItem !== 'object') {
          res.status(400).json({ error: '유효하지 않은 아이템 데이터입니다.' });
          return;
        }
        const it = rawItem as { imageUrl?: unknown; additionalImages?: unknown };
        if (
          typeof it.imageUrl === 'string' &&
          (it.imageUrl.startsWith('data:image/') || it.imageUrl.length > 1024)
        ) {
          res.status(400).json({
            error: '이미지는 파일 저장소에 별도 저장 후 참조 경로로 기록해야 합니다.',
          });
          return;
        }
        if (Array.isArray(it.additionalImages)) {
          for (const extra of it.additionalImages) {
            if (
              typeof extra === 'string' &&
              (extra.startsWith('data:image/') || extra.length > 1024)
            ) {
              res.status(400).json({
                error: '추가 이미지는 파일 저장소에 별도 저장 후 참조 경로로 기록해야 합니다.',
              });
              return;
            }
          }
        }
      }

      const userDir = getConfinedUserDir(uid);
      const filePath = path.resolve(userDir, 'wardrobe.json');
      if (!filePath.startsWith(userDir + path.sep)) {
        res.status(400).json({ error: '잘못된 경로 요청입니다.' });
        return;
      }

      const payload = {
        version: 1,
        updatedAt:
          typeof body.updatedAt === 'string' && body.updatedAt
            ? body.updatedAt.slice(0, 64)
            : new Date().toISOString(),
        items: body.items,
        dailyLooks: body.dailyLooks,
      };
      const serialized = JSON.stringify(payload);
      await atomicWriteFile(filePath, serialized);
      res.json({ ok: true, bytes: Buffer.byteLength(serialized, 'utf8') });
    } catch (err) {
      console.error('Failed to write wardrobe file:', err);
      res.status(500).json({ error: '옷장 데이터 파일 저장에 실패했습니다.' });
    }
  });

  app.post('/api/storage/images/prune', requireFirebaseAuth, async (req, res) => {
    try {
      const uid = String(res.locals.authUid);
      const { keepIds } = (req.body ?? {}) as { keepIds?: unknown };
      if (!Array.isArray(keepIds)) {
        res.status(400).json({ error: 'keepIds 배열이 필요합니다.' });
        return;
      }
      const keepSet = new Set(
        keepIds.filter(
          (id): id is string => typeof id === 'string' && SAFE_IMAGE_ID_REGEX.test(id)
        )
      );

      const imagesDir = path.resolve(getConfinedUserDir(uid), 'images');
      let entries: string[] = [];
      try {
        entries = await fsPromises.readdir(imagesDir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          res.json({ ok: true, deleted: 0 });
          return;
        }
        throw err;
      }

      let deleted = 0;
      for (const fileName of entries) {
        const dotIdx = fileName.lastIndexOf('.');
        const baseId = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
        if (!SAFE_IMAGE_ID_REGEX.test(baseId) || keepSet.has(baseId)) continue;
        const target = path.resolve(imagesDir, fileName);
        if (!target.startsWith(imagesDir + path.sep)) continue;
        try {
          await fsPromises.unlink(target);
          deleted += 1;
        } catch {
          // Ignore individual unlink failures
        }
      }
      res.json({ ok: true, deleted });
    } catch (err) {
      console.error('Failed to prune unused images:', err);
      res.status(500).json({ error: '미사용 이미지 정리에 실패했습니다.' });
    }
  });

  app.post(
    '/api/storage/images/:imageId',
    requireFirebaseAuth,
    express.raw({
      type: ['image/webp', 'image/jpeg', 'image/png'],
      limit: '512kb',
    }),
    async (req, res) => {
      try {
        const uid = String(res.locals.authUid);
        const imageId = String(req.params.imageId || '');
        if (!SAFE_IMAGE_ID_REGEX.test(imageId)) {
          res.status(400).json({ error: '유효하지 않은 이미지 ID입니다.' });
          return;
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          res.status(400).json({ error: '이미지 바이너리 데이터가 필요합니다.' });
          return;
        }

        const detected = detectImageFormatFromMagicBytes(req.body);
        if (!detected) {
          res.status(400).json({ error: '지원되는 이미지 형식(WebP/JPEG/PNG)이 아닙니다.' });
          return;
        }

        // Remove any prior extension variant for this imageId
        const allExts: Array<'webp' | 'jpg' | 'png'> = ['webp', 'jpg', 'png'];
        for (const ext of allExts) {
          if (ext === detected.ext) continue;
          const oldPath = getConfinedImageFilePath(uid, imageId, ext);
          await fsPromises.unlink(oldPath).catch(() => {});
        }

        const targetPath = getConfinedImageFilePath(uid, imageId, detected.ext);
        await atomicWriteFile(targetPath, req.body);
        res.json({ ok: true, id: imageId, bytes: req.body.length });
      } catch (err) {
        console.error('Failed to save image file:', err);
        res.status(500).json({ error: '이미지 파일 저장에 실패했습니다.' });
      }
    }
  );

  app.get('/api/storage/images/:imageId', requireFirebaseAuth, async (req, res) => {
    try {
      const uid = String(res.locals.authUid);
      const imageId = String(req.params.imageId || '');
      if (!SAFE_IMAGE_ID_REGEX.test(imageId)) {
        res.status(400).json({ error: '유효하지 않은 이미지 ID입니다.' });
        return;
      }

      const variants: Array<{ ext: 'webp' | 'jpg' | 'png'; type: string }> = [
        { ext: 'webp', type: 'image/webp' },
        { ext: 'jpg', type: 'image/jpeg' },
        { ext: 'png', type: 'image/png' },
      ];

      for (const variant of variants) {
        const candidate = getConfinedImageFilePath(uid, imageId, variant.ext);
        try {
          const buf = await fsPromises.readFile(candidate);
          res.setHeader('Content-Type', variant.type);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
          res.send(buf);
          return;
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            throw err;
          }
        }
      }

      res.status(404).json({ error: '이미지 파일을 찾을 수 없습니다.' });
    } catch (err) {
      console.error('Failed to serve image file:', err);
      res.status(500).json({ error: '이미지 파일을 불러오지 못했습니다.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Closet Note server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
