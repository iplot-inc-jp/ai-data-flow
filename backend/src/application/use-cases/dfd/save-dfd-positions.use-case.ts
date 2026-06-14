import { Inject, Injectable } from '@nestjs/common';
import {
  DFD_REPOSITORY, IDfdRepository,
  PROJECT_REPOSITORY, ProjectRepository,
  ORGANIZATION_REPOSITORY, OrganizationRepository,
} from '../../../domain';
import { authorizeDiagram } from './dfd-authz';
import { ProjectAccessService } from '../../../infrastructure/services/project-access.service';

export interface SaveDfdPositionsInput {
  userId: string;
  diagramId: string;
  positions: { id: string; positionX: number; positionY: number }[];
}

@Injectable()
export class SaveDfdPositionsUseCase {
  constructor(
    @Inject(DFD_REPOSITORY) private readonly repo: IDfdRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async execute(input: SaveDfdPositionsInput): Promise<void> {
    await authorizeDiagram(this.repo, this.projectRepo, this.orgRepo, input.diagramId, input.userId, this.projectAccess, 'edit');
    await this.repo.bulkSavePositions(input.diagramId, input.positions ?? []);
  }
}
