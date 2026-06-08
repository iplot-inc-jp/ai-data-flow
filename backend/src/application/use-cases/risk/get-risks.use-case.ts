import { Inject, Injectable } from '@nestjs/common';
import {
  IRiskRepository,
  RISK_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { RiskOutput, toRiskOutput } from './create-risk.use-case';

export interface GetRisksInput {
  userId: string;
  projectId: string;
}

/**
 * リスク一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetRisksUseCase {
  constructor(
    @Inject(RISK_REPOSITORY)
    private readonly riskRepository: IRiskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetRisksInput): Promise<RiskOutput[]> {
    // 1. プロジェクト存在確認
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    // 2. 組織メンバー確認
    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 3. 一覧取得
    const risks = await this.riskRepository.findByProjectId(input.projectId);

    // 4. DTOに変換して返却
    return risks.map((r) => toRiskOutput(r));
  }
}
