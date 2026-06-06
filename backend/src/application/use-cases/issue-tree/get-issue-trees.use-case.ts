import { Inject, Injectable } from '@nestjs/common';
import {
  IssueTreeType,
  IIssueTreeRepository,
  ISSUE_TREE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface GetIssueTreesInput {
  userId: string;
  projectId: string;
  type?: IssueTreeType;
}

export interface IssueTreeDto {
  id: string;
  projectId: string;
  type: IssueTreeType;
  name: string;
  rootQuestion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * イシューツリー一覧取得ユースケース（プロジェクト単位 / 任意で型フィルタ）
 */
@Injectable()
export class GetIssueTreesUseCase {
  constructor(
    @Inject(ISSUE_TREE_REPOSITORY)
    private readonly issueTreeRepository: IIssueTreeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetIssueTreesInput): Promise<IssueTreeDto[]> {
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

    // 3. 一覧取得
    const trees = await this.issueTreeRepository.findByProjectId(
      input.projectId,
      input.type,
    );

    // 4. DTOに変換して返却
    return trees.map((tree) => ({
      id: tree.id,
      projectId: tree.projectId,
      type: tree.type,
      name: tree.name,
      rootQuestion: tree.rootQuestion,
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
    }));
  }
}
