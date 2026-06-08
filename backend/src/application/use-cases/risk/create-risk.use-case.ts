import { Inject, Injectable } from '@nestjs/common';
import {
  Risk,
  IRiskRepository,
  RISK_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateRiskInput {
  userId: string;
  projectId: string;
  code?: string | null;
  type?: string | null;
  event?: string | null;
  causeCategory?: string | null;
  probability?: string | null;
  impact?: string | null;
  priority?: string | null;
  countermeasure?: string | null;
  needsMtg?: string | null;
  mtgDate?: string | null;
  deadline?: string | null;
  owner?: string | null;
  status?: string | null;
  note?: string | null;
  order?: number;
}

export interface RiskOutput {
  id: string;
  projectId: string;
  code: string | null;
  type: string | null;
  event: string | null;
  causeCategory: string | null;
  probability: string | null;
  impact: string | null;
  priority: string | null;
  countermeasure: string | null;
  needsMtg: string | null;
  mtgDate: string | null;
  deadline: string | null;
  owner: string | null;
  status: string | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toRiskOutput(risk: Risk): RiskOutput {
  return {
    id: risk.id,
    projectId: risk.projectId,
    code: risk.code,
    type: risk.type,
    event: risk.event,
    causeCategory: risk.causeCategory,
    probability: risk.probability,
    impact: risk.impact,
    priority: risk.priority,
    countermeasure: risk.countermeasure,
    needsMtg: risk.needsMtg,
    mtgDate: risk.mtgDate,
    deadline: risk.deadline,
    owner: risk.owner,
    status: risk.status,
    note: risk.note,
    order: risk.order,
    createdAt: risk.createdAt,
    updatedAt: risk.updatedAt,
  };
}

/**
 * リスク作成ユースケース
 */
@Injectable()
export class CreateRiskUseCase {
  constructor(
    @Inject(RISK_REPOSITORY)
    private readonly riskRepository: IRiskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateRiskInput): Promise<RiskOutput> {
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
    const id = this.riskRepository.generateId();

    // 4. エンティティ生成
    const risk = Risk.create(
      {
        projectId: input.projectId,
        code: input.code,
        type: input.type,
        event: input.event,
        causeCategory: input.causeCategory,
        probability: input.probability,
        impact: input.impact,
        priority: input.priority,
        countermeasure: input.countermeasure,
        needsMtg: input.needsMtg,
        mtgDate: input.mtgDate,
        deadline: input.deadline,
        owner: input.owner,
        status: input.status,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.riskRepository.save(risk);

    // 6. 出力返却
    return toRiskOutput(risk);
  }
}
