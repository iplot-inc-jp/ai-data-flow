import { Inject, Injectable } from '@nestjs/common';
import {
  ProjectPhase,
  PhaseKind,
  PhaseStatus,
  IProjectPhaseRepository,
  PROJECT_PHASE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  ForbiddenError,
} from '../../../domain';

export interface CreatePhaseInput {
  userId: string;
  projectId: string;
  kind: PhaseKind;
  order?: number;
  status?: PhaseStatus;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreatePhaseOutput {
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
 * フェーズ作成ユースケース
 */
@Injectable()
export class CreatePhaseUseCase {
  constructor(
    @Inject(PROJECT_PHASE_REPOSITORY)
    private readonly projectPhaseRepository: IProjectPhaseRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreatePhaseInput): Promise<CreatePhaseOutput> {
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

    // 3. 種別の重複チェック（プロジェクト内で kind はユニーク）
    const existing = await this.projectPhaseRepository.findByProjectIdAndKind(
      input.projectId,
      input.kind,
    );
    if (existing) {
      throw new EntityAlreadyExistsError('ProjectPhase', 'kind', input.kind);
    }

    // 4. ID生成
    const id = this.projectPhaseRepository.generateId();

    // 5. エンティティ生成（ドメインロジック）
    const phase = ProjectPhase.create(
      {
        projectId: input.projectId,
        kind: input.kind,
        order: input.order,
        status: input.status,
        summary: input.summary,
        metadata: input.metadata,
      },
      id,
    );

    // 6. 永続化
    await this.projectPhaseRepository.save(phase);

    // 7. 出力返却
    return {
      id: phase.id,
      projectId: phase.projectId,
      kind: phase.kind,
      order: phase.order,
      status: phase.status,
      summary: phase.summary,
      detail: phase.detail,
      metadata: phase.metadata,
    };
  }
}
