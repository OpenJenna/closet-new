import {
  CATEGORY_TREE,
  COLOR_SWATCHES,
  Category,
  PATTERN_OPTIONS,
  SEASONS,
  Season,
  TOP_CATEGORIES,
} from '../types/wardrobe';
import { compressDataUrlImage } from './imageCompression';
import { removeBackgroundLocally } from './localBackgroundRemoval';

export interface AnalyzedClothingResult {
  genericName?: string;
  category?: Category;
  subCategory?: string;
  colorName?: string;
  colorHex?: string;
  pattern?: string;
  seasons?: Season[];
  source: 'ai' | 'local';
}

const SUBCATEGORY_DEFAULT_NAMES: Record<string, string> = {
  '니트/스웨터': '니트 티',
  티셔츠: '라운드 티',
  '셔츠/블라우스': '셔츠',
  '맨투맨/후드': '맨투맨',
  '미니 원피스': '미니 원피스',
  '미디/롱 원피스': '롱 원피스',
  '니트 원피스': '니트 원피스',
  청바지: '청바지',
  슬랙스: '슬랙스',
  '트레이닝/조거': '조거 팬츠',
  반바지: '반바지',
  미니스커트: '미니 스커트',
  '롱/미디스커트': '롱 스커트',
  '데님 스커트': '데님 스커트',
  가디건: '가디건',
  '패딩/다운': '패딩',
  코트: '코트',
  '자켓/점퍼': '재킷',
  골프웨어: '골프웨어',
  러닝: '러닝복',
  수영복: '수영복',
  '요가/필라테스': '요가웨어',
  '테니스/기타': '스포츠웨어',
  스니커즈: '스니커즈',
  로퍼: '로퍼',
  구두: '구두',
  플랫슈즈: '플랫슈즈',
  워커: '워커',
  앵클부츠: '앵클부츠',
  부츠: '부츠',
  레인부츠: '레인부츠',
  '로퍼/플랫': '로퍼',
  샌들: '샌들',
  기타: '신발',
  백팩: '백팩',
  토트백: '토트백',
  '크로스/숄더백': '크로스백',
  스카프: '스카프',
  목도리: '목도리',
  '머플러/스카프': '목도리',
  모자: '모자',
  장갑: '장갑',
  벨트: '벨트',
};

