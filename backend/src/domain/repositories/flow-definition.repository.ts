import { FlowDefinition } from '../entities/flow-definition.entity';

export const FLOW_DEFINITION_REPOSITORY = Symbol('FLOW_DEFINITION_REPOSITORY');

/** プロジェクト一覧用に、フロー基本情報と定義を結合した行 */
export interface FlowWithDefinition {
  flowId: string;
  flowName: string;
  kind: string;
  definition: FlowDefinition | null;
}

export interface IFlowDefinitionRepository {
  findByFlowId(flowId: string): Promise<FlowDefinition | null>;
  findByProjectId(projectId: string): Promise<FlowWithDefinition[]>;
  save(def: FlowDefinition): Promise<void>;
  generateId(): string;
}
