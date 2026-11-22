import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  Crop,
  ExternalLink,
  ImagePlus,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { DailyLook, WardrobeItem } from '../types/wardrobe';
import {
  formatCurrencyKRW,
  formatKoreanFullDate,
  formatPaddedDotDate,
} from '../utils/formatters';
import {
  compressDataUrlImage,
  compressImageFile,
} from '../utils/imageCompression';
import {
  PinterestRecommendation,
  buildLocalPinterestRecommendations,
  fetchPinterestRecommendations,
} from '../utils/pinterestRecommendations';
import {
  getColorCoordinationPlan,
  getReadableSwatchTextColor,
} from '../utils/colorCoordination';
import { GarmentVisual } from './GarmentGraphic';
import { ImageCropModal } from './ImageCropModal';
import { OutfitCollage } from './OutfitCollage';
import { WeatherIcon } from './WeatherIcon';

interface ItemDetailViewProps {
  item: WardrobeItem;
  allItemsById: Record<string, WardrobeItem>;
  linkedLooks: DailyLook[];
  todayIso: string;
  todayLooks: DailyLook[];
  onBack: () => void;
  onEditItem: (item: WardrobeItem) => void;
  onUpdateItem: (
    id: string,
    patch: Partial<Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onSelectLook: (lookId: string) => void;
  onSelectItem?: (itemId: string) => void;
  onCreateLookWithItem: (itemId: string) => void;
  onCreateLookWithItems?: (itemIds: string[]) => void;
  onAddItemToLook: (lookId: string, itemId: string) => Promise<void>;
  onCreateTodayLookWithItem: (itemId: string) => Promise<DailyLook>;
}

export function ItemDetailView({
  item,
  allItemsById,
  linkedLooks,
  todayIso,
  todayLooks,
  onBack,
  onEditItem,
  onUpdateItem,
  onDeleteItem,
  onSelectLook,
  onSelectItem,
  onCreateLookWithItem,
  onCreateLookWithItems,
  onAddItemToLook,
  onCreateTodayLookWithItem,
}: ItemDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'coordi'>('info');
  const [selectedColorCombo, setSelectedColorCombo] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState(item.memo || '');
  const [memoSavedNotice, setMemoSavedNotice] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [extraCropTarget, setExtraCropTarget] = useState<
    | { kind: 'upload'; sourceUrl: string }
    | { kind: 'edit'; index: number; sourceUrl: string }
    | null
  >(null);
  const [addingToDailyLook, setAddingToDailyLook] = useState(false);
  const [todayPickerOpen, setTodayPickerOpen] = useState(false);
  const [dailyLookFeedback, setDailyLookFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    lookId?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [recommendations, setRecommendations] = useState<PinterestRecommendation[]>(() =>
    buildLocalPinterestRecommendations(item)
  );
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recSource, setRecSource] = useState<'ai' | 'local'>('local');

  const loadRecommendations = async (forceRefresh = false, signal?: AbortSignal) => {
    setLoadingRecs(true);
    try {
      const result = await fetchPinterestRecommendations(item, {
        forceRefresh,
        signal,
      });
      setRecommendations(result.recommendations);
      setRecSource(result.source);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setRecommendations(buildLocalPinterestRecommendations(item));
      setRecSource('local');
    } finally {
      if (!signal?.aborted) {
        setLoadingRecs(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRecommendations(false, controller.signal);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.category, item.subCategory, item.colorName, item.pattern, item.name]);

  const linkedLookCount = linkedLooks.length;
  const wearCount = Math.max(0, linkedLookCount + (item.wearCountOffset ?? 0));
  const costPerWear = wearCount > 0 ? Math.round(item.price / wearCount) : 0;

  const [editingWearCount, setEditingWearCount] = useState(false);
  const [wearCountDraft, setWearCountDraft] = useState(String(wearCount));
  const [savingWearCount, setSavingWearCount] = useState(false);

  const openWearCountEditor = () => {
    setWearCountDraft(String(wearCount));
    setEditingWearCount(true);
  };

  const handleSaveWearCount = async (nextTarget?: number) => {
    const parsed =
      nextTarget !== undefined
        ? nextTarget
        : Math.max(0, Math.min(10000, Math.round(Number(wearCountDraft) || 0)));
    const nextOffset = parsed - linkedLookCount;
    setSavingWearCount(true);
    try {
      await onUpdateItem(item.id, { wearCountOffset: nextOffset });
      setEditingWearCount(false);
    } finally {
      setSavingWearCount(false);
    }
  };

  const sortedLinkedLooks = useMemo(() => {
    return [...linkedLooks].sort((a, b) => b.date.localeCompare(a.date));
  }, [linkedLooks]);

  const colorPlan = useMemo(
    () => getColorCoordinationPlan(item),
    [item]
  );

  const matchingWardrobeItemsByColor = useMemo(() => {
    const partnerCatSet = new Set(colorPlan.partnerCategories);
    const map: Record<string, WardrobeItem[]> = {};
    const allItems = Object.values(allItemsById);
    for (const rec of colorPlan.recommendations) {
      const matchSet = new Set(rec.matchColorNames);
      map[rec.colorName] = allItems.filter(
        (candidate) =>
          candidate.id !== item.id &&
          partnerCatSet.has(candidate.category) &&
          matchSet.has(candidate.colorName)
      );
    }
    return map;
  }, [allItemsById, colorPlan, item.id]);

  const handleRating = async (stars: number) => {
    await onUpdateItem(item.id, { rating: stars });
  };

  const handleToggleBasic = async () => {
    await onUpdateItem(item.id, { isBasicCloset: !item.isBasicCloset });
  };

  const handleSaveMemo = async () => {
    if (memoDraft === (item.memo || '')) return;
    await onUpdateItem(item.id, { memo: memoDraft });
    setMemoSavedNotice(true);
    setTimeout(() => setMemoSavedNotice(false), 1800);
  };

  const handleAddExtraImages = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentExtras = item.additionalImages || [];
    const remainingSlots = Math.max(0, 6 - currentExtras.length);
    if (remainingSlots === 0) return;

    setUploadingExtra(true);
    try {
      if (files.length === 1) {
        const rawUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(files[0]);
        });
        setExtraCropTarget({ kind: 'upload', sourceUrl: rawUrl });
        return;
      }

      const compressed: string[] = [];
      for (const file of files.slice(0, remainingSlots)) {
        const url = await compressImageFile(file, 640, 0.78);
        compressed.push(url);
      }
      await onUpdateItem(item.id, {
        additionalImages: [...currentExtras, ...compressed],
      });
    } finally {
      setUploadingExtra(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmExtraCrop = async (croppedUrl: string) => {
    const target = extraCropTarget;
    if (!target) return;
    setExtraCropTarget(null);
    setUploadingExtra(true);
    try {
      const currentExtras = item.additionalImages || [];
      if (target.kind === 'upload') {
        await onUpdateItem(item.id, {
          additionalImages: [...currentExtras, croppedUrl].slice(0, 6),
        });
      } else {
        await onUpdateItem(item.id, {
          additionalImages: currentExtras.map((img, i) =>
            i === target.index ? croppedUrl : img
          ),
        });
      }
    } finally {
      setUploadingExtra(false);
    }
  };

  const handleUseOriginalExtraCrop = async () => {
    const target = extraCropTarget;
    if (!target || target.kind !== 'upload') {
      setExtraCropTarget(null);
      return;
    }
    setExtraCropTarget(null);
    setUploadingExtra(true);
    try {
      const compressed = await compressDataUrlImage(target.sourceUrl, 640, 0.78);
      const currentExtras = item.additionalImages || [];
      await onUpdateItem(item.id, {
        additionalImages: [...currentExtras, compressed].slice(0, 6),
      });
    } finally {
      setUploadingExtra(false);
    }
  };

  const handleRemoveExtraImage = async (index: number) => {
    const next = (item.additionalImages || []).filter((_, i) => i !== index);
    await onUpdateItem(item.id, { additionalImages: next });
  };

  const handleDelete = async () => {
    await onDeleteItem(item.id);
    onBack();
  };

  useEffect(() => {
    if (!dailyLookFeedback || dailyLookFeedback.type !== 'success') return;
    const timer = window.setTimeout(() => setDailyLookFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [dailyLookFeedback]);

  const handleQuickAddToTodayLook = async () => {
    if (addingToDailyLook) return;
    setDailyLookFeedback(null);

    if (todayLooks.length === 0) {
      setAddingToDailyLook(true);
      try {
        const created = await onCreateTodayLookWithItem(item.id);
        setDailyLookFeedback({
          type: 'success',
          text: `${formatKoreanFullDate(todayIso)} 데일리룩을 만들고 이 아이템을 추가했습니다.`,
          lookId: created.id,
        });
      } catch (err) {
        setDailyLookFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : '오늘의 데일리룩에 추가하지 못했습니다.',
        });
      } finally {
        setAddingToDailyLook(false);
      }
      return;
    }

    if (todayLooks.length === 1) {
      const target = todayLooks[0];
      if (target.itemIds.includes(item.id)) {
        setDailyLookFeedback({
          type: 'info',
          text: '오늘의 데일리룩에 이미 포함된 아이템입니다.',
          lookId: target.id,
        });
        return;
      }
      if (target.itemIds.length >= 15) {
        setDailyLookFeedback({
          type: 'error',
          text: '한 데일리룩에는 최대 15개 아이템까지 추가할 수 있습니다.',
          lookId: target.id,
        });
        return;
      }

      setAddingToDailyLook(true);
      try {
        await onAddItemToLook(target.id, item.id);
        setDailyLookFeedback({
          type: 'success',
          text: `${target.title ? `'${target.title}'` : '오늘의 데일리룩'}에 추가했습니다.`,
          lookId: target.id,
        });
      } catch (err) {
        setDailyLookFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : '오늘의 데일리룩에 추가하지 못했습니다.',
        });
      } finally {
        setAddingToDailyLook(false);
      }
      return;
    }

    setTodayPickerOpen(true);
  };

  const handlePickTodayLook = async (look: DailyLook) => {
    if (addingToDailyLook) return;
    if (look.itemIds.includes(item.id)) {
      setTodayPickerOpen(false);
      setDailyLookFeedback({
        type: 'info',
        text: `'${look.title || '선택한 데일리룩'}'에 이미 포함된 아이템입니다.`,
        lookId: look.id,
      });
      return;
    }
    if (look.itemIds.length >= 15) {
      setTodayPickerOpen(false);
      setDailyLookFeedback({
        type: 'error',
        text: '한 데일리룩에는 최대 15개 아이템까지 추가할 수 있습니다.',
        lookId: look.id,
      });
      return;
    }

    setAddingToDailyLook(true);
    try {
      await onAddItemToLook(look.id, item.id);
      setTodayPickerOpen(false);
      setDailyLookFeedback({
        type: 'success',
        text: `${look.title ? `'${look.title}'` : '선택한 데일리룩'}에 이 아이템을 추가했습니다.`,
        lookId: look.id,
      });
    } catch (err) {
      setDailyLookFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : '데일리룩에 추가하지 못했습니다.',
      });
    } finally {
      setAddingToDailyLook(false);
    }
  };

  const handleCreateAnotherTodayLook = async () => {
    if (addingToDailyLook) return;
    setAddingToDailyLook(true);
    try {
      const created = await onCreateTodayLookWithItem(item.id);
      setTodayPickerOpen(false);
      setDailyLookFeedback({
        type: 'success',
        text: '오늘의 새 데일리룩을 만들고 이 아이템을 추가했습니다.',
        lookId: created.id,
      });
    } catch (err) {
      setDailyLookFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : '오늘의 새 데일리룩을 만들지 못했습니다.',
      });
    } finally {
      setAddingToDailyLook(false);
    }
  };

  const infoRows: { label: string; value: React.ReactNode }[] = [
    {
      label: '계절',
      value: item.seasons.join(', '),
    },
    {
      label: 'TPO',
      value: item.tpo || '데일리',
    },
    {
      label: '카테고리',
      value: `${item.category} > ${item.subCategory}`,
    },
    {
      label: '색상',
      value: (
        <span className="inline-flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full border border-slate-300 inline-block"
            style={{ backgroundColor: item.colorHex }}
          />
          <span>{item.colorName}</span>
        </span>
      ),
    },
    {
      label: '브랜드',
      value: item.brand,
    },
    {
      label: '구매',
      value: (
        <span className="tabular-nums">
          {formatCurrencyKRW(item.price)}, {formatPaddedDotDate(item.purchaseDate)}
        </span>
      ),
    },
    {
      label: '소재',
      value: item.material || '미입력',
    },
    {
      label: '패턴',
      value: item.pattern || '무지',
    },
    {
      label: '사이즈',
      value: item.size || 'FREE',
    },
  ];

  const extraImages = item.additionalImages || [];

  return (
    <section className="space-y-6">
      {/* Top Sub-bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[44px] px-2 -ml-2 text-sm font-medium text-[#111315] hover:text-[#2563EB] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>옷장으로 돌아가기</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={addingToDailyLook}
            onClick={handleQuickAddToTodayLook}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#111315] text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            {addingToDailyLook ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{addingToDailyLook ? '추가 중...' : '데일리 룩에 추가'}</span>
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDelete}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-medium hover:bg-red-700 cursor-pointer"
              >
                삭제 확인
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-[#5B616E] hover:bg-slate-50 cursor-pointer"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="아이템 삭제"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner for Daily Look Quick Add */}
      {dailyLookFeedback && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium flex flex-wrap items-center justify-between gap-3 border ${
            dailyLookFeedback.type === 'success'
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
              : dailyLookFeedback.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-[#F7F8FA] border-slate-200 text-[#111315]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {dailyLookFeedback.type === 'success' && (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{dailyLookFeedback.text}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dailyLookFeedback.type === 'info' && (
              <button
                type="button"
                disabled={addingToDailyLook}
                onClick={handleCreateAnotherTodayLook}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#111315] hover:bg-slate-50 cursor-pointer"
              >
                + 오늘 새 코디로 추가
              </button>
            )}
            {dailyLookFeedback.lookId && (
              <button
                type="button"
                onClick={() => onSelectLook(dailyLookFeedback.lookId!)}
                className="px-3 py-1.5 rounded-lg bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
              >
                데일리룩 보기
              </button>
            )}
            <button
              type="button"
              onClick={() => setDailyLookFeedback(null)}
              aria-label="알림 닫기"
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Split Layout (Desktop 2-col, Mobile stacked) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Showcase Column */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto no-scrollbar space-y-4">
          <div className="relative aspect-square w-full rounded-2xl bg-[#F7F8FA] border border-slate-200/80 p-8 flex items-center justify-center overflow-hidden">
            <GarmentVisual item={item} className="w-full h-full max-h-[340px]" />
            <button
              type="button"
              onClick={() => onEditItem(item)}
              className="absolute right-4 bottom-4 min-h-[40px] px-3.5 py-2 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 text-xs font-semibold text-[#111315] shadow-sm hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>편집</span>
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold tracking-wide text-[#5B616E]">
              {item.brand}
            </div>
            <h1 className="mt-1 text-xl font-bold text-[#111315] text-balance">
              {item.name}
            </h1>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-[#5B616E]">
              <span>
                {item.category} &gt; {item.subCategory}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                등록 {formatPaddedDotDate(item.purchaseDate)}
              </span>
            </div>
          </div>

          {/* Info | Coordi Segmented Switcher */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#F3F4F6] border border-slate-200/60">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`min-h-[42px] rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'info'
                  ? 'bg-white text-[#111315] shadow-sm'
                  : 'text-[#5B616E] hover:text-[#111315]'
              }`}
            >
              정보
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('coordi')}
              className={`min-h-[42px] rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'coordi'
                  ? 'bg-white text-[#111315] shadow-sm'
                  : 'text-[#5B616E] hover:text-[#111315]'
              }`}
            >
              코디 <span className="tabular-nums text-xs opacity-75">({linkedLookCount})</span>
            </button>
          </div>
        </div>

        {/* Right Detail Content Column */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === 'info' ? (
            <>
              {/* Basic Closet + Star Rating Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleBasic}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      item.isBasicCloset
                        ? 'bg-[#111315] text-white border-[#111315]'
                        : 'bg-white text-[#5B616E] border-slate-200 hover:text-[#111315]'
                    }`}
                  >
                    {item.isBasicCloset ? '기본옷장 아이템' : '기본옷장으로 지정'}
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[#5B616E] mr-1">
                    나의 평가
                  </span>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const filled = (item.rating || 0) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleRating(star)}
                        aria-label={`${star}점`}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            filled
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3-Column Cost-Per-Wear KPI Strip (Matching IMG_7415) */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 rounded-2xl bg-[#F7F8FA] border border-slate-200/70 divide-x divide-slate-200/80">
                  <div className="p-4 sm:p-5 text-center">
                    <div className="text-xs font-medium text-[#5B616E]">구매 가격</div>
                    <div className="mt-1.5 text-base sm:text-xl font-bold text-[#111315] tabular-nums">
                      {formatCurrencyKRW(item.price)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      editingWearCount
                        ? setEditingWearCount(false)
                        : openWearCountEditor()
                    }
                    className="p-4 sm:p-5 text-center hover:bg-white/70 transition-colors cursor-pointer group"
                    aria-label="착용 횟수 수정"
                  >
                    <div className="text-xs font-medium text-[#5B616E] inline-flex items-center justify-center gap-1">
                      <span>착용 횟수</span>
                      <Pencil className="w-3 h-3 text-[#8A8F98] group-hover:text-[#2563EB] transition-colors" />
                    </div>
                    <div className="mt-1.5 text-base sm:text-xl font-bold text-[#111315] tabular-nums">
                      {wearCount}회
                    </div>
                    {wearCount !== linkedLookCount && (
                      <div className="mt-0.5 text-[10px] text-[#8A8F98] tabular-nums">
                        코디 {linkedLookCount}회
                      </div>
                    )}
                  </button>
                  <div className="p-4 sm:p-5 text-center">
                    <div className="text-xs font-medium text-[#5B616E]">착용당 비용</div>
                    <div className="mt-1.5 text-base sm:text-xl font-bold text-[#2563EB] tabular-nums">
                      {formatCurrencyKRW(costPerWear)}
                    </div>
                  </div>
                </div>

                {editingWearCount && (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#111315] whitespace-nowrap">
                        착용 횟수 수정
                      </span>
                      <div className="inline-flex items-center rounded-xl border border-slate-200 bg-[#F7F8FA] overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setWearCountDraft((prev) =>
                              String(Math.max(0, (Math.round(Number(prev) || 0) - 1)))
                            )
                          }
                          aria-label="착용 횟수 1 감소"
                          className="w-9 h-9 flex items-center justify-center text-[#5B616E] hover:bg-slate-200/70 hover:text-[#111315] transition-colors cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={wearCountDraft}
                          onChange={(e) => setWearCountDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSaveWearCount();
                            } else if (e.key === 'Escape') {
                              setEditingWearCount(false);
                            }
                          }}
                          aria-label="착용 횟수 입력"
                          className="w-16 h-9 bg-white text-center text-sm font-bold text-[#111315] tabular-nums focus:outline-none border-x border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setWearCountDraft((prev) =>
                              String(
                                Math.min(10000, (Math.round(Number(prev) || 0) + 1))
                              )
                            )
                          }
                          aria-label="착용 횟수 1 증가"
                          className="w-9 h-9 flex items-center justify-center text-[#5B616E] hover:bg-slate-200/70 hover:text-[#111315] transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-xs text-[#5B616E]">회</span>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      {wearCount !== linkedLookCount && (
                        <button
                          type="button"
                          disabled={savingWearCount}
                          onClick={() => void handleSaveWearCount(linkedLookCount)}
                          className="px-2.5 h-8 rounded-lg text-[11px] font-medium text-[#5B616E] hover:text-[#111315] hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          코디 기준({linkedLookCount}회)
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={savingWearCount}
                        onClick={() => setEditingWearCount(false)}
                        className="px-3 h-8 rounded-lg border border-slate-200 bg-white text-xs font-medium text-[#5B616E] hover:text-[#111315] transition-colors cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        disabled={savingWearCount}
                        onClick={() => void handleSaveWearCount()}
                        className="px-3.5 h-8 rounded-lg bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {savingWearCount ? '저장 중' : '저장'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Structured Attributes List (Matching IMG_7414) */}
              <div className="rounded-2xl border border-slate-200/80 bg-white divide-y divide-slate-100">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <h2 className="text-sm font-bold text-[#111315]">아이템 정보</h2>
                  <button
                    type="button"
                    onClick={() => onEditItem(item)}
                    className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                  >
                    정보 수정
                  </button>
                </div>
                {infoRows.map((row) => (
                  <div
                    key={row.label}
                    onClick={() => onEditItem(item)}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-[#F7F8FA]/70 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-medium text-[#5B616E]">
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold text-[#111315] text-right">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Additional Images Gallery (Matching IMG_7415 & IMG_7416) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[#111315]">추가 이미지</h2>
                    <p className="text-xs text-[#5B616E] mt-0.5">
                      착용 사진, 구매 영수증, 디테일 컷을 최대 6장까지 저장하세요.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-[#8A8F98] tabular-nums">
                    {extraImages.length} / 6
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAddExtraImages}
                  className="hidden"
                />

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {extraImages.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl border border-slate-200 bg-[#F7F8FA] overflow-hidden group"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxImage(imgUrl)}
                        className="w-full h-full cursor-zoom-in"
                      >
                        <img
                          src={imgUrl}
                          alt={`${item.name} 추가 이미지 ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExtraCropTarget({
                            kind: 'edit',
                            index: idx,
                            sourceUrl: imgUrl,
                          })
                        }
                        aria-label="이미지 자르기"
                        title="사진 자르기"
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                      >
                        <Crop className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExtraImage(idx)}
                        aria-label="이미지 삭제"
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {extraImages.length < 6 && (
                    <button
                      type="button"
                      disabled={uploadingExtra}
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border border-dashed border-slate-300 bg-[#F7F8FA] hover:bg-slate-100 hover:border-slate-400 flex flex-col items-center justify-center gap-1.5 text-[#5B616E] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-xs font-medium">
                        {uploadingExtra ? '업로드 중...' : '추가'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Memo Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="item-memo"
                    className="text-sm font-bold text-[#111315]"
                  >
                    메모
                  </label>
                  {memoSavedNotice && (
                    <span className="text-xs font-medium text-emerald-600">
                      저장됨
                    </span>
                  )}
                </div>
                <textarea
                  id="item-memo"
                  rows={3}
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  onBlur={handleSaveMemo}
                  placeholder="세탁 방법, 핏감, 매치 팁 등을 자유롭게 기록하세요."
                  className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-sm text-[#111315] placeholder:text-slate-400 focus:outline-none focus:border-slate-400 resize-y"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveMemo}
                    disabled={memoDraft === (item.memo || '')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#111315] text-white disabled:opacity-30 cursor-pointer"
                  >
                    메모 저장
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Coordi Tab: 1) Daily Looks Using This Item -> 2) Color Combination Guide -> 3) Pinterest Recommendations */
            <div className="space-y-7">
              {/* 1. Daily Looks Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#111315]">
                      이 옷으로 만든 데일리룩
                    </h2>
                    <p className="text-xs text-[#5B616E] mt-0.5 tabular-nums">
                      총 {sortedLinkedLooks.length}개의 데일리룩 기록이 연결되어 있습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateLookWithItem(item.id)}
                    className="px-3.5 py-2 rounded-xl bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    + 새 코디 만들기
                  </button>
                </div>

                {sortedLinkedLooks.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-2xl bg-[#F7F8FA] border border-slate-200/70">
                    <p className="text-sm font-medium text-[#111315]">
                      아직 이 옷으로 기록된 데일리룩이 없습니다.
                    </p>
                    <p className="mt-1 text-xs text-[#5B616E]">
                      이 아이템이 포함된 오늘의 데일리룩을 기록해 보세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => onCreateLookWithItem(item.id)}
                      className="mt-4 px-4 py-2 rounded-xl bg-[#111315] text-white text-xs font-semibold cursor-pointer"
                    >
                      + 이 옷으로 데일리룩 추가
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {sortedLinkedLooks.map((look) => {
                      const lookItems = look.itemIds
                        .map((id) => allItemsById[id])
                        .filter(Boolean);
                      return (
                        <button
                          key={look.id}
                          type="button"
                          onClick={() => onSelectLook(look.id)}
                          className="group text-left focus:outline-none cursor-pointer"
                        >
                          <div className="aspect-square w-full rounded-2xl border border-slate-200/80 bg-[#F8F9FB] overflow-hidden transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:border-slate-300">
                            <OutfitCollage items={lookItems} lookId={look.id} size="sm" />
                          </div>
                          <div className="mt-2 px-0.5 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111315] tabular-nums">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">
                                {formatKoreanFullDate(look.date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-[#5B616E] tabular-nums">
                              <WeatherIcon
                                condition={look.weatherCondition}
                                className="w-3.5 h-3.5"
                              />
                              <span>
                                {look.tempHigh} / {look.tempLow}°C
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{lookItems.length}개 아이템</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200/70" />

              {/* 2. Color Pairing Square Cards */}
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#111315]">
                      {colorPlan.heading}
                    </h2>
                    <p className="text-xs text-[#5B616E] mt-0.5">
                      {colorPlan.subheading}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7F8FA] border border-slate-200/80 shrink-0">
                    <span
                      className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                      style={{ backgroundColor: item.colorHex }}
                    />
                    <span className="text-[11px] font-semibold text-[#111315] whitespace-nowrap">
                      {item.colorName}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {colorPlan.recommendations.map((rec) => {
                    const topHex = colorPlan.currentOnTop ? item.colorHex : rec.colorHex;
                    const bottomHex = colorPlan.currentOnTop ? rec.colorHex : item.colorHex;
                    const topLabel = colorPlan.currentOnTop
                      ? colorPlan.currentRoleLabel
                      : colorPlan.partnerLabel;
                    const bottomLabel = colorPlan.currentOnTop
                      ? colorPlan.partnerLabel
                      : colorPlan.currentRoleLabel;
                    const topText = getReadableSwatchTextColor(topHex);
                    const bottomText = getReadableSwatchTextColor(bottomHex);
                    const ownedMatches = matchingWardrobeItemsByColor[rec.colorName] || [];
                    const isSelected = selectedColorCombo === rec.colorName;

                    return (
                      <button
                        key={rec.colorName}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedColorCombo((prev) =>
                            prev === rec.colorName ? null : rec.colorName
                          )
                        }
                        className={`group text-left rounded-2xl border bg-white overflow-hidden transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#111315] ring-2 ring-[#111315]/15 shadow-xs'
                            : 'border-slate-200/80 hover:border-slate-300 hover:-translate-y-0.5'
                        }`}
                      >
                        {/* Square Two-Tone Outfit Color Block */}
                        <div className="aspect-square w-full flex flex-col relative overflow-hidden">
                          <div
                            className="h-[44%] w-full px-2.5 py-2 flex items-start justify-between"
                            style={{ backgroundColor: topHex }}
                          >
                            <span
                              className="text-[10px] font-semibold tracking-tight opacity-80"
                              style={{ color: topText }}
                            >
                              {topLabel}
                            </span>
                            {ownedMatches.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur-xs text-[10px] font-semibold text-white tabular-nums">
                                보유 {ownedMatches.length}
                              </span>
                            )}
                          </div>
                          <div
                            className="h-[56%] w-full px-2.5 py-2 flex items-end justify-between border-t border-black/8"
                            style={{ backgroundColor: bottomHex }}
                          >
                            <span
                              className="text-[10px] font-semibold tracking-tight opacity-85"
                              style={{ color: bottomText }}
                            >
                              {bottomLabel}
                            </span>
                            <span
                              className="text-[10px] font-medium opacity-75 truncate max-w-[70%]"
                              style={{ color: bottomText }}
                            >
                              {colorPlan.currentOnTop ? rec.colorName : item.colorName}
                            </span>
                          </div>
                        </div>

                        {/* Card Caption */}
                        <div className="p-2.5 sm:p-3 space-y-0.5 bg-white">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                              style={{ backgroundColor: rec.colorHex }}
                            />
                            <span className="text-xs font-bold text-[#111315] truncate">
                              {rec.colorName}
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold text-[#5B616E] truncate">
                            {rec.mood}
                          </div>
                          <p className="text-[11px] text-[#8A8F98] line-clamp-1">
                            {rec.reason}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Matching Owned Items Drawer for Selected Color Card */}
                {selectedColorCombo && (() => {
                  const ownedMatches =
                    matchingWardrobeItemsByColor[selectedColorCombo] || [];
                  const selectedRec = colorPlan.recommendations.find(
                    (r) => r.colorName === selectedColorCombo
                  );
                  return (
                    <div className="rounded-2xl border border-slate-200/80 bg-[#F7F8FA] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {selectedRec && (
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                              style={{ backgroundColor: selectedRec.colorHex }}
                            />
                          )}
                          <span className="text-xs font-bold text-[#111315] truncate">
                            내 옷장의 {selectedColorCombo} {colorPlan.partnerLabel}
                            <span className="ml-1 font-medium text-[#5B616E] tabular-nums">
                              ({ownedMatches.length}벌)
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedColorCombo(null)}
                          aria-label="선택 닫기"
                          className="text-xs font-medium text-[#8A8F98] hover:text-[#111315] cursor-pointer shrink-0"
                        >
                          닫기
                        </button>
                      </div>

                      {ownedMatches.length === 0 ? (
                        <p className="text-xs text-[#5B616E]">
                          아직 옷장에 등록된 {selectedColorCombo} {colorPlan.partnerLabel}{' '}
                          아이템이 없습니다. 쇼핑이나 코디 참고용으로 활용해 보세요.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {ownedMatches.map((matched) => (
                            <div
                              key={matched.id}
                              className="rounded-xl border border-slate-200/80 bg-white p-2.5 flex flex-col gap-2"
                            >
                              <button
                                type="button"
                                onClick={() => onSelectItem?.(matched.id)}
                                className="flex items-center gap-2.5 text-left group cursor-pointer"
                              >
                                <div className="w-12 h-12 rounded-lg bg-[#F7F8FA] border border-slate-100 p-1 shrink-0 flex items-center justify-center">
                                  <GarmentVisual
                                    item={matched}
                                    className="w-full h-full group-hover:scale-105 transition-transform"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-semibold text-[#8A8F98] truncate">
                                    {matched.brand}
                                  </div>
                                  <div className="text-xs font-semibold text-[#111315] truncate">
                                    {matched.name}
                                  </div>
                                </div>
                              </button>
                              {onCreateLookWithItems && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCreateLookWithItems([item.id, matched.id])
                                  }
                                  className="w-full py-1.5 rounded-lg bg-[#111315] text-white text-[11px] font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  이 조합으로 코디 만들기
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200/70" />

              {/* 3. Pinterest Outfit Recommendations Section */}
              <div className="rounded-2xl border border-slate-200/80 bg-[#F7F8FA] p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-bold text-[#111315]">
                        코디 추천
                      </h2>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#E60023]/10 text-[#E60023] text-[10px] font-bold tracking-tight">
                        Pinterest
                      </span>
                    </div>
                    <p className="text-xs text-[#5B616E] mt-0.5">
                      {loadingRecs
                        ? '비슷한 색상·종류의 착장을 찾고 있어요...'
                        : recSource === 'ai'
                          ? `${item.colorName} ${item.subCategory} 기준 맞춤 착장 링크`
                          : `${item.colorName} ${item.subCategory} 관련 추천 검색 링크`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loadingRecs}
                    onClick={() => loadRecommendations(true)}
                    title="추천 새로고침"
                    className="min-h-[32px] px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-[#5B616E] hover:text-[#111315] hover:border-slate-300 inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${loadingRecs ? 'animate-spin' : ''}`}
                    />
                    <span>새로고침</span>
                  </button>
                </div>

                {loadingRecs && recSource === 'local' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#2563EB] px-1">
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      <span>Pinterest에서 비슷한 스타일을 탐색하는 중...</span>
                    </div>
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        className="h-14 rounded-xl bg-white/80 border border-slate-200/60 animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recommendations.map((rec, idx) => (
                      <a
                        key={`${rec.url}-${idx}`}
                        href={rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block rounded-xl bg-white border border-slate-200/80 px-3.5 py-2.5 hover:border-[#111315]/40 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[#111315] group-hover:text-[#E60023] transition-colors truncate">
                                {rec.title}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#5B616E] line-clamp-2 leading-relaxed">
                              {rec.tip}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-[#8A8F98] group-hover:text-[#E60023] pt-0.5">
                            <span>{rec.sourceLabel}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's Multiple Daily Looks Picker Modal */}
      {todayPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => !addingToDailyLook && setTodayPickerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="today-look-picker-title"
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2
                  id="today-look-picker-title"
                  className="text-base font-bold text-[#111315]"
                >
                  오늘의 데일리룩 선택
                </h2>
                <p className="text-xs text-[#5B616E] mt-0.5 tabular-nums">
                  {formatKoreanFullDate(todayIso)} · 추가할 코디를 선택하세요
                </p>
              </div>
              <button
                type="button"
                disabled={addingToDailyLook}
                onClick={() => setTodayPickerOpen(false)}
                aria-label="닫기"
                className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 overflow-y-auto">
              {todayLooks.map((look, idx) => {
                const lookItems = look.itemIds
                  .map((id) => allItemsById[id])
                  .filter(Boolean);
                const alreadyIncluded = look.itemIds.includes(item.id);
                const isFull = look.itemIds.length >= 15;

                return (
                  <div
                    key={look.id}
                    className={`w-full rounded-2xl border p-3 flex items-center gap-3.5 transition-all ${
                      alreadyIncluded
                        ? 'border-slate-200 bg-[#F7F8FA]'
                        : 'border-slate-200 bg-white hover:border-[#111315]'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={addingToDailyLook || isFull}
                      onClick={() => handlePickTodayLook(look)}
                      className="flex-1 min-w-0 flex items-center gap-3.5 text-left cursor-pointer disabled:cursor-not-allowed"
                    >
                      <div className="w-16 h-16 rounded-xl bg-[#F8F9FB] border border-slate-200/80 shrink-0 overflow-hidden">
                        <OutfitCollage items={lookItems} lookId={look.id} size="xs" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#111315] truncate">
                            {look.title || `데일리룩 ${idx + 1}`}
                          </span>
                          {alreadyIncluded && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-[10px] font-semibold text-[#5B616E] shrink-0">
                              이미 포함됨
                            </span>
                          )}
                          {!alreadyIncluded && isFull && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-[10px] font-semibold text-rose-700 shrink-0">
                              최대 15개
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[#5B616E] tabular-nums">
                          <WeatherIcon
                            condition={look.weatherCondition}
                            className="w-3.5 h-3.5"
                          />
                          <span>
                            {look.tempHigh} / {look.tempLow}°C
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{lookItems.length}개 아이템</span>
                        </div>
                      </div>
                    </button>

                    {alreadyIncluded ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTodayPickerOpen(false);
                          onSelectLook(look.id);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#111315] hover:bg-slate-50 shrink-0 cursor-pointer"
                      >
                        보기
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={addingToDailyLook || isFull}
                        onClick={() => handlePickTodayLook(look)}
                        className="px-3 py-1.5 rounded-xl bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 shrink-0 cursor-pointer"
                      >
                        추가
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-[#F7F8FA] flex items-center justify-between gap-3">
              <span className="text-xs text-[#5B616E]">
                오늘의 새 코디에 따로 기록할 수도 있어요.
              </span>
              <button
                type="button"
                disabled={addingToDailyLook}
                onClick={handleCreateAnotherTodayLook}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#111315] hover:bg-slate-50 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                + 오늘 새 데일리룩
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for Additional Images */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            aria-label="닫기"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage}
            alt="추가 이미지 확대 보기"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {extraCropTarget && (
        <ImageCropModal
          imageSrc={extraCropTarget.sourceUrl}
          title="추가 사진 자르기"
          maxDimension={640}
          quality={0.78}
          allowUseOriginal={extraCropTarget.kind === 'upload'}
          onConfirm={(croppedUrl) => void handleConfirmExtraCrop(croppedUrl)}
          onUseOriginal={
            extraCropTarget.kind === 'upload'
              ? () => void handleUseOriginalExtraCrop()
              : undefined
          }
          onCancel={() => setExtraCropTarget(null)}
        />
      )}
    </section>
  );
}
