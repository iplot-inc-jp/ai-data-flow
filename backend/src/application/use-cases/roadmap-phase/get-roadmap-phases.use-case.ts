import { Inject, Injectable } from '@nestjs/common';
import {
  RoadmapPhase,
  IRoadmapPhaseRepository,
  ROADMAP_PHASE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { RoadmapPhaseOutput, toRoadmapPhaseOutput } from './roadmap-phase.output';

export interface GetRoadmapPhasesInput {
  userId: string;
  projectId: string;
}

/** 0件時に冪等シードする初期3フェーズ（旧固定フェーズとの互換）。 */
const DEFAULT_PHASES: { name: string; legacyKey: string; order: number }[] = [
  { name: '3ヶ月以内 (Quick Win)', legacyKey: 'Q', order: 0 },
  { name: '1年以内 (Phase2)', legacyKey: 'P2', order: 1 },
  { name: '3年以内 (Phase3)', legacyKey: 'P3', order: 2 },
];

/**
 * プロジェクトのロードマップフェーズ一覧取得ユースケース
 * 0件の場合は初期3フェーズ（Q / P2 / P3）をシードしてから返す。
 */
@Injectable()
export class GetRoadmapPhasesUseCase {
  constructor(
    @Inject(ROADMAP_PHASE_REPOSITORY)
    private readonly roadmapPhaseRepository: IRoadmapPhaseRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetRoadmapPhasesInput): Promise<RoadmapPhaseOutput[]> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    let phases = await this.roadmapPhaseRepository.findByProjectId(
      input.projectId,
    );

    if (phases.length === 0) {
      // 初期3フェーズをシード。同時リクエストと競合した場合は片方が失敗しても
      // 握りつぶし、最後に再取得した結果を正とする。
      try {
        for (const def of DEFAULT_PHASES) {
          const phase = RoadmapPhase.create(
            {
              projectId: input.projectId,
              name: def.name,
              legacyKey: def.legacyKey,
              order: def.order,
            },
            this.roadmapPhaseRepository.generateId(),
          );
          await this.roadmapPhaseRepository.create(phase);
        }
      } catch {
        // 競合時は再取得で回復するため無視
      }
      phases = await this.roadmapPhaseRepository.findByProjectId(
        input.projectId,
      );
    }

    return phases.map((p) => toRoadmapPhaseOutput(p));
  }
}
