/**
 * Compresses an image File, Blob, or data/blob URL to a lightweight WebP (fallback JPEG)
 * binary Blob or data URL so wardrobe storage stays tiny (~12–35 KB per photo instead of 150–250 KB).
 */

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function loadImageElement(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => reject(new Error('유효한 이미지 형식이 아닙니다.'));
    img.onload = () => resolve(img);
    img.src = sourceUrl;
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 데이터를 변환할 수 없습니다.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function compressSourceToBlob(
  sourceUrl: string,
  maxDimension = 520,
  quality = 0.74,
  maxBytes = 75 * 1024
): Promise<Blob> {
  const img = await loadImageElement(sourceUrl);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('이미지 캔버스 컨텍스트를 생성할 수 없습니다.');
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height).data;
  let transparentPixels = 0;
  for (let i = 3; i < imgData.length; i += 16) {
    if (imgData[i] < 128) transparentPixels++;
  }
  const hasTransparency = transparentPixels > (imgData.length / 16) * 0.04;

  if (!hasTransparency) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Prefer compact binary WebP for both opaque and transparent images (~40–55% smaller than JPEG)
  const webpBlob = await canvasToBlob(canvas, 'image/webp', quality);
  if (webpBlob && webpBlob.type === 'image/webp') {
    if (webpBlob.size <= maxBytes) {
      return webpBlob;
    }
    const smallerWebp = await canvasToBlob(
      canvas,
      'image/webp',
      Math.max(0.52, quality - 0.16)
    );
    if (smallerWebp && smallerWebp.type === 'image/webp') {
      return smallerWebp;
    }
    return webpBlob;
  }

  // Fallback to JPEG if browser lacks WebP encoding
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (jpegBlob) {
    if (jpegBlob.size <= maxBytes) {
      return jpegBlob;
    }
    const smallerJpeg = await canvasToBlob(
      canvas,
      'image/jpeg',
      Math.max(0.55, quality - 0.16)
    );
    return smallerJpeg ?? jpegBlob;
  }

  throw new Error('이미지를 압축할 수 없습니다.');
}

export async function compressDataUrlImage(
  sourceDataUrl: string,
  maxDimension = 520,
  quality = 0.74
): Promise<string> {
  const blob = await compressSourceToBlob(sourceDataUrl, maxDimension, quality);
  return blobToDataUrl(blob);
}

export async function compressImageFile(
  file: File,
  maxDimension = 520,
  quality = 0.74
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const blob = await compressSourceToBlob(objectUrl, maxDimension, quality);
    return await blobToDataUrl(blob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
