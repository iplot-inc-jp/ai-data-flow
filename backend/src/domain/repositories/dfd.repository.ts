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

/**
 * 第1レベル生成のソース：FlowNodeLink を flow→flow に畳んだもの。
 * direction を保持し、INPUT/OUTPUT で source/target の向きを正しく決める。
 * - OUTPUT: nodeFlowId（このノードの所属フロー） → targetFlowId
 * - INPUT : targetFlowId → nodeFlowId
 */
export interface SourceFlowLink {
  direction: 'INPUT' | 'OUTPUT';
  nodeFlowId: string;
  targetFlowId: string;
  label: string | null;
}

export interface IDfdRepository {
  /** project + flow（null=第1レベル）で図グラフを取得 */
  findGraphByProjectFlow(projectId: string, flowId: string | null): Promise<DfdGraph | null>;
  /** diagramId で図グラフを取得 */
  findGraphByDiagramId(diagramId: string): Promise<DfdGraph | null>;
  findDiagramById(id: string): Promise<DfdDiagram | null>;
  createDiagram(d: DfdDiagram): Promise<void>;
  /**
   * 第1レベル(flowId=null)図の find-or-create を並行安全に行う。
   * Postgres は NULL を distinct 扱いするため @@unique([projectId, flowId]) は
   * flowId=null を守れない。partial unique index で担保し、競合時は既存を返す。
   */
  findOrCreateL1Diagram(d: DfdDiagram): Promise<DfdGraph>;
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
  /** 第1レベル生成のための FlowNodeLink 素材（flow→flow に畳む） */
  findProjectLinkSource(projectId: string): Promise<SourceFlowLink[]>;
  generateId(): string;
}
