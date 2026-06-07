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

export interface DeleteReportTypeInput {
  userId: string;
  reportTypeId: string;
}

/**
 * 帳票種別削除ユースケース
 * 紐づく Attachment は onDelete: Cascade、DfdFlow.reportTypeId は onDelete: SetNull。
 */
@Injectable()
export class DeleteReportTypeUseCase {
  constructor(
    @Inject(REPORT_TYPE_REPOSITORY)
    private readonly reportTypeRepository: IReportTypeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: DeleteReportTypeInput): Promise<void> {
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

    await this.reportTypeRepository.delete(input.reportTypeId);
  }
}
