import { DailyLook, WardrobeItem } from '../types/wardrobe';
import {
  blobToDataUrl,
  compressSourceToBlob,
  dataUrlToBlob,
} from './imageCompression';

export const FILE_REF_PREFIX = 'closet-file://';
const SAFE_IMAGE_ID_REGEX = /^img_[a-zA-Z0-9_-]{4,64}$/;

const DB_NAME = 'closet_note_file_db';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_DATASETS = 'datasets';

export interface StoredImageRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  updatedAt: string;
}

export interface StoredDatasetRecord {
  scope: string;
  items: WardrobeItem[];
  dailyLooks: DailyLook[];
  updatedAt: string;
}

export interface StorageUsageStats {
  itemCount: number;
  lookCount: number;
  metadataBytes: number;
  imageFileCount: number;
  imageFileBytes: number;
  totalBytes: number;
  estimatedLegacyDbBytes: number;
  savedPercent: number;
}

export interface PortableBackupPayload {
  format: 'closet-note-file-backup';
  version: 1;
  exportedAt: string;
  items: WardrobeItem[];
  dailyLooks: DailyLook[];
  /** Map of imageId -> compact WebP/JPEG data URL */
  images: Record<string, string>;
}

// Bidirectional in-memory cache mapping logical `closet-file://<id>` <-> runtime `blob:...`
const refToBlobUrl = new Map<string, string>();
const blobUrlToRef = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function openFileDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('로컬 파일 저장소를 열 수 없습니다.'));
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_IMAGES)) {
        database.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_DATASETS)) {
        database.createObjectStore(STORE_DATASETS, { keyPath: 'scope' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

export function isFileRef(url?: string | null): boolean {
  return typeof url === 'string' && url.startsWith(FILE_REF_PREFIX);
}

export function extractFileId(url: string): string | null {
  if (!isFileRef(url)) return null;
  const id = url.slice(FILE_REF_PREFIX.length);
  return SAFE_IMAGE_ID_REGEX.test(id) ? id : null;
}

export function toFileRef(id: string): string {
  return `${FILE_REF_PREFIX}${id}`;
}

function generateImageId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 12);
  return `img_${Date.now().toString(36)}_${rand}`;
}

function registerBlobUrl(ref: string, blob: Blob): string {
  const existing = refToBlobUrl.get(ref);
  if (existing) return existing;
  const blobUrl = URL.createObjectURL(blob);
  refToBlobUrl.set(ref, blobUrl);
  blobUrlToRef.set(blobUrl, ref);
  return blobUrl;
}

export async function saveImageBlobToLocal(id: string, blob: Blob): Promise<void> {
  if (!SAFE_IMAGE_ID_REGEX.test(id)) return;
  const db = await openFileDb();
  const record: StoredImageRecord = {
    id,
    blob,
    mimeType: blob.type || 'image/webp',
    size: blob.size,
    updatedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    tx.objectStore(STORE_IMAGES).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getImageBlobFromLocal(id: string): Promise<Blob | null> {
  if (!SAFE_IMAGE_ID_REGEX.test(id)) return null;
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const req = tx.objectStore(STORE_IMAGES).get(id);
    req.onsuccess = () => {
      const rec = req.result as StoredImageRecord | undefined;
      resolve(rec?.blob ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getAllLocalImageRecords(): Promise<StoredImageRecord[]> {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const req = tx.objectStore(STORE_IMAGES).getAll();
    req.onsuccess = () => resolve((req.result as StoredImageRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteImageBlobsFromLocal(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    for (const id of ids) {
      store.delete(id);
      const ref = toFileRef(id);
      const cachedUrl = refToBlobUrl.get(ref);
      if (cachedUrl) {
        refToBlobUrl.delete(ref);
        blobUrlToRef.delete(cachedUrl);
        URL.revokeObjectURL(cachedUrl);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDatasetFromIndexedDb(
  scope: string
): Promise<StoredDatasetRecord | null> {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATASETS, 'readonly');
    const req = tx.objectStore(STORE_DATASETS).get(scope);
    req.onsuccess = () => resolve((req.result as StoredDatasetRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDatasetToIndexedDb(
  scope: string,
  items: WardrobeItem[],
  dailyLooks: DailyLook[],
  updatedAt = new Date().toISOString()
): Promise<void> {
  const db = await openFileDb();
  const record: StoredDatasetRecord = {
    scope,
    items,
    dailyLooks,
    updatedAt,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DATASETS, 'readwrite');
    tx.objectStore(STORE_DATASETS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Server File Storage API helpers (Authenticated) ----------

export async function uploadImageBlobToServer(
  idToken: string,
  id: string,
  blob: Blob
): Promise<boolean> {
  if (!SAFE_IMAGE_ID_REGEX.test(id)) return false;
  try {
    const contentType =
      blob.type === 'image/jpeg' || blob.type === 'image/png'
        ? blob.type
        : 'image/webp';
    const res = await fetch(`/api/storage/images/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': contentType,
      },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchImageBlobFromServer(
  idToken: string,
  id: string
): Promise<Blob | null> {
  if (!SAFE_IMAGE_ID_REGEX.test(id)) return null;
  try {
    const res = await fetch(`/api/storage/images/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function fetchServerWardrobe(idToken: string): Promise<{
  exists: boolean;
  items: WardrobeItem[];
  dailyLooks: DailyLook[];
  updatedAt: string;
} | null> {
  try {
    const res = await fetch('/api/storage/wardrobe', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      exists?: boolean;
      items?: WardrobeItem[];
      dailyLooks?: DailyLook[];
      updatedAt?: string;
    };
    return {
      exists: Boolean(data.exists),
      items: Array.isArray(data.items) ? data.items : [],
      dailyLooks: Array.isArray(data.dailyLooks) ? data.dailyLooks : [],
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  } catch {
    return null;
  }
}

export async function saveServerWardrobe(
  idToken: string,
  items: WardrobeItem[],
  dailyLooks: DailyLook[],
  updatedAt: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/storage/wardrobe', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items, dailyLooks, updatedAt }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pruneServerImages(idToken: string, keepIds: string[]): Promise<void> {
  try {
    await fetch('/api/storage/images/prune', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keepIds }),
    });
  } catch {
    // Non-fatal cleanup
  }
}

// ---------- Image Externalization & Hydration ----------

/**
 * Ensures any image URL (data: URL, new blob: URL, or existing closet-file:// ref)
 * is stored as a compact binary WebP file in IndexedDB (and server file store when signed in),
 * returning the lightweight `closet-file://<id>` reference.
 */
export async function externalizeImageUrl(
  url: string | undefined,
  options?: {
    idToken?: string | null;
    maxDimension?: number;
    quality?: number;
  }
): Promise<string | undefined> {
  if (!url || !url.trim()) return undefined;
  const trimmed = url.trim();

  // Already a logical file reference -> ensure server copy exists if signed in
  if (isFileRef(trimmed)) {
    const id = extractFileId(trimmed);
    if (id && options?.idToken) {
      const localBlob = await getImageBlobFromLocal(id);
      if (localBlob) {
        void uploadImageBlobToServer(options.idToken, id, localBlob);
      }
    }
    return trimmed;
  }

  // Already a known runtime blob URL mapped to a file ref
  const knownRef = blobUrlToRef.get(trimmed);
  if (knownRef) {
    return knownRef;
  }

  // Regular external http(s) URL (rare) -> leave as-is if short
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.slice(0, 500);
  }

  // Convert data:image/... or untracked blob: URL into compact WebP binary file
  const maxDimension = options?.maxDimension ?? 500;
  const quality = options?.quality ?? 0.74;
  let blob: Blob;
  try {
    blob = await compressSourceToBlob(trimmed, maxDimension, quality);
  } catch {
    blob = await dataUrlToBlob(trimmed);
  }

  const id = generateImageId();
  const ref = toFileRef(id);
  await saveImageBlobToLocal(id, blob);
  registerBlobUrl(ref, blob);

  if (options?.idToken) {
    await uploadImageBlobToServer(options.idToken, id, blob);
  }

  return ref;
}

export async function dehydrateItemForStorage(
  item: WardrobeItem,
  idToken?: string | null
): Promise<WardrobeItem> {
  const imageUrl = await externalizeImageUrl(item.imageUrl, {
    idToken,
    maxDimension: 500,
    quality: 0.74,
  });

  const extraList = Array.isArray(item.additionalImages)
    ? item.additionalImages.slice(0, 6)
    : [];
  const dehydratedExtras: string[] = [];
  for (const extra of extraList) {
    const ref = await externalizeImageUrl(extra, {
      idToken,
      maxDimension: 560,
      quality: 0.72,
    });
    if (ref) dehydratedExtras.push(ref);
  }

  return {
    ...item,
    imageUrl,
    additionalImages: dehydratedExtras,
  };
}

export async function dehydrateItemsForStorage(
  items: WardrobeItem[],
  idToken?: string | null
): Promise<WardrobeItem[]> {
  const result: WardrobeItem[] = [];
  for (const item of items) {
    result.push(await dehydrateItemForStorage(item, idToken));
  }
  return result;
}

async function resolveSingleRefToDisplayUrl(
  url: string | undefined,
  idToken?: string | null
): Promise<{ displayUrl?: string; migratedRef?: string }> {
  if (!url) return { displayUrl: undefined };

  // Legacy inline data URL -> immediately externalize to binary file to reclaim space!
  if (url.startsWith('data:image/')) {
    const ref = await externalizeImageUrl(url, { idToken });
    if (ref) {
      const cached = refToBlobUrl.get(ref);
      return { displayUrl: cached ?? url, migratedRef: ref };
    }
    return { displayUrl: url };
  }

  // Known runtime blob URL
  if (blobUrlToRef.has(url)) {
    return { displayUrl: url };
  }

  // Logical file reference -> resolve from cache -> IndexedDB -> Server file store
  if (isFileRef(url)) {
    const cached = refToBlobUrl.get(url);
    if (cached) return { displayUrl: cached };

    const id = extractFileId(url);
    if (!id) return { displayUrl: undefined };

    let blob = await getImageBlobFromLocal(id);
    if (!blob && idToken) {
      blob = await fetchImageBlobFromServer(idToken, id);
      if (blob) {
        await saveImageBlobToLocal(id, blob);
      }
    }

    if (blob) {
      return { displayUrl: registerBlobUrl(url, blob) };
    }
    return { displayUrl: undefined };
  }

  return { displayUrl: url };
}

/**
 * Hydrates stored items (containing `closet-file://<id>`) into UI-ready items
 * (with same-origin `blob:` URLs), also returning `migratedStoredItems` if any
 * legacy base64 images were auto-converted to compact files.
 */
export async function hydrateItemsForUi(
  storedItems: WardrobeItem[],
  idToken?: string | null
): Promise<{
  uiItems: WardrobeItem[];
  storedItems: WardrobeItem[];
  didMigrateImages: boolean;
}> {
  const uiItems: WardrobeItem[] = [];
  const nextStoredItems: WardrobeItem[] = [];
  let didMigrateImages = false;

  for (const item of storedItems) {
    const main = await resolveSingleRefToDisplayUrl(item.imageUrl, idToken);
    if (main.migratedRef) didMigrateImages = true;

    const uiExtras: string[] = [];
    const storedExtras: string[] = [];
    for (const extra of item.additionalImages ?? []) {
      const resolved = await resolveSingleRefToDisplayUrl(extra, idToken);
      if (resolved.migratedRef) didMigrateImages = true;
      if (resolved.displayUrl) uiExtras.push(resolved.displayUrl);
      storedExtras.push(resolved.migratedRef ?? extra);
    }

    uiItems.push({
      ...item,
      imageUrl: main.displayUrl,
      additionalImages: uiExtras,
    });
    nextStoredItems.push({
      ...item,
      imageUrl: main.migratedRef ?? item.imageUrl,
      additionalImages: storedExtras,
    });
  }

  return { uiItems, storedItems: nextStoredItems, didMigrateImages };
}

export function collectReferencedImageIds(items: WardrobeItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const candidates = [item.imageUrl, ...(item.additionalImages ?? [])];
    for (const raw of candidates) {
      if (!raw) continue;
      const ref = blobUrlToRef.get(raw) ?? raw;
      const id = extractFileId(ref);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export async function pruneUnusedImages(
  activeItems: WardrobeItem[],
  idToken?: string | null
): Promise<void> {
  try {
    const keepIds = collectReferencedImageIds(activeItems);

    // Check across all datasets in IndexedDB so we never delete an image used by another scope
    const db = await openFileDb();
    const allDatasets = await new Promise<StoredDatasetRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_DATASETS, 'readonly');
      const req = tx.objectStore(STORE_DATASETS).getAll();
      req.onsuccess = () => resolve((req.result as StoredDatasetRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    const allKeptLocalIds = new Set(keepIds);
    for (const ds of allDatasets) {
      for (const id of collectReferencedImageIds(ds.items)) {
        allKeptLocalIds.add(id);
      }
    }

    const allLocalImages = await getAllLocalImageRecords();
    const toDeleteLocal = allLocalImages
      .map((rec) => rec.id)
      .filter((id) => !allKeptLocalIds.has(id));
    if (toDeleteLocal.length > 0) {
      await deleteImageBlobsFromLocal(toDeleteLocal);
    }

    if (idToken) {
      await pruneServerImages(idToken, Array.from(keepIds));
    }
  } catch {
    // Non-fatal background cleanup
  }
}

// ---------- Storage Usage Calculation ----------

export async function computeStorageUsage(
  items: WardrobeItem[],
  dailyLooks: DailyLook[]
): Promise<StorageUsageStats> {
  const refItems = items.map((item) => ({
    ...item,
    imageUrl: item.imageUrl ? (blobUrlToRef.get(item.imageUrl) ?? item.imageUrl) : undefined,
    additionalImages: (item.additionalImages ?? []).map((u) => blobUrlToRef.get(u) ?? u),
  }));

  const metadataBytes = new Blob([
    JSON.stringify({ items: refItems, dailyLooks }),
  ]).size;

  const referencedIds = collectReferencedImageIds(refItems);
  let imageFileBytes = 0;
  let imageFileCount = 0;

  try {
    const allImages = await getAllLocalImageRecords();
    for (const rec of allImages) {
      if (referencedIds.has(rec.id)) {
        imageFileCount += 1;
        imageFileBytes += rec.size;
      }
    }
  } catch {
    // Ignore IndexedDB error
  }

  const totalBytes = metadataBytes + imageFileBytes;
  // Previous DB method stored ~150KB average base64 per photo + metadata inside Firestore documents
  const estimatedLegacyDbBytes =
    metadataBytes + Math.max(imageFileBytes * 3.8, imageFileCount * 145 * 1024);
  const savedPercent =
    estimatedLegacyDbBytes > totalBytes && imageFileCount > 0
      ? Math.min(
          95,
          Math.max(0, Math.round((1 - totalBytes / estimatedLegacyDbBytes) * 100))
        )
      : 0;

  return {
    itemCount: items.length,
    lookCount: dailyLooks.length,
    metadataBytes,
    imageFileCount,
    imageFileBytes,
    totalBytes,
    estimatedLegacyDbBytes,
    savedPercent,
  };
}

// ---------- Portable Backup File Export & Import (.closet.json) ----------

export async function exportWardrobeToFile(
  items: WardrobeItem[],
  dailyLooks: DailyLook[]
): Promise<{ filename: string; totalBytes: number }> {
  const storedItems = await dehydrateItemsForStorage(items, null);
  const referencedIds = collectReferencedImageIds(storedItems);
  const images: Record<string, string> = {};

  for (const id of referencedIds) {
    const blob = await getImageBlobFromLocal(id);
    if (blob) {
      images[id] = await blobToDataUrl(blob);
    }
  }

  const payload: PortableBackupPayload = {
    format: 'closet-note-file-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    items: storedItems,
    dailyLooks,
    images,
  };

  const jsonString = JSON.stringify(payload);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `closet-note-backup-${dateTag}.closet.json`;

  // Use native File System Access API if available (allows choosing save location)
  const win = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Closet Note 백업 파일',
            accept: { 'application/json': ['.closet.json', '.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { filename, totalBytes: blob.size };
    } catch (err) {
      // If user cancelled picker, rethrow so UI doesn't claim success
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('저장이 취소되었습니다.');
      }
      // Otherwise fall back to standard download
    }
  }

  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 3000);

  return { filename, totalBytes: blob.size };
}

export async function parseAndImportBackupFile(
  file: File,
  idToken?: string | null
): Promise<{ items: WardrobeItem[]; dailyLooks: DailyLook[] }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('올바른 JSON 백업 파일 형식이 아닙니다.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('백업 파일 내용이 비어 있거나 손상되었습니다.');
  }

  const record = parsed as Partial<PortableBackupPayload>;
  if (!Array.isArray(record.items) || !Array.isArray(record.dailyLooks)) {
    throw new Error('Closet Note 백업 파일 형식이 아닙니다 (items/dailyLooks 누락).');
  }

  const rawImages =
    record.images && typeof record.images === 'object' ? record.images : {};

  // Restore packaged WebP images into IndexedDB (+ server file store when signed in)
  for (const [id, dataUrl] of Object.entries(rawImages)) {
    if (!SAFE_IMAGE_ID_REGEX.test(id) || typeof dataUrl !== 'string') continue;
    if (!dataUrl.startsWith('data:image/')) continue;
    try {
      const blob = await compressSourceToBlob(dataUrl, 520, 0.74);
      await saveImageBlobToLocal(id, blob);
      registerBlobUrl(toFileRef(id), blob);
      if (idToken) {
        await uploadImageBlobToServer(idToken, id, blob);
      }
    } catch {
      // Skip corrupted image entry
    }
  }

  // Also externalize any inline base64 images inside items
  const dehydratedItems = await dehydrateItemsForStorage(
    record.items.slice(0, 5000),
    idToken
  );

  return {
    items: dehydratedItems,
    dailyLooks: record.dailyLooks.slice(0, 10000),
  };
}
