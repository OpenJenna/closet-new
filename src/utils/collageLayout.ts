import { WardrobeItem } from '../types/wardrobe';

export interface CollageSlotBox {
  left: number; // 0..1 normalized
  top: number; // 0..1 normalized
  width: number; // 0..1 normalized
  height: number; // 0..1 normalized
  zIndex: number;
}

export interface ComputedCollageSlot {
  item: WardrobeItem;
  box: CollageSlotBox;
}

export interface CollageItemOffset {
  dx: number; // normalized horizontal shift (-0.45..0.45)
  dy: number; // normalized vertical shift (-0.45..0.45)
}

export type CollageOffsetsMap = Record<string, CollageItemOffset>;

export const COLLAGE_OFFSETS_CHANGED_EVENT = 'closet-note-collage-offsets-changed';

export const UPPER_CATEGORIES = new Set<string>([
  '상의',
  '원피스',
  '스포츠웨어',
  '아우터',
]);

const CUSTOM_ARRANGED_KEY = 'closet_note_custom_arranged_looks_v1';

function readCustomArrangedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(CUSTOM_ARRANGED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeCustomArrangedSet(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CUSTOM_ARRANGED_KEY,
      JSON.stringify(Array.from(set).slice(-200))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function isLookCustomArranged(lookId?: string): boolean {
  if (!lookId) return false;
  return readCustomArrangedSet().has(lookId);
}

export function markLookCustomArranged(lookId?: string) {
  if (!lookId) return;
  const set = readCustomArrangedSet();
  set.add(lookId);
  writeCustomArrangedSet(set);
}

export function clearLookCustomArranged(lookId?: string) {
  if (!lookId) return;
  const set = readCustomArrangedSet();
  if (set.delete(lookId)) {
    writeCustomArrangedSet(set);
  }
}

const CUSTOM_OFFSETS_KEY = 'closet_note_custom_offsets_v1';

function readAllCustomOffsets(): Record<string, CollageOffsetsMap> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_OFFSETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllCustomOffsets(all: Record<string, CollageOffsetsMap>) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(all).slice(-200);
    window.localStorage.setItem(
      CUSTOM_OFFSETS_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
    window.dispatchEvent(new CustomEvent(COLLAGE_OFFSETS_CHANGED_EVENT));
  } catch {
    // Ignore storage quota errors
  }
}

function clampOffsetValue(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-0.45, Math.min(0.45, Math.round(v * 1000) / 1000));
}

export function getLookCustomOffsets(lookId?: string): CollageOffsetsMap {
  if (!lookId) return {};
  const all = readAllCustomOffsets();
  const map = all[lookId];
  if (!map || typeof map !== 'object') return {};
  const clean: CollageOffsetsMap = {};
  for (const [itemId, val] of Object.entries(map)) {
    if (
      val &&
      typeof val.dx === 'number' &&
      typeof val.dy === 'number' &&
      (Math.abs(val.dx) > 0.001 || Math.abs(val.dy) > 0.001)
    ) {
      clean[itemId] = {
        dx: clampOffsetValue(val.dx),
        dy: clampOffsetValue(val.dy),
      };
    }
  }
  return clean;
}

export function setLookCustomOffsets(
  lookId: string,
  offsets: CollageOffsetsMap
) {
  if (!lookId) return;
  const all = readAllCustomOffsets();
  const clean: CollageOffsetsMap = {};
  for (const [itemId, val] of Object.entries(offsets)) {
    const dx = clampOffsetValue(val.dx);
    const dy = clampOffsetValue(val.dy);
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      clean[itemId] = { dx, dy };
    }
  }
  if (Object.keys(clean).length === 0) {
    delete all[lookId];
  } else {
    all[lookId] = clean;
  }
  writeAllCustomOffsets(all);
}

export function setLookItemOffset(
  lookId: string,
  itemId: string,
  offset: CollageItemOffset
): CollageOffsetsMap {
  const current = getLookCustomOffsets(lookId);
  const next: CollageOffsetsMap = {
    ...current,
    [itemId]: {
      dx: clampOffsetValue(offset.dx),
      dy: clampOffsetValue(offset.dy),
    },
  };
  setLookCustomOffsets(lookId, next);
  return getLookCustomOffsets(lookId);
}

