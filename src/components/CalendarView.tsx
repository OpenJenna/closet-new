import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { DailyLook, WardrobeItem } from '../types/wardrobe';
import {
  exportMonthCalendarImage,
  exportSelectedDatesLooksImage,
} from '../utils/calendarExport';
import { getTodayIsoDate } from '../utils/formatters';
import { GarmentVisual } from './GarmentGraphic';
import { OutfitCollage } from './OutfitCollage';

interface CalendarViewProps {
  items: WardrobeItem[];
  itemsById: Record<string, WardrobeItem>;
  dailyLooks: DailyLook[];
  initialYearMonth?: { year: number; month: number };
  onSelectDateLooks: (date: string, lookId?: string) => void;
  onAddLookOnDate: (date: string) => void;
  onSelectItem: (itemId: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarView({
  items,
  itemsById,
  dailyLooks,
  initialYearMonth,
  onSelectDateLooks,
  onAddLookOnDate,
  onSelectItem,
}: CalendarViewProps) {
  const todayIso = getTodayIsoDate();
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);
  const [year, setYear] = useState(initialYearMonth?.year ?? todayYear);
  const [month, setMonth] = useState(initialYearMonth?.month ?? todayMonth); // 1-12
  const [selectExportMode, setSelectExportMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [exportingType, setExportingType] = useState<'month' | 'selected' | null>(
    null
  );
  const [exportFeedback, setExportFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!exportFeedback || exportFeedback.type !== 'success') return;
    const timer = window.setTimeout(() => setExportFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [exportFeedback]);

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // Group daily looks by YYYY-MM-DD
  const looksByDate = useMemo(() => {
    const map: Record<string, DailyLook[]> = {};
    for (const look of dailyLooks) {
      if (!map[look.date]) map[look.date] = [];
      map[look.date].push(look);
    }
    return map;
  }, [dailyLooks]);

  // Build 35 or 42 calendar cells starting Sunday
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const startWeekday = firstDayOfMonth.getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalCells = startWeekday + daysInMonth > 35 ? 42 : 35;

    const cells: {
      isoDate: string;
      dayNumber: number;
      isCurrentMonth: boolean;
    }[] = [];

    for (let i = 0; i < totalCells; i++) {
      const dt = new Date(year, month - 1, 1 - startWeekday + i);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      cells.push({
        isoDate: `${y}-${m}-${d}`,
        dayNumber: dt.getDate(),
        isCurrentMonth: dt.getMonth() === month - 1 && dt.getFullYear() === year,
      });
    }
    return cells;
  }, [year, month]);

  // Monthly statistics
  const monthlyStats = useMemo(() => {
    const monthLooks = dailyLooks.filter((l) => l.date.startsWith(monthKey));
    const wearCounts: Record<string, number> = {};
    for (const lk of monthLooks) {
      for (const itemId of lk.itemIds) {
        if (itemsById[itemId]) {
          wearCounts[itemId] = (wearCounts[itemId] || 0) + 1;
        }
      }
    }

    const findMostWorn = (
      predicate: (item: WardrobeItem) => boolean
    ): { item: WardrobeItem; count: number } | null => {
      let bestItem: WardrobeItem | null = null;
      let bestCount = 0;
      for (const [id, count] of Object.entries(wearCounts)) {
        const item = itemsById[id];
        if (!item || !predicate(item)) continue;
        if (count > bestCount) {
          bestCount = count;
          bestItem = item;
        }
      }
      return bestItem ? { item: bestItem, count: bestCount } : null;
    };

    const mostWornTopOrOuter = findMostWorn(
      (it) => it.category === '상의' || it.category === '아우터'
    );
    const mostWornBottom = findMostWorn(
      (it) => it.category === '바지' || it.category === '치마'
    );
    const mostWornShoes = findMostWorn((it) => it.category === '신발');

    const monthlySpend = items
      .filter((it) => it.purchaseDate.startsWith(monthKey))
      .reduce((acc, it) => acc + (it.price || 0), 0);

    return {
      lookCount: monthLooks.length,
      mostWornTopOrOuter,
      mostWornBottom,
      mostWornShoes,
      monthlySpend,
    };
  }, [dailyLooks, items, itemsById, monthKey]);

  const currentMonthLookDates = useMemo(
    () =>
      calendarCells
        .filter((cell) => cell.isCurrentMonth && (looksByDate[cell.isoDate]?.length ?? 0) > 0)
        .map((cell) => cell.isoDate),
    [calendarCells, looksByDate]
  );

  const allCurrentMonthSelected =
    currentMonthLookDates.length > 0 &&
    currentMonthLookDates.every((d) => selectedDates.has(d));

