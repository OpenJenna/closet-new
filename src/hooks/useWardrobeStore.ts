import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { SEED_DAILY_LOOKS, SEED_ITEMS } from '../data/seedData';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../lib/firebase';
import { DailyLook, WardrobeItem } from '../types/wardrobe';
import {
  StorageUsageStats,
  computeStorageUsage,
  dehydrateItemForStorage,
  dehydrateItemsForStorage,
  exportWardrobeToFile,
  fetchServerWardrobe,
  hydrateItemsForUi,
  loadDatasetFromIndexedDb,
  parseAndImportBackupFile,
  pruneUnusedImages,
  saveDatasetToIndexedDb,
  saveServerWardrobe,
} from '../utils/fileStorage';
import { generateSafeId } from '../utils/formatters';

const LEGACY_LOCAL_ITEMS_KEY = 'closet_note_items_v1';
const LEGACY_LOCAL_LOOKS_KEY = 'closet_note_looks_v1';
const LOCAL_MUJI_CLEANUP_KEY = 'closet_note_cleanup_muji_cardigan_v1';

function isTargetMujiCardigan(item: WardrobeItem): boolean {
  const brand = (item.brand || '').trim().toLowerCase();
  const name = (item.name || '').trim().toLowerCase();
  const compactName = name.replace(/\s+/g, '');
  const isMuji =
    brand.includes('muji') ||
    brand.includes('무지') ||
    brand.includes('무인양품') ||
    name.includes('muji');
  if (compactName.includes('모가이건')) return true;
  if (
    isMuji &&
    (compactName.includes('모가디건') ||
      compactName.includes('가이건') ||
      compactName.includes('가디건'))
  ) {
    return true;
  }
  return false;
}

function loadLegacyLocalStorage(): {
  items: WardrobeItem[];
  looks: DailyLook[];
  hadLegacyData: boolean;
} {
  let items: WardrobeItem[] = SEED_ITEMS;
  let looks: DailyLook[] = SEED_DAILY_LOOKS;
  let hadLegacyData = false;

  try {
    const rawItems = localStorage.getItem(LEGACY_LOCAL_ITEMS_KEY);
    if (rawItems) {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed) && parsed.length > 0) {
        items = parsed;
        hadLegacyData = true;
      }
    }
    const rawLooks = localStorage.getItem(LEGACY_LOCAL_LOOKS_KEY);
    if (rawLooks) {
      const parsed = JSON.parse(rawLooks);
      if (Array.isArray(parsed)) {
        looks = parsed;
        hadLegacyData = true;
      }
    }

    if (localStorage.getItem(LOCAL_MUJI_CLEANUP_KEY) !== '1') {
      const removedIds = new Set(
        items.filter(isTargetMujiCardigan).map((it) => it.id)
      );
      if (removedIds.size > 0) {
        items = items.filter((it) => !removedIds.has(it.id));
        looks = looks
          .map((lk) => ({
            ...lk,
            itemIds: lk.itemIds.filter((itemId) => !removedIds.has(itemId)),
          }))
          .filter((lk) => lk.itemIds.length > 0);
      }
      localStorage.setItem(LOCAL_MUJI_CLEANUP_KEY, '1');
    }
  } catch {
    // Fallback to seed data
  }

  return { items, looks, hadLegacyData };
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_LOCAL_ITEMS_KEY);
    localStorage.removeItem(LEGACY_LOCAL_LOOKS_KEY);
  } catch {
    // Ignore
  }
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function isQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('resource-exhausted') ||
    msg.toLowerCase().includes('resource_exhausted')
  );
}

