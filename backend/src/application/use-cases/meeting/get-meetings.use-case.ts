import { Inject, Injectable } from '@nestjs/common';
import {
  IMeetingRepository,
  MEETING_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { MeetingOutput, toMeetingOutput } from './create-meeting.use-case';

export interface GetMeetingsInput {
  userId: string;
  projectId: string;
}

/**
 * 会議体一覧取得ユースケース（プロジェクト内、order昇順、stakeholderIds含む）
 */
@Injectable()
export class GetMeetingsUseCase {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepository: IMeetingRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetMeetingsInput): Promise<MeetingOutput[]> {
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
    const meetings = await this.meetingRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return meetings.map((m) => toMeetingOutput(m));
  }
}
