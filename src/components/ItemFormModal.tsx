import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brush,
  Crop,
  Eraser,
  ImagePlus,
  RotateCcw,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
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
import {
  analyzeClothingPhotoWithAI,
  detectDominantColorFromDataUrl,
  generateIllustratedClothingImage,
  generateIsolatedClothingImage,
  inferGenericGarmentFallback,
} from '../utils/imageAnalysis';
import {
  compressDataUrlImage,
  compressImageFile,
} from '../utils/imageCompression';
import { removeBackgroundLocally } from '../utils/localBackgroundRemoval';
import { AutocompleteInput } from './AutocompleteInput';
import { GarmentVisual } from './GarmentGraphic';
import { ImageCropModal } from './ImageCropModal';

interface ExistingItemSuggestion {
  name: string;
  brand: string;
  category: Category;
}

interface BatchDraftItem {
  tempId: string;
  imageUrl: string;
  originalImageUrl?: string;
  brand: string;
  name: string;
  category: Category;
  subCategory: string;
  colorName: string;
  colorHex: string;
  price: string;
  purchaseDate: string;
  seasons: Season[];
  analyzing?: boolean;
  isolating?: boolean;
  nameEdited?: boolean;
  colorEdited?: boolean;
  categoryEdited?: boolean;
}

interface ItemFormModalProps {
  initialItem?: WardrobeItem;
  initialMode?: 'single' | 'batch';
  linkedLookCount?: number;
  existingBrands?: string[];
  existingItemSuggestions?: ExistingItemSuggestion[];
  existingMaterials?: string[];
  existingSizes?: string[];
  presetCategory?: Category;
  presetSubCategory?: string;
  onClose: () => void;
  onSave: (
    data: Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSaveBatch?: (
    items: Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[]
  ) => Promise<void>;
}

export function ItemFormModal({
  initialItem,
  initialMode = 'single',
  linkedLookCount = 0,
  existingBrands = [],
  existingItemSuggestions = [],
  existingMaterials = [],
  existingSizes = [],
  presetCategory,
  presetSubCategory,
  onClose,
  onSave,
  onSaveBatch,
}: ItemFormModalProps) {
  const defaultCat: Category = initialItem?.category ?? presetCategory ?? '상의';
  const defaultSub =
    initialItem?.subCategory ??
    presetSubCategory ??
    CATEGORY_TREE[defaultCat][0];

  const [mode, setMode] = useState<'single' | 'batch'>(
    !initialItem && onSaveBatch ? initialMode : 'single'
  );

  const [name, setName] = useState(initialItem?.name ?? '');
  const [nameFocused, setNameFocused] = useState(false);
  const [activeNameSuggestionIdx, setActiveNameSuggestionIdx] = useState(-1);
  const [brand, setBrand] = useState(initialItem?.brand ?? '');
  const [brandFocused, setBrandFocused] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [category, setCategory] = useState<Category>(defaultCat);
  const [subCategory, setSubCategory] = useState<string>(defaultSub);
  const [seasons, setSeasons] = useState<Season[]>(
    initialItem?.seasons ?? ['봄', '가을']
  );
  const [tpo, setTpo] = useState(initialItem?.tpo ?? '데일리');
  const [colorName, setColorName] = useState(initialItem?.colorName ?? '블랙');
  const [colorHex, setColorHex] = useState(initialItem?.colorHex ?? '#18181B');
  const [price, setPrice] = useState(String(initialItem?.price ?? 0));
  const [purchaseDate, setPurchaseDate] = useState(
    initialItem?.purchaseDate ?? '2026-11-14'
  );
  const [wearCountInput, setWearCountInput] = useState(
    String(Math.max(0, linkedLookCount + (initialItem?.wearCountOffset ?? 0)))
  );
  const [material, setMaterial] = useState(initialItem?.material ?? '');
  const [pattern, setPattern] = useState(initialItem?.pattern ?? '무지');
  const [size, setSize] = useState(initialItem?.size ?? 'FREE');
  const [memo, setMemo] = useState(initialItem?.memo ?? '');
  const [imageUrl, setImageUrl] = useState(initialItem?.imageUrl ?? '');
  const [additionalImages, setAdditionalImages] = useState<string[]>(
    initialItem?.additionalImages ?? []
  );

  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [isolatingPhoto, setIsolatingPhoto] = useState(false);
  const [removingBgLocally, setRemovingBgLocally] = useState(false);
  const [illustratingPhoto, setIllustratingPhoto] = useState(false);
  const [preIsolateImageUrl, setPreIsolateImageUrl] = useState<string | null>(null);
  const [isolatingBatchAll, setIsolatingBatchAll] = useState(false);
  const [localBgBatchAll, setLocalBgBatchAll] = useState(false);
  const [autoDetectedNote, setAutoDetectedNote] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<
    | {
        kind: 'singleUpload';
        sourceUrl: string;
        fileName?: string;
        targetSlot: 'main' | 'extra';
      }
    | { kind: 'mainEdit'; sourceUrl: string }
    | { kind: 'extraEdit'; extraIdx: number; sourceUrl: string }
    | { kind: 'batchEdit'; tempId: string; sourceUrl: string }
    | null
  >(null);

  // Batch upload mode state
  const [batchDrafts, setBatchDrafts] = useState<BatchDraftItem[]>([]);
  const [batchCommonBrand, setBatchCommonBrand] = useState('');
  const [batchCommonCategory, setBatchCommonCategory] = useState<Category>(defaultCat);
  const [batchCommonSubCategory, setBatchCommonSubCategory] = useState<string>(defaultSub);
  const [batchCommonDate, setBatchCommonDate] = useState('2026-11-14');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const batchFileRef = useRef<HTMLInputElement | null>(null);
  const brandInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const isNameComposingRef = useRef(false);
  const lastTypedLengthRef = useRef((initialItem?.brand ?? '').length);
  const lastTypedNameLengthRef = useRef((initialItem?.name ?? '').length);

  // Track whether user explicitly edited fields so background photo recognition never overwrites manual input
  const mountedRef = useRef(true);
  const nameManuallyEditedRef = useRef(Boolean(initialItem));
  const colorManuallyPickedRef = useRef(Boolean(initialItem));
  const categoryManuallyPickedRef = useRef(Boolean(initialItem));
  const patternManuallyPickedRef = useRef(Boolean(initialItem));
  const seasonsManuallyPickedRef = useRef(Boolean(initialItem));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const baseSubOptions = CATEGORY_TREE[category] || [];
  const subOptions =
    subCategory && !baseSubOptions.includes(subCategory)
      ? [...baseSubOptions, subCategory]
      : baseSubOptions;

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

  // Prioritize suggestions matching currently entered brand
  const prioritizedItemSuggestions = useMemo(() => {
    const bq = brand.trim().toLowerCase();
    if (!bq) return existingItemSuggestions;
    const sameBrand = existingItemSuggestions.filter(
      (it) => it.brand.toLowerCase() === bq
    );
    const others = existingItemSuggestions.filter(
      (it) => it.brand.toLowerCase() !== bq
    );
    return [...sameBrand, ...others];
  }, [brand, existingItemSuggestions]);

  const matchingItemSuggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return prioritizedItemSuggestions.slice(0, 8);
    const prefixMatches = prioritizedItemSuggestions.filter((it) =>
      it.name.toLowerCase().startsWith(q)
    );
    const containsMatches = prioritizedItemSuggestions.filter(
      (it) => !it.name.toLowerCase().startsWith(q) && it.name.toLowerCase().includes(q)
    );
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [name, prioritizedItemSuggestions]);

