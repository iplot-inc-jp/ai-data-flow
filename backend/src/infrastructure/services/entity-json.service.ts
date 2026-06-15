import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../persistence/prisma/prisma.service';

/**
 * 単一エンティティ（業務フロー / DFD / イシューツリー）の「丸ごと自己完結 JSON」I/O。
 *
 * 設計の要点（project-bundle.service の export/import パターンを 1 エンティティ粒度に縮約）:
 *  - get  : DB の実体を読み、内部参照を **localId（同梱配列内ローカル ID）** に畳んだ
 *           self-contained な Bundle として返す。名前参照（role / informationType /
 *           dataObject）は ID ではなく「名前」で返す（プロジェクトを跨いでも意味が保てる）。
 *  - upsert: Bundle を受け取り、対象の子（nodes/edges/定義/注釈/info リンク）を
 *           **丸ごと削除 → localId 参照で作り直す**（トランザクション）。
 *           localId→新規 DB uuid のマップで内部 FK を解決する。
 *
 * localId の方針:
 *  - 入力 Bundle の localId はクライアント内ローカルな識別子（既存 DB id でも、t1/n1 等の
 *    任意文字列でも可）。再構築時に全要素へ新規 uuid を採番し、localId→uuid で内部参照を解決。
 *  - これにより「get した JSON をそのまま編集して PUT」しても、ID 衝突や残骸が出ない。
 *
 * 名前参照の解決方針（role / informationType / dataObject）:
 *  - すべて **get-or-create by name**（プロジェクトスコープ、@@unique(projectId,name) を利用）。
 *  - 名前が空 / null の参照は単純に未設定（null）として扱い、マスタは作らない。
 *  - DataObject は order を nextOrder で採番して作成（DFD データストア紐づけ用）。
 *
 * 認可はサービスでは行わない（呼び出し側コントローラが ProjectAccessService /
 * Organization メンバーシップで view|edit を強制する）。
 */

export const ENTITY_JSON_VERSION = 1 as const;

// ===========================================================================
// 型定義（Bundle）
// ===========================================================================

// ---- 業務フロー（FlowBundle）----------------------------------------------

export interface FlowBundleFlow {
  name: string;
  description?: string | null;
  kind?: 'ASIS' | 'TOBE';
  confidence?: 'HYPOTHESIS' | 'CONFIRMED';
  /**
   * 所属サブ領域（SubProject）の名前参照。SubProject は name の @@unique を持たない
   * ため get で名前を返し、create では「名前一致の既存」へ解決するのみ（無ければ未設定）。
   */
  subProjectName?: string | null;
  /** 所属フォルダ（FlowFolder）の実 DB id。get→PUT/POST で原値を保持。 */
  folderId?: string | null;
  /** スイムレーン レーン高さの手動オーバーライド。{ [roleName]: height } で名前参照。 */
  laneHeights?: Record<string, number>;
}

export interface FlowBundleNode {
  localId: string;
  label: string;
  type?: string; // FlowNodeType。既定 PROCESS
  /** スイムレーン担当ロール（名前参照, get-or-create） */
  roleName?: string | null;
  /**
   * 業務ブロックがドリルダウンする子業務フロー ID（@unique の弱 FK）。
   * create-node-child-flow が冪等管理する親→子リンクを get→PUT で保持するため、
   * 実 DB の BusinessFlow id をそのまま往復させる（localId 再採番の対象外）。
   */
  childFlowId?: string | null;
  positionX?: number;
  positionY?: number;
  width?: number | null;
  height?: number | null;
  order?: number;
  processingTime?: string | null;
  handledCount?: string | null;
  supplement?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FlowBundleEdge {
  sourceLocalId: string;
  targetLocalId: string;
  label?: string | null;
  condition?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  pathStyle?: string | null;
  labelT?: number | null;
  infoT?: number | null;
  /** 矢印上を流れるデータ（情報種別マスタ, 名前参照 get-or-create） */
  informationTypeName?: string | null;
}

export interface FlowBundleDefinition {
  purpose?: string | null;
  owner?: string | null;
  stakeholders?: string | null;
  input?: string | null;
  inputDetail?: string | null;
  trigger?: string | null;
  doSteps?: unknown[];
  output?: string | null;
  nextProcess?: string | null;
  exceptionHandling?: string | null;
  frequency?: string | null;
  system?: string | null;
  tacitNotes?: string | null;
}

export interface FlowBundleAnnotation {
  kind?: 'STICKY' | 'COMMENT' | 'ICON' | 'SCOPE';
  text?: string;
  positionX?: number;
  positionY?: number;
  width?: number | null;
  height?: number | null;
  color?: string | null;
  icon?: string | null;
  borderStyle?: string | null;
  fillOpacity?: number | null;
  order?: number;
}

export interface FlowBundleNodeInformationLink {
  nodeLocalId: string;
  informationTypeName: string;
  direction: 'INPUT' | 'OUTPUT';
  order?: number;
}

export interface FlowBundle {
  version: number;
  flowId?: string; // get で同梱（情報用）。PUT/POST 時は無視。
  projectId?: string; // get で同梱（情報用）。
  flow: FlowBundleFlow;
  nodes: FlowBundleNode[];
  edges: FlowBundleEdge[];
  definition?: FlowBundleDefinition | null;
  annotations?: FlowBundleAnnotation[];
  nodeInformationLinks?: FlowBundleNodeInformationLink[];
}

// ---- DFD（DfdBundle）-------------------------------------------------------

export interface DfdBundleNode {
  localId: string;
  kind: 'FUNCTION' | 'EXTERNAL_ENTITY' | 'DATA_STORE';
  label: string;
  number?: string | null;
  /** DATA_STORE のデータオブジェクト紐づけ（名前参照 get-or-create） */
  dataObjectName?: string | null;
  /**
   * 自動生成 FUNCTION ノードが参照する BusinessFlow ID（第1レベル DFD）。
   * generate-project-dfd が refFlowId で冪等突合するため、get→PUT で保持する。
   * （BusinessFlow への onDelete:SetNull の弱 FK。存在しない ID は保存時に解決不能で SetNull になる）
   */
  refFlowId?: string | null;
  /**
   * 自動生成 FUNCTION ノードが参照する FlowNode ID（第2レベル DFD）。
   * generate-flow-dfd が refNodeId で冪等突合するため、get→PUT で保持する。
   */
  refNodeId?: string | null;
  positionX?: number;
  positionY?: number;
}

export interface DfdBundleFlow {
  sourceLocalId: string;
  targetLocalId: string;
  label?: string | null; // = dataItem
  informationTypeName?: string | null; // 名前参照 get-or-create
  sourceHandle?: string | null;
  targetHandle?: string | null;
  pathStyle?: string | null;
  labelT?: number | null;
  infoT?: number | null;
  order?: number;
}

export interface DfdBundle {
  version: number;
  /** 1=プロジェクト全体（第1レベル）, 2=業務フロー単位（第2レベル） */
  level: 1 | 2;
  /** level=2 のとき、対象業務フロー ID（get で同梱）。 */
  flowId?: string | null;
  diagramId?: string; // get で同梱（情報用）
  projectId?: string; // get で同梱（情報用）
  title?: string | null;
  nodes: DfdBundleNode[];
  flows: DfdBundleFlow[];
}

// ---- イシューツリー（IssueTreeBundle）-------------------------------------

export interface IssueTreeBundleTree {
  name: string;
  type?: 'WHY' | 'SOLUTION';
  pattern?: 'ISSUE_POINT' | 'WHY' | 'WHAT' | 'HOW' | 'MECE_ACTION' | 'KPI';
  rootQuestion?: string | null;
}

export interface IssueTreeBundleNode {
  localId: string;
  parentLocalId?: string | null;
  label: string;
  kind?: string; // IssueNodeKind。既定 ISSUE
  verification?: 'CONFIRMED' | 'REJECTED' | 'UNKNOWN' | 'NEEDS_HEARING' | 'NA';
  recommendation?: 'ADOPT' | 'HOLD' | 'REJECT' | 'NA';
  evidence?: string | null;
  /**
   * 根本原因ノード参照。同梱ツリー内なら localId、他ツリーの確定ノードなら
   * その実 DB id を指す（クロスツリー参照。書き戻し時は原値を保持）。
   */
  rootCauseLocalId?: string | null;
  order?: number;
  metadata?: Record<string, unknown>;
}

export interface IssueTreeBundle {
  version: number;
  treeId?: string; // get で同梱（情報用）
  projectId?: string; // get で同梱（情報用）
  tree: IssueTreeBundleTree;
  nodes: IssueTreeBundleNode[];
}

// $transaction のコールバックに渡るトランザクションクライアント
type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class EntityJsonService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 業務フロー（FlowBundle）
  // =========================================================================