export function clearLookItemOffsets(
  lookId: string,
  itemIds: string[]
): CollageOffsetsMap {
  const current = getLookCustomOffsets(lookId);
  let changed = false;
  for (const id of itemIds) {
    if (id in current) {
      delete current[id];
      changed = true;
    }
  }
  if (changed) {
    setLookCustomOffsets(lookId, current);
  }
  return current;
}

export function clearLookCustomOffsets(lookId?: string) {
  if (!lookId) return;
  const all = readAllCustomOffsets();
  if (lookId in all) {
    delete all[lookId];
    writeAllCustomOffsets(all);
  }
}

export function hasLookCustomOffsets(lookId?: string): boolean {
  if (!lookId) return false;
  return Object.keys(getLookCustomOffsets(lookId)).length > 0;
}

function isCardiganLike(item: WardrobeItem): boolean {
  if (item.category !== '아우터') return false;
  const sub = item.subCategory || '';
  const name = item.name || '';
  return (
    sub.includes('가디건') ||
    name.includes('가디건') ||
    name.includes('조끼') ||
    name.includes('베스트')
  );
}

function isBottomGarment(item: WardrobeItem): boolean {
  return item.category === '바지' || item.category === '치마';
}

export function isScarfLike(item: WardrobeItem): boolean {
  if (item.category !== '액세서리') return false;
  const sub = (item.subCategory || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  return (
    sub.includes('스카프') ||
    sub.includes('목도리') ||
    name.includes('스카프') ||
    name.includes('목도리') ||
    name.includes('머플러') ||
    name.includes('숄') ||
    name.includes('scarf') ||
    name.includes('muffler')
  );
}

/**
 * Lookbook ordering priority:
 * Upper left-to-right: 상의 -> 스포츠웨어 -> 원피스 -> 가디건 -> 자켓/코트/패딩
 * Lower: 바지/치마 -> 목도리/스카프 -> 가방 -> 신발 -> 기타 액세서리
 */
export function getLookbookSortRank(item: WardrobeItem): number {
  if (item.category === '상의') return 10;
  if (item.category === '스포츠웨어') return 15;
  if (item.category === '원피스') return 20;
  if (isCardiganLike(item)) return 30;
  if (item.category === '아우터') return 40;
  if (isBottomGarment(item)) return 50;
  if (isScarfLike(item)) return 58;
  if (item.category === '가방') return 60;
  if (item.category === '신발') return 70;
  if (item.category === '액세서리') return 80;
  return 90;
}

export function sortItemsForLookbook(items: WardrobeItem[]): WardrobeItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = getLookbookSortRank(a.item) - getLookbookSortRank(b.item);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function sortItemIdsForLookbook(
  itemIds: string[],
  itemsById: Record<string, WardrobeItem>
): string[] {
  return itemIds
    .map((id, index) => ({ id, item: itemsById[id], index }))
    .sort((a, b) => {
      const rankA = a.item ? getLookbookSortRank(a.item) : 99;
      const rankB = b.item ? getLookbookSortRank(b.item) : 99;
      return rankA !== rankB ? rankA - rankB : a.index - b.index;
    })
    .map((entry) => entry.id);
}

export function resolveLookItems(
  lookId: string | undefined,
  rawItems: WardrobeItem[]
): WardrobeItem[] {
  const valid = rawItems.filter(Boolean);
  if (lookId && isLookCustomArranged(lookId)) {
    return valid;
  }
  return sortItemsForLookbook(valid);
}

function getClampedAspect(
  item: WardrobeItem,
  aspectRatiosById?: Record<string, number>
): number {
  const raw = aspectRatiosById?.[item.id];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.min(1.45, Math.max(0.62, raw));
  }
  return 0.92;
}

function getClampedBottomAspect(
  item: WardrobeItem,
  aspectRatiosById?: Record<string, number>
): number {
  const raw = aspectRatiosById?.[item.id];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.min(0.95, Math.max(0.35, raw));
  }
  return item.category === '치마' ? 0.68 : 0.52;
}

/**
 * Arranges 1-4+ garments in a horizontal row centered around targetCenterX
 * so every garment shares a consistent visual vertical scale regardless of sleeve width.
 */
