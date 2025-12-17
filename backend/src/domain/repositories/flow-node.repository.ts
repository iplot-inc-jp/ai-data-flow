import { FlowNode } from '../entities/flow-node.entity';

export const FLOW_NODE_REPOSITORY = Symbol('FLOW_NODE_REPOSITORY');

export interface IFlowNodeRepository {
  findById(id: string): Promise<FlowNode | null>;
  findByFlowId(flowId: string): Promise<FlowNode[]>;
  findByFlowIdWithChildFlow(flowId: string): Promise<FlowNode[]>;
  save(node: FlowNode): Promise<FlowNode>;
  delete(id: string): Promise<void>;
}

