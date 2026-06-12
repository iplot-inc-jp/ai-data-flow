import { Inject, Injectable } from '@nestjs/common';
import {
  IStakeholderRepository,
  STAKEHOLDER_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import {
  StakeholderOutput,
  toStakeholderOutput,
} from './create-stakeholder.use-case';

export interface GetStakeholdersInput {
  userId: string;
  projectId: string;
}

/**
 * ステークホルダー一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetStakeholdersUseCase {
  constructor(
    @Inject(STAKEHOLDER_REPOSITORY)
    private readonly stakeholderRepository: IStakeholderRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetStakeholdersInput): Promise<StakeholderOutput[]> {
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
    const stakeholders = await this.stakeholderRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return stakeholders.map((s) => toStakeholderOutput(s));
  }
}