  const applyInlineNameAutocomplete = (rawValue: string, isDeleting: boolean) => {
    const trimmed = rawValue.trimStart();
    if (!trimmed || isDeleting || isNameComposingRef.current) {
      setName(rawValue);
      lastTypedNameLengthRef.current = rawValue.length;
      return;
    }

    const q = trimmed.toLowerCase();
    const match = prioritizedItemSuggestions.find((it) =>
      it.name.toLowerCase().startsWith(q)
    );
    if (match && match.name.length > trimmed.length) {
      setName(match.name);
      lastTypedNameLengthRef.current = trimmed.length;
      requestAnimationFrame(() => {
        const el = nameInputRef.current;
        if (el && document.activeElement === el) {
          el.setSelectionRange(trimmed.length, match.name.length);
        }
      });
    } else {
      setName(rawValue);
      lastTypedNameLengthRef.current = rawValue.length;
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    nameManuallyEditedRef.current = nextValue.trim().length > 0;
    const inputType = (e.nativeEvent as InputEvent | undefined)?.inputType ?? '';
    const isDeleting =
      inputType.startsWith('delete') ||
      nextValue.length < lastTypedNameLengthRef.current;
    setActiveNameSuggestionIdx(-1);
    applyInlineNameAutocomplete(nextValue, isDeleting);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && matchingItemSuggestions.length > 0) {
      e.preventDefault();
      setNameFocused(true);
      setActiveNameSuggestionIdx((prev) =>
        prev < matchingItemSuggestions.length - 1 ? prev + 1 : 0
      );
      return;
    }
    if (e.key === 'ArrowUp' && matchingItemSuggestions.length > 0) {
      e.preventDefault();
      setNameFocused(true);
      setActiveNameSuggestionIdx((prev) =>
        prev > 0 ? prev - 1 : matchingItemSuggestions.length - 1
      );
      return;
    }
    if (e.key === 'Enter' && nameFocused && activeNameSuggestionIdx >= 0) {
      e.preventDefault();
      const picked = matchingItemSuggestions[activeNameSuggestionIdx];
      if (picked) {
        nameManuallyEditedRef.current = true;
        setName(picked.name);
        lastTypedNameLengthRef.current = picked.name.length;
        setNameFocused(false);
        setActiveNameSuggestionIdx(-1);
      }
      return;
    }
    if (e.key === 'Tab' && nameInputRef.current) {
      const el = nameInputRef.current;
      if (el.selectionStart !== el.selectionEnd) {
        el.setSelectionRange(el.value.length, el.value.length);
        lastTypedNameLengthRef.current = el.value.length;
      }
      setNameFocused(false);
    }
  };

  const handleCategoryChange = (nextCat: Category) => {
    categoryManuallyPickedRef.current = true;
    setCategory(nextCat);
    const subs = CATEGORY_TREE[nextCat];
    if (subs && subs.length > 0) {
      setSubCategory(subs[0]);
    }
  };

  const toggleSeason = (season: Season) => {
    seasonsManuallyPickedRef.current = true;
    setSeasons((prev) => {
      if (prev.includes(season)) {
        return prev.length > 1 ? prev.filter((s) => s !== season) : prev;
      }
      return [...prev, season];
    });
  };

