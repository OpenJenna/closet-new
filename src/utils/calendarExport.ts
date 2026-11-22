import { DailyLook, WardrobeItem, WeatherCondition } from '../types/wardrobe';
import {
  computeCollageSlots,
  getLookCustomOffsets,
  resolveLookItems,
} from './collageLayout';
import { getTransparentGarmentCutout } from './transparentCutout';
import {
  formatCurrencyKRW,
  formatKoreanFullDate,
  getWeatherLabel,
} from './formatters';

function adjustHex(hex: string, amount: number): string {
  const clean = (hex || '#3F3F46').replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return '#3F3F46';
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function isLightHex(hex: string): boolean {
  const clean = (hex || '#3F3F46').replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return false;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 185;
}

function buildGarmentSvgMarkup(
  item: Pick<
    WardrobeItem,
    'category' | 'subCategory' | 'colorHex' | 'pattern' | 'imageKey'
  >
): string {
  const base = item.colorHex || '#27272A';
  const light = isLightHex(base);
  const shade = adjustHex(base, light ? -22 : -20);
  const highlight = adjustHex(base, light ? 8 : 26);
  const strokeCol = light ? '#CBD5E1' : adjustHex(base, -35);
  const detailCol = light ? '#94A3B8' : adjustHex(base, 48);
  const key = item.imageKey || '';
  const sub = item.subCategory || '';
  const cat = item.category;

  let shape = '';

  if (
    cat === '바지' ||
    key.startsWith('jeans') ||
    key.startsWith('slacks') ||
    key.startsWith('shorts') ||
    key.startsWith('jogger')
  ) {
    if (sub.includes('반바지') || key.includes('shorts')) {
      shape = `
        <path d="M58 58 L142 58 L152 132 L112 136 L100 98 L88 136 L48 132 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M58 66 H142" stroke="${detailCol}" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.6" />
        <path d="M98 58 V92" stroke="${shade}" stroke-width="2" />
      `;
    } else {
      const isDenim = sub.includes('청바지') || key.includes('jeans');
      shape = `
        <path d="M66 24 L134 24 L140 176 L109 178 L100 78 L91 178 L60 176 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M66 34 H134" stroke="${detailCol}" stroke-width="1.4" opacity="0.75" />
        <circle cx="100" cy="29" r="2.2" fill="${isDenim ? '#D4A359' : detailCol}" />
        <path d="M100 34 V66" stroke="${detailCol}" stroke-width="1.3" opacity="0.65" />
      `;
    }
  } else if (cat === '치마' || key.startsWith('skirt')) {
    const isMini = sub.includes('미니');
    const bottomY = isMini ? 132 : 168;
    shape = `
      <path d="M68 36 L132 36 L152 ${bottomY} Q100 ${bottomY + 8} 48 ${bottomY} Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M67 45 H133" stroke="${detailCol}" stroke-width="1.4" opacity="0.7" />
    `;
  } else if (cat === '원피스' || key.startsWith('dress')) {
    shape = `
      <path d="M72 28 L86 24 Q100 38 114 24 L128 28 L142 74 L126 80 L122 68 L148 172 Q100 180 52 172 L78 68 L74 80 L58 74 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M74 82 H126" stroke="${detailCol}" stroke-width="1.6" opacity="0.65" />
    `;
  } else if (
    cat === '아우터' ||
    key.startsWith('puffer') ||
    key.startsWith('cardigan') ||
    key.startsWith('coat') ||
    key.startsWith('trench')
  ) {
    if (sub.includes('패딩') || key.includes('puffer')) {
      shape = `
        <path d="M76 20 Q100 12 124 20 L120 34 H80 Z" fill="${shade}" stroke="${strokeCol}" stroke-width="1.4" />
        <path d="M66 30 L134 30 L166 116 L146 122 L134 74 L142 172 Q100 178 58 172 L66 74 L54 122 L34 116 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M65 56 H135 M64 80 H136 M63 104 H137 M61 128 H139 M59 150 H141" stroke="${shade}" stroke-width="1.8" opacity="0.7" />
        <path d="M100 30 V174" stroke="${detailCol}" stroke-width="1.8" opacity="0.75" />
      `;
    } else if (sub.includes('코트') || key.includes('coat') || key.includes('trench')) {
      shape = `
        <path d="M64 28 L84 22 L100 38 L116 22 L136 28 L166 118 L145 124 L134 74 L140 172 H60 L66 74 L55 124 L34 118 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
        <rect x="64" y="92" width="72" height="7" rx="2" fill="${shade}" stroke="${strokeCol}" stroke-width="1" />
      `;
    } else {
      shape = `
        <path d="M68 30 L85 26 Q100 44 115 26 L132 30 L166 118 L148 124 L132 74 L134 156 Q100 162 66 156 L68 74 L52 124 L34 118 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M100 42 V157" stroke="${shade}" stroke-width="2.5" opacity="0.65" />
      `;
    }
  } else if (
    cat === '상의' ||
    key.startsWith('knit') ||
    key.startsWith('striped') ||
    key.startsWith('tee')
  ) {
    const isStriped = item.pattern === '스트라이프' || key.includes('striped');
    const stripeLines = isStriped
      ? `<g clip-path="url(#tc)" opacity="0.85">${[42, 54, 66, 78, 90, 102, 114, 126, 138, 150]
          .map(
            (y) =>
              `<rect x="25" y="${y}" width="150" height="4.5" fill="${light ? '#1E3A5F' : '#F8FAFC'}" />`
          )
          .join('')}</g>`
      : '';
    shape = `
      <defs><clipPath id="tc"><path d="M68 32 L86 26 Q100 38 114 26 L132 32 L166 116 L147 122 L132 74 L134 156 Q100 162 66 156 L68 74 L53 122 L34 116 Z" /></clipPath></defs>
      <path d="M68 32 L86 26 Q100 38 114 26 L132 32 L166 116 L147 122 L132 74 L134 156 Q100 162 66 156 L68 74 L53 122 L34 116 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      ${stripeLines}
      <path d="M84 27 Q100 42 116 27" fill="none" stroke="${shade}" stroke-width="3.2" stroke-linecap="round" />
    `;
  } else if (cat === '스포츠웨어') {
    if (sub.includes('수영복')) {
      shape = `
        <path d="M72 36 L82 36 L86 68 Q100 76 114 68 L118 36 L128 36 L132 82 L138 142 Q122 152 108 168 L92 168 Q78 152 62 142 L68 82 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      `;
    } else {
      shape = `
        <path d="M70 34 L86 28 Q100 40 114 28 L130 34 L158 84 L138 92 L130 68 L132 156 Q100 162 68 156 L70 68 L62 92 L42 84 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M84 29 L94 48 L100 42 L106 48 L116 29" fill="${shade}" stroke="${strokeCol}" stroke-width="1.2" stroke-linejoin="round" />
      `;
    }
  } else if (cat === '신발' || key.startsWith('sneakers') || key.startsWith('boots')) {
    if (sub.includes('부츠') || key.includes('boots')) {
      shape = `
        <g transform="translate(-8, 6)">
          <path d="M54 44 L86 44 L90 112 L114 128 Q120 138 112 146 L50 146 L50 108 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M48 144 H116 V154 H48 Z" fill="#0F172A" />
        </g>
        <g transform="translate(36, 16)">
          <path d="M54 44 L86 44 L90 112 L114 128 Q120 138 112 146 L50 146 L50 108 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M48 144 H116 V154 H48 Z" fill="#0F172A" />
        </g>
      `;
    } else {
      shape = `
        <g transform="translate(18, -14)">
          <path d="M36 112 Q42 78 68 74 L92 92 L134 104 Q152 108 150 124 L34 124 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.4" stroke-linejoin="round" />
          <path d="M32 122 H152 Q152 132 142 133 H36 Q30 131 32 122 Z" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1.2" />
        </g>
        <g transform="translate(-8, 18)">
          <path d="M36 112 Q42 78 68 74 L92 92 L134 104 Q152 108 150 124 L34 124 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M32 122 H152 Q152 132 142 133 H36 Q30 131 32 122 Z" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.2" />
        </g>
      `;
    }
  } else if (cat === '가방' || key.startsWith('backpack') || key.startsWith('tote')) {
    if (sub.includes('백팩') || key.includes('backpack')) {
      shape = `
        <path d="M86 38 Q100 20 114 38" fill="none" stroke="${shade}" stroke-width="6" stroke-linecap="round" />
        <rect x="52" y="38" width="96" height="126" rx="34" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" />
        <rect x="64" y="102" width="72" height="50" rx="14" fill="${shade}" stroke="${strokeCol}" stroke-width="1.2" />
      `;
    } else {
      shape = `
        <path d="M74 68 C74 30 126 30 126 68" fill="none" stroke="${shade}" stroke-width="6" stroke-linecap="round" />
        <path d="M46 68 H154 L144 162 Q100 168 56 162 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      `;
    }
  } else if (sub.includes('모자')) {
    shape = `
      <path d="M46 112 C46 66 74 48 100 48 C126 48 154 66 154 112 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M44 112 Q104 104 170 124 Q142 138 98 128 Q62 122 44 112 Z" fill="${shade}" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
    `;
  } else if (sub.includes('장갑')) {
    shape = `
      <g transform="translate(-14, 4)">
        <path d="M62 152 V96 L50 84 Q45 78 52 73 Q58 69 64 78 L66 44 Q68 38 73 38 Q78 38 79 44 L80 74 L82 40 Q84 34 89 34 Q94 34 95 40 L95 74 L98 44 Q100 38 105 38 Q110 38 111 44 L110 80 L114 54 Q116 48 121 49 Q126 50 125 56 L120 112 L116 152 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      </g>
      <g transform="translate(30, 12)">
        <path d="M62 152 V96 L50 84 Q45 78 52 73 Q58 69 64 78 L66 44 Q68 38 73 38 Q78 38 79 44 L80 74 L82 40 Q84 34 89 34 Q94 34 95 40 L95 74 L98 44 Q100 38 105 38 Q110 38 111 44 L110 80 L114 54 Q116 48 121 49 Q126 50 125 56 L120 112 L116 152 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
      </g>
    `;
  } else if (sub.includes('벨트')) {
    shape = `
      <ellipse cx="100" cy="100" rx="64" ry="38" fill="none" stroke="${shade}" stroke-width="16" />
      <ellipse cx="100" cy="100" rx="64" ry="38" fill="none" stroke="url(#g)" stroke-width="12" />
      <rect x="86" y="126" width="28" height="22" rx="4" fill="#CBD5E1" stroke="#64748B" stroke-width="2" />
    `;
  } else {
    shape = `
      <path d="M66 36 Q100 26 134 36 L142 74 L128 164 L104 164 L106 78 L86 152 L62 146 L74 74 Z" fill="url(#g)" stroke="${strokeCol}" stroke-width="1.5" stroke-linejoin="round" />
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${highlight}" />
        <stop offset="55%" stop-color="${base}" />
        <stop offset="100%" stop-color="${shade}" />
      </linearGradient>
    </defs>
    ${shape}
  </svg>`;
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface ResolvedCanvasAsset {
  img: HTMLImageElement;
  aspectRatio: number;
}

async function resolveItemCanvasImage(
  item: WardrobeItem,
  cache: Map<string, ResolvedCanvasAsset | null>
): Promise<ResolvedCanvasAsset | null> {
  const cacheKey = item.imageUrl
    ? `url:${item.id}:${item.imageUrl.slice(0, 64)}`
    : `svg:${item.category}:${item.subCategory}:${item.colorHex}:${item.pattern ?? ''}:${item.imageKey ?? ''}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  let img: HTMLImageElement | null = null;
  let aspectRatio = 1;
  if (item.imageUrl) {
    const cutout = await getTransparentGarmentCutout(item.imageUrl);
    img = await loadImageSafe(cutout.src);
    aspectRatio = cutout.aspectRatio || 1;
    if (!img) {
      img = await loadImageSafe(item.imageUrl);
      if (img && img.naturalWidth && img.naturalHeight) {
        aspectRatio = img.naturalWidth / img.naturalHeight;
      }
    }
  }
  if (!img) {
    const svg = buildGarmentSvgMarkup(item);
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    img = await loadImageSafe(svgDataUrl);
    aspectRatio = 1;
  }
  const result = img ? { img, aspectRatio } : null;
  cache.set(cacheKey, result);
  return result;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const iw = img.naturalWidth || img.width || 200;
  const ih = img.naturalHeight || img.height || 200;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

async function drawOutfitCollage(
  ctx: CanvasRenderingContext2D,
  items: WardrobeItem[],
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  imageCache: Map<string, ResolvedCanvasAsset | null>,
  lookId?: string
) {
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();

  const pad = Math.max(4, Math.min(w, h) * 0.04);
  const innerX = x + pad;
  const innerY = y + pad;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const resolvedMap = new Map<string, ResolvedCanvasAsset>();
  const aspectRatiosById: Record<string, number> = {};
  for (const item of items) {
    const asset = await resolveItemCanvasImage(item, imageCache);
    if (asset) {
      resolvedMap.set(item.id, asset);
      aspectRatiosById[item.id] = asset.aspectRatio;
    }
  }

  const slots = computeCollageSlots(
    items,
    aspectRatiosById,
    getLookCustomOffsets(lookId)
  );
  for (const { item, box } of slots) {
    const asset = resolvedMap.get(item.id);
    if (asset) {
      drawContainImage(
        ctx,
        asset.img,
        innerX + box.left * innerW,
        innerY + box.top * innerH,
        box.width * innerW,
        box.height * innerH
      );
    }
  }
  ctx.restore();
}

function getWeatherEmoji(condition: WeatherCondition): string {
  switch (condition) {
    case 'sunny':
      return '☀';
    case 'partly_cloudy':
      return '⛅';
    case 'cloudy':
      return '☁';
    case 'rainy':
      return '☂';
    case 'snowy':
      return '❄';
  }
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed ? `${trimmed}…` : '';
}

async function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) {
    throw new Error('이미지 파일을 생성하지 못했습니다.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const FONT_STACK =
  '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/**
 * Exports an entire month calendar of daily looks as a phone-sized PNG (900px wide).
 */
export async function exportMonthCalendarImage(params: {
  year: number;
  month: number;
  calendarCells: Array<{
    isoDate: string;
    dayNumber: number;
    isCurrentMonth: boolean;
  }>;
  looksByDate: Record<string, DailyLook[]>;
  itemsById: Record<string, WardrobeItem>;
  lookCount: number;
  monthlySpend: number;
}): Promise<void> {
  const { year, month, calendarCells, looksByDate, itemsById, lookCount, monthlySpend } =
    params;

  const width = 900; // Mobile-friendly width
  const padX = 32;
  const headerH = 124;
  const weekdayH = 40;
  const rows = Math.ceil(calendarCells.length / 7);
  const cellW = (width - padX * 2) / 7;
  const cellH = 148;
  const gridH = weekdayH + rows * cellH;
  const footerH = 112;
  const height = headerH + gridH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 초기화할 수 없습니다.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#8A8F98';
  ctx.font = `600 14px ${FONT_STACK}`;
  ctx.fillText('CLOSET NOTE · DAILY LOOK CALENDAR', padX, 44);

  ctx.fillStyle = '#111315';
  ctx.font = `700 34px ${FONT_STACK}`;
  ctx.fillText(`${year}년 ${month}월 데일리룩`, padX, 86);

  // Top right summary pill
  const pillText = `기록 ${lookCount}회`;
  ctx.font = `700 16px ${FONT_STACK}`;
  const pillW = ctx.measureText(pillText).width + 32;
  drawRoundedRect(ctx, width - padX - pillW, 54, pillW, 38, 12);
  ctx.fillStyle = '#F7F8FA';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#2563EB';
  ctx.fillText(pillText, width - padX - pillW + 16, 79);

  // Calendar outer container
  const gridX = padX;
  const gridY = headerH;
  const gridW = width - padX * 2;
  drawRoundedRect(ctx, gridX, gridY, gridW, gridH, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  drawRoundedRect(ctx, gridX, gridY, gridW, gridH, 20);
  ctx.clip();

  // Weekday header
  ctx.fillStyle = '#F7F8FA';
  ctx.fillRect(gridX, gridY, gridW, weekdayH);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  ctx.font = `700 15px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i === 0 ? '#F43F5E' : i === 6 ? '#2563EB' : '#5B616E';
    ctx.fillText(weekdays[i], gridX + i * cellW + cellW / 2, gridY + 26);
  }
  ctx.textAlign = 'left';

  // Grid lines & cells
  const imageCache = new Map<string, ResolvedCanvasAsset | null>();

  for (let idx = 0; idx < calendarCells.length; idx++) {
    const cell = calendarCells[idx];
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const cx = gridX + col * cellW;
    const cy = gridY + weekdayH + row * cellH;

    if (!cell.isCurrentMonth) {
      ctx.fillStyle = '#FAFAFB';
      ctx.fillRect(cx, cy, cellW, cellH);
    }

    // Cell borders
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, cellW, cellH);

    // Date number
    ctx.font = `700 14px ${FONT_STACK}`;
    ctx.fillStyle = !cell.isCurrentMonth
      ? '#CBD5E1'
      : col === 0
        ? '#E11D48'
        : col === 6
          ? '#2563EB'
          : '#111315';
    ctx.fillText(String(cell.dayNumber), cx + 10, cy + 23);

    const dayLooks = looksByDate[cell.isoDate] || [];
    const primaryLook = dayLooks[0];
    if (dayLooks.length > 1) {
      ctx.font = `700 12px ${FONT_STACK}`;
      ctx.fillStyle = '#2563EB';
      ctx.textAlign = 'right';
      ctx.fillText(`+${dayLooks.length - 1}`, cx + cellW - 10, cy + 22);
      ctx.textAlign = 'left';
    }

    if (primaryLook) {
      const lookItems = resolveLookItems(
        primaryLook.id,
        primaryLook.itemIds.map((id) => itemsById[id]).filter(Boolean)
      );
      await drawOutfitCollage(
        ctx,
        lookItems,
        cx + 8,
        cy + 30,
        cellW - 16,
        cellH - 38,
        12,
        imageCache,
        primaryLook.id
      );
    }
  }
  ctx.restore();

  // Footer summary bar
  const footerY = gridY + gridH + 22;
  drawRoundedRect(ctx, padX, footerY, gridW, 62, 16);
  ctx.fillStyle = '#F7F8FA';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#111315';
  ctx.font = `600 16px ${FONT_STACK}`;
  ctx.fillText(
    `${year}년 ${month}월 기록 ${lookCount}건 · 월 구매 지출 ${formatCurrencyKRW(monthlySpend)}`,
    padX + 20,
    footerY + 37
  );

  ctx.fillStyle = '#8A8F98';
  ctx.font = `600 14px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText('Closet Note', width - padX - 20, footerY + 37);
  ctx.textAlign = 'left';

  const fileMonth = String(month).padStart(2, '0');
  await downloadCanvasPng(canvas, `closet-note-${year}-${fileMonth}.png`);
}

/**
 * Exports a single Daily Look (1 day) as a crisp phone-sized portrait card (900x1180).
 */
export async function exportSingleDayLookImage(params: {
  look: DailyLook;
  itemsById: Record<string, WardrobeItem>;
}): Promise<void> {
  const { look, itemsById } = params;
  const linkedItems = resolveLookItems(
    look.id,
    look.itemIds.map((id) => itemsById[id]).filter(Boolean)
  );

  const width = 900;
  const padX = 44;
  const headerH = 148;
  const collageSize = width - padX * 2; // 812x760 lookbook showcase
  const collageH = 740;
  const itemsSectionH = 260;
  const height = headerH + collageH + itemsSectionH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 초기화할 수 없습니다.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#8A8F98';
  ctx.font = `600 15px ${FONT_STACK}`;
  ctx.fillText('CLOSET NOTE · DAILY LOOK', padX, 46);

  ctx.fillStyle = '#111315';
  ctx.font = `700 32px ${FONT_STACK}`;
  ctx.fillText(formatKoreanFullDate(look.date), padX, 88);

  const weatherText = `${getWeatherEmoji(look.weatherCondition)} ${getWeatherLabel(look.weatherCondition)} · ${look.tempHigh} / ${look.tempLow}°C`;
  ctx.fillStyle = '#5B616E';
  ctx.font = `600 18px ${FONT_STACK}`;
  ctx.fillText(
    look.title ? `${look.title}  |  ${weatherText}` : weatherText,
    padX,
    122
  );

  // Collage showcase
  const imageCache = new Map<string, ResolvedCanvasAsset | null>();
  await drawOutfitCollage(
    ctx,
    linkedItems,
    padX,
    headerH,
    collageSize,
    collageH,
    24,
    imageCache,
    look.id
  );

  // Bottom item list & memo
  const infoY = headerH + collageH + 28;
  ctx.fillStyle = '#111315';
  ctx.font = `700 18px ${FONT_STACK}`;
  ctx.fillText(`착용 아이템 (${linkedItems.length}개)`, padX, infoY + 12);

  const chipStartY = infoY + 32;
  const chipCols = 2;
  const chipGap = 12;
  const chipW = (collageSize - chipGap) / chipCols;
  const chipH = 44;

  linkedItems.slice(0, 6).forEach((item, idx) => {
    const col = idx % chipCols;
    const row = Math.floor(idx / chipCols);
    const x = padX + col * (chipW + chipGap);
    const y = chipStartY + row * (chipH + 10);

    drawRoundedRect(ctx, x, y, chipW, chipH, 12);
    ctx.fillStyle = '#F7F8FA';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Color dot
    ctx.beginPath();
    ctx.arc(x + 20, y + chipH / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = item.colorHex || '#18181B';
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#111315';
    ctx.font = `600 15px ${FONT_STACK}`;
    const label = truncateText(ctx, `${item.brand} · ${item.name}`, chipW - 46);
    ctx.fillText(label, x + 36, y + 28);
  });

  if (look.note) {
    const noteY = height - 28;
    ctx.fillStyle = '#5B616E';
    ctx.font = `500 15px ${FONT_STACK}`;
    ctx.fillText(truncateText(ctx, `메모: ${look.note}`, collageSize), padX, noteY);
  }

  await downloadCanvasPng(canvas, `closet-note-${look.date}.png`);
}

/**
 * Exports selected dates (1 or multiple) as a mobile-friendly PNG image (900px wide).
 * If 1 date (with 1 look) is selected, creates a single-day card; otherwise creates a 2-column lookbook sheet.
 */
export async function exportSelectedDatesLooksImage(params: {
  selectedDates: string[];
  looksByDate: Record<string, DailyLook[]>;
  itemsById: Record<string, WardrobeItem>;
}): Promise<void> {
  const { selectedDates, looksByDate, itemsById } = params;
  const sortedDates = [...selectedDates].sort((a, b) => a.localeCompare(b));
  const targetLooks: DailyLook[] = [];
  for (const date of sortedDates) {
    const dayLooks = looksByDate[date] || [];
    if (dayLooks[0]) {
      targetLooks.push(dayLooks[0]);
    }
  }

  if (targetLooks.length === 0) {
    throw new Error('선택한 날짜에 저장할 데일리룩 기록이 없습니다.');
  }

  if (targetLooks.length === 1) {
    await exportSingleDayLookImage({ look: targetLooks[0], itemsById });
    return;
  }

  const width = 900;
  const padX = 32;
  const headerH = 116;
  const gap = 20;
  const cols = 2;
  const cardW = (width - padX * 2 - gap) / cols; // 408px
  const cardH = 496;
  const rows = Math.ceil(targetLooks.length / cols);
  const footerH = 74;
  const height = headerH + rows * cardH + Math.max(0, rows - 1) * gap + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 초기화할 수 없습니다.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#8A8F98';
  ctx.font = `600 14px ${FONT_STACK}`;
  ctx.fillText('CLOSET NOTE · SELECTED DAILY LOOKS', padX, 42);

  ctx.fillStyle = '#111315';
  ctx.font = `700 30px ${FONT_STACK}`;
  ctx.fillText(`선택한 데일리룩 모음 (${targetLooks.length}일)`, padX, 84);

  const imageCache = new Map<string, ResolvedCanvasAsset | null>();

  for (let i = 0; i < targetLooks.length; i++) {
    const look = targetLooks[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cardW + gap);
    const y = headerH + row * (cardH + gap);

    drawRoundedRect(ctx, x, y, cardW, cardH, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Card header: date & weather
    ctx.fillStyle = '#111315';
    ctx.font = `700 18px ${FONT_STACK}`;
    ctx.fillText(formatKoreanFullDate(look.date), x + 18, y + 34);

    ctx.fillStyle = '#5B616E';
    ctx.font = `500 14px ${FONT_STACK}`;
    const weatherLine = `${getWeatherEmoji(look.weatherCondition)} ${getWeatherLabel(look.weatherCondition)} · ${look.tempHigh}/${look.tempLow}°C`;
    ctx.fillText(weatherLine, x + 18, y + 58);

    // Collage box
    const lookItems = resolveLookItems(
      look.id,
      look.itemIds.map((id) => itemsById[id]).filter(Boolean)
    );
    await drawOutfitCollage(
      ctx,
      lookItems,
      x + 16,
      y + 72,
      cardW - 32,
      344,
      14,
      imageCache,
      look.id
    );

    // Bottom title & item count
    ctx.fillStyle = '#111315';
    ctx.font = `700 16px ${FONT_STACK}`;
    const bottomTitle = look.title || `${lookItems[0]?.brand ?? '데일리'} 코디`;
    ctx.fillText(truncateText(ctx, bottomTitle, cardW - 36), x + 18, y + 446);

    ctx.fillStyle = '#5B616E';
    ctx.font = `500 13px ${FONT_STACK}`;
    const itemsSummary = lookItems.map((it) => it.name).join(' · ');
    ctx.fillText(
      truncateText(ctx, itemsSummary || `${lookItems.length}개 아이템`, cardW - 36),
      x + 18,
      y + 472
    );
  }

  // Footer
  ctx.fillStyle = '#8A8F98';
  ctx.font = `600 14px ${FONT_STACK}`;
  ctx.fillText(
    `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}`,
    padX,
    height - 28
  );
  ctx.textAlign = 'right';
  ctx.fillText('Closet Note', width - padX, height - 28);
  ctx.textAlign = 'left';

  const firstDate = sortedDates[0] || 'selected';
  await downloadCanvasPng(
    canvas,
    `closet-note-${firstDate}-looks-${targetLooks.length}.png`
  );
}