function buildOverlappingHorizontalRow(
  items: WardrobeItem[],
  topY: number,
  rowHeight: number,
  baseZ: number,
  aspectRatiosById?: Record<string, number>,
  targetCenterX = 0.5
): ComputedCollageSlot[] {
  const count = items.length;
  if (count === 0) return [];

  if (count === 1) {
    const aspect = getClampedAspect(items[0], aspectRatiosById);
    const visualW = Math.min(0.68, Math.max(0.42, rowHeight * aspect * 1.08));
    const maxHalf = Math.min(targetCenterX - 0.02, 0.98 - targetCenterX);
    const width = Math.max(0.32, Math.min(visualW, maxHalf * 2));
    const clampedCenter = Math.max(
      0.02 + width / 2,
      Math.min(0.98 - width / 2, targetCenterX)
    );
    return [
      {
        item: items[0],
        box: {
          left: clampedCenter - width / 2,
          top: topY,
          width,
          height: rowHeight,
          zIndex: baseZ,
        },
      },
    ];
  }

  if (count > 4) {
    const firstRowCount = Math.ceil(count / 2);
    const gapY = 0.02;
    const subH = (rowHeight - gapY) / 2;
    return [
      ...buildOverlappingHorizontalRow(
        items.slice(0, firstRowCount),
        topY,
        subH,
        baseZ,
        aspectRatiosById,
        targetCenterX
      ),
      ...buildOverlappingHorizontalRow(
        items.slice(firstRowCount),
        topY + subH + gapY,
        subH,
        baseZ + firstRowCount,
        aspectRatiosById,
        targetCenterX
      ),
    ];
  }

  const aspects = items.map((it) => getClampedAspect(it, aspectRatiosById));
  // Desired uniform garment height
  let uniformH = rowHeight * (count === 2 ? 0.98 : 0.96);
  let widths = aspects.map((a) => uniformH * a);

  if (count === 2) {
    // Natural editorial duo: keep both items close together with gentle overlap and axis-aligned composition
    let overlap = Math.min(widths[0], widths[1]) * 0.14;
    let groupW = widths[0] + widths[1] - overlap;
    const maxGroupW = 0.92;
    if (groupW > maxGroupW) {
      const scale = maxGroupW / groupW;
      uniformH *= scale;
      widths = widths.map((w) => w * scale);
      overlap *= scale;
      groupW = widths[0] + widths[1] - overlap;
    }
    const marginX = 0.02;
    const clampedCenter = Math.max(
      marginX + groupW / 2,
      Math.min(1 - marginX - groupW / 2, targetCenterX)
    );
    const startX = clampedCenter - groupW / 2;
    return [
      {
        item: items[0],
        box: {
          left: startX,
          top: topY + 0.012,
          width: widths[0],
          height: uniformH,
          zIndex: baseZ,
        },
      },
      {
        item: items[1],
        box: {
          left: startX + widths[0] - overlap,
          top: topY,
          width: widths[1],
          height: uniformH,
          zIndex: baseZ + 1,
        },
      },
    ];
  }

  const marginX = 0.015;
  const maxSpan = 1 - marginX * 2;
  let sumW = widths.reduce((acc, w) => acc + w, 0);

  // Cap max overlap per adjacent pair so wider jackets don't bury center items,
  // scaling ALL items down uniformly together when needed to preserve equal torso scale.
  const maxAllowedSum = count === 3 ? maxSpan / 0.72 : maxSpan / 0.62;
  if (sumW > maxAllowedSum) {
    const scale = maxAllowedSum / sumW;
    uniformH *= scale;
    widths = widths.map((w) => w * scale);
    sumW = widths.reduce((acc, w) => acc + w, 0);
  }

  // Keep 3+ garments naturally clustered with a gentle minimum overlap instead of pulling apart
  let naturalGroupW = widths[0];
  for (let i = 1; i < count; i++) {
    const pairOverlap = Math.min(widths[i - 1], widths[i]) * 0.12;
    naturalGroupW += widths[i] - pairOverlap;
  }

  const targetGroupW = Math.min(maxSpan, naturalGroupW);
  const clampedCenter = Math.max(
    marginX + targetGroupW / 2,
    Math.min(1 - marginX - targetGroupW / 2, targetCenterX)
  );
  const groupLeft = clampedCenter - targetGroupW / 2;
  const firstCenter = groupLeft + widths[0] / 2;
  const lastCenter = groupLeft + targetGroupW - widths[count - 1] / 2;
  const spanCenters = Math.max(0.05, lastCenter - firstCenter);

  // Compute proportional centers weighted by adjacent item widths
  const halfSteps: number[] = [0];
  let accum = 0;
  for (let i = 0; i < count - 1; i++) {
    accum += (widths[i] + widths[i + 1]) / 2;
    halfSteps.push(accum);
  }
  const totalStep = accum || 1;

  // Center item sits slightly forward (hero layering for 3+ items)
  const zOrderForIndex = (idx: number) => {
    if (count === 3) {
      return idx === 1 ? baseZ + 2 : idx === 2 ? baseZ + 1 : baseZ;
    }
    if (count === 4) {
      return idx === 1 || idx === 2 ? baseZ + 2 : baseZ + (idx === 3 ? 1 : 0);
    }
    return baseZ + idx;
  };

  return items.map((item, idx) => {
    const w = widths[idx];
    const center = firstCenter + (halfSteps[idx] / totalStep) * spanCenters;
    const clampedLeft = Math.max(0, Math.min(1 - w, center - w / 2));
    // Gentle vertical stagger anchored around topY so shoulders align naturally
    const topOffset =
      count === 3
        ? idx === 0
          ? 0.015
          : idx === 1
            ? 0.004
            : 0
        : idx % 2 === 0
          ? 0.012
          : 0;

    return {
      item,
      box: {
        left: clampedLeft,
        top: topY + topOffset,
        width: w,
        height: uniformH,
        zIndex: zOrderForIndex(idx),
      },
    };
  });
}

