import { Inject, Injectable } from '@nestjs/common';
import {
  IssueNodeKind,
  IIssueTreeRepository,
  ISSUE_TREE_REPOSITORY,
  IIssueNodeRepository,
  ISSUE_NODE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface ListProjectIssueNodesInput {
  userId: string;
  projectId: string;
  /** 種別フィルタ（CAUSE | COUNTERMEASURE など）。未指定で全件 */
  kind?: IssueNodeKind;
}

/**
 * タスクセレクタ用のフラットなイシューノード情報。
 * プロジェクト配下の全イシューツリーを横断する。
 */
export interface ProjectIssueNodeListItem {
  id: string;
  label: string;
  kind: IssueNodeKind;
  treeId: string;
  treeTitle: string;
}

/**
 * プロジェクト横断でイシューノードを一覧するユースケース（タスク紐付けセレクタ用）。
 * プロジェクト → 組織メンバーシップで認可する。
 */
@Injectable()
export class ListProjectIssueNodesUseCase {
  constructor(
    @Inject(ISSUE_TREE_REPOSITORY)
    private readonly issueTreeRepository: IIssueTreeRepository,
    @Inject(ISSUE_NODE_REPOSITORY)
    private readonly issueNodeRepository: IIssueNodeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(
    input: ListProjectIssueNodesInput,
  ): Promise<ProjectIssueNodeListItem[]> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You do not have access to this project');
    }

    const trees = await this.issueTreeRepository.findByProjectId(
      input.projectId,
    );

    const items: ProjectIssueNodeListItem[] = [];
    for (const tree of trees) {
      const nodes = await this.issueNodeRepository.findByTreeId(tree.id);
      for (const node of nodes) {
        if (input.kind && node.kind !== input.kind) continue;
        items.push({
          id: node.id,
          label: node.label,
          kind: node.kind,
          treeId: tree.id,
          treeTitle: tree.name,
        });
      }
    }

    return items;
  }
}
