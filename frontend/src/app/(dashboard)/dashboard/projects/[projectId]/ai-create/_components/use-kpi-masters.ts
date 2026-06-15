'use client';

/**
 * KPI関連の参照マスタ（フロー / システム / ロール / INPUT-OUTPUT）読込フック。
 *
 * 業務KPI・AI精度指標・AI下書きの3画面で共有する。
 * フロー/ロールは専用 lib クライアントが無いため、ASIS・ロールページと同じ
 * 生 fetch（accessToken ヘッダ）を踏襲する。システム/IOは lib クライアント経由。
 */

import { useCallback, useEffect, useState } from 'react';
import { informationTypeApi, type InformationType } from '@/lib/dfd';
import { systemApi, type SystemMaster } from '@/lib/masters';
import type { BusinessFlowItem, RoleItem } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export interface KpiMasters {
  flows: BusinessFlowItem[];
  systems: SystemMaster[];
  roles: RoleItem[];
  informationTypes: InformationType[];
  loading: boolean;
}

/** 参照マスタを読み込む共有フック。`{ flows, systems, roles, informationTypes, loading }` を返す。 */
export function useKpiMasters(projectId: string): KpiMasters {
  const [flows, setFlows] = useState<BusinessFlowItem[]>([]);
  const [systems, setSystems] = useState<SystemMaster[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [informationTypes, setInformationTypes] = useState<InformationType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMasters = useCallback(async () => {
    const [flowRes, roleRes, systemsData, ioData] = await Promise.all([
      fetch(`${API_URL}/api/business-flows/project/${projectId}/all`, {
        headers: authHeaders(),
      }).catch(() => null),
      fetch(`${API_URL}/api/roles/project/${projectId}`, { headers: authHeaders() }).catch(
        () => null,
      ),
      systemApi.list(projectId).catch(() => [] as SystemMaster[]),
      informationTypeApi.list(projectId).catch(() => [] as InformationType[]),
    ]);
    if (flowRes?.ok) {
      const data = await flowRes.json().catch(() => []);
      setFlows(Array.isArray(data) ? data : []);
    }
    if (roleRes?.ok) {
      const data = await roleRes.json().catch(() => []);
      setRoles(Array.isArray(data) ? data : []);
    }
    setSystems(systemsData);
    setInformationTypes(ioData);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadMasters().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadMasters]);

  return { flows, systems, roles, informationTypes, loading };
}