const FILENAME_HINTS: Array<{
  pattern: RegExp;
  name: string;
  category: Category;
  subCategory: string;
}> = [
  { pattern: /골프|golf/i, name: '골프웨어', category: '스포츠웨어', subCategory: '골프웨어' },
  { pattern: /러닝|런닝|마라톤|running|레깅스/i, name: '러닝복', category: '스포츠웨어', subCategory: '러닝' },
  { pattern: /수영복|래쉬가드|비키니|swim|rashguard/i, name: '수영복', category: '스포츠웨어', subCategory: '수영복' },
  { pattern: /요가|필라테스|yoga|pilates/i, name: '요가웨어', category: '스포츠웨어', subCategory: '요가/필라테스' },
  { pattern: /테니스|tennis/i, name: '테니스웨어', category: '스포츠웨어', subCategory: '테니스/기타' },
  { pattern: /가디건|cardigan/i, name: '가디건', category: '아우터', subCategory: '가디건' },
  { pattern: /재킷|자켓|블레이저|jacket|blazer|jumper|점퍼/i, name: '재킷', category: '아우터', subCategory: '자켓/점퍼' },
  { pattern: /패딩|다운|푸퍼|puffer|down|padding/i, name: '패딩', category: '아우터', subCategory: '패딩/다운' },
  { pattern: /코트|트렌치|coat|trench/i, name: '코트', category: '아우터', subCategory: '코트' },
  { pattern: /니트|스웨터|knit|sweater|pullover/i, name: '니트 티', category: '상의', subCategory: '니트/스웨터' },
  { pattern: /라운드|크루넥|반팔|긴팔|티셔츠|tee|t-shirt|tshirt|crewneck/i, name: '라운드 티', category: '상의', subCategory: '티셔츠' },
  { pattern: /블라우스|blouse/i, name: '블라우스', category: '상의', subCategory: '셔츠/블라우스' },
  { pattern: /셔츠|shirt/i, name: '셔츠', category: '상의', subCategory: '셔츠/블라우스' },
  { pattern: /후드|후디|hoodie/i, name: '후드 티', category: '상의', subCategory: '맨투맨/후드' },
  { pattern: /맨투맨|스웻|sweatshirt/i, name: '맨투맨', category: '상의', subCategory: '맨투맨/후드' },
  { pattern: /청바지|데님\s*팬츠|진|denim|jeans/i, name: '청바지', category: '바지', subCategory: '청바지' },
  { pattern: /슬랙스|트라우저|slacks|trousers/i, name: '슬랙스', category: '바지', subCategory: '슬랙스' },
  { pattern: /조거|트레이닝|스웻팬츠|jogger/i, name: '조거 팬츠', category: '바지', subCategory: '트레이닝/조거' },
  { pattern: /반바지|쇼츠|shorts/i, name: '반바지', category: '바지', subCategory: '반바지' },
  { pattern: /원피스|드레스|dress|onepiece/i, name: '원피스', category: '원피스', subCategory: '미디/롱 원피스' },
  { pattern: /스커트|치마|skirt/i, name: '스커트', category: '치마', subCategory: '롱/미디스커트' },
  { pattern: /스니커즈|운동화|sneaker/i, name: '스니커즈', category: '신발', subCategory: '스니커즈' },
  { pattern: /레인\s*부츠|장화|rain\s*boot/i, name: '레인부츠', category: '신발', subCategory: '레인부츠' },
  { pattern: /앵클\s*부츠|ankle\s*boot/i, name: '앵클부츠', category: '신발', subCategory: '앵클부츠' },
  { pattern: /워커|컴뱃|combat|walker/i, name: '워커', category: '신발', subCategory: '워커' },
  { pattern: /부츠|boots/i, name: '부츠', category: '신발', subCategory: '부츠' },
  { pattern: /로퍼|loafer/i, name: '로퍼', category: '신발', subCategory: '로퍼' },
  { pattern: /플랫|발레리나|메리제인|flat|ballet/i, name: '플랫슈즈', category: '신발', subCategory: '플랫슈즈' },
  { pattern: /구두|힐|펌프스|더비|옥스포드|heel|pump|derby|oxford/i, name: '구두', category: '신발', subCategory: '구두' },
  { pattern: /샌들|슬리퍼|뮬|sandal|mule/i, name: '샌들', category: '신발', subCategory: '샌들' },
  { pattern: /백팩|backpack/i, name: '백팩', category: '가방', subCategory: '백팩' },
  { pattern: /토트백|tote/i, name: '토트백', category: '가방', subCategory: '토트백' },
  { pattern: /크로스백|숄더백|cross|shoulder/i, name: '크로스백', category: '가방', subCategory: '크로스/숄더백' },
  { pattern: /스카프|scarf/i, name: '스카프', category: '액세서리', subCategory: '스카프' },
  { pattern: /목도리|머플러|muffler/i, name: '목도리', category: '액세서리', subCategory: '목도리' },
  { pattern: /모자|볼캡|비니|cap|hat|beanie/i, name: '모자', category: '액세서리', subCategory: '모자' },
  { pattern: /장갑|글러브|glove|mitten/i, name: '장갑', category: '액세서리', subCategory: '장갑' },
  { pattern: /벨트|belt/i, name: '벨트', category: '액세서리', subCategory: '벨트' },
];

