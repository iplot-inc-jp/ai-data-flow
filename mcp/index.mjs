#!/usr/bin/env node
/**
 * ai-data-flow MCP server
 *
 * 既存の ai-data-flow バックエンド (/api) を APIキー認証で叩く薄い MCP サーバ。
 * IPLoT 方法論パイプライン（プロジェクト/フェーズ/ASIS・TOBEフロー/イシューツリー/GAP/CRUD）を
 * MCP ツールとして公開する。
 *
 * 環境変数:
 *   AIDATAFLOW_API_URL  バックエンドのベースURL（既定 http://localhost:5021）
 *   AIDATAFLOW_API_KEY  発行したAPIキー（sk_...）。必須。
 *
 * 起動: AIDATAFLOW_API_KEY=sk_... node index.mjs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = (process.env.AIDATAFLOW_API_URL || 'http://localhost:5021').replace(/\/$/, '');
const API_KEY = process.env.AIDATAFLOW_API_KEY;

if (!API_KEY) {
  console.error('[ai-data-flow-mcp] AIDATAFLOW_API_KEY is required (issue one via POST /api/api-keys).');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${method} ${path}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const wrap = (fn) => async (args) => {
  try {
    return ok(await fn(args ?? {}));
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
};

const server = new McpServer({ name: 'ai-data-flow', version: '0.1.0' });

// ---------- 組織・プロジェクト ----------
server.tool('list_organizations', '所属組織の一覧を取得', {}, wrap(() => call('GET', '/organizations')));

server.tool('list_projects', '組織内のプロジェクト一覧', { organizationId: z.string() },
  wrap(({ organizationId }) => call('GET', `/organizations/${organizationId}/projects`)));

server.tool('get_project', 'プロジェクト詳細', { projectId: z.string() },
  wrap(({ projectId }) => call('GET', `/projects/${projectId}`)));

// ---------- フェーズ (Ph.0–7 パイプライン) ----------
server.tool('list_phases', 'プロジェクトのフェーズ一覧 (Ph.0–7)', { projectId: z.string() },
  wrap(({ projectId }) => call('GET', `/projects/${projectId}/phases`)));

server.tool('initialize_phases', '8つの標準フェーズ(Ph.0–7)を初期化(冪等)', { projectId: z.string() },
  wrap(({ projectId }) => call('POST', `/projects/${projectId}/phases/initialize`, {})));

server.tool('transition_phase', 'フェーズの状態を遷移', {
  phaseId: z.string(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'APPROVED', 'DONE']),
}, wrap(({ phaseId, status }) => call('POST', `/phases/${phaseId}/transition`, { status })));

// ---------- 業務フロー (ASIS / TOBE) ----------
server.tool('list_flows', 'プロジェクトの業務フロー一覧(階層含む)', { projectId: z.string() },
  wrap(({ projectId }) => call('GET', `/business-flows/project/${projectId}/all`)));

server.tool('get_flow', 'フロー詳細(ノード・エッジ・パンくず含む)', { flowId: z.string() },
  wrap(({ flowId }) => call('GET', `/business-flows/${flowId}`)));

server.tool('create_flow', '業務フローを作成(ASIS/TOBE)', {
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  kind: z.enum(['ASIS', 'TOBE']).optional(),
}, wrap(({ projectId, name, description, kind }) =>
  call('POST', '/business-flows', { projectId, name, description, kind })));

// ---------- イシューツリー (なぜ型 / 打ち手型) ----------
server.tool('list_issue_trees', '課題ツリー一覧 (type省略=全件)', {
  projectId: z.string(),
  type: z.enum(['WHY', 'SOLUTION']).optional(),
}, wrap(({ projectId, type }) =>
  call('GET', `/projects/${projectId}/issue-trees${type ? `?type=${type}` : ''}`)));

server.tool('get_issue_tree', '課題ツリー詳細(ノード含む)', { treeId: z.string() },
  wrap(({ treeId }) => call('GET', `/issue-trees/${treeId}`)));

server.tool('create_issue_tree', '課題ツリーを作成 (WHY=なぜ型/SOLUTION=打ち手型)', {
  projectId: z.string(),
  type: z.enum(['WHY', 'SOLUTION']),
  name: z.string(),
  rootQuestion: z.string().optional(),
}, wrap(({ projectId, type, name, rootQuestion }) =>
  call('POST', `/projects/${projectId}/issue-trees`, { type, name, rootQuestion })));

server.tool('add_issue_node', 'ツリーにノードを追加', {
  treeId: z.string(),
  label: z.string(),
  parentId: z.string().optional(),
  verification: z.enum(['CONFIRMED', 'REJECTED', 'UNKNOWN', 'NEEDS_HEARING', 'NA']).optional(),
  recommendation: z.enum(['ADOPT', 'HOLD', 'REJECT', 'NA']).optional(),
  evidence: z.string().optional(),
  order: z.number().optional(),
}, wrap(({ treeId, ...body }) => call('POST', `/issue-trees/${treeId}/nodes`, body)));

server.tool('set_node_verification', 'ノードの検証マーク(○×△/要ヒアリング)を更新', {
  treeId: z.string(),
  nodeId: z.string(),
  verification: z.enum(['CONFIRMED', 'REJECTED', 'UNKNOWN', 'NEEDS_HEARING', 'NA']),
}, wrap(({ treeId, nodeId, verification }) =>
  call('PUT', `/issue-trees/${treeId}/nodes/${nodeId}/verification`, { verification })));

// ---------- GAP (ASIS↔TOBE 差分) ----------
server.tool('list_gap_items', 'GAP一覧 (ASIS↔TOBE差分=本当の課題)', { projectId: z.string() },
  wrap(({ projectId }) => call('GET', `/projects/${projectId}/gap-items`)));

server.tool('create_gap_item', 'GAP項目を作成', {
  projectId: z.string(),
  businessArea: z.string(),
  asisDescription: z.string().optional(),
  tobeDescription: z.string().optional(),
  gapDescription: z.string().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  ownerName: z.string().optional(),
}, wrap(({ projectId, ...body }) => call('POST', `/projects/${projectId}/gap-items`, body)));

server.tool('resolve_gap_item', 'GAP項目を解決済みにする', { gapItemId: z.string() },
  wrap(({ gapItemId }) => call('POST', `/gap-items/${gapItemId}/resolve`, {})));

// ---------- データカタログ・ロール (CRUD表の素材) ----------
server.tool('list_tables', 'データカタログのテーブル一覧(カラム・CRUDマッピング含む)', { projectId: z.string() },
  wrap(({ projectId }) => call('GET', `/tables/project/${projectId}`)));

server.tool('list_roles', 'スイムレーンのロール一覧', { projectId: z.string() },
  wrap(({ projectId }) => call('GET', `/roles/project/${projectId}`)));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[ai-data-flow-mcp] connected via stdio. API:', API_URL);
