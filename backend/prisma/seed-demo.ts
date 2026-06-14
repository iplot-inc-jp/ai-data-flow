/**
 * デモデータ シードスクリプト（スクリーンショット用）
 *
 * 題材: 中堅製造業「グリーンファクトリー食品」の発注業務改善プロジェクト『発注業務DX』
 *
 * べき等性:
 *   description に DEMO_MARKER('[demo-seed]') を含むプロジェクト（同一組織内）を
 *   検出したら一度削除（Cascade）→ 再投入する。他プロジェクトには触れない。
 *
 * 実行: npm run seed:demo  (= ts-node prisma/seed-demo.ts)
 */
import {
  PrismaClient,
  RoleType,
  SystemKind,
  InformationCategory,
  FlowKind,
  FlowConfidence,
  FlowNodeType,
  FlowAnnotationKind,
  IssueTreeType,
  IssueTreePattern,
  IssueNodeKind,
  NodeVerification,
  NodeRecommendation,
  GapPriority,
  GapStatus,
  TaskStatus,
  TaskPriority,
  KpiCategory,
  KpiDirection,
  KpiFrequency,
  KpiStatus,
  DfdNodeKind,
  RelationCardinality,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_MARKER = '[demo-seed]';
const DEMO_EMAIL = 'demo@iplot.local';
const PROJECT_SLUG = 'hacchu-dx-demo';

async function main() {
  console.log('🌱 Seeding demo data (発注業務DX / グリーンファクトリー食品)...');

  // =============================================
  // 0. デモユーザー / 組織（既存を流用、無ければ作成）
  // =============================================
  let user = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        password: hashedPassword,
        name: 'デモユーザー',
      },
    });
    console.log(`  ✅ User created: ${DEMO_EMAIL}`);
  } else {
    console.log(`  ♻️  User reused: ${DEMO_EMAIL}`);
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { organization: true },
  });
  let organization = membership?.organization ?? null;
  if (!organization) {
    organization = await prisma.organization.upsert({
      where: { slug: 'iplot-demo' },
      update: {},
      create: {
        name: 'IPLoT デモ',
        slug: 'iplot-demo',
        description: 'デモ用の組織',
      },
    });
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: 'OWNER',
      },
    });
    console.log(`  ✅ Organization created: ${organization.name}`);
  } else {
    console.log(`  ♻️  Organization reused: ${organization.name}`);
  }

  // =============================================
  // 1. 既存デモプロジェクトを全削除 → 再作成（べき等）
  // =============================================
  const oldProjects = await prisma.project.findMany({
    where: {
      organizationId: organization.id,
      OR: [
        { description: { contains: DEMO_MARKER } },
        { slug: PROJECT_SLUG },
      ],
    },
    select: { id: true, name: true },
  });
  for (const p of oldProjects) {
    await prisma.project.delete({ where: { id: p.id } });
    console.log(`  🗑  Old demo project deleted: ${p.name} (${p.id})`);
  }

  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      name: '発注業務DX',
      slug: PROJECT_SLUG,
      description:
        'グリーンファクトリー食品の発注業務改善プロジェクト。転記ミス・FAX発注・属人化の解消を狙う。' +
        ` ${DEMO_MARKER}`,
    },
  });
  console.log(`  ✅ Project created: ${project.name} (${project.id})`);

  // =============================================
  // 2. 領域（サブプロジェクト: 調達(発注/検収)・在庫・販売）
  // =============================================
  const spProcurement = await prisma.subProject.create({
    data: {
      projectId: project.id,
      name: '調達',
      description: '原材料・資材の調達領域',
      order: 0,
    },
  });
  const spOrdering = await prisma.subProject.create({
    data: {
      projectId: project.id,
      parentId: spProcurement.id,
      name: '発注',
      description: '仕入先への発注業務',
      order: 0,
    },
  });
  const spInspection = await prisma.subProject.create({
    data: {
      projectId: project.id,
      parentId: spProcurement.id,
      name: '検収',
      description: '入荷・納品書照合・検収業務',
      order: 1,
    },
  });
  const spInventory = await prisma.subProject.create({
    data: {
      projectId: project.id,
      name: '在庫',
      description: '原材料・製品の在庫管理領域',
      order: 1,
    },
  });
  const spSales = await prisma.subProject.create({
    data: {
      projectId: project.id,
      name: '販売',
      description: '受注・販売見込みの管理領域',
      order: 2,
    },
  });
  console.log('  ✅ SubProjects created (調達[発注/検収]・在庫・販売)');

  // =============================================
  // 3. システムマスタ（基幹システム=周辺 / 未来ERP=対象）
  // =============================================
  const sysLegacy = await prisma.system.create({
    data: {
      projectId: project.id,
      subProjectId: spInventory.id,
      name: '基幹システム',
      kind: SystemKind.PERIPHERAL,
      description: '販売・在庫を管理する既存の基幹システム。在庫照会は画面参照のみで外部連携IFがない。',
      order: 0,
    },
  });
  const sysMiraiErp = await prisma.system.create({
    data: {
      projectId: project.id,
      subProjectId: spOrdering.id,
      name: '未来ERP',
      kind: SystemKind.TARGET,
      description: '今回導入する発注・需要予測パッケージ。在庫連携と発注EDIを担う。',
      order: 1,
    },
  });
  console.log('  ✅ Systems created (基幹システム / 未来ERP)');

  // =============================================
  // 4. ロール
  // =============================================
  const roleSales = await prisma.role.create({
    data: {
      projectId: project.id,
      subProjectId: spSales.id,
      name: '営業部',
      type: RoleType.HUMAN,
      description: '得意先の受注見込みを把握し購買部へ連絡する',
      color: '#3B82F6',
      order: 0,
      responsibility: '受注見込みの精度確保と週次での共有',
      kpi: '見込み精度（実績比 ±10% 以内）',
    },
  });
  const rolePurchasing = await prisma.role.create({
    data: {
      projectId: project.id,
      subProjectId: spOrdering.id,
      name: '購買部',
      type: RoleType.HUMAN,
      description: '発注量の算定・発注書発行・仕入先との調整を担う',
      color: '#8B5CF6',
      order: 1,
      responsibility: '欠品ゼロ・過剰在庫の最小化',
      decisionScope: '1回あたり発注金額 10万円未満は担当判断、以上は部長承認',
      kpi: '発注ミス件数（月10件 → 2件以下）',
    },
  });
  const roleWarehouse = await prisma.role.create({
    data: {
      projectId: project.id,
      subProjectId: spInspection.id,
      name: '倉庫',
      type: RoleType.HUMAN,
      description: '入荷検品・納品書照合・在庫の実地管理を担う',
      color: '#F59E0B',
      order: 2,
      responsibility: '入荷検品と検収結果の記録',
    },
  });
  const roleLegacySystem = await prisma.role.create({
    data: {
      projectId: project.id,
      systemId: sysLegacy.id,
      subProjectId: spInventory.id,
      name: '基幹システム',
      type: RoleType.SYSTEM,
      description: '在庫・販売実績を保持する既存システム（画面参照のみ）',
      color: '#6B7280',
      order: 3,
    },
  });
  const roleMiraiErp = await prisma.role.create({
    data: {
      projectId: project.id,
      systemId: sysMiraiErp.id,
      subProjectId: spOrdering.id,
      name: '未来ERP',
      type: RoleType.SYSTEM,
      description: '導入予定の発注・需要予測システム（TOBEフローで使用）',
      color: '#10B981',
      order: 4,
    },
  });
  console.log('  ✅ Roles created (営業部/購買部/倉庫/基幹システム/未来ERP)');

  // =============================================
  // 5. 情報種別マスタ
  // =============================================
  const infoOrderSheet = await prisma.informationType.create({
    data: {
      projectId: project.id,
      subProjectId: spOrdering.id,
      name: '発注書',
      category: InformationCategory.DOCUMENT,
      description: '仕入先へ送付する発注帳票。現状はFAX送信。',
      order: 0,
    },
  });
  const infoStock = await prisma.informationType.create({
    data: {
      projectId: project.id,
      subProjectId: spInventory.id,
      name: '在庫データ',
      category: InformationCategory.INFORMATION,
      description: '基幹システムが保持する品目別在庫数。',
      order: 1,
    },
  });
  const infoDeliveryNote = await prisma.informationType.create({
    data: {
      projectId: project.id,
      subProjectId: spInspection.id,
      name: '納品書',
      category: InformationCategory.DOCUMENT,
      description: '仕入先から入荷時に受領する帳票。',
      order: 2,
    },
  });
  const infoForecast = await prisma.informationType.create({
    data: {
      projectId: project.id,
      subProjectId: spOrdering.id,
      name: '需要予測',
      category: InformationCategory.INFORMATION,
      description: '受注見込みと過去実績から算出する品目別需要予測。',
      order: 3,
    },
  });
  const infoSalesPlan = await prisma.informationType.create({
    data: {
      projectId: project.id,
      subProjectId: spSales.id,
      name: '受注見込みリスト',
      category: InformationCategory.INFORMATION,
      description: '営業部が週次で更新する得意先別の受注見込み（Excel）。',
      order: 4,
    },
  });
  const infoInspectionResult = await prisma.informationType.create({
    data: {
      projectId: project.id,
      subProjectId: spInspection.id,
      name: '検収結果',
      category: InformationCategory.INFORMATION,
      description: '入荷検品の結果（数量差異・品質不良の有無）。',
      order: 5,
    },
  });
  console.log('  ✅ InformationTypes created (6件)');

  // =============================================
  // 6. ASIS 業務フロー「発注業務（現状）」
  // =============================================
  const asisFlow = await prisma.businessFlow.create({
    data: {
      projectId: project.id,
      subProjectId: spOrdering.id,
      name: '発注業務（現状）',
      description: '受注見込みの連絡から発注書FAX送信・台帳登録までの現状フロー',
      kind: FlowKind.ASIS,
      confidence: FlowConfidence.CONFIRMED,
      version: 1,
      depth: 0,
    },
  });

  // ノード（レーン: 営業部 / 購買部 / 基幹システム の3ロール）
  const yLane = { sales: 40, purchasing: 180, system: 320 };
  const ax = (i: number) => 60 + i * 200;

  const an1 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.START, label: '開始',
      roleId: roleSales.id, positionX: ax(0), positionY: yLane.sales, order: 0,
    },
  });
  const an2 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.PROCESS, label: '受注見込みを連絡',
      description: '販売見込み表（Excel）をメールで購買部へ送付',
      roleId: roleSales.id, positionX: ax(1), positionY: yLane.sales, order: 1,
      processingTime: '30分/回', handledCount: '週1回',
    },
  });
  const an3 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.MANUAL_OPERATION, label: '在庫数を目視確認・転記',
      description: '基幹システムの在庫照会画面を見ながらExcelへ手で転記',
      roleId: rolePurchasing.id, positionX: ax(2), positionY: yLane.purchasing, order: 2,
      processingTime: '45分/回', supplement: '品目数が多く転記ミスが頻発',
    },
  });
  const an4 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.SYSTEM_INTEGRATION, label: '在庫データ照会',
      description: '在庫照会画面で品目別在庫数を表示（外部連携IFなし）',
      roleId: roleLegacySystem.id, positionX: ax(3), positionY: yLane.system, order: 3,
    },
  });
  const an5 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.PROCESS, label: '発注量をExcelで算定',
      description: '見込み・在庫・最小ロットを勘案して発注量を決める',
      roleId: rolePurchasing.id, positionX: ax(4), positionY: yLane.purchasing, order: 4,
      processingTime: '60分/回', supplement: '担当者の勘と経験に依存（属人化）',
    },
  });
  const an6 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.DECISION, label: '上長承認',
      description: '発注金額10万円以上は購買部長の承認が必要',
      roleId: rolePurchasing.id, positionX: ax(5), positionY: yLane.purchasing, order: 5,
    },
  });
  const an7 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.MANUAL_OPERATION, label: '発注書をFAXで送信',
      description: '発注書を印刷し仕入先ごとにFAX送信。控えはファイル保管',
      roleId: rolePurchasing.id, positionX: ax(6), positionY: yLane.purchasing, order: 6,
      processingTime: '20分/件', handledCount: '週15件前後',
    },
  });
  const an8 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.SYSTEM_INTEGRATION, label: '発注実績を手入力で登録',
      description: 'FAX送信済みの発注内容を基幹システムの発注台帳へ再入力',
      roleId: roleLegacySystem.id, positionX: ax(7), positionY: yLane.system, order: 7,
      supplement: '二重入力。入力漏れも発生',
    },
  });
  const an9 = await prisma.flowNode.create({
    data: {
      flowId: asisFlow.id, type: FlowNodeType.END, label: '完了',
      roleId: rolePurchasing.id, positionX: ax(8), positionY: yLane.purchasing, order: 8,
    },
  });

  await prisma.flowEdge.create({
    data: { flowId: asisFlow.id, sourceNodeId: an1.id, targetNodeId: an2.id },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: asisFlow.id, sourceNodeId: an2.id, targetNodeId: an3.id,
      informationTypeId: infoSalesPlan.id,
    },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: asisFlow.id, sourceNodeId: an3.id, targetNodeId: an4.id,
      label: '照会',
    },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: asisFlow.id, sourceNodeId: an4.id, targetNodeId: an5.id,
      informationTypeId: infoStock.id,
    },
  });
  await prisma.flowEdge.create({
    data: { flowId: asisFlow.id, sourceNodeId: an5.id, targetNodeId: an6.id },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: asisFlow.id, sourceNodeId: an6.id, targetNodeId: an7.id,
      label: '承認', condition: '10万円未満は担当判断で送信',
    },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: asisFlow.id, sourceNodeId: an6.id, targetNodeId: an5.id,
      label: '差し戻し', condition: '発注量の根拠が不明確な場合',
    },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: asisFlow.id, sourceNodeId: an7.id, targetNodeId: an8.id,
      informationTypeId: infoOrderSheet.id,
    },
  });
  await prisma.flowEdge.create({
    data: { flowId: asisFlow.id, sourceNodeId: an8.id, targetNodeId: an9.id },
  });

  // 付箋
  await prisma.flowAnnotation.create({
    data: {
      flowId: asisFlow.id, kind: FlowAnnotationKind.STICKY,
      text: '在庫の目視転記で月3〜5件の数え間違いが発生（発注ミスの主因）',
      positionX: ax(2), positionY: yLane.purchasing + 130,
      color: '#FEF08A', order: 0,
    },
  });
  await prisma.flowAnnotation.create({
    data: {
      flowId: asisFlow.id, kind: FlowAnnotationKind.STICKY,
      text: 'FAXの控え管理が属人化。担当不在時に発注状況が分からない',
      positionX: ax(6), positionY: yLane.purchasing + 130,
      color: '#FECACA', order: 1,
    },
  });

  // 業務定義書（FlowDefinition）
  await prisma.flowDefinition.create({
    data: {
      flowId: asisFlow.id,
      purpose: '欠品と過剰在庫を防ぎつつ、必要な原材料を適時・適量で仕入先へ発注する',
      owner: '購買部長 田中 誠',
      stakeholders: '営業部・購買部・倉庫・仕入先（約30社）',
      input: '受注見込みリスト（Excel）、基幹システムの在庫数',
      inputDetail: '販売見込み表は営業部が毎週月曜に更新。在庫数は基幹システムの照会画面のみ（CSV出力不可）',
      trigger: '毎週月曜朝の受注見込み連絡（緊急時は随時）',
      doSteps: [
        '営業部から受注見込みを受領する',
        '基幹システムで在庫数を目視確認しExcelへ転記する',
        '発注量をExcelで算定する',
        '10万円以上は購買部長の承認を得る',
        '発注書を印刷しFAXで送信する',
        '発注実績を基幹システムへ手入力する',
      ],
      output: '発注書（FAX）、基幹システムの発注台帳',
      nextProcess: '検収（入荷検品・納品書照合）',
      exceptionHandling: '緊急発注は電話で仕入先へ直接依頼し、事後に台帳へ記入（記入漏れが起きやすい）',
      frequency: '週次（月曜）＋緊急時随時',
      system: '基幹システム（在庫照会のみ）・Excel・FAX',
      tacitNotes: '仕入先ごとの最小ロットや納期の癖は担当者の頭の中にしかない。発注量の微調整は勘と経験。',
    },
  });
  console.log('  ✅ ASIS flow created (ノード9・エッジ9・付箋2・定義書)');

  // =============================================
  // 7. TOBE 業務フロー「発注業務（あるべき）」
  // =============================================
  const tobeFlow = await prisma.businessFlow.create({
    data: {
      projectId: project.id,
      subProjectId: spOrdering.id,
      name: '発注業務（あるべき）',
      description: '未来ERPによる需要予測・発注案自動生成とEDI送信に置き換えたTOBEフロー',
      kind: FlowKind.TOBE,
      confidence: FlowConfidence.HYPOTHESIS,
      asisFlowId: asisFlow.id,
      version: 1,
      depth: 0,
    },
  });

  const tyLane = { sales: 40, purchasing: 180, erp: 320 };
  const tx = (i: number) => 60 + i * 220;

  const tn1 = await prisma.flowNode.create({
    data: {
      flowId: tobeFlow.id, type: FlowNodeType.START, label: '開始',
      roleId: roleSales.id, positionX: tx(0), positionY: tyLane.sales, order: 0,
    },
  });
  const tn2 = await prisma.flowNode.create({
    data: {
      flowId: tobeFlow.id, type: FlowNodeType.PROCESS, label: '受注見込みを未来ERPへ入力',
      description: 'Excelを廃止し、営業部が未来ERPの見込み画面へ直接入力',
      roleId: roleSales.id, positionX: tx(1), positionY: tyLane.sales, order: 1,
      processingTime: '15分/回',
    },
  });
  const tn3 = await prisma.flowNode.create({
    data: {
      flowId: tobeFlow.id, type: FlowNodeType.SYSTEM_INTEGRATION, label: '需要予測・発注案を自動算出',
      description: '基幹システムの在庫データを夜間連携し、見込み＋実績から発注案を自動生成',
      roleId: roleMiraiErp.id, positionX: tx(2), positionY: tyLane.erp, order: 2,
    },
  });
  const tn4 = await prisma.flowNode.create({
    data: {
      flowId: tobeFlow.id, type: FlowNodeType.PROCESS, label: '発注案を確認・承認',
      description: '購買部は発注案の例外（新商品・特売）のみ補正。承認はワークフローで電子化',
      roleId: rolePurchasing.id, positionX: tx(3), positionY: tyLane.purchasing, order: 3,
      processingTime: '20分/回',
    },
  });
  const tn5 = await prisma.flowNode.create({
    data: {
      flowId: tobeFlow.id, type: FlowNodeType.SYSTEM_INTEGRATION, label: '発注データをEDIで自動送信',
      description: 'FAXを廃止し、承認済み発注データを仕入先へEDI送信。台帳は自動記帳',
      roleId: roleMiraiErp.id, positionX: tx(4), positionY: tyLane.erp, order: 4,
    },
  });
  const tn6 = await prisma.flowNode.create({
    data: {
      flowId: tobeFlow.id, type: FlowNodeType.END, label: '完了',
      roleId: rolePurchasing.id, positionX: tx(5), positionY: tyLane.purchasing, order: 5,
    },
  });

  await prisma.flowEdge.create({
    data: { flowId: tobeFlow.id, sourceNodeId: tn1.id, targetNodeId: tn2.id },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: tobeFlow.id, sourceNodeId: tn2.id, targetNodeId: tn3.id,
      informationTypeId: infoSalesPlan.id,
    },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: tobeFlow.id, sourceNodeId: tn3.id, targetNodeId: tn4.id,
      informationTypeId: infoForecast.id,
    },
  });
  await prisma.flowEdge.create({
    data: {
      flowId: tobeFlow.id, sourceNodeId: tn4.id, targetNodeId: tn5.id,
      informationTypeId: infoOrderSheet.id, label: '承認済み',
    },
  });
  await prisma.flowEdge.create({
    data: { flowId: tobeFlow.id, sourceNodeId: tn5.id, targetNodeId: tn6.id },
  });

  await prisma.flowDefinition.create({
    data: {
      flowId: tobeFlow.id,
      purpose: '転記・FAX・二重入力を廃止し、需要予測ベースの発注で欠品と過剰在庫を同時に削減する',
      owner: '購買部長 田中 誠',
      stakeholders: '営業部・購買部・情報システム・仕入先（EDI対応30社中24社見込み）',
      input: '受注見込み（未来ERP直接入力）、在庫データ（基幹システム夜間連携）',
      trigger: '夜間バッチによる発注案の自動生成（毎営業日）',
      doSteps: [
        '営業部が受注見込みを未来ERPへ入力する',
        '未来ERPが需要予測と発注案を自動算出する',
        '購買部が例外のみ補正し電子ワークフローで承認する',
        '承認済み発注データをEDIで自動送信する',
      ],
      output: '発注データ（EDI）、発注台帳（自動記帳）',
      nextProcess: '検収（入荷予定データとの自動照合）',
      exceptionHandling: 'EDI未対応の仕入先（6社）はシステムからFAX自動送信で代替',
      frequency: '日次（夜間バッチ）＋承認は営業日午前',
      system: '未来ERP・基幹システム（在庫連携IF）・EDI',
    },
  });
  console.log('  ✅ TOBE flow created (ノード6・エッジ5・定義書, asisFlowId 紐付け)');

  // =============================================
  // 8. GAP（5-6件）＋ GapLedger ＋ RoadmapPhase
  // =============================================
  // ロードマップフェーズ（GET時の冪等シードと同じ初期3フェーズ）
  await prisma.roadmapPhase.createMany({
    data: [
      { projectId: project.id, name: '3ヶ月以内 (Quick Win)', legacyKey: 'Q', order: 0 },
      { projectId: project.id, name: '1年以内 (Phase2)', legacyKey: 'P2', order: 1 },
      { projectId: project.id, name: '3年以内 (Phase3)', legacyKey: 'P3', order: 2 },
    ],
  });

  const gap1 = await prisma.gapItem.create({
    data: {
      projectId: project.id,
      businessArea: '調達/発注',
      asisDescription: '基幹システムの在庫数を目視で確認しExcelへ手転記している',
      tobeDescription: '未来ERPが在庫データを夜間連携で自動取得する',
      gapDescription: '転記ミスが月3〜5件発生し発注ミスの主因になっている。連携IFが存在しない。',
      priority: GapPriority.HIGH,
      status: GapStatus.OPEN,
      ownerName: '鈴木（情報システム）',
      order: 0,
      asisFlowId: asisFlow.id,
      asisNodeId: an3.id,
      tobeFlowId: tobeFlow.id,
      tobeNodeId: tn3.id,
    },
  });
  const gap2 = await prisma.gapItem.create({
    data: {
      projectId: project.id,
      businessArea: '調達/発注',
      asisDescription: '発注書を印刷しFAXで送信、控えは紙でファイル保管',
      tobeDescription: '承認済み発注データをEDIで自動送信し台帳も自動記帳',
      gapDescription: 'FAX送信と台帳の二重入力で週5時間のムダ。送達確認も属人化。',
      priority: GapPriority.HIGH,
      status: GapStatus.OPEN,
      ownerName: '佐藤（購買）',
      order: 1,
      asisFlowId: asisFlow.id,
      asisNodeId: an7.id,
      tobeFlowId: tobeFlow.id,
      tobeNodeId: tn5.id,
    },
  });
  const gap3 = await prisma.gapItem.create({
    data: {
      projectId: project.id,
      businessArea: '調達/発注',
      asisDescription: '発注量の算定が担当者の勘と経験に依存',
      tobeDescription: '需要予測に基づく発注案を自動生成し、例外のみ人が補正',
      gapDescription: '担当者不在時に発注精度が大きく低下。ノウハウが形式知化されていない。',
      priority: GapPriority.MEDIUM,
      status: GapStatus.OPEN,
      ownerName: '田中（購買部長）',
      order: 2,
      asisFlowId: asisFlow.id,
      asisNodeId: an5.id,
      tobeFlowId: tobeFlow.id,
      tobeNodeId: tn3.id,
    },
  });
  const gap4 = await prisma.gapItem.create({
    data: {
      projectId: project.id,
      businessArea: '在庫',
      asisDescription: '実地棚卸は月1回。期中の在庫精度が低い',
      tobeDescription: '入出荷をリアルタイム記帳し循環棚卸へ移行',
      gapDescription: '月末しか正確な在庫が分からず、月中の発注判断が保守的（過剰在庫）になる。',
      priority: GapPriority.MEDIUM,
      status: GapStatus.OPEN,
      ownerName: '倉庫リーダー',
      order: 3,
      asisFlowId: asisFlow.id,
    },
  });
  const gap5 = await prisma.gapItem.create({
    data: {
      projectId: project.id,
      businessArea: '調達/検収',
      asisDescription: '納品書と発注書控えを1枚ずつ手作業で照合',
      tobeDescription: '入荷予定データと検品結果をシステムで自動照合',
      gapDescription: '照合に1日30分。差異発見が遅れ、支払訂正が翌月にずれ込むことがある。',
      priority: GapPriority.LOW,
      status: GapStatus.OPEN,
      ownerName: '倉庫リーダー',
      order: 4,
      tobeFlowId: tobeFlow.id,
    },
  });
  const gap6 = await prisma.gapItem.create({
    data: {
      projectId: project.id,
      businessArea: '販売',
      asisDescription: '受注見込みが営業担当ごとのExcelで管理され精度がばらつく',
      tobeDescription: 'SFA導入で見込み入力を標準化し未来ERPと連携',
      gapDescription: '見込み精度のばらつきが需要予測の上限になる。ただしSFA導入は本プロジェクトの範囲外。',
      priority: GapPriority.LOW,
      status: GapStatus.OPEN,
      outOfScope: true,
      ownerName: '営業部長',
      order: 5,
    },
  });

  await prisma.gapLedger.createMany({
    data: [
      { projectId: project.id, gapId: gap1.id, impact: '高', difficulty: '中', phase: 'Q', target: '2026-09', toComplete: '在庫連携IFの仕様確定（基幹側のテーブル定義開示）', order: 0 },
      { projectId: project.id, gapId: gap2.id, impact: '高', difficulty: '中', phase: 'P2', target: '2026-12', toComplete: '仕入先のEDI対応状況の確認（30社アンケート）', order: 1 },
      { projectId: project.id, gapId: gap3.id, impact: '中', difficulty: '高', phase: 'P2', target: '2027-03', toComplete: '需要予測モデルの精度検証（過去2年分の実績）', order: 2 },
      { projectId: project.id, gapId: gap4.id, impact: '中', difficulty: '中', phase: 'P3', target: '2027-09', toComplete: 'ハンディターミナル導入の費用対効果試算', order: 3 },
      { projectId: project.id, gapId: gap5.id, impact: '低', difficulty: '低', phase: 'Q', target: '2026-09', toComplete: '入荷予定データのフォーマット確認', order: 4 },
      { projectId: project.id, gapId: gap6.id, impact: '中', difficulty: '高', phase: 'P3', note: 'SFA導入は来期スコープ（スコープ外）', order: 5 },
    ],
  });
  console.log('  ✅ GAP items created (6件) + GapLedger (Q/P2/P3) + RoadmapPhase');

  // =============================================
  // 9. 課題ツリー（ISSUE_POINT パターン）
  // =============================================
  const tree = await prisma.issueTree.create({
    data: {
      projectId: project.id,
      type: IssueTreeType.WHY,
      pattern: IssueTreePattern.ISSUE_POINT,
      name: 'なぜ発注ミスが多いのか',
      rootQuestion: 'なぜ発注ミスが月10件も発生するのか',
    },
  });
  const ntRoot = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: null, depth: 0, order: 0,
      label: 'なぜ発注ミスが月10件も発生するのか',
      kind: IssueNodeKind.ISSUE,
    },
  });
  const ntPointA = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntRoot.id, depth: 1, order: 0,
      label: '入力・転記のプロセスに問題があるのか',
      kind: IssueNodeKind.POINT,
    },
  });
  const ntHypA1 = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntPointA.id, depth: 2, order: 0,
      label: '在庫数の目視転記で数字を誤っている',
      kind: IssueNodeKind.HYPOTHESIS,
    },
  });
  const ntVerA1 = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntHypA1.id, depth: 3, order: 0,
      label: '直近3ヶ月の発注ミス31件を原因別に分類する',
      kind: IssueNodeKind.VERIFICATION,
    },
  });
  await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntVerA1.id, depth: 4, order: 0,
      label: '31件中20件（65%）が転記起因 → 主因と確定',
      kind: IssueNodeKind.RESULT,
      verification: NodeVerification.CONFIRMED,
      evidence: '発注台帳と基幹システム在庫履歴の突合（2026年3〜5月分）',
    },
  });
  const ntHypA2 = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntPointA.id, depth: 2, order: 1,
      label: 'FAX送信後の到達確認が漏れている',
      kind: IssueNodeKind.HYPOTHESIS,
    },
  });
  const ntVerA2 = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntHypA2.id, depth: 3, order: 0,
      label: 'FAX送信記録と仕入先の受領確認を突合する',
      kind: IssueNodeKind.VERIFICATION,
    },
  });
  await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntVerA2.id, depth: 4, order: 0,
      label: '未達は31件中2件のみ → 主因ではない',
      kind: IssueNodeKind.RESULT,
      verification: NodeVerification.REJECTED,
      evidence: 'FAX送信ログと仕入先5社への聞き取り',
    },
  });
  const ntPointB = await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntRoot.id, depth: 1, order: 1,
      label: '発注量の決め方に問題があるのか',
      kind: IssueNodeKind.POINT,
    },
  });
  await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntPointB.id, depth: 2, order: 0,
      label: '勘と経験頼みで需要変動に追従できていない',
      kind: IssueNodeKind.HYPOTHESIS,
      verification: NodeVerification.NEEDS_HEARING,
      evidence: '担当者交代月（4月）にミスが2倍に増加している点は示唆的',
    },
  });
  await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntRoot.id, depth: 1, order: 2,
      label: '未来ERPの在庫データ連携で転記作業そのものを廃止する',
      kind: IssueNodeKind.COUNTERMEASURE,
      recommendation: NodeRecommendation.ADOPT,
      evidence: '転記起因20件/月をゼロ化できる見込み。GAP-1と対応。',
    },
  });
  await prisma.issueNode.create({
    data: {
      treeId: tree.id, parentId: ntRoot.id, depth: 1, order: 3,
      label: '発注書のダブルチェック体制を強化する',
      kind: IssueNodeKind.COUNTERMEASURE,
      recommendation: NodeRecommendation.HOLD,
      evidence: '工数増のわりに転記起因の根本解決にならないため保留',
    },
  });
  console.log('  ✅ Issue tree created (ISSUE_POINT, ノード12)');

  // =============================================
  // 10. ステークホルダー（内部3・外部3）＋ RACI
  // =============================================
  const stTanaka = await prisma.stakeholder.create({
    data: {
      projectId: project.id,
      name: '田中 誠',
      affiliation: 'グリーンファクトリー食品 購買部',
      role: '購買部長（プロジェクトオーナー）',
      side: 'INTERNAL',
      influence: '高',
      support: '支持',
      interest: '発注ミス削減と購買部の残業時間削減',
      concern: '繁忙期とトライアルが重なり現場が回らなくなること',
      engagement: '週次定例で意思決定を仰ぐ。重要論点は事前に1on1で握る。',
      reportFrequency: '週次',
      contactMethod: '対面・チャット',
      order: 0,
    },
  });
  const stSato = await prisma.stakeholder.create({
    data: {
      projectId: project.id,
      name: '佐藤 美咲',
      affiliation: 'グリーンファクトリー食品 購買部',
      role: '発注担当（キーユーザー）',
      side: 'INTERNAL',
      influence: '中',
      support: '支持',
      interest: '転記・FAX作業からの解放。新システムの操作習熟。',
      concern: '並行運用期間の作業負荷',
      asisHearing: '発注業務の一連の流れと暗黙知（最小ロット・納期の癖）のヒアリング元',
      reportFrequency: '週次',
      contactMethod: 'チャット',
      order: 1,
    },
  });
  const stWatanabe = await prisma.stakeholder.create({
    data: {
      projectId: project.id,
      name: '渡辺 剛',
      affiliation: 'グリーンファクトリー食品 経営企画',
      role: '取締役（スポンサー）',
      side: 'INTERNAL',
      influence: '高',
      support: '中立',
      interest: '投資対効果（ROI）と全社展開の可能性',
      concern: '導入コストの超過。効果が数字で示せるか。',
      engagement: '月次レビューでROI見込みを定量報告し支持へ引き上げる',
      reportFrequency: '月次',
      contactMethod: '会議体・資料',
      order: 2,
    },
  });
  const stTakahashi = await prisma.stakeholder.create({
    data: {
      projectId: project.id,
      name: '高橋 健',
      affiliation: '株式会社IPLoT',
      role: 'ITコンサルタント（PM）',
      side: 'EXTERNAL',
      influence: '高',
      support: '支持',
      interest: 'プロジェクトの成功と手法（Ph.0-7パイプライン）の定着',
      engagement: '週次定例のファシリテーションと成果物レビュー',
      reportFrequency: '週次',
      contactMethod: 'オンライン会議・チャット',
      order: 3,
    },
  });
  const stYamamoto = await prisma.stakeholder.create({
    data: {
      projectId: project.id,
      name: '山本 玲奈',
      affiliation: '未来ERP株式会社',
      role: '導入支援コンサル（ベンダー）',
      side: 'EXTERNAL',
      influence: '中',
      support: '支持',
      interest: '標準機能の範囲での導入（カスタマイズ最小化）',
      concern: '基幹システム側の連携仕様が開示されないこと',
      reportFrequency: '隔週',
      contactMethod: 'オンライン会議',
      order: 4,
    },
  });
  const stNakamura = await prisma.stakeholder.create({
    data: {
      projectId: project.id,
      name: '中村 浩二',
      affiliation: '北海道フーズ（主要仕入先）',
      role: '営業担当',
      side: 'EXTERNAL',
      influence: '低',
      support: '反対',
      interest: '現行のFAX運用の継続（社内にEDI担当がいない）',
      concern: 'EDI対応のコスト負担',
      engagement: 'EDI移行のメリット（誤発注減・即時確認）を説明し、移行期間はFAX併用を提示',
      reportFrequency: '随時',
      contactMethod: '電話・訪問',
      order: 5,
    },
  });

  await prisma.stakeholderSubProject.createMany({
    data: [
      { stakeholderId: stTanaka.id, subProjectId: spProcurement.id, raci: 'A' },
      { stakeholderId: stTanaka.id, subProjectId: spOrdering.id, raci: 'A' },
      { stakeholderId: stSato.id, subProjectId: spOrdering.id, raci: 'R' },
      { stakeholderId: stSato.id, subProjectId: spInspection.id, raci: 'R' },
      { stakeholderId: stWatanabe.id, subProjectId: spProcurement.id, raci: 'I' },
      { stakeholderId: stTakahashi.id, subProjectId: spProcurement.id, raci: 'C' },
      { stakeholderId: stTakahashi.id, subProjectId: spInventory.id, raci: 'C' },
      { stakeholderId: stYamamoto.id, subProjectId: spInventory.id, raci: 'C' },
      { stakeholderId: stNakamura.id, subProjectId: spOrdering.id, raci: 'I' },
    ],
  });
  console.log('  ✅ Stakeholders created (内部3・外部3) + RACI 9件');

  // =============================================
  // 11. 会議体（週次定例・月次レビュー）
  // =============================================
  const mtgWeekly = await prisma.meeting.create({
    data: {
      projectId: project.id,
      name: '発注DX週次定例',
      purpose: '進捗共有・課題の早期検知・現場の困りごと吸い上げ',
      frequency: '週次',
      dayTime: '毎週火曜 10:00-10:30',
      format: 'オンライン',
      durationMinutes: 30,
      locationUrl: 'https://meet.example.com/hacchu-dx-weekly',
      ownerStakeholderId: stTakahashi.id,
      requiredAttendees: '田中（購買部長）・佐藤（発注担当）・高橋（IPLoT）',
      optionalAttendees: '山本（未来ERP）・倉庫リーダー',
      agendaTemplate: '1. 先週のタスク消化状況\n2. 今週の予定\n3. 課題・リスク\n4. 決定事項の確認',
      preMaterials: 'タスク一覧（本ツール）・リスク登録簿',
      minutesOwner: '佐藤 美咲',
      decisionMaker: '田中 誠',
      status: 'ACTIVE',
      goal: '課題を1週間以上滞留させない。決定事項と宿題を毎回確定させる。',
      order: 0,
      stakeholders: {
        create: [
          { stakeholderId: stTanaka.id },
          { stakeholderId: stSato.id },
          { stakeholderId: stTakahashi.id },
          { stakeholderId: stYamamoto.id },
        ],
      },
      subProjects: {
        create: [{ subProjectId: spProcurement.id }],
      },
    },
  });
  const mtgMonthly = await prisma.meeting.create({
    data: {
      projectId: project.id,
      name: '月次ステアリングレビュー',
      purpose: '経営層への進捗・ROI報告と投資判断（ゲートレビュー）',
      frequency: '月次',
      dayTime: '最終金曜 15:00-16:00',
      format: 'ハイブリッド',
      durationMinutes: 60,
      ownerStakeholderId: stWatanabe.id,
      requiredAttendees: '渡辺（取締役）・田中（購買部長）・高橋（IPLoT）',
      optionalAttendees: '山本（未来ERP）',
      agendaTemplate: '1. マイルストーン進捗\n2. 予算消化\n3. リスクトップ5\n4. 次月のゲート判定',
      minutesOwner: '高橋 健',
      decisionMaker: '渡辺 剛',
      status: 'ACTIVE',
      goal: 'フェーズゲートの通過判定と予算執行の承認',
      order: 1,
      stakeholders: {
        create: [
          { stakeholderId: stWatanabe.id },
          { stakeholderId: stTanaka.id },
          { stakeholderId: stTakahashi.id },
        ],
      },
      subProjects: {
        create: [
          { subProjectId: spProcurement.id },
          { subProjectId: spInventory.id },
        ],
      },
    },
  });
  console.log('  ✅ Meetings created (週次定例・月次レビュー) + 対象SH/領域');

  // =============================================
  // 12. リスク（RBSカテゴリ → リスク5件）
  // =============================================
  // RBS初期カテゴリ（GET時の冪等シードと同一内容を先に投入）
  const DEFAULT_RISK_CATEGORIES: { name: string; order: number }[] = [
    { name: '技術', order: 0 },
    { name: '外部（市場・法規制・ベンダー）', order: 1 },
    { name: '組織（体制・リソース）', order: 2 },
    { name: 'プロジェクト管理', order: 3 },
    { name: 'スケジュール', order: 4 },
    { name: 'コスト', order: 5 },
    { name: '品質', order: 6 },
    { name: 'スコープ', order: 7 },
    { name: 'ステークホルダー', order: 8 },
    { name: 'セキュリティ', order: 9 },
  ];
  const riskCategories = new Map<string, string>();
  for (const def of DEFAULT_RISK_CATEGORIES) {
    const existing = await prisma.riskCategory.findUnique({
      where: { projectId_name: { projectId: project.id, name: def.name } },
    });
    const cat =
      existing ??
      (await prisma.riskCategory.create({
        data: { projectId: project.id, name: def.name, order: def.order },
      }));
    riskCategories.set(def.name, cat.id);
  }

  const risk1 = await prisma.risk.create({
    data: {
      projectId: project.id,
      code: 'R-01',
      type: 'リスク',
      event: '基幹システムの在庫テーブル仕様が開示されず、連携IF設計が遅延する',
      causeCategory: '技術',
      categoryId: riskCategories.get('技術'),
      subProjectId: spInventory.id,
      ownerStakeholderId: stTakahashi.id,
      reviewMeetingId: mtgWeekly.id,
      probabilityScore: 4,
      impactScore: 4,
      riskType: 'THREAT',
      strategy: '軽減',
      responsePlan: '保守ベンダーへの仕様開示依頼を6月中に発出。並行してDB直接参照のPoCを実施。',
      contingencyPlan: '開示が7月末までに得られない場合はCSV夜間出力の暫定連携で先行する',
      trigger: '7月第2週時点で仕様書が未入手',
      countermeasure: '保守ベンダーとのNDA締結と仕様開示依頼（書面）',
      deadline: '2026-07-31',
      needsMtg: '要',
      status: '対応中',
      lifecycle: 'RESPONDING',
      order: 0,
    },
  });
  const risk2 = await prisma.risk.create({
    data: {
      projectId: project.id,
      code: 'R-02',
      type: 'リスク',
      event: '商品マスタの重複・表記ゆれにより移行データのクレンジング工数が膨らむ',
      causeCategory: '情報',
      categoryId: riskCategories.get('品質'),
      subProjectId: spOrdering.id,
      ownerStakeholderId: stSato.id,
      reviewMeetingId: mtgWeekly.id,
      probabilityScore: 3,
      impactScore: 4,
      riskType: 'THREAT',
      strategy: '軽減',
      responsePlan: '7月中にマスタの重複調査を実施し、クレンジング工数を見積もる',
      trigger: '重複率が10%を超えた場合は移行計画を見直す',
      deadline: '2026-08-15',
      needsMtg: '要',
      status: '分析中',
      lifecycle: 'ANALYZED',
      order: 1,
    },
  });
  await prisma.risk.create({
    data: {
      projectId: project.id,
      code: 'R-03',
      type: 'ボトルネック',
      event: '繁忙期（9月）と並行運用が重なり、購買部の工数が不足する',
      causeCategory: '人',
      categoryId: riskCategories.get('組織（体制・リソース）'),
      subProjectId: spOrdering.id,
      ownerStakeholderId: stTanaka.id,
      reviewMeetingId: mtgMonthly.id,
      probabilityScore: 4,
      impactScore: 3,
      riskType: 'THREAT',
      strategy: '回避',
      responsePlan: 'トライアル対象を主要5品目に絞り、全品目展開は10月に後ろ倒しする案を月次レビューで決定',
      deadline: '2026-08-31',
      needsMtg: '要',
      mtgDate: '2026-08-28',
      status: '対応中',
      lifecycle: 'RESPONDING',
      order: 2,
    },
  });
  await prisma.risk.create({
    data: {
      projectId: project.id,
      code: 'R-04',
      type: 'リスク',
      event: '主要仕入先（6社）がEDI接続に対応できず、FAX運用が残存する',
      causeCategory: '外部',
      categoryId: riskCategories.get('外部（市場・法規制・ベンダー）'),
      subProjectId: spOrdering.id,
      ownerStakeholderId: stYamamoto.id,
      reviewMeetingId: mtgMonthly.id,
      probabilityScore: 2,
      impactScore: 4,
      riskType: 'THREAT',
      strategy: '受容',
      responsePlan: '未対応先はシステムからのFAX自動送信で代替（手作業は発生させない）',
      deadline: '2026-09-30',
      needsMtg: '不要',
      status: '監視中',
      lifecycle: 'MONITORING',
      order: 3,
    },
  });
  await prisma.risk.create({
    data: {
      projectId: project.id,
      code: 'R-05',
      type: 'リスク',
      event: '需要予測の精度向上により、欠品率を現状3%→1%へ改善できる可能性',
      causeCategory: '技術',
      categoryId: riskCategories.get('技術'),
      subProjectId: spInventory.id,
      ownerStakeholderId: stWatanabe.id,
      reviewMeetingId: mtgMonthly.id,
      probabilityScore: 3,
      impactScore: 4,
      riskType: 'OPPORTUNITY',
      strategy: '活用',
      responsePlan: '過去2年分の実績で予測精度を検証し、効果見込みを月次レビューで報告する',
      deadline: '2026-09-30',
      needsMtg: '不要',
      status: '分析中',
      lifecycle: 'ANALYZED',
      order: 4,
    },
  });
  console.log('  ✅ Risks created (5件: 脅威4・好機1, P×I散らし)');

  // =============================================
  // 13. タスク（親3＋子8、依存3本、マイルストーン、リスク対応）
  // =============================================
  const taskP1 = await prisma.task.create({
    data: {
      projectId: project.id,
      title: '現状調査・GAP分析',
      description: '購買部ヒアリング〜ASISフロー作成〜GAP整理までの現状把握フェーズ',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeName: '高橋 健（IPLoT）',
      startDate: new Date('2026-06-01'),
      dueDate: new Date('2026-06-30'),
      progress: 70,
      category: '調査',
      order: 0,
    },
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP1.id,
      title: '購買部ヒアリング（発注業務の現状把握）',
      status: TaskStatus.RESOLVED,
      priority: TaskPriority.HIGH,
      assigneeName: '高橋 健（IPLoT）',
      assigneeRoleId: rolePurchasing.id,
      startDate: new Date('2026-06-01'),
      dueDate: new Date('2026-06-10'),
      progress: 100,
      estimatedHours: 12,
      actualHours: 14,
      category: '調査',
      order: 0,
    },
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP1.id,
      title: 'ASIS業務フロー作成・関係者レビュー',
      status: TaskStatus.RESOLVED,
      priority: TaskPriority.MEDIUM,
      assigneeName: '高橋 健（IPLoT）',
      startDate: new Date('2026-06-05'),
      dueDate: new Date('2026-06-15'),
      progress: 100,
      estimatedHours: 16,
      actualHours: 12,
      category: '調査',
      order: 1,
    },
  });
  const taskGapAnalysis = await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP1.id,
      title: 'GAP分析と課題の優先順位付け',
      description: 'ASIS/TOBEの差分を台帳化し、Q/P2/P3のロードマップへ振り分ける',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeName: '高橋 健（IPLoT）',
      startDate: new Date('2026-06-16'),
      dueDate: new Date('2026-06-30'),
      progress: 60,
      estimatedHours: 20,
      category: '分析',
      order: 2,
    },
  });

  const taskP2 = await prisma.task.create({
    data: {
      projectId: project.id,
      title: '未来ERP導入準備',
      description: '要件定義・連携IF設計・マスタ移行計画の策定',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeName: '田中 誠',
      startDate: new Date('2026-07-01'),
      dueDate: new Date('2026-08-31'),
      progress: 20,
      category: '導入',
      order: 1,
    },
  });
  const taskReqDoc = await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP2.id,
      title: '要件定義書の作成・承認',
      description: 'TOBEフローと GAP 台帳を入力に要件定義書をまとめ、月次レビューで承認を得る',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeName: '高橋 健（IPLoT）',
      startDate: new Date('2026-07-01'),
      dueDate: new Date('2026-07-22'),
      progress: 40,
      estimatedHours: 40,
      milestone: '要件定義承認（7/31 月次レビュー）',
      category: '導入',
      order: 0,
    },
  });
  const taskIfDesign = await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP2.id,
      title: '在庫データ連携IFの設計',
      description: '基幹システム→未来ERPの夜間連携IF。R-01（仕様未開示）に注意。',
      status: TaskStatus.OPEN,
      priority: TaskPriority.HIGH,
      assigneeName: '山本 玲奈（未来ERP）',
      startDate: new Date('2026-07-15'),
      dueDate: new Date('2026-08-15'),
      progress: 0,
      estimatedHours: 32,
      category: '導入',
      order: 1,
    },
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP2.id,
      title: 'マスタデータ移行計画の策定（重複クレンジング含む）',
      description: '商品・仕入先マスタの重複調査とクレンジング計画。リスク R-02 の対応タスク。',
      status: TaskStatus.OPEN,
      priority: TaskPriority.MEDIUM,
      assigneeName: '佐藤 美咲',
      assigneeRoleId: rolePurchasing.id,
      riskId: risk2.id,
      startDate: new Date('2026-08-01'),
      dueDate: new Date('2026-08-31'),
      progress: 0,
      estimatedHours: 24,
      category: '導入',
      order: 2,
    },
  });

  const taskP3 = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'トライアル運用・教育',
      description: '購買部トレーニングと主要5品目での並行運用トライアル',
      status: TaskStatus.OPEN,
      priority: TaskPriority.MEDIUM,
      assigneeName: '田中 誠',
      startDate: new Date('2026-09-01'),
      dueDate: new Date('2026-09-30'),
      progress: 0,
      category: 'トライアル',
      order: 2,
    },
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP3.id,
      title: '購買部向け操作トレーニング',
      status: TaskStatus.OPEN,
      priority: TaskPriority.MEDIUM,
      assigneeName: '山本 玲奈（未来ERP）',
      assigneeRoleId: rolePurchasing.id,
      startDate: new Date('2026-09-01'),
      dueDate: new Date('2026-09-12'),
      progress: 0,
      estimatedHours: 8,
      category: 'トライアル',
      order: 0,
    },
  });
  const taskTrial = await prisma.task.create({
    data: {
      projectId: project.id,
      parentId: taskP3.id,
      title: '発注業務の並行運用トライアル（主要5品目）',
      description: '現行FAX運用と未来ERP発注を2週間並行運用し、発注精度と工数を比較測定する',
      status: TaskStatus.OPEN,
      priority: TaskPriority.HIGH,
      assigneeName: '佐藤 美咲',
      assigneeRoleId: rolePurchasing.id,
      startDate: new Date('2026-09-08'),
      dueDate: new Date('2026-09-30'),
      progress: 0,
      estimatedHours: 40,
      category: 'トライアル',
      order: 1,
    },
  });

  await prisma.taskDependency.createMany({
    data: [
      { predecessorId: taskGapAnalysis.id, successorId: taskReqDoc.id },
      { predecessorId: taskReqDoc.id, successorId: taskIfDesign.id },
      { predecessorId: taskIfDesign.id, successorId: taskTrial.id },
    ],
  });
  console.log('  ✅ Tasks created (親3＋子8, 依存3本, マイルストーン1, リスク対応1)');

  // =============================================
  // 14. 報告カレンダー・関心ごとマトリクス
  // =============================================
  await prisma.reportCalendar.createMany({
    data: [
      {
        projectId: project.id,
        stakeholderId: stWatanabe.id,
        meetingId: mtgMonthly.id,
        reportContent: '進捗サマリ・リスクトップ5・予算消化率・ROI見込み',
        frequency: '月次',
        dayTime: '最終金曜 15:00',
        format: '対面報告＋資料',
        medium: 'PowerPoint',
        drafter: '高橋 健（IPLoT）',
        approver: '田中 誠',
        templateRef: 'ステアリングレビュー報告テンプレ v2',
        order: 0,
      },
      {
        projectId: project.id,
        stakeholderId: stTanaka.id,
        meetingId: mtgWeekly.id,
        reportContent: '週次進捗・課題/依頼事項・今週の決定が必要な論点',
        frequency: '週次',
        dayTime: '火曜 10:00',
        format: '口頭＋ダッシュボード',
        medium: '本ツール（タスク/リスク画面）',
        drafter: '佐藤 美咲',
        approver: '高橋 健（IPLoT）',
        order: 1,
      },
    ],
  });

  await prisma.interestMatrixRow.createMany({
    data: [
      {
        projectId: project.id,
        phase: '現状把握（Ph.1-2）',
        duration: '2026/06',
        mainMeetings: '週次定例',
        fieldStaff: 'ヒアリング負担への配慮。業務を悪者にしない聞き方。',
        clientPm: '調査の網羅性とスケジュール遵守',
        executive: '投資判断材料（効果見込み）の早期提示',
        order: 0,
      },
      {
        projectId: project.id,
        phase: '要件定義（Ph.6）',
        duration: '2026/07-08',
        mainMeetings: '週次定例・IF設計分科会',
        fieldStaff: '新業務で自分の仕事がどう変わるか',
        clientPm: 'スコープ確定とベンダー間の調整',
        executive: 'カスタマイズ費用の抑制とゲート判定',
        order: 1,
      },
      {
        projectId: project.id,
        phase: 'トライアル（Ph.7）',
        duration: '2026/09',
        mainMeetings: '月次レビュー・朝会',
        fieldStaff: '並行運用の作業負荷と操作の習熟',
        clientPm: '効果測定（発注ミス件数・工数）の確実な取得',
        executive: '全品目展開・全社展開の判断材料',
        order: 2,
      },
    ],
  });
  console.log('  ✅ ReportCalendar (2件) + InterestMatrix (3件) created');

  // =============================================
  // 15. プロジェクト憲章
  // =============================================
  await prisma.projectCharter.create({
    data: {
      projectId: project.id,
      background:
        '発注業務は在庫の目視転記・Excel算定・FAX送信という手作業の連鎖で、発注ミスが月10件発生している。' +
        '担当者の高齢化と属人化により、現状のままでは業務継続リスクが高まっている。',
      purpose:
        '未来ERP導入により転記・FAX・二重入力を廃止し、需要予測ベースの発注業務へ転換する。' +
        '発注ミスを月10件から2件以下へ削減し、購買部の発注関連工数を40%削減する。',
      successCriteria:
        '①発注ミス 月2件以下（2027年3月時点） ②発注関連工数 40%削減 ③欠品率 3%→1.5%以下。' +
        'トライアル（2026年9月）で効果測定し、月次レビューで全品目展開を判定する。',
      scopeIn: '調達（発注・検収）・在庫領域の業務とシステム。主要仕入先30社とのEDI接続。',
      scopeOut: '販売領域のSFA導入、生産計画システムとの連携（次期フェーズ）。',
      budgetNote: '初期導入費 1,800万円＋年間保守 240万円（承認済み枠 2,500万円）',
      approverStakeholderId: stWatanabe.id,
      sponsorStakeholderId: stTanaka.id,
    },
  });
  console.log('  ✅ ProjectCharter created');

  // =============================================
  // 16. 制約・前提条件（Constraint）
  // =============================================
  await prisma.constraint.createMany({
    data: [
      {
        projectId: project.id,
        subProjectId: spInventory.id,
        title: '基幹システムは外部連携IFを標準で持たない',
        description:
          '在庫照会は画面参照のみでCSV出力もできない。連携には保守ベンダーへの個別開発依頼が必要で、仕様開示にも時間がかかる。',
        category: '技術',
        kind: 'CONSTRAINT',
        order: 0,
      },
      {
        projectId: project.id,
        subProjectId: spProcurement.id,
        title: '導入予算は承認済み枠2,500万円が上限',
        description:
          '初期1,800万円＋年間保守240万円が前提。超過する場合は取締役会での再承認が必要。',
        category: 'コスト',
        kind: 'CONSTRAINT',
        order: 1,
      },
      {
        projectId: project.id,
        subProjectId: spOrdering.id,
        title: '繁忙期（9月）は購買部の追加工数を確保できない',
        description:
          '繁忙期は現行業務で手一杯。トライアルは主要5品目に限定し、全品目展開は10月以降とする。',
        category: '組織',
        kind: 'CONSTRAINT',
        order: 2,
      },
      {
        projectId: project.id,
        subProjectId: spOrdering.id,
        title: '主要仕入先30社のうち24社はEDI対応可能と見込む',
        description:
          '事前ヒアリングベースの前提。残り6社はEDI未対応のため、システムからのFAX自動送信で代替する想定。',
        category: '外部',
        kind: 'ASSUMPTION',
        order: 3,
      },
      {
        projectId: project.id,
        subProjectId: spOrdering.id,
        title: '需要予測は過去2年分の実績データが利用可能であることを前提とする',
        description:
          '基幹システムに2年分の発注・販売実績が蓄積されている前提。欠損があればクレンジングが必要。',
        category: '情報',
        kind: 'ASSUMPTION',
        order: 4,
      },
    ],
  });
  console.log('  ✅ Constraints created (制約3・前提2)');

  // =============================================
  // 17. オブジェクト関係性マップ（DataObject / Relation / Annotation）
  // =============================================
  const objSupplier = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spOrdering.id,
      name: '仕入先', description: '原材料・資材を供給する取引先（約30社）',
      color: '#3B82F6', positionX: 80, positionY: 80, order: 0,
    },
  });
  const objProduct = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spOrdering.id,
      name: '商品', description: '発注対象の原材料・資材マスタ',
      color: '#8B5CF6', positionX: 360, positionY: 80, order: 1,
    },
  });
  const objOrder = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spOrdering.id,
      name: '発注', description: '仕入先への発注（ヘッダ）。発注番号・発注日・仕入先を持つ',
      color: '#F59E0B', positionX: 360, positionY: 300, order: 2,
    },
  });
  const objOrderLine = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spOrdering.id,
      name: '発注明細', description: '発注に紐づく商品ごとの明細（数量・単価）',
      color: '#F97316', positionX: 640, positionY: 300, order: 3,
    },
  });
  const objStock = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spInventory.id,
      name: '在庫', description: '品目別の現在庫数（基幹システムが保持）',
      color: '#10B981', positionX: 640, positionY: 80, order: 4,
    },
  });
  const objReceiving = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spInspection.id,
      name: '入荷', description: '入荷実績（納品書照合・検収結果を含む）',
      color: '#14B8A6', positionX: 920, positionY: 300, order: 5,
    },
  });
  const objDeliveryNote = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spInspection.id,
      name: '納品書', description: '仕入先から入荷時に受領する帳票',
      color: '#06B6D4', positionX: 920, positionY: 80, order: 6,
    },
  });
  const objForecast = await prisma.dataObject.create({
    data: {
      projectId: project.id, subProjectId: spSales.id,
      name: '需要予測', description: '受注見込みと実績から算出する品目別の需要予測',
      color: '#EC4899', positionX: 80, positionY: 300, order: 7,
    },
  });

  await prisma.dataObjectRelation.createMany({
    data: [
      {
        projectId: project.id, sourceObjectId: objSupplier.id, targetObjectId: objProduct.id,
        cardinality: RelationCardinality.ONE_TO_MANY, label: '供給する', pathStyle: 'bezier',
      },
      {
        projectId: project.id, sourceObjectId: objSupplier.id, targetObjectId: objOrder.id,
        cardinality: RelationCardinality.ONE_TO_MANY, label: '発注先', pathStyle: 'bezier',
      },
      {
        projectId: project.id, sourceObjectId: objOrder.id, targetObjectId: objOrderLine.id,
        cardinality: RelationCardinality.ONE_TO_MANY, label: '明細を持つ',
      },
      {
        projectId: project.id, sourceObjectId: objProduct.id, targetObjectId: objOrderLine.id,
        cardinality: RelationCardinality.ONE_TO_MANY, label: '対象商品', pathStyle: 'bezier',
      },
      {
        projectId: project.id, sourceObjectId: objProduct.id, targetObjectId: objStock.id,
        cardinality: RelationCardinality.ONE_TO_ONE, label: '在庫を持つ',
      },
      {
        projectId: project.id, sourceObjectId: objOrder.id, targetObjectId: objReceiving.id,
        cardinality: RelationCardinality.ONE_TO_MANY, label: '入荷で消し込む', pathStyle: 'bezier',
      },
      {
        projectId: project.id, sourceObjectId: objReceiving.id, targetObjectId: objDeliveryNote.id,
        cardinality: RelationCardinality.ONE_TO_ONE, label: '納品書で照合',
      },
      {
        projectId: project.id, sourceObjectId: objForecast.id, targetObjectId: objProduct.id,
        cardinality: RelationCardinality.ONE_TO_ONE, label: '予測対象', pathStyle: 'bezier',
      },
    ],
  });

  // SCOPE 囲み（発注領域）＋ STICKY 付箋
  await prisma.dataObjectAnnotation.create({
    data: {
      projectId: project.id, kind: FlowAnnotationKind.SCOPE,
      text: '発注スコープ（仕入先〜発注明細）',
      subProjectId: spOrdering.id,
      positionX: 40, positionY: 40, width: 820, height: 460,
      color: '#3B82F6', borderStyle: 'dashed', fillOpacity: 0.06,
      order: 0,
    },
  });
  await prisma.dataObjectAnnotation.create({
    data: {
      projectId: project.id, kind: FlowAnnotationKind.STICKY,
      text: '「在庫」は基幹システム保持。未来ERPへ夜間連携して発注案算出に使う（GAP-1）',
      positionX: 640, positionY: 180, width: 240, height: 90,
      color: '#FEF08A', order: 1,
    },
  });
  console.log('  ✅ DataObjects created (8) + Relations (8) + Annotations (SCOPE 1 / STICKY 1)');

  // =============================================
  // 18. DFD（第1レベル: flowId=null）＋ 第2レベル（発注業務に紐付け）
  // =============================================
  // --- 第1レベル DFD ---
  const dfd1 = await prisma.dfdDiagram.create({
    data: {
      projectId: project.id, flowId: null,
      title: '発注業務 DFD（第1レベル）',
      authorName: '高橋 健（IPLoT）', approverName: '田中 誠',
    },
  });
  const dExtSupplier = await prisma.dfdNode.create({
    data: { diagramId: dfd1.id, kind: DfdNodeKind.EXTERNAL_ENTITY, label: '仕入先', positionX: 60, positionY: 60 },
  });
  const dExtSales = await prisma.dfdNode.create({
    data: { diagramId: dfd1.id, kind: DfdNodeKind.EXTERNAL_ENTITY, label: '営業部', positionX: 60, positionY: 360 },
  });
  const dFnOrder = await prisma.dfdNode.create({
    data: { diagramId: dfd1.id, kind: DfdNodeKind.FUNCTION, label: '発注量を算定し発注する', number: '1.0', positionX: 380, positionY: 200 },
  });
  const dFnReceive = await prisma.dfdNode.create({
    data: { diagramId: dfd1.id, kind: DfdNodeKind.FUNCTION, label: '入荷を検収する', number: '2.0', positionX: 700, positionY: 360 },
  });
  const dStoreStock = await prisma.dfdNode.create({
    data: { diagramId: dfd1.id, kind: DfdNodeKind.DATA_STORE, label: '在庫', number: 'D1', dataObjectId: objStock.id, positionX: 380, positionY: 60 },
  });
  const dStoreOrder = await prisma.dfdNode.create({
    data: { diagramId: dfd1.id, kind: DfdNodeKind.DATA_STORE, label: '発注台帳', number: 'D2', dataObjectId: objOrder.id, positionX: 700, positionY: 120 },
  });

  await prisma.dfdFlow.createMany({
    data: [
      { diagramId: dfd1.id, sourceNodeId: dExtSales.id, targetNodeId: dFnOrder.id, dataItem: '受注見込みリスト', informationTypeId: infoSalesPlan.id, order: 0 },
      { diagramId: dfd1.id, sourceNodeId: dStoreStock.id, targetNodeId: dFnOrder.id, dataItem: '在庫数', informationTypeId: infoStock.id, order: 1 },
      { diagramId: dfd1.id, sourceNodeId: dFnOrder.id, targetNodeId: dExtSupplier.id, dataItem: '発注書', informationTypeId: infoOrderSheet.id, pathStyle: 'bezier', order: 2 },
      { diagramId: dfd1.id, sourceNodeId: dFnOrder.id, targetNodeId: dStoreOrder.id, dataItem: '発注実績', order: 3 },
      { diagramId: dfd1.id, sourceNodeId: dExtSupplier.id, targetNodeId: dFnReceive.id, dataItem: '納品書', informationTypeId: infoDeliveryNote.id, order: 4 },
      { diagramId: dfd1.id, sourceNodeId: dStoreOrder.id, targetNodeId: dFnReceive.id, dataItem: '発注内容', order: 5 },
      { diagramId: dfd1.id, sourceNodeId: dFnReceive.id, targetNodeId: dStoreStock.id, dataItem: '入荷数（在庫更新）', informationTypeId: infoInspectionResult.id, pathStyle: 'bezier', order: 6 },
    ],
  });
  await prisma.dfdAnnotation.create({
    data: {
      diagramId: dfd1.id, kind: FlowAnnotationKind.STICKY,
      text: '在庫(D1)への書き戻しが手作業。ここがTOBEで自動化される',
      positionX: 380, positionY: 480, width: 240, height: 80,
      color: '#FECACA', order: 0,
    },
  });

  // --- 第2レベル DFD（発注業務 1.0 の詳細。ASISフローに紐付け） ---
  const dfd2 = await prisma.dfdDiagram.create({
    data: {
      projectId: project.id, flowId: asisFlow.id,
      title: '発注量算定・発注 DFD（第2レベル / プロセス1.0）',
      authorName: '高橋 健（IPLoT）',
    },
  });
  const d2Sales = await prisma.dfdNode.create({
    data: { diagramId: dfd2.id, kind: DfdNodeKind.EXTERNAL_ENTITY, label: '営業部', positionX: 60, positionY: 60 },
  });
  const d2Supplier = await prisma.dfdNode.create({
    data: { diagramId: dfd2.id, kind: DfdNodeKind.EXTERNAL_ENTITY, label: '仕入先', positionX: 760, positionY: 360 },
  });
  const d2Calc = await prisma.dfdNode.create({
    data: { diagramId: dfd2.id, kind: DfdNodeKind.FUNCTION, label: '在庫確認・発注量を算定', number: '1.1', refFlowId: asisFlow.id, refNodeId: an5.id, positionX: 380, positionY: 120 },
  });
  const d2Issue = await prisma.dfdNode.create({
    data: { diagramId: dfd2.id, kind: DfdNodeKind.FUNCTION, label: '発注書を発行・送信', number: '1.2', refFlowId: asisFlow.id, refNodeId: an7.id, positionX: 380, positionY: 360 },
  });
  const d2StoreStock = await prisma.dfdNode.create({
    data: { diagramId: dfd2.id, kind: DfdNodeKind.DATA_STORE, label: '在庫', number: 'D1', dataObjectId: objStock.id, positionX: 60, positionY: 300 },
  });
  const d2StoreOrder = await prisma.dfdNode.create({
    data: { diagramId: dfd2.id, kind: DfdNodeKind.DATA_STORE, label: '発注台帳', number: 'D2', dataObjectId: objOrder.id, positionX: 760, positionY: 120 },
  });

  await prisma.dfdFlow.createMany({
    data: [
      { diagramId: dfd2.id, sourceNodeId: d2Sales.id, targetNodeId: d2Calc.id, dataItem: '受注見込みリスト', informationTypeId: infoSalesPlan.id, order: 0 },
      { diagramId: dfd2.id, sourceNodeId: d2StoreStock.id, targetNodeId: d2Calc.id, dataItem: '在庫数', informationTypeId: infoStock.id, order: 1 },
      { diagramId: dfd2.id, sourceNodeId: d2Calc.id, targetNodeId: d2Issue.id, dataItem: '発注量（確定）', order: 2 },
      { diagramId: dfd2.id, sourceNodeId: d2Issue.id, targetNodeId: d2Supplier.id, dataItem: '発注書（FAX）', informationTypeId: infoOrderSheet.id, pathStyle: 'bezier', order: 3 },
      { diagramId: dfd2.id, sourceNodeId: d2Issue.id, targetNodeId: d2StoreOrder.id, dataItem: '発注実績', order: 4 },
    ],
  });
  console.log('  ✅ DFD created (第1レベル: ノード6/フロー7/付箋1, 第2レベル: ノード6/フロー5)');

  // =============================================
  // 19. KPI（業務KPI 3 ＋ AI精度KPI 2）＋ 情報リンク
  // =============================================
  const kpiOrderMiss = await prisma.kpi.create({
    data: {
      projectId: project.id, category: KpiCategory.BUSINESS, flowId: tobeFlow.id,
      name: '発注ミス件数', description: '転記・数量誤り・送信漏れ等による発注ミスの月間件数',
      definition: '発注ミス件数 = 当月に発生した誤発注・欠品起因発注の件数',
      unit: '件/月', baselineValue: 10, targetValue: 2, currentValue: 8,
      direction: KpiDirection.DECREASE, frequency: KpiFrequency.MONTHLY,
      measurementMethod: '発注台帳と入荷実績の突合から誤発注を集計（購買部が月次でカウント）',
      ownerRoleId: rolePurchasing.id,
      smartSpecific: 5, smartMeasurable: 5, smartAchievable: 4, smartRelevant: 5, smartTimeBound: 4,
      smartComment: '定義・測定方法が明確で目標も妥当。期限を四半期で区切るとより良い。',
      status: KpiStatus.ACTIVE, order: 0,
    },
  });
  const kpiLeadHours = await prisma.kpi.create({
    data: {
      projectId: project.id, category: KpiCategory.BUSINESS, flowId: tobeFlow.id,
      name: '発注関連工数', description: '在庫転記・発注量算定・FAX送信・台帳入力にかかる週間工数',
      definition: '発注関連工数 = 購買部の発注業務に費やす週あたりの合計時間',
      unit: '時間/週', baselineValue: 14, targetValue: 8, currentValue: 13,
      direction: KpiDirection.DECREASE, frequency: KpiFrequency.WEEKLY,
      measurementMethod: '週次定例で購買部が作業時間を自己記録（タイムログ）',
      ownerRoleId: rolePurchasing.id,
      smartSpecific: 4, smartMeasurable: 4, smartAchievable: 4, smartRelevant: 5, smartTimeBound: 3,
      status: KpiStatus.ACTIVE, order: 1,
    },
  });
  const kpiStockout = await prisma.kpi.create({
    data: {
      projectId: project.id, category: KpiCategory.BUSINESS, flowId: tobeFlow.id,
      name: '欠品率', description: '需要に対し在庫切れで供給できなかった割合',
      definition: '欠品率 = 欠品発生品目日数 / 全品目日数',
      unit: '%', baselineValue: 3.0, targetValue: 1.5, currentValue: 2.8,
      direction: KpiDirection.DECREASE, frequency: KpiFrequency.MONTHLY,
      measurementMethod: '基幹システムの在庫履歴から欠品日数を抽出して算出',
      ownerRoleId: roleWarehouse.id,
      smartSpecific: 4, smartMeasurable: 5, smartAchievable: 3, smartRelevant: 5, smartTimeBound: 4,
      status: KpiStatus.ACTIVE, order: 2,
    },
  });
  const kpiForecastAcc = await prisma.kpi.create({
    data: {
      projectId: project.id, category: KpiCategory.AI_QUALITY, systemId: sysMiraiErp.id,
      name: '需要予測精度（MAPE）', description: '未来ERPの需要予測の平均絶対パーセント誤差',
      definition: 'MAPE = mean(|実績 - 予測| / 実績) ×100',
      unit: '%', baselineValue: 35, targetValue: 20, currentValue: 28,
      direction: KpiDirection.DECREASE, frequency: KpiFrequency.MONTHLY,
      measurementMethod: '主要5品目について予測値と実需要を月末に突合しMAPEを算出',
      ownerRoleId: roleMiraiErp.id,
      smartSpecific: 5, smartMeasurable: 5, smartAchievable: 3, smartRelevant: 5, smartTimeBound: 4,
      smartComment: 'AI精度の代表指標。達成可能性は学習データ量に依存するため要モニタリング。',
      aiGenerated: true, status: KpiStatus.ACTIVE, order: 3,
    },
  });
  const kpiAutoApprove = await prisma.kpi.create({
    data: {
      projectId: project.id, category: KpiCategory.AI_QUALITY, systemId: sysMiraiErp.id,
      name: '発注案 無修正承認率', description: 'AI生成の発注案が補正なしで承認された割合（AIの実用度指標）',
      definition: '無修正承認率 = 無修正承認された発注案 / 全発注案',
      unit: '%', baselineValue: 0, targetValue: 80, currentValue: 0,
      direction: KpiDirection.INCREASE, frequency: KpiFrequency.WEEKLY,
      measurementMethod: '承認ワークフローのログから補正有無を集計',
      ownerRoleId: rolePurchasing.id,
      smartSpecific: 4, smartMeasurable: 5, smartAchievable: 3, smartRelevant: 4, smartTimeBound: 3,
      aiGenerated: true, status: KpiStatus.DRAFT, order: 4,
    },
  });

  await prisma.kpiInformationLink.createMany({
    data: [
      { kpiId: kpiOrderMiss.id, informationTypeId: infoOrderSheet.id },
      { kpiId: kpiStockout.id, informationTypeId: infoStock.id },
      { kpiId: kpiForecastAcc.id, informationTypeId: infoForecast.id },
      { kpiId: kpiForecastAcc.id, informationTypeId: infoSalesPlan.id },
      { kpiId: kpiAutoApprove.id, informationTypeId: infoOrderSheet.id },
    ],
  });
  console.log('  ✅ KPIs created (業務3・AI精度2) + 情報リンク5');

  // =============================================
  // 20. 導入状況（AdoptionStatus: 段階を散らす）
  // =============================================
  await prisma.adoptionStatus.createMany({
    data: [
      {
        projectId: project.id, stakeholderId: stSato.id, systemId: sysMiraiErp.id,
        stage: 'TRAINED', nextAction: 'トライアル（主要5品目）で実発注を担当し操作を習熟する',
        lastContactAt: new Date('2026-06-10'), order: 0,
      },
      {
        projectId: project.id, stakeholderId: stTanaka.id, systemId: sysMiraiErp.id,
        stage: 'INFORMED', blockers: '承認ワークフローの権限設計が未確定',
        nextAction: '承認フローのデモを7月の週次定例で実施', lastContactAt: new Date('2026-06-12'), order: 1,
      },
      {
        projectId: project.id, stakeholderId: stWatanabe.id, systemId: sysMiraiErp.id,
        stage: 'NOT_STARTED', nextAction: '月次レビューでROI見込みを提示し関与を引き上げる', order: 2,
      },
      {
        projectId: project.id, stakeholderId: stNakamura.id, systemId: sysMiraiErp.id,
        stage: 'NOT_STARTED', blockers: 'EDI移行に難色。社内にEDI担当がいない',
        nextAction: 'FAX併用期間を提示しEDIメリットを再説明', order: 3,
      },
      {
        projectId: project.id, stakeholderId: stTakahashi.id, systemId: sysMiraiErp.id,
        stage: 'TRIAL', note: '導入支援側として一連の機能を検証中', order: 4,
      },
    ],
  });
  console.log('  ✅ AdoptionStatus created (5名 / 段階を散らし)');

  // =============================================
  // 21. ASISメモ / TOBEビジョン / TOBEロードマップ
  // =============================================
  await prisma.asisMemo.createMany({
    data: [
      {
        projectId: project.id, topic: '在庫確認',
        currentState: '基幹システムの照会画面を見ながらExcelへ手で転記',
        pain: '転記ミスが月3〜5件。確認に45分/回かかる',
        restriction: '基幹システムにCSV出力・連携IFがない', order: 0,
      },
      {
        projectId: project.id, topic: '発注量算定',
        currentState: '見込み・在庫・最小ロットを担当者が勘案して決定',
        pain: '属人化。担当交代月にミスが2倍に増加',
        restriction: '最小ロット・納期の癖が形式知化されていない', order: 1,
      },
      {
        projectId: project.id, topic: '発注書送信',
        currentState: '発注書を印刷しFAXで仕入先ごとに送信。控えは紙保管',
        pain: '送達確認が属人化。担当不在時に発注状況が不明',
        restriction: '一部仕入先がFAXのみ対応', order: 2,
      },
      {
        projectId: project.id, topic: '発注実績の登録',
        currentState: 'FAX済み内容を基幹システムへ再入力（二重入力）',
        pain: '入力漏れ・週5時間のムダ', restriction: '基幹側に取込IFがない', order: 3,
      },
    ],
  });

  const visionOrder = await prisma.tobeVision.create({
    data: {
      projectId: project.id, subProjectId: spOrdering.id, asisFlowId: asisFlow.id,
      area: '調達/発注',
      vision: '需要予測ベースで発注案が自動生成され、人は例外のみ補正する',
      countermeasure: '未来ERP導入。在庫夜間連携＋需要予測＋発注案自動生成＋EDI送信',
      effect: '発注ミス 月10件→2件、発注工数 40%削減', order: 0,
    },
  });
  const visionInventory = await prisma.tobeVision.create({
    data: {
      projectId: project.id, subProjectId: spInventory.id,
      area: '在庫',
      vision: '入出荷をリアルタイム記帳し、いつでも正確な在庫が分かる',
      countermeasure: 'ハンディ検品と循環棚卸への移行',
      effect: '期中在庫精度の向上、過剰在庫の削減', order: 1,
    },
  });
  const visionInspection = await prisma.tobeVision.create({
    data: {
      projectId: project.id, subProjectId: spInspection.id,
      area: '調達/検収',
      vision: '入荷予定データと検品結果をシステムで自動照合する',
      countermeasure: '発注データとの自動マッチング・差異の即時アラート',
      effect: '照合工数の削減、支払訂正の翌月ずれ込み解消', order: 2,
    },
  });

  await prisma.tobeRoadmap.createMany({
    data: [
      {
        projectId: project.id, subProjectId: spOrdering.id, tobeVisionId: visionOrder.id,
        phase: '3ヶ月以内 (Quick Win)', measure: '在庫データ連携IFの仕様確定とPoC',
        roi: '中', cost: '低', payback: '6ヶ月', scope: '主要5品目', order: 0,
      },
      {
        projectId: project.id, subProjectId: spOrdering.id, tobeVisionId: visionOrder.id,
        phase: '1年以内 (Phase2)', measure: '需要予測・発注案自動生成＋EDI送信の本稼働',
        roi: '高', cost: '中', payback: '14ヶ月', scope: '全品目・EDI対応24社', order: 1,
      },
      {
        projectId: project.id, subProjectId: spInventory.id, tobeVisionId: visionInventory.id,
        phase: '3年以内 (Phase3)', measure: 'ハンディ検品・循環棚卸への移行',
        roi: '中', cost: '中', payback: '24ヶ月', scope: '在庫領域全体', order: 2,
      },
      {
        projectId: project.id, subProjectId: spInspection.id, tobeVisionId: visionInspection.id,
        phase: '1年以内 (Phase2)', measure: '入荷予定データとの自動照合',
        roi: '中', cost: '低', payback: '10ヶ月', scope: '検収領域', order: 3,
      },
    ],
  });
  console.log('  ✅ AsisMemo (4) + TobeVision (3) + TobeRoadmap (4) created');

  // =============================================
  // 22. 分析（パレート / 感度 / ギャップ / 漏れ）
  // =============================================
  await prisma.analysisParetoRow.createMany({
    data: [
      { projectId: project.id, code: '転記ミス（在庫数の数え間違い）', count: '20', amount: '約40万円', order: 0 },
      { projectId: project.id, code: '発注量算定ミス（勘違い・桁ミス）', count: '6', amount: '約18万円', order: 1 },
      { projectId: project.id, code: '二重入力時の入力漏れ', count: '3', amount: '約9万円', order: 2 },
      { projectId: project.id, code: 'FAX送信漏れ・送り先誤り', count: '2', amount: '約6万円', order: 3 },
    ],
  });
  await prisma.analysisSensitivityRow.createMany({
    data: [
      { projectId: project.id, measure: '在庫データの自動連携（転記廃止）', stars: '★★★★★', difficulty: '中', order: 0 },
      { projectId: project.id, measure: '需要予測による発注案の自動生成', stars: '★★★★', difficulty: '高', order: 1 },
      { projectId: project.id, measure: 'EDIによる発注送信・台帳自動記帳', stars: '★★★★', difficulty: '中', order: 2 },
      { projectId: project.id, measure: '発注書のダブルチェック体制強化', stars: '★★', difficulty: '低', order: 3 },
    ],
  });
  await prisma.analysisGapRow.createMany({
    data: [
      { projectId: project.id, metric: '発注ミス率', self: '月10件', benchmark: '月2件（同業優良）', factor: '手作業の転記', contribution: '高', hasAction: '有（未来ERP）', order: 0 },
      { projectId: project.id, metric: '発注リードタイム', self: '中2日', benchmark: '中1日', factor: 'FAX・承認待ち', contribution: '中', hasAction: '有（EDI・電子承認）', order: 1 },
      { projectId: project.id, metric: '欠品率', self: '3%', benchmark: '1.5%', factor: '需要予測なし', contribution: '中', hasAction: '有（需要予測）', order: 2 },
    ],
  });
  await prisma.analysisLeakRow.createMany({
    data: [
      { projectId: project.id, stage: '受注見込み受領', passCount: '100%', hypothesis: '営業のExcel精度にばらつき', order: 0 },
      { projectId: project.id, stage: '在庫確認・転記', passCount: '95%', hypothesis: '転記時に5%程度の誤りが混入', order: 1 },
      { projectId: project.id, stage: '発注量算定', passCount: '92%', hypothesis: '属人判断で過不足が発生', order: 2 },
      { projectId: project.id, stage: '発注書送信・登録', passCount: '90%', hypothesis: 'FAX/二重入力で漏れが発生', order: 3 },
    ],
  });
  console.log('  ✅ Analysis rows created (パレート4・感度4・ギャップ3・漏れ4)');

  // =============================================
  // 23. CRUOA 情報の地図（ASISフロー1本分）
  // =============================================
  const cruoaColSales = await prisma.cruoaCol.create({
    data: { flowId: asisFlow.id, label: '営業部', roleId: roleSales.id, order: 0 },
  });
  const cruoaColPurchasing = await prisma.cruoaCol.create({
    data: { flowId: asisFlow.id, label: '購買部', roleId: rolePurchasing.id, order: 1 },
  });
  const cruoaColSystem = await prisma.cruoaCol.create({
    data: { flowId: asisFlow.id, label: '基幹システム', roleId: roleLegacySystem.id, order: 2 },
  });

  const cruoaRowData: { info: string; cells: Record<string, string> }[] = [
    {
      info: '受注見込みリスト',
      cells: { sales: 'C/U（週次更新）', purchasing: 'R（受領・参照）', system: '—' },
    },
    {
      info: '在庫データ',
      cells: { sales: '—', purchasing: 'R（照会・転記）', system: 'O（保持・更新）' },
    },
    {
      info: '発注書',
      cells: { sales: '—', purchasing: 'C（作成・FAX送信）', system: '—' },
    },
    {
      info: '発注台帳',
      cells: { sales: '—', purchasing: 'C（手入力）', system: 'O/A（保持・台帳）' },
    },
  ];
  for (let i = 0; i < cruoaRowData.length; i++) {
    const r = cruoaRowData[i];
    const row = await prisma.cruoaRow.create({
      data: { flowId: asisFlow.id, info: r.info, order: i },
    });
    await prisma.cruoaCell.createMany({
      data: [
        { rowId: row.id, colId: cruoaColSales.id, value: r.cells.sales },
        { rowId: row.id, colId: cruoaColPurchasing.id, value: r.cells.purchasing },
        { rowId: row.id, colId: cruoaColSystem.id, value: r.cells.system },
      ],
    });
  }
  console.log('  ✅ CRUOA created (列3 / 行4 / セル12, ASISフロー)');

  // =============================================
  // サマリー
  // =============================================
  const [
    subProjects,
    systems,
    roles,
    infoTypes,
    flows,
    nodes,
    edges,
    annotations,
    gaps,
    ledgers,
    treeNodes,
    stakeholders,
    meetings,
    risks,
    tasks,
    deps,
    reports,
    matrixRows,
    constraints,
    dataObjects,
    dataObjectRelations,
    dfdDiagrams,
    dfdNodes,
    dfdFlows,
    kpis,
    adoptionStatuses,
    asisMemos,
    tobeVisions,
    tobeRoadmaps,
    analysisRows,
    cruoaCells,
  ] = await Promise.all([
    prisma.subProject.count({ where: { projectId: project.id } }),
    prisma.system.count({ where: { projectId: project.id } }),
    prisma.role.count({ where: { projectId: project.id } }),
    prisma.informationType.count({ where: { projectId: project.id } }),
    prisma.businessFlow.count({ where: { projectId: project.id } }),
    prisma.flowNode.count({ where: { flow: { projectId: project.id } } }),
    prisma.flowEdge.count({ where: { flow: { projectId: project.id } } }),
    prisma.flowAnnotation.count({ where: { flow: { projectId: project.id } } }),
    prisma.gapItem.count({ where: { projectId: project.id } }),
    prisma.gapLedger.count({ where: { projectId: project.id } }),
    prisma.issueNode.count({ where: { tree: { projectId: project.id } } }),
    prisma.stakeholder.count({ where: { projectId: project.id } }),
    prisma.meeting.count({ where: { projectId: project.id } }),
    prisma.risk.count({ where: { projectId: project.id } }),
    prisma.task.count({ where: { projectId: project.id } }),
    prisma.taskDependency.count({
      where: { predecessor: { projectId: project.id } },
    }),
    prisma.reportCalendar.count({ where: { projectId: project.id } }),
    prisma.interestMatrixRow.count({ where: { projectId: project.id } }),
    prisma.constraint.count({ where: { projectId: project.id } }),
    prisma.dataObject.count({ where: { projectId: project.id } }),
    prisma.dataObjectRelation.count({ where: { projectId: project.id } }),
    prisma.dfdDiagram.count({ where: { projectId: project.id } }),
    prisma.dfdNode.count({ where: { diagram: { projectId: project.id } } }),
    prisma.dfdFlow.count({ where: { diagram: { projectId: project.id } } }),
    prisma.kpi.count({ where: { projectId: project.id } }),
    prisma.adoptionStatus.count({ where: { projectId: project.id } }),
    prisma.asisMemo.count({ where: { projectId: project.id } }),
    prisma.tobeVision.count({ where: { projectId: project.id } }),
    prisma.tobeRoadmap.count({ where: { projectId: project.id } }),
    Promise.all([
      prisma.analysisParetoRow.count({ where: { projectId: project.id } }),
      prisma.analysisSensitivityRow.count({ where: { projectId: project.id } }),
      prisma.analysisGapRow.count({ where: { projectId: project.id } }),
      prisma.analysisLeakRow.count({ where: { projectId: project.id } }),
    ]).then((arr) => arr.reduce((a, b) => a + b, 0)),
    prisma.cruoaCell.count({ where: { row: { flow: { projectId: project.id } } } }),
  ]);

  console.log('');
  console.log('🎉 Demo seed completed!');
  console.log('─'.repeat(50));
  console.log(`  Project        : ${project.name} (${project.id})`);
  console.log(`  領域(SubProject): ${subProjects} / システム: ${systems} / ロール: ${roles}`);
  console.log(`  情報種別        : ${infoTypes}`);
  console.log(`  業務フロー      : ${flows} (ノード ${nodes} / エッジ ${edges} / 付箋 ${annotations})`);
  console.log(`  GAP            : ${gaps} (台帳 ${ledgers})`);
  console.log(`  課題ツリーノード : ${treeNodes}`);
  console.log(`  ステークホルダー : ${stakeholders} / 会議体: ${meetings}`);
  console.log(`  リスク          : ${risks}`);
  console.log(`  タスク          : ${tasks} (依存 ${deps})`);
  console.log(`  報告カレンダー   : ${reports} / 関心ごと: ${matrixRows}`);
  console.log(`  制約・前提      : ${constraints}`);
  console.log(`  オブジェクト     : ${dataObjects} (関係 ${dataObjectRelations})`);
  console.log(`  DFD            : ${dfdDiagrams} (ノード ${dfdNodes} / フロー ${dfdFlows})`);
  console.log(`  KPI            : ${kpis}`);
  console.log(`  導入状況        : ${adoptionStatuses}`);
  console.log(`  ASISメモ        : ${asisMemos} / TOBEビジョン: ${tobeVisions} / TOBEロードマップ: ${tobeRoadmaps}`);
  console.log(`  分析行          : ${analysisRows} / CRUOAセル: ${cruoaCells}`);
  console.log('─'.repeat(50));
  console.log(`  Login: ${DEMO_EMAIL} / password123`);
}

main()
  .catch((e) => {
    console.error('❌ Demo seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
