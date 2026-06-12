import { Inject, Injectable } from '@nestjs/common';
import {
  Supplier,
  ISupplierRepository,
  SUPPLIER_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateSupplierInput {
  userId: string;
  projectId: string;
  code?: string | null;
  name?: string | null;
  salesRep?: string | null;
  tel?: string | null;
  email?: string | null;
  leadTimeDays?: number | null;
  note?: string | null;
  order?: number;
}

export interface SupplierOutput {
  id: string;
  projectId: string;
  code: string | null;
  name: string;
  salesRep: string | null;
  tel: string | null;
  email: string | null;
  leadTimeDays: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toSupplierOutput(supplier: Supplier): SupplierOutput {
  return {
    id: supplier.id,
    projectId: supplier.projectId,
    code: supplier.code,
    name: supplier.name,
    salesRep: supplier.salesRep,
    tel: supplier.tel,
    email: supplier.email,
    leadTimeDays: supplier.leadTimeDays,
    note: supplier.note,
    order: supplier.order,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}

/**
 * 仕入先作成ユースケース
 */
@Injectable()
export class CreateSupplierUseCase {
  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateSupplierInput): Promise<SupplierOutput> {
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
    const id = this.supplierRepository.generateId();

    // 4. エンティティ生成
    const supplier = Supplier.create(
      {
        projectId: input.projectId,
        code: input.code,
        name: input.name,
        salesRep: input.salesRep,
        tel: input.tel,
        email: input.email,
        leadTimeDays: input.leadTimeDays,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.supplierRepository.save(supplier);

    // 6. 出力返却
    return toSupplierOutput(supplier);
  }
}
