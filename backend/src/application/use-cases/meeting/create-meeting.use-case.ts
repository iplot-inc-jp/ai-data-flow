import { Inject, Injectable } from '@nestjs/common';
import {
  Meeting,
  IMeetingRepository,
  MEETING_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateMeetingInput {
  userId: string;
  projectId: string;
  name: string;
  purpose?: string | null;
  frequency?: string | null;
  dayTime?: string | null;
  requiredAttendees?: string | null;
  optionalAttendees?: string | null;
  agendaTemplate?: string | null;
  preMaterials?: string | null;
  minutesOwner?: string | null;
  decisionMaker?: string | null;
  note?: string | null;
  order?: number;
}

export interface MeetingOutput {
  id: string;
  projectId: string;
  name: string;
  purpose: string | null;
  frequency: string | null;
  dayTime: string | null;
  requiredAttendees: string | null;
  optionalAttendees: string | null;
  agendaTemplate: string | null;
  preMaterials: string | null;
  minutesOwner: string | null;
  decisionMaker: string | null;
  note: string | null;
  order: number;
  stakeholderIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function toMeetingOutput(meeting: Meeting): MeetingOutput {
  return {
    id: meeting.id,
    projectId: meeting.projectId,
    name: meeting.name,
    purpose: meeting.purpose,
    frequency: meeting.frequency,
    dayTime: meeting.dayTime,
    requiredAttendees: meeting.requiredAttendees,
    optionalAttendees: meeting.optionalAttendees,
    agendaTemplate: meeting.agendaTemplate,
    preMaterials: meeting.preMaterials,
    minutesOwner: meeting.minutesOwner,
    decisionMaker: meeting.decisionMaker,
    note: meeting.note,
    order: meeting.order,
    stakeholderIds: meeting.stakeholderIds,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
  };
}

/**
 * 会議体作成ユースケース
 */
@Injectable()
export class CreateMeetingUseCase {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepository: IMeetingRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateMeetingInput): Promise<MeetingOutput> {
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
    const id = this.meetingRepository.generateId();

    // 4. エンティティ生成
    const meeting = Meeting.create(
      {
        projectId: input.projectId,
        name: input.name,
        purpose: input.purpose,
        frequency: input.frequency,
        dayTime: input.dayTime,
        requiredAttendees: input.requiredAttendees,
        optionalAttendees: input.optionalAttendees,
        agendaTemplate: input.agendaTemplate,
        preMaterials: input.preMaterials,
        minutesOwner: input.minutesOwner,
        decisionMaker: input.decisionMaker,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.meetingRepository.save(meeting);

    // 6. 出力返却
    return toMeetingOutput(meeting);
  }
}
