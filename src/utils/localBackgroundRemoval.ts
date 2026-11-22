/**
 * Zero-cost, client-side background removal for clothing photos.
 * Uses Lab color space border clustering + 4-connected edge-aware flood fill,
 * soft boundary feathering, and automatic tight square framing (transparent WebP).
 */

interface LabColor {
  l: number;
  a: number;
  b: number;
}

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

/**
 * Perceptual Lab distance that gives extra tolerance to lightness shadows (L*)
 * while staying strict on chromaticity shifts (a*, b*).
 */
function weightedBgDistance(
  l1: number,
  a1: number,
  b1: number,
  c: LabColor
): number {
  const dl = (l1 - c.l) * 0.48;
  const da = (a1 - c.a) * 1.15;
  const db = (b1 - c.b) * 1.15;
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
  const dl = (l1 - l2) * 0.55;
  const da = (a1 - a2) * 1.1;
  const db = (b1 - b2) * 1.1;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function extractBorderClusters(
  w: number,
  h: number,
  lArr: Float32Array,
  aArr: Float32Array,
  bArr: Float32Array,
  alphaArr: Uint8ClampedArray
): LabColor[] {
  const borderSamples: LabColor[] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 120));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (x >= 4 && x < w - 4 && y >= 4 && y < h - 4) continue;
      const idx = y * w + x;
      if (alphaArr[idx] < 128) continue;
      borderSamples.push({
        l: lArr[idx],
        a: aArr[idx],
        b: bArr[idx],
      });
    }
  }

  if (borderSamples.length === 0) return [];

  // Greedy clustering to capture up to 4 dominant outer background tones
  const clusters: { sumL: number; sumA: number; sumB: number; count: number }[] = [];
  const mergeRadius = 11;

  for (const s of borderSamples) {
    let matched = false;
    for (const cl of clusters) {
      const avgL = cl.sumL / cl.count;
      const avgA = cl.sumA / cl.count;
      const avgB = cl.sumB / cl.count;
      const dist = Math.hypot((s.l - avgL) * 0.65, s.a - avgA, s.b - avgB);
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
  const minClusterCount = Math.max(2, borderSamples.length * 0.05);

  return clusters
    .filter((cl, idx) => idx === 0 || cl.count >= minClusterCount)
    .slice(0, 4)
    .map((cl) => ({
      l: cl.sumL / cl.count,
      a: cl.sumA / cl.count,
      b: cl.sumB / cl.count,
    }));
}

function runFloodFillMask(
  w: number,
  h: number,
  lArr: Float32Array,
  aArr: Float32Array,
  bArr: Float32Array,
  alphaArr: Uint8ClampedArray,
  clusters: LabColor[],
  bgThreshold: number,
  stepThreshold: number
): { removed: Uint8Array; removedCount: number } {
  const total = w * h;
  const removed = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const minClusterDist = (idx: number) => {
    const l = lArr[idx];
    const a = aArr[idx];
    const b = bArr[idx];
    let best = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const d = weightedBgDistance(l, a, b, clusters[i]);
      if (d < best) best = d;
    }
    return best;
  };

  // Seed outer 1px border
  for (let x = 0; x < w; x++) {
    const topIdx = x;
    const botIdx = (h - 1) * w + x;
    if (alphaArr[topIdx] < 128 || minClusterDist(topIdx) <= bgThreshold) {
      visited[topIdx] = 1;
      removed[topIdx] = 1;
      queue[tail++] = topIdx;
    }
    if (!visited[botIdx] && (alphaArr[botIdx] < 128 || minClusterDist(botIdx) <= bgThreshold)) {
      visited[botIdx] = 1;
      removed[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    const leftIdx = y * w;
    const rightIdx = y * w + (w - 1);
    if (!visited[leftIdx] && (alphaArr[leftIdx] < 128 || minClusterDist(leftIdx) <= bgThreshold)) {
      visited[leftIdx] = 1;
      removed[leftIdx] = 1;
      queue[tail++] = leftIdx;
    }
    if (!visited[rightIdx] && (alphaArr[rightIdx] < 128 || minClusterDist(rightIdx) <= bgThreshold)) {
      visited[rightIdx] = 1;
      removed[rightIdx] = 1;
      queue[tail++] = rightIdx;
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

      const bgDist = minClusterDist(nIdx);
      const stepDist = stepLabDistance(cl, ca, cb, lArr[nIdx], aArr[nIdx], bArr[nIdx]);

      if (bgDist <= bgThreshold && stepDist <= stepThreshold) {
        removed[nIdx] = 1;
        queue[tail++] = nIdx;
        removedCount++;
      }
    }
  }

  return { removed, removedCount };
}

/**
 * Removes background pixels from a clothing photo locally in the browser (free, no API call),
 * centers the foreground garment in a clean 1:1 transparent WebP frame (with JPEG fallback).
 */
export async function removeBackgroundLocally(
  sourceDataUrl: string,
  maxDimension = 560,
  options?: { strictWhiteOnly?: boolean }
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    el.onload = () => resolve(el);
    el.src = sourceDataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!workCtx) {
    throw new Error('이미지 캔버스를 초기화할 수 없습니다.');
  }

  workCtx.clearRect(0, 0, w, h);
  workCtx.drawImage(img, 0, 0, w, h);
  const imageData = workCtx.getImageData(0, 0, w, h);
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

  const clusters = extractBorderClusters(w, h, lArr, aArr, bArr, alphaArr);

  let chosenRemoved: Uint8Array;
  let chosenRemovedCount = 0;

  if (clusters.length === 0) {
    // Already mostly transparent on border; preserve alpha mask as-is
    chosenRemoved = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (alphaArr[i] < 128) {
        chosenRemoved[i] = 1;
        chosenRemovedCount++;
      }
    }
  } else {
    // Standard threshold first (or strict pure-white threshold for borderless studio icons)
    const attempts: Array<[number, number]> = options?.strictWhiteOnly
      ? [
          [6, 4.5],
          [3.5, 3],
        ]
      : [
          [18, 12],
          [12, 8.5],
          [8, 6],
        ];
    chosenRemoved = new Uint8Array(total);
    for (const [bgT, stepT] of attempts) {
      const attempt = runFloodFillMask(
        w,
        h,
        lArr,
        aArr,
        bArr,
        alphaArr,
        clusters,
        bgT,
        stepT
      );
      const fgRatio = (total - attempt.removedCount) / total;
      chosenRemoved = attempt.removed;
      chosenRemovedCount = attempt.removedCount;
      if (fgRatio >= 0.08) {
        break;
      }
    }
  }

  const fgCount = total - chosenRemovedCount;
  if (fgCount < total * 0.03) {
    throw new Error(
      '배경과 옷의 색상이 비슷해 무료 배경 제거로 분리하기 어렵습니다. AI 이미지 생성을 이용해 주세요.'
    );
  }

  // Apply transparent mask & gentle 1px edge feathering
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      if (chosenRemoved[idx]) {
        pixels[p + 3] = 0;
        continue;
      }

      // Check 4-neighbors to soften anti-aliased halo pixels right on the garment edge
      let bgNeighbors = 0;
      if (x > 0 && chosenRemoved[idx - 1]) bgNeighbors++;
      if (x < w - 1 && chosenRemoved[idx + 1]) bgNeighbors++;
      if (y > 0 && chosenRemoved[idx - w]) bgNeighbors++;
      if (y < h - 1 && chosenRemoved[idx + w]) bgNeighbors++;

      if (bgNeighbors > 0 && clusters.length > 0) {
        let minDist = Infinity;
        for (const cl of clusters) {
          const d = weightedBgDistance(lArr[idx], aArr[idx], bArr[idx], cl);
          if (d < minDist) minDist = d;
        }
        if (minDist < 22) {
          pixels[p + 3] = Math.round(pixels[p + 3] * (bgNeighbors >= 2 ? 0.55 : 0.78));
        }
      }
    }
  }

  workCtx.putImageData(imageData, 0, 0);

  // Compute tight foreground bounding box
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = pixels[(y * w + x) * 4 + 3];
      if (alpha > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('옷 영역을 찾지 못했습니다.');
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Center on clean square studio canvas (max 560x560) with ~7% breathing margin
  const outSize = maxDimension;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('출력 캔버스를 생성할 수 없습니다.');
  }

  const margin = Math.round(outSize * 0.06);
  const avail = outSize - margin * 2;
  const fitScale = Math.min(avail / cropW, avail / cropH);
  const drawW = Math.max(1, Math.round(cropW * fitScale));
  const drawH = Math.max(1, Math.round(cropH * fitScale));
  const dx = Math.round((outSize - drawW) / 2);
  const dy = Math.round((outSize - drawH) / 2);

  outCtx.clearRect(0, 0, outSize, outSize);
  outCtx.drawImage(workCanvas, minX, minY, cropW, cropH, dx, dy, drawW, drawH);

  // Prefer transparent WebP (compact & crisp over any card backdrop)
  const webp = outCanvas.toDataURL('image/webp', 0.84);
  if (webp.startsWith('data:image/webp') && webp.length <= 240000) {
    return webp;
  }
  const smallerWebp = outCanvas.toDataURL('image/webp', 0.68);
  if (smallerWebp.startsWith('data:image/webp') && smallerWebp.length <= 240000) {
    return smallerWebp;
  }

  // Safari fallback: preserve alpha transparency via downscaled PNG before ever dropping alpha
  for (const targetDim of [outSize, 380, 300, 240]) {
    if (targetDim === outSize) {
      const png = outCanvas.toDataURL('image/png');
      if (png.length <= 240000) return png;
    } else {
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = targetDim;
      scaledCanvas.height = targetDim;
      const scaledCtx = scaledCanvas.getContext('2d');
      if (scaledCtx) {
        scaledCtx.clearRect(0, 0, targetDim, targetDim);
        scaledCtx.drawImage(outCanvas, 0, 0, targetDim, targetDim);
        const png = scaledCanvas.toDataURL('image/png');
        if (png.length <= 240000) return png;
      }
    }
  }

  // Last-resort fallback to pure white studio JPEG if PNG exceeds 240KB limit
  outCtx.globalCompositeOperation = 'destination-over';
  outCtx.fillStyle = '#FFFFFF';
  outCtx.fillRect(0, 0, outSize, outSize);
  const jpeg = outCanvas.toDataURL('image/jpeg', 0.82);
  return jpeg.length > 240000 ? outCanvas.toDataURL('image/jpeg', 0.62) : jpeg;
}
