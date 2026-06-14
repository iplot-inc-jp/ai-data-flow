import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import type { BackgroundJob } from '@prisma/client';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { ProjectAccessGuard } from '../guards/project-access.guard';
import { Public } from '../decorators/public.decorator';
import { JobService } from '../../infrastructure/services/job.service';
import { QStashService } from '../../infrastructure/services/qstash.service';
import { ProjectAccessService } from '../../infrastructure/services/project-access.service';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

// ========== DTOs ==========

class EnqueueJobDto {
  @ApiProperty({
    description: 'ジョブ種別',
    enum: JobService.ALLOWED_TYPES as unknown as string[],
    example: 'AI_MERMAID_OBJECTMAP',
  })
  @IsString()
  type: string;

  @ApiProperty({
    description: 'ジョブ入力（秘匿情報は入れない）',
    type: Object,
    required: false,
    example: { mermaid: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places' },
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

class RunJobDto {
  @ApiProperty({ description: '実行するジョブID' })
  @IsString()
  jobId: string;
}

/**
 * QStash ワーカー（push 受信）エンドポイント。
 *
 * QStash が `${PUBLIC_BASE_URL}/api/jobs/run` に POST {jobId} を配信する。
 * Upstash-Signature を「生ボディ(rawBody)」で検証し、正規配信のみ JobService.runJob を実行する。
 * rawBody は app-setup.ts の body-parser verify フックで request.rawBody に保持済み。
 *
 * 認証: @Public（JWT/APIキー不要）。代わりに QStash 署名で守る。
 * ローカル（QSTASH_CURRENT_SIGNING_KEY 未設定 = verifierEnabled=false）では
 * 署名検証ができないため、このルートは 401 を返して「無認証実行」を防ぐ。
 * ローカルではそもそもジョブは enqueue 内で inline 実行されるため、このルートは使わない。
 */
@ApiTags('ジョブ')
@Controller('jobs')
export class JobWorkerController {
  constructor(
    private readonly jobService: JobService,
    private readonly qstash: QStashService,
  ) {}

  @Public()
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async run(@Req() req: Request, @Body() _body: RunJobDto) {
    // 本番のみ署名必須。ローカル（検証不可）では実行させない。
    if (!this.qstash.verifierEnabled) {
      throw new UnauthorizedException(
        'QStash signature verification is not configured; jobs run inline locally.',
      );
    }

    const signature =
      (req.headers['upstash-signature'] as string | undefined) ?? '';
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
    if (!signature || !rawBody) {
      throw new UnauthorizedException('Missing QStash signature or body');
    }

    const url = this.qstash.runUrl();
    const ok = await this.qstash.verify(signature, rawBody, url);
    if (!ok) {
      throw new UnauthorizedException('Invalid QStash signature');
    }

    // 検証 OK のときだけ実行。rawBody を JSON parse して jobId を取り出す
    // （body-parser の result を信頼せず、署名済みの生ボディから読む）。
    let jobId: string | undefined;
    try {
      jobId = (JSON.parse(rawBody) as { jobId?: string }).jobId;
    } catch {
      jobId = undefined;
    }
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    // ワーカー経路: 一過性失敗時は runJob が job を QUEUED に戻して再 throw する。
    // その場合この throw を握らず伝播させ、非2xx を返して QStash の自動リトライを発火させる。
    // 試行回数を使い切った/恒久失敗は FAILED の job が返り、200 で配信完了とする。
    const job = await this.jobService.runJob(jobId, { throwOnFailure: true });
    return { id: job.id, status: job.status };
  }
}

/**
 * プロジェクト単位のジョブ起票・一覧（要認証・edit/view 権限）。
 */
@ApiTags('ジョブ')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId')
export class ProjectJobController {
  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('ai-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'AIジョブを起票（QStash／ローカルは inline 実行）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 202, description: '起票成功（{jobId, status}）' })
  @ApiResponse({ status: 400, description: '不正なジョブ種別' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  async enqueue(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: EnqueueJobDto,
  ): Promise<{ jobId: string; status: string }> {
    if (!JobService.isAllowedType(dto.type)) {
      throw new BadRequestException(
        `許可されていないジョブ種別です: ${dto.type}。許可: ${JobService.ALLOWED_TYPES.join(', ')}`,
      );
    }
    const job = await this.jobService.enqueue(dto.type, dto.payload, {
      projectId,
      createdById: user.id,
    });
    return { jobId: job.id, status: job.status };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'プロジェクトの直近ジョブ一覧' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  async list(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ): Promise<BackgroundJob[]> {
    return this.prisma.backgroundJob.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: this.parseLimit(limit),
    });
  }

  private parseLimit(limit?: string): number {
    const n = Number.parseInt(limit ?? '', 10);
    if (!Number.isFinite(n) || n <= 0) return 20;
    return Math.min(n, 100);
  }
}

/**
 * 単一ジョブ取得（要認証）。
 *   - projectId ありの job … その projectId に view 権限が必要。
 *   - projectId null の job … 起票者本人 or super-admin のみ。
 */
@ApiTags('ジョブ')
@ApiBearerAuth()
@Controller('jobs')
export class JobByIdController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'ジョブ取得（ポーリング用）' })
  @ApiParam({ name: 'id', description: 'ジョブID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'ジョブが見つかりません' })
  async getById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<BackgroundJob> {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('ジョブが見つかりません');
    }

    if (job.projectId) {
      // projectId に view 権限を要求
      await this.projectAccess.assertProjectAccess(job.projectId, user.id, 'view');
      return job;
    }

    // projectId null: 起票者本人 or super-admin
    if (job.createdById && job.createdById === user.id) {
      return job;
    }
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isSuperAdmin: true },
    });
    if (u?.isSuperAdmin) {
      return job;
    }
    throw new ForbiddenException('このジョブを参照する権限がありません');
  }
}