function sanitizeItemInput(
  item: Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> {
  return {
    ...item,
    name: (item.name || '새 아이템').trim().slice(0, 120),
    brand: (item.brand || 'ETC').trim().slice(0, 80),
    subCategory: (item.subCategory || '기타').trim().slice(0, 40),
    seasons: item.seasons.length > 0 ? item.seasons.slice(0, 4) : ['봄', '가을'],
    colorName: (item.colorName || '블랙').trim().slice(0, 30),
    colorHex: /^#[0-9A-Fa-f]{6}$/.test(item.colorHex) ? item.colorHex : '#18181B',
    price: Math.max(0, Math.min(100000000, Number(item.price) || 0)),
    purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(item.purchaseDate)
      ? item.purchaseDate
      : new Date().toISOString().slice(0, 10),
    tpo: item.tpo !== undefined ? item.tpo.slice(0, 40) : undefined,
    material: item.material !== undefined ? item.material.slice(0, 60) : undefined,
    pattern: item.pattern !== undefined ? item.pattern.slice(0, 40) : undefined,
    size: item.size !== undefined ? item.size.slice(0, 20) : undefined,
    rating:
      item.rating !== undefined
        ? Math.max(0, Math.min(5, Number(item.rating) || 0))
        : undefined,
    imageKey: item.imageKey !== undefined ? item.imageKey.slice(0, 60) : undefined,
    memo: item.memo !== undefined ? item.memo.slice(0, 1000) : undefined,
    isBasicCloset:
      item.isBasicCloset !== undefined ? Boolean(item.isBasicCloset) : undefined,
    wearCountOffset:
      item.wearCountOffset !== undefined
        ? Math.max(-5000, Math.min(10000, Math.round(Number(item.wearCountOffset) || 0)))
        : undefined,
  };
}

function sanitizeLookInput(
  look: Omit<DailyLook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Omit<DailyLook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> {
  return {
    ...look,
    date: /^\d{4}-\d{2}-\d{2}$/.test(look.date)
      ? look.date
      : new Date().toISOString().slice(0, 10),
    tempHigh: Math.max(-60, Math.min(60, Number(look.tempHigh) || 0)),
    tempLow: Math.max(-60, Math.min(60, Number(look.tempLow) || 0)),
    itemIds: look.itemIds.slice(0, 15),
    title: look.title !== undefined ? look.title.slice(0, 80) : undefined,
    note: look.note !== undefined ? look.note.slice(0, 500) : undefined,
  };
}

async function fetchLegacyFirestoreSnapshot(uid: string): Promise<{
  items: WardrobeItem[];
  dailyLooks: DailyLook[];
}> {
  const itemsQuery = query(
    collection(db, 'users', uid, 'items'),
    where('ownerId', '==', uid)
  );
  const looksQuery = query(
    collection(db, 'users', uid, 'dailyLooks'),
    where('ownerId', '==', uid)
  );

  let itemsSnap;
  try {
    itemsSnap = await getDocs(itemsQuery);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error(
        'Firestore 일일 무료 읽기 할당량이 초과되어 기존 DB에서 가져올 수 없습니다. 내일 할당량 초기화 후 다시 시도해 주세요.'
      );
    }
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/items`);
  }

  let looksSnap;
  try {
    looksSnap = await getDocs(looksQuery);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error(
        'Firestore 일일 무료 읽기 할당량이 초과되어 기존 DB에서 가져올 수 없습니다. 내일 할당량 초기화 후 다시 시도해 주세요.'
      );
    }
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/dailyLooks`);
  }

  const fetchedItems: WardrobeItem[] = itemsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ownerId: String(data.ownerId ?? uid),
      name: String(data.name ?? ''),
      brand: String(data.brand ?? ''),
      category: data.category,
      subCategory: String(data.subCategory ?? ''),
      seasons: Array.isArray(data.seasons) ? data.seasons : ['봄', '가을'],
      tpo: data.tpo,
      colorName: String(data.colorName ?? '블랙'),
      colorHex: String(data.colorHex ?? '#18181B'),
      price: Number(data.price ?? 0),
      purchaseDate: String(data.purchaseDate ?? ''),
      material: data.material,
      pattern: data.pattern,
      size: data.size,
      rating: data.rating !== undefined ? Number(data.rating) : 0,
      imageKey: data.imageKey,
      imageUrl: data.imageUrl,
      additionalImages: Array.isArray(data.additionalImages)
        ? data.additionalImages
        : [],
      memo: data.memo,
      isBasicCloset: Boolean(data.isBasicCloset),
      wearCountOffset:
        data.wearCountOffset !== undefined
          ? Number(data.wearCountOffset) || 0
          : undefined,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  });

  const fetchedLooks: DailyLook[] = looksSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ownerId: String(data.ownerId ?? uid),
      date: String(data.date ?? ''),
      title: data.title,
      weatherCondition: data.weatherCondition ?? 'sunny',
      tempHigh: Number(data.tempHigh ?? 15),
      tempLow: Number(data.tempLow ?? 5),
      itemIds: Array.isArray(data.itemIds) ? data.itemIds : [],
      note: data.note,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  });

  return { items: fetchedItems, dailyLooks: fetchedLooks };
}

