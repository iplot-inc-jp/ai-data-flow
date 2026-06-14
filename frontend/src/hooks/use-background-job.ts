'use client';

import { useEffect, useRef, useState } from 'react';
import { getJob, isTerminalStatus, type Job } from '@/lib/jobs';

/** ポーリング間隔（ms）。 */
const POLL_INTERVAL_MS = 1500;

export interface UseBackgroundJobState {
  /** 直近に取得したジョブ。未取得は null。 */
  job: Job | null;
  /** ポーリング中か（jobId があり、まだ終端状態でない）。 */
  polling: boolean;
  /** 取得失敗時のエラーメッセージ（通信失敗など）。 */
  error: string | null;
}

/**
 * バックグラウンドジョブを 1.5 秒間隔でポーリングするフック。
 *
 *  - jobId が null の間は何もしない（job=null, polling=false）。
 *  - jobId が変わると即座に 1 回取得し、以後 1.5 秒ごとにポーリングする。
 *  - status が SUCCEEDED / FAILED（終端）になったら自動停止する。
 *  - アンマウント時・jobId 変更時は進行中のタイマーをクリアする。
 *
 * 返り値の job をそのまま読み、SUCCEEDED で result を適用、FAILED で error を表示する。
 */
export function useBackgroundJob(jobId: string | null): UseBackgroundJobState {
  const [job, setJob] = useState<Job | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 連続して setTimeout を貼り替えるため、参照で保持してクリーンアップする。
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // jobId 変更/初期化のたびに状態をリセット。
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (!jobId) {
      setJob(null);
      setPolling(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setPolling(true);
    setError(null);

    const tick = async () => {
      try {
        const next = await getJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (isTerminalStatus(next.status)) {
          // 終端 → ポーリング停止。
          setPolling(false);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        // 通信失敗は致命ではない（次のポーリングで回復しうる）が、表示用に保持する。
        setError(err instanceof Error ? err.message : 'ジョブの取得に失敗しました');
      }
      // 未終端 or 一時的な失敗 → 次のポーリングを予約。
      if (!cancelled) {
        timer.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };

    // 即時 1 回取得してから間隔ポーリングへ。
    void tick();

    return () => {
      cancelled = true;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [jobId]);

  return { job, polling, error };
}