  const toggleDateSelection = (isoDate: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(isoDate)) {
        next.delete(isoDate);
      } else {
        next.add(isoDate);
      }
      return next;
    });
  };

  const handleToggleSelectAllMonthLooks = () => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (allCurrentMonthSelected) {
        currentMonthLookDates.forEach((d) => next.delete(d));
      } else {
        currentMonthLookDates.forEach((d) => next.add(d));
      }
      return next;
    });
  };

  const handleExportMonth = async () => {
    setExportingType('month');
    setExportFeedback(null);
    try {
      await exportMonthCalendarImage({
        year,
        month,
        calendarCells,
        looksByDate,
        itemsById,
        lookCount: monthlyStats.lookCount,
        monthlySpend: monthlyStats.monthlySpend,
      });
      setExportFeedback({
        type: 'success',
        text: `${year}년 ${month}월 달력 이미지를 저장했습니다.`,
      });
    } catch (err) {
      setExportFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : '월 달력 이미지를 저장하지 못했습니다.',
      });
    } finally {
      setExportingType(null);
    }
  };

  const handleExportSelected = async () => {
    if (selectedDates.size === 0) return;
    setExportingType('selected');
    setExportFeedback(null);
    try {
      const dates = Array.from(selectedDates);
      await exportSelectedDatesLooksImage({
        selectedDates: dates,
        looksByDate,
        itemsById,
      });
      setExportFeedback({
        type: 'success',
        text:
          dates.length === 1
            ? `${dates[0]} 데일리룩 이미지를 저장했습니다.`
            : `선택한 ${dates.length}일 데일리룩 모음 이미지를 저장했습니다.`,
      });
      setSelectExportMode(false);
      setSelectedDates(new Set());
    } catch (err) {
      setExportFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : '선택한 날짜 이미지를 저장하지 못했습니다.',
      });
    } finally {
      setExportingType(null);
    }
  };

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return (
    <section className="space-y-6">
      {/* Month Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="이전 달"
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-[#111315] hover:bg-[#F7F8FA] cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="연도 선택"
              className="text-xl sm:text-2xl font-bold text-[#111315] bg-transparent cursor-pointer focus:outline-none tabular-nums"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="월 선택"
              className="text-xl sm:text-2xl font-bold text-[#111315] bg-transparent cursor-pointer focus:outline-none tabular-nums"
            >
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="다음 달"
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-[#111315] hover:bg-[#F7F8FA] cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {(year !== todayYear || month !== todayMonth) && (
            <button
              type="button"
              onClick={() => {
                setYear(todayYear);
                setMonth(todayMonth);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#F7F8FA] border border-slate-200 text-xs font-medium text-[#5B616E] hover:text-[#111315] cursor-pointer"
            >
              오늘
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportMonth}
            disabled={exportingType !== null}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[#111315] text-xs sm:text-sm font-medium hover:bg-[#F7F8FA] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {exportingType === 'month' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-[#5B616E]" />
            )}
            <span>{exportingType === 'month' ? '저장 중...' : '월 전체 저장'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setExportFeedback(null);
              setSelectExportMode((prev) => {
                if (prev) setSelectedDates(new Set());
                return !prev;
              });
            }}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              selectExportMode
                ? 'border-[#111315] bg-[#111315] text-white'
                : 'border-slate-200 bg-white text-[#111315] hover:bg-[#F7F8FA]'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>날짜 선택 저장</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onAddLookOnDate(
                year === todayYear && month === todayMonth ? todayIso : `${monthKey}-01`
              )
            }
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#111315] text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>데일리룩 기록</span>
          </button>
        </div>
      </div>

      {/* Selection Export Bar */}
      {selectExportMode && (
        <div className="rounded-2xl border border-slate-200 bg-[#F7F8FA] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#111315]">
              사진으로 저장할 날짜를 선택하세요 ({selectedDates.size}일 선택)
            </p>
            <p className="text-xs text-[#5B616E]">
              1일 선택 시 단독 데일리룩 카드로, 2일 이상 선택 시 모바일용 모음 이미지로 저장됩니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentMonthLookDates.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAllMonthLooks}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#111315] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                {allCurrentMonthSelected ? '이달 선택 해제' : '이달 기록 전체'}
              </button>
            )}

            <button
              type="button"
              onClick={handleExportSelected}
              disabled={selectedDates.size === 0 || exportingType !== null}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {exportingType === 'selected' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {exportingType === 'selected'
                  ? '이미지 생성 중...'
                  : `${selectedDates.size}일 사진 저장`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectExportMode(false);
                setSelectedDates(new Set());
              }}
              aria-label="날짜 선택 닫기"
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-[#5B616E] hover:text-[#111315] cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Export Feedback Banner */}
      {exportFeedback && (
        <div
          className={`rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 border ${
            exportFeedback.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <span>{exportFeedback.text}</span>
          <button
            type="button"
            onClick={() => setExportFeedback(null)}
            aria-label="알림 닫기"
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        {/* Weekday Row */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-[#F7F8FA]/70">
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              className={`py-2.5 text-center text-xs font-semibold ${
                i === 0
                  ? 'text-rose-500'
                  : i === 6
                    ? 'text-[#2563EB]'
                    : 'text-[#5B616E]'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Date Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {calendarCells.map((cell) => {
            const dayLooks = looksByDate[cell.isoDate] || [];
            const primaryLook = dayLooks[0];
            const extraCount = dayLooks.length > 1 ? dayLooks.length - 1 : 0;
            const lookItems = primaryLook
              ? primaryLook.itemIds.map((id) => itemsById[id]).filter(Boolean)
              : [];
            const isToday = cell.isoDate === todayIso;
            const isSelected = selectExportMode && selectedDates.has(cell.isoDate);

            return (
              <div
                key={cell.isoDate}
                className={`min-h-[86px] sm:min-h-[124px] lg:min-h-[138px] p-1 sm:p-2 flex flex-col transition-colors ${
                  isSelected
                    ? 'bg-blue-50/50'
                    : cell.isCurrentMonth
                      ? 'bg-white'
                      : 'bg-[#FAFAFB] text-slate-300'
                } ${selectExportMode && !primaryLook ? 'opacity-45' : ''}`}
              >
                <div className="flex items-center justify-between px-0.5 mb-1">
                  <span
                    className={`text-[11px] sm:text-xs font-semibold tabular-nums inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full ${
                      isToday
                        ? 'bg-[#111315] text-white'
                        : cell.isCurrentMonth
                          ? 'text-[#111315]'
                          : 'text-slate-300'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {extraCount > 0 && (
                    <span className="text-[10px] font-semibold text-[#2563EB] tabular-nums">
                      +{extraCount}
                    </span>
                  )}
                </div>

                {primaryLook ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectExportMode) {
                        toggleDateSelection(cell.isoDate);
                      } else {
                        onSelectDateLooks(cell.isoDate, primaryLook.id);
                      }
                    }}
                    className={`group relative flex-1 w-full rounded-xl border bg-[#F8F9FB] overflow-hidden transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#111315] ring-2 ring-[#111315]/20'
                        : 'border-slate-200/80 hover:border-slate-400'
                    }`}
                    aria-label={
                      selectExportMode
                        ? `${cell.isoDate} 저장 날짜 ${isSelected ? '선택 해제' : '선택'}`
                        : `${cell.isoDate} 데일리룩 ${dayLooks.length}개 보기`
                    }
                    aria-pressed={selectExportMode ? isSelected : undefined}
                  >
                    <OutfitCollage items={lookItems} lookId={primaryLook.id} size="xs" />
                    {selectExportMode && (
                      <span
                        className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors shadow-sm ${
                          isSelected
                            ? 'bg-[#111315] text-white'
                            : 'bg-white/90 border border-slate-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                ) : selectExportMode ? (
                  <div className="flex-1 w-full rounded-xl" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onAddLookOnDate(cell.isoDate)}
                    aria-label={`${cell.isoDate} 데일리룩 추가`}
                    className="group flex-1 w-full rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 hover:bg-[#F7F8FA] transition-opacity cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly Most-Worn Summary Cards */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-5">
          {[
            {
              key: 'top-outer',
              label: '가장 많이 입은 상의/아우터',
              entry: monthlyStats.mostWornTopOrOuter,
            },
            {
              key: 'bottom',
              label: '가장 많이 입은 하의',
              entry: monthlyStats.mostWornBottom,
            },
            {
              key: 'shoes',
              label: '가장 많이 입은 신발',
              entry: monthlyStats.mostWornShoes,
            },
          ].map(({ key, label, entry }) =>
            entry ? (
              <button
                key={key}
                type="button"
                onClick={() => onSelectItem(entry.item.id)}
                className="group rounded-2xl bg-[#F7F8FA] border border-slate-200/70 p-3 sm:p-4 flex flex-col items-center justify-center text-center min-h-[124px] hover:border-slate-300 transition-colors cursor-pointer"
              >
                <div className="text-[11px] sm:text-xs font-medium text-[#5B616E] leading-snug break-keep">
                  {label}
                </div>
                <div className="mt-2 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
                  <GarmentVisual
                    item={entry.item}
                    className="w-full h-full group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="mt-1.5 text-[11px] sm:text-xs font-semibold text-[#111315] truncate max-w-full">
                  {entry.item.name}
                </div>
                <div className="mt-0.5 text-[10px] sm:text-[11px] font-medium text-[#5B616E] truncate max-w-full tabular-nums">
                  {entry.item.brand ? `${entry.item.brand} · ` : ''}
                  {entry.count}회
                </div>
              </button>
            ) : (
              <div
                key={key}
                className="rounded-2xl bg-[#F7F8FA] border border-slate-200/70 p-3 sm:p-4 flex flex-col items-center justify-center text-center min-h-[124px]"
              >
                <div className="text-[11px] sm:text-xs font-medium text-[#5B616E] leading-snug break-keep">
                  {label}
                </div>
                <div className="mt-3 text-xs text-slate-400">기록 없음</div>
              </div>
            )
          )}
        </div>
        <p className="text-center text-xs text-[#8A8F98]">
          {year}년 {month}월 기준 · 데일리룩 착용 기록이 자동으로 집계됩니다.
        </p>
      </div>
    </section>
  );
}
