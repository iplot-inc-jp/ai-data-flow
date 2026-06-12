import { DfdGraph } from '../../../domain/repositories/dfd.repository';
import { DfdNode } from '../../../domain/entities/dfd-node.entity';
import { DfdFlow } from '../../../domain/entities/dfd-flow.entity';

export interface DfdNodeOutput {
  id: string;
  kind: string;
  label: string;
  number: string | null;
  refFlowId: string | null;
  refNodeId: string | null;
  /** DATA_STORE のデータオブジェクトマスタ紐づけ（任意） */
  dataObjectId: string | null;
  positionX: number;
  positionY: number;
}

export interface DfdFlowOutput {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  dataItem: string;
  informationTypeId: string | null;
  pathStyle: string | null;
  labelT: number | null;
  infoT: number | null;
  order: number;
}

export interface DfdDiagramOutput {
  id: string;
  projectId: string;
  flowId: string | null;
  title: string | null;
  docId: string | null;
  authorName: string | null;
  approverName: string | null;
  updatedAt: string;
  nodes: DfdNodeOutput[];
  flows: DfdFlowOutput[];
  /** kind=DATA_STORE かつ dataObjectId=null のノード数（統合バナー用） */
  unlinkedDataStoreCount: number;
}

export function toDfdNodeOutput(n: DfdNode): DfdNodeOutput {
  return {
    id: n.id,
    kind: n.kind,
    label: n.label,
    number: n.number,
    refFlowId: n.refFlowId,
    refNodeId: n.refNodeId,
    dataObjectId: n.dataObjectId,
    positionX: n.positionX,
    positionY: n.positionY,
  };
}

export function toDfdFlowOutput(f: DfdFlow): DfdFlowOutput {
  return {
    id: f.id,
    sourceNodeId: f.sourceNodeId,
    targetNodeId: f.targetNodeId,
    sourceHandle: f.sourceHandle,
    targetHandle: f.targetHandle,
    dataItem: f.dataItem,
    informationTypeId: f.informationTypeId,
    pathStyle: f.pathStyle,
    labelT: f.labelT,
    infoT: f.infoT,
    order: f.order,
  };
}

export function toDfdDiagramOutput(graph: DfdGraph): DfdDiagramOutput {
  const d = graph.diagram;
  const f = d.fields;
  return {
    id: d.id,
    projectId: d.projectId,
    flowId: d.flowId,
    title: f.title,
    docId: f.docId,
    authorName: f.authorName,
    approverName: f.approverName,
    updatedAt: d.updatedAt.toISOString(),
    nodes: graph.nodes.map(toDfdNodeOutput),
    flows: graph.flows.map(toDfdFlowOutput),
    unlinkedDataStoreCount: graph.nodes.filter(
      (n) => n.kind === 'DATA_STORE' && n.dataObjectId === null,
    ).length,
  };
}
