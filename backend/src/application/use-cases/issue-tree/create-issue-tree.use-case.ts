import { Inject, Injectable } from '@nestjs/common';
import {
  IssueTree,
  IssueTreeType,
  IIssueTreeRepository,
  ISSUE_TREE_REPOSITORY,
  IGapItemRepository,
  GAP_ITEM_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateIssueTreeInput {
  userId: string;
  projectId: string;
  type: IssueTreeType;
  name: string;
  rootQuestion?: string;
  gapItemId?: string;
}

export interface CreateIssueTreeOutput {
  id: string;
  projectId: string;
  type: IssueTreeType;
  name: string;
  rootQuestion: string | null;
}

/**
 * イシューツリー作成ユースケース
 */
@Injectable()
export class CreateIssueTreeUseCase {
  constructor(
    @Inject(ISSUE_TREE_REPOSITORY)
    private readonly issueTreeRepository: IIssueTreeRepository,
    @Inject(GAP_ITEM_REPOSITORY)
    private readonly gapItemRepository: IGapItemRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateIssueTreeInput): Promise<CreateIssueTreeOutput> {
    // 1. プロジェクト存在確認
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    // 2. 組織メンバー確認（プロジェクトスコープ認可）
    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You do not have access to this project');
    }

    // 3. ID生成
    const id = this.issueTreeRepository.generateId();

    // 4. エンティティ生成（ドメインロジック）
    const tree = IssueTree.create(
      {
        projectId: input.projectId,
        type: input.type,
        name: input.name,
        rootQuestion: input.rootQuestion,
      },
      id,
    );

    // 5. 永続化
    await this.issueTreeRepository.save(tree);

    // 6. GAPリンク（指定時のみ。同一プロジェクトのGAPのみ許可）
    if (input.gapItemId) {
      const gapItem = await this.gapItemRepository.findById(input.gapItemId);
      if (!gapItem) {
        throw new EntityNotFoundError('GapItem', input.gapItemId);
      }
      if (gapItem.projectId !== input.projectId) {
        throw new ForbiddenError(
          'GapItem does not belong to the specified project',
        );
      }
      gapItem.linkIssueTree(tree.id);
      await this.gapItemRepository.save(gapItem);
    }

    // 7. 出力返却
    return {
      id: tree.id,
      projectId: tree.projectId,
      type: tree.type,
      name: tree.name,
      rootQuestion: tree.rootQuestion,
    };
  }
}
