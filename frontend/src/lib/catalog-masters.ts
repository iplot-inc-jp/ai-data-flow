// 参考マスタ（仕入先 / 商品 / 過去需要）の型定義と fetch ヘルパー。
// バックエンドの Supplier / Product / DemandData テーブル（de-JSON 化された No.3）に対応。
//
// エンドポイント:
//   GET/POST   /api/projects/:projectId/{suppliers,products,demand-data}
//   PATCH/DELETE /api/{suppliers,products,demand-data}/:id

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// ========== 型定義 ==========

export interface Supplier {
  id: string;
  projectId: string;
  code: string | null;
  name: string;
  salesRep: string | null;
  tel: string | null;
  email: string | null;
  leadTimeDays: number | null;
  note: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  code?: string | null;
  name?: string | null;
  salesRep?: string | null;
  tel?: string | null;
  email?: string | null;
  leadTimeDays?: number | null;
  note?: string | null;
  order?: number;
}

export interface Product {
  id: string;
  projectId: string;
  code: string | null;
  name: string;
  supplierId: string | null;
  supplierName: string | null;
  minLot: number | null;
  unitPrice: number | null;
  note: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  code?: string | null;
  name?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  minLot?: number | null;
  unitPrice?: number | null;
  note?: string | null;
  order?: number;
}

export interface DemandData {
  id: string;
  projectId: string;
  productName: string | null;
  period: string | null;
  quantity: number | null;
  note: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface DemandDataInput {
  productName?: string | null;
  period?: string | null;
  quantity?: number | null;
  note?: string | null;
  order?: number;
}

// ========== 共通 fetch ヘルパー ==========

function getHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      (body && (body.message as string)) || `API Error: ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

// ========== 仕入先（Supplier）==========

export const suppliersApi = {
  list: (projectId: string) =>
    request<Supplier[]>(`/projects/${projectId}/suppliers`),
  create: (projectId: string, data: SupplierInput) =>
    request<Supplier>(`/projects/${projectId}/suppliers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: SupplierInput) =>
    request<Supplier>(`/suppliers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/suppliers/${id}`, { method: 'DELETE' }),
};

// ========== 商品（Product）==========

export const productsApi = {
  list: (projectId: string) =>
    request<Product[]>(`/projects/${projectId}/products`),
  create: (projectId: string, data: ProductInput) =>
    request<Product>(`/projects/${projectId}/products`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: ProductInput) =>
    request<Product>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/products/${id}`, { method: 'DELETE' }),
};

// ========== 過去需要（DemandData）==========

export const demandDataApi = {
  list: (projectId: string) =>
    request<DemandData[]>(`/projects/${projectId}/demand-data`),
  create: (projectId: string, data: DemandDataInput) =>
    request<DemandData>(`/projects/${projectId}/demand-data`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: DemandDataInput) =>
    request<DemandData>(`/demand-data/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/demand-data/${id}`, { method: 'DELETE' }),
};
