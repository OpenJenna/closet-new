import { DailyLook, WardrobeItem } from '../types/wardrobe';

export interface WearRecencyIndex {
  lastWornByItemId: Record<string, string>;
  thisMonthWearByItemId: Record<string, number>;
  recentCutoffIso: string;
}

export function buildWearRecencyIndex(
  dailyLooks: DailyLook[],
  now: Date = new Date()
): WearRecencyIndex {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearMonth = `${y}-${m}`;

  const cutoff = new Date(y, now.getMonth(), now.getDate() - 7);
  const cy = cutoff.getFullYear();
  const cm = String(cutoff.getMonth() + 1).padStart(2, '0');
  const cd = String(cutoff.getDate()).padStart(2, '0');
  const recentCutoffIso = `${cy}-${cm}-${cd}`;

  const lastWornByItemId: Record<string, string> = {};
  const thisMonthWearByItemId: Record<string, number> = {};

  for (const look of dailyLooks) {
    const date = look.date || '';
    if (!date) continue;
    const isCurrentMonth = date.startsWith(currentYearMonth);
    for (const itemId of look.itemIds) {
      if (!lastWornByItemId[itemId] || date > lastWornByItemId[itemId]) {
        lastWornByItemId[itemId] = date;
      }
      if (isCurrentMonth) {
        thisMonthWearByItemId[itemId] =
          (thisMonthWearByItemId[itemId] || 0) + 1;
      }
    }
  }

  return {
    lastWornByItemId,
    thisMonthWearByItemId,
    recentCutoffIso,
  };
}

/**
 * Default wardrobe sort applied consistently across 전체, 상의, 바지, 아우터, 신발, etc.:
 * 1) 최근에 입은 옷 (최근 7일 이내 착용, 또는 현재 목록 내 가장 최근 착용일)
 * 2) 이번달 입은 옷 (당월 데일리룩 착용)
 * 3) 최근에 구매한 옷 (구매일 최신순 -> 최근 착용일순 -> 등록일순)
 */
export function sortItemsByDefaultOrder(
  items: WardrobeItem[],
  recency: WearRecencyIndex
): WardrobeItem[] {
  let latestWornInList = '';
  for (const item of items) {
    const last = recency.lastWornByItemId[item.id] || '';
    if (last > latestWornInList) {
      latestWornInList = last;
    }
  }

  const getTier = (lastWorn: string, monthCount: number): number => {
    if (
      lastWorn &&
      (lastWorn >= recency.recentCutoffIso ||
        (latestWornInList !== '' && lastWorn === latestWornInList))
    ) {
      return 0;
    }
    if (monthCount > 0) {
      return 1;
    }
    return 2;
  };

  return [...items].sort((a, b) => {
    const lastA = recency.lastWornByItemId[a.id] || '';
    const lastB = recency.lastWornByItemId[b.id] || '';
    const monthCountA = recency.thisMonthWearByItemId[a.id] || 0;
    const monthCountB = recency.thisMonthWearByItemId[b.id] || 0;

    const tierA = getTier(lastA, monthCountA);
    const tierB = getTier(lastB, monthCountB);
    if (tierA !== tierB) return tierA - tierB;

    const purchaseA = a.purchaseDate || '';
    const purchaseB = b.purchaseDate || '';
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';

    if (tierA === 0 || tierA === 1) {
      return (
        lastB.localeCompare(lastA) ||
        monthCountB - monthCountA ||
        purchaseB.localeCompare(purchaseA) ||
        createdB.localeCompare(createdA)
      );
    }

    return (
      purchaseB.localeCompare(purchaseA) ||
      lastB.localeCompare(lastA) ||
      createdB.localeCompare(createdA)
    );
  });
}
