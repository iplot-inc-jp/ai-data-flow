import { Inject, Injectable } from '@nestjs/common';
import {
  GapPriority,
  GapStatus,
  IGapItemRepository,
  GAP_ITEM_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { GapItemOutput, toGapItemOutput } from './create-gap-item.use-case';

export interface GetGapItemsInput {
  userId: string;
  projectId: string;
  phaseId?: string;
  priority?: GapPriority;
  status?: GapStatus;
}

/**
 * GAP一覧取得ユースケース（プロジェクト内、フィルタ可能）
 */
@Injectable()
export class GetGapItemsUseCase {
  constructor(
    @Inject(GAP_ITEM_REPOSITORY)
    private readonly gapItemRepository: IGapItemRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetGapItemsInput): Promise<GapItemOutput[]> {
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

    // 3. 一覧取得（フィルタ適用、order昇順）
    const gapItems = await this.gapItemRepository.findByProjectId(
      input.projectId,
      {
        phaseId: input.phaseId,
        priority: input.priority,
        status: input.status,
      },
    );

    // 4. DTOに変換して返却
    return gapItems.map((gapItem) => toGapItemOutput(gapItem));
  }
}
