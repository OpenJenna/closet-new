import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Download,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { DailyLook, WardrobeItem } from '../types/wardrobe';
import { exportSingleDayLookImage } from '../utils/calendarExport';
import {
  CollageItemOffset,
  CollageOffsetsMap,
  UPPER_CATEGORIES,
  clearLookCustomArranged,
  clearLookCustomOffsets,
  clearLookItemOffsets,
  getLookCustomOffsets,
  isLookCustomArranged,
  markLookCustomArranged,
  resolveLookItems,
  setLookItemOffset,
  sortItemIdsForLookbook,
} from '../utils/collageLayout';
import {
  formatCurrencyKRW,
  formatKoreanFullDate,
  formatKoreanMonthDay,
  getWeatherLabel,
} from '../utils/formatters';
import { GarmentVisual } from './GarmentGraphic';
import { OutfitCollage } from './OutfitCollage';
import { WeatherIcon } from './WeatherIcon';

interface DailyLookDetailViewProps {
  date: string;
  looksOnDate: DailyLook[];
  initialLookId?: string;
  itemsById: Record<string, WardrobeItem>;
  onBack: () => void;
  onSelectItem: (itemId: string) => void;
  onAddNewLookOnDate: (date: string) => void;
  onEditLook: (look: DailyLook) => void;
  onUpdateLook?: (
    lookId: string,
    patch: Partial<Omit<DailyLook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
  onDeleteLook: (lookId: string) => Promise<void>;
}

export function DailyLookDetailView({
  date,
  looksOnDate,
  initialLookId,
  itemsById,
  onBack,
  onSelectItem,
  onAddNewLookOnDate,
  onEditLook,
  onUpdateLook,
  onDeleteLook,
}: DailyLookDetailViewProps) {
  const [selectedLookId, setSelectedLookId] = useState<string>(
    initialLookId && looksOnDate.some((l) => l.id === initialLookId)
      ? initialLookId
      : looksOnDate[0]?.id ?? ''
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [selectedArrangeItemId, setSelectedArrangeItemId] = useState<string | null>(
    null
  );
  const [arrangeFeedback, setArrangeFeedback] = useState<string | null>(null);
  const [removingItemMode, setRemovingItemMode] = useState(false);
  const [mutatingItems, setMutatingItems] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const activeLook =
    looksOnDate.find((l) => l.id === selectedLookId) ?? looksOnDate[0];

  const [customOffsets, setCustomOffsets] = useState<CollageOffsetsMap>(() =>
    getLookCustomOffsets(activeLook?.id)
  );

  useEffect(() => {
    setCustomOffsets(getLookCustomOffsets(activeLook?.id));
  }, [activeLook?.id]);

  if (!activeLook) {
    return (
      <section className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-[#111315] hover:text-[#2563EB] cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>달력으로 돌아가기</span>
        </button>

        <div className="py-16 px-4 text-center rounded-2xl bg-[#F7F8FA] border border-slate-200/80">
          <p className="text-base font-semibold text-[#111315]">
            {formatKoreanFullDate(date)}에 기록된 데일리룩이 없습니다.
          </p>
          <button
            type="button"
            onClick={() => onAddNewLookOnDate(date)}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#111315] text-white text-sm font-semibold cursor-pointer"
          >
            + {formatKoreanMonthDay(date)}에 새 데일리룩 추가
          </button>
        </div>
      </section>
    );
  }

  const rawLinkedItems = activeLook.itemIds
    .map((id) => itemsById[id])
    .filter(Boolean);
  const linkedItems = resolveLookItems(activeLook.id, rawLinkedItems);
  const customArranged = isLookCustomArranged(activeLook.id);
  const hasCustomOffsets = Object.keys(customOffsets).length > 0;

  const handleDelete = async () => {
    await onDeleteLook(activeLook.id);
    setConfirmDelete(false);
    if (looksOnDate.length <= 1) {
      onBack();
    }
  };

  const handleCollageItemTap = async (tappedId: string) => {
    if (!onUpdateLook || !activeLook || linkedItems.length < 2 || mutatingItems) {
      return;
    }
    setArrangeFeedback(null);

    if (!selectedArrangeItemId) {
      setSelectedArrangeItemId(tappedId);
      return;
    }

    if (selectedArrangeItemId === tappedId) {
      setSelectedArrangeItemId(null);
      return;
    }

    const firstItem = itemsById[selectedArrangeItemId];
    const secondItem = itemsById[tappedId];
    const sameTier =
      firstItem &&
      secondItem &&
      UPPER_CATEGORIES.has(firstItem.category) ===
        UPPER_CATEGORIES.has(secondItem.category);

    if (!sameTier) {
      setSelectedArrangeItemId(tappedId);
      setArrangeFeedback(
        '같은 줄(상의·아우터 줄 또는 하의·잡화 줄)의 다른 옷을 터치하면 좌우 배치가 바뀝니다.'
      );
      return;
    }

    const nextIds = linkedItems.map((it) => it.id);
    const idxA = nextIds.indexOf(selectedArrangeItemId);
    const idxB = nextIds.indexOf(tappedId);
    if (idxA !== -1 && idxB !== -1) {
      [nextIds[idxA], nextIds[idxB]] = [nextIds[idxB], nextIds[idxA]];
      setSelectedArrangeItemId(null);
      markLookCustomArranged(activeLook.id);
      setCustomOffsets(
        clearLookItemOffsets(activeLook.id, [selectedArrangeItemId, tappedId])
      );
      setMutatingItems(true);
      try {
        await onUpdateLook(activeLook.id, { itemIds: nextIds });
      } finally {
        setMutatingItems(false);
      }
    } else {
      setSelectedArrangeItemId(null);
    }
  };

  const handleNudgeSelectedItem = async (direction: -1 | 1) => {
    if (!onUpdateLook || !activeLook || !selectedArrangeItemId || mutatingItems) {
      return;
    }
    const selectedObj = itemsById[selectedArrangeItemId];
    if (!selectedObj) return;
    const isUpper = UPPER_CATEGORIES.has(selectedObj.category);
    const displayIds = linkedItems.map((it) => it.id);
    const sameTierIds = displayIds.filter((id) => {
      const it = itemsById[id];
      return it && UPPER_CATEGORIES.has(it.category) === isUpper;
    });
    const tierPos = sameTierIds.indexOf(selectedArrangeItemId);
    const neighborId = sameTierIds[tierPos + direction];
    if (!neighborId) return;

    const nextIds = [...displayIds];
    const idxA = nextIds.indexOf(selectedArrangeItemId);
    const idxB = nextIds.indexOf(neighborId);
    if (idxA !== -1 && idxB !== -1) {
      [nextIds[idxA], nextIds[idxB]] = [nextIds[idxB], nextIds[idxA]];
      markLookCustomArranged(activeLook.id);
      setCustomOffsets(
        clearLookItemOffsets(activeLook.id, [selectedArrangeItemId, neighborId])
      );
      setMutatingItems(true);
      try {
        await onUpdateLook(activeLook.id, { itemIds: nextIds });
      } finally {
        setMutatingItems(false);
      }
    }
  };

  const handleItemOffsetChange = (itemId: string, offset: CollageItemOffset) => {
    if (!activeLook) return;
    const next = setLookItemOffset(activeLook.id, itemId, offset);
    setCustomOffsets(next);
    setSelectedArrangeItemId(null);
    setArrangeFeedback(null);
  };

  const handleResetAutoOrder = async () => {
    if (!activeLook || mutatingItems) return;
    clearLookCustomArranged(activeLook.id);
    clearLookCustomOffsets(activeLook.id);
    setCustomOffsets({});
    setSelectedArrangeItemId(null);
    setArrangeFeedback(null);
    if (!onUpdateLook) return;
    const autoSorted = sortItemIdsForLookbook(activeLook.itemIds, itemsById);
    setMutatingItems(true);
    try {
      await onUpdateLook(activeLook.id, { itemIds: autoSorted });
    } finally {
      setMutatingItems(false);
    }
  };

  const handleRemoveItemFromLook = async (itemId: string) => {
    if (!onUpdateLook || !activeLook || linkedItems.length <= 1 || mutatingItems) {
      return;
    }
    const nextIds = linkedItems.map((it) => it.id).filter((id) => id !== itemId);
    if (nextIds.length === 0) return;
    if (selectedArrangeItemId === itemId) {
      setSelectedArrangeItemId(null);
    }
    setMutatingItems(true);
    try {
      await onUpdateLook(activeLook.id, { itemIds: nextIds });
      if (nextIds.length <= 1) {
        setRemovingItemMode(false);
      }
    } finally {
      setMutatingItems(false);
    }
  };

  const handleDownloadDayImage = async () => {
    setDownloadingImage(true);
    setDownloadMessage(null);
    try {
      await exportSingleDayLookImage({ look: activeLook, itemsById });
      setDownloadMessage({
        type: 'success',
        text: '데일리룩 이미지를 기기에 저장했습니다.',
      });
    } catch (err) {
      setDownloadMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : '데일리룩 이미지를 저장하지 못했습니다.',
      });
    } finally {
      setDownloadingImage(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[44px] px-2 -ml-2 text-sm font-medium text-[#111315] hover:text-[#2563EB] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>달력으로 돌아가기</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadDayImage}
            disabled={downloadingImage}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-[#111315] hover:bg-[#F7F8FA] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {downloadingImage ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{downloadingImage ? '저장 중...' : '사진 저장'}</span>
          </button>

          <button
            type="button"
            onClick={() => onEditLook(activeLook)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-[#111315] hover:bg-[#F7F8FA] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>편집</span>
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDelete}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-medium cursor-pointer"
              >
                삭제 확인
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-[#5B616E] cursor-pointer"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="데일리룩 삭제"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {downloadMessage && (
        <div
          className={`rounded-xl px-4 py-2 text-xs font-medium border ${
            downloadMessage.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {downloadMessage.text}
        </div>
      )}

      {/* Date & Weather Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-[#111315] tabular-nums">
            {formatKoreanFullDate(activeLook.date)}
          </h1>
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5B616E] tabular-nums">
            <WeatherIcon
              condition={activeLook.weatherCondition}
              className="w-4 h-4"
            />
            <span>{getWeatherLabel(activeLook.weatherCondition)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {activeLook.tempHigh} / {activeLook.tempLow}°C
            </span>
          </div>
        </div>

        {/* Multi-look Switcher if more than 1 look exists on this date */}
        {looksOnDate.length > 1 && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F3F4F6] self-start">
            {looksOnDate.map((lk, idx) => {
              const isCurrent = lk.id === activeLook.id;
              return (
                <button
                  key={lk.id}
                  type="button"
                  onClick={() => {
                    setSelectedLookId(lk.id);
                    setSelectedArrangeItemId(null);
                    setRemovingItemMode(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-white text-[#111315] shadow-sm'
                      : 'text-[#5B616E] hover:text-[#111315]'
                  }`}
                >
                  {lk.title ? lk.title : `코디 ${idx + 1}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Split: Lookbook Collage + Horizontal Item Strip Left, Details Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-6 space-y-3">
          <div className="aspect-square w-full max-h-[500px] rounded-2xl border border-slate-200/80 bg-[#F8F9FB] overflow-hidden">
            <OutfitCollage
              items={linkedItems}
              lookId={activeLook.id}
              size="lg"
              draggable
              itemOffsets={customOffsets}
              selectedItemId={selectedArrangeItemId}
              onItemOffsetChange={handleItemOffsetChange}
              onItemTap={
                onUpdateLook && linkedItems.length >= 2
                  ? (id) => void handleCollageItemTap(id)
                  : undefined
              }
            />
          </div>

          {/* Interactive Drag & Touch Arrangement Controls */}
          {linkedItems.length >= 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs text-[#5B616E]">
                {selectedArrangeItemId
                  ? arrangeFeedback ||
                    `"${itemsById[selectedArrangeItemId]?.name ?? ''}" 선택됨 · 바꿀 옷을 터치하세요.`
                  : linkedItems.length >= 2 && onUpdateLook
                    ? '옷을 드래그해 위치를 조절하거나, 터치해 좌우 배치를 바꿀 수 있습니다.'
                    : '옷을 드래그해 원하는 위치로 미세 조정할 수 있습니다.'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedArrangeItemId && onUpdateLook && (
                  <>
                    <button
                      type="button"
                      disabled={mutatingItems}
                      onClick={() => void handleNudgeSelectedItem(-1)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-[#111315] hover:bg-[#F7F8FA] cursor-pointer"
                    >
                      ← 왼쪽
                    </button>
                    <button
                      type="button"
                      disabled={mutatingItems}
                      onClick={() => void handleNudgeSelectedItem(1)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-[#111315] hover:bg-[#F7F8FA] cursor-pointer"
                    >
                      오른쪽 →
                    </button>
                    <button
                      type="button"
                      disabled={mutatingItems}
                      onClick={() =>
                        void handleRemoveItemFromLook(selectedArrangeItemId)
                      }
                      className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      이 옷 빼기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArrangeItemId(null);
                        setArrangeFeedback(null);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#5B616E] hover:text-[#111315] cursor-pointer"
                    >
                      완료
                    </button>
                  </>
                )}
                {!selectedArrangeItemId && (customArranged || hasCustomOffsets) && (
                  <button
                    type="button"
                    disabled={mutatingItems}
                    onClick={() => void handleResetAutoOrder()}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-[#5B616E] hover:text-[#111315] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>자동 배치</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Horizontal Scrollable Item Strip directly beneath the Daily Look (Matching IMG_7481) */}
          <div className="rounded-2xl bg-[#F4F5F7] border border-slate-200/70 p-2.5 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-[#5B616E] tabular-nums">
                룩 구성 아이템 ({linkedItems.length}개)
              </span>
              {onUpdateLook && linkedItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRemovingItemMode((prev) => !prev)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    removingItemMode
                      ? 'bg-[#111315] text-white'
                      : 'text-[#5B616E] hover:text-[#111315]'
                  }`}
                >
                  {removingItemMode ? '편집 완료' : '아이템 빼기'}
                </button>
              )}
            </div>

            <div className="flex items-start gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
              {linkedItems.map((item) => (
                <div
                  key={item.id}
                  className="relative shrink-0 w-[76px] sm:w-[84px] flex flex-col items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] rounded-xl bg-white border border-slate-200/90 p-1.5 flex items-center justify-center hover:border-[#111315] transition-colors cursor-pointer overflow-hidden"
                  >
                    <GarmentVisual item={item} className="w-full h-full" />
                  </button>
                  {removingItemMode && onUpdateLook && linkedItems.length > 1 && (
                    <button
                      type="button"
                      disabled={mutatingItems}
                      onClick={() => void handleRemoveItemFromLook(item.id)}
                      aria-label={`${item.name} 데일리룩에서 삭제`}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white shadow-sm flex items-center justify-center hover:bg-rose-700 cursor-pointer z-10"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <span className="w-full text-center text-[10px] font-medium text-[#5B616E] truncate px-0.5">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-6">
          <div>
            {activeLook.title && (
              <h2 className="text-lg font-bold text-[#111315]">
                {activeLook.title}
              </h2>
            )}
            {activeLook.note && (
              <p className="mt-1.5 text-sm text-[#5B616E] leading-relaxed">
                {activeLook.note}
              </p>
            )}
          </div>

          {/* Detailed Linked Wardrobe Items Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#111315]">
                착용 아이템{' '}
                <span className="tabular-nums text-[#5B616E] font-medium">
                  ({linkedItems.length}개)
                </span>
              </h3>
              <span className="text-xs text-[#8A8F98]">
                아이템을 누르면 옷장 상세로 이동합니다
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {linkedItems.map((item) => (
                <div key={item.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="w-full p-2.5 rounded-xl border border-slate-200/80 bg-white hover:border-slate-400 text-left transition-all cursor-pointer"
                  >
                    <div className="aspect-square w-full rounded-lg bg-[#F7F8FA] p-2 flex items-center justify-center overflow-hidden">
                      <GarmentVisual
                        item={item}
                        className="w-full h-full group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="mt-2">
                      <div className="text-[11px] font-semibold text-[#111315] truncate">
                        {item.brand}
                      </div>
                      <div className="text-xs text-[#5B616E] truncate">
                        {item.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#8A8F98] tabular-nums">
                        {item.category} · {formatCurrencyKRW(item.price)}
                      </div>
                    </div>
                  </button>
                  {removingItemMode && onUpdateLook && linkedItems.length > 1 && (
                    <button
                      type="button"
                      disabled={mutatingItems}
                      onClick={() => void handleRemoveItemFromLook(item.id)}
                      aria-label={`${item.name} 삭제`}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-600 text-white shadow-sm flex items-center justify-center hover:bg-rose-700 cursor-pointer z-10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add another look on the same date */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onAddNewLookOnDate(activeLook.date)}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FA] hover:bg-slate-100 text-sm font-semibold text-[#111315] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4 text-[#5B616E]" />
              <span>{formatKoreanMonthDay(activeLook.date)}에 새 데일리룩 추가</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
