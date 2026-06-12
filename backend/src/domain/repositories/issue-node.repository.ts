import { IssueNode } from '../entities';

/**
 * イシューノードリポジトリインターフェース
 */
export interface IIssueNodeRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<IssueNode | null>;

  /**
   * ツリー内のノード一覧（depth, order でソート）
   */
  findByTreeId(treeId: string): Promise<IssueNode[]>;

  /**
   * 保存
   */
  save(node: IssueNode): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const ISSUE_NODE_REPOSITORY = Symbol('ISSUE_NODE_REPOSITORY');
