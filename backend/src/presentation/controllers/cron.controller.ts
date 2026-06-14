import {
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public } from '../decorators/public.decorator';
import { SyncSchedulerService } from '../../infrastructure/services/sync-scheduler.service';

/**
 * 定期実行（cron）エンドポイント。
 *
 * 本番(Vercel serverless)では @nestjs/schedule の @Cron が常駐プロセス不在で発火しないため、
 * QStash の定期スケジュール(Upstash-Cron) からこの公開ルートを叩いて自動同期を駆動する。
 * 認証は CRON_SECRET の Bearer（QStash は Upstash-Forward-Authorization で透過）。
 * スケジュール自体は scripts/ensure-qstash-schedule.mjs で作成/更新する。
 */
@ApiExcludeController()
@Controller('cron')
export class CronController {
  constructor(private readonly syncScheduler: SyncSchedulerService) {}

  @Public()
  @Get('auto-sync')
  async autoSyncGet(@Req() req: Request) {
    return this.run(req);
  }

  @Public()
  @Post('auto-sync')
  async autoSyncPost(@Req() req: Request) {
    return this.run(req);
  }

  /** CRON_SECRET を timing-safe に検証してから自動同期を実行する。 */
  private async run(req: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new UnauthorizedException('CRON_SECRET is not set');
    }
    const got = Buffer.from(
      (req.headers['authorization'] as string | undefined) ?? '',
    );
    const expected = Buffer.from(`Bearer ${secret}`);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      throw new UnauthorizedException();
    }
    const result = await this.syncScheduler.runAutoSync();
    return { ok: true, ...result };
  }
}
