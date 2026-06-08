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

export interface GetDemandDataInput {
  userId: string;
  projectId: string;
}

/**
 * 需要データ一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetDemandDataUseCase {
  constructor(
    @Inject(DEMAND_DATA_REPOSITORY)
    private readonly demandDataRepository: IDemandDataRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetDemandDataInput): Promise<DemandDataOutput[]> {
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
    const list = await this.demandDataRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return list.map((d) => toDemandDataOutput(d));
  }
}
