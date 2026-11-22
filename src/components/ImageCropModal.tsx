import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, Maximize2, RotateCw, X } from 'lucide-react';
import { compressDataUrlImage } from '../utils/imageCompression';

type AspectPreset = 'free' | '1:1' | '4:5' | '3:4';

type DragHandle =
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'w'
  | 'e';

interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

interface ImageCropModalProps {
  imageSrc: string;
  title?: string;
  maxDimension?: number;
  quality?: number;
  allowUseOriginal?: boolean;
  onConfirm: (croppedDataUrl: string) => void;
  onUseOriginal?: () => void;
  onCancel: () => void;
}

const ASPECT_OPTIONS: { id: AspectPreset; label: string; ratio: number | null }[] = [
  { id: 'free', label: '자유', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
];

const MIN_NORM_SIZE = 0.1;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function getRatioValue(preset: AspectPreset): number | null {
  const found = ASPECT_OPTIONS.find((opt) => opt.id === preset);
  return found ? found.ratio : null;
}

function buildCenteredCrop(
  imgRatio: number,
  targetRatio: number | null,
  fillScale = 0.92
): CropRect {
  if (!targetRatio) {
    return { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
  }
  // w / h = targetRatio / imgRatio
  const normAspect = targetRatio / imgRatio;
  let w: number;
  let h: number;
  if (normAspect >= 1) {
    w = fillScale;
    h = w / normAspect;
    if (h > fillScale) {
      h = fillScale;
      w = h * normAspect;
    }
  } else {
    h = fillScale;
    w = h * normAspect;
    if (w > fillScale) {
      w = fillScale;
      h = w / normAspect;
    }
  }
  return {
    x: (1 - w) / 2,
    y: (1 - h) / 2,
    w,
    h,
  };
}

export function ImageCropModal({
  imageSrc,
  title = '사진 자르기',
  maxDimension = 560,
  quality = 0.76,
  allowUseOriginal = false,
  onConfirm,
  onUseOriginal,
  onCancel,
}: ImageCropModalProps) {
  const [workingSrc, setWorkingSrc] = useState(imageSrc);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({
    w: 320,
    h: 320,
  });
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('free');
  const [crop, setCrop] = useState<CropRect>({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 });
  const [applying, setApplying] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    handle: DragHandle;
    startClientX: number;
    startClientY: number;
    startCrop: CropRect;
    displayW: number;
    displayH: number;
  } | null>(null);

  useEffect(() => {
    setWorkingSrc(imageSrc);
    setNaturalSize(null);
    setAspectPreset('free');
    setCrop({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 });
    setError(null);
  }, [imageSrc]);

  // Measure available stage area for exact fitted image display box
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const pad = 28;
      setStageSize({
        w: Math.max(160, rect.width - pad * 2),
        h: Math.max(160, rect.height - pad * 2),
      });
    };

    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Escape key closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applying) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [applying, onCancel]);

  const imgRatio = naturalSize ? naturalSize.w / naturalSize.h : 1;

  const displayBox = (() => {
    if (!naturalSize) {
      return { w: Math.min(stageSize.w, 300), h: Math.min(stageSize.h, 300) };
    }
    const stageRatio = stageSize.w / stageSize.h;
    if (imgRatio > stageRatio) {
      const w = stageSize.w;
      return { w, h: w / imgRatio };
    }
    const h = stageSize.h;
    return { w: h * imgRatio, h };
  })();

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth || img.width || 1;
    const nh = img.naturalHeight || img.height || 1;
    setNaturalSize({ w: nw, h: nh });
    const ratio = getRatioValue(aspectPreset);
    setCrop(buildCenteredCrop(nw / nh, ratio, ratio ? 0.92 : 0.94));
  };

  const handleSelectAspect = (preset: AspectPreset) => {
    setAspectPreset(preset);
    const ratio = getRatioValue(preset);
    if (!ratio) return;
    setCrop(buildCenteredCrop(imgRatio, ratio, 0.9));
  };

  const handleResetCrop = () => {
    const ratio = getRatioValue(aspectPreset);
    if (!ratio) {
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
    } else {
      setCrop(buildCenteredCrop(imgRatio, ratio, 1));
    }
  };

  const handleRotate90 = async () => {
    const img = imgRef.current;
    if (!img || rotating || applying) return;

    setRotating(true);
    setError(null);
    try {
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(nw, nh));
      const drawW = Math.max(1, Math.round(nw * scale));
      const drawH = Math.max(1, Math.round(nh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = drawH;
      canvas.height = drawW;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');

      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, drawW, drawH);

      const rotatedUrl = canvas.toDataURL('image/png');
      setWorkingSrc(rotatedUrl);
      setNaturalSize(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '이미지 회전 중 오류가 발생했습니다.'
      );
    } finally {
      setRotating(false);
    }
  };

  const startDrag = (handle: DragHandle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCrop: { ...crop },
      displayW: Math.max(1, displayBox.w),
      displayH: Math.max(1, displayBox.h),
    };
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      e.preventDefault();

      const dx = (e.clientX - drag.startClientX) / drag.displayW;
      const dy = (e.clientY - drag.startClientY) / drag.displayH;
      const s = drag.startCrop;
      const targetRatio = getRatioValue(aspectPreset);

      if (drag.handle === 'move') {
        setCrop({
          x: clamp(s.x + dx, 0, 1 - s.w),
          y: clamp(s.y + dy, 0, 1 - s.h),
          w: s.w,
          h: s.h,
        });
        return;
      }

      if (!targetRatio) {
        // Freeform resize
        let left = s.x;
        let top = s.y;
        let right = s.x + s.w;
        let bottom = s.y + s.h;

        if (drag.handle.includes('w')) {
          left = clamp(s.x + dx, 0, right - MIN_NORM_SIZE);
        }
        if (drag.handle.includes('e')) {
          right = clamp(s.x + s.w + dx, left + MIN_NORM_SIZE, 1);
        }
        if (drag.handle.includes('n')) {
          top = clamp(s.y + dy, 0, bottom - MIN_NORM_SIZE);
        }
        if (drag.handle.includes('s')) {
          bottom = clamp(s.y + s.h + dy, top + MIN_NORM_SIZE, 1);
        }

        setCrop({
          x: left,
          y: top,
          w: Math.max(MIN_NORM_SIZE, right - left),
          h: Math.max(MIN_NORM_SIZE, bottom - top),
        });
        return;
      }

      // Locked aspect ratio: w = h * normAspect
      const normAspect = targetRatio / imgRatio;
      const minH = Math.max(MIN_NORM_SIZE, MIN_NORM_SIZE / normAspect);

      const fitCorner = (
        anchorX: number,
        anchorY: number,
        dirX: -1 | 1,
        dirY: -1 | 1,
        rawW: number,
        rawH: number
      ): CropRect => {
        const maxW = dirX === 1 ? 1 - anchorX : anchorX;
        const maxH = dirY === 1 ? 1 - anchorY : anchorY;
        const maxAllowedH = Math.min(maxH, maxW / normAspect);
        const desiredH =
          Math.abs(rawW / normAspect - s.h) > Math.abs(rawH - s.h)
            ? rawW / normAspect
            : rawH;
        const h = clamp(desiredH, Math.min(minH, maxAllowedH), maxAllowedH);
        const w = h * normAspect;
        return {
          x: dirX === 1 ? anchorX : anchorX - w,
          y: dirY === 1 ? anchorY : anchorY - h,
          w,
          h,
        };
      };

      if (drag.handle === 'se') {
        setCrop(fitCorner(s.x, s.y, 1, 1, s.w + dx, s.h + dy));
      } else if (drag.handle === 'sw') {
        setCrop(fitCorner(s.x + s.w, s.y, -1, 1, s.w - dx, s.h + dy));
      } else if (drag.handle === 'ne') {
        setCrop(fitCorner(s.x, s.y + s.h, 1, -1, s.w + dx, s.h - dy));
      } else if (drag.handle === 'nw') {
        setCrop(fitCorner(s.x + s.w, s.y + s.h, -1, -1, s.w - dx, s.h - dy));
      } else if (drag.handle === 'e' || drag.handle === 'w') {
        const cy = s.y + s.h / 2;
        const rawW = drag.handle === 'e' ? s.w + dx : s.w - dx;
        const anchorX = drag.handle === 'e' ? s.x : s.x + s.w;
        const maxW = drag.handle === 'e' ? 1 - anchorX : anchorX;
        const maxHalfH = Math.min(cy, 1 - cy);
        const maxAllowedW = Math.min(maxW, maxHalfH * 2 * normAspect);
        const w = clamp(rawW, Math.min(MIN_NORM_SIZE, maxAllowedW), maxAllowedW);
        const h = w / normAspect;
        setCrop({
          x: drag.handle === 'e' ? anchorX : anchorX - w,
          y: clamp(cy - h / 2, 0, 1 - h),
          w,
          h,
        });
      } else if (drag.handle === 'n' || drag.handle === 's') {
        const cx = s.x + s.w / 2;
        const rawH = drag.handle === 's' ? s.h + dy : s.h - dy;
        const anchorY = drag.handle === 's' ? s.y : s.y + s.h;
        const maxH = drag.handle === 's' ? 1 - anchorY : anchorY;
        const maxHalfW = Math.min(cx, 1 - cx);
        const maxAllowedH = Math.min(maxH, (maxHalfW * 2) / normAspect);
        const h = clamp(rawH, Math.min(minH, maxAllowedH), maxAllowedH);
        const w = h * normAspect;
        setCrop({
          x: clamp(cx - w / 2, 0, 1 - w),
          y: drag.handle === 's' ? anchorY : anchorY - h,
          w,
          h,
        });
      }
    },
    [aspectPreset, imgRatio]
  );

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  const handleApplyCrop = async () => {
    const img = imgRef.current;
    if (!img || !naturalSize || applying) return;

    setApplying(true);
    setError(null);
    try {
      const sx = Math.max(0, Math.round(crop.x * naturalSize.w));
      const sy = Math.max(0, Math.round(crop.y * naturalSize.h));
      const sw = Math.max(1, Math.min(naturalSize.w - sx, Math.round(crop.w * naturalSize.w)));
      const sh = Math.max(1, Math.min(naturalSize.h - sy, Math.round(crop.h * naturalSize.h)));

      const outScale = Math.min(1, maxDimension / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * outScale));
      const outH = Math.max(1, Math.round(sh * outScale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('크롭 캔버스를 생성할 수 없습니다.');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      const rawCroppedPng = canvas.toDataURL('image/png');
      const compressed = await compressDataUrlImage(
        rawCroppedPng,
        maxDimension,
        quality
      );
      onConfirm(compressed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '이미지 크롭 처리 중 오류가 발생했습니다.'
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-[#111315]" />
            <div>
              <h3 className="text-sm font-bold text-[#111315]">{title}</h3>
              <p className="text-[11px] text-[#5B616E]">
                모서리나 테두리를 드래그해 옷 영역만 깔끔하게 잘라주세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={applying}
            onClick={onCancel}
            aria-label="닫기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Interactive Crop Stage */}
        <div
          ref={stageRef}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative flex-1 min-h-[290px] sm:min-h-[360px] max-h-[56vh] bg-[#141619] flex items-center justify-center overflow-hidden select-none touch-none"
        >
          <div
            className="relative overflow-hidden shadow-xl"
            style={{
              width: `${displayBox.w}px`,
              height: `${displayBox.h}px`,
            }}
          >
            <img
              ref={imgRef}
              src={workingSrc}
              crossOrigin={
                workingSrc.startsWith('http://') || workingSrc.startsWith('https://')
                  ? 'anonymous'
                  : undefined
              }
              alt="크롭 대상 이미지"
              onLoad={handleImageLoad}
              draggable={false}
              className="w-full h-full block pointer-events-none select-none object-fill"
            />

            {naturalSize && (
              <div
                onPointerDown={(e) => startDrag('move', e)}
                className="absolute cursor-move touch-none"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.56)',
                }}
              >
                {/* Crisp outer border */}
                <div className="absolute inset-0 border border-white/95 pointer-events-none" />

                {/* Rule of thirds grid */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
                </div>

                {/* Edge handles */}
                <div
                  onPointerDown={(e) => startDrag('n', e)}
                  className="absolute -top-3 left-5 right-5 h-6 cursor-ns-resize touch-none flex items-center justify-center"
                >
                  <span className="w-8 h-1 rounded-full bg-white shadow-xs" />
                </div>
                <div
                  onPointerDown={(e) => startDrag('s', e)}
                  className="absolute -bottom-3 left-5 right-5 h-6 cursor-ns-resize touch-none flex items-center justify-center"
                >
                  <span className="w-8 h-1 rounded-full bg-white shadow-xs" />
                </div>
                <div
                  onPointerDown={(e) => startDrag('w', e)}
                  className="absolute -left-3 top-5 bottom-5 w-6 cursor-ew-resize touch-none flex items-center justify-center"
                >
                  <span className="h-8 w-1 rounded-full bg-white shadow-xs" />
                </div>
                <div
                  onPointerDown={(e) => startDrag('e', e)}
                  className="absolute -right-3 top-5 bottom-5 w-6 cursor-ew-resize touch-none flex items-center justify-center"
                >
                  <span className="h-8 w-1 rounded-full bg-white shadow-xs" />
                </div>

                {/* Corner handles with generous touch hit areas */}
                <div
                  onPointerDown={(e) => startDrag('nw', e)}
                  className="absolute -top-3.5 -left-3.5 w-8 h-8 cursor-nwse-resize touch-none flex items-center justify-center"
                >
                  <span className="w-4 h-4 border-t-[3px] border-l-[3px] border-white rounded-tl-[2px] translate-x-1 translate-y-1 shadow-xs" />
                </div>
                <div
                  onPointerDown={(e) => startDrag('ne', e)}
                  className="absolute -top-3.5 -right-3.5 w-8 h-8 cursor-nesw-resize touch-none flex items-center justify-center"
                >
                  <span className="w-4 h-4 border-t-[3px] border-r-[3px] border-white rounded-tr-[2px] -translate-x-1 translate-y-1 shadow-xs" />
                </div>
                <div
                  onPointerDown={(e) => startDrag('sw', e)}
                  className="absolute -bottom-3.5 -left-3.5 w-8 h-8 cursor-nesw-resize touch-none flex items-center justify-center"
                >
                  <span className="w-4 h-4 border-b-[3px] border-l-[3px] border-white rounded-bl-[2px] translate-x-1 -translate-y-1 shadow-xs" />
                </div>
                <div
                  onPointerDown={(e) => startDrag('se', e)}
                  className="absolute -bottom-3.5 -right-3.5 w-8 h-8 cursor-nwse-resize touch-none flex items-center justify-center"
                >
                  <span className="w-4 h-4 border-b-[3px] border-r-[3px] border-white rounded-br-[2px] -translate-x-1 -translate-y-1 shadow-xs" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls Footer */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 space-y-3.5 shrink-0">
          {/* Aspect Ratio + Rotate + Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-0.5 rounded-xl bg-[#F3F4F6] border border-slate-200/70">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectAspect(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    aspectPreset === opt.id
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#5B616E] hover:text-[#111315]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={rotating || applying}
                onClick={() => void handleRotate90()}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-[#111315] hover:bg-[#F7F8FA] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
                <span>회전</span>
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={handleResetCrop}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-[#5B616E] hover:text-[#111315] hover:bg-[#F7F8FA] inline-flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>전체</span>
              </button>
            </div>
          </div>

          {/* Confirm / Skip / Cancel Actions */}
          <div className="flex items-center justify-end gap-2">
            {allowUseOriginal && onUseOriginal ? (
              <button
                type="button"
                disabled={applying}
                onClick={onUseOriginal}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#5B616E] hover:text-[#111315] hover:bg-slate-50 cursor-pointer"
              >
                원본 그대로 사용
              </button>
            ) : (
              <button
                type="button"
                disabled={applying}
                onClick={onCancel}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#5B616E] hover:bg-slate-50 cursor-pointer"
              >
                취소
              </button>
            )}
            <button
              type="button"
              disabled={applying || !naturalSize}
              onClick={() => void handleApplyCrop()}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{applying ? '적용 중...' : '크롭 적용'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
