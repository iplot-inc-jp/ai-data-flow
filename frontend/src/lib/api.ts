const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'

interface RequestOptions extends RequestInit {
  auth?: boolean
}

export async function api<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { auth = true, headers = {}, ...rest } = options

  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (auth) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (token) {
      (requestHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`
    }
  }

  const response = await fetch(`${API_URL}/api${endpoint}`, {
    headers: requestHeaders,
    ...rest,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `API Error: ${response.status}`)
  }

  return response.json()
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api<{
      accessToken: string
      user: { id: string; email: string; name: string | null }
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      auth: false,
    }),
  register: (email: string, password: string, name?: string) =>
    api<{
      accessToken: string
      user: { id: string; email: string; name: string | null }
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      auth: false,
    }),
  me: () => api<any>('/auth/me'),
}

// Organizations
export const organizationsApi = {
  list: () => api<any[]>('/organizations'),
  get: (id: string) => api<any>(`/organizations/${id}`),
  create: (data: { name: string; slug: string; description?: string }) =>
    api<any>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    api<any>(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    api<void>(`/organizations/${id}`, { method: 'DELETE' }),
}

// Projects
export const projectsApi = {
  list: (organizationId: string) =>
    api<any[]>(`/projects?organizationId=${organizationId}`),
  get: (id: string) => api<any>(`/projects/${id}`),
  create: (organizationId: string, data: { name: string; slug: string; description?: string }) =>
    api<any>(`/projects?organizationId=${organizationId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    api<any>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
}

// Tables
export const tablesApi = {
  list: (projectId: string) => api<any[]>(`/tables?projectId=${projectId}`),
  get: (id: string) => api<any>(`/tables/${id}`),
  create: (projectId: string, data: { name: string; displayName?: string; description?: string; tags?: string[] }) =>
    api<any>(`/tables?projectId=${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    api<any>(`/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/tables/${id}`, { method: 'DELETE' }),
}

// Columns
export const columnsApi = {
  list: (tableId: string) => api<any[]>(`/columns?tableId=${tableId}`),
  get: (id: string) => api<any>(`/columns/${id}`),
  create: (tableId: string, data: any) =>
    api<any>(`/columns?tableId=${tableId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    api<any>(`/columns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/columns/${id}`, { method: 'DELETE' }),
}

// Roles
export const rolesApi = {
  list: (projectId: string) => api<any[]>(`/roles?projectId=${projectId}`),
  get: (id: string) => api<any>(`/roles/${id}`),
  create: (projectId: string, data: { name: string; type: string; description?: string; color?: string }) =>
    api<any>(`/roles?projectId=${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    api<any>(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/roles/${id}`, { method: 'DELETE' }),
}

// Flows
export const flowsApi = {
  list: (projectId: string) => api<any[]>(`/flows?projectId=${projectId}`),
  get: (id: string) => api<any>(`/flows/${id}`),
  create: (projectId: string, data: { name: string; description?: string }) =>
    api<any>(`/flows?projectId=${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    api<any>(`/flows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/flows/${id}`, { method: 'DELETE' }),
}

// Flow Nodes
export const flowNodesApi = {
  list: (flowId: string) => api<any[]>(`/flow-nodes?flowId=${flowId}`),
  create: (flowId: string, data: any) =>
    api<any>(`/flow-nodes?flowId=${flowId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    api<any>(`/flow-nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/flow-nodes/${id}`, { method: 'DELETE' }),
}

// Flow Edges
export const flowEdgesApi = {
  list: (flowId: string) => api<any[]>(`/flow-edges?flowId=${flowId}`),
  create: (flowId: string, data: any) =>
    api<any>(`/flow-edges?flowId=${flowId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    api<any>(`/flow-edges/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => api<void>(`/flow-edges/${id}`, { method: 'DELETE' }),
}

// Export
export const exportApi = {
  flowMermaid: (flowId: string) => api<{ mermaid: string }>(`/export/flow/${flowId}/mermaid`),
  projectMermaid: (projectId: string) => api<any>(`/export/project/${projectId}/mermaid`),
  projectAi: (projectId: string) => api<any>(`/export/project/${projectId}/ai`),
}

