import { Inject, Injectable } from '@nestjs/common';
import {
  IDemandDataRepository,
  DEMAND_DATA_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import {
  DemandDataOutput,
  toDemandDataOutput,
} from './create-demand-data.use-case';

export interface UpdateDemandDataInput {
  userId: string;
  id: string;
  productName?: string | null;
  period?: string | null;
  quantity?: number | null;
  note?: string | null;
  order?: number;
}

/**
 * 需要データ更新ユースケース
 */
@Injectable()
export class UpdateDemandDataUseCase {
  constructor(
    @Inject(DEMAND_DATA_REPOSITORY)
    private readonly demandDataRepository: IDemandDataRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: UpdateDemandDataInput): Promise<DemandDataOutput> {
    // 1. 需要データ存在確認
    const demandData = await this.demandDataRepository.findById(input.id);
    if (!demandData) {
      throw new EntityNotFoundError('DemandData', input.id);
    }

    // 2. プロジェクト存在確認
    const project = await this.projectRepository.findById(demandData.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', demandData.projectId);
    }

    // 3. 組織メンバー確認
    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 4. ドメインロジック適用
    demandData.update({
      productName: input.productName,
      period: input.period,
      quantity: input.quantity,
      note: input.note,
      order: input.order,
    });

    // 5. 永続化
    await this.demandDataRepository.save(demandData);

    // 6. 出力返却
    return toDemandDataOutput(demandData);
  }
}
