import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { CryptoService } from './crypto.service';

/**
 * 会社（Organization）単位の Anthropic APIキー解決サービス。
 *
 * AI機能はこのサービスで使用する鍵を解決する。解決順序:
 *   1. Organization.anthropicApiKeyEnc（AES-256-GCM 暗号化を復号）
 *   2. userId が渡されていれば UserSetting.anthropicApiKey（個人設定・平文）
 *   3. process.env.ANTHROPIC_API_KEY（グローバルのフォールバック）
 *   4. いずれも無ければ null
 *
 * be:auth-company が作成し、be:ai-keys が consume する共有ヘルパー。
 */
@Injectable()
export class CompanyKeyService {
  private readonly logger = new Logger(CompanyKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  /**
   * 組織IDから Anthropic APIキーを解決する。
   * @param organizationId 会社（Organization）のID
   * @param userId 任意。個人設定フォールバックに使用
   */
  async resolveForOrg(
    organizationId: string,
    userId?: string,
  ): Promise<string | null> {
    // 1. 会社ごとの暗号化キー
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { anthropicApiKeyEnc: true },
    });

    if (org?.anthropicApiKeyEnc) {
      try {
        return this.cryptoService.decrypt(org.anthropicApiKeyEnc);
      } catch (e) {
        this.logger.error(
          `Failed to decrypt anthropicApiKeyEnc for organization ${organizationId}`,
          e as Error,
        );
        // 復号失敗時は次のフォールバックへ
      }
    }

    // 2. 個人設定（平文保存）
    if (userId) {
      const setting = await this.prisma.userSetting.findUnique({
        where: { userId },
        select: { anthropicApiKey: true },
      });
      if (setting?.anthropicApiKey) {
        return setting.anthropicApiKey;
      }
    }

    // 3. グローバルのフォールバック
    return process.env.ANTHROPIC_API_KEY ?? null;
  }

  /**
   * プロジェクトIDから Anthropic APIキーを解決する。
   * プロジェクトの所属組織を読み出し resolveForOrg に委譲する。
   * @param projectId プロジェクトのID
   * @param userId 任意。個人設定フォールバックに使用
   */
  async resolveForProject(
    projectId: string,
    userId?: string,
  ): Promise<string | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });

    if (!project) {
      // プロジェクトが見つからない場合でもグローバルへフォールバック
      if (userId) {
        const setting = await this.prisma.userSetting.findUnique({
          where: { userId },
          select: { anthropicApiKey: true },
        });
        if (setting?.anthropicApiKey) {
          return setting.anthropicApiKey;
        }
      }
      return process.env.ANTHROPIC_API_KEY ?? null;
    }

    return this.resolveForOrg(project.organizationId, userId);
  }
}
