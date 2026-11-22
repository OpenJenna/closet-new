import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Images,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORY_TREE,
  COLOR_SWATCHES,
  Category,
  DailyLook,
  SEASONS,
  Season,
  SortOption,
  TOP_CATEGORIES,
  WardrobeItem,
} from '../types/wardrobe';
import { formatShortDotDate } from '../utils/formatters';
import {
  buildWearRecencyIndex,
  sortItemsByDefaultOrder,
} from '../utils/wardrobeSort';
import { BulkEditItemsModal, BulkItemPatch } from './BulkEditItemsModal';
import { GarmentVisual } from './GarmentGraphic';

interface WardrobeViewProps {
  items: WardrobeItem[];
  dailyLooks?: DailyLook[];
  wearCountByItemId: Record<string, number>;
  existingBrands?: string[];
  existingMaterials?: string[];
  existingSizes?: string[];
  onSelectItem: (itemId: string) => void;
  onOpenAddItem: (presetCategory?: Category, presetSubCategory?: string) => void;
  onOpenBatchAdd?: (presetCategory?: Category, presetSubCategory?: string) => void;
  onUpdateItemsBatch?: (ids: string[], patch: BulkItemPatch) => Promise<void>;
  onDeleteItemsBatch?: (ids: string[]) => Promise<void>;
}

const SORT_LABELS: Record<SortOption, string> = {
  recommended: '최근 착용·구매순',
  newest: '구매일순',
  mostWorn: '착용 많은순',
  leastWorn: '착용 적은순',
  priceDesc: '구매가 높은순',
  priceAsc: '구매가 낮은순',
};

type SeasonFilterValue = '전체' | '봄/가을' | Season;

const SEASON_TOGGLE_OPTIONS: { value: SeasonFilterValue; label: string }[] = [
  { value: '전체', label: '전체' },
  { value: '봄/가을', label: '봄/가을' },
  { value: '여름', label: '여름' },
  { value: '겨울', label: '겨울' },
];

function matchesSeasonFilter(
  seasons: Season[],
  filter: SeasonFilterValue
): boolean {
  if (filter === '전체') return true;
  if (filter === '봄/가을') {
    return seasons.includes('봄') || seasons.includes('가을');
  }
  return seasons.includes(filter);
}

const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
type MonthFilterValue = '전체' | (typeof MONTH_NUMBERS)[number];

