import { useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  CATEGORY_TREE,
  COLOR_SWATCHES,
  Category,
  PATTERN_OPTIONS,
  SEASONS,
  Season,
  TOP_CATEGORIES,
  TPO_OPTIONS,
  WardrobeItem,
} from '../types/wardrobe';
import { AutocompleteInput } from './AutocompleteInput';
import { GarmentVisual } from './GarmentGraphic';

export type BulkItemPatch = Partial<
  Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
>;

interface BulkEditItemsModalProps {
  selectedItems: WardrobeItem[];
  existingBrands?: string[];
  existingMaterials?: string[];
  existingSizes?: string[];
  onClose: () => void;
  onSave: (patch: BulkItemPatch) => Promise<void>;
}

type EditableFieldKey =
  | 'brand'
  | 'category'
  | 'seasons'
  | 'color'
  | 'price'
  | 'purchaseDate'
  | 'tpo'
  | 'material'
  | 'pattern'
  | 'size'
  | 'isBasicCloset';

export function BulkEditItemsModal({
  selectedItems,
  existingBrands = [],
  existingMaterials = [],
  existingSizes = [],
  onClose,
  onSave,
}: BulkEditItemsModalProps) {
  const first = selectedItems[0];

  // Track which fields the user wants to apply across all selected items
  const [enabledFields, setEnabledFields] = useState<Record<EditableFieldKey, boolean>>({
    brand: false,
    category: false,
    seasons: false,
    color: false,
    price: false,
    purchaseDate: false,
    tpo: false,
    material: false,
    pattern: false,
    size: false,
    isBasicCloset: false,
  });

  // Field values (initialized cleanly from common/first item values)
  const [brand, setBrand] = useState(first?.brand ?? '');
  const [brandFocused, setBrandFocused] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const brandInputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const lastTypedLengthRef = useRef((first?.brand ?? '').length);

  const initialCat: Category = first?.category ?? '상의';
  const [category, setCategory] = useState<Category>(initialCat);
  const [subCategory, setSubCategory] = useState<string>(
    first?.subCategory ?? CATEGORY_TREE[initialCat][0]
  );
  const [seasons, setSeasons] = useState<Season[]>(
    first?.seasons?.length ? first.seasons : ['봄', '가을']
  );
  const [colorName, setColorName] = useState(first?.colorName ?? '블랙');
  const [colorHex, setColorHex] = useState(first?.colorHex ?? '#18181B');
  const [price, setPrice] = useState(String(first?.price ?? 0));
  const [purchaseDate, setPurchaseDate] = useState(
    first?.purchaseDate ?? '2026-11-14'
  );
  const [tpo, setTpo] = useState(first?.tpo ?? '데일리');
  const [material, setMaterial] = useState(first?.material ?? '');
  const [pattern, setPattern] = useState(first?.pattern ?? '무지');
  const [size, setSize] = useState(first?.size ?? 'FREE');
  const [isBasicCloset, setIsBasicCloset] = useState<boolean>(
    Boolean(first?.isBasicCloset)
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subOptions = CATEGORY_TREE[category] || [];

  const toggleField = (field: EditableFieldKey) => {
    setEnabledFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const enableField = (field: EditableFieldKey) => {
    setEnabledFields((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const enabledCount = useMemo(
    () => Object.values(enabledFields).filter(Boolean).length,
    [enabledFields]
  );

  // Brand autocomplete
  const matchingBrands = useMemo(() => {
    const q = brand.trim().toLowerCase();
    if (!q) return existingBrands.slice(0, 8);
    const prefixMatches = existingBrands.filter((b) =>
      b.toLowerCase().startsWith(q)
    );
    const containsMatches = existingBrands.filter(
      (b) => !b.toLowerCase().startsWith(q) && b.toLowerCase().includes(q)
    );
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [brand, existingBrands]);

  const applyInlineAutocomplete = (rawValue: string, isDeleting: boolean) => {
    const trimmed = rawValue.trimStart();
    if (!trimmed || isDeleting || isComposingRef.current) {
      setBrand(rawValue);
      lastTypedLengthRef.current = rawValue.length;
      return;
    }

    const q = trimmed.toLowerCase();
    const match = existingBrands.find((b) => b.toLowerCase().startsWith(q));
    if (match && match.length > trimmed.length) {
      setBrand(match);
      lastTypedLengthRef.current = trimmed.length;
      requestAnimationFrame(() => {
        const el = brandInputRef.current;
        if (el && document.activeElement === el) {
          el.setSelectionRange(trimmed.length, match.length);
        }
      });
    } else {
      setBrand(rawValue);
      lastTypedLengthRef.current = rawValue.length;
    }
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    enableField('brand');
    const nextValue = e.target.value;
    const inputType = (e.nativeEvent as InputEvent | undefined)?.inputType ?? '';
    const isDeleting =
      inputType.startsWith('delete') || nextValue.length < lastTypedLengthRef.current;
    setActiveSuggestionIdx(-1);
    applyInlineAutocomplete(nextValue, isDeleting);
  };

  const handleBrandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && matchingBrands.length > 0) {
      e.preventDefault();
      setBrandFocused(true);
      setActiveSuggestionIdx((prev) =>
        prev < matchingBrands.length - 1 ? prev + 1 : 0
      );
      return;
    }
    if (e.key === 'ArrowUp' && matchingBrands.length > 0) {
      e.preventDefault();
      setBrandFocused(true);
      setActiveSuggestionIdx((prev) =>
        prev > 0 ? prev - 1 : matchingBrands.length - 1
      );
      return;
    }
    if (e.key === 'Enter' && brandFocused && activeSuggestionIdx >= 0) {
      e.preventDefault();
      const picked = matchingBrands[activeSuggestionIdx];
      if (picked) {
        enableField('brand');
        setBrand(picked);
        lastTypedLengthRef.current = picked.length;
        setBrandFocused(false);
        setActiveSuggestionIdx(-1);
      }
      return;
    }
    if (e.key === 'Tab' && brandInputRef.current) {
      const el = brandInputRef.current;
      if (el.selectionStart !== el.selectionEnd) {
        el.setSelectionRange(el.value.length, el.value.length);
        lastTypedLengthRef.current = el.value.length;
      }
      setBrandFocused(false);
    }
  };

  const toggleSeason = (s: Season) => {
    enableField('seasons');
    setSeasons((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleCategoryChange = (nextCat: Category) => {
    enableField('category');
    setCategory(nextCat);
    setSubCategory(CATEGORY_TREE[nextCat][0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (enabledCount === 0) {
      setError('일괄 수정할 항목을 하나 이상 선택해 주세요.');
      return;
    }

    const patch: BulkItemPatch = {};

    if (enabledFields.brand) {
      const trimmedBrand = brand.trim().toUpperCase();
      if (!trimmedBrand) {
        setError('브랜드명을 입력해 주세요.');
        return;
      }
      patch.brand = trimmedBrand;
    }

    if (enabledFields.category) {
      patch.category = category;
      patch.subCategory = subCategory;
    }

    if (enabledFields.seasons) {
      if (seasons.length === 0) {
        setError('계절을 최소 1개 이상 선택해 주세요.');
        return;
      }
      patch.seasons = seasons;
    }

    if (enabledFields.color) {
      patch.colorName = colorName;
      patch.colorHex = colorHex;
    }

    if (enabledFields.price) {
      const numericPrice = Number(price);
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        setError('구매가는 0원 이상의 숫자로 입력해 주세요.');
        return;
      }
      patch.price = numericPrice;
    }

    if (enabledFields.purchaseDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
        setError('올바른 구매 날짜를 선택해 주세요.');
        return;
      }
      patch.purchaseDate = purchaseDate;
    }

    if (enabledFields.tpo) {
      patch.tpo = tpo;
    }

    if (enabledFields.material) {
      patch.material = material.trim();
    }

    if (enabledFields.pattern) {
      patch.pattern = pattern;
    }

    if (enabledFields.size) {
      patch.size = size.trim();
    }

    if (enabledFields.isBasicCloset) {
      patch.isBasicCloset = isBasicCloset;
    }

    setSaving(true);
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '일괄 수정 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#111315]">
              {selectedItems.length}개 아이템 한꺼번에 수정
            </h2>
            <p className="text-xs text-[#5B616E] mt-0.5">
              체크한 항목만 일괄 변경되며, 선택하지 않은 정보는 각 아이템의 기존 값을 유지합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#5B616E] hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Selected items preview strip */}
          <div className="p-3 rounded-xl bg-[#F7F8FA] border border-slate-200/70">
            <div className="text-[11px] font-semibold text-[#5B616E] mb-2">
              선택된 아이템 ({selectedItems.length}벌)
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {selectedItems.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className="shrink-0 w-12 flex flex-col items-center gap-1"
                  title={`${item.brand} ${item.name}`}
                >
                  <div className="w-12 h-12 rounded-lg bg-white border border-slate-200/80 p-1 flex items-center justify-center overflow-hidden">
                    <GarmentVisual item={item} className="w-full h-full" />
                  </div>
                  <span className="w-full text-[10px] text-[#5B616E] truncate text-center">
                    {item.brand}
                  </span>
                </div>
              ))}
              {selectedItems.length > 12 && (
                <div className="shrink-0 w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-semibold text-[#5B616E]">
                  +{selectedItems.length - 12}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Brand */}
            <FieldCard
              label="브랜드"
              checked={enabledFields.brand}
              onToggle={() => toggleField('brand')}
            >
              <div className="relative">
                <input
                  ref={brandInputRef}
                  type="text"
                  value={brand}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    isComposingRef.current = false;
                    applyInlineAutocomplete(e.currentTarget.value, false);
                  }}
                  onChange={handleBrandChange}
                  onFocus={() => {
                    enableField('brand');
                    setBrandFocused(true);
                    setActiveSuggestionIdx(-1);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setBrandFocused(false);
                      setActiveSuggestionIdx(-1);
                    }, 120);
                  }}
                  onKeyDown={handleBrandKeyDown}
                  placeholder="예: COS, LEVIS (입력 시 기존 브랜드 자동완성)"
                  autoComplete="off"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
                {brandFocused && matchingBrands.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-44 overflow-y-auto">
                    {matchingBrands.map((b, idx) => {
                      const isActive = idx === activeSuggestionIdx;
                      return (
                        <button
                          key={b}
                          type="button"
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            enableField('brand');
                            setBrand(b);
                            lastTypedLengthRef.current = b.length;
                            setBrandFocused(false);
                            setActiveSuggestionIdx(-1);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between cursor-pointer ${
                            isActive
                              ? 'bg-[#111315] text-white'
                              : 'text-[#111315] hover:bg-[#F7F8FA]'
                          }`}
                        >
                          <span className="font-medium">{b}</span>
                          <span
                            className={`text-[10px] ${
                              isActive ? 'text-white/70' : 'text-[#8A8F98]'
                            }`}
                          >
                            기존 브랜드
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </FieldCard>

            {/* Category */}
            <FieldCard
              label="카테고리 (상위 · 세부)"
              checked={enabledFields.category}
              onToggle={() => toggleField('category')}
            >
              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as Category)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315]"
                >
                  {TOP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={subCategory}
                  onChange={(e) => {
                    enableField('category');
                    setSubCategory(e.target.value);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315]"
                >
                  {subOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </FieldCard>

            {/* Seasons */}
            <FieldCard
              label="계절"
              checked={enabledFields.seasons}
              onToggle={() => toggleField('seasons')}
            >
              <div className="grid grid-cols-4 gap-2">
                {SEASONS.map((s) => {
                  const active = seasons.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSeason(s)}
                      className={`h-10 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#111315] text-white'
                          : 'bg-white text-[#5B616E] border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </FieldCard>

            {/* Color */}
            <FieldCard
              label={`색상${enabledFields.color ? ` · ${colorName}` : ''}`}
              checked={enabledFields.color}
              onToggle={() => toggleField('color')}
            >
              <div className="flex flex-wrap gap-2.5">
                {COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.name}
                    type="button"
                    title={sw.name}
                    onClick={() => {
                      enableField('color');
                      setColorName(sw.name);
                      setColorHex(sw.hex);
                    }}
                    className={`w-8 h-8 rounded-full border transition-transform cursor-pointer ${
                      colorName === sw.name && enabledFields.color
                        ? 'ring-2 ring-[#2563EB] ring-offset-2 scale-105 border-slate-400'
                        : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                    aria-label={sw.name}
                  />
                ))}
              </div>
            </FieldCard>

            {/* Price & Purchase Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldCard
                label="구매가 (원)"
                checked={enabledFields.price}
                onToggle={() => toggleField('price')}
              >
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={price}
                  onFocus={() => enableField('price')}
                  onChange={(e) => {
                    enableField('price');
                    setPrice(e.target.value);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315] tabular-nums"
                />
              </FieldCard>

              <FieldCard
                label="구매일"
                checked={enabledFields.purchaseDate}
                onToggle={() => toggleField('purchaseDate')}
              >
                <input
                  type="date"
                  value={purchaseDate}
                  onFocus={() => enableField('purchaseDate')}
                  onChange={(e) => {
                    enableField('purchaseDate');
                    setPurchaseDate(e.target.value);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315]"
                />
              </FieldCard>
            </div>

            {/* Material & Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldCard
                label="소재"
                checked={enabledFields.material}
                onToggle={() => toggleField('material')}
              >
                <AutocompleteInput
                  value={material}
                  onFocusExtra={() => enableField('material')}
                  onChange={(val) => {
                    enableField('material');
                    setMaterial(val);
                  }}
                  suggestions={existingMaterials}
                  suggestionBadge="기존 소재"
                  placeholder="예: 면 100%, 울 80%"
                  ariaLabel="소재"
                  inputClassName="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
              </FieldCard>

              <FieldCard
                label="사이즈"
                checked={enabledFields.size}
                onToggle={() => toggleField('size')}
              >
                <AutocompleteInput
                  value={size}
                  onFocusExtra={() => enableField('size')}
                  onChange={(val) => {
                    enableField('size');
                    setSize(val);
                  }}
                  suggestions={existingSizes}
                  suggestionBadge="기존 사이즈"
                  placeholder="예: S, M, 28, FREE"
                  ariaLabel="사이즈"
                  inputClassName="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
              </FieldCard>
            </div>

            {/* TPO & Pattern */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldCard
                label="착용 상황 (TPO)"
                checked={enabledFields.tpo}
                onToggle={() => toggleField('tpo')}
              >
                <select
                  value={tpo}
                  onFocus={() => enableField('tpo')}
                  onChange={(e) => {
                    enableField('tpo');
                    setTpo(e.target.value);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315]"
                >
                  {TPO_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </FieldCard>

              <FieldCard
                label="패턴"
                checked={enabledFields.pattern}
                onToggle={() => toggleField('pattern')}
              >
                <select
                  value={pattern}
                  onFocus={() => enableField('pattern')}
                  onChange={(e) => {
                    enableField('pattern');
                    setPattern(e.target.value);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315]"
                >
                  {PATTERN_OPTIONS.map((pat) => (
                    <option key={pat} value={pat}>
                      {pat}
                    </option>
                  ))}
                </select>
              </FieldCard>
            </div>

            {/* Basic Closet Flag */}
            <FieldCard
              label="기본옷장 지정"
              checked={enabledFields.isBasicCloset}
              onToggle={() => toggleField('isBasicCloset')}
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    enableField('isBasicCloset');
                    setIsBasicCloset(true);
                  }}
                  className={`h-10 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isBasicCloset
                      ? 'bg-[#111315] text-white'
                      : 'bg-white text-[#5B616E] border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  기본옷장 설정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    enableField('isBasicCloset');
                    setIsBasicCloset(false);
                  }}
                  className={`h-10 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    !isBasicCloset
                      ? 'bg-[#111315] text-white'
                      : 'bg-white text-[#5B616E] border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  기본옷장 해제
                </button>
              </div>
            </FieldCard>
          </div>

          {/* Sticky Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs text-[#5B616E] tabular-nums">
              {enabledCount > 0
                ? `${enabledCount}개 항목을 ${selectedItems.length}벌에 적용`
                : '변경할 항목을 체크하세요'}
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-10 rounded-xl border border-slate-200 text-xs font-semibold text-[#5B616E] hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving || enabledCount === 0}
                className="px-5 h-10 rounded-xl bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                {saving
                  ? '일괄 적용 중...'
                  : `${selectedItems.length}개 아이템 수정`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface FieldCardProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FieldCard({ label, checked, onToggle, children }: FieldCardProps) {
  return (
    <div
      className={`p-3.5 rounded-2xl border transition-colors ${
        checked
          ? 'bg-white border-[#111315]/40 shadow-2xs'
          : 'bg-[#F7F8FA]/80 border-slate-200/80'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 mb-2.5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
              checked
                ? 'bg-[#111315] border-[#111315] text-white'
                : 'bg-white border-slate-300 text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
          </span>
          <span
            className={`text-xs font-semibold ${
              checked ? 'text-[#111315]' : 'text-[#5B616E]'
            }`}
          >
            {label}
          </span>
        </div>
        <span className="text-[11px] font-medium text-[#8A8F98]">
          {checked ? '적용됨' : '유지'}
        </span>
      </button>
      <div className={checked ? 'opacity-100' : 'opacity-70'}>{children}</div>
    </div>
  );
}
