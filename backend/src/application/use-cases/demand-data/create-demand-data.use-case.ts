import { Inject, Injectable } from '@nestjs/common';
import {
  DemandData,
  IDemandDataRepository,
  DEMAND_DATA_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateDemandDataInput {
  userId: string;
  projectId: string;
  productName?: string | null;
  period?: string | null;
  quantity?: number | null;
  note?: string | null;
  order?: number;
}

export interface DemandDataOutput {
  id: string;
  projectId: string;
  productName: string | null;
  period: string | null;
  quantity: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toDemandDataOutput(demandData: DemandData): DemandDataOutput {
  return {
    id: demandData.id,
    projectId: demandData.projectId,
    productName: demandData.productName,
    period: demandData.period,
    quantity: demandData.quantity,
    note: demandData.note,
    order: demandData.order,
    createdAt: demandData.createdAt,
    updatedAt: demandData.updatedAt,
  };
}

/**
 * 需要データ作成ユースケース
 */
@Injectable()
export class CreateDemandDataUseCase {
  constructor(
    @Inject(DEMAND_DATA_REPOSITORY)
    private readonly demandDataRepository: IDemandDataRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateDemandDataInput): Promise<DemandDataOutput> {
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
    const id = this.demandDataRepository.generateId();

    // 4. エンティティ生成
    const demandData = DemandData.create(
      {
        projectId: input.projectId,
        productName: input.productName,
        period: input.period,
        quantity: input.quantity,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.demandDataRepository.save(demandData);

    // 6. 出力返却
    return toDemandDataOutput(demandData);
  }
}