export function WardrobeView({
  items,
  dailyLooks = [],
  wearCountByItemId,
  existingBrands = [],
  existingMaterials = [],
  existingSizes = [],
  onSelectItem,
  onOpenAddItem,
  onOpenBatchAdd,
  onUpdateItemsBatch,
  onDeleteItemsBatch,
}: WardrobeViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'전체' | Category>('전체');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('전체');
  const [sortOption, setSortOption] = useState<SortOption>('recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const currentMonth = useMemo(
    () => (new Date().getMonth() + 1) as (typeof MONTH_NUMBERS)[number],
    []
  );
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilterValue>('전체');
  const [monthFilter, setMonthFilter] = useState<MonthFilterValue>('전체');
  const [displayMonth, setDisplayMonth] =
    useState<(typeof MONTH_NUMBERS)[number]>(currentMonth);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const [colorFilter, setColorFilter] = useState<string>('전체');
  const [brandFilter, setBrandFilter] = useState<string>('전체');

  useEffect(() => {
    if (!monthPopoverOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        monthPickerRef.current &&
        !monthPickerRef.current.contains(e.target as Node)
      ) {
        setMonthPopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonthPopoverOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [monthPopoverOpen]);

  // Multi-select bulk action states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const availableSubCategories = useMemo(() => {
    if (selectedCategory === '전체') return [];
    return CATEGORY_TREE[selectedCategory] || [];
  }, [selectedCategory]);

  const uniqueBrands = useMemo(() => {
    const set = new Set(items.map((i) => i.brand).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  // Map calendar month (1..12) -> { itemId -> wear count in that month from daily looks }
  const wornByMonthMap = useMemo(() => {
    const existingIds = new Set(items.map((i) => i.id));
    const map: Record<number, Record<string, number>> = {};
    for (const m of MONTH_NUMBERS) {
      map[m] = {};
    }
    for (const look of dailyLooks) {
      const monthStr = look.date?.slice(5, 7);
      const monthNum = Number(monthStr);
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        continue;
      }
      const bucket = map[monthNum];
      for (const itemId of look.itemIds) {
        if (existingIds.has(itemId)) {
          bucket[itemId] = (bucket[itemId] || 0) + 1;
        }
      }
    }
    return map;
  }, [dailyLooks, items]);

  const monthWearCountByItemId = useMemo(() => {
    if (monthFilter === '전체') return null;
    return wornByMonthMap[monthFilter] || {};
  }, [monthFilter, wornByMonthMap]);

  // Track most recent wear date and current-month wear count per item for default ordering
  const wearRecency = useMemo(
    () => buildWearRecencyIndex(dailyLooks),
    [dailyLooks]
  );

  const drawerFilterCount =
    (seasonFilter === '봄' || seasonFilter === '가을' ? 1 : 0) +
    (colorFilter !== '전체' ? 1 : 0) +
    (brandFilter !== '전체' ? 1 : 0);

  const hasAnyFilter =
    seasonFilter !== '전체' ||
    monthFilter !== '전체' ||
    colorFilter !== '전체' ||
    brandFilter !== '전체' ||
    Boolean(searchQuery.trim());

  const monthScopedCounts = useMemo(() => {
    const scoped = items.filter((item) => {
      if (selectedCategory !== '전체' && item.category !== selectedCategory) {
        return false;
      }
      if (
        selectedCategory !== '전체' &&
        selectedSubCategory !== '전체' &&
        item.subCategory !== selectedSubCategory
      ) {
        return false;
      }
      if (!matchesSeasonFilter(item.seasons, seasonFilter)) {
        return false;
      }
      return true;
    });

    const counts: Record<number, number> = {};
    for (const m of MONTH_NUMBERS) {
      const bucket = wornByMonthMap[m] || {};
      let c = 0;
      for (const item of scoped) {
        if (bucket[item.id] > 0) c += 1;
      }
      counts[m] = c;
    }
    return counts;
  }, [items, selectedCategory, selectedSubCategory, seasonFilter, wornByMonthMap]);

  const seasonScopedItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesSeasonFilter(item.seasons, seasonFilter)) return false;
        if (monthWearCountByItemId && !(monthWearCountByItemId[item.id] > 0)) {
          return false;
        }
        return true;
      }),
    [items, seasonFilter, monthWearCountByItemId]
  );

  const seasonToggleCounts = useMemo(() => {
    const categoryScoped = items.filter((item) => {
      if (selectedCategory !== '전체' && item.category !== selectedCategory) {
        return false;
      }
      if (
        selectedCategory !== '전체' &&
        selectedSubCategory !== '전체' &&
        item.subCategory !== selectedSubCategory
      ) {
        return false;
      }
      if (monthWearCountByItemId && !(monthWearCountByItemId[item.id] > 0)) {
        return false;
      }
      return true;
    });

    const counts: Record<SeasonFilterValue, number> = {
      전체: categoryScoped.length,
      '봄/가을': 0,
      봄: 0,
      여름: 0,
      가을: 0,
      겨울: 0,
    };

    for (const item of categoryScoped) {
      if (item.seasons.includes('봄') || item.seasons.includes('가을')) {
        counts['봄/가을'] += 1;
      }
      if (item.seasons.includes('봄')) counts['봄'] += 1;
      if (item.seasons.includes('여름')) counts['여름'] += 1;
      if (item.seasons.includes('가을')) counts['가을'] += 1;
      if (item.seasons.includes('겨울')) counts['겨울'] += 1;
    }

    return counts;
  }, [items, selectedCategory, selectedSubCategory, monthWearCountByItemId]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = items.filter((item) => {
      if (selectedCategory !== '전체' && item.category !== selectedCategory) {
        return false;
      }
      if (
        selectedCategory !== '전체' &&
        selectedSubCategory !== '전체' &&
        item.subCategory !== selectedSubCategory
      ) {
        return false;
      }
      if (!matchesSeasonFilter(item.seasons, seasonFilter)) {
        return false;
      }
      if (monthWearCountByItemId && !(monthWearCountByItemId[item.id] > 0)) {
        return false;
      }
      if (colorFilter !== '전체' && item.colorName !== colorFilter) {
        return false;
      }
      if (brandFilter !== '전체' && item.brand !== brandFilter) {
        return false;
      }
      if (q) {
        const hay = `${item.brand} ${item.name} ${item.category} ${item.subCategory} ${item.material ?? ''} ${item.memo ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortOption === 'recommended') {
      return sortItemsByDefaultOrder(list, wearRecency);
    }

    return [...list].sort((a, b) => {
      const wearA = monthWearCountByItemId
        ? monthWearCountByItemId[a.id] || 0
        : wearCountByItemId[a.id] || 0;
      const wearB = monthWearCountByItemId
        ? monthWearCountByItemId[b.id] || 0
        : wearCountByItemId[b.id] || 0;
      switch (sortOption) {
        case 'newest':
          return b.purchaseDate.localeCompare(a.purchaseDate) || b.createdAt.localeCompare(a.createdAt);
        case 'mostWorn':
          return wearB - wearA;
        case 'leastWorn':
          return wearA - wearB;
        case 'priceDesc':
          return b.price - a.price;
        case 'priceAsc':
          return a.price - b.price;
      }
    });
  }, [
    items,
    selectedCategory,
    selectedSubCategory,
    seasonFilter,
    monthWearCountByItemId,
    colorFilter,
    brandFilter,
    searchQuery,
    sortOption,
    wearCountByItemId,
    wearRecency,
  ]);

  const handleSelectTopCategory = (cat: '전체' | Category) => {
    setSelectedCategory(cat);
    setSelectedSubCategory('전체');
  };

  const resetAllFilters = () => {
    setSeasonFilter('전체');
    setMonthFilter('전체');
    setDisplayMonth(currentMonth);
    setMonthPopoverOpen(false);
    setColorFilter('전체');
    setBrandFilter('전체');
    setSearchQuery('');
  };

  const handleToggleDisplayMonth = () => {
    setMonthFilter((prev) => (prev === displayMonth ? '전체' : displayMonth));
  };

  const handlePrevMonth = () => {
    const next = (
      displayMonth === 1 ? 12 : displayMonth - 1
    ) as (typeof MONTH_NUMBERS)[number];
    setDisplayMonth(next);
    setMonthFilter(next);
  };

  const handleNextMonth = () => {
    const next = (
      displayMonth === 12 ? 1 : displayMonth + 1
    ) as (typeof MONTH_NUMBERS)[number];
    setDisplayMonth(next);
    setMonthFilter(next);
  };

  const handleSelectMonthFromPicker = (m: MonthFilterValue) => {
    if (m === '전체') {
      setMonthFilter('전체');
    } else {
      setDisplayMonth(m);
      setMonthFilter(m);
    }
    setMonthPopoverOpen(false);
  };

  const itemIdSet = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (itemIdSet.has(id)) next.add(id);
    }
    return next;
  }, [selectedIds, itemIdSet]);

  const selectedItems = useMemo(
    () => items.filter((item) => effectiveSelectedIds.has(item.id)),
    [items, effectiveSelectedIds]
  );

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => effectiveSelectedIds.has(item.id));

  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } else {
      setSelectionMode(true);
      setConfirmBulkDelete(false);
    }
  };

  const toggleItemSelection = (id: string) => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    setConfirmBulkDelete(false);
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of filteredItems) {
          next.delete(item.id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of filteredItems) {
          next.add(item.id);
        }
        return next;
      });
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (!onDeleteItemsBatch || effectiveSelectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await onDeleteItemsBatch(Array.from(effectiveSelectedIds));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      setSelectionMode(false);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <section className="space-y-5">
      {/* Page Title & Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111315]">
              내 옷장
            </h1>
            <span className="text-sm font-medium text-[#5B616E] tabular-nums">
              전체 {items.length}벌
            </span>
          </div>
          <p className="mt-1 text-sm text-[#5B616E]">
            카테고리별로 보유한 옷을 정리하고, 아이템을 선택해 상세 정보와 코디 내역을 확인하세요.
          </p>
        </div>

        {/* Search + Filter + Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="브랜드, 아이템, 소재 검색"
              className="w-full h-10 pl-9 pr-8 text-sm bg-[#F7F8FA] border border-slate-200/80 rounded-xl text-[#111315] placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`h-10 px-3.5 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showFilters || drawerFilterCount > 0
                ? 'bg-[#111315] text-white border-[#111315]'
                : 'bg-white text-[#111315] border-slate-200 hover:bg-[#F7F8FA]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>필터{drawerFilterCount > 0 ? ` (${drawerFilterCount})` : ''}</span>
          </button>

          <div className="relative">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="정렬 기준"
              className="h-10 pl-3.5 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-medium text-[#111315] appearance-none cursor-pointer hover:bg-[#F7F8FA] focus:outline-none focus:border-slate-400"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {(onUpdateItemsBatch || onDeleteItemsBatch) && items.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`h-10 px-3.5 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectionMode
                  ? 'bg-[#111315] text-white border-[#111315]'
                  : 'bg-white text-[#111315] border-slate-200 hover:bg-[#F7F8FA]'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>{selectionMode ? '선택 완료' : '선택'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Filter Panel */}
      {showFilters && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F8FA] border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#111315]">상세 필터</span>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Season filter */}
            <div>
              <div className="text-xs font-medium text-[#5B616E] mb-2">계절</div>
              <div className="flex flex-wrap gap-1.5">
                {(['전체', '봄/가을', ...SEASONS] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setSeasonFilter((prev) =>
                        prev === s && s !== '전체' ? '전체' : s
                      )
                    }
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      seasonFilter === s
                        ? 'bg-[#111315] text-white'
                        : 'bg-white text-[#5B616E] border border-slate-200 hover:text-[#111315]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Color filter */}
            <div>
              <div className="text-xs font-medium text-[#5B616E] mb-2">색상</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColorFilter('전체')}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    colorFilter === '전체'
                      ? 'bg-[#111315] text-white'
                      : 'bg-white text-[#5B616E] border border-slate-200'
                  }`}
                >
                  전체
                </button>
                {COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.name}
                    type="button"
                    title={sw.name}
                    onClick={() =>
                      setColorFilter(colorFilter === sw.name ? '전체' : sw.name)
                    }
                    className={`w-7 h-7 rounded-full border transition-transform cursor-pointer ${
                      colorFilter === sw.name
                        ? 'ring-2 ring-[#2563EB] ring-offset-2 scale-105 border-slate-400'
                        : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                    aria-label={sw.name}
                  />
                ))}
              </div>
            </div>

            {/* Brand filter */}
            <div>
              <label
                htmlFor="brand-filter-select"
                className="block text-xs font-medium text-[#5B616E] mb-2"
              >
                브랜드
              </label>
              <select
                id="brand-filter-select"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-[#111315]"
              >
                <option value="전체">모든 브랜드</option>
                {uniqueBrands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Month worn in Daily Looks filter */}
          <div className="pt-3 border-t border-slate-200/70">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-[#5B616E]">
                착용 월 (데일리룩)
              </span>
              <span className="text-[11px] text-[#8A8F98]">
                해당 월의 데일리룩에 입었던 아이템만 보기
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMonthFilter('전체')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  monthFilter === '전체'
                    ? 'bg-[#111315] text-white'
                    : 'bg-white text-[#5B616E] border border-slate-200 hover:text-[#111315]'
                }`}
              >
                전체
              </button>
              {MONTH_NUMBERS.map((m) => {
                const wornItemCount = Object.keys(wornByMonthMap[m] || {}).length;
                const active = monthFilter === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (monthFilter === m) {
                        setMonthFilter('전체');
                      } else {
                        setDisplayMonth(m);
                        setMonthFilter(m);
                      }
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1 tabular-nums ${
                      active
                        ? 'bg-[#111315] text-white'
                        : wornItemCount > 0
                          ? 'bg-white text-[#111315] border border-slate-200 hover:border-slate-400'
                          : 'bg-white/60 text-[#9CA3AF] border border-slate-200/70 hover:text-[#5B616E]'
                    }`}
                  >
                    <span>{m}월</span>
                    {wornItemCount > 0 && (
                      <span
                        className={`text-[10px] ${
                          active ? 'text-white/75' : 'text-[#8A8F98]'
                        }`}
                      >
                        {wornItemCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Season & Month Toggle Filter Bar */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap max-w-full">
          <div
            role="group"
            aria-label="계절별 필터"
            className="inline-flex items-center p-1 rounded-xl bg-[#F3F4F6] border border-slate-200/70 overflow-x-auto max-w-full no-scrollbar"
          >
            {SEASON_TOGGLE_OPTIONS.map((opt) => {
              const active = seasonFilter === opt.value;
              const count = seasonToggleCounts[opt.value] ?? 0;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setSeasonFilter((prev) =>
                      prev === opt.value && opt.value !== '전체' ? '전체' : opt.value
                    )
                  }
                  className={`min-h-[34px] px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#5B616E] hover:text-[#111315]'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`text-[11px] font-normal tabular-nums ${
                      active ? 'text-[#5B616E]' : 'text-[#8A8F98]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Inline Month Filter (defaults to current month, switchable) */}
          <div ref={monthPickerRef} className="relative inline-flex items-center">
            <div
              role="group"
              aria-label="착용 월 필터"
              className={`inline-flex items-center p-1 rounded-xl border transition-colors ${
                monthFilter !== '전체'
                  ? 'bg-[#111315] border-[#111315] text-white'
                  : 'bg-[#F3F4F6] border-slate-200/70 text-[#5B616E]'
              }`}
            >
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="이전 달"
                title="이전 달"
                className={`w-7 h-[34px] rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${
                  monthFilter !== '전체'
                    ? 'text-white/75 hover:text-white hover:bg-white/10'
                    : 'text-[#5B616E] hover:text-[#111315] hover:bg-white/70'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                aria-pressed={monthFilter === displayMonth}
                onClick={handleToggleDisplayMonth}
                title={
                  monthFilter === displayMonth
                    ? `${displayMonth}월 착용 필터 해제`
                    : `${displayMonth}월 데일리룩 착용 아이템 보기`
                }
                className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  monthFilter !== '전체'
                    ? 'text-white hover:bg-white/10'
                    : 'text-[#111315] hover:bg-white/80'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0 opacity-75" />
                <span className="tabular-nums">
                  {displayMonth}월{displayMonth === currentMonth ? ' (이번달)' : ''}
                </span>
                <span
                  className={`text-[11px] font-normal tabular-nums ${
                    monthFilter !== '전체' ? 'text-white/75' : 'text-[#8A8F98]'
                  }`}
                >
                  {monthScopedCounts[displayMonth] ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="다음 달"
                title="다음 달"
                className={`w-7 h-[34px] rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${
                  monthFilter !== '전체'
                    ? 'text-white/75 hover:text-white hover:bg-white/10'
                    : 'text-[#5B616E] hover:text-[#111315] hover:bg-white/70'
                }`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setMonthPopoverOpen((v) => !v)}
                aria-expanded={monthPopoverOpen}
                aria-haspopup="dialog"
                aria-label="월 선택"
                title="다른 월 선택"
                className={`w-7 h-[34px] rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ml-0.5 border-l ${
                  monthFilter !== '전체'
                    ? 'border-white/15 text-white/80 hover:text-white hover:bg-white/10'
                    : 'border-slate-300/70 text-[#5B616E] hover:text-[#111315] hover:bg-white/70'
                }`}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    monthPopoverOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {monthFilter !== '전체' && (
                <button
                  type="button"
                  onClick={() => setMonthFilter('전체')}
                  aria-label="월 필터 해제"
                  title="월 필터 해제"
                  className="w-7 h-[34px] rounded-lg inline-flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {monthPopoverOpen && (
              <div
                role="dialog"
                aria-label="착용 월 선택"
                className="absolute left-0 top-full mt-2 z-30 w-[264px] max-w-[calc(100vw-2rem)] p-3 rounded-2xl bg-white border border-slate-200/90 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#111315]">
                    착용 월 선택
                  </span>
                  <div className="flex items-center gap-2">
                    {displayMonth !== currentMonth && (
                      <button
                        type="button"
                        onClick={() => handleSelectMonthFromPicker(currentMonth)}
                        className="text-[11px] font-medium text-[#2563EB] hover:underline cursor-pointer"
                      >
                        이번달 ({currentMonth}월)
                      </button>
                    )}
                    {monthFilter !== '전체' && (
                      <button
                        type="button"
                        onClick={() => handleSelectMonthFromPicker('전체')}
                        className="text-[11px] font-medium text-[#5B616E] hover:text-[#111315] cursor-pointer"
                      >
                        해제
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {MONTH_NUMBERS.map((m) => {
                    const count = monthScopedCounts[m] ?? 0;
                    const active = monthFilter === m;
                    const isCurrent = m === currentMonth;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          handleSelectMonthFromPicker(active ? '전체' : m)
                        }
                        className={`min-h-[42px] px-1.5 py-1 rounded-xl text-xs font-medium transition-colors cursor-pointer flex flex-col items-center justify-center tabular-nums border ${
                          active
                            ? 'bg-[#111315] text-white border-[#111315]'
                            : count > 0
                              ? isCurrent
                                ? 'bg-[#F7F8FA] text-[#111315] border-[#111315]/40 hover:border-[#111315]'
                                : 'bg-white text-[#111315] border-slate-200 hover:border-slate-400'
                              : isCurrent
                                ? 'bg-[#F7F8FA] text-[#5B616E] border-slate-300 hover:border-slate-400'
                                : 'bg-white text-[#9CA3AF] border-slate-200/70 hover:text-[#5B616E]'
                        }`}
                      >
                        <span className="leading-tight font-semibold">{m}월</span>
                        <span
                          className={`text-[10px] leading-tight mt-0.5 ${
                            active
                              ? 'text-white/75'
                              : count > 0
                                ? 'text-[#5B616E]'
                                : 'text-[#B0B7C3]'
                          }`}
                        >
                          {count > 0 ? `${count}벌` : isCurrent ? '이번달' : '-'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {(seasonFilter === '봄' || seasonFilter === '가을') && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSeasonFilter('전체')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111315] text-white text-xs font-medium cursor-pointer"
            >
              <span>계절: {seasonFilter}</span>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Level 1: Top-Level Category Tabs */}
      <div className="border-b border-slate-200/80">
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {(['전체', ...TOP_CATEGORIES] as const).map((cat) => {
            const isActive = selectedCategory === cat;
            const count =
              cat === '전체'
                ? seasonScopedItems.length
                : seasonScopedItems.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectTopCategory(cat)}
                className={`relative pb-3 pt-1 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#111315]'
                    : 'text-[#8A8F98] hover:text-[#111315]'
                }`}
              >
                <span>{cat}</span>
                <span className="ml-1 text-xs font-normal tabular-nums text-slate-400">
                  {count}
                </span>
                {isActive && (
                  <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#111315] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 2: Sub-category Filter Tabs (shown when a top category is entered) */}
      {selectedCategory !== '전체' && availableSubCategories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-xs font-medium text-[#8A8F98] mr-1 whitespace-nowrap shrink-0">
            세부 카테고리
          </span>
          {['전체', ...availableSubCategories].map((sub) => {
            const isSubActive = selectedSubCategory === sub;
            const subCount =
              sub === '전체'
                ? seasonScopedItems.filter((i) => i.category === selectedCategory).length
                : seasonScopedItems.filter(
                    (i) => i.category === selectedCategory && i.subCategory === sub
                  ).length;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => setSelectedSubCategory(sub)}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isSubActive
                    ? 'bg-[#111315] text-white'
                    : 'bg-[#F7F8FA] text-[#5B616E] hover:bg-slate-200/70 hover:text-[#111315]'
                }`}
              >
                {sub} <span className="opacity-70 tabular-nums">{subCount}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Multi-Select Bulk Action Bar */}
      {selectionMode && (
        <div className="sticky top-[54px] md:top-[68px] z-20 p-3 sm:px-4 sm:py-3 rounded-2xl bg-[#111315] text-white shadow-lg flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs sm:text-sm font-semibold tabular-nums">
              {effectiveSelectedIds.size}개 선택됨
            </span>
            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAllFiltered}
                className="min-h-[34px] px-2.5 rounded-lg bg-white/12 hover:bg-white/20 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {allFilteredSelected
                  ? '현재 목록 해제'
                  : `현재 목록 전체 선택 (${filteredItems.length})`}
              </button>
            )}
            {effectiveSelectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setConfirmBulkDelete(false);
                }}
                className="min-h-[34px] px-2.5 rounded-lg text-xs font-medium text-white/75 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                선택 비우기
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onUpdateItemsBatch && !confirmBulkDelete && (
              <button
                type="button"
                disabled={effectiveSelectedIds.size === 0}
                onClick={() => setBulkEditOpen(true)}
                className="min-h-[36px] px-3 rounded-xl bg-white text-[#111315] text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>한꺼번에 수정</span>
              </button>
            )}

            {onDeleteItemsBatch && !confirmBulkDelete && (
              <button
                type="button"
                disabled={effectiveSelectedIds.size === 0}
                onClick={() => setConfirmBulkDelete(true)}
                className="min-h-[36px] px-3 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>한꺼번에 삭제</span>
              </button>
            )}

            {confirmBulkDelete && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-red-200 whitespace-nowrap">
                  {effectiveSelectedIds.size}개 삭제할까요?
                </span>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={handleConfirmBulkDelete}
                  className="min-h-[36px] px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {bulkDeleting ? '삭제 중...' : '삭제 확인'}
                </button>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => setConfirmBulkDelete(false)}
                  className="min-h-[36px] px-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  취소
                </button>
              </div>
            )}

            {!confirmBulkDelete && (
              <button
                type="button"
                onClick={toggleSelectionMode}
                aria-label="선택 모드 닫기"
                className="min-h-[36px] px-2.5 rounded-xl bg-white/12 hover:bg-white/20 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results Header */}
      {(selectedCategory !== '전체' || hasAnyFilter) && (
        <div className="flex items-center justify-between text-xs text-[#5B616E]">
          <span className="tabular-nums">
            조건에 맞는 아이템 {filteredItems.length}개
          </span>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[#2563EB] hover:underline font-medium cursor-pointer"
            >
              필터 모두 해제
            </button>
          )}
        </div>
      )}

      {/* Wardrobe Grid */}
      {filteredItems.length === 0 ? (
        <div className="py-16 px-4 text-center rounded-2xl bg-[#F7F8FA] border border-slate-200/60">
          <p className="text-sm font-medium text-[#111315]">
            해당 조건의 옷이 아직 없습니다.
          </p>
          <p className="mt-1 text-xs text-[#5B616E]">
            필터를 초기화하거나 새 아이템을 추가해 보세요.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white text-[#111315] hover:bg-slate-50 cursor-pointer"
              >
                필터 초기화
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onOpenAddItem(
                  selectedCategory === '전체' ? undefined : selectedCategory,
                  selectedSubCategory === '전체' ? undefined : selectedSubCategory
                )
              }
              className="px-4 py-2 text-xs font-medium rounded-xl bg-[#111315] text-white hover:bg-slate-800 cursor-pointer"
            >
              + 아이템 추가
            </button>
            {onOpenBatchAdd && (
              <button
                type="button"
                onClick={() =>
                  onOpenBatchAdd(
                    selectedCategory === '전체' ? undefined : selectedCategory,
                    selectedSubCategory === '전체' ? undefined : selectedSubCategory
                  )
                }
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white text-[#111315] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Images className="w-3.5 h-3.5" />
                <span>여러 사진 등록</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-5 sm:gap-x-5 sm:gap-y-7">
          {filteredItems.map((item) => {
            const wearCount = wearCountByItemId[item.id] || 0;
            const monthlyWearCount = monthWearCountByItemId
              ? monthWearCountByItemId[item.id] || 0
              : 0;
            const isSelected = effectiveSelectedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selectionMode ? isSelected : undefined}
                onClick={() => {
                  if (selectionMode) {
                    toggleItemSelection(item.id);
                  } else {
                    onSelectItem(item.id);
                  }
                }}
                className="group text-left focus:outline-none cursor-pointer"
              >
                <div
                  className={`relative aspect-square w-full rounded-xl p-3 sm:p-4 flex items-center justify-center overflow-hidden transition-all duration-200 ${
                    selectionMode && isSelected
                      ? 'bg-white border-2 border-[#111315] ring-2 ring-[#111315]/15'
                      : 'bg-[#F7F8FA] border border-slate-200/60 group-hover:-translate-y-0.5 group-hover:border-slate-300'
                  }`}
                >
                  <GarmentVisual
                    item={item}
                    className={`w-full h-full transition-transform duration-200 ${
                      selectionMode && isSelected
                        ? 'scale-[0.96]'
                        : 'group-hover:scale-[1.03]'
                    }`}
                  />

                  {selectionMode && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors border ${
                        isSelected
                          ? 'bg-[#111315] border-[#111315] text-white shadow-xs'
                          : 'bg-white/90 border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                  )}
                </div>
                <div className="mt-2 px-0.5">
                  <div className="text-[11px] sm:text-xs font-semibold tracking-tight text-[#111315] truncate">
                    {item.brand}
                  </div>
                  <div className="text-xs text-[#5B616E] truncate mt-0.5">
                    {item.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#8A8F98] tabular-nums">
                    <span>{formatShortDotDate(item.purchaseDate)}</span>
                    {monthFilter !== '전체' && monthlyWearCount > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#111315] font-medium">
                          {monthFilter}월 {monthlyWearCount}회
                        </span>
                      </>
                    ) : (
                      wearCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{wearCount}회 착용</span>
                        </>
                      )
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Add Item Tiles (hidden during selection mode for clean bulk focus) */}
          {!selectionMode && (
            <>
              <button
                type="button"
                onClick={() =>
                  onOpenAddItem(
                    selectedCategory === '전체' ? undefined : selectedCategory,
                    selectedSubCategory === '전체' ? undefined : selectedSubCategory
                  )
                }
                className="group text-left focus:outline-none cursor-pointer"
              >
                <div className="aspect-square w-full rounded-xl bg-[#F7F8FA] border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2.5 text-[#5B616E] group-hover:bg-slate-100 group-hover:border-slate-400 group-hover:text-[#111315] transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#111315] text-white flex items-center justify-center transition-transform group-hover:scale-105">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold">아이템 추가</span>
                </div>
              </button>

              {onOpenBatchAdd && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenBatchAdd(
                      selectedCategory === '전체' ? undefined : selectedCategory,
                      selectedSubCategory === '전체' ? undefined : selectedSubCategory
                    )
                  }
                  className="group text-left focus:outline-none cursor-pointer"
                >
                  <div className="aspect-square w-full rounded-xl bg-[#F7F8FA] border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2.5 text-[#5B616E] group-hover:bg-slate-100 group-hover:border-slate-400 group-hover:text-[#111315] transition-colors px-2 text-center">
                    <div className="w-10 h-10 rounded-full bg-white border border-slate-300 text-[#111315] flex items-center justify-center transition-transform group-hover:scale-105">
                      <Images className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold">여러 사진 개별 등록</span>
                  </div>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditOpen && onUpdateItemsBatch && selectedItems.length > 0 && (
        <BulkEditItemsModal
          selectedItems={selectedItems}
          existingBrands={existingBrands}
          existingMaterials={existingMaterials}
          existingSizes={existingSizes}
          onClose={() => setBulkEditOpen(false)}
          onSave={async (patch) => {
            await onUpdateItemsBatch(
              selectedItems.map((it) => it.id),
              patch
            );
            setSelectedIds(new Set());
            setSelectionMode(false);
          }}
        />
      )}
    </section>
  );
}
