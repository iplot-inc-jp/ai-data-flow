import { Inject, Injectable } from '@nestjs/common';
import {
  ReportType,
  IReportTypeRepository,
  REPORT_TYPE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { ReportTypeOutput, toReportTypeOutput } from './report-type.output';

export interface CreateReportTypeInput {
  userId: string;
  projectId: string;
  name: string;
  description?: string | null;
  order?: number;
}

/**
 * 帳票種別作成ユースケース
 */
@Injectable()
export class CreateReportTypeUseCase {
  constructor(
    @Inject(REPORT_TYPE_REPOSITORY)
    private readonly reportTypeRepository: IReportTypeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateReportTypeInput): Promise<ReportTypeOutput> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    const id = this.reportTypeRepository.generateId();
    const reportType = ReportType.create(
      {
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        order: input.order,
      },
      id,
    );

    await this.reportTypeRepository.save(reportType);

    return toReportTypeOutput(reportType, 0);
  }
}
