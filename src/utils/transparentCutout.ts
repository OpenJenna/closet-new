/**
 * Automatic client-side transparent garment cutout with in-memory caching.
 * Uses strict lightness & local-edge guards so bright white/cream garments
 * keep 100% of their fabric intact while outer studio backgrounds become transparent.
 */

interface LabColor {
  l: number;
  a: number;
  b: number;
}

export interface CutoutResult {
  src: string;
  isTransparentCutout: boolean;
  aspectRatio: number;
}

const cutoutCache = new Map<string, Promise<CutoutResult>>();

function srgbToLab(r: number, g: number, b: number): LabColor {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;

  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function weightedBgDistance(
  l1: number,
  a1: number,
  b1: number,
  c: LabColor,
  lightnessWeight = 0.85
): number {
  const dl = (l1 - c.l) * lightnessWeight;
  const da = (a1 - c.a) * 1.2;
  const db = (b1 - c.b) * 1.2;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function stepLabDistance(
  l1: number,
  a1: number,
  b1: number,
  l2: number,
  a2: number,
  b2: number
): number {
  const dl = (l1 - l2) * 0.9;
  const da = (a1 - a2) * 1.15;
  const db = (b1 - b2) * 1.15;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function loadImageForCanvas(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function extractLightBorderClusters(
  w: number,
  h: number,
  lArr: Float32Array,
  aArr: Float32Array,
  bArr: Float32Array,
  alphaArr: Uint8ClampedArray
): { clusters: LabColor[]; transparentBorderRatio: number } {
  const samples: LabColor[] = [];
  let totalBorder = 0;
  let transparentBorder = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 100));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (x >= 3 && x < w - 3 && y >= 3 && y < h - 3) continue;
      totalBorder++;
      const idx = y * w + x;
      if (alphaArr[idx] < 128) {
        transparentBorder++;
        continue;
      }
      samples.push({ l: lArr[idx], a: aArr[idx], b: bArr[idx] });
    }
  }

  const transparentBorderRatio =
    totalBorder > 0 ? transparentBorder / totalBorder : 0;

  if (samples.length === 0) {
    return { clusters: [], transparentBorderRatio };
  }

  const clusters: { sumL: number; sumA: number; sumB: number; count: number }[] = [];
  const mergeRadius = 8;

  for (const s of samples) {
    let matched = false;
    for (const cl of clusters) {
      const avgL = cl.sumL / cl.count;
      const avgA = cl.sumA / cl.count;
      const avgB = cl.sumB / cl.count;
      const dist = Math.hypot((s.l - avgL) * 0.85, s.a - avgA, s.b - avgB);
      if (dist <= mergeRadius) {
        cl.sumL += s.l;
        cl.sumA += s.a;
        cl.sumB += s.b;
        cl.count++;
        matched = true;
        break;
      }
    }
    if (!matched && clusters.length < 16) {
      clusters.push({ sumL: s.l, sumA: s.a, sumB: s.b, count: 1 });
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  const minCount = Math.max(2, samples.length * 0.08);
  const topClusters = clusters
    .filter((cl, idx) => idx === 0 || cl.count >= minCount)
    .slice(0, 3)
    .map((cl) => ({
      l: cl.sumL / cl.count,
      a: cl.sumA / cl.count,
      b: cl.sumB / cl.count,
    }));

  return { clusters: topClusters, transparentBorderRatio };
}

function computeLocalEdgeStrength(
  w: number,
  h: number,
  lArr: Float32Array
): Float32Array {
  const grad = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const c = lArr[idx];
      const maxDiff = Math.max(
        Math.abs(c - lArr[idx - 1]),
        Math.abs(c - lArr[idx + 1]),
        Math.abs(c - lArr[idx - w]),
        Math.abs(c - lArr[idx + w])
      );
      grad[idx] = maxDiff;
    }
  }
  return grad;
}

