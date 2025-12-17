// ===========================================
// API レスポンス型
// ===========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

// ===========================================
// ページネーション
// ===========================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ===========================================
// 認証
// ===========================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  organizations: {
    id: string;
    name: string;
    role: string;
  }[];
}

// ===========================================
// 組織・プロジェクト DTO
// ===========================================

export interface CreateOrganizationDto {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  description?: string;
}

export interface CreateProjectDto {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
}

// ===========================================
// ロール DTO
// ===========================================

export interface CreateRoleDto {
  name: string;
  type: 'HUMAN' | 'SYSTEM' | 'OTHER';
  description?: string;
  color?: string;
}

export interface UpdateRoleDto {
  name?: string;
  type?: 'HUMAN' | 'SYSTEM' | 'OTHER';
  description?: string;
  color?: string;
}

// ===========================================
// データカタログ DTO
// ===========================================

export interface CreateTableDto {
  name: string;
  displayName?: string;
  description?: string;
  tags?: string[];
}

export interface UpdateTableDto {
  name?: string;
  displayName?: string;
  description?: string;
  tags?: string[];
}

export interface CreateColumnDto {
  name: string;
  displayName?: string;
  dataType: string;
  description?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

export interface UpdateColumnDto {
  name?: string;
  displayName?: string;
  dataType?: string;
  description?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

// ===========================================
// 業務フロー DTO
// ===========================================

export interface CreateFlowDto {
  name: string;
  description?: string;
}

export interface UpdateFlowDto {
  name?: string;
  description?: string;
}

export interface CreateFlowNodeDto {
  type: string;
  label: string;
  description?: string;
  positionX: number;
  positionY: number;
  roleId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateFlowNodeDto {
  type?: string;
  label?: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  roleId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateFlowEdgeDto {
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  condition?: string;
}

export interface UpdateFlowEdgeDto {
  label?: string;
  condition?: string;
}

// ===========================================
// CRUDマッピング DTO
// ===========================================

export interface CreateCrudMappingDto {
  columnId: string;
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  roleId: string;
  flowNodeId?: string;
  condition?: string;
  description?: string;
}

export interface UpdateCrudMappingDto {
  operation?: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  roleId?: string;
  flowNodeId?: string;
  condition?: string;
  description?: string;
}

// ===========================================
// IF定義 DTO
// ===========================================

export interface CreateInterfaceDefinitionDto {
  flowEdgeId: string;
  name: string;
  description?: string;
  format: string;
  columns?: {
    columnId: string;
    isRequired: boolean;
    transformRule?: string;
  }[];
}

export interface UpdateInterfaceDefinitionDto {
  name?: string;
  description?: string;
  format?: string;
}

// ===========================================
// エクスポート
// ===========================================

export interface ExportOptions {
  format: 'mermaid' | 'json' | 'ai_context';
  includeFlows?: boolean;
  includeTables?: boolean;
  includeRoles?: boolean;
  includeCrudMappings?: boolean;
}

export interface MermaidExport {
  flowDiagram?: string;
  erDiagram?: string;
}

export interface AiContextExport {
  projectOverview: string;
  tables: {
    name: string;
    description: string;
    columns: {
      name: string;
      type: string;
      description: string;
      crudOperations: string[];
    }[];
  }[];
  flows: {
    name: string;
    mermaidDiagram: string;
    description: string;
  }[];
  roles: {
    name: string;
    type: string;
    responsibilities: string[];
  }[];
}

