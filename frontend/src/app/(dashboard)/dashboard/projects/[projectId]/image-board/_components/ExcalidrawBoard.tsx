'use client';

// Excalidraw 埋め込みキャンバス本体。
// このファイルは window 依存の Excalidraw を静的 import するため、
// 親ページから next/dynamic(ssr:false) 経由でのみ読み込むこと。
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFiles,
} from '@excalidraw/excalidraw/types';
import { imageBoardApi, type ImageBoardScene } from '@/lib/image-board';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  boardId: string;
  /** サーバから読み込んだ保存済みシーン（新規は null）。 */
  initialScene: ImageBoardScene;
  readOnly: boolean;
  onSaveStateChange?: (state: SaveState) => void;
}

const SAVE_DEBOUNCE_MS = 900;

export default function ExcalidrawBoard({
  boardId,
  initialScene,
  readOnly,
  onSaveStateChange,
}: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // 直近に保存（or 読込）した要素バージョン。変化が無い onChange（純粋なビュー操作）は無視する。
  const lastVersionRef = useRef<number>(
    getSceneVersion(
      (initialScene?.elements ?? []) as Parameters<typeof getSceneVersion>[0],
    ),
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  onSaveStateChangeRef.current = onSaveStateChange;

  // 初期データ（マウント時のみ Excalidraw に渡る）。null=白紙。
  const initialData: ExcalidrawInitialDataState | null = useMemo(() => {
    if (!initialScene) return null;
    return {
      elements: (initialScene.elements ??
        []) as ExcalidrawInitialDataState['elements'],
      appState: (initialScene.appState ??
        {}) as ExcalidrawInitialDataState['appState'],
      files: (initialScene.files ?? {}) as BinaryFiles,
    };
  }, [initialScene]);

  const flushSave = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const files = api.getFiles();
    const appState = api.getAppState();
    // appState は背景色のみ保存（選択ツール/スクロール/ズーム等の揮発値は保存しない）。
    const scene = {
      elements,
      files,
      appState: { viewBackgroundColor: appState.viewBackgroundColor },
    };
    onSaveStateChangeRef.current?.('saving');
    imageBoardApi
      .update(boardId, { scene })
      .then(() => onSaveStateChangeRef.current?.('saved'))
      .catch(() => onSaveStateChangeRef.current?.('error'));
  }, [boardId]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const handleChange = useCallback(
    (elements: Parameters<typeof getSceneVersion>[0]) => {
      if (readOnly) return;
      const v = getSceneVersion(elements);
      if (v === lastVersionRef.current) return; // 要素変化なし＝保存不要
      lastVersionRef.current = v;
      scheduleSave();
    },
    [readOnly, scheduleSave],
  );

  // アンマウント時に保留中の保存をフラッシュ（ボード切替/離脱で取りこぼさない）。
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (!readOnly) flushSave();
      }
    };
  }, [flushSave, readOnly]);

  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        onChange={handleChange}
        viewModeEnabled={readOnly}
        theme="light"
        langCode="ja-JP"
      />
    </div>
  );
}