export function useWardrobeStore() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [dailyLooks, setDailyLooks] = useState<DailyLook[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageUsageStats | null>(null);

  // Refs hold the latest dehydrated (file-referenced) data to guarantee atomic, race-free file writes
  const storedItemsRef = useRef<WardrobeItem[]>([]);
  const storedLooksRef = useRef<DailyLook[]>([]);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const getActiveScope = useCallback((targetUser: User | null) => {
    return targetUser ? `user:${targetUser.uid}` : 'local';
  }, []);

  const getIdTokenSafe = useCallback(async (targetUser: User | null): Promise<string | null> => {
    if (!targetUser) return null;
    try {
      return await targetUser.getIdToken();
    } catch {
      return null;
    }
  }, []);

  const refreshStorageStats = useCallback(async () => {
    try {
      const stats = await computeStorageUsage(
        storedItemsRef.current,
        storedLooksRef.current
      );
      setStorageStats(stats);
    } catch {
      // Ignore stats failure
    }
  }, []);

  const persistStoredState = useCallback(
    async (
      nextStoredItems: WardrobeItem[],
      nextStoredLooks: DailyLook[],
      targetUser: User | null,
      options?: { prune?: boolean }
    ) => {
      const updatedAt = new Date().toISOString();
      const scope = getActiveScope(targetUser);
      storedItemsRef.current = nextStoredItems;
      storedLooksRef.current = nextStoredLooks;

      await saveDatasetToIndexedDb(scope, nextStoredItems, nextStoredLooks, updatedAt);

      const idToken = await getIdTokenSafe(targetUser);
      if (idToken) {
        await saveServerWardrobe(idToken, nextStoredItems, nextStoredLooks, updatedAt);
      }

      if (options?.prune) {
        void pruneUnusedImages(nextStoredItems, idToken);
      }

      void refreshStorageStats();
    },
    [getActiveScope, getIdTokenSafe, refreshStorageStats]
  );

  // Load dataset on auth state change (File-Based: IndexedDB + authenticated server files)
  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (cancelled) return;
      setUser(nextUser);
      setAuthReady(true);
      setDataLoaded(false);
      setSyncing(Boolean(nextUser));
      setStorageNotice(null);

      try {
        if (!nextUser) {
          // Signed-out: local IndexedDB file store (auto-migrate legacy localStorage once)
          let localDs = await loadDatasetFromIndexedDb('local');
          let rawItems: WardrobeItem[];
          let rawLooks: DailyLook[];
          let needsPersist = false;

          if (!localDs) {
            const legacy = loadLegacyLocalStorage();
            rawItems = legacy.items;
            rawLooks = legacy.looks;
            needsPersist = true;
            if (legacy.hadLegacyData) {
              clearLegacyLocalStorage();
            }
          } else {
            rawItems = localDs.items;
            rawLooks = localDs.dailyLooks;
            // Apply one-time MUJI cleanup if not yet run
            try {
              if (localStorage.getItem(LOCAL_MUJI_CLEANUP_KEY) !== '1') {
                const removedIds = new Set(
                  rawItems.filter(isTargetMujiCardigan).map((it) => it.id)
                );
                if (removedIds.size > 0) {
                  rawItems = rawItems.filter((it) => !removedIds.has(it.id));
                  rawLooks = rawLooks
                    .map((lk) => ({
                      ...lk,
                      itemIds: lk.itemIds.filter((id) => !removedIds.has(id)),
                    }))
                    .filter((lk) => lk.itemIds.length > 0);
                  needsPersist = true;
                }
                localStorage.setItem(LOCAL_MUJI_CLEANUP_KEY, '1');
              }
            } catch {
              // Ignore
            }
          }

          const hydrated = await hydrateItemsForUi(rawItems, null);
          if (cancelled) return;

          storedItemsRef.current = hydrated.storedItems;
          storedLooksRef.current = rawLooks;
          setItems(hydrated.uiItems);
          setDailyLooks(rawLooks);

          if (needsPersist || hydrated.didMigrateImages) {
            await saveDatasetToIndexedDb('local', hydrated.storedItems, rawLooks);
          }
          void refreshStorageStats();
        } else {
          // Signed-in: Authenticated server file storage + IndexedDB local binary cache
          const scope = `user:${nextUser.uid}`;
          const idToken = await getIdTokenSafe(nextUser);

          const [localCache, serverData] = await Promise.all([
            loadDatasetFromIndexedDb(scope),
            idToken ? fetchServerWardrobe(idToken) : Promise.resolve(null),
          ]);

          if (cancelled) return;

          let chosenItems: WardrobeItem[] = [];
          let chosenLooks: DailyLook[] = [];
          let shouldUploadToServer = false;
          let shouldSaveLocal = false;

          const hasServer = Boolean(serverData?.exists);
          const hasLocal = Boolean(localCache && (localCache.items.length > 0 || localCache.dailyLooks.length > 0));

          if (hasServer && hasLocal) {
            const serverTime = Date.parse(serverData!.updatedAt || '') || 0;
            const localTime = Date.parse(localCache!.updatedAt || '') || 0;
            if (serverTime >= localTime) {
              chosenItems = serverData!.items;
              chosenLooks = serverData!.dailyLooks;
              shouldSaveLocal = true;
            } else {
              chosenItems = localCache!.items;
              chosenLooks = localCache!.dailyLooks;
              shouldUploadToServer = true;
            }
          } else if (hasServer) {
            chosenItems = serverData!.items;
            chosenLooks = serverData!.dailyLooks;
            shouldSaveLocal = true;
          } else if (hasLocal) {
            chosenItems = localCache!.items;
            chosenLooks = localCache!.dailyLooks;
            shouldUploadToServer = true;
          } else {
            // First time in file storage for this account: attempt 1-time migration from legacy Firestore DB
            try {
              const legacyCloud = await fetchLegacyFirestoreSnapshot(nextUser.uid);
              if (legacyCloud.items.length > 0 || legacyCloud.dailyLooks.length > 0) {
                chosenItems = legacyCloud.items;
                chosenLooks = legacyCloud.dailyLooks;
                shouldSaveLocal = true;
                shouldUploadToServer = true;
                setStorageNotice(
                  `기존 DB의 아이템 ${legacyCloud.items.length}벌과 데일리룩 ${legacyCloud.dailyLooks.length}건을 저용량 압축 파일 저장소로 이전했습니다.`
                );
              } else {
                chosenItems = SEED_ITEMS.map((it) => ({ ...it, ownerId: nextUser.uid }));
                chosenLooks = SEED_DAILY_LOOKS.map((lk) => ({ ...lk, ownerId: nextUser.uid }));
                shouldSaveLocal = true;
                shouldUploadToServer = true;
              }
            } catch (migrationErr) {
              // Quota exceeded or temporary DB unavailability: start cleanly in file storage without crashing
              const localFallback = await loadDatasetFromIndexedDb('local');
              chosenItems = (localFallback?.items ?? SEED_ITEMS).map((it) => ({
                ...it,
                ownerId: nextUser.uid,
              }));
              chosenLooks = (localFallback?.dailyLooks ?? SEED_DAILY_LOOKS).map((lk) => ({
                ...lk,
                ownerId: nextUser.uid,
              }));
              shouldSaveLocal = true;
              shouldUploadToServer = true;
              setStorageNotice(
                migrationErr instanceof Error
                  ? `파일 저장소 모드로 시작했습니다. (${migrationErr.message})`
                  : '파일 저장소 모드로 시작했습니다. 기존 DB 데이터는 상단 [파일 백업] 메뉴에서 나중에 가져올 수 있습니다.'
              );
            }
          }

          const hydrated = await hydrateItemsForUi(chosenItems, idToken);
          if (cancelled) return;

          storedItemsRef.current = hydrated.storedItems;
          storedLooksRef.current = chosenLooks;
          setItems(hydrated.uiItems);
          setDailyLooks(chosenLooks);

          if (shouldSaveLocal || hydrated.didMigrateImages) {
            await saveDatasetToIndexedDb(scope, hydrated.storedItems, chosenLooks);
          }
          if ((shouldUploadToServer || hydrated.didMigrateImages) && idToken) {
            const dehydrated = await dehydrateItemsForStorage(
              hydrated.storedItems,
              idToken
            );
            storedItemsRef.current = dehydrated;
            await saveDatasetToIndexedDb(scope, dehydrated, chosenLooks);
            await saveServerWardrobe(
              idToken,
              dehydrated,
              chosenLooks,
              new Date().toISOString()
            );
          }

          void refreshStorageStats();
        }
      } catch (err) {
        console.error('Failed to initialize file wardrobe store:', err);
      } finally {
        if (!cancelled) {
          setDataLoaded(true);
          setSyncing(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [getIdTokenSafe, refreshStorageStats]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.'
      );
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  // ---------- CRUD for Wardrobe Items (File-Based Storage) ----------

  const addItem = useCallback(
    async (
      input: Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
    ): Promise<WardrobeItem> => {
      const currentUser = userRef.current;
      const ownerId = currentUser?.uid ?? 'local';
      const id = generateSafeId('item');
      const now = new Date().toISOString();
      const cleaned = sanitizeItemInput(input);

      const rawItem: WardrobeItem = {
        ...cleaned,
        id,
        ownerId,
        createdAt: now,
        updatedAt: now,
      };

      const idToken = await getIdTokenSafe(currentUser);
      const storedItem = await dehydrateItemForStorage(rawItem, idToken);
      const { uiItems } = await hydrateItemsForUi([storedItem], idToken);
      const uiItem = uiItems[0] ?? rawItem;

      const nextStoredItems = [storedItem, ...storedItemsRef.current];
      setItems((prev) => [uiItem, ...prev]);
      await persistStoredState(nextStoredItems, storedLooksRef.current, currentUser);

      return uiItem;
    },
    [getIdTokenSafe, persistStoredState]
  );

  const addItemsBatch = useCallback(
    async (
      inputs: Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[]
    ): Promise<WardrobeItem[]> => {
      if (inputs.length === 0) return [];
      const currentUser = userRef.current;
      const ownerId = currentUser?.uid ?? 'local';
      const now = new Date().toISOString();
      const idToken = await getIdTokenSafe(currentUser);

      const rawList: WardrobeItem[] = inputs.map((input, idx) => ({
        ...sanitizeItemInput(input),
        id: generateSafeId(`item_${idx}`),
        ownerId,
        createdAt: now,
        updatedAt: now,
      }));

      const storedList = await dehydrateItemsForStorage(rawList, idToken);
      const { uiItems } = await hydrateItemsForUi(storedList, idToken);

      const nextStoredItems = [...storedList, ...storedItemsRef.current];
      setItems((prev) => [...uiItems, ...prev]);
      await persistStoredState(nextStoredItems, storedLooksRef.current, currentUser);

      return uiItems;
    },
    [getIdTokenSafe, persistStoredState]
  );

  const updateItem = useCallback(
    async (
      id: string,
      patch: Partial<Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
    ) => {
      const currentUser = userRef.current;
      const existingStored = storedItemsRef.current.find((it) => it.id === id);
      if (!existingStored) return;

      const now = new Date().toISOString();
      const merged: WardrobeItem = {
        ...existingStored,
        ...sanitizeItemInput({ ...existingStored, ...patch }),
        id: existingStored.id,
        ownerId: existingStored.ownerId,
        createdAt: existingStored.createdAt,
        updatedAt: now,
      };

      const idToken = await getIdTokenSafe(currentUser);
      const storedItem = await dehydrateItemForStorage(merged, idToken);
      const { uiItems } = await hydrateItemsForUi([storedItem], idToken);
      const uiItem = uiItems[0] ?? merged;

      const nextStoredItems = storedItemsRef.current.map((it) =>
        it.id === id ? storedItem : it
      );
      setItems((prev) => prev.map((it) => (it.id === id ? uiItem : it)));
      await persistStoredState(nextStoredItems, storedLooksRef.current, currentUser, {
        prune: patch.imageUrl !== undefined || patch.additionalImages !== undefined,
      });
    },
    [getIdTokenSafe, persistStoredState]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const currentUser = userRef.current;
      const nextStoredItems = storedItemsRef.current.filter((it) => it.id !== id);
      const nextStoredLooks = storedLooksRef.current
        .map((lk) => ({
          ...lk,
          itemIds: lk.itemIds.filter((itemId) => itemId !== id),
        }))
        .filter((lk) => lk.itemIds.length > 0);

      setItems((prev) => prev.filter((it) => it.id !== id));
      setDailyLooks(nextStoredLooks);
      await persistStoredState(nextStoredItems, nextStoredLooks, currentUser, {
        prune: true,
      });
    },
    [persistStoredState]
  );

  const updateItemsBatch = useCallback(
    async (
      ids: string[],
      patch: Partial<Omit<WardrobeItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
    ) => {
      if (ids.length === 0) return;
      const currentUser = userRef.current;
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      const idToken = await getIdTokenSafe(currentUser);

      const nextStoredItems: WardrobeItem[] = [];
      const updatedUiMap = new Map<string, WardrobeItem>();

      for (const existing of storedItemsRef.current) {
        if (!idSet.has(existing.id)) {
          nextStoredItems.push(existing);
          continue;
        }
        const merged: WardrobeItem = {
          ...existing,
          ...sanitizeItemInput({ ...existing, ...patch }),
          id: existing.id,
          ownerId: existing.ownerId,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        const stored = await dehydrateItemForStorage(merged, idToken);
        const { uiItems } = await hydrateItemsForUi([stored], idToken);
        nextStoredItems.push(stored);
        if (uiItems[0]) updatedUiMap.set(stored.id, uiItems[0]);
      }

      setItems((prev) => prev.map((it) => updatedUiMap.get(it.id) ?? it));
      await persistStoredState(nextStoredItems, storedLooksRef.current, currentUser, {
        prune: patch.imageUrl !== undefined || patch.additionalImages !== undefined,
      });
    },
    [getIdTokenSafe, persistStoredState]
  );

  const deleteItemsBatch = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const currentUser = userRef.current;
      const idSet = new Set(ids);

      const nextStoredItems = storedItemsRef.current.filter((it) => !idSet.has(it.id));
      const nextStoredLooks = storedLooksRef.current
        .map((lk) => ({
          ...lk,
          itemIds: lk.itemIds.filter((itemId) => !idSet.has(itemId)),
        }))
        .filter((lk) => lk.itemIds.length > 0);

      setItems((prev) => prev.filter((it) => !idSet.has(it.id)));
      setDailyLooks(nextStoredLooks);
      await persistStoredState(nextStoredItems, nextStoredLooks, currentUser, {
        prune: true,
      });
    },
    [persistStoredState]
  );

  // ---------- CRUD for Daily Looks (File-Based Storage) ----------

  const addDailyLook = useCallback(
    async (
      input: Omit<DailyLook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
    ): Promise<DailyLook> => {
      const currentUser = userRef.current;
      const ownerId = currentUser?.uid ?? 'local';
      const id = generateSafeId('look');
      const now = new Date().toISOString();

      const newLook: DailyLook = {
        ...sanitizeLookInput(input),
        id,
        ownerId,
        createdAt: now,
        updatedAt: now,
      };

      const nextLooks = [newLook, ...storedLooksRef.current];
      setDailyLooks(nextLooks);
      await persistStoredState(storedItemsRef.current, nextLooks, currentUser);
      return newLook;
    },
    [persistStoredState]
  );

  const updateDailyLook = useCallback(
    async (
      id: string,
      patch: Partial<Omit<DailyLook, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
    ) => {
      const currentUser = userRef.current;
      const now = new Date().toISOString();
      const nextLooks = storedLooksRef.current.map((lk) => {
        if (lk.id !== id) return lk;
        return {
          ...lk,
          ...sanitizeLookInput({ ...lk, ...patch }),
          id: lk.id,
          ownerId: lk.ownerId,
          createdAt: lk.createdAt,
          updatedAt: now,
        };
      });

      setDailyLooks(nextLooks);
      await persistStoredState(storedItemsRef.current, nextLooks, currentUser);
    },
    [persistStoredState]
  );

  const deleteDailyLook = useCallback(
    async (id: string) => {
      const currentUser = userRef.current;
      const nextLooks = storedLooksRef.current.filter((lk) => lk.id !== id);
      setDailyLooks(nextLooks);
      await persistStoredState(storedItemsRef.current, nextLooks, currentUser);
    },
    [persistStoredState]
  );

  // ---------- Portable Backup File Export / Import & Legacy DB Migration ----------

  const exportWardrobeFile = useCallback(async () => {
    return exportWardrobeToFile(storedItemsRef.current, storedLooksRef.current);
  }, []);

  const importWardrobeFile = useCallback(
    async (file: File, mode: 'merge' | 'replace') => {
      const currentUser = userRef.current;
      const ownerId = currentUser?.uid ?? 'local';
      const idToken = await getIdTokenSafe(currentUser);
      const imported = await parseAndImportBackupFile(file, idToken);

      const normalizedImportedItems = imported.items.map((it) => ({
        ...it,
        ownerId,
      }));
      const normalizedImportedLooks = imported.dailyLooks.map((lk) => ({
        ...lk,
        ownerId,
      }));

      let nextStoredItems: WardrobeItem[];
      let nextStoredLooks: DailyLook[];

      if (mode === 'replace') {
        nextStoredItems = normalizedImportedItems;
        nextStoredLooks = normalizedImportedLooks;
      } else {
        const itemMap = new Map<string, WardrobeItem>();
        for (const it of storedItemsRef.current) itemMap.set(it.id, it);
        for (const it of normalizedImportedItems) itemMap.set(it.id, it);
        nextStoredItems = Array.from(itemMap.values());

        const lookMap = new Map<string, DailyLook>();
        for (const lk of storedLooksRef.current) lookMap.set(lk.id, lk);
        for (const lk of normalizedImportedLooks) lookMap.set(lk.id, lk);
        nextStoredLooks = Array.from(lookMap.values());
      }

      const hydrated = await hydrateItemsForUi(nextStoredItems, idToken);
      setItems(hydrated.uiItems);
      setDailyLooks(nextStoredLooks);
      await persistStoredState(hydrated.storedItems, nextStoredLooks, currentUser, {
        prune: mode === 'replace',
      });

      return {
        itemCount: normalizedImportedItems.length,
        lookCount: normalizedImportedLooks.length,
      };
    },
    [getIdTokenSafe, persistStoredState]
  );

  const importFromLegacyFirestore = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) {
      throw new Error('먼저 Google 계정으로 로그인해 주세요.');
    }
    const idToken = await getIdTokenSafe(currentUser);
    const legacy = await fetchLegacyFirestoreSnapshot(currentUser.uid);

    if (legacy.items.length === 0 && legacy.dailyLooks.length === 0) {
      return { itemCount: 0, lookCount: 0 };
    }

    const dehydratedLegacyItems = await dehydrateItemsForStorage(
      legacy.items,
      idToken
    );

    const itemMap = new Map<string, WardrobeItem>();
    for (const it of storedItemsRef.current) itemMap.set(it.id, it);
    for (const it of dehydratedLegacyItems) itemMap.set(it.id, it);
    const mergedStoredItems = Array.from(itemMap.values());

    const lookMap = new Map<string, DailyLook>();
    for (const lk of storedLooksRef.current) lookMap.set(lk.id, lk);
    for (const lk of legacy.dailyLooks) lookMap.set(lk.id, lk);
    const mergedLooks = Array.from(lookMap.values());

    const hydrated = await hydrateItemsForUi(mergedStoredItems, idToken);
    setItems(hydrated.uiItems);
    setDailyLooks(mergedLooks);
    await persistStoredState(hydrated.storedItems, mergedLooks, currentUser);

    return {
      itemCount: legacy.items.length,
      lookCount: legacy.dailyLooks.length,
    };
  }, [getIdTokenSafe, persistStoredState]);

  const dismissStorageNotice = useCallback(() => {
    setStorageNotice(null);
  }, []);

  // Derived wear counts map across all daily looks + manual per-item wear count adjustments
  const wearCountByItemId = useMemo(() => {
    const lookCounts: Record<string, number> = {};
    for (const look of dailyLooks) {
      for (const itemId of look.itemIds) {
        lookCounts[itemId] = (lookCounts[itemId] || 0) + 1;
      }
    }
    const totals: Record<string, number> = { ...lookCounts };
    for (const item of items) {
      const base = lookCounts[item.id] || 0;
      const offset = item.wearCountOffset ?? 0;
      const effective = Math.max(0, base + offset);
      if (effective > 0 || item.id in totals) {
        totals[item.id] = effective;
      }
    }
    return totals;
  }, [dailyLooks, items]);

  const itemsById = useMemo(() => {
    const map: Record<string, WardrobeItem> = {};
    for (const item of items) {
      map[item.id] = item;
    }
    return map;
  }, [items]);

  const initialLoading = !authReady || !dataLoaded;

  return {
    user,
    authReady,
    initialLoading,
    syncing,
    authError,
    storageNotice,
    dismissStorageNotice,
    storageStats,
    refreshStorageStats,
    signInWithGoogle,
    signOutUser,
    items,
    itemsById,
    dailyLooks,
    wearCountByItemId,
    addItem,
    addItemsBatch,
    updateItem,
    updateItemsBatch,
    deleteItem,
    deleteItemsBatch,
    addDailyLook,
    updateDailyLook,
    deleteDailyLook,
    exportWardrobeFile,
    importWardrobeFile,
    importFromLegacyFirestore,
  };
}
