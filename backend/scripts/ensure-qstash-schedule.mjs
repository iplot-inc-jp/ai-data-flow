#!/usr/bin/env node
/**
 * QStash の定期スケジュールを作成/更新する（冪等）。
 *
 * 本番(Vercel serverless)では @nestjs/schedule の @Cron が発火しないため、
 * QStash → GET /api/cron/auto-sync（CronController）で GitHub 自動同期を駆動する。
 * そのスケジュールをここで用意する。
 *
 * 同じ destination の既存スケジュールは一度削除してから作り直す（CRON_SECRET ローテーションや
 * cron 変更を確実に反映させ、stale な forward secret が残り続けるのを防ぐ）。
 *
 * 使い方:
 *   QSTASH_TOKEN=...                                   # Upstash QStash のトークン
 *   CRON_SECRET=...                                    # /api/cron/auto-sync を守る共有秘密（Vercel env と一致させる）
 *   PUBLIC_BASE_URL=https://brain-pro-api.vercel.app   # API のベースURL（/api は付けない）
 *   [CRON_SCHEDULE="*\/10 * * * *"]                    # 既定 10分毎
 *   node scripts/ensure-qstash-schedule.mjs
 */
const token = process.env.QSTASH_TOKEN;
const secret = process.env.CRON_SECRET;
const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const cron = process.env.CRON_SCHEDULE || '*/10 * * * *';

if (!token || !secret || !base) {
  console.error(
    'Error: QSTASH_TOKEN, CRON_SECRET, PUBLIC_BASE_URL are required.',
  );
  process.exit(1);
}

const dest = `${base}/api/cron/auto-sync`;
const auth = { Authorization: `Bearer ${token}` };

// 1) 既存の同 destination スケジュールを削除（secret/cron 変更を確実に反映）
const listRes = await fetch('https://qstash.upstash.io/v2/schedules', {
  headers: auth,
});
if (!listRes.ok) {
  console.error('Failed to list schedules:', listRes.status, await listRes.text());
  process.exit(1);
}
const schedules = await listRes.json();
for (const s of Array.isArray(schedules) ? schedules : []) {
  if (s.destination === dest && s.scheduleId) {
    const del = await fetch(
      `https://qstash.upstash.io/v2/schedules/${s.scheduleId}`,
      { method: 'DELETE', headers: auth },
    );
    console.log(`deleted existing schedule ${s.scheduleId} (HTTP ${del.status})`);
  }
}

// 2) 新規作成
const res = await fetch(
  `https://qstash.upstash.io/v2/schedules/${encodeURIComponent(dest)}`,
  {
    method: 'POST',
    headers: {
      ...auth,
      'Upstash-Cron': cron,
      'Upstash-Forward-Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  },
);
if (!res.ok) {
  console.error('Failed to create schedule:', res.status, await res.text());
  process.exit(1);
}
const body = await res.json().catch(() => ({}));
console.log(`✅ QStash schedule created: "${cron}" -> ${dest}`);
if (body.scheduleId) console.log(`   scheduleId=${body.scheduleId}`);
