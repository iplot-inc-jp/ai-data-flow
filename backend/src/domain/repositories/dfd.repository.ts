import { DfdDiagram } from '../entities/dfd-diagram.entity';
import { DfdNode } from '../entities/dfd-node.entity';
import { DfdFlow } from '../entities/dfd-flow.entity';

export const DFD_REPOSITORY = Symbol('DFD_REPOSITORY');

export interface DfdGraph {
  diagram: DfdDiagram;
  nodes: DfdNode[];
  flows: DfdFlow[];
}

/** 第2レベル生成のソース：業務フロー(FlowNode/FlowEdge) の素材 */
export interface SourceFlowNode {
  id: string;
  type: string;
  label: string;
  output: string | null;
}

export interface SourceFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
}

export interface SourceFlowGraph {
  nodes: SourceFlowNode[];
  edges: SourceFlowEdge[];
}

export interface IDfdRepository {
  /** project + flow（null=第1レベル）で図グラフを取得 */
  findGraphByProjectFlow(projectId: string, flowId: string | null): Promise<DfdGraph | null>;
  /** diagramId で図グラフを取得 */
  findGraphByDiagramId(diagramId: string): Promise<DfdGraph | null>;
  findDiagramById(id: string): Promise<DfdDiagram | null>;
  createDiagram(d: DfdDiagram): Promise<void>;
  saveNode(n: DfdNode): Promise<void>;
  findNodeById(id: string): Promise<DfdNode | null>;
  deleteNode(id: string): Promise<void>;
  saveFlow(f: DfdFlow): Promise<void>;
  findFlowById(id: string): Promise<DfdFlow | null>;
  deleteFlow(id: string): Promise<void>;
  bulkSavePositions(
    diagramId: string,
    positions: { id: string; positionX: number; positionY: number }[],
  ): Promise<void>;
  /** 第2レベル生成のための業務フロー素材（FlowNode/FlowEdge） */
  findSourceFlowGraph(flowId: string): Promise<SourceFlowGraph>;
  generateId(): string;
}
