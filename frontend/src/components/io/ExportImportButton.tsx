'use client';

/**
 * ExportImportButton — 各機能の JSON エクスポート / インポートをまとめた再利用ボタン群。
 *
 * - エクスポート: ボタン押下で `getExport()` を呼び JSON を取得し、Blob でファイルダウンロード
 *   （ファイル名は `fileBaseName`＋日時）。閲覧権限でも実行できる。
 * - インポート: ファイル選択(.json) → パース → mode（置換 replace / 追加 merge）を選ぶ確認
 *   ダイアログ → `onImport(parsed, mode)` 実行 → 成功トースト＋`onDone()`（一覧リフレッシュ）。
 *   `canEdit=false` のときインポートボタンは無効。
 *
 * 既存作法に合わせ Button / Dialog / useToast / lucide アイコンを使用。fetch は呼び出し側が
 * lib/io.ts のラッパで包んで props に渡す（本コンポーネントは I/O の種類を知らない）。
 */

import { useRef, useState, type ReactNode } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { downloadJson, readJsonFile, type ImportMode } from '@/lib/io';

export interface ExportImportButtonProps {
  /** ボタン群のラベルの中核（例: "リスク"）。"○○をエクスポート" のように使う。 */
  label: string;
  /** ダウンロードファイル名の基底（拡張子・日時は自動付与）。 */
  fileBaseName: string;
  /** エクスポート JSON を取得する関数。 */
  getExport: () => Promise<unknown>;
  /**
   * インポート関数。パース済み JSON と mode を受ける。
   * `null` を渡すとインポート UI 自体を出さない（エクスポート専用）。
   */
  onImport?: ((parsed: unknown, mode: ImportMode) => Promise<unknown>) | null;
  /** インポート成功後に呼ぶ（一覧リフレッシュ等）。 */
  onDone?: () => void;
  /** 編集可否。false ならインポートは無効（エクスポートは可）。 */
  canEdit?: boolean;
  /** ボタンサイズ（既定 sm）。 */
  size?: 'sm' | 'default';
  /** インポートで mode 選択を出すか（既定 true）。false なら merge 固定で即実行。 */
  withModeChoice?: boolean;
  /** 確認ダイアログ内の補足説明（任意）。 */
  importHint?: ReactNode;
}

export function ExportImportButton({
  label,
  fileBaseName,
  getExport,
  onImport,
  onDone,
  canEdit = false,
  size = 'sm',
  withModeChoice = true,
  importHint,
}: ExportImportButtonProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // 選択済み（パース済み）ファイルを保持して mode 選択ダイアログを開く。
  const [pending, setPending] = useState<{ name: string; data: unknown } | null>(
    null,
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await getExport();
      downloadJson(data, fileBaseName);
      toast({ title: `${label}をエクスポートしました` });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'エクスポートに失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFilePicked = async (file: File | undefined) => {
    // input をリセットして同じファイルを連続選択できるようにする。
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      setPending({ name: file.name, data });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '読み込みに失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const runImport = async (mode: ImportMode) => {
    if (!pending || !onImport) return;
    setImporting(true);
    try {
      await onImport(pending.data, mode);
      toast({
        title: `${label}をインポートしました`,
        description: mode === 'replace' ? '置換で取り込みました' : '追加で取り込みました',
      });
      setPending(null);
      onDone?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'インポートに失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setImporting(false);
    }
  };

  const showImport = onImport !== null && onImport !== undefined;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={handleExport}
        disabled={exporting}
        title={`${label}を JSON でエクスポート`}
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="ml-1.5 hidden sm:inline">エクスポート</span>
      </Button>

      {showImport && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleFilePicked(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={() => fileInputRef.current?.click()}
            disabled={!canEdit}
            title={
              canEdit
                ? `${label}を JSON からインポート`
                : '編集権限がありません'
            }
          >
            <Upload className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">インポート</span>
          </Button>
        </>
      )}

      {/* mode 選択（確認）ダイアログ */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !importing) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label}をインポート</DialogTitle>
            <DialogDescription>
              {pending ? (
                <>
                  <span className="font-medium break-all">{pending.name}</span>{' '}
                  を取り込みます。
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {importHint && (
            <p className="text-sm text-muted-foreground">{importHint}</p>
          )}

          {withModeChoice ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                取り込み方法を選んでください。
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">追加（merge）</span>
                  ：既存データを残したまま追加します。
                </li>
                <li>
                  <span className="font-medium text-destructive">置換（replace）</span>
                  ：この機能の既存データを削除してから取り込みます。
                </li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              既存データに追加（merge）で取り込みます。
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={importing}
            >
              キャンセル
            </Button>
            {withModeChoice && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => runImport('replace')}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={importing ? 'ml-1.5' : ''}>置換で取り込む</span>
              </Button>
            )}
            <Button
              type="button"
              onClick={() => runImport('merge')}
              disabled={importing}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={importing ? 'ml-1.5' : ''}>
                {withModeChoice ? '追加で取り込む' : '取り込む'}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
