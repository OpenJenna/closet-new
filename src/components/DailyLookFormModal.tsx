import { useMemo, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import {
  Category,
  DailyLook,
  TOP_CATEGORIES,
  WardrobeItem,
  WeatherCondition,
} from '../types/wardrobe';
import {
  CollageItemOffset,
  CollageOffsetsMap,
  UPPER_CATEGORIES,
  clearLookCustomArranged,
  getLookCustomOffsets,
  isLookCustomArranged,
  markLookCustomArranged,
  resolveLookItems,
  setLookCustomOffsets,
  sortItemIdsForLookbook,
} from '../utils/collageLayout';
import { getTodayIsoDate, getWeatherLabel } from '../utils/formatters';
import {
  buildWearRecencyIndex,
  sortItemsByDefaultOrder,
} from '../utils/wardrobeSort';
import { GarmentVisual } from './GarmentGraphic';
import { OutfitCollage } from './OutfitCollage';
import { WeatherIcon } from './WeatherIcon';

interface DailyLookFormModalProps {
  items: WardrobeItem[];
  itemsById: Record<string, WardrobeItem>;
  dailyLooks?: DailyLook[];
  initialLook?: DailyLook;
  presetDate?: string;
  presetItemIds?: string[];
  onClose: () => void;
  onSave: (
    data: Omit<DailyLook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    customOffsets?: CollageOffsetsMap
  ) => Promise<void>;
}

const WEATHER_OPTIONS: WeatherCondition[] = [
  'sunny',
  'partly_cloudy',
  'cloudy',
  'rainy',
  'snowy',
];

export function DailyLookFormModal({
  items,
  itemsById,
  dailyLooks = [],
  initialLook,
  presetDate,
  presetItemIds,
  onClose,
  onSave,
}: DailyLookFormModalProps) {
  const [date, setDate] = useState(
    initialLook?.date ?? presetDate ?? getTodayIsoDate()
  );
  const [title, setTitle] = useState(initialLook?.title ?? '');
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>(
    initialLook?.weatherCondition ?? 'sunny'
  );
  const [tempHigh, setTempHigh] = useState(String(initialLook?.tempHigh ?? 15));
  const [tempLow, setTempLow] = useState(String(initialLook?.tempLow ?? 6));
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => {
    const baseIds = initialLook?.itemIds ?? presetItemIds ?? [];
    const baseItems = baseIds.map((id) => itemsById[id]).filter(Boolean);
    return resolveLookItems(initialLook?.id, baseItems).map((it) => it.id);
  });
  const [didManualReorder, setDidManualReorder] = useState<boolean>(() =>
    isLookCustomArranged(initialLook?.id)
  );
  const [selectedPreviewItemId, setSelectedPreviewItemId] = useState<string | null>(
    null
  );
  const [draftOffsets, setDraftOffsets] = useState<CollageOffsetsMap>(() =>
    getLookCustomOffsets(initialLook?.id)
  );
  const [note, setNote] = useState(initialLook?.note ?? '');
  const [pickerCategory, setPickerCategory] = useState<'전체' | Category>('전체');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wearRecency = useMemo(
    () => buildWearRecencyIndex(dailyLooks),
    [dailyLooks]
  );

  const filteredPickerItems = useMemo(() => {
    const scoped =
      pickerCategory === '전체'
        ? items
        : items.filter((i) => i.category === pickerCategory);
    return sortItemsByDefaultOrder(scoped, wearRecency);
  }, [items, pickerCategory, wearRecency]);

  const selectedItems = useMemo(() => {
    return selectedItemIds.map((id) => itemsById[id]).filter(Boolean);
  }, [selectedItemIds, itemsById]);

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(itemId)) {
        if (selectedPreviewItemId === itemId) setSelectedPreviewItemId(null);
        return prev.filter((id) => id !== itemId);
      }
      if (prev.length >= 15) return prev;
      const next = [...prev, itemId];
      return didManualReorder
        ? next
        : sortItemIdsForLookbook(next, itemsById);
    });
  };

  const handlePreviewItemTap = (tappedId: string) => {
    if (selectedItems.length < 2) return;
    if (!selectedPreviewItemId) {
      setSelectedPreviewItemId(tappedId);
      return;
    }
    if (selectedPreviewItemId === tappedId) {
      setSelectedPreviewItemId(null);
      return;
    }
    const first = itemsById[selectedPreviewItemId];
    const second = itemsById[tappedId];
    if (
      !first ||
      !second ||
      UPPER_CATEGORIES.has(first.category) !== UPPER_CATEGORIES.has(second.category)
    ) {
      setSelectedPreviewItemId(tappedId);
      return;
    }
    setDidManualReorder(true);
    setSelectedItemIds((prev) => {
      const next = [...prev];
      const idxA = next.indexOf(selectedPreviewItemId);
      const idxB = next.indexOf(tappedId);
      if (idxA !== -1 && idxB !== -1) {
        [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
      }
      return next;
    });
    setDraftOffsets((prev) => {
      const next = { ...prev };
      delete next[selectedPreviewItemId];
      delete next[tappedId];
      return next;
    });
    setSelectedPreviewItemId(null);
  };

  const handlePreviewOffsetChange = (
    itemId: string,
    offset: CollageItemOffset
  ) => {
    setDraftOffsets((prev) => ({ ...prev, [itemId]: offset }));
    setSelectedPreviewItemId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItemIds.length === 0) {
      setError('옷장에서 최소 1개 이상의 아이템을 선택해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const activeSet = new Set(selectedItemIds);
      const prunedOffsets: CollageOffsetsMap = {};
      for (const [id, off] of Object.entries(draftOffsets)) {
        if (activeSet.has(id)) {
          prunedOffsets[id] = off;
        }
      }
      if (initialLook?.id) {
        if (didManualReorder) {
          markLookCustomArranged(initialLook.id);
        } else {
          clearLookCustomArranged(initialLook.id);
        }
        setLookCustomOffsets(initialLook.id, prunedOffsets);
      }
      await onSave(
        {
          date,
          title: title.trim() || undefined,
          weatherCondition,
          tempHigh: Number(tempHigh) || 0,
          tempLow: Number(tempLow) || 0,
          itemIds: selectedItemIds,
          note: note.trim() || undefined,
        },
        prunedOffsets
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-[#111315]">
            {initialLook ? '데일리룩 수정' : '데일리룩 기록하기'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Live Collage Preview, Selected Items Strip & Date/Weather */}
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-2">
                <div className="aspect-square w-full rounded-2xl border border-slate-200/80 bg-[#F8F9FB] overflow-hidden">
                  <OutfitCollage
                    items={selectedItems}
                    lookId={didManualReorder ? initialLook?.id : undefined}
                    size="md"
                    draggable={selectedItems.length >= 1}
                    itemOffsets={draftOffsets}
                    selectedItemId={selectedPreviewItemId}
                    onItemOffsetChange={handlePreviewOffsetChange}
                    onItemTap={selectedItems.length >= 2 ? handlePreviewItemTap : undefined}
                  />
                </div>
                {selectedItems.length >= 1 && (
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <p className="text-[11px] text-[#5B616E]">
                      {selectedPreviewItemId
                        ? `"${itemsById[selectedPreviewItemId]?.name ?? ''}" 선택됨 · 같은 줄의 다른 옷을 터치하면 자리가 바뀝니다.`
                        : '옷을 드래그해 위치를 조절하거나, 터치로 좌우 순서를 바꿀 수 있습니다.'}
                    </p>
                    {Object.keys(draftOffsets).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftOffsets({})}
                        className="shrink-0 px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-medium text-[#5B616E] hover:text-[#111315] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>위치 초기화</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Selected Items Horizontal Strip with 1-Tap Delete */}
                {selectedItems.length > 0 && (
                  <div className="rounded-xl bg-[#F4F5F7] border border-slate-200/70 p-2 space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-semibold text-[#5B616E] tabular-nums">
                        선택된 아이템 ({selectedItems.length}개)
                      </span>
                      <span className="text-[10px] text-[#8A8F98]">
                        X를 눌러 삭제
                      </span>
                    </div>
                    <div className="flex items-start gap-2 overflow-x-auto no-scrollbar pb-0.5">
                      {selectedItems.map((item) => (
                        <div
                          key={item.id}
                          className="relative shrink-0 w-16 flex flex-col items-center gap-1"
                        >
                          <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center overflow-hidden">
                            <GarmentVisual item={item} className="w-full h-full" />
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            aria-label={`${item.name} 삭제`}
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#111315] text-white shadow-sm flex items-center justify-center hover:bg-rose-600 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="w-full text-center text-[10px] text-[#5B616E] truncate">
                            {item.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5B616E] mb-1">
                    착용 날짜
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-[#111315] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5B616E] mb-1">
                    코디 제목 (선택)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 출근룩, 저녁 약속"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-[#111315]"
                  />
                </div>
              </div>

              {/* Weather & Temps */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#5B616E]">날씨 & 기온</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {WEATHER_OPTIONS.map((w) => {
                    const active = weatherCondition === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWeatherCondition(w)}
                        className={`py-2 px-1 rounded-xl border flex flex-col items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#111315] text-white border-[#111315]'
                            : 'bg-white text-[#5B616E] border-slate-200 hover:bg-[#F7F8FA]'
                        }`}
                      >
                        <WeatherIcon condition={w} className="w-4 h-4" />
                        <span>{getWeatherLabel(w)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5B616E] whitespace-nowrap">
                      최고 °C
                    </span>
                    <input
                      type="number"
                      value={tempHigh}
                      onChange={(e) => setTempHigh(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5B616E] whitespace-nowrap">
                      최저 °C
                    </span>
                    <input
                      type="number"
                      value={tempLow}
                      onChange={(e) => setTempLow(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5B616E] mb-1">
                  코디 메모
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="오늘 코디에 대한 메모를 남겨 보세요."
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-[#111315] resize-none"
                />
              </div>
            </div>

            {/* Right: Wardrobe Item Picker */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-[#111315]">
                  옷장에서 아이템 조합 선택
                </div>
                <span className="text-xs font-semibold text-[#2563EB] tabular-nums">
                  {selectedItemIds.length}개 선택됨
                </span>
              </div>

              {/* Category Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {(['전체', ...TOP_CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPickerCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      pickerCategory === cat
                        ? 'bg-[#111315] text-white'
                        : 'bg-[#F7F8FA] text-[#5B616E] hover:text-[#111315]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Picker Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                {filteredPickerItems.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`relative p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#111315] bg-[#F7F8FA] ring-1 ring-[#111315]'
                          : 'border-slate-200/80 bg-white hover:border-slate-300'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#111315] text-white flex items-center justify-center z-10">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                      <div className="aspect-square w-full rounded-lg bg-[#F8F9FB] p-1.5 flex items-center justify-center">
                        <GarmentVisual item={item} className="w-full h-full" />
                      </div>
                      <div className="mt-1.5 text-[10px] font-semibold text-[#111315] truncate">
                        {item.brand}
                      </div>
                      <div className="text-[11px] text-[#5B616E] truncate">
                        {item.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-[#5B616E] hover:bg-slate-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || selectedItemIds.length === 0}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-[#111315] text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              {saving ? '저장 중...' : initialLook ? '데일리룩 수정' : '데일리룩 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
