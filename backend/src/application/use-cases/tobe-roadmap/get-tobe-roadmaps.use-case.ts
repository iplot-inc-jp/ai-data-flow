import { Inject, Injectable } from '@nestjs/common';
import {
  ITobeRoadmapRepository,
  TOBE_ROADMAP_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import {
  TobeRoadmapOutput,
  toTobeRoadmapOutput,
} from './create-tobe-roadmap.use-case';

export interface GetTobeRoadmapsInput {
  userId: string;
  projectId: string;
}

/**
 * TOBEロードマップ一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetTobeRoadmapsUseCase {
  constructor(
    @Inject(TOBE_ROADMAP_REPOSITORY)
    private readonly tobeRoadmapRepository: ITobeRoadmapRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetTobeRoadmapsInput): Promise<TobeRoadmapOutput[]> {
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
    const tobeRoadmaps = await this.tobeRoadmapRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return tobeRoadmaps.map((r) => toTobeRoadmapOutput(r));
  }
}