export function inferGenericGarmentFallback(
  category: Category,
  subCategory: string,
  fileName?: string
): { name: string; category: Category; subCategory: string } {
  if (fileName) {
    for (const hint of FILENAME_HINTS) {
      if (hint.pattern.test(fileName)) {
        return {
          name: hint.name,
          category: hint.category,
          subCategory: hint.subCategory,
        };
      }
    }
  }

  return {
    name: SUBCATEGORY_DEFAULT_NAMES[subCategory] || subCategory || '라운드 티',
    category,
    subCategory,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

// Convert sRGB [0..255] to CIELAB for perceptually accurate clothing color matching
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = (lr * 0.2126 + lg * 0.7152 + lb * 0.0722) / 1.0;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;

  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const SWATCH_LABS = COLOR_SWATCHES.map((sw) => {
  const [r, g, b] = hexToRgb(sw.hex);
  return {
    name: sw.name,
    hex: sw.hex,
    lab: rgbToLab(r, g, b),
  };
});

export function matchNearestColorSwatch(r: number, g: number, b: number): {
  name: string;
  hex: string;
} {
  const target = rgbToLab(r, g, b);
  let best = SWATCH_LABS[0];
  let bestDist = Infinity;

  for (const sw of SWATCH_LABS) {
    const dl = target[0] - sw.lab[0];
    const da = target[1] - sw.lab[1];
    const db = target[2] - sw.lab[2];
    const dist = dl * dl + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = sw;
    }
  }

  return { name: best.name, hex: best.hex };
}

/**
 * Extracts the dominant garment pixel color from an image data URL,
 * ignoring uniform studio backgrounds while handling white/ivory garments accurately.
 */
export async function detectDominantColorFromDataUrl(
  dataUrl: string
): Promise<{ name: string; hex: string }> {
  return new Promise((resolve) => {
    const fallback = { name: COLOR_SWATCHES[0].name, hex: COLOR_SWATCHES[0].hex };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(fallback);
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(fallback);
        return;
      }

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      const { data } = ctx.getImageData(0, 0, size, size);

      // Check if image already has transparent background (e.g. after background removal)
      let transparentCount = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 128) transparentCount++;
      }
      const isTransparentCutout = transparentCount > size * size * 0.08;

      // Estimate background color from outer 3px border (for opaque photos)
      let bgR = 0;
      let bgG = 0;
      let bgB = 0;
      let bgCount = 0;

      if (!isTransparentCutout) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (x < 3 || x >= size - 3 || y < 3 || y >= size - 3) {
              const idx = (y * size + x) * 4;
              bgR += data[idx];
              bgG += data[idx + 1];
              bgB += data[idx + 2];
              bgCount++;
            }
          }
        }
        bgR /= Math.max(1, bgCount);
        bgG /= Math.max(1, bgCount);
        bgB /= Math.max(1, bgCount);
      }

      // Quantize center-weighted foreground pixels into 16x16x16 buckets
      const buckets = new Map<
        number,
        { weight: number; rSum: number; gSum: number; bSum: number }
      >();
      let totalInnerPixels = 0;
      let fgWeightSum = 0;
      let allCenterRSum = 0;
      let allCenterGSum = 0;
      let allCenterBSum = 0;
      let allCenterWeight = 0;

      const minBound = isTransparentCutout ? 0 : Math.floor(size * 0.16);
      const maxBound = isTransparentCutout ? size : Math.ceil(size * 0.84);
      const center = size / 2;

      for (let y = minBound; y < maxBound; y++) {
        for (let x = minBound; x < maxBound; x++) {
          const idx = (y * size + x) * 4;
          const alpha = data[idx + 3];
          if (isTransparentCutout && alpha < 128) {
            continue;
          }

          totalInnerPixels++;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const dx = (x - center) / (size * 0.5);
          const dy = (y - center) / (size * 0.5);
          const spatialWeight = Math.max(0.25, 1.2 - (dx * dx + dy * dy));

          allCenterRSum += r * spatialWeight;
          allCenterGSum += g * spatialWeight;
          allCenterBSum += b * spatialWeight;
          allCenterWeight += spatialWeight;

          if (!isTransparentCutout) {
            // Distance from estimated background color
            const bgDiff = Math.sqrt(
              (r - bgR) * (r - bgR) +
                (g - bgG) * (g - bgG) +
                (b - bgB) * (b - bgB)
            );
            const isStudioWhiteBg =
              bgR > 236 && bgG > 236 && bgB > 236 && r > 240 && g > 240 && b > 240;

            if (bgDiff < 24 || isStudioWhiteBg) {
              continue;
            }
          }

          // Quantize to 16-step bins (0..15 per channel)
          const qr = r >> 4;
          const qg = g >> 4;
          const qb = b >> 4;
          const key = (qr << 8) | (qg << 4) | qb;

          const existing = buckets.get(key) || {
            weight: 0,
            rSum: 0,
            gSum: 0,
            bSum: 0,
          };
          existing.weight += spatialWeight;
          existing.rSum += r * spatialWeight;
          existing.gSum += g * spatialWeight;
          existing.bSum += b * spatialWeight;
          buckets.set(key, existing);
          fgWeightSum += spatialWeight;
        }
      }

      // If almost all center pixels matched white/bg (e.g. white shirt on white bg)
      if (fgWeightSum < totalInnerPixels * 0.06 || buckets.size === 0) {
        const avgR = allCenterRSum / Math.max(1, allCenterWeight);
        const avgG = allCenterGSum / Math.max(1, allCenterWeight);
        const avgB = allCenterBSum / Math.max(1, allCenterWeight);
        resolve(matchNearestColorSwatch(avgR, avgG, avgB));
        return;
      }

      // Find the strongest color cluster (top bin + neighboring bins)
      let topKey = -1;
      let topWeight = -1;
      for (const [key, b] of buckets.entries()) {
        if (b.weight > topWeight) {
          topWeight = b.weight;
          topKey = key;
        }
      }

      const tr = (topKey >> 8) & 0xf;
      const tg = (topKey >> 4) & 0xf;
      const tb = topKey & 0xf;

      let clusterR = 0;
      let clusterG = 0;
      let clusterB = 0;
      let clusterW = 0;

      for (const [key, b] of buckets.entries()) {
        const kr = (key >> 8) & 0xf;
        const kg = (key >> 4) & 0xf;
        const kb = key & 0xf;
        if (
          Math.abs(kr - tr) <= 1 &&
          Math.abs(kg - tg) <= 1 &&
          Math.abs(kb - tb) <= 1
        ) {
          clusterR += b.rSum;
          clusterG += b.gSum;
          clusterB += b.bSum;
          clusterW += b.weight;
        }
      }

      const finalR = clusterR / Math.max(1, clusterW);
      const finalG = clusterG / Math.max(1, clusterW);
      const finalB = clusterB / Math.max(1, clusterW);

      resolve(matchNearestColorSwatch(finalR, finalG, finalB));
    };
    img.src = dataUrl;
  });
}

