import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Prismaモジュール
 * グローバルに登録して全モジュールで利用可能に
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