  /** flowId で業務フローを FlowBundle として取得。flow の projectId も返す。 */
  async getFlowBundle(
    flowId: string,
  ): Promise<{ bundle: FlowBundle; projectId: string } | null> {
    const flow = await this.prisma.businessFlow.findUnique({
      where: { id: flowId },
      include: {
        subProject: { select: { name: true } },
        definition: true,
        annotations: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        nodes: {
          orderBy: { createdAt: 'asc' },
          include: {
            role: { select: { name: true } },
            informationLinks: {
              orderBy: { order: 'asc' },
              include: { informationType: { select: { name: true } } },
            },
          },
        },
        edges: {
          orderBy: { createdAt: 'asc' },
          include: { informationType: { select: { name: true } } },
        },
      },
    });
    if (!flow) return null;

    // DB id を localId として再利用（get→編集→PUT のラウンドトリップが自然）
    const nodes: FlowBundleNode[] = flow.nodes.map((n) => ({
      localId: n.id,
      label: n.label,
      type: n.type,
      roleName: n.role?.name ?? null,
      childFlowId: n.childFlowId ?? null,
      positionX: n.positionX,
      positionY: n.positionY,
      width: n.width,
      height: n.height,
      order: n.order,
      processingTime: n.processingTime,
      handledCount: n.handledCount,
      supplement: n.supplement,
      metadata: (n.metadata ?? {}) as Record<string, unknown>,
    }));

    const edges: FlowBundleEdge[] = flow.edges.map((e) => ({
      sourceLocalId: e.sourceNodeId,
      targetLocalId: e.targetNodeId,
      label: e.label,
      condition: e.condition,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      pathStyle: e.pathStyle,
      labelT: e.labelT,
      infoT: e.infoT,
      informationTypeName: e.informationType?.name ?? null,
    }));

    const annotations: FlowBundleAnnotation[] = flow.annotations.map((a) => ({
      kind: a.kind,
      text: a.text,
      positionX: a.positionX,
      positionY: a.positionY,
      width: a.width,
      height: a.height,
      color: a.color,
      icon: a.icon,
      borderStyle: a.borderStyle,
      fillOpacity: a.fillOpacity,
      order: a.order,
    }));

    const nodeInformationLinks: FlowBundleNodeInformationLink[] = [];
    for (const n of flow.nodes) {
      for (const il of n.informationLinks) {
        nodeInformationLinks.push({
          nodeLocalId: n.id,
          informationTypeName: il.informationType.name,
          direction: il.direction,
          order: il.order,
        });
      }
    }

    const definition: FlowBundleDefinition | null = flow.definition
      ? {
          purpose: flow.definition.purpose,
          owner: flow.definition.owner,
          stakeholders: flow.definition.stakeholders,
          input: flow.definition.input,
          inputDetail: flow.definition.inputDetail,
          trigger: flow.definition.trigger,
          doSteps: (flow.definition.doSteps ?? []) as unknown[],
          output: flow.definition.output,
          nextProcess: flow.definition.nextProcess,
          exceptionHandling: flow.definition.exceptionHandling,
          frequency: flow.definition.frequency,
          system: flow.definition.system,
          tacitNotes: flow.definition.tacitNotes,
        }
      : null;

    const bundle: FlowBundle = {
      version: ENTITY_JSON_VERSION,
      flowId: flow.id,
      projectId: flow.projectId,
      flow: {
        name: flow.name,
        description: flow.description,
        kind: flow.kind,
        confidence: flow.confidence,
        subProjectName: flow.subProject?.name ?? null,
        folderId: flow.folderId ?? null,
        laneHeights: this.laneHeightsToNames(
          (flow.laneHeights ?? {}) as Record<string, number>,
          flow.nodes,
        ),
      },
      nodes,
      edges,
      definition,
      annotations,
      nodeInformationLinks,
    };

    return { bundle, projectId: flow.projectId };
  }

