import { useEffect, useMemo, useRef, useState } from 'react';
import { WardrobeItem } from '../types/wardrobe';
import {
  COLLAGE_OFFSETS_CHANGED_EVENT,
  CollageItemOffset,
  CollageOffsetsMap,
  computeCollageSlots,
  getLookCustomOffsets,
  resolveLookItems,
  setLookItemOffset,
} from '../utils/collageLayout';
import { CutoutResult, getTransparentGarmentCutout } from '../utils/transparentCutout';
import { GarmentVisual } from './GarmentGraphic';

interface OutfitCollageProps {
  items: WardrobeItem[];
  lookId?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  selectedItemId?: string | null;
  draggable?: boolean;
  itemOffsets?: CollageOffsetsMap;
  onItemTap?: (itemId: string) => void;
  onItemOffsetChange?: (itemId: string, offset: CollageItemOffset) => void;
}

const DRAG_THRESHOLD_PX = 5;

function clampDragOffset(val: number): number {
  return Math.max(-0.45, Math.min(0.45, val));
}

/**
 * Arranges linked wardrobe items into an editorial flat-lay lookbook collage
 * with transparent garment cutouts, balanced 4:6 upper/lower proportions,
 * tap-to-swap ordering, and smooth drag-to-reposition fine tuning.
 */
