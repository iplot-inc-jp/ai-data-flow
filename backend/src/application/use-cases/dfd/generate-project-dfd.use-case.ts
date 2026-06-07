import { Inject, Injectable } from '@nestjs/common';
import {
  DFD_REPOSITORY, IDfdRepository, DfdGraph,
  BUSINESS_FLOW_REPOSITORY, IBusinessFlowRepository,
  PROJECT_REPOSITORY, ProjectRepository,
  ORGANIZATION_REPOSITORY, OrganizationRepository,
  EntityNotFoundError, ForbiddenError,
  DfdDiagram, DfdNode, DfdFlow,
} from '../../../domain';
import { DfdDiagramOutput, toDfdDiagramOutput } from './dfd.output';

export interface GenerateProjectDfdInput { userId: string; projectId: string; }

/**
 * 第1レベルDFD（flowId=null）の冪等生成。
 * - FUNCTION ノード = プロジェクトの BusinessFlow 群（refFlowId, label=flow.name, number 自動 1-1…）。
 * - データフロー = FlowNodeLink を「source側ノードの所属フロー → targetFlowId」へ畳む（flow→flow）。
 *   dataItem = link.label || 既定。同 source/target/dataItem は集約。
 * - 外部実体/データストア・位置・手動編集は保持し、FUNCTION の過不足のみ同期。
 */
@Injectable()
export class GenerateProjectDfdUseCase {
  constructor(
    @Inject(DFD_REPOSITORY) private readonly repo: IDfdRepository,
    @Inject(BUSINESS_FLOW_REPOSITORY) private readonly flowRepo: IBusinessFlowRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: GenerateProjectDfdInput): Promise<DfdDiagramOutput> {
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) throw new EntityNotFoundError('Project', input.projectId);
    if (!(await this.orgRepo.isMember(project.organizationId, input.userId))) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 第1 diagram（flowId=null）get-or-create（NULL一意性は findFirst で担保）
    let graph: DfdGraph | null = await this.repo.findGraphByProjectFlow(project.id, null);
    if (!graph) {
      const created = DfdDiagram.create(
        { projectId: project.id, flowId: null, title: project.name },
        this.repo.generateId(),
      );
      await this.repo.createDiagram(created);
      graph = { diagram: created, nodes: [], flows: [] };
    }
    const diagramId = graph.diagram.id;

    // プロジェクトの BusinessFlow 群（FUNCTION 化対象）
    const flows = await this.flowRepo.findByProjectId(project.id);
    const flowById = new Map(flows.map((f) => [f.id, f] as const));

    // 既存 FUNCTION ノード（refFlowId で突合）。手動ノード(外部実体/データストア)・位置は保持
    const existingFnByRef = new Map<string, DfdNode>();
    for (const n of graph.nodes) {
      if (n.kind === 'FUNCTION' && n.refFlowId) existingFnByRef.set(n.refFlowId, n);
    }

    // 採番（既存 FUNCTION の最大連番から続ける、prefix=1）
    let maxSeq = 0;
    for (const n of graph.nodes) {
      if (n.kind === 'FUNCTION' && n.number) {
        const m = /-(\d+)$/.exec(n.number);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
    }

    // 過剰: 対応する BusinessFlow が無くなった FUNCTION ノードを削除
    for (const n of graph.nodes) {
      if (n.kind === 'FUNCTION' && n.refFlowId && !flowById.has(n.refFlowId)) {
        await this.repo.deleteNode(n.id);
        existingFnByRef.delete(n.refFlowId);
      }
    }

    // 不足: 新規 BusinessFlow を FUNCTION ノードとして追加
    const dfdNodeByFlow = new Map<string, DfdNode>(existingFnByRef);
    let seq = maxSeq;
    let posY = 80;
    for (const f of flows) {
      if (dfdNodeByFlow.has(f.id)) continue;
      seq += 1;
      const node = DfdNode.create(
        {
          diagramId,
          kind: 'FUNCTION',
          label: f.name,
          number: `1-${seq}`,
          refFlowId: f.id,
          positionX: 320,
          positionY: posY,
        },
        this.repo.generateId(),
      );
      posY += 120;
      await this.repo.saveNode(node);
      dfdNodeByFlow.set(f.id, node);
    }

    // FlowNodeLink を flow→flow に畳む。dataItem=link.label||既定。同 source/target/dataItem は集約。
    const links = await this.repo.findProjectLinkSource(project.id);
    interface Desired { sourceNodeId: string; targetNodeId: string; dataItem: string; }
    const desiredByKey = new Map<string, Desired>();
    for (const l of links) {
      if (l.sourceFlowId === l.targetFlowId) continue; // 自己ループは除外
      const s = dfdNodeByFlow.get(l.sourceFlowId);
      const t = dfdNodeByFlow.get(l.targetFlowId);
      if (!s || !t) continue; // 端のフローが FUNCTION 化されていない
      const dataItem = l.label || '情報';
      const key = `${s.id}->${t.id}::${dataItem}`;
      if (!desiredByKey.has(key)) {
        desiredByKey.set(key, { sourceNodeId: s.id, targetNodeId: t.id, dataItem });
      }
    }

    // 自動管理対象は「両端が refFlow を持つ FUNCTION ノード」間のフローのみ
    const autoFnNodeIds = new Set(Array.from(dfdNodeByFlow.values()).map((n) => n.id));
    const existingAutoFlowKey = new Map<string, DfdFlow>();
    for (const f of graph.flows) {
      if (autoFnNodeIds.has(f.sourceNodeId) && autoFnNodeIds.has(f.targetNodeId)) {
        existingAutoFlowKey.set(`${f.sourceNodeId}->${f.targetNodeId}::${f.dataItem}`, f);
      }
    }

    let order = 0;
    for (const [key, d] of desiredByKey) {
      const existing = existingAutoFlowKey.get(key);
      if (existing) {
        existing.updateOrder(order);
        await this.repo.saveFlow(existing);
      } else {
        const df = DfdFlow.create(
          { diagramId, sourceNodeId: d.sourceNodeId, targetNodeId: d.targetNodeId, dataItem: d.dataItem, order },
          this.repo.generateId(),
        );
        await this.repo.saveFlow(df);
      }
      order += 1;
    }

    // 過剰: 自動管理対象のうちソースに無くなったフローを削除
    for (const [key, f] of existingAutoFlowKey) {
      if (!desiredByKey.has(key)) {
        await this.repo.deleteFlow(f.id);
      }
    }

    const result = await this.repo.findGraphByDiagramId(diagramId);
    return toDfdDiagramOutput(result ?? graph);
  }
}
