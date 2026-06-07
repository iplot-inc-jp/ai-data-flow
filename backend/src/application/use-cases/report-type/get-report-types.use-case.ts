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

export interface GetReportTypesInput {
  userId: string;
  projectId: string;
}

/**
 * プロジェクトの帳票種別一覧取得ユースケース（添付件数付き）
 */
@Injectable()
export class GetReportTypesUseCase {
  constructor(
    @Inject(REPORT_TYPE_REPOSITORY)
    private readonly reportTypeRepository: IReportTypeRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetReportTypesInput): Promise<ReportTypeOutput[]> {
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

    const reportTypes = await this.reportTypeRepository.findByProjectId(
      input.projectId,
    );
    const counts = await this.reportTypeRepository.countAttachmentsByProjectId(
      input.projectId,
    );

    return reportTypes.map((rt) =>
      toReportTypeOutput(rt, counts.get(rt.id) ?? 0),
    );
  }
}