function buildLookbookLowerSlots(
  lower: WardrobeItem[],
  topStart: number,
  availHeight: number,
  baseZ: number,
  aspectRatiosById?: Record<string, number>,
  bodyAxisX = 0.5
): ComputedCollageSlot[] {
  if (lower.length === 0) return [];

  const bottoms = lower.filter(isBottomGarment);
  const extras = lower.filter((i) => !isBottomGarment(i));

  // Editorial lookbook: align bottom garment strictly on bodyAxisX (matching upper center),
  // and place shoes / bags / accessories cleanly in the right zone.
  if (bottoms.length === 1 && extras.length > 0) {
    const bottomItem = bottoms[0];
    const bottomAspect = getClampedBottomAspect(bottomItem, aspectRatiosById);
    const bottomVisualW = Math.min(0.54, Math.max(0.26, availHeight * bottomAspect));
    const maxHalf = Math.min(bodyAxisX - 0.02, 0.98 - bodyAxisX);
    const bottomSlotW = Math.max(
      0.28,
      Math.min(Math.max(bottomVisualW, 0.44), maxHalf * 2)
    );
    const bottomLeft = bodyAxisX - bottomSlotW / 2;
    const bottomInkRight = bodyAxisX + Math.min(bottomSlotW, bottomVisualW) / 2;

    const slots: ComputedCollageSlot[] = [
      {
        item: bottomItem,
        box: {
          left: bottomLeft,
          top: topStart,
          width: bottomSlotW,
          height: availHeight,
          zIndex: baseZ,
        },
      },
    ];

    if (extras.length === 1) {
      const extraItem = extras[0];
      const extraLeft = Math.min(0.67, Math.max(0.56, bottomInkRight + 0.012));
      const isShoes = extraItem.category === '신발';
      const isBag = extraItem.category === '가방';
      const isScarf = isScarfLike(extraItem);
      const extraW = Math.min(
        isBag ? 0.34 : isScarf ? 0.32 : 0.36,
        Math.max(0.28, 0.97 - extraLeft)
      );
      slots.push({
        item: extraItem,
        box: {
          left: Math.min(extraLeft, 0.97 - extraW),
          top:
            topStart +
            availHeight * (isShoes ? 0.4 : isBag ? 0.24 : isScarf ? 0.14 : 0.18),
          width: extraW,
          height: availHeight * (isScarf ? 0.5 : 0.56),
          zIndex: baseZ + 1,
        },
      });
      return slots;
    }

    if (extras.length === 2) {
      const firstIsBagOrScarf =
        extras[0].category === '가방' || isScarfLike(extras[0]);
      const secondIsShoes = extras[1].category === '신발';
      const baseExtraLeft = Math.min(0.64, Math.max(0.55, bottomInkRight + 0.01));
      const areaRight = 0.97;
      const availW = Math.max(0.3, areaRight - baseExtraLeft);

      if (firstIsBagOrScarf && secondIsShoes) {
        // Editorial flatlay cluster: bag/scarf sits higher & behind, shoes sit lower-front overlapping the bottom edge
        const topW = Math.min(0.34, Math.max(0.26, availW * 0.88));
        const shoeW = Math.min(0.34, Math.max(0.26, availW * 0.86));
        const topLeft = Math.min(baseExtraLeft, areaRight - topW);
        const shoeLeft = Math.min(topLeft + 0.04, areaRight - shoeW);
        slots.push({
          item: extras[0], // 가방 또는 목도리/스카프
          box: {
            left: topLeft,
            top:
              topStart +
              availHeight * (isScarfLike(extras[0]) ? 0.12 : 0.16),
            width: topW,
            height: availHeight * (isScarfLike(extras[0]) ? 0.5 : 0.54),
            zIndex: baseZ + 1,
          },
        });
        slots.push({
          item: extras[1], // 신발
          box: {
            left: shoeLeft,
            top: topStart + availHeight * 0.5,
            width: shoeW,
            height: availHeight * 0.46,
            zIndex: baseZ + 2,
          },
        });
        return slots;
      }

      if (isScarfLike(extras[0]) && extras[1].category === '가방') {
        // Scarf & bag together without shoes: keep both in the upper/mid bag zone
        const scarfW = Math.min(0.32, Math.max(0.25, availW * 0.86));
        const bagW = Math.min(0.34, Math.max(0.26, availW * 0.88));
        const scarfLeft = Math.min(baseExtraLeft, areaRight - scarfW);
        const bagLeft = Math.min(scarfLeft + 0.03, areaRight - bagW);
        slots.push({
          item: extras[0], // 목도리/스카프
          box: {
            left: scarfLeft,
            top: topStart + availHeight * 0.06,
            width: scarfW,
            height: availHeight * 0.44,
            zIndex: baseZ + 2,
          },
        });
        slots.push({
          item: extras[1], // 가방
          box: {
            left: bagLeft,
            top: topStart + availHeight * 0.32,
            width: bagW,
            height: availHeight * 0.52,
            zIndex: baseZ + 1,
          },
        });
        return slots;
      }

      const extraW = Math.min(0.36, Math.max(0.28, availW));
      const clampedLeft = Math.min(baseExtraLeft, areaRight - extraW);
      slots.push({
        item: extras[0],
        box: {
          left: clampedLeft,
          top: topStart + availHeight * 0.1,
          width: extraW,
          height: availHeight * 0.5,
          zIndex: baseZ + 1,
        },
      });
      slots.push({
        item: extras[1],
        box: {
          left: Math.min(clampedLeft + 0.025, areaRight - extraW),
          top: topStart + availHeight * 0.48,
          width: extraW,
          height: availHeight * 0.48,
          zIndex: baseZ + 2,
        },
      });
      return slots;
    }

    const rightAreaLeft = Math.min(0.58, Math.max(0.5, bottomInkRight + 0.01));
    const rightAreaWidth = Math.max(0.38, 0.98 - rightAreaLeft);
    const shoeExtras = extras.filter((e) => e.category === '신발');
    const nonShoeExtras = extras.filter((e) => e.category !== '신발');

    // Keep scarves/bags/accessories in the upper bag zone and shoes cleanly below on the shoe line
    if (shoeExtras.length > 0 && nonShoeExtras.length > 0) {
      const upperCols = nonShoeExtras.length;
      const upperCellW = rightAreaWidth / upperCols;
      nonShoeExtras.forEach((extra, idx) => {
        const w = Math.min(0.32, Math.max(upperCellW * 1.06, 0.2));
        const left = Math.min(0.98 - w, rightAreaLeft + idx * upperCellW);
        slots.push({
          item: extra,
          box: {
            left,
            top: topStart + availHeight * (isScarfLike(extra) ? 0.06 : 0.12),
            width: w,
            height: availHeight * (isScarfLike(extra) ? 0.46 : 0.5),
            zIndex: baseZ + 1 + idx,
          },
        });
      });

      const shoeCols = shoeExtras.length;
      const shoeCellW = rightAreaWidth / shoeCols;
      shoeExtras.forEach((shoe, idx) => {
        const w = Math.min(0.34, Math.max(shoeCellW * 0.92, 0.24));
        const left = Math.min(
          0.97 - w,
          rightAreaLeft + idx * shoeCellW + (shoeCols === 1 ? 0.05 : 0)
        );
        slots.push({
          item: shoe,
          box: {
            left,
            top: topStart + availHeight * 0.52,
            width: w,
            height: availHeight * 0.44,
            zIndex: baseZ + 1 + nonShoeExtras.length + idx,
          },
        });
      });
      return slots;
    }

    const cols = 2;
    const rows = Math.ceil(extras.length / cols);
    const cellW = rightAreaWidth / cols;
    const cellH = availHeight / rows;
    extras.forEach((extra, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const isShoes = extra.category === '신발';
      slots.push({
        item: extra,
        box: {
          left: rightAreaLeft + c * cellW,
          top: topStart + r * cellH + (isShoes ? cellH * 0.06 : 0),
          width: cellW * 1.06,
          height: cellH * (isShoes ? 0.96 : 1.02),
          zIndex: baseZ + 1 + idx,
        },
      });
    });
    return slots;
  }

  return buildOverlappingHorizontalRow(
    lower,
    topStart,
    availHeight,
    baseZ,
    aspectRatiosById,
    bodyAxisX
  );
}

