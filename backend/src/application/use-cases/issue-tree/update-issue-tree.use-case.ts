import { Inject, Injectable } from '@nestjs/common';
import {
  IssueTreeType,
  IssueTreePattern,
  IIssueTreeRepository,
  ISSUE_TREE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface UpdateIssueTreeInput {
  userId: string;
  treeId: string;
  name?: string;
  rootQuestion?: string | null;
  type?: IssueTreeType;
  pattern?: IssueTreePattern;
}

export interface UpdateIssueTreeOutput {
  id: string;
  projectId: string;
  type: IssueTreeType;
  pattern: IssueTreePattern;
  name: string;
  rootQuestion: string | null;
}

/**
 * イシューツリー更新ユースケース
 */
@Injectable()
export class UpdateIssueTreeUseCase {
  constructor(
    @Inject(ISSUE_TREE_REPOSITORY)
    private readonly issueTreeRepository: IIssueTreeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: UpdateIssueTreeInput): Promise<UpdateIssueTreeOutput> {
    // 1. ツリー存在確認
    const tree = await this.issueTreeRepository.findById(input.treeId);
    if (!tree) {
      throw new EntityNotFoundError('IssueTree', input.treeId);
    }

    // 2. プロジェクト存在確認
    const project = await this.projectRepository.findById(tree.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', tree.projectId);
    }

    // 3. 組織メンバー確認（プロジェクトスコープ認可）
    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You do not have access to this project');
    }

    // 4. ドメインロジックで更新
    if (input.name !== undefined) {
      tree.changeName(input.name);
    }
    if (input.rootQuestion !== undefined) {
      tree.changeRootQuestion(input.rootQuestion);
    }
    if (input.type !== undefined) {
      tree.changeType(input.type);
    }
    if (input.pattern !== undefined) {
      tree.changePattern(input.pattern);
    }

    // 5. 永続化
    await this.issueTreeRepository.save(tree);

    // 6. 出力返却
    return {
      id: tree.id,
      projectId: tree.projectId,
      type: tree.type,
      pattern: tree.pattern,
      name: tree.name,
      rootQuestion: tree.rootQuestion,
    };
  }
}
