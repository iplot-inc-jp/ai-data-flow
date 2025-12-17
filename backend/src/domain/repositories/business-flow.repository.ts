import { BusinessFlow } from '../entities/business-flow.entity';

export const BUSINESS_FLOW_REPOSITORY = Symbol('BUSINESS_FLOW_REPOSITORY');

export interface IBusinessFlowRepository {
  findById(id: string): Promise<BusinessFlow | null>;
  findByProjectId(projectId: string): Promise<BusinessFlow[]>;
  findRootFlowsByProjectId(projectId: string): Promise<BusinessFlow[]>;
  findChildrenByParentId(parentId: string): Promise<BusinessFlow[]>;
  findWithHierarchy(id: string): Promise<BusinessFlow | null>;
  save(flow: BusinessFlow): Promise<BusinessFlow>;
  delete(id: string): Promise<void>;
}

