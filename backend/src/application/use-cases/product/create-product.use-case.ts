import { Inject, Injectable } from '@nestjs/common';
import {
  Product,
  IProductRepository,
  PRODUCT_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateProductInput {
  userId: string;
  projectId: string;
  code?: string | null;
  name?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  minLot?: number | null;
  unitPrice?: number | null;
  note?: string | null;
  order?: number;
}

export interface ProductOutput {
  id: string;
  projectId: string;
  code: string | null;
  name: string;
  supplierId: string | null;
  supplierName: string | null;
  minLot: number | null;
  unitPrice: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductOutput(product: Product): ProductOutput {
  return {
    id: product.id,
    projectId: product.projectId,
    code: product.code,
    name: product.name,
    supplierId: product.supplierId,
    supplierName: product.supplierName,
    minLot: product.minLot,
    unitPrice: product.unitPrice,
    note: product.note,
    order: product.order,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

/**
 * 商品作成ユースケース
 */
@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateProductInput): Promise<ProductOutput> {
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

    // 3. ID生成
    const id = this.productRepository.generateId();

    // 4. エンティティ生成
    const product = Product.create(
      {
        projectId: input.projectId,
        code: input.code,
        name: input.name,
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        minLot: input.minLot,
        unitPrice: input.unitPrice,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.productRepository.save(product);

    // 6. 出力返却
    return toProductOutput(product);
  }
}
