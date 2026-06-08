import { Inject, Injectable } from '@nestjs/common';
import {
  ISupplierRepository,
  SUPPLIER_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { SupplierOutput, toSupplierOutput } from './create-supplier.use-case';

export interface GetSuppliersInput {
  userId: string;
  projectId: string;
}

/**
 * 仕入先一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetSuppliersUseCase {
  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetSuppliersInput): Promise<SupplierOutput[]> {
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

    // 3. 一覧取得
    const suppliers = await this.supplierRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return suppliers.map((s) => toSupplierOutput(s));
  }
}
