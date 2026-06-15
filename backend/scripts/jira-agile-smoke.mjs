/**
 * Jira アジャイル取込 e2e スモーク。
 * Jira CSV（Epic / Story(Epic Link+SP+Sprint) / Sub-task(Parent)）→ /tasks/import-jira →
 * issueType/epicId/parentId/storyPoints/sprint が正しく付くか＋冪等(再取込で重複しない)を確認。
 * 実行: backend/ で `node scripts/jira-agile-smoke.mjs`
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const env = readFileSync(resolve(BACKEND_DIR, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue; let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {}
const { PrismaClient } = require('@prisma/client');
const API = process.env.KG_API || 'http://localhost:5021/api';
const prisma = new PrismaClient();
let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅', m); } else { FAIL++; console.log('  ❌', m); } };

async function api(method, path, body, token) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${typeof j === 'string' ? j : JSON.stringify(j)}`);
  return j;
}

const CSV = [
  'Issue key,Summary,Issue Type,Status,Priority,Parent,Epic Link,Story Points,Sprint',
  'EP-1,受注DXエピック,Epic,進行中,高,,,,',
  'ST-1,受注フォーム改修,Story,対応中,中,,EP-1,5,Sprint 1',
  'SUB-1,バリデーション実装,Sub-task,未対応,低,ST-1,,,Sprint 1',
].join('\n');

async function main() {
  console.log('=== Jira アジャイル取込 e2e ===\nAPI:', API);
  const proj = await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
  const lg = await api('POST', '/auth/login', { email: 'demo@iplot.local', password: 'password123' });
  const token = lg.accessToken || lg.token;
  const pid = proj.id;
  console.log('project:', pid, proj.name);

  // 1) 取込
  const r1 = await api('POST', `/projects/${pid}/tasks/import-jira`, { csv: CSV }, token);
  ok((r1.created ?? 0) >= 3 || (r1.created ?? 0) + (r1.updated ?? 0) >= 3, `取込 created=${r1.created} updated=${r1.updated}`);

  const tasksResp = await api('GET', `/projects/${pid}/tasks`, undefined, token);
  const tasks = Array.isArray(tasksResp) ? tasksResp : (tasksResp.tasks || []);
  // sourceKey は応答に非露出のため CSV のタイトルで突き合わせる。
  const byTitle = (s) => tasks.find((t) => t.title === s);
  const ep = byTitle('受注DXエピック'), st = byTitle('受注フォーム改修'), sub = byTitle('バリデーション実装');
  ok(ep && ep.issueType === 'EPIC', `EP-1 が issueType=EPIC (${ep && ep.issueType})`);
  ok(st && st.issueType === 'STORY', `ST-1 が issueType=STORY (${st && st.issueType})`);
  ok(sub && sub.issueType === 'SUBTASK', `SUB-1 が issueType=SUBTASK (${sub && sub.issueType})`);
  ok(st && ep && st.epicId === ep.id, `ST-1.epicId → EP-1（エピック階層）`);
  ok(sub && st && sub.parentId === st.id, `SUB-1.parentId → ST-1（サブタスク階層）`);
  ok(st && Math.abs((st.storyPoints ?? 0) - 5) < 0.001, `ST-1.storyPoints=5 (${st && st.storyPoints})`);
  ok(st && st.sprint === 'Sprint 1', `ST-1.sprint="Sprint 1" (${st && st.sprint})`);
  // 日本語ステータス写像（共有 mapStatus）
  ok(st && st.status && st.status !== 'OPEN', `ST-1 status 日本語写像（対応中→${st && st.status} ≠ OPEN既定）`);

  // 2) 冪等（再取込で重複しない）
  const cnt = async () => ((await api('GET', `/projects/${pid}/tasks`, undefined, token)).tasks || []).length;
  const before = await cnt();
  const r2 = await api('POST', `/projects/${pid}/tasks/import-jira`, { csv: CSV }, token);
  const after = await cnt();
  ok(after === before, `再取込で件数不変（冪等）: ${before} → ${after}（created=${r2.created}）`);

  console.log(`\n=== 結果: ${PASS} PASS / ${FAIL} FAIL ===`);
  await prisma.$disconnect();
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error('💥', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
