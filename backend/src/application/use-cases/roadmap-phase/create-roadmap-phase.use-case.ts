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

export interface CreateRoadmapPhaseInput {
  userId: string;
  projectId: string;
  name: string;
  order?: number;
}

/**
 * ロードマップフェーズ作成ユースケース
 * ユーザー追加フェーズの legacyKey は常に null（互換キーは初期シード専用）。
 */
@Injectable()
export class CreateRoadmapPhaseUseCase {
  constructor(
    @Inject(ROADMAP_PHASE_REPOSITORY)
    private readonly roadmapPhaseRepository: IRoadmapPhaseRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateRoadmapPhaseInput): Promise<RoadmapPhaseOutput> {
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

    const id = this.roadmapPhaseRepository.generateId();
    const phase = RoadmapPhase.create(
      {
        projectId: input.projectId,
        name: input.name,
        legacyKey: null,
        order: input.order,
      },
      id,
    );

    await this.roadmapPhaseRepository.create(phase);

    return toRoadmapPhaseOutput(phase);
  }
}
