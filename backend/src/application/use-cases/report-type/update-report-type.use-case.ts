import { Inject, Injectable } from '@nestjs/common';
import {
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

export interface UpdateReportTypeInput {
  userId: string;
  reportTypeId: string;
  name?: string;
  description?: string | null;
  order?: number;
}

/**
 * 帳票種別更新ユースケース
 */
@Injectable()
export class UpdateReportTypeUseCase {
  constructor(
    @Inject(REPORT_TYPE_REPOSITORY)
    private readonly reportTypeRepository: IReportTypeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: UpdateReportTypeInput): Promise<ReportTypeOutput> {
    const reportType = await this.reportTypeRepository.findById(
      input.reportTypeId,
    );
    if (!reportType) {
      throw new EntityNotFoundError('ReportType', input.reportTypeId);
    }

    const project = await this.projectRepository.findById(reportType.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', reportType.projectId);
    }

    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    reportType.update({
      name: input.name,
      description: input.description,
      order: input.order,
    });
    await this.reportTypeRepository.save(reportType);

    const counts = await this.reportTypeRepository.countAttachmentsByProjectId(
      reportType.projectId,
    );
    return toReportTypeOutput(reportType, counts.get(reportType.id) ?? 0);
  }
}
