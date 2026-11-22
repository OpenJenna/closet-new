import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  HardDrive,
  Images,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Shirt,
  X,
} from 'lucide-react';
import { CalendarView } from './components/CalendarView';
import { DailyLookDetailView } from './components/DailyLookDetailView';
import { DailyLookFormModal } from './components/DailyLookFormModal';
import { ItemDetailView } from './components/ItemDetailView';
import { ItemFormModal } from './components/ItemFormModal';
import { StatisticsView } from './components/StatisticsView';
import { StorageManagerModal } from './components/StorageManagerModal';
import { WardrobeView } from './components/WardrobeView';
import { useWardrobeStore } from './hooks/useWardrobeStore';
import { Category, DailyLook, MainTab, WardrobeItem } from './types/wardrobe';
import {
  isLookCustomArranged,
  setLookCustomOffsets,
  sortItemIdsForLookbook,
} from './utils/collageLayout';
import { getTodayIsoDate } from './utils/formatters';

type RouteState =
  | { view: 'wardrobe' }
  | { view: 'itemDetail'; itemId: string }
  | { view: 'calendar' }
  | { view: 'lookDetail'; date: string; lookId?: string }
  | { view: 'stats' };

export default function App() {
  const store = useWardrobeStore();

  const [route, setRoute] = useState<RouteState>({ view: 'wardrobe' });
  const [quickAddSheetOpen, setQuickAddSheetOpen] = useState(false);
  const [storageModalOpen, setStorageModalOpen] = useState(false);

  // Item Modal State
  const [itemModalState, setItemModalState] = useState<{
    open: boolean;
    initialMode?: 'single' | 'batch';
    editingItem?: WardrobeItem;
    presetCategory?: Category;
    presetSubCategory?: string;
  }>({ open: false });

  // Daily Look Modal State
  const [lookModalState, setLookModalState] = useState<{
    open: boolean;
    editingLook?: DailyLook;
    presetDate?: string;
    presetItemIds?: string[];
  }>({ open: false });

  const activeMainTab: MainTab =
    route.view === 'calendar' || route.view === 'lookDetail'
      ? 'calendar'
      : route.view === 'stats'
        ? 'stats'
        : 'wardrobe';

  const selectedItem =
    route.view === 'itemDetail' ? store.itemsById[route.itemId] : undefined;

  const linkedLooksForSelectedItem = useMemo(() => {
    if (route.view !== 'itemDetail') return [];
    return store.dailyLooks.filter((lk) => lk.itemIds.includes(route.itemId));
  }, [route, store.dailyLooks]);

  const todayIso = getTodayIsoDate();

  const looksForSelectedDate = useMemo(() => {
    if (route.view !== 'lookDetail') return [];
    return store.dailyLooks.filter((lk) => lk.date === route.date);
  }, [route, store.dailyLooks]);

  const todayLooks = useMemo(() => {
    return store.dailyLooks.filter((lk) => lk.date === todayIso);
  }, [store.dailyLooks, todayIso]);

  const existingBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of store.items) {
      const b = item.brand.trim();
      if (b) {
        counts.set(b, (counts.get(b) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [store.items]);

  const existingItemSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; brand: string; category: Category }[] = [];
    for (const item of store.items) {
      const trimmedName = item.name.trim();
      const key = `${item.brand.trim().toLowerCase()}::${trimmedName.toLowerCase()}`;
      if (trimmedName && !seen.has(key)) {
        seen.add(key);
        list.push({
          name: trimmedName,
          brand: item.brand.trim(),
          category: item.category,
        });
      }
    }
    return list;
  }, [store.items]);

  const existingMaterials = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of store.items) {
      const m = (item.material ?? '').trim();
      if (m && m !== '미입력') {
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([mat]) => mat);
  }, [store.items]);

  const existingSizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of store.items) {
      const s = (item.size ?? '').trim();
      if (s && s !== '미입력') {
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([sz]) => sz);
  }, [store.items]);

  const handleOpenLookById = (lookId: string) => {
    const target = store.dailyLooks.find((lk) => lk.id === lookId);
    if (!target) return;
    setRoute({ view: 'lookDetail', date: target.date, lookId: target.id });
  };

  const handleNavigateTab = (tab: MainTab) => {
    if (tab === 'wardrobe') setRoute({ view: 'wardrobe' });
    if (tab === 'calendar') setRoute({ view: 'calendar' });
    if (tab === 'stats') setRoute({ view: 'stats' });
  };

  return (
    <div className="min-h-screen bg-white text-[#111315] flex flex-col">
      {/* Desktop Top Bar (3-zone contract) */}
      <header className="hidden md:block sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setRoute({ view: 'wardrobe' })}
            className="text-lg font-bold tracking-tight text-[#111315] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Closet Note
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => handleNavigateTab('wardrobe')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeMainTab === 'wardrobe'
                  ? 'text-[#111315] font-semibold border-b-2 border-[#111315]'
                  : 'text-[#5B616E] hover:text-[#111315]'
              }`}
            >
              내 옷장
            </button>
            <button
              type="button"
              onClick={() => handleNavigateTab('calendar')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeMainTab === 'calendar'
                  ? 'text-[#111315] font-semibold border-b-2 border-[#111315]'
                  : 'text-[#5B616E] hover:text-[#111315]'
              }`}
            >
              데일리룩 달력
            </button>
            <button
              type="button"
              onClick={() => handleNavigateTab('stats')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeMainTab === 'stats'
                  ? 'text-[#111315] font-semibold border-b-2 border-[#111315]'
                  : 'text-[#5B616E] hover:text-[#111315]'
              }`}
            >
              통계
            </button>
            <button
              type="button"
              onClick={() => setStorageModalOpen(true)}
              className="py-1 text-xs text-[#5B616E] hover:text-[#111315] whitespace-nowrap shrink-0 inline-flex items-center gap-1 cursor-pointer"
              title="파일 저장소 용량 확인 및 백업/복원"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>파일 백업</span>
            </button>
            {!store.authReady ? (
              <span
                aria-hidden="true"
                className="w-20 h-4 rounded-md bg-slate-100 animate-pulse shrink-0"
              />
            ) : store.user ? (
              <button
                type="button"
                onClick={store.signOutUser}
                title="로그아웃"
                className="py-1 text-xs text-[#5B616E] hover:text-[#111315] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>{store.user.displayName || '내 계정'}</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={store.signInWithGoogle}
                className="py-1 text-xs text-[#2563EB] hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>계정 연결</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setItemModalState({ open: true })}
              className="px-4 py-2 rounded-xl bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>아이템 추가</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Compact Top Header (<= 52px) */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 h-13 px-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRoute({ view: 'wardrobe' })}
          className="text-base font-bold tracking-tight text-[#111315] whitespace-nowrap shrink-0"
        >
          Closet Note
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStorageModalOpen(true)}
            aria-label="파일 저장소 관리 및 백업"
            className="min-h-[40px] px-2 text-xs font-medium text-[#5B616E] inline-flex items-center gap-1"
          >
            <HardDrive className="w-4 h-4" />
            <span>파일</span>
          </button>
          {!store.authReady ? (
            <span
              aria-hidden="true"
              className="w-16 h-4 rounded-md bg-slate-100 animate-pulse shrink-0"
            />
          ) : store.user ? (
            <button
              type="button"
              onClick={store.signOutUser}
              className="min-h-[40px] px-2 text-xs font-medium text-[#5B616E] inline-flex items-center gap-1"
            >
              <span className="max-w-[76px] truncate">
                {store.user.displayName || '내 계정'}
              </span>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={store.signInWithGoogle}
              className="min-h-[40px] px-2 text-xs font-semibold text-[#2563EB] inline-flex items-center gap-1"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>로그인</span>
            </button>
          )}
        </div>
      </header>

      {/* Sync / Storage / Auth Feedback Banner (if needed) */}
      {((store.syncing && !store.initialLoading) ||
        store.authError ||
        store.storageNotice) && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-10 pt-3 space-y-2">
          {store.syncing && !store.initialLoading && (
            <div className="text-xs text-[#5B616E] bg-[#F7F8FA] border border-slate-200 rounded-xl px-4 py-2">
              파일 저장소에서 옷장을 불러오는 중입니다...
            </div>
          )}
          {store.storageNotice && (
            <div className="text-xs text-[#111315] bg-[#F7F8FA] border border-slate-200 rounded-xl px-4 py-2 flex items-center justify-between gap-3">
              <span>{store.storageNotice}</span>
              <button
                type="button"
                onClick={store.dismissStorageNotice}
                aria-label="알림 닫기"
                className="text-[#8A8F98] hover:text-[#111315] shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {store.authError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              {store.authError}
            </div>
          )}
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-5 pb-24 md:py-8">
        {store.initialLoading ? (
          <div className="space-y-6" aria-busy="true" aria-label="내 옷장을 불러오는 중">
            <div className="flex flex-col items-center justify-center py-8 gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#F7F8FA] border border-slate-200/80 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-[#111315] animate-spin" />
              </div>
              <p className="text-sm font-semibold text-[#111315]">
                내 옷장을 불러오는 중입니다
              </p>
              <p className="text-xs text-[#8A8F98]">
                잠시만 기다려 주세요...
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200/70 bg-white overflow-hidden"
                >
                  <div className="aspect-square bg-[#F7F8FA] animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-14 rounded bg-slate-100 animate-pulse" />
                    <div className="h-3.5 w-3/4 rounded bg-slate-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <>
        {route.view === 'wardrobe' && (
          <WardrobeView
            items={store.items}
            dailyLooks={store.dailyLooks}
            wearCountByItemId={store.wearCountByItemId}
            existingBrands={existingBrands}
            existingMaterials={existingMaterials}
            existingSizes={existingSizes}
            onSelectItem={(itemId) => setRoute({ view: 'itemDetail', itemId })}
            onOpenAddItem={(presetCategory, presetSubCategory) =>
              setItemModalState({
                open: true,
                initialMode: 'single',
                presetCategory,
                presetSubCategory,
              })
            }
            onOpenBatchAdd={(presetCategory, presetSubCategory) =>
              setItemModalState({
                open: true,
                initialMode: 'batch',
                presetCategory,
                presetSubCategory,
              })
            }
            onUpdateItemsBatch={store.updateItemsBatch}
            onDeleteItemsBatch={store.deleteItemsBatch}
          />
        )}

        {route.view === 'itemDetail' && selectedItem && (
          <ItemDetailView
            key={selectedItem.id}
            item={selectedItem}
            allItemsById={store.itemsById}
            linkedLooks={linkedLooksForSelectedItem}
            todayIso={todayIso}
            todayLooks={todayLooks}
            onBack={() => setRoute({ view: 'wardrobe' })}
            onEditItem={(item) =>
              setItemModalState({ open: true, editingItem: item })
            }
            onUpdateItem={store.updateItem}
            onDeleteItem={store.deleteItem}
            onSelectLook={handleOpenLookById}
            onSelectItem={(itemId) => setRoute({ view: 'itemDetail', itemId })}
            onCreateLookWithItem={(itemId) =>
              setLookModalState({
                open: true,
                presetDate: todayIso,
                presetItemIds: [itemId],
              })
            }
            onCreateLookWithItems={(itemIds) =>
              setLookModalState({
                open: true,
                presetDate: todayIso,
                presetItemIds: itemIds,
              })
            }
            onAddItemToLook={async (lookId, itemId) => {
              const target = store.dailyLooks.find((lk) => lk.id === lookId);
              if (!target || target.itemIds.includes(itemId) || target.itemIds.length >= 15) {
                return;
              }
              const combined = [...target.itemIds, itemId];
              const nextIds = isLookCustomArranged(lookId)
                ? combined
                : sortItemIdsForLookbook(combined, store.itemsById);
              await store.updateDailyLook(lookId, {
                itemIds: nextIds,
              });
            }}
            onCreateTodayLookWithItem={(itemId) =>
              store.addDailyLook({
                date: todayIso,
                title: '오늘의 데일리룩',
                weatherCondition: 'sunny',
                tempHigh: 15,
                tempLow: 6,
                itemIds: [itemId],
              })
            }
          />
        )}

        {route.view === 'itemDetail' && !selectedItem && (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-[#5B616E]">
              해당 아이템을 찾을 수 없습니다.
            </p>
            <button
              type="button"
              onClick={() => setRoute({ view: 'wardrobe' })}
              className="px-4 py-2 rounded-xl bg-[#111315] text-white text-xs font-semibold cursor-pointer"
            >
              옷장으로 돌아가기
            </button>
          </div>
        )}

        {route.view === 'calendar' && (
          <CalendarView
            items={store.items}
            itemsById={store.itemsById}
            dailyLooks={store.dailyLooks}
            onSelectDateLooks={(date, lookId) =>
              setRoute({ view: 'lookDetail', date, lookId })
            }
            onAddLookOnDate={(date) =>
              setLookModalState({ open: true, presetDate: date })
            }
            onSelectItem={(itemId) => setRoute({ view: 'itemDetail', itemId })}
          />
        )}

        {route.view === 'lookDetail' && (
          <DailyLookDetailView
            key={`${route.date}-${route.lookId ?? ''}`}
            date={route.date}
            looksOnDate={looksForSelectedDate}
            initialLookId={route.lookId}
            itemsById={store.itemsById}
            onBack={() => setRoute({ view: 'calendar' })}
            onSelectItem={(itemId) => setRoute({ view: 'itemDetail', itemId })}
            onAddNewLookOnDate={(date) =>
              setLookModalState({ open: true, presetDate: date })
            }
            onEditLook={(look) =>
              setLookModalState({ open: true, editingLook: look })
            }
            onUpdateLook={store.updateDailyLook}
            onDeleteLook={store.deleteDailyLook}
          />
        )}

        {route.view === 'stats' && (
          <StatisticsView
            items={store.items}
            itemsById={store.itemsById}
            dailyLooks={store.dailyLooks}
            wearCountByItemId={store.wearCountByItemId}
            onSelectItem={(itemId) => setRoute({ view: 'itemDetail', itemId })}
          />
        )}
        </>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (56px, within 15% sticky height cap) */}
      <nav
        aria-label="하단 내비게이션"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center"
      >
        <button
          type="button"
          onClick={() => handleNavigateTab('wardrobe')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 ${
            activeMainTab === 'wardrobe' ? 'text-[#111315]' : 'text-[#8A8F98]'
          }`}
        >
          <Shirt className="w-5 h-5" />
          <span className="text-[10px] font-semibold">옷장</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigateTab('calendar')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 ${
            activeMainTab === 'calendar' ? 'text-[#111315]' : 'text-[#8A8F98]'
          }`}
        >
          <CalendarDays className="w-5 h-5" />
          <span className="text-[10px] font-semibold">데일리룩</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickAddSheetOpen(true)}
          aria-label="새 아이템 또는 데일리룩 추가"
          className="h-full flex items-center justify-center"
        >
          <span className="w-10 h-10 rounded-full bg-[#111315] text-white flex items-center justify-center shadow-sm">
            <Plus className="w-5 h-5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigateTab('stats')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 ${
            activeMainTab === 'stats' ? 'text-[#111315]' : 'text-[#8A8F98]'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] font-semibold">통계</span>
        </button>
      </nav>

      {/* Mobile Quick Add Action Sheet */}
      {quickAddSheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end"
          onClick={() => setQuickAddSheetOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-2" />
            <button
              type="button"
              onClick={() => {
                setQuickAddSheetOpen(false);
                setItemModalState({ open: true, initialMode: 'single' });
              }}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#F7F8FA] text-left text-sm font-semibold text-[#111315] flex items-center justify-between"
            >
              <span>새 옷 아이템 등록</span>
              <Shirt className="w-4 h-4 text-[#5B616E]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickAddSheetOpen(false);
                setItemModalState({ open: true, initialMode: 'batch' });
              }}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#F7F8FA] text-left text-sm font-semibold text-[#111315] flex items-center justify-between"
            >
              <span>여러 사진으로 개별 아이템 등록</span>
              <Images className="w-4 h-4 text-[#5B616E]" />
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickAddSheetOpen(false);
                setLookModalState({ open: true, presetDate: todayIso });
              }}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#111315] text-left text-sm font-semibold text-white flex items-center justify-between"
            >
              <span>오늘의 데일리룩 기록</span>
              <CalendarDays className="w-4 h-4 text-white/80" />
            </button>
          </div>
        </div>
      )}

      {/* Item Create / Edit Modal */}
      {itemModalState.open && (
        <ItemFormModal
          initialItem={itemModalState.editingItem}
          initialMode={itemModalState.initialMode}
          linkedLookCount={
            itemModalState.editingItem
              ? store.dailyLooks.filter((lk) =>
                  lk.itemIds.includes(itemModalState.editingItem!.id)
                ).length
              : 0
          }
          existingBrands={existingBrands}
          existingItemSuggestions={existingItemSuggestions}
          existingMaterials={existingMaterials}
          existingSizes={existingSizes}
          presetCategory={itemModalState.presetCategory}
          presetSubCategory={itemModalState.presetSubCategory}
          onClose={() => setItemModalState({ open: false })}
          onSave={async (data) => {
            if (itemModalState.editingItem) {
              await store.updateItem(itemModalState.editingItem.id, data);
            } else {
              await store.addItem(data);
            }
          }}
          onSaveBatch={async (batchItems) => {
            await store.addItemsBatch(batchItems);
          }}
        />
      )}

      {/* Daily Look Create / Edit Modal */}
      {lookModalState.open && (
        <DailyLookFormModal
          items={store.items}
          itemsById={store.itemsById}
          dailyLooks={store.dailyLooks}
          initialLook={lookModalState.editingLook}
          presetDate={lookModalState.presetDate}
          presetItemIds={lookModalState.presetItemIds}
          onClose={() => setLookModalState({ open: false })}
          onSave={async (data, customOffsets) => {
            if (lookModalState.editingLook) {
              await store.updateDailyLook(lookModalState.editingLook.id, data);
            } else {
              const created = await store.addDailyLook(data);
              if (customOffsets && Object.keys(customOffsets).length > 0) {
                setLookCustomOffsets(created.id, customOffsets);
              }
              setRoute({
                view: 'lookDetail',
                date: created.date,
                lookId: created.id,
              });
            }
          }}
        />
      )}
      {/* File Storage & Backup Manager Modal */}
      {storageModalOpen && (
        <StorageManagerModal
          isSignedIn={Boolean(store.user)}
          userName={store.user?.displayName}
          stats={store.storageStats}
          onRefreshStats={store.refreshStorageStats}
          onExportFile={store.exportWardrobeFile}
          onImportFile={store.importWardrobeFile}
          onImportLegacyDb={store.importFromLegacyFirestore}
          onClose={() => setStorageModalOpen(false)}
        />
      )}
    </div>
  );
}