/**
 * Computes bold, naturally-layered editorial lookbook positions for wardrobe items.
 * Balances upper-to-lower vertical proportion (~4:6) when paired with pants/skirts,
 * aligns upper center and lower garment on the same vertical axis,
 * and equalizes visual torso scale across multiple upper garments.
 */
export function computeCollageSlots(
  rawItems: WardrobeItem[],
  aspectRatiosById?: Record<string, number>,
  customOffsets?: CollageOffsetsMap
): ComputedCollageSlot[] {
  const items = rawItems.filter(Boolean).slice(0, 12);
  const count = items.length;
  if (count === 0) return [];

  let slots: ComputedCollageSlot[];

  if (count === 1) {
    slots = [
      {
        item: items[0],
        box: { left: 0.1, top: 0.06, width: 0.8, height: 0.88, zIndex: 2 },
      },
    ];
  } else {
    const upper = items.filter((i) => UPPER_CATEGORIES.has(i.category));
    const lower = items.filter((i) => !UPPER_CATEGORIES.has(i.category));
    const bottoms = lower.filter(isBottomGarment);
    const extras = lower.filter((i) => !isBottomGarment(i));
    const hasBottoms = bottoms.length > 0;

    if (upper.length === 0) {
      slots = buildOverlappingHorizontalRow(
        lower,
        0.12,
        0.76,
        2,
        aspectRatiosById
      );
    } else if (lower.length === 0) {
      slots = buildOverlappingHorizontalRow(
        upper,
        0.12,
        0.76,
        2,
        aspectRatiosById
      );
    } else if (count === 2) {
      if (hasBottoms) {
        // Natural 4:6 upper-to-lower body silhouette ratio on the exact center axis (0.50)
        slots = [
          {
            item: upper[0],
            box: { left: 0.19, top: 0.02, width: 0.62, height: 0.39, zIndex: 2 },
          },
          {
            item: lower[0],
            box: { left: 0.14, top: 0.38, width: 0.72, height: 0.6, zIndex: 5 },
          },
        ];
      } else if (isScarfLike(lower[0])) {
        // Top/outer paired only with scarf/muffler: keep scarf cleanly on the upper line beside the garment
        slots = [
          {
            item: upper[0],
            box: { left: 0.08, top: 0.12, width: 0.56, height: 0.74, zIndex: 2 },
          },
          {
            item: lower[0],
            box: { left: 0.62, top: 0.16, width: 0.3, height: 0.58, zIndex: 4 },
          },
        ];
      } else {
        // Top/dress paired only with shoes/bag/accessory
        slots = [
          {
            item: upper[0],
            box: { left: 0.15, top: 0.02, width: 0.7, height: 0.56, zIndex: 2 },
          },
          {
            item: lower[0],
            box: { left: 0.24, top: 0.57, width: 0.52, height: 0.4, zIndex: 5 },
          },
        ];
      }
    } else {
      const scarves = extras.filter(isScarfLike);
      const nonScarfExtras = extras.filter((i) => !isScarfLike(i));
      const canTryUpperScarf = scarves.length > 0 && upper.length <= 2;

      // 4:6 proportion when pants/skirt are present; 5.6:4.2 when lower contains only accessories/shoes
      const upperTop = 0.02;
      const upperHeight = hasBottoms ? 0.39 : 0.55;
      const lowerTop = hasBottoms ? 0.385 : 0.55;
      const lowerHeight = hasBottoms ? 0.6 : 0.43;

      // Determine shared vertical body axis so upper center & bottom garment align strictly vertically
      let desiredAxisX = 0.5;
      if (bottoms.length === 1 && nonScarfExtras.length > 0) {
        if (upper.length === 1) {
          desiredAxisX =
            nonScarfExtras.length === 1
              ? 0.38
              : nonScarfExtras.length === 2
                ? 0.35
                : 0.3;
        } else if (upper.length === 2) {
          desiredAxisX = nonScarfExtras.length === 1 ? 0.44 : 0.41;
        } else {
          desiredAxisX = 0.47;
        }
      } else if (bottoms.length === 1 && canTryUpperScarf) {
        desiredAxisX = upper.length === 1 ? 0.4 : 0.43;
      } else if (bottoms.length === 1 && extras.length > 0) {
        desiredAxisX = upper.length <= 2 ? 0.41 : 0.47;
      } else if (!hasBottoms && canTryUpperScarf && upper.length === 1) {
        desiredAxisX = 0.39;
      }

      const upperSlots = buildOverlappingHorizontalRow(
        upper,
        upperTop,
        upperHeight,
        2,
        aspectRatiosById,
        desiredAxisX
      );

      // Measure actual placed center X and right edge of the upper row
      let actualAxisX = 0.5;
      let upperMaxRight = 0.5;
      if (upperSlots.length > 0) {
        const minLeft = Math.min(...upperSlots.map((s) => s.box.left));
        upperMaxRight = Math.max(
          ...upperSlots.map((s) => s.box.left + s.box.width)
        );
        actualAxisX = (minLeft + upperMaxRight) / 2;
      }

      // Place scarf/muffler on the upper line when there is breathing room beside the upper garments;
      // otherwise fall back to the bag-height zone (above the shoe line) in lower slots.
      const upperScarfSlots: ComputedCollageSlot[] = [];
      let remainingLower = lower;
      const rightUpperRoom = 0.98 - upperMaxRight;

      if (canTryUpperScarf && rightUpperRoom >= 0.21) {
        const primaryScarf = scarves[0];
        const scarfW = Math.min(0.28, Math.max(0.21, rightUpperRoom + 0.02));
        const preferredLeft =
          upperMaxRight + (rightUpperRoom >= 0.3 ? 0.025 : -0.015);
        const scarfLeft = Math.max(
          0.54,
          Math.min(0.98 - scarfW, preferredLeft)
        );
        upperScarfSlots.push({
          item: primaryScarf,
          box: {
            left: scarfLeft,
            top: upperTop + upperHeight * 0.1,
            width: scarfW,
            height: upperHeight * 0.78,
            zIndex: 2 + upper.length + 1,
          },
        });
        remainingLower = lower.filter((item) => item.id !== primaryScarf.id);
      }

      const lowerSlots = buildLookbookLowerSlots(
        remainingLower,
        lowerTop,
        lowerHeight,
        2 + upper.length + upperScarfSlots.length + 2,
        aspectRatiosById,
        actualAxisX
      );
      slots = [...upperSlots, ...upperScarfSlots, ...lowerSlots];
    }
  }

  // Apply user fine-tuned drag offsets (clamped so garments stay visible inside the collage)
  const adjusted =
    customOffsets && Object.keys(customOffsets).length > 0
      ? slots.map((slot) => {
          const offset = customOffsets[slot.item.id];
          if (!offset) return slot;
          const minLeft = -slot.box.width * 0.25;
          const maxLeft = 1 - slot.box.width * 0.75;
          const minTop = -slot.box.height * 0.2;
          const maxTop = 1 - slot.box.height * 0.8;
          return {
            ...slot,
            box: {
              ...slot.box,
              left: Math.max(minLeft, Math.min(maxLeft, slot.box.left + offset.dx)),
              top: Math.max(minTop, Math.min(maxTop, slot.box.top + offset.dy)),
            },
          };
        })
      : slots;

  // Ensure Canvas draw order matches CSS zIndex order
  return [...adjusted].sort((a, b) => a.box.zIndex - b.box.zIndex);
}
