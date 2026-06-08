import { Inject, Injectable } from '@nestjs/common';
import {
  Stakeholder,
  IStakeholderRepository,
  STAKEHOLDER_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateStakeholderInput {
  userId: string;
  projectId: string;
  name: string;
  affiliation?: string | null;
  role?: string | null;
  interest?: string | null;
  concern?: string | null;
  influence?: string | null;
  support?: string | null;
  engagement?: string | null;
  reportFrequency?: string | null;
  contactMethod?: string | null;
  owner?: string | null;
  reportLine?: string | null;
  asisHearing?: string | null;
  tobeSparring?: string | null;
  note?: string | null;
  order?: number;
}

export interface StakeholderOutput {
  id: string;
  projectId: string;
  name: string;
  affiliation: string | null;
  role: string | null;
  interest: string | null;
  concern: string | null;
  influence: string | null;
  support: string | null;
  engagement: string | null;
  reportFrequency: string | null;
  contactMethod: string | null;
  owner: string | null;
  reportLine: string | null;
  asisHearing: string | null;
  tobeSparring: string | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toStakeholderOutput(stakeholder: Stakeholder): StakeholderOutput {
  return {
    id: stakeholder.id,
    projectId: stakeholder.projectId,
    name: stakeholder.name,
    affiliation: stakeholder.affiliation,
    role: stakeholder.role,
    interest: stakeholder.interest,
    concern: stakeholder.concern,
    influence: stakeholder.influence,
    support: stakeholder.support,
    engagement: stakeholder.engagement,
    reportFrequency: stakeholder.reportFrequency,
    contactMethod: stakeholder.contactMethod,
    owner: stakeholder.owner,
    reportLine: stakeholder.reportLine,
    asisHearing: stakeholder.asisHearing,
    tobeSparring: stakeholder.tobeSparring,
    note: stakeholder.note,
    order: stakeholder.order,
    createdAt: stakeholder.createdAt,
    updatedAt: stakeholder.updatedAt,
  };
}

/**
 * ステークホルダー作成ユースケース
 */
@Injectable()
export class CreateStakeholderUseCase {
  constructor(
    @Inject(STAKEHOLDER_REPOSITORY)
    private readonly stakeholderRepository: IStakeholderRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateStakeholderInput): Promise<StakeholderOutput> {
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
    const id = this.stakeholderRepository.generateId();

    // 4. エンティティ生成
    const stakeholder = Stakeholder.create(
      {
        projectId: input.projectId,
        name: input.name,
        affiliation: input.affiliation,
        role: input.role,
        interest: input.interest,
        concern: input.concern,
        influence: input.influence,
        support: input.support,
        engagement: input.engagement,
        reportFrequency: input.reportFrequency,
        contactMethod: input.contactMethod,
        owner: input.owner,
        reportLine: input.reportLine,
        asisHearing: input.asisHearing,
        tobeSparring: input.tobeSparring,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.stakeholderRepository.save(stakeholder);

    // 6. 出力返却
    return toStakeholderOutput(stakeholder);
  }
}