export function OutfitCollage({
  items,
  lookId,
  size = 'md',
  className = '',
  selectedItemId = null,
  draggable = false,
  itemOffsets,
  onItemTap,
  onItemOffsetChange,
}: OutfitCollageProps) {
  const orderedItems = useMemo(
    () => resolveLookItems(lookId, items),
    [lookId, items]
  );

  const [cutoutsByItemId, setCutoutsByItemId] = useState<
    Record<string, CutoutResult>
  >({});

  const [storedOffsetsVersion, setStoredOffsetsVersion] = useState(0);

  useEffect(() => {
    if (itemOffsets !== undefined || !lookId) return;
    const handleUpdate = () => setStoredOffsetsVersion((v) => v + 1);
    window.addEventListener(COLLAGE_OFFSETS_CHANGED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(COLLAGE_OFFSETS_CHANGED_EVENT, handleUpdate);
    };
  }, [itemOffsets, lookId]);

  const baseOffsets: CollageOffsetsMap = useMemo(() => {
    if (itemOffsets !== undefined) return itemOffsets;
    void storedOffsetsVersion;
    return getLookCustomOffsets(lookId);
  }, [itemOffsets, lookId, storedOffsetsVersion]);

  const [liveDrag, setLiveDrag] = useState<{
    itemId: string;
    dx: number;
    dy: number;
  } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerStateRef = useRef<{
    itemId: string;
    pointerId: number;
    startX: number;
    startY: number;
    origDx: number;
    origDy: number;
    stageW: number;
    stageH: number;
    moved: boolean;
    lastDx: number;
    lastDy: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const withUrls = orderedItems.filter((it) => Boolean(it.imageUrl));
    if (withUrls.length === 0) {
      setCutoutsByItemId({});
      return;
    }

    Promise.all(
      withUrls.map(async (it) => {
        const res = await getTransparentGarmentCutout(it.imageUrl!);
        return [it.id, res] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, CutoutResult> = {};
      for (const [id, res] of entries) {
        next[id] = res;
      }
      setCutoutsByItemId(next);
    });

    return () => {
      cancelled = true;
    };
  }, [orderedItems]);

  const aspectRatiosById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of orderedItems) {
      const c = cutoutsByItemId[it.id];
      if (c && c.aspectRatio > 0) {
        map[it.id] = c.aspectRatio;
      }
    }
    return map;
  }, [orderedItems, cutoutsByItemId]);

  const effectiveOffsets = useMemo(() => {
    if (!liveDrag) return baseOffsets;
    return {
      ...baseOffsets,
      [liveDrag.itemId]: { dx: liveDrag.dx, dy: liveDrag.dy },
    };
  }, [baseOffsets, liveDrag]);

  const slots = useMemo(
    () => computeCollageSlots(orderedItems, aspectRatiosById, effectiveOffsets),
    [orderedItems, aspectRatiosById, effectiveOffsets]
  );

  const handlePointerDown = (
    itemId: string,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!draggable) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const rect = stageEl.getBoundingClientRect();
    const orig = baseOffsets[itemId] ?? { dx: 0, dy: 0 };

    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStateRef.current = {
      itemId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origDx: orig.dx,
      origDy: orig.dy,
      stageW: Math.max(1, rect.width),
      stageH: Math.max(1, rect.height),
      moved: false,
      lastDx: orig.dx,
      lastDy: orig.dy,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = pointerStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;

    const deltaPxX = e.clientX - st.startX;
    const deltaPxY = e.clientY - st.startY;
    if (!st.moved && Math.hypot(deltaPxX, deltaPxY) < DRAG_THRESHOLD_PX) {
      return;
    }

    st.moved = true;
    const nextDx = clampDragOffset(st.origDx + deltaPxX / st.stageW);
    const nextDy = clampDragOffset(st.origDy + deltaPxY / st.stageH);
    st.lastDx = nextDx;
    st.lastDy = nextDy;
    setLiveDrag({ itemId: st.itemId, dx: nextDx, dy: nextDy });
  };

  const finishPointerDrag = (
    e: React.PointerEvent<HTMLButtonElement>,
    cancelled = false
  ) => {
    const st = pointerStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    pointerStateRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if capture already released
      }
    }

    const didMove = st.moved;
    setLiveDrag(null);

    if (didMove) {
      if (!cancelled) {
        const finalOffset: CollageItemOffset = {
          dx: Math.round(st.lastDx * 1000) / 1000,
          dy: Math.round(st.lastDy * 1000) / 1000,
        };
        if (onItemOffsetChange) {
          onItemOffsetChange(st.itemId, finalOffset);
        } else if (lookId) {
          setLookItemOffset(lookId, st.itemId, finalOffset);
        }
      }
      return;
    }

    if (!cancelled && onItemTap) {
      onItemTap(st.itemId);
    }
  };

  if (orderedItems.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-[#F7F8FA] text-slate-400 text-xs ${className}`}
      >
        아이템 없음
      </div>
    );
  }

  const paddingClass =
    size === 'xs' ? 'p-0.5' : size === 'sm' ? 'p-1' : size === 'lg' ? 'p-2.5' : 'p-1.5';

  const interactive = Boolean(draggable || onItemTap);

  return (
    <div
      className={`relative w-full h-full bg-white overflow-hidden select-none ${paddingClass} ${className}`}
    >
      <div ref={stageRef} className="relative w-full h-full">
        {slots.map(({ item, box }, idx) => {
          const isDragging = liveDrag?.itemId === item.id;
          const isSelected = Boolean(onItemTap && selectedItemId === item.id);
          const isSwapTarget = Boolean(
            onItemTap && selectedItemId && selectedItemId !== item.id
          );
          const cutout = cutoutsByItemId[item.id];
          const resolvedProp = cutout
            ? { src: cutout.src, isTransparent: cutout.isTransparentCutout }
            : undefined;
          const style: React.CSSProperties = {
            left: `${box.left * 100}%`,
            top: `${box.top * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
            zIndex: isDragging ? 30 : isSelected ? 20 : box.zIndex,
          };

          if (interactive) {
            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                style={style}
                aria-label={`${item.name} 위치 조절 또는 배치 선택`}
                aria-pressed={isSelected}
                onPointerDown={
                  draggable ? (e) => handlePointerDown(item.id, e) : undefined
                }
                onPointerMove={draggable ? handlePointerMove : undefined}
                onPointerUp={
                  draggable ? (e) => finishPointerDrag(e, false) : undefined
                }
                onPointerCancel={
                  draggable ? (e) => finishPointerDrag(e, true) : undefined
                }
                onClick={
                  !draggable && onItemTap ? () => onItemTap(item.id) : undefined
                }
                className={`absolute flex items-center justify-center rounded-xl ${
                  isDragging
                    ? 'scale-[1.03] drop-shadow-md cursor-grabbing ring-2 ring-[#2563EB]/70 bg-blue-50/20'
                    : `transition-all duration-200 ${
                        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'ring-2 ring-[#2563EB] bg-blue-50/35 scale-[1.03]'
                          : isSwapTarget
                            ? 'hover:ring-2 hover:ring-slate-300/70'
                            : ''
                      }`
                } ${draggable ? 'touch-none' : 'touch-manipulation'}`}
              >
                <GarmentVisual
                  item={item}
                  transparentCutout
                  resolvedCutout={resolvedProp}
                  className="w-full h-full pointer-events-none"
                />
              </button>
            );
          }

          return (
            <div
              key={`${item.id}-${idx}`}
              style={style}
              className="absolute flex items-center justify-center transition-all duration-200"
            >
              <GarmentVisual
                item={item}
                transparentCutout
                resolvedCutout={resolvedProp}
                className="w-full h-full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
