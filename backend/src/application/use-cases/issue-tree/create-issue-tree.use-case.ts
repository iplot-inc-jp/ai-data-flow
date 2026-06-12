import { Inject, Injectable } from '@nestjs/common';
import {
  IssueTree,
  IssueTreeType,
  IssueTreePattern,
  IssueNode,
  IssueNodeKind,
  IIssueTreeRepository,
  ISSUE_TREE_REPOSITORY,
  IIssueNodeRepository,
  ISSUE_NODE_REPOSITORY,
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
  // 旧 type は任意（既定 WHY）。互換のため残置。
  type?: IssueTreeType;
  // 新 pattern（既定 ISSUE_POINT）
  pattern?: IssueTreePattern;
  name: string;
  rootQuestion?: string;
  gapItemId?: string;
}

export interface CreateIssueTreeOutput {
  id: string;
  projectId: string;
  type: IssueTreeType;
  pattern: IssueTreePattern;
  name: string;
  rootQuestion: string | null;
}

/**
 * パターン → ルートノードの種別マッピング
 * - KPI → METRIC（数値ルート）
 * - それ以外 → ISSUE（汎用ルート: 課題/ゴール/対象）
 */
function rootKindForPattern(pattern: IssueTreePattern): IssueNodeKind {
  return pattern === 'KPI' ? 'METRIC' : 'ISSUE';
}

/**
 * イシューツリー作成ユースケース
 */
@Injectable()
export class CreateIssueTreeUseCase {
  constructor(
    @Inject(ISSUE_TREE_REPOSITORY)
    private readonly issueTreeRepository: IIssueTreeRepository,
    @Inject(ISSUE_NODE_REPOSITORY)
    private readonly issueNodeRepository: IIssueNodeRepository,
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
    //    pattern 既定 ISSUE_POINT / type 既定 WHY（エンティティ側で解決）
    const pattern: IssueTreePattern = input.pattern ?? 'ISSUE_POINT';
    const tree = IssueTree.create(
      {
        projectId: input.projectId,
        type: input.type ?? 'WHY',
        pattern,
        name: input.name,
        rootQuestion: input.rootQuestion,
      },
      id,
    );

    // 5. 永続化
    await this.issueTreeRepository.save(tree);

    // 6. ルートノードを自動生成（現状ルート未生成が作成失敗/空表示の原因）
    //    ルート kind = パターン対応: KPI→METRIC、それ以外→ISSUE
    //    label = rootQuestion?.trim() || name
    const rootLabel = input.rootQuestion?.trim() || tree.name;
    const rootNode = IssueNode.create(
      {
        treeId: tree.id,
        parentId: null,
        depth: 0,
        order: 0,
        label: rootLabel,
        kind: rootKindForPattern(pattern),
      },
      this.issueNodeRepository.generateId(),
    );
    await this.issueNodeRepository.save(rootNode);

    // 7. GAPリンク（指定時のみ。同一プロジェクトのGAPのみ許可）
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

    // 8. 出力返却
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
