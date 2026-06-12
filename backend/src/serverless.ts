import 'reflect-metadata';
import * as express from 'express';
import { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

/**
 * Vercel Functions（serverless）用エントリ。
 * Nest アプリの初期化は重いので、初回リクエスト時に一度だけ行い、
 * 以後はウォームなコンテナ間で Promise キャッシュを使い回す。
 */
const server = express();

let ready: Promise<void> | undefined;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });
  configureApp(app);
  await app.init();
}

export const handler = async (req: Request, res: Response): Promise<void> => {
  if (!ready) {
    ready = bootstrap();
    // bootstrap 失敗（DB の $connect タイムアウト等の一時障害）を永続キャッシュしない。
    // リセットしないと、このウォームインスタンスは以後の全リクエストで
    // 同じ rejected Promise を await し続け、リサイクルまで 500 を返し続ける。
    ready.catch(() => {
      ready = undefined;
    });
  }
  await ready;
  server(req, res, () => undefined);
};