  const runSinglePhotoAutoDetect = async (
    photoDataUrl: string,
    fileName?: string,
    forceApply = false
  ) => {
    setAutoDetectedNote(null);

    // 1) Instant pixel-based color detection + generic fallback name
    const detectedColor = await detectDominantColorFromDataUrl(photoDataUrl);
    if (!mountedRef.current) return;

    let appliedColorName = colorName;
    if (forceApply || !colorManuallyPickedRef.current) {
      setColorName(detectedColor.name);
      setColorHex(detectedColor.hex);
      appliedColorName = detectedColor.name;
    }

    const fallback = inferGenericGarmentFallback(category, subCategory, fileName);
    let appliedName = name;
    if (forceApply || (!nameManuallyEditedRef.current && !name.trim())) {
      setName(fallback.name);
      lastTypedNameLengthRef.current = fallback.name.length;
      appliedName = fallback.name;
    }
    if (forceApply || !categoryManuallyPickedRef.current) {
      setCategory(fallback.category);
      setSubCategory(fallback.subCategory);
    }

    // 2) Server-side Gemini Vision refinement for exact garment type & color
    setAnalyzingPhoto(true);
    try {
      const aiResult = await analyzeClothingPhotoWithAI(photoDataUrl);
      if (!mountedRef.current) return;

      if (aiResult) {
        if (aiResult.genericName && (forceApply || !nameManuallyEditedRef.current)) {
          setName(aiResult.genericName);
          lastTypedNameLengthRef.current = aiResult.genericName.length;
          appliedName = aiResult.genericName;
        }
        if (
          aiResult.category &&
          aiResult.subCategory &&
          (forceApply || !categoryManuallyPickedRef.current)
        ) {
          setCategory(aiResult.category);
          setSubCategory(aiResult.subCategory);
        }
        if (
          aiResult.colorName &&
          aiResult.colorHex &&
          (forceApply || !colorManuallyPickedRef.current)
        ) {
          setColorName(aiResult.colorName);
          setColorHex(aiResult.colorHex);
          appliedColorName = aiResult.colorName;
        }
        if (aiResult.pattern && (forceApply || !patternManuallyPickedRef.current)) {
          setPattern(aiResult.pattern);
        }
        if (aiResult.seasons && (forceApply || !seasonsManuallyPickedRef.current)) {
          setSeasons(aiResult.seasons);
        }
      }

      if (appliedName || appliedColorName) {
        setAutoDetectedNote(
          `자동 인식 적용: ${appliedName || fallback.name} · ${appliedColorName}`
        );
      }
    } finally {
      if (mountedRef.current) {
        setAnalyzingPhoto(false);
      }
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingPhotos(true);
    setError(null);
    try {
      // Single photo upload: open interactive cropper immediately at full source resolution
      if (files.length === 1) {
        const rawDataUrl = await readFileAsDataUrl(files[0]);
        if (!mountedRef.current) return;
        setCropTarget({
          kind: 'singleUpload',
          sourceUrl: rawDataUrl,
          fileName: files[0].name,
          targetSlot: imageUrl ? 'extra' : 'main',
        });
        return;
      }

      const compressedList: string[] = [];
      for (const file of files.slice(0, 7)) {
        const compressed = await compressImageFile(file, 560, 0.72);
        compressedList.push(compressed);
      }

      if (!imageUrl) {
        const [first, ...rest] = compressedList;
        setImageUrl(first);
        setPreIsolateImageUrl(null);
        if (rest.length > 0) {
          setAdditionalImages((prev) => [...prev, ...rest].slice(0, 6));
        }
        void runSinglePhotoAutoDetect(first, files[0]?.name, false);
      } else {
        setAdditionalImages((prev) => [...prev, ...compressedList].slice(0, 6));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.'
      );
    } finally {
      setUploadingPhotos(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applySingleUploadedImage = (
    finalUrl: string,
    targetSlot: 'main' | 'extra',
    fileName?: string
  ) => {
    if (targetSlot === 'main') {
      setImageUrl(finalUrl);
      setPreIsolateImageUrl(null);
      void runSinglePhotoAutoDetect(finalUrl, fileName, false);
    } else {
      setAdditionalImages((prev) => [...prev, finalUrl].slice(0, 6));
    }
  };

  const handleConfirmCrop = async (croppedUrl: string) => {
    const current = cropTarget;
    if (!current) return;
    setCropTarget(null);

    if (current.kind === 'singleUpload') {
      applySingleUploadedImage(croppedUrl, current.targetSlot, current.fileName);
      return;
    }

    if (current.kind === 'mainEdit') {
      if (!preIsolateImageUrl && imageUrl) {
        setPreIsolateImageUrl(imageUrl);
      }
      setImageUrl(croppedUrl);
      setAutoDetectedNote('원하는 영역으로 사진을 깔끔하게 잘랐습니다.');
      if (!colorManuallyPickedRef.current) {
        const cleanColor = await detectDominantColorFromDataUrl(croppedUrl);
        if (mountedRef.current && !colorManuallyPickedRef.current) {
          setColorName(cleanColor.name);
          setColorHex(cleanColor.hex);
        }
      }
      return;
    }

    if (current.kind === 'extraEdit') {
      setAdditionalImages((prev) =>
        prev.map((img, idx) => (idx === current.extraIdx ? croppedUrl : img))
      );
      return;
    }

    if (current.kind === 'batchEdit') {
      const target = batchDrafts.find((d) => d.tempId === current.tempId);
      if (!target) return;
      const sourceOriginal = target.originalImageUrl || target.imageUrl;
      updateBatchDraft(current.tempId, {
        imageUrl: croppedUrl,
        originalImageUrl: sourceOriginal,
      });
      if (!target.colorEdited) {
        const cleanColor = await detectDominantColorFromDataUrl(croppedUrl);
        if (mountedRef.current) {
          updateBatchDraft(current.tempId, {
            colorName: cleanColor.name,
            colorHex: cleanColor.hex,
          });
        }
      }
    }
  };

  const handleUseOriginalFromCrop = async () => {
    const current = cropTarget;
    if (!current || current.kind !== 'singleUpload') {
      setCropTarget(null);
      return;
    }
    setCropTarget(null);
    setUploadingPhotos(true);
    try {
      const compressed = await compressDataUrlImage(current.sourceUrl, 560, 0.72);
      if (!mountedRef.current) return;
      applySingleUploadedImage(compressed, current.targetSlot, current.fileName);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.'
      );
    } finally {
      if (mountedRef.current) {
        setUploadingPhotos(false);
      }
    }
  };

  const handleIsolateMainPhoto = async () => {
    const sourceUrl = preIsolateImageUrl || imageUrl;
    if (!sourceUrl || isolatingPhoto) return;

    setIsolatingPhoto(true);
    setError(null);
    try {
      const hint = name.trim() || subCategory || category;
      const isolatedUrl = await generateIsolatedClothingImage(sourceUrl, hint);
      if (!mountedRef.current) return;

      if (!preIsolateImageUrl) {
        setPreIsolateImageUrl(imageUrl);
      }
      setImageUrl(isolatedUrl);
      setAutoDetectedNote(
        '옷 부분만 남기고 배경과 주변 요소를 지운 스튜디오 이미지를 생성했습니다.'
      );

      if (!colorManuallyPickedRef.current) {
        const cleanColor = await detectDominantColorFromDataUrl(isolatedUrl);
        if (mountedRef.current && !colorManuallyPickedRef.current) {
          setColorName(cleanColor.name);
          setColorHex(cleanColor.hex);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : '옷 이미지 생성 중 오류가 발생했습니다.'
        );
      }
    } finally {
      if (mountedRef.current) {
        setIsolatingPhoto(false);
      }
    }
  };

  const handleLocalRemoveBgMainPhoto = async () => {
    const sourceUrl = preIsolateImageUrl || imageUrl;
    if (!sourceUrl || removingBgLocally || isolatingPhoto) return;

    setRemovingBgLocally(true);
    setError(null);
    try {
      const cleanedUrl = await removeBackgroundLocally(sourceUrl, 560);
      if (!mountedRef.current) return;

      if (!preIsolateImageUrl) {
        setPreIsolateImageUrl(imageUrl);
      }
      setImageUrl(cleanedUrl);
      setAutoDetectedNote(
        '브라우저에서 무료로 주변 배경을 정리했습니다. 복잡하거나 착용 사진은 AI 생성 기능을 이용해 보세요.'
      );

      if (!colorManuallyPickedRef.current) {
        const cleanColor = await detectDominantColorFromDataUrl(cleanedUrl);
        if (mountedRef.current && !colorManuallyPickedRef.current) {
          setColorName(cleanColor.name);
          setColorHex(cleanColor.hex);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : '무료 배경 제거 처리 중 오류가 발생했습니다.'
        );
      }
    } finally {
      if (mountedRef.current) {
        setRemovingBgLocally(false);
      }
    }
  };

  const handleIllustrateMainPhoto = async () => {
    const sourceUrl = preIsolateImageUrl || imageUrl;
    if (!sourceUrl || illustratingPhoto || isolatingPhoto || removingBgLocally) {
      return;
    }

    setIllustratingPhoto(true);
    setError(null);
    try {
      const iconUrl = await generateIllustratedClothingImage(sourceUrl, {
        itemHint: name.trim() || subCategory || category,
        colorName,
        category,
        subCategory,
      });
      if (!mountedRef.current) return;

      if (!preIsolateImageUrl) {
        setPreIsolateImageUrl(imageUrl);
      }
      setImageUrl(iconUrl);
      setAutoDetectedNote(
        '업로드한 사진의 형태와 색상을 바탕으로 깔끔한 옷 그림 아이콘을 제작했습니다.'
      );
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : '옷 그림 아이콘 생성 중 오류가 발생했습니다.'
        );
      }
    } finally {
      if (mountedRef.current) {
        setIllustratingPhoto(false);
      }
    }
  };

  const handleRestoreMainPhoto = () => {
    if (!preIsolateImageUrl) return;
    setImageUrl(preIsolateImageUrl);
    setPreIsolateImageUrl(null);
    setAutoDetectedNote('원본 사진으로 복원했습니다.');
  };

  const handlePromoteToMain = (extraIdx: number) => {
    const target = additionalImages[extraIdx];
    if (!target) return;
    const nextExtras = additionalImages.filter((_, i) => i !== extraIdx);
    if (imageUrl) {
      nextExtras.unshift(imageUrl);
    }
    setImageUrl(target);
    setPreIsolateImageUrl(null);
    setAdditionalImages(nextExtras.slice(0, 6));
  };

  const handleRemoveMainPhoto = () => {
    setPreIsolateImageUrl(null);
    if (additionalImages.length > 0) {
      const [nextMain, ...rest] = additionalImages;
      setImageUrl(nextMain);
      setAdditionalImages(rest);
    } else {
      setImageUrl('');
    }
  };

  const handleRemoveExtraPhoto = (extraIdx: number) => {
    setAdditionalImages((prev) => prev.filter((_, i) => i !== extraIdx));
  };

  const analyzeBatchDraftsInBackground = async (draftsToAnalyze: BatchDraftItem[]) => {
    const concurrency = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < draftsToAnalyze.length) {
        const current = draftsToAnalyze[cursor++];
        if (!current) continue;
        const aiResult = await analyzeClothingPhotoWithAI(current.imageUrl);
        if (!mountedRef.current) return;

        setBatchDrafts((prev) =>
          prev.map((d) => {
            if (d.tempId !== current.tempId) return d;
            if (!aiResult) return { ...d, analyzing: false };
            return {
              ...d,
              analyzing: false,
              name:
                !d.nameEdited && aiResult.genericName
                  ? aiResult.genericName
                  : d.name,
              category:
                !d.categoryEdited && aiResult.category
                  ? aiResult.category
                  : d.category,
              subCategory:
                !d.categoryEdited && aiResult.subCategory
                  ? aiResult.subCategory
                  : d.subCategory,
              colorName:
                !d.colorEdited && aiResult.colorName
                  ? aiResult.colorName
                  : d.colorName,
              colorHex:
                !d.colorEdited && aiResult.colorHex
                  ? aiResult.colorHex
                  : d.colorHex,
              seasons: aiResult.seasons ?? d.seasons,
            };
          })
        );
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, draftsToAnalyze.length) }, () =>
        worker()
      )
    );
  };

  const handleUploadBatchPhotos = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingPhotos(true);
    setError(null);
    try {
      const nextDrafts: BatchDraftItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImageFile(file, 560, 0.74);
        const [detectedColor, inferred] = await Promise.all([
          detectDominantColorFromDataUrl(compressed),
          Promise.resolve(
            inferGenericGarmentFallback(
              batchCommonCategory,
              batchCommonSubCategory,
              file.name
            )
          ),
        ]);

        nextDrafts.push({
          tempId: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          imageUrl: compressed,
          brand: batchCommonBrand.trim().toUpperCase(),
          name: inferred.name,
          category: inferred.category,
          subCategory: inferred.subCategory,
          colorName: detectedColor.name,
          colorHex: detectedColor.hex,
          price: '0',
          purchaseDate: batchCommonDate,
          seasons: ['봄', '가을'],
          analyzing: true,
        });
      }
      setBatchDrafts((prev) => [...prev, ...nextDrafts]);
      void analyzeBatchDraftsInBackground(nextDrafts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.'
      );
    } finally {
      setUploadingPhotos(false);
      if (batchFileRef.current) batchFileRef.current.value = '';
    }
  };

  const updateBatchDraft = (
    tempId: string,
    patch: Partial<BatchDraftItem>
  ) => {
    setBatchDrafts((prev) =>
      prev.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d))
    );
  };

  const removeBatchDraft = (tempId: string) => {
    setBatchDrafts((prev) => prev.filter((d) => d.tempId !== tempId));
  };

  const handleIsolateBatchDraft = async (tempId: string) => {
    const target = batchDrafts.find((d) => d.tempId === tempId);
    if (!target || target.isolating) return;

    const sourceUrl = target.originalImageUrl || target.imageUrl;
    updateBatchDraft(tempId, { isolating: true });
    setError(null);
    try {
      const hint = target.name.trim() || target.subCategory || target.category;
      const isolatedUrl = await generateIsolatedClothingImage(sourceUrl, hint);
      if (!mountedRef.current) return;
      updateBatchDraft(tempId, {
        imageUrl: isolatedUrl,
        originalImageUrl: sourceUrl,
        isolating: false,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      updateBatchDraft(tempId, { isolating: false });
      setError(
        err instanceof Error
          ? err.message
          : '옷 이미지 생성 중 오류가 발생했습니다.'
      );
    }
  };

  const handleRestoreBatchDraft = (tempId: string) => {
    const target = batchDrafts.find((d) => d.tempId === tempId);
    if (!target?.originalImageUrl) return;
    updateBatchDraft(tempId, {
      imageUrl: target.originalImageUrl,
      originalImageUrl: undefined,
    });
  };

  const handleLocalRemoveBgBatchDraft = async (tempId: string) => {
    const target = batchDrafts.find((d) => d.tempId === tempId);
    if (!target || target.isolating) return;

    const sourceUrl = target.originalImageUrl || target.imageUrl;
    updateBatchDraft(tempId, { isolating: true });
    setError(null);
    try {
      const cleanedUrl = await removeBackgroundLocally(sourceUrl, 560);
      if (!mountedRef.current) return;
      updateBatchDraft(tempId, {
        imageUrl: cleanedUrl,
        originalImageUrl: sourceUrl,
        isolating: false,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      updateBatchDraft(tempId, { isolating: false });
      setError(
        err instanceof Error
          ? err.message
          : '무료 배경 제거 처리 중 오류가 발생했습니다.'
      );
    }
  };

  const handleIllustrateBatchDraft = async (tempId: string) => {
    const target = batchDrafts.find((d) => d.tempId === tempId);
    if (!target || target.isolating) return;

    const sourceUrl = target.originalImageUrl || target.imageUrl;
    updateBatchDraft(tempId, { isolating: true });
    setError(null);
    try {
      const iconUrl = await generateIllustratedClothingImage(sourceUrl, {
        itemHint: target.name.trim() || target.subCategory || target.category,
        colorName: target.colorName,
        category: target.category,
        subCategory: target.subCategory,
      });
      if (!mountedRef.current) return;
      updateBatchDraft(tempId, {
        imageUrl: iconUrl,
        originalImageUrl: sourceUrl,
        isolating: false,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      updateBatchDraft(tempId, { isolating: false });
      setError(
        err instanceof Error
          ? err.message
          : '옷 그림 아이콘 생성 중 오류가 발생했습니다.'
      );
    }
  };

  const handleIsolateAllBatchDrafts = async () => {
    const pending = batchDrafts.filter((d) => !d.originalImageUrl && !d.isolating);
    if (pending.length === 0 || isolatingBatchAll || localBgBatchAll) return;

    setIsolatingBatchAll(true);
    setError(null);
    try {
      const concurrency = 2;
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const item = pending[cursor++];
          if (!item) continue;
          await handleIsolateBatchDraft(item.tempId);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, pending.length) }, () =>
          worker()
        )
      );
    } finally {
      if (mountedRef.current) {
        setIsolatingBatchAll(false);
      }
    }
  };

  const handleLocalRemoveBgAllBatchDrafts = async () => {
    const pending = batchDrafts.filter((d) => !d.originalImageUrl && !d.isolating);
    if (pending.length === 0 || localBgBatchAll || isolatingBatchAll) return;

    setLocalBgBatchAll(true);
    setError(null);
    try {
      for (const item of pending) {
        if (!mountedRef.current) return;
        await handleLocalRemoveBgBatchDraft(item.tempId);
      }
    } finally {
      if (mountedRef.current) {
        setLocalBgBatchAll(false);
      }
    }
  };

  const applyCommonToAllDrafts = () => {
    setBatchDrafts((prev) =>
      prev.map((d) => ({
        ...d,
        brand: batchCommonBrand.trim()
          ? batchCommonBrand.trim().toUpperCase()
          : d.brand,
        category: batchCommonCategory,
        subCategory: batchCommonSubCategory,
        categoryEdited: true,
        purchaseDate: batchCommonDate,
      }))
    );
  };

  const handleSplitPhotosToBatch = async () => {
    const allPhotos = [imageUrl, ...additionalImages].filter(Boolean);
    if (allPhotos.length === 0) return;

    const drafts: BatchDraftItem[] = await Promise.all(
      allPhotos.map(async (photoUrl, idx) => {
        const detectedColor = await detectDominantColorFromDataUrl(photoUrl);
        const fallback = inferGenericGarmentFallback(category, subCategory);
        return {
          tempId: `${Date.now()}_split_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          imageUrl: photoUrl,
          brand: brand.trim().toUpperCase(),
          name: idx === 0 && name.trim() ? name.trim() : fallback.name,
          category,
          subCategory,
          colorName: idx === 0 && colorManuallyPickedRef.current ? colorName : detectedColor.name,
          colorHex: idx === 0 && colorManuallyPickedRef.current ? colorHex : detectedColor.hex,
          price: price || '0',
          purchaseDate,
          seasons,
          analyzing: true,
        };
      })
    );

    setBatchDrafts(drafts);
    setBatchCommonBrand(brand.trim().toUpperCase());
    setBatchCommonCategory(category);
    setBatchCommonSubCategory(subCategory);
    setBatchCommonDate(purchaseDate);
    setMode('batch');
    void analyzeBatchDraftsInBackground(drafts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !brand.trim()) {
      setError('브랜드와 아이템 이름을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedWearCount = Math.max(
        0,
        Math.min(10000, Math.round(Number(wearCountInput) || 0))
      );
      const nextWearCountOffset = parsedWearCount - linkedLookCount;

      await onSave({
        name: name.trim(),
        brand: brand.trim().toUpperCase(),
        category,
        subCategory,
        seasons,
        tpo,
        colorName,
        colorHex,
        price: Math.max(0, Number(price) || 0),
        purchaseDate,
        material: material.trim() || '미입력',
        pattern,
        size: size.trim() || 'FREE',
        rating: initialItem?.rating ?? 0,
        imageKey: initialItem?.imageKey,
        imageUrl: imageUrl || undefined,
        additionalImages,
        memo: memo.trim(),
        isBasicCloset: initialItem?.isBasicCloset ?? false,
        wearCountOffset:
          nextWearCountOffset !== 0 || initialItem?.wearCountOffset !== undefined
            ? nextWearCountOffset
            : undefined,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveBatch || batchDrafts.length === 0) {
      setError('등록할 사진을 1장 이상 추가해 주세요.');
      return;
    }
    const invalid = batchDrafts.find((d) => !d.name.trim() || !d.brand.trim());
    if (invalid) {
      setError('모든 아이템의 브랜드와 아이템명을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveBatch(
        batchDrafts.map((d) => ({
          name: d.name.trim(),
          brand: d.brand.trim().toUpperCase(),
          category: d.category,
          subCategory: d.subCategory,
          seasons: d.seasons,
          tpo: '데일리',
          colorName: d.colorName,
          colorHex: d.colorHex,
          price: Math.max(0, Number(d.price) || 0),
          purchaseDate: d.purchaseDate,
          material: '미입력',
          pattern: '무지',
          size: 'FREE',
          rating: 0,
          imageUrl: d.imageUrl,
          additionalImages: [],
          memo: '',
          isBasicCloset: false,
        }))
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '일괄 등록 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-bold text-[#111315] whitespace-nowrap">
              {initialItem ? '아이템 정보 수정' : '새 옷 등록'}
            </h2>

            {!initialItem && onSaveBatch && (
              <div className="inline-flex p-0.5 rounded-lg bg-[#F3F4F6] border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('single');
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    mode === 'single'
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#5B616E] hover:text-[#111315]'
                  }`}
                >
                  단일 등록
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('batch');
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    mode === 'batch'
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#5B616E] hover:text-[#111315]'
                  }`}
                >
                  여러 사진 일괄 등록
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'batch' && !initialItem && onSaveBatch ? (
          <form onSubmit={handleBatchSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            <input
              ref={batchFileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUploadBatchPhotos}
              className="hidden"
            />

            {/* Multi-photo picker box */}
            <button
              type="button"
              disabled={uploadingPhotos}
              onClick={() => batchFileRef.current?.click()}
              className="w-full py-6 px-4 rounded-2xl border border-dashed border-slate-300 bg-[#F7F8FA] hover:bg-slate-100 hover:border-slate-400 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ImagePlus className="w-6 h-6 text-[#111315]" />
              <div className="text-sm font-semibold text-[#111315]">
                {uploadingPhotos
                  ? '사진 불러오는 중...'
                  : '여기를 눌러 여러 장의 옷 사진을 한 번에 선택하세요'}
              </div>
              <div className="text-xs text-[#5B616E]">
                사진마다 개별 아이템 카드가 생성되어 한 번에 옷장에 등록됩니다.
              </div>
            </button>

            {/* Common batch settings */}
            {batchDrafts.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111315]">
                    공통 정보 일괄 채우기
                  </span>
                  <button
                    type="button"
                    onClick={applyCommonToAllDrafts}
                    className="px-3 py-1 rounded-lg bg-[#111315] text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer"
                  >
                    전체 카드에 적용
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    list="closet-brand-datalist"
                    value={batchCommonBrand}
                    onChange={(e) => setBatchCommonBrand(e.target.value)}
                    placeholder="공통 브랜드"
                    className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-[#111315]"
                  />
                  <select
                    value={batchCommonCategory}
                    onChange={(e) => {
                      const cat = e.target.value as Category;
                      setBatchCommonCategory(cat);
                      setBatchCommonSubCategory(CATEGORY_TREE[cat][0]);
                    }}
                    className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs text-[#111315]"
                  >
                    {TOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={batchCommonSubCategory}
                    onChange={(e) => setBatchCommonSubCategory(e.target.value)}
                    className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs text-[#111315]"
                  >
                    {(CATEGORY_TREE[batchCommonCategory] || []).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={batchCommonDate}
                    onChange={(e) => setBatchCommonDate(e.target.value)}
                    className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs text-[#111315] tabular-nums"
                  />
                </div>
              </div>
            )}

            <datalist id="closet-brand-datalist">
              {existingBrands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>

            {/* Batch Draft Cards */}
            {batchDrafts.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#5B616E]">
                  <span className="tabular-nums">등록 대기 ({batchDrafts.length}벌)</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        localBgBatchAll ||
                        isolatingBatchAll ||
                        batchDrafts.every((d) => Boolean(d.originalImageUrl))
                      }
                      onClick={() => void handleLocalRemoveBgAllBatchDrafts()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-[#111315] hover:bg-[#F7F8FA] disabled:opacity-45 cursor-pointer"
                    >
                      <Eraser className="w-3 h-3 text-emerald-600" />
                      <span>
                        {localBgBatchAll ? '배경 정리 중...' : '전체 무료 배경 제거'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={
                        isolatingBatchAll ||
                        localBgBatchAll ||
                        batchDrafts.every((d) => Boolean(d.originalImageUrl))
                      }
                      onClick={() => void handleIsolateAllBatchDrafts()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F7F8FA] border border-slate-200 text-[11px] font-semibold text-[#111315] hover:bg-slate-100 disabled:opacity-45 cursor-pointer"
                    >
                      <Scissors className="w-3 h-3 text-[#2563EB]" />
                      <span>
                        {isolatingBatchAll ? 'AI 생성 중...' : '전체 AI 옷만 남기기'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => batchFileRef.current?.click()}
                      className="text-[#2563EB] hover:underline cursor-pointer"
                    >
                      + 사진 더 추가
                    </button>
                  </div>
                </div>

                {batchDrafts.map((draft, index) => (
                  <div
                    key={draft.tempId}
                    className="p-3 rounded-2xl border border-slate-200 bg-white flex gap-3 items-start"
                  >
                    <div className="w-24 shrink-0 space-y-1.5">
                      <div className="relative w-24 h-24 rounded-xl bg-[#F7F8FA] border border-slate-200/70 p-1 overflow-hidden">
                        <img
                          src={draft.imageUrl}
                          alt={`업로드 아이템 ${index + 1}`}
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-contain ${
                            draft.isolating ? 'opacity-40' : ''
                          }`}
                        />
                        {draft.isolating && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-[10px] font-semibold text-[#111315]">
                            처리 중
                          </div>
                        )}
                      </div>
                      {draft.originalImageUrl ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            disabled={Boolean(draft.isolating)}
                            onClick={() =>
                              setCropTarget({
                                kind: 'batchEdit',
                                tempId: draft.tempId,
                                sourceUrl: draft.imageUrl,
                              })
                            }
                            className="w-full py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-[#111315] hover:bg-[#F7F8FA] disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Crop className="w-2.5 h-2.5 text-[#111315]" />
                            <span>자르기</span>
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(draft.isolating)}
                            onClick={() => void handleIllustrateBatchDraft(draft.tempId)}
                            className="w-full py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-[10px] font-semibold text-indigo-900 hover:bg-indigo-100/80 disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Brush className="w-2.5 h-2.5 text-indigo-600" />
                            <span>그림 아이콘</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreBatchDraft(draft.tempId)}
                            className="w-full py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-medium text-[#5B616E] hover:text-[#111315] inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>원본 복원</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <button
                            type="button"
                            disabled={Boolean(draft.isolating)}
                            onClick={() =>
                              setCropTarget({
                                kind: 'batchEdit',
                                tempId: draft.tempId,
                                sourceUrl: draft.imageUrl,
                              })
                            }
                            className="w-full py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-[#111315] hover:bg-[#F7F8FA] disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Crop className="w-2.5 h-2.5 text-[#111315]" />
                            <span>자르기</span>
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(draft.isolating)}
                            onClick={() => void handleLocalRemoveBgBatchDraft(draft.tempId)}
                            className="w-full py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-[#111315] hover:bg-[#F7F8FA] disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Eraser className="w-2.5 h-2.5 text-emerald-600" />
                            <span>무료 배경 제거</span>
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(draft.isolating)}
                            onClick={() => void handleIsolateBatchDraft(draft.tempId)}
                            className="w-full py-1 rounded-lg border border-slate-200 bg-[#F7F8FA] text-[10px] font-semibold text-[#111315] hover:bg-slate-100 disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Scissors className="w-2.5 h-2.5 text-[#2563EB]" />
                            <span>AI 옷만 남기기</span>
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(draft.isolating)}
                            onClick={() => void handleIllustrateBatchDraft(draft.tempId)}
                            className="w-full py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-[10px] font-semibold text-indigo-900 hover:bg-indigo-100/80 disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Brush className="w-2.5 h-2.5 text-indigo-600" />
                            <span>그림 아이콘</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          list="closet-brand-datalist"
                          value={draft.brand}
                          onChange={(e) =>
                            updateBatchDraft(draft.tempId, {
                              brand: e.target.value,
                            })
                          }
                          placeholder="브랜드 * (예: COS)"
                          className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-[#111315]"
                        />
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={draft.name}
                            onChange={(e) =>
                              updateBatchDraft(draft.tempId, {
                                name: e.target.value,
                                nameEdited: true,
                              })
                            }
                            placeholder="아이템명 * (예: 가디건, 라운드 티)"
                            className="w-full h-9 px-2.5 pr-14 rounded-lg border border-slate-200 text-xs text-[#111315]"
                          />
                          {draft.analyzing && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#2563EB]">
                              인식 중
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <select
                          value={draft.category}
                          onChange={(e) => {
                            const cat = e.target.value as Category;
                            updateBatchDraft(draft.tempId, {
                              category: cat,
                              subCategory: CATEGORY_TREE[cat][0],
                              categoryEdited: true,
                            });
                          }}
                          className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-[#111315]"
                        >
                          {TOP_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <select
                          value={draft.subCategory}
                          onChange={(e) =>
                            updateBatchDraft(draft.tempId, {
                              subCategory: e.target.value,
                              categoryEdited: true,
                            })
                          }
                          className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-[#111315]"
                        >
                          {(CATEGORY_TREE[draft.category] || []).map((sub) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                        <div className="relative flex items-center">
                          <span
                            aria-hidden="true"
                            className="w-3 h-3 rounded-full border border-slate-300 absolute left-2 pointer-events-none shrink-0"
                            style={{ backgroundColor: draft.colorHex }}
                          />
                          <select
                            value={draft.colorName}
                            onChange={(e) => {
                              const matched = COLOR_SWATCHES.find(
                                (sw) => sw.name === e.target.value
                              );
                              updateBatchDraft(draft.tempId, {
                                colorName: e.target.value,
                                colorHex: matched?.hex ?? '#18181B',
                                colorEdited: true,
                              });
                            }}
                            className="w-full h-8 pl-6 pr-2 rounded-lg border border-slate-200 bg-white text-xs text-[#111315]"
                          >
                            {COLOR_SWATCHES.map((sw) => (
                              <option key={sw.name} value={sw.name}>
                                {sw.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={draft.price}
                          onChange={(e) =>
                            updateBatchDraft(draft.tempId, {
                              price: e.target.value,
                            })
                          }
                          placeholder="구매가(원)"
                          className="h-8 px-2 rounded-lg border border-slate-200 text-xs text-[#111315] tabular-nums"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeBatchDraft(draft.tempId)}
                      aria-label="제외"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-red-600 shrink-0 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-[#5B616E] hover:bg-slate-50 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving || batchDrafts.length === 0}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-[#111315] text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 cursor-pointer tabular-nums"
              >
                {saving
                  ? '등록 중...'
                  : `${batchDrafts.length}개 아이템 한 번에 등록`}
              </button>
            </div>
          </form>
        ) : (
        /* Single Item Form Body */
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Photo Preview + Multi-Photo Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-[#F7F8FA] border border-slate-200 p-2 flex items-center justify-center shrink-0 overflow-hidden">
                <GarmentVisual
                  item={{
                    name: name || '새 아이템',
                    category,
                    subCategory,
                    colorHex,
                    pattern,
                    imageKey: initialItem?.imageKey,
                    imageUrl: imageUrl || undefined,
                  }}
                  className="w-full h-full"
                />
              </div>

              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadPhoto}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingPhotos}
                    onClick={() => fileRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#111315] hover:bg-[#F7F8FA] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>
                      {uploadingPhotos
                        ? '업로드 중...'
                        : '사진 여러 장 선택 (최대 7장)'}
                    </span>
                  </button>
                  {imageUrl && (
                    <>
                      <button
                        type="button"
                        disabled={removingBgLocally || isolatingPhoto || illustratingPhoto}
                        onClick={() =>
                          setCropTarget({ kind: 'mainEdit', sourceUrl: imageUrl })
                        }
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[#111315] text-xs font-semibold hover:bg-[#F7F8FA] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Crop className="w-3.5 h-3.5 text-[#111315]" />
                        <span>사진 자르기</span>
                      </button>
                      <button
                        type="button"
                        disabled={removingBgLocally || isolatingPhoto || illustratingPhoto}
                        onClick={() => void handleLocalRemoveBgMainPhoto()}
                        className="px-3 py-2 rounded-xl border border-emerald-600/25 bg-emerald-50 text-emerald-900 text-xs font-semibold hover:bg-emerald-100/80 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Eraser className={`w-3.5 h-3.5 text-emerald-700 ${removingBgLocally ? 'animate-pulse' : ''}`} />
                        <span>
                          {removingBgLocally ? '배경 제거 중...' : '무료 배경 제거'}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={isolatingPhoto || removingBgLocally || illustratingPhoto}
                        onClick={() => void handleIsolateMainPhoto()}
                        className="px-3 py-2 rounded-xl border border-[#111315]/20 bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Scissors className={`w-3.5 h-3.5 ${isolatingPhoto ? 'animate-pulse' : ''}`} />
                        <span>
                          {isolatingPhoto ? 'AI 생성 중...' : 'AI 옷만 남기기'}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={illustratingPhoto || isolatingPhoto || removingBgLocally}
                        onClick={() => void handleIllustrateMainPhoto()}
                        className="px-3 py-2 rounded-xl border border-indigo-600/25 bg-indigo-50 text-indigo-900 text-xs font-semibold hover:bg-indigo-100/80 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Brush className={`w-3.5 h-3.5 text-indigo-700 ${illustratingPhoto ? 'animate-pulse' : ''}`} />
                        <span>
                          {illustratingPhoto ? '아이콘 제작 중...' : '그림 아이콘 생성'}
                        </span>
                      </button>
                      {preIsolateImageUrl && (
                        <button
                          type="button"
                          disabled={isolatingPhoto || removingBgLocally || illustratingPhoto}
                          onClick={handleRestoreMainPhoto}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#5B616E] hover:text-[#111315] hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>원본 복원</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={analyzingPhoto}
                        onClick={() => void runSinglePhotoAutoDetect(imageUrl, undefined, true)}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-[#F7F8FA] text-xs font-semibold text-[#111315] hover:bg-slate-100 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>
                          {analyzingPhoto ? '이름·색상 인식 중...' : '사진으로 이름·색상 인식'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl('');
                          setPreIsolateImageUrl(null);
                          setAdditionalImages([]);
                          setAutoDetectedNote(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
                      >
                        기본 일러스트 사용
                      </button>
                    </>
                  )}
                </div>

                <p className="text-[11px] text-[#8A8F98]">
                  {removingBgLocally
                    ? '브라우저에서 단색/주변 배경을 무료로 지우고 옷을 가운데로 정리하고 있습니다...'
                    : isolatingPhoto
                      ? 'AI가 사진에서 옷 부분만 남기고 배경과 주변 요소를 정리한 이미지를 생성하고 있습니다...'
                      : illustratingPhoto
                        ? '업로드한 사진의 형태와 색상을 바탕으로 깔끔한 옷 그림 아이콘을 제작하고 있습니다...'
                        : analyzingPhoto
                          ? '사진 속 옷의 종류와 색상을 분석해 기본값을 채우고 있습니다...'
                          : autoDetectedNote ||
                            '무료 배경 제거·AI 옷만 남기기가 마음에 들지 않으면 그림 아이콘 생성으로 사진과 닮은 깔끔한 아이콘 이미지를 만들 수 있습니다.'}
                </p>
              </div>
            </div>

            {(imageUrl || additionalImages.length > 0) && (
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {imageUrl && (
                  <div className="relative w-16 h-16 rounded-xl border-2 border-[#111315] bg-[#F7F8FA] shrink-0 overflow-hidden">
                    <img
                      src={imageUrl}
                      alt="대표 이미지"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute left-1 bottom-1 px-1 py-0.5 rounded bg-[#111315]/80 text-[9px] font-semibold text-white">
                      대표
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveMainPhoto}
                      aria-label="대표 사진 삭제"
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {additionalImages.map((extraUrl, idx) => (
                  <div
                    key={idx}
                    className="relative w-16 h-16 rounded-xl border border-slate-200 bg-[#F7F8FA] shrink-0 overflow-hidden group"
                  >
                    <button
                      type="button"
                      onClick={() => handlePromoteToMain(idx)}
                      title="대표 이미지로 설정"
                      className="w-full h-full cursor-pointer"
                    >
                      <img
                        src={extraUrl}
                        alt={`추가 이미지 ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCropTarget({
                          kind: 'extraEdit',
                          extraIdx: idx,
                          sourceUrl: extraUrl,
                        })
                      }
                      aria-label="추가 사진 자르기"
                      title="사진 자르기"
                      className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black cursor-pointer"
                    >
                      <Crop className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveExtraPhoto(idx)}
                      aria-label="추가 사진 삭제"
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!initialItem && onSaveBatch && imageUrl && additionalImages.length > 0 && (
              <div className="p-3 rounded-xl bg-[#F7F8FA] border border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs text-[#5B616E] tabular-nums">
                  사진 {1 + additionalImages.length}장을 각각 별도의 옷 아이템으로 등록할까요?
                </span>
                <button
                  type="button"
                  onClick={handleSplitPhotosToBatch}
                  className="px-3 py-1.5 rounded-lg bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  {1 + additionalImages.length}개 개별 아이템으로 분리 등록
                </button>
              </div>
            )}
          </div>

          {/* Brand & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                브랜드 *
              </label>
              <input
                ref={brandInputRef}
                type="text"
                required
                autoComplete="off"
                value={brand}
                onFocus={() => setBrandFocused(true)}
                onBlur={() => {
                  setTimeout(() => setBrandFocused(false), 120);
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  isComposingRef.current = false;
                  applyInlineAutocomplete(e.currentTarget.value, false);
                }}
                onChange={handleBrandChange}
                onKeyDown={handleBrandKeyDown}
                placeholder="예: LEVIS, COS, POLO"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-[#111315] focus:outline-none focus:border-slate-400"
              />
              {brandFocused && matchingBrands.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {matchingBrands.map((b, idx) => (
                    <button
                      key={b}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setBrand(b);
                        lastTypedLengthRef.current = b.length;
                        setBrandFocused(false);
                        setActiveSuggestionIdx(-1);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        idx === activeSuggestionIdx
                          ? 'bg-[#111315] text-white'
                          : 'text-[#111315] hover:bg-[#F7F8FA]'
                      }`}
                    >
                      <span>{b}</span>
                      <span
                        className={`text-[10px] ${
                          idx === activeSuggestionIdx ? 'text-white/70' : 'text-[#8A8F98]'
                        }`}
                      >
                        등록된 브랜드
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                아이템명 *
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                autoComplete="off"
                value={name}
                onFocus={() => setNameFocused(true)}
                onBlur={() => {
                  setTimeout(() => setNameFocused(false), 120);
                }}
                onCompositionStart={() => {
                  isNameComposingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  isNameComposingRef.current = false;
                  applyInlineNameAutocomplete(e.currentTarget.value, false);
                }}
                onChange={handleNameChange}
                onKeyDown={handleNameKeyDown}
                placeholder="예: 하이웨이스트 스트레이트 진"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-[#111315] focus:outline-none focus:border-slate-400"
              />
              {nameFocused && matchingItemSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {matchingItemSuggestions.map((it, idx) => (
                    <button
                      key={`${it.brand}-${it.name}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        nameManuallyEditedRef.current = true;
                        setName(it.name);
                        lastTypedNameLengthRef.current = it.name.length;
                        setNameFocused(false);
                        setActiveNameSuggestionIdx(-1);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        idx === activeNameSuggestionIdx
                          ? 'bg-[#111315] text-white'
                          : 'text-[#111315] hover:bg-[#F7F8FA]'
                      }`}
                    >
                      <span className="truncate">{it.name}</span>
                      <span
                        className={`text-[10px] shrink-0 ${
                          idx === activeNameSuggestionIdx
                            ? 'text-white/70'
                            : 'text-[#8A8F98]'
                        }`}
                      >
                        {it.brand} · {it.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Category & Sub-category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                상위 카테고리
              </label>
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
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                세부 카테고리
              </label>
              <select
                value={subCategory}
                onChange={(e) => {
                  categoryManuallyPickedRef.current = true;
                  setSubCategory(e.target.value);
                }}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#111315]"
              >
                {subOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Seasons */}
          <div>
            <div className="text-xs font-semibold text-[#5B616E] mb-1.5">
              계절 (복수 선택 가능)
            </div>
            <div className="grid grid-cols-4 gap-2">
              {SEASONS.map((s) => {
                const active = seasons.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeason(s)}
                    className={`min-h-[40px] rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#111315] text-white border-[#111315]'
                        : 'bg-white text-[#5B616E] border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Swatches */}
          <div>
            <div className="text-xs font-semibold text-[#5B616E] mb-2">
              색상 ({colorName})
            </div>
            <div className="flex flex-wrap gap-2.5">
              {COLOR_SWATCHES.map((sw) => {
                const active = colorName === sw.name;
                return (
                  <button
                    key={sw.name}
                    type="button"
                    title={sw.name}
                    onClick={() => {
                      colorManuallyPickedRef.current = true;
                      setColorName(sw.name);
                      setColorHex(sw.hex);
                    }}
                    className={`w-8 h-8 rounded-full border transition-transform cursor-pointer ${
                      active
                        ? 'ring-2 ring-[#2563EB] ring-offset-2 scale-110 border-slate-400'
                        : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                    aria-label={sw.name}
                  />
                );
              })}
            </div>
          </div>

          {/* Price, Purchase Date & Wear Count */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                구매가 (원)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-[#111315] tabular-nums focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                구매일
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-[#111315] tabular-nums focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                착용 횟수 (회)
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={wearCountInput}
                onChange={(e) => setWearCountInput(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-[#111315] tabular-nums focus:outline-none focus:border-slate-400"
              />
              {linkedLookCount > 0 && (
                <p className="mt-1 text-[11px] text-[#8A8F98] tabular-nums">
                  데일리룩 기록 {linkedLookCount}회 포함
                </p>
              )}
            </div>
          </div>

          {/* Material, Pattern, Size, TPO */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                소재
              </label>
              <AutocompleteInput
                value={material}
                onChange={setMaterial}
                suggestions={existingMaterials}
                suggestionBadge="기존 소재"
                placeholder="예: 데님, 울"
                dropdownPlacement="top"
                ariaLabel="소재"
                inputClassName="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-[#111315] focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                패턴
              </label>
              <select
                value={pattern}
                onChange={(e) => {
                  patternManuallyPickedRef.current = true;
                  setPattern(e.target.value);
                }}
                className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-white text-xs text-[#111315]"
              >
                {PATTERN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                사이즈
              </label>
              <AutocompleteInput
                value={size}
                onChange={setSize}
                suggestions={existingSizes}
                suggestionBadge="기존 사이즈"
                placeholder="예: 27, S"
                dropdownPlacement="top"
                ariaLabel="사이즈"
                inputClassName="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-[#111315] focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
                TPO
              </label>
              <select
                value={tpo}
                onChange={(e) => setTpo(e.target.value)}
                className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-white text-xs text-[#111315]"
              >
                {TPO_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-xs font-semibold text-[#5B616E] mb-1.5">
              메모
            </label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="핏, 세탁 팁 등 메모를 남기세요."
              className="w-full p-3 rounded-xl border border-slate-200 text-sm text-[#111315] resize-none focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-[#5B616E] hover:bg-slate-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-[#111315] text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {saving ? '저장 중...' : initialItem ? '수정 완료' : '옷장에 추가'}
            </button>
          </div>
        </form>
        )}
      </div>

      {cropTarget && (
        <ImageCropModal
          imageSrc={cropTarget.sourceUrl}
          title={
            cropTarget.kind === 'singleUpload'
              ? '업로드 사진 자르기'
              : '사진 자르기'
          }
          maxDimension={560}
          quality={0.74}
          allowUseOriginal={cropTarget.kind === 'singleUpload'}
          onConfirm={(croppedUrl) => void handleConfirmCrop(croppedUrl)}
          onUseOriginal={
            cropTarget.kind === 'singleUpload'
              ? () => void handleUseOriginalFromCrop()
              : undefined
          }
          onCancel={() => setCropTarget(null)}
        />
      )}
    </div>
  );
}
