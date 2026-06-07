import {
  IDfdRepository,
  ProjectRepository,
  OrganizationRepository,
  EntityNotFoundError,
  ForbiddenError,
  DfdDiagram,
} from '../../../domain';

/** diagramId をプロジェクトメンバー認可し、図を返す */
export async function authorizeDiagram(
  repo: IDfdRepository,
  projectRepo: ProjectRepository,
  orgRepo: OrganizationRepository,
  diagramId: string,
  userId: string,
): Promise<DfdDiagram> {
  const diagram = await repo.findDiagramById(diagramId);
  if (!diagram) throw new EntityNotFoundError('DfdDiagram', diagramId);
  const project = await projectRepo.findById(diagram.projectId);
  if (!project) throw new EntityNotFoundError('Project', diagram.projectId);
  if (!(await orgRepo.isMember(project.organizationId, userId))) {
    throw new ForbiddenError('You are not a member of this organization');
  }
  return diagram;
}
