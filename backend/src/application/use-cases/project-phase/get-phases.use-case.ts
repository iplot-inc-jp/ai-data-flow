import { Inject, Injectable } from '@nestjs/common';
import {
  PhaseKind,
  PhaseStatus,
  IProjectPhaseRepository,
  PROJECT_PHASE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface GetPhasesInput {
  userId: string;
  projectId: string;
}

export interface GetPhaseOutput {
  id: string;
  projectId: string;
  kind: PhaseKind;
  order: number;
  status: PhaseStatus;
  summary: string | null;
  detail: string | null;
  metadata: Record<string, unknown>;
}

/**
 * フェーズ一覧取得ユースケース（order 昇順）
 */
@Injectable()
export class GetPhasesUseCase {
  constructor(
    @Inject(PROJECT_PHASE_REPOSITORY)
    private readonly projectPhaseRepository: IProjectPhaseRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetPhasesInput): Promise<GetPhaseOutput[]> {
    // 1. プロジェクトの存在確認
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    // 2. 組織メンバーシップ確認
    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 3. フェーズ一覧取得（order 昇順）
    const phases = await this.projectPhaseRepository.findByProjectId(
      input.projectId,
    );

    // 4. 出力返却
    return phases.map((phase) => ({
      id: phase.id,
      projectId: phase.projectId,
      kind: phase.kind,
      order: phase.order,
      status: phase.status,
      summary: phase.summary,
      detail: phase.detail,
      metadata: phase.metadata,
    }));
  }
}
