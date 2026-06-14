import {
  IDfdRepository,
  ProjectRepository,
  OrganizationRepository,
  EntityNotFoundError,
  ForbiddenError,
  DfdDiagram,
} from '../../../domain';
import {
  ProjectAccessService,
  RequiredAccess,
} from '../../../infrastructure/services/project-access.service';

/**
 * diagramId をプロジェクトメンバー認可し、図を返す。
 * projectAccess+required を渡すと、プロジェクト単位 RBAC（VIEW/EDIT）も併せて強制する。
 * 既存の isMember は多層防御として残す。
 */
export async function authorizeDiagram(
  repo: IDfdRepository,
  projectRepo: ProjectRepository,
  orgRepo: OrganizationRepository,
  diagramId: string,
  userId: string,
  projectAccess?: ProjectAccessService,
  required: RequiredAccess = 'view',
): Promise<DfdDiagram> {
  const diagram = await repo.findDiagramById(diagramId);
  if (!diagram) throw new EntityNotFoundError('DfdDiagram', diagramId);
  const project = await projectRepo.findById(diagram.projectId);
  if (!project) throw new EntityNotFoundError('Project', diagram.projectId);
  if (!(await orgRepo.isMember(project.organizationId, userId))) {
    throw new ForbiddenError('You are not a member of this organization');
  }
  if (projectAccess) {
    await projectAccess.assertProjectAccess(diagram.projectId, userId, required);
  }
  return diagram;
}
