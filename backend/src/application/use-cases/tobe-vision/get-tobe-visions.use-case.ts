import { Inject, Injectable } from '@nestjs/common';
import {
  ITobeVisionRepository,
  TOBE_VISION_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import {
  TobeVisionOutput,
  toTobeVisionOutput,
} from './create-tobe-vision.use-case';

export interface GetTobeVisionsInput {
  userId: string;
  projectId: string;
}

/**
 * TOBEビジョン一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetTobeVisionsUseCase {
  constructor(
    @Inject(TOBE_VISION_REPOSITORY)
    private readonly tobeVisionRepository: ITobeVisionRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetTobeVisionsInput): Promise<TobeVisionOutput[]> {
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
    const tobeVisions = await this.tobeVisionRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return tobeVisions.map((r) => toTobeVisionOutput(r));
  }
}
