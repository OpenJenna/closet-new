import { useMemo, useState } from 'react';
import {
  CATEGORY_TREE,
  COLOR_SWATCHES,
  Category,
  DailyLook,
  SEASONS,
  TOP_CATEGORIES,
  WardrobeItem,
} from '../types/wardrobe';
import { formatCurrencyKRW, formatShortDotDate } from '../utils/formatters';
import { GarmentVisual } from './GarmentGraphic';

interface StatisticsViewProps {
  items: WardrobeItem[];
  itemsById: Record<string, WardrobeItem>;
  dailyLooks: DailyLook[];
  wearCountByItemId: Record<string, number>;
  onSelectItem: (itemId: string) => void;
}

const COLOR_STAT_CATEGORIES: Category[] = ['상의', '바지', '아우터'];
const COLOR_HEX_BY_NAME: Record<string, string> = Object.fromEntries(
  COLOR_SWATCHES.map((sw) => [sw.name, sw.hex])
);

export function StatisticsView({
  items,
  itemsById,
  dailyLooks,
  wearCountByItemId,
  onSelectItem,
}: StatisticsViewProps) {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(11);
  const [expandedCategory, setExpandedCategory] = useState<Category | null>('아우터');
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [showAllBrands, setShowAllBrands] = useState(false);

  const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Wardrobe overview metrics
  const wardrobeMetrics = useMemo(() => {
    const totalCount = items.length;
    const totalValue = items.reduce((sum, it) => sum + (it.price || 0), 0);
    const totalWears = Object.values(wearCountByItemId).reduce((a, b) => a + b, 0);

    const categoryCounts = TOP_CATEGORIES.map((cat) => {
      const catItems = items.filter((i) => i.category === cat);
      const subCounts = (CATEGORY_TREE[cat] || []).map((sub) => ({
        subCategory: sub,
        count: catItems.filter((i) => i.subCategory === sub).length,
      }));
      return {
        category: cat,
        count: catItems.length,
        percentage: totalCount > 0 ? Math.round((catItems.length / totalCount) * 100) : 0,
        value: catItems.reduce((sum, i) => sum + (i.price || 0), 0),
        subCounts,
      };
    });

    const seasonCounts = SEASONS.map((season) => ({
      season,
      count: items.filter((i) => i.seasons.includes(season)).length,
    }));

    const colorStatsByCategory = COLOR_STAT_CATEGORIES.map((category) => {
      const catItems = items.filter((i) => i.category === category);
      const colorMap = new Map<
        string,
        { colorName: string; colorHex: string; count: number }
      >();

      for (const it of catItems) {
        const name = (it.colorName || '').trim() || '기타';
        const hex =
          it.colorHex || COLOR_HEX_BY_NAME[name] || '#CBD5E1';
        const existing = colorMap.get(name);
        if (existing) {
          existing.count += 1;
        } else {
          colorMap.set(name, { colorName: name, colorHex: hex, count: 1 });
        }
      }

      const colors = Array.from(colorMap.values())
        .sort((a, b) => b.count - a.count || a.colorName.localeCompare(b.colorName))
        .map((entry) => ({
          ...entry,
          percentage:
            catItems.length > 0
              ? Math.round((entry.count / catItems.length) * 100)
              : 0,
        }));

      return {
        category,
        total: catItems.length,
        colors,
      };
    });

    const brandMap = new Map<
      string,
      { brand: string; count: number; value: number; items: WardrobeItem[] }
    >();
    for (const it of items) {
      const brandName = (it.brand || '').trim() || '브랜드 미입력';
      const existing = brandMap.get(brandName);
      if (existing) {
        existing.count += 1;
        existing.value += it.price || 0;
        existing.items.push(it);
      } else {
        brandMap.set(brandName, {
          brand: brandName,
          count: 1,
          value: it.price || 0,
          items: [it],
        });
      }
    }

    const brandCounts = Array.from(brandMap.values())
      .sort((a, b) => {
        if (a.brand === '브랜드 미입력' && b.brand !== '브랜드 미입력') return 1;
        if (b.brand === '브랜드 미입력' && a.brand !== '브랜드 미입력') return -1;
        return b.count - a.count || a.brand.localeCompare(b.brand);
      })
      .map((entry) => ({
        ...entry,
        percentage:
          totalCount > 0 ? Math.round((entry.count / totalCount) * 100) : 0,
      }));

    return {
      totalCount,
      totalValue,
      totalWears,
      categoryCounts,
      seasonCounts,
      colorStatsByCategory,
      brandCounts,
    };
  }, [items, wearCountByItemId]);

  // Selected month analytics
  const monthlyAnalytics = useMemo(() => {
    const monthLooks = dailyLooks.filter((lk) => lk.date.startsWith(monthKey));
    const wearMap: Record<string, number> = {};
    for (const lk of monthLooks) {
      for (const itemId of lk.itemIds) {
        if (itemsById[itemId]) {
          wearMap[itemId] = (wearMap[itemId] || 0) + 1;
        }
      }
    }

    const topWorn = Object.entries(wearMap)
      .map(([itemId, count]) => ({ item: itemsById[itemId], count }))
      .filter((entry) => Boolean(entry.item))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const purchasedItems = items
      .filter((it) => it.purchaseDate.startsWith(monthKey))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));

    const totalSpend = purchasedItems.reduce((sum, it) => sum + (it.price || 0), 0);

    return {
      lookCount: monthLooks.length,
      topWorn,
      purchasedItems,
      totalSpend,
    };
  }, [dailyLooks, items, itemsById, monthKey]);

  return (
    <section className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111315]">
          옷장 통계
        </h1>
        <p className="mt-1 text-sm text-[#5B616E]">
          보유 중인 아이템의 카테고리 분포와 월별 데일리룩 · 지출 내역을 한눈에 확인하세요.
        </p>
      </div>

      {/* Top 3 KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#F7F8FA] border border-slate-200/70 p-5">
          <div className="text-xs font-medium text-[#5B616E]">총 보유 아이템</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#111315] tabular-nums">
            {wardrobeMetrics.totalCount}벌
          </div>
          <div className="mt-1 text-xs text-[#8A8F98] tabular-nums">
            {TOP_CATEGORIES.length}개 카테고리
          </div>
        </div>

        <div className="rounded-2xl bg-[#F7F8FA] border border-slate-200/70 p-5">
          <div className="text-xs font-medium text-[#5B616E]">옷장 총 구매 가치</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#111315] tabular-nums">
            {formatCurrencyKRW(wardrobeMetrics.totalValue)}
          </div>
          <div className="mt-1 text-xs text-[#8A8F98] tabular-nums">
            누적 코디 착용 {wardrobeMetrics.totalWears}회
          </div>
        </div>

        <div className="rounded-2xl bg-[#F7F8FA] border border-slate-200/70 p-5">
          <div className="text-xs font-medium text-[#5B616E]">계절별 보유 분포</div>
          <div className="mt-2.5 grid grid-cols-4 gap-2 text-center">
            {wardrobeMetrics.seasonCounts.map((sc) => (
              <div key={sc.season}>
                <div className="text-lg font-bold text-[#111315] tabular-nums">
                  {sc.count}
                </div>
                <div className="text-[11px] text-[#5B616E]">{sc.season}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two-Column Split: Category Breakdown vs Monthly Look & Spend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Category Breakdown */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#111315]">
              카테고리별 보유 개수
            </h2>
            <p className="text-xs text-[#5B616E] mt-0.5">
              상위 카테고리를 누르면 세부 카테고리별 개수를 볼 수 있습니다.
            </p>
          </div>

          <div className="space-y-3">
            {wardrobeMetrics.categoryCounts.map((row) => {
              const isExpanded = expandedCategory === row.category;
              return (
                <div
                  key={row.category}
                  className="rounded-xl border border-slate-100 bg-[#FAFAFB] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCategory(isExpanded ? null : row.category)
                    }
                    className="w-full p-3.5 text-left hover:bg-[#F3F4F6]/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-sm font-semibold text-[#111315]">
                      <span>{row.category}</span>
                      <span className="tabular-nums">
                        {row.count}벌{' '}
                        <span className="text-xs font-normal text-[#8A8F98]">
                          ({row.percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#111315] transition-all duration-300"
                        style={{ width: `${row.percentage}%` }}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 grid grid-cols-2 gap-2">
                      {row.subCounts.map((sub) => (
                        <div
                          key={sub.subCategory}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/60 text-xs"
                        >
                          <span className="text-[#5B616E] truncate">
                            {sub.subCategory}
                          </span>
                          <span className="font-semibold text-[#111315] tabular-nums ml-2">
                            {sub.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Monthly Look & Spending Report */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#111315]">
                월별 데일리룩 · 지출 리포트
              </h2>
              <p className="text-xs text-[#5B616E] mt-0.5">
                선택한 달의 최다 착용 옷과 지출 금액을 분석합니다.
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                aria-label="통계 연도"
                className="h-9 px-2.5 rounded-lg border border-slate-200 bg-[#F7F8FA] text-xs font-semibold text-[#111315] tabular-nums"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                aria-label="통계 월"
                className="h-9 px-2.5 rounded-lg border border-slate-200 bg-[#F7F8FA] text-xs font-semibold text-[#111315] tabular-nums"
              >
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Monthly KPI Pair */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#F7F8FA] p-4">
              <div className="text-xs text-[#5B616E]">이달의 데일리룩</div>
              <div className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">
                {monthlyAnalytics.lookCount}회
              </div>
            </div>
            <div className="rounded-xl bg-[#F7F8FA] p-4">
              <div className="text-xs text-[#5B616E]">이달의 지출 금액</div>
              <div className="mt-1 text-2xl font-bold text-[#2563EB] tabular-nums">
                {formatCurrencyKRW(monthlyAnalytics.totalSpend)}
              </div>
            </div>
          </div>

          {/* Top 5 Most Worn Items */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#111315]">
              {selectedMonth}월 가장 많이 입은 옷
            </h3>

            {monthlyAnalytics.topWorn.length === 0 ? (
              <div className="py-8 text-center rounded-xl bg-[#F7F8FA] text-xs text-[#5B616E]">
                {selectedYear}년 {selectedMonth}월에 기록된 데일리룩이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {monthlyAnalytics.topWorn.map(({ item, count }, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-[#F7F8FA] transition-colors text-left cursor-pointer"
                  >
                    <span className="w-5 text-xs font-bold text-[#8A8F98] tabular-nums text-center">
                      {index + 1}
                    </span>
                    <div className="w-11 h-11 rounded-lg bg-[#F7F8FA] border border-slate-200/60 p-1 shrink-0">
                      <GarmentVisual item={item} className="w-full h-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#111315] truncate">
                        {item.brand}
                      </div>
                      <div className="text-xs text-[#5B616E] truncate">
                        {item.name}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-[#2563EB] tabular-nums shrink-0">
                      {count}회 착용
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Monthly Purchases Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#111315]">
              {selectedMonth}월 구매 내역 ({monthlyAnalytics.purchasedItems.length}건)
            </h3>

            {monthlyAnalytics.purchasedItems.length === 0 ? (
              <div className="py-6 text-center rounded-xl bg-[#F7F8FA] text-xs text-[#5B616E]">
                {selectedYear}년 {selectedMonth}월에 등록된 구매 내역이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {monthlyAnalytics.purchasedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-[#F7F8FA] transition-colors text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#F7F8FA] border border-slate-200/60 p-1 shrink-0">
                      <GarmentVisual item={item} className="w-full h-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#111315] truncate">
                        {item.brand} · {item.name}
                      </div>
                      <div className="text-[11px] text-[#8A8F98] tabular-nums">
                        {formatShortDotDate(item.purchaseDate)}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-[#111315] tabular-nums shrink-0">
                      {formatCurrencyKRW(item.price)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Color Distribution for 상의, 바지, 아우터 */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-[#111315]">
            상의 · 바지 · 아우터 색상 통계
          </h2>
          <p className="text-xs text-[#5B616E] mt-0.5">
            주요 카테고리별로 보유한 컬러 비중을 비교해 보세요.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {wardrobeMetrics.colorStatsByCategory.map((group) => (
            <div
              key={group.category}
              className="rounded-xl border border-slate-200/70 bg-[#FAFAFB] p-4 flex flex-col gap-3.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-[#111315]">
                  {group.category}
                </h3>
                <span className="text-xs font-medium text-[#5B616E] tabular-nums">
                  총 {group.total}벌 · {group.colors.length}색
                </span>
              </div>

              {group.total === 0 ? (
                <div className="py-8 text-center text-xs text-[#8A8F98]">
                  등록된 {group.category} 아이템이 없습니다.
                </div>
              ) : (
                <>
                  {/* Stacked Color Bar */}
                  <div
                    className="h-3 w-full rounded-full overflow-hidden flex bg-slate-200/70 border border-slate-200/80"
                    aria-label={`${group.category} 색상 비율 바`}
                  >
                    {group.colors.map((c) => (
                      <div
                        key={c.colorName}
                        title={`${c.colorName} ${c.count}벌 (${c.percentage}%)`}
                        style={{
                          width: `${(c.count / group.total) * 100}%`,
                          backgroundColor: c.colorHex,
                        }}
                        className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                      />
                    ))}
                  </div>

                  {/* Per-color Breakdown */}
                  <div className="space-y-2">
                    {group.colors.map((c) => (
                      <div
                        key={c.colorName}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-300/90 shrink-0"
                            style={{ backgroundColor: c.colorHex }}
                            aria-hidden="true"
                          />
                          <span className="text-[#111315] font-medium truncate">
                            {c.colorName}
                          </span>
                        </div>
                        <span className="text-[#111315] font-semibold tabular-nums shrink-0">
                          {c.count}벌{' '}
                          <span className="font-normal text-[#8A8F98]">
                            ({c.percentage}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Brand Breakdown */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#111315]">
              브랜드별 보유 개수
            </h2>
            <p className="text-xs text-[#5B616E] mt-0.5">
              브랜드를 누르면 보유 중인 해당 브랜드 아이템을 확인할 수 있습니다.
            </p>
          </div>
          <span className="text-xs font-medium text-[#5B616E] tabular-nums">
            총 {wardrobeMetrics.brandCounts.length}개 브랜드
          </span>
        </div>

        {wardrobeMetrics.brandCounts.length === 0 ? (
          <div className="py-8 text-center rounded-xl bg-[#F7F8FA] text-xs text-[#5B616E]">
            등록된 아이템이 없습니다.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(showAllBrands
                ? wardrobeMetrics.brandCounts
                : wardrobeMetrics.brandCounts.slice(0, 12)
              ).map((row, idx) => {
                const maxCount = wardrobeMetrics.brandCounts[0]?.count || 1;
                const barWidth = Math.max(
                  6,
                  Math.round((row.count / maxCount) * 100)
                );
                const isExpanded = expandedBrand === row.brand;
                return (
                  <div
                    key={row.brand}
                    className="rounded-xl border border-slate-100 bg-[#FAFAFB] overflow-hidden self-start"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBrand(isExpanded ? null : row.brand)
                      }
                      className="w-full p-3.5 text-left hover:bg-[#F3F4F6]/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold text-[#111315]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-[#8A8F98] tabular-nums w-5 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate">{row.brand}</span>
                        </div>
                        <span className="tabular-nums shrink-0">
                          {row.count}벌{' '}
                          <span className="text-xs font-normal text-[#8A8F98]">
                            ({row.percentage}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/80 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#111315] transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-100 space-y-1.5">
                        {row.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectItem(item.id)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-white border border-slate-200/60 hover:border-slate-300 text-left transition-colors cursor-pointer"
                          >
                            <div className="w-9 h-9 rounded-md bg-[#F7F8FA] p-1 shrink-0">
                              <GarmentVisual item={item} className="w-full h-full" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-[#111315] truncate">
                                {item.name}
                              </div>
                              <div className="text-[11px] text-[#8A8F98] truncate">
                                {item.category} · {item.colorName}
                              </div>
                            </div>
                            <span className="text-[11px] font-medium text-[#5B616E] tabular-nums shrink-0">
                              {formatCurrencyKRW(item.price)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {wardrobeMetrics.brandCounts.length > 12 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllBrands((v) => !v)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#111315] hover:bg-[#F7F8FA] transition-colors cursor-pointer"
                >
                  {showAllBrands
                    ? '접기'
                    : `전체 ${wardrobeMetrics.brandCounts.length}개 브랜드 모두 보기`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
