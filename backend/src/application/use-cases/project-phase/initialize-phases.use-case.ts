import { Inject, Injectable } from '@nestjs/common';
import {
  ProjectPhase,
  PhaseKind,
  PhaseStatus,
  PHASE_KIND_ORDER,
  IProjectPhaseRepository,
  PROJECT_PHASE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface InitializePhasesInput {
  userId: string;
  projectId: string;
}

export interface InitializePhaseOutput {
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
 * カノニカルなフェーズ（Ph.0〜7 の全8フェーズ）を初期化するユースケース
 * 冪等性: 既に存在する種別はスキップする
 */
@Injectable()
export class InitializePhasesUseCase {
  constructor(
    @Inject(PROJECT_PHASE_REPOSITORY)
    private readonly projectPhaseRepository: IProjectPhaseRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(
    input: InitializePhasesInput,
  ): Promise<InitializePhaseOutput[]> {
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

    // 3. 既存フェーズを取得して種別集合を作成（冪等性のため）
    const existing = await this.projectPhaseRepository.findByProjectId(
      input.projectId,
    );
    const existingKinds = new Set<PhaseKind>(existing.map((p) => p.kind));

    // 4. 未作成のカノニカルフェーズのみ作成
    for (let index = 0; index < PHASE_KIND_ORDER.length; index++) {
      const kind = PHASE_KIND_ORDER[index];
      if (existingKinds.has(kind)) {
        continue;
      }

      const id = this.projectPhaseRepository.generateId();
      const phase = ProjectPhase.create(
        {
          projectId: input.projectId,
          kind,
          order: index,
        },
        id,
      );
      await this.projectPhaseRepository.save(phase);
    }

    // 5. 作成後の全フェーズを order 昇順で返却
    const phases = await this.projectPhaseRepository.findByProjectId(
      input.projectId,
    );

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
