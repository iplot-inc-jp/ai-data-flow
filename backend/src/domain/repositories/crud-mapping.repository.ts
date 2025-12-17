import { CrudMapping, CrudOperation } from '../entities/crud-mapping.entity';

export const CRUD_MAPPING_REPOSITORY = Symbol('CRUD_MAPPING_REPOSITORY');

export interface ICrudMappingRepository {
  findById(id: string): Promise<CrudMapping | null>;
  findByColumnId(columnId: string): Promise<CrudMapping[]>;
  findByFlowId(flowId: string): Promise<CrudMapping[]>;
  findByFlowNodeId(flowNodeId: string): Promise<CrudMapping[]>;
  findByRoleId(roleId: string): Promise<CrudMapping[]>;
  findByColumnIdAndOperation(columnId: string, operation: CrudOperation): Promise<CrudMapping[]>;
  save(mapping: CrudMapping): Promise<CrudMapping>;
  delete(id: string): Promise<void>;
}