async function ensureDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * Calls server-side Gemini Vision endpoint (/api/analyze-clothing) to recognize
 * the clothing photo's generic Korean name, category, subCategory, color, pattern, and seasons.
 * Falls back cleanly to null if unavailable.
 */
export async function analyzeClothingPhotoWithAI(
  imageSourceUrl: string
): Promise<AnalyzedClothingResult | null> {
  try {
    const imageDataUrl = await ensureDataUrl(imageSourceUrl);
    const response = await fetch('/api/analyze-clothing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      genericName?: string;
      category?: string;
      subCategory?: string;
      colorName?: string;
      pattern?: string;
      seasons?: string[];
    };

    const validCategory = TOP_CATEGORIES.includes(payload.category as Category)
      ? (payload.category as Category)
      : undefined;

    const validSubCategory =
      validCategory &&
      payload.subCategory &&
      CATEGORY_TREE[validCategory].includes(payload.subCategory)
        ? payload.subCategory
        : validCategory
          ? CATEGORY_TREE[validCategory][0]
          : undefined;

    const matchedSwatch = COLOR_SWATCHES.find(
      (sw) => sw.name === payload.colorName
    );

    const validPattern =
      payload.pattern && PATTERN_OPTIONS.includes(payload.pattern)
        ? payload.pattern
        : undefined;

    const validSeasons = Array.isArray(payload.seasons)
      ? payload.seasons.filter((s): s is Season =>
          SEASONS.includes(s as Season)
        )
      : undefined;

    return {
      genericName: payload.genericName?.trim() || undefined,
      category: validCategory,
      subCategory: validSubCategory,
      colorName: matchedSwatch?.name,
      colorHex: matchedSwatch?.hex,
      pattern: validPattern,
      seasons: validSeasons && validSeasons.length > 0 ? validSeasons : undefined,
      source: 'ai',
    };
  } catch {
    return null;
  }
}

/**
 * Generates a clean garment-only studio image on a pure white background
 * via server-side Gemini image generation (/api/isolate-clothing-image),
 * then compresses it to compact WebP.
 */
export async function generateIsolatedClothingImage(
  imageSourceUrl: string,
  itemHint?: string
): Promise<string> {
  const imageDataUrl = await ensureDataUrl(imageSourceUrl);
  const response = await fetch('/api/isolate-clothing-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, itemHint }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    imageDataUrl?: string;
    error?: string;
  };

  if (!response.ok || !payload.imageDataUrl) {
    throw new Error(
      payload.error || '옷 부분만 남긴 이미지를 생성하지 못했습니다.'
    );
  }

  return compressDataUrlImage(payload.imageDataUrl, 520, 0.76);
}

/**
 * Generates a clean 2D flat fashion icon / illustration matching the uploaded photo's
 * exact garment silhouette, structural details, and colors, then converts the pure-white
 * studio backdrop into a transparent WebP icon when possible.
 */
export async function generateIllustratedClothingImage(
  imageSourceUrl: string,
  options?: {
    itemHint?: string;
    colorName?: string;
    category?: string;
    subCategory?: string;
  }
): Promise<string> {
  const imageDataUrl = await ensureDataUrl(imageSourceUrl);
  const response = await fetch('/api/illustrate-clothing-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl,
      itemHint: options?.itemHint,
      colorName: options?.colorName,
      category: options?.category,
      subCategory: options?.subCategory,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    imageDataUrl?: string;
    error?: string;
  };

  if (!response.ok || !payload.imageDataUrl) {
    throw new Error(
      payload.error || '옷 그림 아이콘 이미지를 생성하지 못했습니다.'
    );
  }

  try {
    return await removeBackgroundLocally(payload.imageDataUrl, 500, {
      strictWhiteOnly: true,
    });
  } catch {
    return compressDataUrlImage(payload.imageDataUrl, 500, 0.78);
  }
}
