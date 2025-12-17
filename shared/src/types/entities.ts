// ===========================================
// 基本型
// ===========================================

export type RoleType = 'HUMAN' | 'SYSTEM' | 'OTHER';
export type CrudOperation = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
export type ColumnDataType = 
  | 'STRING' 
  | 'INTEGER' 
  | 'FLOAT' 
  | 'BOOLEAN' 
  | 'DATE' 
  | 'DATETIME' 
  | 'JSON' 
  | 'TEXT'
  | 'UUID';

export type FlowNodeType = 
  | 'START' 
  | 'END' 
  | 'PROCESS' 
  | 'DECISION' 
  | 'SYSTEM_INTEGRATION'
  | 'MANUAL_OPERATION'
  | 'DATA_STORE';

export type InterfaceFormat = 'API' | 'CSV' | 'SCREEN' | 'FILE' | 'DATABASE' | 'OTHER';

// ===========================================
// 組織・プロジェクト
// ===========================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// ロール
// ===========================================

export interface Role {
  id: string;
  projectId: string;
  name: string;
  type: RoleType;
  description?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// データカタログ
// ===========================================

export interface Table {
  id: string;
  projectId: string;
  name: string;
  displayName?: string;
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Column {
  id: string;
  tableId: string;
  name: string;
  displayName?: string;
  dataType: ColumnDataType;
  description?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// 業務フロー
// ===========================================

export interface BusinessFlow {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowNode {
  id: string;
  flowId: string;
  type: FlowNodeType;
  label: string;
  description?: string;
  // React Flow用の位置情報
  positionX: number;
  positionY: number;
  // スイムレーン用のロール
  roleId?: string;
  // メタデータ（カスタムプロパティ）
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowEdge {
  id: string;
  flowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  // 分岐条件（DECISIONノードからの場合）
  condition?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// 紐づけ（CRUDマッピング・IF定義）
// ===========================================

export interface CrudMapping {
  id: string;
  columnId: string;
  operation: CrudOperation;
  roleId: string;
  flowNodeId?: string;
  condition?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InterfaceDefinition {
  id: string;
  flowEdgeId: string;
  name: string;
  description?: string;
  format: InterfaceFormat;
  createdAt: Date;
  updatedAt: Date;
}

export interface InterfaceColumn {
  id: string;
  interfaceId: string;
  columnId: string;
  isRequired: boolean;
  transformRule?: string;
}

// ===========================================
// ユーザー・認証
// ===========================================

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  createdAt: Date;
  updatedAt: Date;
}

