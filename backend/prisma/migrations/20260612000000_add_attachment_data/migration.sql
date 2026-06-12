-- 添付ファイル本体を DB に保存する列（serverless の read-only FS 対応）。
-- 既存行は NULL のまま＝従来どおりディスク（uploads/）フォールバックで配信される追加のみの非破壊変更。
-- ローカル dev DB へは `npx prisma db push`（または `npx prisma migrate deploy`）で適用すること。
-- 適用するまで、再生成済み Prisma Client は attachments.data を SELECT するため添付系 API が
-- P2022 (column does not exist) で失敗する点に注意。
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "data" BYTEA;
