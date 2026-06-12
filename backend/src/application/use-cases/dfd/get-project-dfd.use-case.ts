import { Inject, Injectable } from '@nestjs/common';
import {
  DFD_REPOSITORY, IDfdRepository, DfdGraph,
  PROJECT_REPOSITORY, ProjectRepository,
  ORGANIZATION_REPOSITORY, OrganizationRepository,
  EntityNotFoundError, ForbiddenError,
  DfdDiagram,
} from '../../../domain';
import { DfdDiagramOutput, toDfdDiagramOutput } from './dfd.output';

export interface GetProjectDfdInput { userId: string; projectId: string; }

/**
 * 第1レベルDFD（flowId=null）の get-or-create。
 * Phase1 では空の図を返すだけ。生成ロジックは Phase2(Task6) で実装。
 */
@Injectable()
export class GetProjectDfdUseCase {
  constructor(
    @Inject(DFD_REPOSITORY) private readonly repo: IDfdRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: GetProjectDfdInput): Promise<DfdDiagramOutput> {
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) throw new EntityNotFoundError('Project', input.projectId);
    if (!(await this.orgRepo.isMember(project.organizationId, input.userId))) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    let graph: DfdGraph | null = await this.repo.findGraphByProjectFlow(project.id, null);
    if (!graph) {
      const diagram = DfdDiagram.create(
        { projectId: project.id, flowId: null, title: project.name },
        this.repo.generateId(),
      );
      await this.repo.createDiagram(diagram);
      graph = { diagram, nodes: [], flows: [] };
    }
    return toDfdDiagramOutput(graph);
  }
}
