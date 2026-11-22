import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudDownload,
  Download,
  FolderArchive,
  HardDrive,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { StorageUsageStats } from '../utils/fileStorage';

interface StorageManagerModalProps {
  isSignedIn: boolean;
  userName?: string | null;
  stats: StorageUsageStats | null;
  onRefreshStats: () => Promise<void>;
  onExportFile: () => Promise<{ filename: string; totalBytes: number }>;
  onImportFile: (
    file: File,
    mode: 'merge' | 'replace'
  ) => Promise<{ itemCount: number; lookCount: number }>;
  onImportLegacyDb: () => Promise<{ itemCount: number; lookCount: number }>;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function StorageManagerModal({
  isSignedIn,
  userName,
  stats,
  onRefreshStats,
  onExportFile,
  onImportFile,
  onImportLegacyDb,
  onClose,
}: StorageManagerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [busyAction, setBusyAction] = useState<'export' | 'import' | 'legacy' | null>(
    null
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    void onRefreshStats();
  }, [onRefreshStats]);

  const handleExport = async () => {
    setFeedback(null);
    setBusyAction('export');
    try {
      const result = await onExportFile();
      setFeedback({
        type: 'success',
        message: `${result.filename} (${formatBytes(result.totalBytes)}) 파일로 저장했습니다.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : '파일 저장에 실패했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFeedback(null);
    setBusyAction('import');
    try {
      const result = await onImportFile(file, importMode);
      setFeedback({
        type: 'success',
        message: `백업 파일에서 아이템 ${result.itemCount}벌, 데일리룩 ${result.lookCount}건을 ${
          importMode === 'replace' ? '복원' : '병합'
        }했습니다.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : '백업 파일을 불러오지 못했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportLegacy = async () => {
    setFeedback(null);
    setBusyAction('legacy');
    try {
      const result = await onImportLegacyDb();
      if (result.itemCount === 0 && result.lookCount === 0) {
        setFeedback({
          type: 'success',
          message: '기존 클라우드 DB에 저장된 데이터가 없습니다.',
        });
      } else {
        setFeedback({
          type: 'success',
          message: `기존 DB에서 아이템 ${result.itemCount}벌, 데일리룩 ${result.lookCount}건을 압축 파일 저장소로 가져왔습니다.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : '기존 DB 데이터를 불러오지 못했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F7F8FA] border border-slate-200/80 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-[#111315]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111315]">파일 저장소 관리</h2>
              <p className="text-[11px] text-[#5B616E]">
                {isSignedIn
                  ? `${userName || '내 계정'} · 서버 파일 + 브라우저 캐시`
                  : '브라우저 로컬 파일 저장소 (WebP + JSON)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-[#5B616E] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Storage Usage Summary */}
          <div className="rounded-2xl bg-[#F7F8FA] border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#111315]">
                현재 파일 저장 용량
              </span>
              <span className="text-sm font-bold text-[#111315] tabular-nums">
                {stats ? formatBytes(stats.totalBytes) : '계산 중...'}
              </span>
            </div>

            {stats && (
              <>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-xl bg-white border border-slate-200/70 px-3 py-2.5">
                    <div className="text-[11px] text-[#5B616E]">옷장 · 데일리룩 JSON</div>
                    <div className="mt-0.5 font-semibold text-[#111315] tabular-nums">
                      {formatBytes(stats.metadataBytes)}
                    </div>
                    <div className="text-[10px] text-[#8A8F98] mt-0.5">
                      아이템 {stats.itemCount}벌 · 룩 {stats.lookCount}건
                    </div>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200/70 px-3 py-2.5">
                    <div className="text-[11px] text-[#5B616E]">압축 이미지 파일 (WebP)</div>
                    <div className="mt-0.5 font-semibold text-[#111315] tabular-nums">
                      {formatBytes(stats.imageFileBytes)}
                    </div>
                    <div className="text-[10px] text-[#8A8F98] mt-0.5">
                      파일 {stats.imageFileCount}개 (바이너리 저장)
                    </div>
                  </div>
                </div>

                {stats.savedPercent > 0 && (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      기존 DB Base64 저장 방식(약 {formatBytes(stats.estimatedLegacyDbBytes)}) 대비{' '}
                      <strong>약 {stats.savedPercent}%</strong> 용량이 줄었고, 일상 사용 시 DB 읽기 할당량을 소모하지 않습니다.
                    </span>
                  </p>
                )}
              </>
            )}
          </div>

          {/* Portable Backup File Export / Import */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111315]">
              <FolderArchive className="w-4 h-4 text-[#5B616E]" />
              <span>내 기기에 파일로 백업 / 복원</span>
            </div>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleExport}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#111315] text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {busyAction === 'export' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>옷장 전체를 백업 파일(.closet.json)로 저장</span>
            </button>

            <div className="rounded-xl border border-slate-200/80 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-[#111315]">파일 불러오기 방식</span>
                <div className="inline-flex rounded-lg bg-[#F7F8FA] p-0.5 border border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      importMode === 'merge'
                        ? 'bg-white text-[#111315] shadow-xs'
                        : 'text-[#5B616E]'
                    }`}
                  >
                    기존 옷장에 합치기
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      importMode === 'replace'
                        ? 'bg-white text-[#111315] shadow-xs'
                        : 'text-[#5B616E]'
                    }`}
                  >
                    덮어쓰기
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.closet.json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[40px] px-4 rounded-xl bg-[#F7F8FA] hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-[#111315] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {busyAction === 'import' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>백업 파일에서 불러오기</span>
              </button>
            </div>
          </div>

          {/* Optional One-Time Legacy Firestore Migration */}
          {isSignedIn && (
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <div className="text-xs font-semibold text-[#111315]">
                기존 클라우드 DB 데이터 이전
              </div>
              <p className="text-[11px] text-[#5B616E] leading-relaxed">
                이전에 Firestore DB에 저장해 둔 옷과 데일리룩이 있다면 1회 가져와서 저용량 WebP 파일 저장소로 합칠 수 있습니다.
              </p>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleImportLegacy}
                className="w-full min-h-[40px] px-4 rounded-xl bg-white hover:bg-[#F7F8FA] border border-slate-200 text-xs font-semibold text-[#111315] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {busyAction === 'legacy' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudDownload className="w-4 h-4 text-[#5B616E]" />
                )}
                <span>기존 DB에서 옷장 데이터 가져오기</span>
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`rounded-xl px-3.5 py-2.5 text-xs border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
