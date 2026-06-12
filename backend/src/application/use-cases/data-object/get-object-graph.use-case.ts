import { Inject, Injectable } from '@nestjs/common';
import {
  DATA_OBJECT_REPOSITORY, IDataObjectRepository,
  PROJECT_REPOSITORY, ProjectRepository,
  ORGANIZATION_REPOSITORY, OrganizationRepository,
} from '../../../domain';
import { authorizeProject } from './data-object-authz';
import { ObjectGraphOutput, toObjectGraphOutput } from './data-object.output';

export interface GetObjectGraphInput { userId: string; projectId: string; }

/** オブジェクト関係性マップ取得（objects: 紐づくtables/dfdNodes含む ＋ relations） */
@Injectable()
export class GetObjectGraphUseCase {
  constructor(
    @Inject(DATA_OBJECT_REPOSITORY) private readonly repo: IDataObjectRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: GetObjectGraphInput): Promise<ObjectGraphOutput> {
    await authorizeProject(this.projectRepo, this.orgRepo, input.projectId, input.userId);
    const graph = await this.repo.findObjectGraph(input.projectId);
    return toObjectGraphOutput(graph);
  }
}