  /**
   * 業務フローを新規作成し、Bundle の中身（nodes/edges/定義/注釈/info リンク）を作り込む。
   * @returns 新規フロー ID
   */
  async createFlowFromBundle(
    projectId: string,
    bundle: FlowBundle,
  ): Promise<{ flowId: string }> {
    this.assertVersion(bundle?.version, 'FlowBundle');
    const newFlowId = randomUUID();
    await this.prisma.$transaction(
      async (tx) => {
        // 所属サブ領域/フォルダの round-trip 復元（名前 or id で解決。無ければ未設定）。
        const subProjectId = await this.resolveSubProjectIdByName(
          tx,
          projectId,
          bundle.flow?.subProjectName ?? null,
        );
        const folderId = await this.resolveFolderId(
          tx,
          projectId,
          bundle.flow?.folderId ?? null,
        );
        await tx.businessFlow.create({
          data: {
            id: newFlowId,
            projectId,
            name: bundle.flow?.name ?? 'Untitled Flow',
            description: bundle.flow?.description ?? null,
            kind: bundle.flow?.kind ?? 'ASIS',
            confidence: bundle.flow?.confidence ?? 'HYPOTHESIS',
            subProjectId,
            folderId,
            laneHeights: {},
          },
        });
        return this.rebuildFlowChildren(tx, projectId, newFlowId, bundle);
      },
      { timeout: 120_000, maxWait: 20_000 },
    ).then((warnings) => this.logBundleWarnings('createFlowFromBundle', newFlowId, warnings));
    return { flowId: newFlowId };
  }

