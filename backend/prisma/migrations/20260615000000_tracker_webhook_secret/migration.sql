-- webhook 受信用の秘密トークン（AES-256-GCM 暗号化）保存列。null=webhook 無効。
-- 既存行は NULL のまま＝非破壊の追加のみ変更。
-- ローカル/本番 DB へは `npx prisma migrate deploy`（または `npx prisma db push`）で適用すること。
ALTER TABLE "issue_tracker_connections" ADD COLUMN IF NOT EXISTS "webhook_secret_enc" TEXT;
