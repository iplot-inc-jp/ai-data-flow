import { PrismaClient, RoleType, ColumnDataType, FlowNodeType, CrudOperation } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // =============================================
  // 1. ユーザー作成
  // =============================================
  const hashedPassword = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: '管理者ユーザー',
    },
  });

  const devUser = await prisma.user.upsert({
    where: { email: 'dev@example.com' },
    update: {},
    create: {
      email: 'dev@example.com',
      password: hashedPassword,
      name: '開発者ユーザー',
    },
  });

  console.log('✅ Users created');

  // =============================================
  // 2. 組織作成
  // =============================================
  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'デモ株式会社',
      slug: 'demo-company',
      description: 'デモ用の組織',
      members: {
        create: [
          { userId: adminUser.id, role: 'OWNER' },
          { userId: devUser.id, role: 'MEMBER' },
        ],
      },
    },
  });

  console.log('✅ Organization created');

  // =============================================
  // 3. プロジェクト作成
  // =============================================
  const project = await prisma.project.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: 'ec-site',
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'ECサイト',
      slug: 'ec-site',
      description: 'オンラインショッピングプラットフォーム',
    },
  });

  console.log('✅ Project created');

  // =============================================
  // 4. ロール作成
  // =============================================
  const customerRole = await prisma.role.upsert({
    where: { projectId_name: { projectId: project.id, name: '顧客' } },
    update: {},
    create: {
      projectId: project.id,
      name: '顧客',
      type: RoleType.HUMAN,
      description: 'ECサイトを利用するエンドユーザー',
      color: '#3B82F6',
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { projectId_name: { projectId: project.id, name: '管理者' } },
    update: {},
    create: {
      projectId: project.id,
      name: '管理者',
      type: RoleType.HUMAN,
      description: 'システム管理者、バックオフィス担当',
      color: '#8B5CF6',
    },
  });

  const paymentSystemRole = await prisma.role.upsert({
    where: { projectId_name: { projectId: project.id, name: '決済システム' } },
    update: {},
    create: {
      projectId: project.id,
      name: '決済システム',
      type: RoleType.SYSTEM,
      description: '外部決済サービス（Stripe等）',
      color: '#10B981',
    },
  });

  const inventorySystemRole = await prisma.role.upsert({
    where: { projectId_name: { projectId: project.id, name: '在庫管理システム' } },
    update: {},
    create: {
      projectId: project.id,
      name: '在庫管理システム',
      type: RoleType.SYSTEM,
      description: '倉庫・在庫管理のための外部システム',
      color: '#F59E0B',
    },
  });

  const warehouseRole = await prisma.role.upsert({
    where: { projectId_name: { projectId: project.id, name: '倉庫担当者' } },
    update: {},
    create: {
      projectId: project.id,
      name: '倉庫担当者',
      type: RoleType.HUMAN,
      description: '商品のピッキング・発送を担当',
      color: '#EF4444',
    },
  });

  console.log('✅ Roles created');

  // =============================================
  // 5. テーブル作成
  // =============================================
  const usersTable = await prisma.table.upsert({
    where: { projectId_name: { projectId: project.id, name: 'users' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'users',
      displayName: 'ユーザー',
      description: 'ユーザーアカウント情報を管理するテーブル',
      tags: ['master', 'auth'],
    },
  });

  const ordersTable = await prisma.table.upsert({
    where: { projectId_name: { projectId: project.id, name: 'orders' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'orders',
      displayName: '注文',
      description: 'ECサイトの注文情報',
      tags: ['transaction'],
    },
  });

  const orderItemsTable = await prisma.table.upsert({
    where: { projectId_name: { projectId: project.id, name: 'order_items' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'order_items',
      displayName: '注文明細',
      description: '注文に含まれる商品明細',
      tags: ['transaction'],
    },
  });

  const productsTable = await prisma.table.upsert({
    where: { projectId_name: { projectId: project.id, name: 'products' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'products',
      displayName: '商品',
      description: '商品マスタ情報',
      tags: ['master', 'ec'],
    },
  });

  const inventoryTable = await prisma.table.upsert({
    where: { projectId_name: { projectId: project.id, name: 'inventory' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'inventory',
      displayName: '在庫',
      description: '商品の在庫情報',
      tags: ['transaction', 'inventory'],
    },
  });

  const paymentsTable = await prisma.table.upsert({
    where: { projectId_name: { projectId: project.id, name: 'payments' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'payments',
      displayName: '決済',
      description: '決済情報',
      tags: ['transaction', 'payment'],
    },
  });

  console.log('✅ Tables created');

  // =============================================
  // 5.1 products テーブルのカラム追加
  // =============================================
  const productIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: productsTable.id, name: 'id' } },
    update: {},
    create: {
      tableId: productsTable.id,
      name: 'id',
      displayName: '商品ID',
      dataType: ColumnDataType.UUID,
      isPrimaryKey: true,
      isNullable: false,
      order: 1,
    },
  });

  const productNameColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: productsTable.id, name: 'name' } },
    update: {},
    create: {
      tableId: productsTable.id,
      name: 'name',
      displayName: '商品名',
      dataType: ColumnDataType.STRING,
      isNullable: false,
      description: '商品の名称',
      order: 2,
    },
  });

  const productPriceColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: productsTable.id, name: 'price' } },
    update: {},
    create: {
      tableId: productsTable.id,
      name: 'price',
      displayName: '価格',
      dataType: ColumnDataType.INTEGER,
      isNullable: false,
      description: '商品の税込価格（円）',
      order: 3,
    },
  });

  const productDescriptionColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: productsTable.id, name: 'description' } },
    update: {},
    create: {
      tableId: productsTable.id,
      name: 'description',
      displayName: '商品説明',
      dataType: ColumnDataType.TEXT,
      description: '商品の詳細説明',
      order: 4,
    },
  });

  const productCategoryColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: productsTable.id, name: 'category' } },
    update: {},
    create: {
      tableId: productsTable.id,
      name: 'category',
      displayName: 'カテゴリ',
      dataType: ColumnDataType.STRING,
      description: '商品カテゴリ',
      order: 5,
    },
  });

  const productIsActiveColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: productsTable.id, name: 'is_active' } },
    update: {},
    create: {
      tableId: productsTable.id,
      name: 'is_active',
      displayName: '販売中',
      dataType: ColumnDataType.BOOLEAN,
      isNullable: false,
      defaultValue: 'true',
      description: '販売中かどうか',
      order: 6,
    },
  });

  // order_items テーブルのカラム追加
  const orderItemIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: orderItemsTable.id, name: 'id' } },
    update: {},
    create: {
      tableId: orderItemsTable.id,
      name: 'id',
      displayName: 'ID',
      dataType: ColumnDataType.UUID,
      isPrimaryKey: true,
      isNullable: false,
      order: 1,
    },
  });

  const orderItemOrderIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: orderItemsTable.id, name: 'order_id' } },
    update: {},
    create: {
      tableId: orderItemsTable.id,
      name: 'order_id',
      displayName: '注文ID',
      dataType: ColumnDataType.UUID,
      isForeignKey: true,
      foreignKeyTable: 'orders',
      foreignKeyColumn: 'id',
      isNullable: false,
      order: 2,
    },
  });

  const orderItemProductIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: orderItemsTable.id, name: 'product_id' } },
    update: {},
    create: {
      tableId: orderItemsTable.id,
      name: 'product_id',
      displayName: '商品ID',
      dataType: ColumnDataType.UUID,
      isForeignKey: true,
      foreignKeyTable: 'products',
      foreignKeyColumn: 'id',
      isNullable: false,
      order: 3,
    },
  });

  const orderItemQuantityColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: orderItemsTable.id, name: 'quantity' } },
    update: {},
    create: {
      tableId: orderItemsTable.id,
      name: 'quantity',
      displayName: '数量',
      dataType: ColumnDataType.INTEGER,
      isNullable: false,
      description: '注文数量',
      order: 4,
    },
  });

  const orderItemUnitPriceColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: orderItemsTable.id, name: 'unit_price' } },
    update: {},
    create: {
      tableId: orderItemsTable.id,
      name: 'unit_price',
      displayName: '単価',
      dataType: ColumnDataType.INTEGER,
      isNullable: false,
      description: '注文時の単価',
      order: 5,
    },
  });

  // =============================================
  // 6. カラム作成
  // =============================================
  
  // users テーブルのカラム
  const userIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: usersTable.id, name: 'id' } },
    update: {},
    create: {
      tableId: usersTable.id,
      name: 'id',
      displayName: 'ID',
      dataType: ColumnDataType.UUID,
      isPrimaryKey: true,
      isNullable: false,
      order: 1,
    },
  });

  const userEmailColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: usersTable.id, name: 'email' } },
    update: {},
    create: {
      tableId: usersTable.id,
      name: 'email',
      displayName: 'メールアドレス',
      dataType: ColumnDataType.STRING,
      isUnique: true,
      isNullable: false,
      description: 'ログイン用メールアドレス',
      order: 2,
    },
  });

  const userNameColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: usersTable.id, name: 'name' } },
    update: {},
    create: {
      tableId: usersTable.id,
      name: 'name',
      displayName: '氏名',
      dataType: ColumnDataType.STRING,
      description: 'ユーザーの氏名',
      order: 3,
    },
  });

  // orders テーブルのカラム
  const orderIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: ordersTable.id, name: 'id' } },
    update: {},
    create: {
      tableId: ordersTable.id,
      name: 'id',
      displayName: '注文ID',
      dataType: ColumnDataType.UUID,
      isPrimaryKey: true,
      isNullable: false,
      order: 1,
    },
  });

  const orderUserIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: ordersTable.id, name: 'user_id' } },
    update: {},
    create: {
      tableId: ordersTable.id,
      name: 'user_id',
      displayName: '顧客ID',
      dataType: ColumnDataType.UUID,
      isForeignKey: true,
      foreignKeyTable: 'users',
      foreignKeyColumn: 'id',
      isNullable: false,
      order: 2,
    },
  });

  const orderStatusColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: ordersTable.id, name: 'status' } },
    update: {},
    create: {
      tableId: ordersTable.id,
      name: 'status',
      displayName: '注文ステータス',
      dataType: ColumnDataType.STRING,
      description: 'pending/paid/shipped/delivered/cancelled',
      isNullable: false,
      defaultValue: 'pending',
      order: 3,
    },
  });

  const orderTotalColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: ordersTable.id, name: 'total_amount' } },
    update: {},
    create: {
      tableId: ordersTable.id,
      name: 'total_amount',
      displayName: '合計金額',
      dataType: ColumnDataType.INTEGER,
      isNullable: false,
      order: 4,
    },
  });

  const orderShippedAtColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: ordersTable.id, name: 'shipped_at' } },
    update: {},
    create: {
      tableId: ordersTable.id,
      name: 'shipped_at',
      displayName: '発送日時',
      dataType: ColumnDataType.DATETIME,
      description: '商品が発送された日時',
      order: 5,
    },
  });

  // inventory テーブルのカラム
  const inventoryIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: inventoryTable.id, name: 'id' } },
    update: {},
    create: {
      tableId: inventoryTable.id,
      name: 'id',
      displayName: 'ID',
      dataType: ColumnDataType.UUID,
      isPrimaryKey: true,
      isNullable: false,
      order: 1,
    },
  });

  const inventoryQuantityColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: inventoryTable.id, name: 'quantity' } },
    update: {},
    create: {
      tableId: inventoryTable.id,
      name: 'quantity',
      displayName: '在庫数',
      dataType: ColumnDataType.INTEGER,
      isNullable: false,
      description: '現在の在庫数量',
      order: 3,
    },
  });

  // payments テーブルのカラム
  const paymentIdColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: paymentsTable.id, name: 'id' } },
    update: {},
    create: {
      tableId: paymentsTable.id,
      name: 'id',
      displayName: 'ID',
      dataType: ColumnDataType.UUID,
      isPrimaryKey: true,
      isNullable: false,
      order: 1,
    },
  });

  const paymentStatusColumn = await prisma.column.upsert({
    where: { tableId_name: { tableId: paymentsTable.id, name: 'status' } },
    update: {},
    create: {
      tableId: paymentsTable.id,
      name: 'status',
      displayName: '決済ステータス',
      dataType: ColumnDataType.STRING,
      description: 'pending/completed/failed/refunded',
      isNullable: false,
      order: 3,
    },
  });

  console.log('✅ Columns created');

  // =============================================
  // 7. 業務フロー作成（階層構造）
  // =============================================

  // --- ルートフロー1: 注文処理フロー ---
  const orderFlow = await prisma.businessFlow.upsert({
    where: { id: 'flow-order-main' },
    update: {},
    create: {
      id: 'flow-order-main',
      projectId: project.id,
      name: '注文処理フロー',
      description: 'ECサイトの注文から発送までの業務フロー',
      version: 1,
      depth: 0,
      parentId: null,
    },
  });

  // 注文処理フローのノード
  const orderStartNode = await prisma.flowNode.upsert({
    where: { id: 'node-order-start' },
    update: {},
    create: {
      id: 'node-order-start',
      flowId: orderFlow.id,
      type: FlowNodeType.START,
      label: '開始',
      positionX: 100,
      positionY: 200,
    },
  });

  const orderCartNode = await prisma.flowNode.upsert({
    where: { id: 'node-order-cart' },
    update: {},
    create: {
      id: 'node-order-cart',
      flowId: orderFlow.id,
      type: FlowNodeType.PROCESS,
      label: 'カート追加',
      description: '商品をカートに追加',
      positionX: 250,
      positionY: 200,
      roleId: customerRole.id,
    },
  });

  const orderCheckoutNode = await prisma.flowNode.upsert({
    where: { id: 'node-order-checkout' },
    update: {},
    create: {
      id: 'node-order-checkout',
      flowId: orderFlow.id,
      type: FlowNodeType.PROCESS,
      label: '注文確定',
      description: '注文を確定する（子フローあり）',
      positionX: 400,
      positionY: 200,
      roleId: customerRole.id,
    },
  });

  const orderPaymentDecision = await prisma.flowNode.upsert({
    where: { id: 'node-order-payment-decision' },
    update: {},
    create: {
      id: 'node-order-payment-decision',
      flowId: orderFlow.id,
      type: FlowNodeType.DECISION,
      label: '決済成功？',
      description: '決済が成功したかを判定（子フローあり）',
      positionX: 550,
      positionY: 200,
    },
  });

  const orderShippingNode = await prisma.flowNode.upsert({
    where: { id: 'node-order-shipping' },
    update: {},
    create: {
      id: 'node-order-shipping',
      flowId: orderFlow.id,
      type: FlowNodeType.PROCESS,
      label: '発送処理',
      description: '商品の発送処理（子フローあり）',
      positionX: 700,
      positionY: 100,
      roleId: warehouseRole.id,
    },
  });

  const orderCancelNode = await prisma.flowNode.upsert({
    where: { id: 'node-order-cancel' },
    update: {},
    create: {
      id: 'node-order-cancel',
      flowId: orderFlow.id,
      type: FlowNodeType.PROCESS,
      label: 'キャンセル処理',
      positionX: 700,
      positionY: 300,
      roleId: adminRole.id,
    },
  });

  const orderEndNode = await prisma.flowNode.upsert({
    where: { id: 'node-order-end' },
    update: {},
    create: {
      id: 'node-order-end',
      flowId: orderFlow.id,
      type: FlowNodeType.END,
      label: '終了',
      positionX: 850,
      positionY: 200,
    },
  });

  // 注文処理フローのエッジ
  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-1' },
    update: {},
    create: {
      id: 'edge-order-1',
      flowId: orderFlow.id,
      sourceNodeId: orderStartNode.id,
      targetNodeId: orderCartNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-2' },
    update: {},
    create: {
      id: 'edge-order-2',
      flowId: orderFlow.id,
      sourceNodeId: orderCartNode.id,
      targetNodeId: orderCheckoutNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-3' },
    update: {},
    create: {
      id: 'edge-order-3',
      flowId: orderFlow.id,
      sourceNodeId: orderCheckoutNode.id,
      targetNodeId: orderPaymentDecision.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-4' },
    update: {},
    create: {
      id: 'edge-order-4',
      flowId: orderFlow.id,
      sourceNodeId: orderPaymentDecision.id,
      targetNodeId: orderShippingNode.id,
      label: 'Yes',
      condition: 'payment.status === "completed"',
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-5' },
    update: {},
    create: {
      id: 'edge-order-5',
      flowId: orderFlow.id,
      sourceNodeId: orderPaymentDecision.id,
      targetNodeId: orderCancelNode.id,
      label: 'No',
      condition: 'payment.status === "failed"',
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-6' },
    update: {},
    create: {
      id: 'edge-order-6',
      flowId: orderFlow.id,
      sourceNodeId: orderShippingNode.id,
      targetNodeId: orderEndNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-order-7' },
    update: {},
    create: {
      id: 'edge-order-7',
      flowId: orderFlow.id,
      sourceNodeId: orderCancelNode.id,
      targetNodeId: orderEndNode.id,
    },
  });

  // --- 子フロー1: 注文確定の詳細フロー ---
  const checkoutSubFlow = await prisma.businessFlow.upsert({
    where: { id: 'flow-checkout-sub' },
    update: {},
    create: {
      id: 'flow-checkout-sub',
      projectId: project.id,
      name: '注文確定詳細フロー',
      description: '注文確定処理の詳細',
      version: 1,
      depth: 1,
      parentId: orderFlow.id,
    },
  });

  // 親ノードに子フローを紐づけ
  await prisma.flowNode.update({
    where: { id: orderCheckoutNode.id },
    data: { childFlowId: checkoutSubFlow.id },
  });

  // 子フローのノード
  const checkoutStartNode = await prisma.flowNode.upsert({
    where: { id: 'node-checkout-start' },
    update: {},
    create: {
      id: 'node-checkout-start',
      flowId: checkoutSubFlow.id,
      type: FlowNodeType.START,
      label: '開始',
      positionX: 100,
      positionY: 200,
    },
  });

  const checkoutValidateNode = await prisma.flowNode.upsert({
    where: { id: 'node-checkout-validate' },
    update: {},
    create: {
      id: 'node-checkout-validate',
      flowId: checkoutSubFlow.id,
      type: FlowNodeType.PROCESS,
      label: '入力検証',
      description: '配送先・支払い方法の検証',
      positionX: 250,
      positionY: 200,
      roleId: customerRole.id,
    },
  });

  const checkoutStockCheckNode = await prisma.flowNode.upsert({
    where: { id: 'node-checkout-stock-check' },
    update: {},
    create: {
      id: 'node-checkout-stock-check',
      flowId: checkoutSubFlow.id,
      type: FlowNodeType.SYSTEM_INTEGRATION,
      label: '在庫確認',
      description: '在庫管理システムで在庫を確認',
      positionX: 400,
      positionY: 200,
      roleId: inventorySystemRole.id,
    },
  });

  const checkoutCreateOrderNode = await prisma.flowNode.upsert({
    where: { id: 'node-checkout-create-order' },
    update: {},
    create: {
      id: 'node-checkout-create-order',
      flowId: checkoutSubFlow.id,
      type: FlowNodeType.PROCESS,
      label: '注文レコード作成',
      description: 'DBに注文を作成',
      positionX: 550,
      positionY: 200,
    },
  });

  const checkoutPaymentNode = await prisma.flowNode.upsert({
    where: { id: 'node-checkout-payment' },
    update: {},
    create: {
      id: 'node-checkout-payment',
      flowId: checkoutSubFlow.id,
      type: FlowNodeType.SYSTEM_INTEGRATION,
      label: '決済処理',
      description: '決済システムで決済実行',
      positionX: 700,
      positionY: 200,
      roleId: paymentSystemRole.id,
    },
  });

  const checkoutEndNode = await prisma.flowNode.upsert({
    where: { id: 'node-checkout-end' },
    update: {},
    create: {
      id: 'node-checkout-end',
      flowId: checkoutSubFlow.id,
      type: FlowNodeType.END,
      label: '終了',
      positionX: 850,
      positionY: 200,
    },
  });

  // 子フローのエッジ
  await prisma.flowEdge.upsert({
    where: { id: 'edge-checkout-1' },
    update: {},
    create: {
      id: 'edge-checkout-1',
      flowId: checkoutSubFlow.id,
      sourceNodeId: checkoutStartNode.id,
      targetNodeId: checkoutValidateNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-checkout-2' },
    update: {},
    create: {
      id: 'edge-checkout-2',
      flowId: checkoutSubFlow.id,
      sourceNodeId: checkoutValidateNode.id,
      targetNodeId: checkoutStockCheckNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-checkout-3' },
    update: {},
    create: {
      id: 'edge-checkout-3',
      flowId: checkoutSubFlow.id,
      sourceNodeId: checkoutStockCheckNode.id,
      targetNodeId: checkoutCreateOrderNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-checkout-4' },
    update: {},
    create: {
      id: 'edge-checkout-4',
      flowId: checkoutSubFlow.id,
      sourceNodeId: checkoutCreateOrderNode.id,
      targetNodeId: checkoutPaymentNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-checkout-5' },
    update: {},
    create: {
      id: 'edge-checkout-5',
      flowId: checkoutSubFlow.id,
      sourceNodeId: checkoutPaymentNode.id,
      targetNodeId: checkoutEndNode.id,
    },
  });

  // --- 子フロー2: 発送処理の詳細フロー ---
  const shippingSubFlow = await prisma.businessFlow.upsert({
    where: { id: 'flow-shipping-sub' },
    update: {},
    create: {
      id: 'flow-shipping-sub',
      projectId: project.id,
      name: '発送処理詳細フロー',
      description: '発送処理の詳細',
      version: 1,
      depth: 1,
      parentId: orderFlow.id,
    },
  });

  await prisma.flowNode.update({
    where: { id: orderShippingNode.id },
    data: { childFlowId: shippingSubFlow.id },
  });

  // 発送サブフローのノード
  const shippingStartNode = await prisma.flowNode.upsert({
    where: { id: 'node-shipping-start' },
    update: {},
    create: {
      id: 'node-shipping-start',
      flowId: shippingSubFlow.id,
      type: FlowNodeType.START,
      label: '開始',
      positionX: 100,
      positionY: 200,
    },
  });

  const shippingPickingNode = await prisma.flowNode.upsert({
    where: { id: 'node-shipping-picking' },
    update: {},
    create: {
      id: 'node-shipping-picking',
      flowId: shippingSubFlow.id,
      type: FlowNodeType.MANUAL_OPERATION,
      label: 'ピッキング',
      description: '倉庫で商品をピッキング',
      positionX: 250,
      positionY: 200,
      roleId: warehouseRole.id,
    },
  });

  const shippingUpdateInventoryNode = await prisma.flowNode.upsert({
    where: { id: 'node-shipping-update-inventory' },
    update: {},
    create: {
      id: 'node-shipping-update-inventory',
      flowId: shippingSubFlow.id,
      type: FlowNodeType.SYSTEM_INTEGRATION,
      label: '在庫更新',
      description: '在庫数を減少',
      positionX: 400,
      positionY: 200,
      roleId: inventorySystemRole.id,
    },
  });

  const shippingPackNode = await prisma.flowNode.upsert({
    where: { id: 'node-shipping-pack' },
    update: {},
    create: {
      id: 'node-shipping-pack',
      flowId: shippingSubFlow.id,
      type: FlowNodeType.MANUAL_OPERATION,
      label: '梱包',
      description: '商品を梱包',
      positionX: 550,
      positionY: 200,
      roleId: warehouseRole.id,
    },
  });

  const shippingDispatchNode = await prisma.flowNode.upsert({
    where: { id: 'node-shipping-dispatch' },
    update: {},
    create: {
      id: 'node-shipping-dispatch',
      flowId: shippingSubFlow.id,
      type: FlowNodeType.PROCESS,
      label: '発送',
      description: '配送業者に引き渡し、ステータス更新',
      positionX: 700,
      positionY: 200,
      roleId: warehouseRole.id,
    },
  });

  const shippingEndNode = await prisma.flowNode.upsert({
    where: { id: 'node-shipping-end' },
    update: {},
    create: {
      id: 'node-shipping-end',
      flowId: shippingSubFlow.id,
      type: FlowNodeType.END,
      label: '終了',
      positionX: 850,
      positionY: 200,
    },
  });

  // 発送サブフローのエッジ
  await prisma.flowEdge.upsert({
    where: { id: 'edge-shipping-1' },
    update: {},
    create: {
      id: 'edge-shipping-1',
      flowId: shippingSubFlow.id,
      sourceNodeId: shippingStartNode.id,
      targetNodeId: shippingPickingNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-shipping-2' },
    update: {},
    create: {
      id: 'edge-shipping-2',
      flowId: shippingSubFlow.id,
      sourceNodeId: shippingPickingNode.id,
      targetNodeId: shippingUpdateInventoryNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-shipping-3' },
    update: {},
    create: {
      id: 'edge-shipping-3',
      flowId: shippingSubFlow.id,
      sourceNodeId: shippingUpdateInventoryNode.id,
      targetNodeId: shippingPackNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-shipping-4' },
    update: {},
    create: {
      id: 'edge-shipping-4',
      flowId: shippingSubFlow.id,
      sourceNodeId: shippingPackNode.id,
      targetNodeId: shippingDispatchNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-shipping-5' },
    update: {},
    create: {
      id: 'edge-shipping-5',
      flowId: shippingSubFlow.id,
      sourceNodeId: shippingDispatchNode.id,
      targetNodeId: shippingEndNode.id,
    },
  });

  // --- ルートフロー2: ユーザー登録フロー ---
  const userRegFlow = await prisma.businessFlow.upsert({
    where: { id: 'flow-user-reg' },
    update: {},
    create: {
      id: 'flow-user-reg',
      projectId: project.id,
      name: 'ユーザー登録フロー',
      description: '新規ユーザーのアカウント登録プロセス',
      version: 1,
      depth: 0,
      parentId: null,
    },
  });

  const regStartNode = await prisma.flowNode.upsert({
    where: { id: 'node-reg-start' },
    update: {},
    create: {
      id: 'node-reg-start',
      flowId: userRegFlow.id,
      type: FlowNodeType.START,
      label: '開始',
      positionX: 100,
      positionY: 200,
    },
  });

  const regInputNode = await prisma.flowNode.upsert({
    where: { id: 'node-reg-input' },
    update: {},
    create: {
      id: 'node-reg-input',
      flowId: userRegFlow.id,
      type: FlowNodeType.PROCESS,
      label: '情報入力',
      description: 'メールアドレス・パスワード・氏名を入力',
      positionX: 250,
      positionY: 200,
      roleId: customerRole.id,
    },
  });

  const regValidateNode = await prisma.flowNode.upsert({
    where: { id: 'node-reg-validate' },
    update: {},
    create: {
      id: 'node-reg-validate',
      flowId: userRegFlow.id,
      type: FlowNodeType.DECISION,
      label: 'メール重複チェック',
      positionX: 400,
      positionY: 200,
    },
  });

  const regCreateNode = await prisma.flowNode.upsert({
    where: { id: 'node-reg-create' },
    update: {},
    create: {
      id: 'node-reg-create',
      flowId: userRegFlow.id,
      type: FlowNodeType.PROCESS,
      label: 'ユーザー作成',
      description: 'DBにユーザーレコードを作成',
      positionX: 550,
      positionY: 100,
    },
  });

  const regErrorNode = await prisma.flowNode.upsert({
    where: { id: 'node-reg-error' },
    update: {},
    create: {
      id: 'node-reg-error',
      flowId: userRegFlow.id,
      type: FlowNodeType.PROCESS,
      label: 'エラー表示',
      positionX: 550,
      positionY: 300,
      roleId: customerRole.id,
    },
  });

  const regEndNode = await prisma.flowNode.upsert({
    where: { id: 'node-reg-end' },
    update: {},
    create: {
      id: 'node-reg-end',
      flowId: userRegFlow.id,
      type: FlowNodeType.END,
      label: '終了',
      positionX: 700,
      positionY: 200,
    },
  });

  // ユーザー登録フローのエッジ
  await prisma.flowEdge.upsert({
    where: { id: 'edge-reg-1' },
    update: {},
    create: {
      id: 'edge-reg-1',
      flowId: userRegFlow.id,
      sourceNodeId: regStartNode.id,
      targetNodeId: regInputNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-reg-2' },
    update: {},
    create: {
      id: 'edge-reg-2',
      flowId: userRegFlow.id,
      sourceNodeId: regInputNode.id,
      targetNodeId: regValidateNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-reg-3' },
    update: {},
    create: {
      id: 'edge-reg-3',
      flowId: userRegFlow.id,
      sourceNodeId: regValidateNode.id,
      targetNodeId: regCreateNode.id,
      label: '未登録',
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-reg-4' },
    update: {},
    create: {
      id: 'edge-reg-4',
      flowId: userRegFlow.id,
      sourceNodeId: regValidateNode.id,
      targetNodeId: regErrorNode.id,
      label: '登録済み',
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-reg-5' },
    update: {},
    create: {
      id: 'edge-reg-5',
      flowId: userRegFlow.id,
      sourceNodeId: regCreateNode.id,
      targetNodeId: regEndNode.id,
    },
  });

  await prisma.flowEdge.upsert({
    where: { id: 'edge-reg-6' },
    update: {},
    create: {
      id: 'edge-reg-6',
      flowId: userRegFlow.id,
      sourceNodeId: regErrorNode.id,
      targetNodeId: regInputNode.id,
      label: '再入力',
    },
  });

  console.log('✅ Business flows created (with hierarchy)');

  // =============================================
  // 8. CRUDマッピング作成（複数紐づけ）
  // =============================================

  // --- users.email のCRUDマッピング ---
  // C1: 顧客がユーザー登録フローで作成
  await prisma.crudMapping.upsert({
    where: { id: 'crud-user-email-c1' },
    update: {},
    create: {
      id: 'crud-user-email-c1',
      columnId: userEmailColumn.id,
      operation: CrudOperation.CREATE,
      roleId: customerRole.id,
      flowId: userRegFlow.id,
      flowNodeId: regCreateNode.id,
      how: 'ユーザーが入力したメールアドレスをDBに保存',
      description: '新規ユーザー登録時に作成',
    },
  });

  // C2: 管理者が管理画面から手動作成
  await prisma.crudMapping.upsert({
    where: { id: 'crud-user-email-c2' },
    update: {},
    create: {
      id: 'crud-user-email-c2',
      columnId: userEmailColumn.id,
      operation: CrudOperation.CREATE,
      roleId: adminRole.id,
      how: '管理画面のユーザー追加フォームから入力',
      description: '管理者による手動ユーザー作成',
    },
  });

  // R: 顧客がログイン時に参照
  await prisma.crudMapping.upsert({
    where: { id: 'crud-user-email-r1' },
    update: {},
    create: {
      id: 'crud-user-email-r1',
      columnId: userEmailColumn.id,
      operation: CrudOperation.READ,
      roleId: customerRole.id,
      how: 'ログイン認証時にメールアドレスで照合',
      description: 'ログイン時の認証',
    },
  });

  // U: 顧客がプロフィール編集で更新
  await prisma.crudMapping.upsert({
    where: { id: 'crud-user-email-u1' },
    update: {},
    create: {
      id: 'crud-user-email-u1',
      columnId: userEmailColumn.id,
      operation: CrudOperation.UPDATE,
      roleId: customerRole.id,
      how: 'マイページのプロフィール編集画面から変更',
      description: 'メールアドレス変更',
    },
  });

  // --- users.name のCRUDマッピング ---
  await prisma.crudMapping.upsert({
    where: { id: 'crud-user-name-c1' },
    update: {},
    create: {
      id: 'crud-user-name-c1',
      columnId: userNameColumn.id,
      operation: CrudOperation.CREATE,
      roleId: customerRole.id,
      flowId: userRegFlow.id,
      flowNodeId: regCreateNode.id,
      how: 'ユーザーが入力した氏名をDBに保存',
      description: '新規ユーザー登録時に作成',
    },
  });

  // --- orders.status のCRUDマッピング ---
  // C: 注文確定時に作成（pending）
  await prisma.crudMapping.upsert({
    where: { id: 'crud-order-status-c1' },
    update: {},
    create: {
      id: 'crud-order-status-c1',
      columnId: orderStatusColumn.id,
      operation: CrudOperation.CREATE,
      roleId: customerRole.id,
      flowId: checkoutSubFlow.id,
      flowNodeId: checkoutCreateOrderNode.id,
      how: 'デフォルト値 "pending" で作成',
      description: '注文作成時',
    },
  });

  // U1: 決済システムが決済完了時にpaidに更新
  await prisma.crudMapping.upsert({
    where: { id: 'crud-order-status-u1' },
    update: {},
    create: {
      id: 'crud-order-status-u1',
      columnId: orderStatusColumn.id,
      operation: CrudOperation.UPDATE,
      roleId: paymentSystemRole.id,
      flowId: checkoutSubFlow.id,
      flowNodeId: checkoutPaymentNode.id,
      how: '"paid" に更新',
      condition: '決済成功時',
      description: '決済完了でステータス更新',
    },
  });

  // U2: 倉庫担当が発送時にshippedに更新
  await prisma.crudMapping.upsert({
    where: { id: 'crud-order-status-u2' },
    update: {},
    create: {
      id: 'crud-order-status-u2',
      columnId: orderStatusColumn.id,
      operation: CrudOperation.UPDATE,
      roleId: warehouseRole.id,
      flowId: shippingSubFlow.id,
      flowNodeId: shippingDispatchNode.id,
      how: '"shipped" に更新',
      description: '発送時にステータス更新',
    },
  });

  // U3: 管理者がキャンセル時にcancelledに更新
  await prisma.crudMapping.upsert({
    where: { id: 'crud-order-status-u3' },
    update: {},
    create: {
      id: 'crud-order-status-u3',
      columnId: orderStatusColumn.id,
      operation: CrudOperation.UPDATE,
      roleId: adminRole.id,
      flowId: orderFlow.id,
      flowNodeId: orderCancelNode.id,
      how: '"cancelled" に更新',
      description: '注文キャンセル時',
    },
  });

  // --- orders.shipped_at のCRUDマッピング ---
  await prisma.crudMapping.upsert({
    where: { id: 'crud-order-shippedat-u1' },
    update: {},
    create: {
      id: 'crud-order-shippedat-u1',
      columnId: orderShippedAtColumn.id,
      operation: CrudOperation.UPDATE,
      roleId: warehouseRole.id,
      flowId: shippingSubFlow.id,
      flowNodeId: shippingDispatchNode.id,
      how: '現在日時をセット',
      description: '発送時に発送日時を記録',
    },
  });

  // --- inventory.quantity のCRUDマッピング ---
  // U1: 発送時に減少
  await prisma.crudMapping.upsert({
    where: { id: 'crud-inventory-qty-u1' },
    update: {},
    create: {
      id: 'crud-inventory-qty-u1',
      columnId: inventoryQuantityColumn.id,
      operation: CrudOperation.UPDATE,
      roleId: inventorySystemRole.id,
      flowId: shippingSubFlow.id,
      flowNodeId: shippingUpdateInventoryNode.id,
      how: '出荷数量分を減算',
      description: '発送時に在庫を減少',
    },
  });

  // R: 注文確定時に在庫確認
  await prisma.crudMapping.upsert({
    where: { id: 'crud-inventory-qty-r1' },
    update: {},
    create: {
      id: 'crud-inventory-qty-r1',
      columnId: inventoryQuantityColumn.id,
      operation: CrudOperation.READ,
      roleId: inventorySystemRole.id,
      flowId: checkoutSubFlow.id,
      flowNodeId: checkoutStockCheckNode.id,
      how: '在庫数を取得して注文可能か判定',
      description: '注文時の在庫確認',
    },
  });

  // --- payments.status のCRUDマッピング ---
  await prisma.crudMapping.upsert({
    where: { id: 'crud-payment-status-c1' },
    update: {},
    create: {
      id: 'crud-payment-status-c1',
      columnId: paymentStatusColumn.id,
      operation: CrudOperation.CREATE,
      roleId: paymentSystemRole.id,
      flowId: checkoutSubFlow.id,
      flowNodeId: checkoutPaymentNode.id,
      how: '決済APIのレスポンスに応じてステータスをセット',
      description: '決済処理結果を記録',
    },
  });

  console.log('✅ CRUD mappings created (multiple per column)');

  console.log('');
  console.log('🎉 Seeding completed successfully!');
  console.log('');
  console.log('📧 Login credentials:');
  console.log('   Admin: admin@example.com / password123');
  console.log('   Dev:   dev@example.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