  /**
   * 既存業務フローの中身を Bundle で丸ごと置換。flow メタ（name/kind/...）も更新する。
   * 子（nodes/edges/定義/注釈/info リンク）は全削除 → localId 参照で作り直し。
   */
  async replaceFlowFromBundle(flowId: string, bundle: FlowBundle): Promise<void> {
    this.assertVersion(bundle?.version, 'FlowBundle');
    const flow = await this.prisma.businessFlow.findUnique({
      where: { id: flowId },
      select: { projectId: true },
    });
    if (!flow) throw new Error(`BusinessFlow not found: ${flowId}`);
    const projectId = flow.projectId;

    const warnings = await this.prisma.$transaction(
      async (tx) => {
        // 所属サブ領域/フォルダの round-trip 更新（明示提供時のみ反映）。
        const subProjectId =
          bundle.flow?.subProjectName !== undefined
            ? {
                subProjectId: await this.resolveSubProjectIdByName(
                  tx,
                  projectId,
                  bundle.flow.subProjectName ?? null,
                ),
              }
            : {};
        const folderId =
          bundle.flow?.folderId !== undefined
            ? {
                folderId: await this.resolveFolderId(
                  tx,
                  projectId,
                  bundle.flow.folderId ?? null,
                ),
              }
            : {};

        // flow メタ更新（laneHeights は roleName→roleId 解決後に再構築するため後段で）
        await tx.businessFlow.update({
          where: { id: flowId },
          data: {
            ...(bundle.flow?.name !== undefined ? { name: bundle.flow.name } : {}),
            ...(bundle.flow?.description !== undefined
              ? { description: bundle.flow.description }
              : {}),
            ...(bundle.flow?.kind ? { kind: bundle.flow.kind } : {}),
            ...(bundle.flow?.confidence ? { confidence: bundle.flow.confidence } : {}),
            ...subProjectId,
            ...folderId,
          },
        });

        // 子を全削除（edge → node 順で FK 整合。definition/annotation/infoLink は Cascade だが明示削除）。
        await tx.nodeInformationLink.deleteMany({
          where: { node: { flowId } },
        });
        await tx.flowEdge.deleteMany({ where: { flowId } });
        await tx.flowNode.deleteMany({ where: { flowId } });
        await tx.flowAnnotation.deleteMany({ where: { flowId } });
        await tx.flowDefinition.deleteMany({ where: { flowId } });

        return this.rebuildFlowChildren(tx, projectId, flowId, bundle);
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    this.logBundleWarnings('replaceFlowFromBundle', flowId, warnings);
  }

  /**
   * flow の子要素を localId 参照で作り直す共通処理（create / replace 双方で使用）。
   * @returns 取り込み中に発生した警告（childFlowId 衝突による null 化など。取り込み自体は成功）。
   */
  private async rebuildFlowChildren(
    tx: PrismaTx,
    projectId: string,
    flowId: string,
    bundle: FlowBundle,
  ): Promise<string[]> {
    const warnings: string[] = [];
    // ---- nodes（localId→新 uuid, roleName→roleId）----
    const nodeIdMap = new Map<string, string>();
    const roleCache = new Map<string, string>();
    for (const n of bundle.nodes ?? []) {
      if (!n.localId) continue;
      const newId = randomUUID();
      nodeIdMap.set(n.localId, newId);
      const roleId = await this.resolveRoleIdByName(
        tx,
        projectId,
        n.roleName ?? null,
        roleCache,
      );
      // childFlowId はグローバル @unique。create/別フローへの replace では、ソース側の
      // 旧ノード（別フロー）が同じ childFlowId を保持していると P2002 で全 tx ロールバック
      // になる。衝突時は childFlowId を null 化して取り込み自体は成功させ、warnings に積む。
      let childFlowId = n.childFlowId ?? null;
      if (childFlowId) {
        const owner = await tx.flowNode.findFirst({
          where: { childFlowId, NOT: { flowId } },
          select: { id: true },
        });
        if (owner) {
          warnings.push(
            `node "${n.label ?? n.localId}": childFlowId ${childFlowId} は別フローのノードが保持済みのため、リンクを外して取り込みました（重複した親→子リンクは作れません）。`,
          );
          childFlowId = null;
        }
      }
      await tx.flowNode.create({
        data: {
          id: newId,
          flowId,
          type: (n.type as never) ?? 'PROCESS',
          label: n.label ?? '',
          positionX: n.positionX ?? 0,
          positionY: n.positionY ?? 0,
          width: n.width ?? null,
          height: n.height ?? null,
          order: n.order ?? 0,
          roleId,
          // ドリルダウン子フローの弱 FK を保持（親→子リンクの冪等性のため）。
          // 同一フロー内の旧ノードは tx 内で削除済み。他フローの保持は上で null 化済み。
          childFlowId,
          processingTime: n.processingTime ?? null,
          handledCount: n.handledCount ?? null,
          supplement: n.supplement ?? null,
          metadata: (n.metadata ?? {}) as never,
        },
      });
    }

    // ---- edges（source/target localId→nodeId, informationTypeName→id）----
    const infoCache = new Map<string, string>();
    for (const e of bundle.edges ?? []) {
      const sourceNodeId = nodeIdMap.get(e.sourceLocalId);
      const targetNodeId = nodeIdMap.get(e.targetLocalId);
      // 参照不能なエッジは作らない（不整合 Bundle 耐性）
      if (!sourceNodeId || !targetNodeId) continue;
      const informationTypeId = await this.resolveInformationTypeIdByName(
        tx,
        projectId,
        e.informationTypeName ?? null,
        infoCache,
      );
      await tx.flowEdge.create({
        data: {
          id: randomUUID(),
          flowId,
          sourceNodeId,
          targetNodeId,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          label: e.label ?? null,
          condition: e.condition ?? null,
          informationTypeId,
          pathStyle: e.pathStyle ?? null,
          labelT: e.labelT ?? null,
          infoT: e.infoT ?? null,
        },
      });
    }

    // ---- nodeInformationLinks ----
    let ilIdx = 0;
    for (const il of bundle.nodeInformationLinks ?? []) {
      const nodeId = nodeIdMap.get(il.nodeLocalId);
      if (!nodeId) continue;
      const informationTypeId = await this.resolveInformationTypeIdByName(
        tx,
        projectId,
        il.informationTypeName ?? null,
        infoCache,
      );
      if (!informationTypeId) continue; // 必須参照が解決できなければ skip
      await tx.nodeInformationLink.create({
        data: {
          id: randomUUID(),
          nodeId,
          informationTypeId,
          direction: il.direction,
          order: il.order ?? ilIdx++,
        },
      });
    }

    // ---- annotations ----
    let annIdx = 0;
    for (const a of bundle.annotations ?? []) {
      await tx.flowAnnotation.create({
        data: {
          id: randomUUID(),
          flowId,
          kind: a.kind ?? 'STICKY',
          text: a.text ?? '',
          positionX: a.positionX ?? 0,
          positionY: a.positionY ?? 0,
          width: a.width ?? null,
          height: a.height ?? null,
          color: a.color ?? null,
          icon: a.icon ?? null,
          borderStyle: a.borderStyle ?? null,
          fillOpacity: a.fillOpacity ?? null,
          order: a.order ?? annIdx++,
        },
      });
    }

    // ---- definition ----
    if (bundle.definition) {
      const d = bundle.definition;
      await tx.flowDefinition.create({
        data: {
          id: randomUUID(),
          flowId,
          purpose: d.purpose ?? null,
          owner: d.owner ?? null,
          stakeholders: d.stakeholders ?? null,
          input: d.input ?? null,
          inputDetail: d.inputDetail ?? null,
          trigger: d.trigger ?? null,
          doSteps: (d.doSteps ?? []) as never,
          output: d.output ?? null,
          nextProcess: d.nextProcess ?? null,
          exceptionHandling: d.exceptionHandling ?? null,
          frequency: d.frequency ?? null,
          system: d.system ?? null,
          tacitNotes: d.tacitNotes ?? null,
        },
      });
    }

    // ---- laneHeights（roleName→roleId 解決して保存）----
    // laneHeights が明示提供されている場合は常に上書き保存する（空 {} で全消去できる）。
    // undefined のとき（キー自体が無い）は触らない。
    const lh = bundle.flow?.laneHeights;
    if (lh && typeof lh === 'object') {
      const resolved: Record<string, number> = {};
      for (const [roleName, height] of Object.entries(lh)) {
        const roleId = await this.resolveRoleIdByName(
          tx,
          projectId,
          roleName,
          roleCache,
        );
        if (roleId && typeof height === 'number') resolved[roleId] = height;
      }
      await tx.businessFlow.update({
        where: { id: flowId },
        data: { laneHeights: resolved },
      });
    }

    return warnings;
  }

  /** laneHeights（roleId→height）を roleName→height に変換（get 用）。 */
  private laneHeightsToNames(
    laneHeights: Record<string, number>,
    nodes: Array<{ roleId: string | null; role: { name: string } | null }>,
  ): Record<string, number> {
    const idToName = new Map<string, string>();
    for (const n of nodes) {
      if (n.roleId && n.role) idToName.set(n.roleId, n.role.name);
    }
    const out: Record<string, number> = {};
    for (const [roleId, height] of Object.entries(laneHeights)) {
      const name = idToName.get(roleId);
      if (name) out[name] = height;
    }
    return out;
  }

  // =========================================================================
  // DFD（DfdBundle）
  // =========================================================================

  /**
   * DFD を DfdBundle として取得。
   * level=1: projectId + flowId=null の図、level=2: flowId 指定の図。
   * 図が無ければ空の図を get-or-create して返す。
   */
  async getDfdBundle(
    projectId: string,
    flowId: string | null,
  ): Promise<{ bundle: DfdBundle; projectId: string }> {
    const level: 1 | 2 = flowId ? 2 : 1;
    const existing = await this.prisma.dfdDiagram.findFirst({
      where: { projectId, flowId: flowId ?? null },
      include: {
        nodes: {
          orderBy: { createdAt: 'asc' },
          include: { dataObject: { select: { name: true } } },
        },
        flows: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: { informationType: { select: { name: true } } },
        },
      },
    });

    // get-or-create（空の図）。title は flow 名があれば流用。
    // find-then-create は READ COMMITTED 下で原子的でなく、並行リクエストで P2002 を踏む。
    //  - L2（flowId 指定）: 複合 @@unique([projectId, flowId]) 上の upsert で原子化。
    //  - L1（flowId=null）: Postgres は NULL を distinct 扱いするため複合 unique が効かない。
    //    既存 DfdRepositoryImpl.findOrCreateL1Diagram と同じく partial unique index を冪等に
    //    張り、create が P2002 で落ちたら勝者を読み直す方式に合わせる。
    const diagram =
      existing ??
      (await (async () => {
        let title: string | null = null;
        if (flowId) {
          const flow = await this.prisma.businessFlow.findUnique({
            where: { id: flowId },
            select: { name: true },
          });
          title = flow?.name ?? null;
        }

        if (flowId) {
          const created = await this.prisma.dfdDiagram.upsert({
            where: { projectId_flowId: { projectId, flowId } },
            create: { id: randomUUID(), projectId, flowId, title },
            update: {},
            include: {
              nodes: {
                orderBy: { createdAt: 'asc' },
                include: { dataObject: { select: { name: true } } },
              },
              flows: {
                orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                include: { informationType: { select: { name: true } } },
              },
            },
          });
          return created;
        }

        // L1: partial unique index を冪等に張り、create を P2002 リトライで単一に絞る。
        await this.prisma.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "dfd_diagrams_project_l1_unique" ` +
            `ON "dfd_diagrams" ("project_id") WHERE "flow_id" IS NULL`,
        );
        try {
          const created = await this.prisma.dfdDiagram.create({
            data: { id: randomUUID(), projectId, flowId: null, title },
          });
          return { ...created, nodes: [], flows: [] };
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            const winner = await this.prisma.dfdDiagram.findFirst({
              where: { projectId, flowId: null },
              include: {
                nodes: {
                  orderBy: { createdAt: 'asc' },
                  include: { dataObject: { select: { name: true } } },
                },
                flows: {
                  orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                  include: { informationType: { select: { name: true } } },
                },
              },
            });
            if (winner) return winner;
          }
          throw e;
        }
      })());

    const dfdNodes = diagram.nodes as Array<{
      id: string;
      kind: DfdBundleNode['kind'];
      label: string;
      number: string | null;
      dataObject: { name: string } | null;
      refFlowId: string | null;
      refNodeId: string | null;
      positionX: number;
      positionY: number;
    }>;
    const dfdFlows = diagram.flows as Array<{
      sourceNodeId: string;
      targetNodeId: string;
      dataItem: string;
      informationType: { name: string } | null;
      sourceHandle: string | null;
      targetHandle: string | null;
      pathStyle: string | null;
      labelT: number | null;
      infoT: number | null;
      order: number;
    }>;

    const nodes: DfdBundleNode[] = dfdNodes.map((n) => ({
      localId: n.id,
      kind: n.kind,
      label: n.label,
      number: n.number,
      dataObjectName: n.dataObject?.name ?? null,
      refFlowId: n.refFlowId,
      refNodeId: n.refNodeId,
      positionX: n.positionX,
      positionY: n.positionY,
    }));

    const flows: DfdBundleFlow[] = dfdFlows.map((f) => ({
      sourceLocalId: f.sourceNodeId,
      targetLocalId: f.targetNodeId,
      label: f.dataItem,
      informationTypeName: f.informationType?.name ?? null,
      sourceHandle: f.sourceHandle,
      targetHandle: f.targetHandle,
      pathStyle: f.pathStyle,
      labelT: f.labelT,
      infoT: f.infoT,
      order: f.order,
    }));

    const bundle: DfdBundle = {
      version: ENTITY_JSON_VERSION,
      level,
      flowId: diagram.flowId,
      diagramId: diagram.id,
      projectId: diagram.projectId,
      title: diagram.title,
      nodes,
      flows,
    };
    return { bundle, projectId: diagram.projectId };
  }

  /**
   * DFD を Bundle で丸ごと置換（手動ノード/フローの全置換）。
   * 図は get-or-create し、その配下の nodes/flows を全削除 → localId 参照で作り直す。
   *
   * 自動生成分の扱い（安全側）: 手動・自動を区別する列が無いため、この PUT は
   * 「Bundle が DFD の唯一の正」として図全体を置換する。自動生成（generate*）と
   * 併用する場合は、generate を最後に流すか PUT を使い分ける運用とする。
   */
  async replaceDfdFromBundle(
    projectId: string,
    flowId: string | null,
    bundle: DfdBundle,
  ): Promise<{ diagramId: string }> {
    this.assertVersion(bundle?.version, 'DfdBundle');
    const diagramId = await this.prisma.$transaction(
      async (tx) => {
        // 図 get-or-create
        let diagram = await tx.dfdDiagram.findFirst({
          where: { projectId, flowId: flowId ?? null },
          select: { id: true },
        });
        if (!diagram) {
          const created = await tx.dfdDiagram.create({
            data: {
              id: randomUUID(),
              projectId,
              flowId: flowId ?? null,
              title: bundle.title ?? null,
            },
            select: { id: true },
          });
          diagram = created;
        } else if (bundle.title !== undefined) {
          await tx.dfdDiagram.update({
            where: { id: diagram.id },
            data: { title: bundle.title },
          });
        }
        const dId = diagram.id;

        // 配下 flows → nodes 順で全削除
        await tx.dfdFlow.deleteMany({ where: { diagramId: dId } });
        await tx.dfdNode.deleteMany({ where: { diagramId: dId } });

        // nodes 作り直し（localId→新 uuid, dataObjectName→id）
        const nodeIdMap = new Map<string, string>();
        const objectCache = new Map<string, string>();
        for (const n of bundle.nodes ?? []) {
          if (!n.localId) continue;
          const newId = randomUUID();
          nodeIdMap.set(n.localId, newId);
          const dataObjectId =
            n.kind === 'DATA_STORE'
              ? await this.resolveDataObjectIdByName(
                  tx,
                  projectId,
                  n.dataObjectName ?? null,
                  objectCache,
                )
              : null;
          await tx.dfdNode.create({
            data: {
              id: newId,
              diagramId: dId,
              kind: n.kind,
              label: n.label ?? '',
              number: n.number ?? null,
              dataObjectId,
              // 自動生成 FUNCTION ノードの弱 FK を保持（冪等突合のため）。FUNCTION 以外は無視。
              refFlowId: n.kind === 'FUNCTION' ? n.refFlowId ?? null : null,
              refNodeId: n.kind === 'FUNCTION' ? n.refNodeId ?? null : null,
              positionX: n.positionX ?? 0,
              positionY: n.positionY ?? 0,
            },
          });
        }

        // flows 作り直し
        const infoCache = new Map<string, string>();
        let order = 0;
        for (const f of bundle.flows ?? []) {
          const sourceNodeId = nodeIdMap.get(f.sourceLocalId);
          const targetNodeId = nodeIdMap.get(f.targetLocalId);
          if (!sourceNodeId || !targetNodeId) continue;
          const informationTypeId = await this.resolveInformationTypeIdByName(
            tx,
            projectId,
            f.informationTypeName ?? null,
            infoCache,
          );
          await tx.dfdFlow.create({
            data: {
              id: randomUUID(),
              diagramId: dId,
              sourceNodeId,
              targetNodeId,
              sourceHandle: f.sourceHandle ?? null,
              targetHandle: f.targetHandle ?? null,
              dataItem: f.label ?? '',
              informationTypeId,
              pathStyle: f.pathStyle ?? null,
              labelT: f.labelT ?? null,
              infoT: f.infoT ?? null,
              order: f.order ?? order++,
            },
          });
        }

        return dId;
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    return { diagramId };
  }

  // =========================================================================
  // イシューツリー（IssueTreeBundle）
  // =========================================================================

  /** treeId でイシューツリーを IssueTreeBundle として取得。 */
  async getIssueTreeBundle(
    treeId: string,
  ): Promise<{ bundle: IssueTreeBundle; projectId: string } | null> {
    const tree = await this.prisma.issueTree.findUnique({
      where: { id: treeId },
      include: {
        nodes: { orderBy: [{ depth: 'asc' }, { order: 'asc' }] },
      },
    });
    if (!tree) return null;

    const nodes: IssueTreeBundleNode[] = tree.nodes.map((n) => ({
      localId: n.id,
      parentLocalId: n.parentId,
      label: n.label,
      kind: n.kind,
      verification: n.verification,
      recommendation: n.recommendation,
      evidence: n.evidence,
      rootCauseLocalId: n.rootCauseNodeId,
      order: n.order,
      metadata: (n.metadata ?? {}) as Record<string, unknown>,
    }));

    const bundle: IssueTreeBundle = {
      version: ENTITY_JSON_VERSION,
      treeId: tree.id,
      projectId: tree.projectId,
      tree: {
        name: tree.name,
        type: tree.type,
        pattern: tree.pattern,
        rootQuestion: tree.rootQuestion,
      },
      nodes,
    };
    return { bundle, projectId: tree.projectId };
  }

  /** イシューツリーを新規作成し、ノードを作り込む。@returns 新規ツリー ID */
  async createIssueTreeFromBundle(
    projectId: string,
    bundle: IssueTreeBundle,
  ): Promise<{ treeId: string }> {
    this.assertVersion(bundle?.version, 'IssueTreeBundle');
    const newTreeId = randomUUID();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.issueTree.create({
          data: {
            id: newTreeId,
            projectId,
            name: bundle.tree?.name ?? 'Untitled Tree',
            type: bundle.tree?.type ?? 'WHY',
            pattern: bundle.tree?.pattern ?? 'ISSUE_POINT',
            rootQuestion: bundle.tree?.rootQuestion ?? null,
          },
        });
        await this.rebuildIssueNodes(tx, newTreeId, bundle);
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    return { treeId: newTreeId };
  }

  /** 既存イシューツリーのノードを Bundle で丸ごと置換。tree メタも更新。 */
  async replaceIssueTreeFromBundle(
    treeId: string,
    bundle: IssueTreeBundle,
  ): Promise<void> {
    this.assertVersion(bundle?.version, 'IssueTreeBundle');
    const tree = await this.prisma.issueTree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (!tree) throw new Error(`IssueTree not found: ${treeId}`);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.issueTree.update({
          where: { id: treeId },
          data: {
            ...(bundle.tree?.name !== undefined ? { name: bundle.tree.name } : {}),
            ...(bundle.tree?.type ? { type: bundle.tree.type } : {}),
            ...(bundle.tree?.pattern ? { pattern: bundle.tree.pattern } : {}),
            ...(bundle.tree?.rootQuestion !== undefined
              ? { rootQuestion: bundle.tree.rootQuestion }
              : {}),
          },
        });
        await tx.issueNode.deleteMany({ where: { treeId } });
        await this.rebuildIssueNodes(tx, treeId, bundle);
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  /**
   * ノードを localId 参照で作り直す。
   * parentLocalId / rootCauseLocalId は第2パスで UPDATE（自己/相互参照）。
   * depth は親子関係から導出して保存する。
   */
  private async rebuildIssueNodes(
    tx: PrismaTx,
    treeId: string,
    bundle: IssueTreeBundle,
  ): Promise<void> {
    const rows = bundle.nodes ?? [];
    const idMap = new Map<string, string>();

    // 第1パス: create（parentId/rootCauseNodeId は null）
    let idx = 0;
    for (const n of rows) {
      if (!n.localId) continue;
      const newId = randomUUID();
      idMap.set(n.localId, newId);
      await tx.issueNode.create({
        data: {
          id: newId,
          treeId,
          parentId: null,
          depth: 0,
          order: n.order ?? idx++,
          label: n.label ?? '',
          kind: (n.kind as never) ?? 'ISSUE',
          verification: (n.verification as never) ?? 'NA',
          recommendation: (n.recommendation as never) ?? 'NA',
          evidence: n.evidence ?? null,
          rootCauseNodeId: null,
          metadata: (n.metadata ?? {}) as never,
        },
      });
    }

    // 第2パス: parentId / rootCauseNodeId を解決して UPDATE
    for (const n of rows) {
      const newId = idMap.get(n.localId);
      if (!newId) continue;
      const patch: { parentId?: string | null; rootCauseNodeId?: string | null } =
        {};
      if (n.parentLocalId) {
        const p = idMap.get(n.parentLocalId);
        if (p) patch.parentId = p;
      }
      if (n.rootCauseLocalId) {
        // rootCauseNodeId は他ツリーの確定ノードを指す弱参照（Prisma FK なし）。
        // 同梱ツリー内の localId なら新 uuid に解決し、見つからなければ
        // 他ツリーの実 DB id とみなして原値をそのまま保持する（クロスツリー参照の維持）。
        patch.rootCauseNodeId = idMap.get(n.rootCauseLocalId) ?? n.rootCauseLocalId;
      }
      if (Object.keys(patch).length > 0) {
        await tx.issueNode.update({ where: { id: newId }, data: patch });
      }
    }

    // 第3パス: depth を親子チェーンから導出（ルート=0）
    await this.recomputeIssueDepths(tx, treeId);
  }

  /** ツリー内ノードの depth を親子関係から再計算して保存。 */
  private async recomputeIssueDepths(
    tx: PrismaTx,
    treeId: string,
  ): Promise<void> {
    const nodes = await tx.issueNode.findMany({
      where: { treeId },
      select: { id: true, parentId: true },
    });
    const parentOf = new Map<string, string | null>();
    for (const n of nodes) parentOf.set(n.id, n.parentId);

    const depthCache = new Map<string, number>();
    const depthOf = (id: string): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      const guard = new Set<string>();
      let depth = 0;
      let cur: string | null | undefined = parentOf.get(id) ?? null;
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        depth++;
        cur = parentOf.get(cur) ?? null;
      }
      depthCache.set(id, depth);
      return depth;
    };

    for (const n of nodes) {
      const depth = depthOf(n.id);
      await tx.issueNode.update({ where: { id: n.id }, data: { depth } });
    }
  }

  // =========================================================================
  // 名前参照の解決（get-or-create by name, プロジェクトスコープ）
  // =========================================================================

  private async resolveRoleIdByName(
    tx: PrismaTx,
    projectId: string,
    name: string | null,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const key = (name ?? '').trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    // find-then-create は READ COMMITTED 下で原子的でなく、並行取り込みで P2002 →
    // 全 tx ロールバック。複合 @@unique([projectId, name]) 上の upsert で原子化する。
    const row = await tx.role.upsert({
      where: { projectId_name: { projectId, name: key } },
      create: { id: randomUUID(), projectId, name: key },
      update: {},
      select: { id: true },
    });
    cache.set(key, row.id);
    return row.id;
  }

  private async resolveInformationTypeIdByName(
    tx: PrismaTx,
    projectId: string,
    name: string | null,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const key = (name ?? '').trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    // InformationType は @@unique([projectId, name]) を持たない（Role/DataObject と異なる）。
    // 複合 unique が無いため upsert できず、また P2002 競合も起きない（最悪でも重複行＝既存挙動）。
    // よって find-then-create を維持する（クラッシュは無いので race-fix の対象外）。
    const existing = await tx.informationType.findFirst({
      where: { projectId, name: key },
      select: { id: true },
    });
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    const created = await tx.informationType.create({
      data: { id: randomUUID(), projectId, name: key },
      select: { id: true },
    });
    cache.set(key, created.id);
    return created.id;
  }

  private async resolveDataObjectIdByName(
    tx: PrismaTx,
    projectId: string,
    name: string | null,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const key = (name ?? '').trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    // order は既存最大 +1（create 分岐でのみ使用。新規採番を維持）。
    const last = await tx.dataObject.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    // 複合 @@unique([projectId, name]) 上の upsert で find-then-create の P2002 競合を排除。
    const row = await tx.dataObject.upsert({
      where: { projectId_name: { projectId, name: key } },
      create: {
        id: randomUUID(),
        projectId,
        name: key,
        order: (last?.order ?? -1) + 1,
      },
      update: {},
      select: { id: true },
    });
    cache.set(key, row.id);
    return row.id;
  }

  /**
   * SubProject を名前で解決（プロジェクトスコープ）。SubProject は name の @@unique を
   * 持たない（同名サブ領域があり得る）ため get-or-create はせず、名前一致の既存を返すのみ。
   * 見つからない / 空名のときは null（未設定）として扱う。同名複数時は最初の 1 件。
   */
  private async resolveSubProjectIdByName(
    tx: PrismaTx,
    projectId: string,
    name: string | null,
  ): Promise<string | null> {
    const key = (name ?? '').trim();
    if (!key) return null;
    const existing = await tx.subProject.findFirst({
      where: { projectId, name: key },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  /**
   * FlowFolder を実 DB id で解決（round-trip 保持）。フォルダは名前一意性が無く実 id を
   * そのまま往復させる。プロジェクト不一致 / 存在しない id は null（未設定）に倒す。
   */
  private async resolveFolderId(
    tx: PrismaTx,
    projectId: string,
    folderId: string | null,
  ): Promise<string | null> {
    const id = (folderId ?? '').trim();
    if (!id) return null;
    const existing = await tx.flowFolder.findFirst({
      where: { id, projectId },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  /** 取り込み中の警告をログに残す（取り込み自体は成功させる方針）。 */
  private logBundleWarnings(
    op: string,
    id: string,
    warnings: string[],
  ): void {
    if (warnings && warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[${op}] ${id}: ${warnings.length} warning(s)`, warnings);
    }
  }

  // =========================================================================
  // JSON Schema（draft-07, まとめて返す）
  // =========================================================================

  private assertVersion(version: unknown, label: string): void {
    if (version !== ENTITY_JSON_VERSION) {
      throw new Error(
        `Unsupported ${label} version: ${String(version)} (expected ${ENTITY_JSON_VERSION})`,
      );
    }
  }

  /** AI が事前取得する {flow, dfd, issueTree} の draft-07 JSON Schema。 */
  getEntitySchemas(): Record<string, unknown> {
    const versionProp = {
      type: 'integer',
      const: ENTITY_JSON_VERSION,
      description: `Bundle format version. Must equal ${ENTITY_JSON_VERSION} on PUT/POST.`,
    };
    const nullableString = { type: ['string', 'null'] };
    const nullableNumber = { type: ['number', 'null'] };

    const flow = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://iplot.local/schemas/flow-bundle.json',
      title: 'IPLoT Business Flow Bundle',
      description:
        'Self-contained business flow. Edges reference nodes by sourceLocalId/targetLocalId. role/informationType are referenced by NAME (get-or-create within the project; empty name = unset). On PUT, the whole flow content is replaced (nodes/edges are deleted and recreated). WARNING: data attached to edges/nodes that is NOT part of this bundle is collateral-deleted on PUT — namely interface definitions (IF定義) + their columns, edge<->API links, and cross-flow input/output links (FlowNodeLink); CRUD mappings, GAP asis/tobe node refs, and L2-DFD FUNCTION node refs to these nodes are reset to null. childFlowId IS preserved (round-trip it unchanged). Avoid blind get->PUT if you only meant a small edit and those linkages exist; prefer targeted node/edge tools.',
      type: 'object',
      required: ['version', 'flow', 'nodes', 'edges'],
      additionalProperties: true,
      properties: {
        version: versionProp,
        flowId: { type: 'string', description: 'Echoed on GET; ignored on write.' },
        projectId: { type: 'string', description: 'Echoed on GET; ignored on write.' },
        flow: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            description: nullableString,
            kind: { type: 'string', enum: ['ASIS', 'TOBE'] },
            confidence: { type: 'string', enum: ['HYPOTHESIS', 'CONFIRMED'] },
            subProjectName: {
              ...nullableString,
              description:
                'Owning sub-project (領域) by name. Resolved to an existing same-named sub-project (not auto-created; null/absent = unset). Round-trip the value from GET to preserve grouping.',
            },
            folderId: {
              ...nullableString,
              description:
                'Owning folder DB id. Round-trip the value from GET unchanged to preserve grouping; ids not belonging to this project are reset to null.',
            },
            laneHeights: {
              type: 'object',
              description:
                'Map of roleName -> lane height (number). When present (even as {}), it OVERWRITES stored lane heights; pass {} to clear all. Omit the key to leave them untouched.',
              additionalProperties: { type: 'number' },
            },
          },
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['localId', 'label'],
            additionalProperties: false,
            properties: {
              localId: {
                type: 'string',
                description:
                  'Local identifier unique within this bundle; remapped to a fresh uuid on write.',
              },
              label: { type: 'string' },
              type: {
                type: 'string',
                enum: [
                  'START',
                  'END',
                  'PROCESS',
                  'DECISION',
                  'SYSTEM_INTEGRATION',
                  'MANUAL_OPERATION',
                  'DATA_STORE',
                ],
                description: 'FlowNodeType. Defaults to PROCESS.',
              },
              roleName: {
                ...nullableString,
                description: 'Swimlane role by name (get-or-create).',
              },
              childFlowId: {
                ...nullableString,
                description:
                  'Drill-down child BusinessFlow id (GLOBALLY unique weak FK). Keep the value from GET unchanged to preserve the parent->child link; do not invent or reassign. On write into a DIFFERENT flow, if another flow node already owns this childFlowId the link is dropped (set to null) and a warning is logged so the import still succeeds.',
              },
              positionX: { type: 'number' },
              positionY: { type: 'number' },
              width: nullableNumber,
              height: nullableNumber,
              order: { type: 'integer' },
              processingTime: nullableString,
              handledCount: nullableString,
              supplement: nullableString,
              metadata: { type: 'object' },
            },
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            required: ['sourceLocalId', 'targetLocalId'],
            additionalProperties: false,
            properties: {
              sourceLocalId: { type: 'string' },
              targetLocalId: { type: 'string' },
              label: nullableString,
              condition: nullableString,
              sourceHandle: nullableString,
              targetHandle: nullableString,
              pathStyle: {
                ...nullableString,
                description: "'smoothstep' | 'bezier' | 'straight'",
              },
              labelT: nullableNumber,
              infoT: nullableNumber,
              informationTypeName: {
                ...nullableString,
                description: 'Data carried on this arrow, by name (get-or-create).',
              },
            },
          },
        },
        definition: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            purpose: nullableString,
            owner: nullableString,
            stakeholders: nullableString,
            input: nullableString,
            inputDetail: nullableString,
            trigger: nullableString,
            doSteps: { type: 'array' },
            output: nullableString,
            nextProcess: nullableString,
            exceptionHandling: nullableString,
            frequency: nullableString,
            system: nullableString,
            tacitNotes: nullableString,
          },
        },
        annotations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['STICKY', 'COMMENT', 'ICON', 'SCOPE'] },
              text: { type: 'string' },
              positionX: { type: 'number' },
              positionY: { type: 'number' },
              width: nullableNumber,
              height: nullableNumber,
              color: nullableString,
              icon: nullableString,
              borderStyle: { ...nullableString, description: "'dashed' | 'solid'" },
              fillOpacity: nullableNumber,
              order: { type: 'integer' },
            },
          },
        },
        nodeInformationLinks: {
          type: 'array',
          description: 'Node INPUT/OUTPUT links to information-type masters (by name).',
          items: {
            type: 'object',
            required: ['nodeLocalId', 'informationTypeName', 'direction'],
            additionalProperties: false,
            properties: {
              nodeLocalId: { type: 'string' },
              informationTypeName: { type: 'string' },
              direction: { type: 'string', enum: ['INPUT', 'OUTPUT'] },
              order: { type: 'integer' },
            },
          },
        },
      },
    };

    const dfd = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://iplot.local/schemas/dfd-bundle.json',
      title: 'IPLoT DFD Bundle',
      description:
        'Self-contained DFD. level=1 is the project-wide (L1) diagram (flowId null), level=2 is per-business-flow (L2). Flows reference nodes by sourceLocalId/targetLocalId. dataObject/informationType referenced by NAME (get-or-create). On PUT the whole diagram content is replaced (manual + previously generated nodes alike).',
      type: 'object',
      required: ['version', 'level', 'nodes', 'flows'],
      additionalProperties: true,
      properties: {
        version: versionProp,
        level: { type: 'integer', enum: [1, 2] },
        flowId: { ...nullableString, description: 'L2 target business flow id (echoed on GET).' },
        diagramId: { type: 'string', description: 'Echoed on GET; ignored on write.' },
        projectId: { type: 'string', description: 'Echoed on GET; ignored on write.' },
        title: nullableString,
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['localId', 'kind', 'label'],
            additionalProperties: false,
            properties: {
              localId: { type: 'string' },
              kind: {
                type: 'string',
                enum: ['FUNCTION', 'EXTERNAL_ENTITY', 'DATA_STORE'],
              },
              label: { type: 'string' },
              number: nullableString,
              dataObjectName: {
                ...nullableString,
                description: 'Only for kind=DATA_STORE. Linked data object by name (get-or-create).',
              },
              refFlowId: {
                ...nullableString,
                description:
                  'Auto-managed FUNCTION node link to a BusinessFlow id (L1 DFD). Keep the value from GET unchanged so DFD auto-generation can match this node idempotently; do not invent.',
              },
              refNodeId: {
                ...nullableString,
                description:
                  'Auto-managed FUNCTION node link to a FlowNode id (L2 DFD). Keep the value from GET unchanged so DFD auto-generation can match this node idempotently; do not invent.',
              },
              positionX: { type: 'number' },
              positionY: { type: 'number' },
            },
          },
        },
        flows: {
          type: 'array',
          items: {
            type: 'object',
            required: ['sourceLocalId', 'targetLocalId'],
            additionalProperties: false,
            properties: {
              sourceLocalId: { type: 'string' },
              targetLocalId: { type: 'string' },
              label: { ...nullableString, description: 'Data item label on the flow.' },
              informationTypeName: { ...nullableString, description: 'By name (get-or-create).' },
              sourceHandle: nullableString,
              targetHandle: nullableString,
              pathStyle: nullableString,
              labelT: nullableNumber,
              infoT: nullableNumber,
              order: { type: 'integer' },
            },
          },
        },
      },
    };

    const issueTree = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://iplot.local/schemas/issue-tree-bundle.json',
      title: 'IPLoT Issue Tree Bundle',
      description:
        'Self-contained issue tree. Nodes form a hierarchy via parentLocalId (null = root). rootCauseLocalId optionally references a node by localId in THIS tree, or the DB id of a confirmed node in ANOTHER tree (cross-tree root-cause link, kept as-is on write). depth is derived automatically on write. On PUT, all nodes are replaced.',
      type: 'object',
      required: ['version', 'tree', 'nodes'],
      additionalProperties: true,
      properties: {
        version: versionProp,
        treeId: { type: 'string', description: 'Echoed on GET; ignored on write.' },
        projectId: { type: 'string', description: 'Echoed on GET; ignored on write.' },
        tree: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: ['WHY', 'SOLUTION'],
              description: 'Legacy tree type. Defaults to WHY.',
            },
            pattern: {
              type: 'string',
              enum: ['ISSUE_POINT', 'WHY', 'WHAT', 'HOW', 'MECE_ACTION', 'KPI'],
              description: 'Tree pattern. Defaults to ISSUE_POINT.',
            },
            rootQuestion: nullableString,
          },
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['localId', 'label'],
            additionalProperties: false,
            properties: {
              localId: { type: 'string' },
              parentLocalId: { ...nullableString, description: 'Parent node localId; null = root.' },
              label: { type: 'string' },
              kind: {
                type: 'string',
                enum: [
                  'ISSUE',
                  'CAUSE',
                  'COUNTERMEASURE',
                  'POINT',
                  'HYPOTHESIS',
                  'VERIFICATION',
                  'RESULT',
                  'ELEMENT',
                  'OPTION',
                  'ACTION',
                  'METRIC',
                ],
                description: 'IssueNodeKind. Defaults to ISSUE.',
              },
              verification: {
                type: 'string',
                enum: ['CONFIRMED', 'REJECTED', 'UNKNOWN', 'NEEDS_HEARING', 'NA'],
              },
              recommendation: {
                type: 'string',
                enum: ['ADOPT', 'HOLD', 'REJECT', 'NA'],
              },
              evidence: nullableString,
              rootCauseLocalId: {
                ...nullableString,
                description:
                  'Root-cause reference: a localId in this tree, or the DB id of a confirmed node in another tree. Foreign ids are preserved as-is on write.',
              },
              order: { type: 'integer' },
              metadata: { type: 'object' },
            },
          },
        },
      },
    };

    return { version: ENTITY_JSON_VERSION, flow, dfd, issueTree };
  }
}
