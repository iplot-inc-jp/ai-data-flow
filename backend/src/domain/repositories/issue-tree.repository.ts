import { IssueTree, IssueTreeType } from '../entities';

/**
 * イシューツリーリポジトリインターフェース
 */
export interface IIssueTreeRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<IssueTree | null>;

  /**
   * プロジェクト内のイシューツリー一覧（任意で型フィルタ）
   */
  findByProjectId(projectId: string, type?: IssueTreeType): Promise<IssueTree[]>;

  /**
   * 保存
   */
  save(tree: IssueTree): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const ISSUE_TREE_REPOSITORY = Symbol('ISSUE_TREE_REPOSITORY');
