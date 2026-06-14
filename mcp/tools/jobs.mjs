/**
 * バックグラウンドジョブ（AI生成の非同期化）
 *
 * 重いAI生成は非同期ジョブとして起票（enqueue）し、ai_job_get でポーリングして完了を待つ。
 * 本番では QStash 経由で実行され、ローカルでは enqueue 内で inline 実行される。
 * type 例:
 *  - AI_MERMAID_OBJECTMAP: payload.mermaid（既存の Mermaid テキスト）を AI 解析し、
 *    オブジェクト関係性マップに取り込む（永続）。result は { kind:"OBJECT_GRAPH", graph }。
 *  - AI_MERMAID_FLOW: payload.mermaid を AI 解析し、業務フロー構造に変換（永続せず result に返す）。
 *  - AI_KPI / AI_ISSUE_SUGGEST。
 * 注意: MERMAID 系は「Mermaid を生成する」ジョブではなく「与えた Mermaid を解析する」処理。
 *       payload.mermaid を渡さないとジョブは FAILED になる。
 */

import { z } from 'zod';
import { wrap } from '../lib/api.mjs';

export function registerTools(server, call) {
  server.tool(
    'ai_job_enqueue',
    '重いAI生成を非同期ジョブとして起票する（enqueue→ai_job_get でポーリングして完了を待つ）。' +
      '本番は QStash 経由、ローカルは inline 実行。戻り値は { jobId, status }。' +
      'type と payload: ' +
      'AI_MERMAID_OBJECTMAP は payload.mermaid（既存の Mermaid テキスト）を AI 解析して' +
      'オブジェクト関係性マップに取り込む（永続。result は { kind:"OBJECT_GRAPH", graph }）。' +
      'AI_MERMAID_FLOW は payload.mermaid を AI 解析して業務フロー構造に変換（永続せず result に返す）。' +
      '※どちらも「Mermaid を生成する」ジョブではなく「与えた Mermaid を解析する」処理で、' +
      'payload.mermaid を渡さないと FAILED になる（説明文から Mermaid 生成する機能は無い）。' +
      'AI_KPI は payload.category（BUSINESS|AI_QUALITY）等で KPI 生成。' +
      'AI_ISSUE_SUGGEST は payload.context（IssueNodeSuggestContext 相当）でイシュー候補生成。' +
      '秘匿情報は payload に入れない。',
    {
      projectId: z.string().describe('プロジェクトID'),
      type: z
        .enum(['AI_MERMAID_OBJECTMAP', 'AI_MERMAID_FLOW', 'AI_KPI', 'AI_ISSUE_SUGGEST'])
        .describe('ジョブ種別'),
      payload: z
        .record(z.any())
        .optional()
        .describe(
          'ジョブ入力。AI_MERMAID_OBJECTMAP/AI_MERMAID_FLOW は { mermaid: "erDiagram\\n ..." } が必須。' +
            'AI_KPI は { category, ... }、AI_ISSUE_SUGGEST は { context: {...} }。',
        ),
    },
    wrap(({ projectId, type, payload }) =>
      call('POST', `/projects/${projectId}/ai-jobs`, { body: { type, payload } }),
    ),
  );

  server.tool(
    'ai_job_get',
    '単一ジョブを取得する（ポーリング用）。status が QUEUED/RUNNING/SUCCEEDED/FAILED 等で進捗を確認し、' +
      'SUCCEEDED になったら result を読む。ai_job_enqueue の戻り jobId をここに渡してポーリングする。',
    {
      id: z.string().describe('ジョブID（ai_job_enqueue の戻り jobId）'),
    },
    wrap(({ id }) => call('GET', `/jobs/${id}`)),
  );

  server.tool(
    'ai_jobs_list',
    'プロジェクトの直近ジョブ一覧を新しい順で取得する。',
    {
      projectId: z.string().describe('プロジェクトID'),
      limit: z
        .number()
        .int()
        .optional()
        .describe('取得件数（1〜100、既定 20）'),
    },
    wrap(({ projectId, limit }) =>
      call('GET', `/projects/${projectId}/jobs`, { query: { limit } }),
    ),
  );
}
