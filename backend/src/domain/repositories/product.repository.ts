import { Product } from '../entities';

/**
 * Product リポジトリインターフェース
 */
export interface IProductRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Product | null>;

  /**
   * プロジェクト内の商品一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<Product[]>;

  /**
   * 保存
   */
  save(product: Product): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
