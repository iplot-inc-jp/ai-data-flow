import { Supplier } from '../entities';

/**
 * Supplier リポジトリインターフェース
 */
export interface ISupplierRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Supplier | null>;

  /**
   * プロジェクト内の仕入先一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<Supplier[]>;

  /**
   * 保存
   */
  save(supplier: Supplier): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');