function floodFillBorder(
  w: number,
  h: number,
  lArr: Float32Array,
  aArr: Float32Array,
  bArr: Float32Array,
  alphaArr: Uint8ClampedArray,
  gradArr: Float32Array,
  clusters: LabColor[],
  bgThreshold: number,
  stepThreshold: number,
  maxEdgeGrad: number,
  lightnessWeight: number
): { removed: Uint8Array; removedCount: number } {
  const total = w * h;
  const removed = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const minDist = (idx: number) => {
    const l = lArr[idx];
    const a = aArr[idx];
    const b = bArr[idx];
    let best = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const d = weightedBgDistance(l, a, b, clusters[i], lightnessWeight);
      if (d < best) best = d;
    }
    return best;
  };

  for (let x = 0; x < w; x++) {
    for (const idx of [x, (h - 1) * w + x]) {
      if (!visited[idx] && (alphaArr[idx] < 128 || minDist(idx) <= bgThreshold)) {
        visited[idx] = 1;
        removed[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const idx of [y * w, y * w + (w - 1)]) {
      if (!visited[idx] && (alphaArr[idx] < 128 || minDist(idx) <= bgThreshold)) {
        visited[idx] = 1;
        removed[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }

  let removedCount = tail;
  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = (curr - cx) / w;
    const cl = lArr[curr];
    const ca = aArr[curr];
    const cb = bArr[curr];

    for (let d = 0; d < 4; d++) {
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (visited[nIdx]) continue;
      visited[nIdx] = 1;

      if (alphaArr[nIdx] < 128) {
        removed[nIdx] = 1;
        queue[tail++] = nIdx;
        removedCount++;
        continue;
      }

      if (
        gradArr[nIdx] <= maxEdgeGrad &&
        minDist(nIdx) <= bgThreshold &&
        stepLabDistance(cl, ca, cb, lArr[nIdx], aArr[nIdx], bArr[nIdx]) <=
          stepThreshold
      ) {
        removed[nIdx] = 1;
        queue[tail++] = nIdx;
        removedCount++;
      }
    }
  }

  return { removed, removedCount };
}

/**
 * Detects if flood-fill leaked into a bright white/cream garment interior
 * by checking whether the center torso region has a large hollow cavity
 * flanked on both left and right sides by surviving sleeve/edge pixels.
 */
function hasInteriorGarmentLeak(
  w: number,
  h: number,
  removed: Uint8Array
): boolean {
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;

  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    for (let x = 0; x < w; x += 2) {
      if (!removed[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const fgW = maxX - minX;
  const fgH = maxY - minY;
  if (fgW < 20 || fgH < 20) return false;

  // Check center band (upper-mid torso area) for enclosed cavities bounded left, right, and bottom/top
  let hollowRows = 0;
  let checkedRows = 0;
  const yStart = Math.round(minY + fgH * 0.18);
  const yEnd = Math.round(minY + fgH * 0.68);
  const xLeftLim = Math.round(minX + fgW * 0.3);
  const xRightLim = Math.round(minX + fgW * 0.7);

  for (let y = yStart; y <= yEnd; y += 2) {
    const row = y * w;
    let firstFg = -1;
    let lastFg = -1;
    for (let x = minX; x <= maxX; x++) {
      if (!removed[row + x]) {
        if (firstFg === -1) firstFg = x;
        lastFg = x;
      }
    }
    if (firstFg === -1 || lastFg - firstFg < fgW * 0.45) continue;
    checkedRows++;

    let midRemoved = 0;
    let midTotal = 0;
    for (let x = Math.max(firstFg + 2, xLeftLim); x <= Math.min(lastFg - 2, xRightLim); x++) {
      midTotal++;
      if (removed[row + x]) midRemoved++;
    }
    if (midTotal > 4 && midRemoved / midTotal > 0.35) {
      hollowRows++;
    }
  }

  if (checkedRows >= 6 && hollowRows / checkedRows > 0.28) {
    // Distinguish true pants leg gap (open down to the bottom edge) vs eaten torso:
    // Check if there is foreground spanning across the middle near the bottom OR top collar
    const topBandY = Math.round(minY + fgH * 0.08);
    let topMidFg = 0;
    let topMidTotal = 0;
    for (let x = xLeftLim; x <= xRightLim; x++) {
      topMidTotal++;
      if (!removed[topBandY * w + x]) topMidFg++;
    }
    // If collar/shoulder region is solid or there's an upper-chest hole with wide flanks -> torso leak
    if (topMidTotal > 0 && topMidFg / topMidTotal < 0.85) {
      return true;
    }
    // Also check if bottom 15% still has foreground in the middle (e.g. hem intact below chest hole)
    const botY = Math.round(minY + fgH * 0.85);
    let botMidFg = 0;
    for (let x = xLeftLim; x <= xRightLim; x++) {
      if (!removed[botY * w + x]) botMidFg++;
    }
    if (topMidTotal > 0 && botMidFg / topMidTotal > 0.25) {
      return true;
    }
  }

  return false;
}

async function computeCutout(src: string): Promise<CutoutResult> {
  if (!src || src.startsWith('data:image/svg+xml')) {
    return { src, isTransparentCutout: true, aspectRatio: 1 };
  }

  const img = await loadImageForCanvas(src);
  if (!img) {
    return { src, isTransparentCutout: false, aspectRatio: 1 };
  }

  const naturalW = img.naturalWidth || img.width || 1;
  const naturalH = img.naturalHeight || img.height || 1;
  const naturalAspect = naturalW / naturalH;

  const maxDim = 560;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!workCtx) {
    return { src, isTransparentCutout: false, aspectRatio: naturalAspect };
  }

  workCtx.clearRect(0, 0, w, h);
  workCtx.drawImage(img, 0, 0, w, h);

  let imageData: ImageData;
  try {
    imageData = workCtx.getImageData(0, 0, w, h);
  } catch {
    return { src, isTransparentCutout: false, aspectRatio: naturalAspect };
  }

  const pixels = imageData.data;
  const total = w * h;
  const lArr = new Float32Array(total);
  const aArr = new Float32Array(total);
  const bArr = new Float32Array(total);
  const alphaArr = new Uint8ClampedArray(total);

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const lab = srgbToLab(pixels[p], pixels[p + 1], pixels[p + 2]);
    lArr[i] = lab.l;
    aArr[i] = lab.a;
    bArr[i] = lab.b;
    alphaArr[i] = pixels[p + 3];
  }

  const { clusters, transparentBorderRatio } = extractLightBorderClusters(
    w,
    h,
    lArr,
    aArr,
    bArr,
    alphaArr
  );

  let removedMask: Uint8Array | null = null;

  if (transparentBorderRatio >= 0.75) {
    removedMask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (alphaArr[i] < 128) removedMask[i] = 1;
    }
  } else if (clusters.length > 0) {
    const gradArr = computeLocalEdgeStrength(w, h, lArr);
    const primary = clusters[0];
    const primaryChroma = Math.hypot(primary.a, primary.b);
    const isPureWhiteBackdrop = primary.l >= 96 && primaryChroma <= 4.5;
    const isLightStudio = primary.l >= 78 && primaryChroma <= 14;

    const attempts: Array<[number, number, number, number]> = isPureWhiteBackdrop
      ? [
          // Conservative pure-white passes so bright white top edges never get chewed
          [2.4, 1.6, 3.6, 0.98],
          [1.5, 1.1, 2.5, 1.0],
          [1.0, 0.8, 2.0, 1.0],
        ]
      : isLightStudio
        ? [
            [7.0, 4.5, 6.2, 0.88],
            [4.2, 2.8, 4.2, 0.94],
            [2.2, 1.6, 2.8, 0.96],
          ]
        : [
            [9.5, 6.2, 8.0, 0.72],
            [5.5, 3.8, 5.5, 0.85],
          ];

    let lastLeaked = false;
    for (const [bgT, stepT, gradMax, lWeight] of attempts) {
      const attempt = floodFillBorder(
        w,
        h,
        lArr,
        aArr,
        bArr,
        alphaArr,
        gradArr,
        clusters,
        bgT,
        stepT,
        gradMax,
        lWeight
      );
      const fgRatio = (total - attempt.removedCount) / total;
      const leaked = hasInteriorGarmentLeak(w, h, attempt.removed);
      lastLeaked = leaked;

      if (!leaked && fgRatio >= 0.14 && fgRatio <= 0.985) {
        removedMask = attempt.removed;
        break;
      }
      // Always keep the strictest attempt as fallback if earlier ones leaked
      removedMask = attempt.removed;
    }

    if (!removedMask || lastLeaked) {
      return { src, isTransparentCutout: false, aspectRatio: naturalAspect };
    }

    // Morphological edge smoothing: heal 1-2px chewed notches & trim stray 1px stair-step spikes
    let mask: Uint8Array = removedMask;
    for (let pass = 0; pass < 2; pass++) {
      const smoothed = new Uint8Array(mask);
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          let fgNeighbors = 0;
          if (!mask[idx - w - 1]) fgNeighbors++;
          if (!mask[idx - w]) fgNeighbors++;
          if (!mask[idx - w + 1]) fgNeighbors++;
          if (!mask[idx - 1]) fgNeighbors++;
          if (!mask[idx + 1]) fgNeighbors++;
          if (!mask[idx + w - 1]) fgNeighbors++;
          if (!mask[idx + w]) fgNeighbors++;
          if (!mask[idx + w + 1]) fgNeighbors++;

          if (mask[idx]) {
            // Heal narrow chewed notch along bright garment contour
            if (fgNeighbors >= 5) {
              smoothed[idx] = 0;
            }
          } else {
            // Trim isolated 1px fringe tooth sticking into background
            if (fgNeighbors <= 2) {
              smoothed[idx] = 1;
            }
          }
        }
      }
      mask = smoothed;
    }

    // Compute clean binary alpha first, then apply 3x3 Gaussian anti-aliasing ONLY on boundary edges
    const baseAlpha = new Uint8ClampedArray(total);
    for (let i = 0; i < total; i++) {
      baseAlpha[i] = mask[i] ? 0 : alphaArr[i];
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const p = idx * 4;
        if (mask[idx]) {
          pixels[p + 3] = 0;
          continue;
        }

        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
          pixels[p + 3] = baseAlpha[idx];
          continue;
        }

        // Check if this foreground pixel touches any removed background neighbor (8-connected)
        const touchesBg =
          mask[idx - w - 1] ||
          mask[idx - w] ||
          mask[idx - w + 1] ||
          mask[idx - 1] ||
          mask[idx + 1] ||
          mask[idx + w - 1] ||
          mask[idx + w] ||
          mask[idx + w + 1];

        if (!touchesBg) {
          pixels[p + 3] = baseAlpha[idx];
          continue;
        }

        // 3x3 Gaussian alpha anti-aliasing [1 2 1; 2 4 2; 1 2 1] / 16
        const aaAlpha =
          (baseAlpha[idx - w - 1] +
            baseAlpha[idx - w] * 2 +
            baseAlpha[idx - w + 1] +
            baseAlpha[idx - 1] * 2 +
            baseAlpha[idx] * 4 +
            baseAlpha[idx + 1] * 2 +
            baseAlpha[idx + w - 1] +
            baseAlpha[idx + w] * 2 +
            baseAlpha[idx + w + 1]) /
          16;

        // Keep bright garment edges solid enough so white fabric never looks eroded
        const minEdgeAlpha = isPureWhiteBackdrop ? 135 : 85;
        pixels[p + 3] = Math.round(Math.max(minEdgeAlpha, aaAlpha));
      }
    }
    workCtx.putImageData(imageData, 0, 0);
  } else {
    return { src, isTransparentCutout: false, aspectRatio: naturalAspect };
  }

  // Tight-crop to foreground garment bounds (ignoring tiny 1-2px isolated speckles)
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (pixels[idx * 4 + 3] > 32) {
        // Require at least 1 opaque neighbor to skip single-pixel edge dust
        const hasNeighbor =
          (x > 0 && pixels[(idx - 1) * 4 + 3] > 32) ||
          (x < w - 1 && pixels[(idx + 1) * 4 + 3] > 32) ||
          (y > 0 && pixels[(idx - w) * 4 + 3] > 32) ||
          (y < h - 1 && pixels[(idx + w) * 4 + 3] > 32);
        if (!hasNeighbor) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { src, isTransparentCutout: false, aspectRatio: naturalAspect };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const pad = Math.max(2, Math.round(Math.max(cropW, cropH) * 0.02));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW + pad * 2;
  outCanvas.height = cropH + pad * 2;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { src, isTransparentCutout: false, aspectRatio: naturalAspect };
  }

  outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(workCanvas, minX, minY, cropW, cropH, pad, pad, cropW, cropH);
  const croppedAspect = outCanvas.width / outCanvas.height;

  const blobUrl = await new Promise<string | null>((resolve) => {
    outCanvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });

  if (blobUrl) {
    return { src: blobUrl, isTransparentCutout: true, aspectRatio: croppedAspect };
  }

  return {
    src: outCanvas.toDataURL('image/png'),
    isTransparentCutout: true,
    aspectRatio: croppedAspect,
  };
}

export function getTransparentGarmentCutout(
  src: string
): Promise<CutoutResult> {
  const existing = cutoutCache.get(src);
  if (existing) return existing;

  const task = computeCutout(src).catch(() => ({
    src,
    isTransparentCutout: false,
    aspectRatio: 1,
  }));
  cutoutCache.set(src, task);
  return task;
}
