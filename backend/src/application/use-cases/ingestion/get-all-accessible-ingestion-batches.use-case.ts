import { Inject, Injectable } from '@nestjs/common';
import {
  OrganizationRepository, ORGANIZATION_REPOSITORY,
  ProjectRepository, PROJECT_REPOSITORY,
  IIngestionBatchRepository, INGESTION_BATCH_REPOSITORY,
} from '../../../domain';
import { ProjectAccessService } from '../../../infrastructure/services/project-access.service';
import {
  IngestionBatchWithProjectOutput,
  toIngestionBatchWithProjectOutput,
} from './ingestion-output';

const MAX_BATCHES = 200;

export interface GetAllAccessibleIngestionBatchesInput {
  userId: string;
}

@Injectable()
export class GetAllAccessibleIngestionBatchesUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: OrganizationRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    @Inject(INGESTION_BATCH_REPOSITORY)
    private readonly batchRepo: IIngestionBatchRepository,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async execute(
    input: GetAllAccessibleIngestionBatchesInput,
  ): Promise<IngestionBatchWithProjectOutput[]> {
    const orgs = await this.orgRepo.findByUserId(input.userId);
    const projectLists = await Promise.all(
      orgs.map((o) => this.projectRepo.findByOrganizationId(o.id)),
    );
    const projectById = new Map<string, { id: string; name: string }>();
    for (const list of projectLists) {
      for (const p of list) projectById.set(p.id, { id: p.id, name: p.name });
    }
    const candidates = Array.from(projectById.values());

    const levels = await Promise.all(
      candidates.map((p) => this.projectAccess.resolveProjectAccess(p.id, input.userId)),
    );
    const accessible = candidates.filter((_, i) => levels[i] !== null);

    const perProject = await Promise.all(
      accessible.map(async (p) => {
        const batches = await this.batchRepo.findByProjectId(p.id);
        return batches.map((b) => toIngestionBatchWithProjectOutput(b, p.name));
      }),
    );

    const all = perProject.flat();
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all.slice(0, MAX_BATCHES);
  }
}
