'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  Loader2,
  Grid3X3,
  Plus,
  Edit2,
  Trash2,
  X,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type Role = {
  id: string;
  name: string;
  type: string;
  color?: string;
  order: number;
};

type Table = {
  id: string;
  name: string;
  displayName?: string;
  columns: any[];
};

type CrudMapping = {
  id: string;
  columnId: string;
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  roleId: string;
  flowId?: string;
  flowNodeId?: string;
  how?: string;
  description?: string;
  column?: {
    id: string;
    name: string;
    tableId: string;
    table?: Table;
  };
  role?: Role;
  flow?: { id: string; name: string };
};

// テーブル単位でまとめたCRUDマッピング
type TableCrudEntry = {
  tableId: string;
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  roleId: string;
  how: string;
  mappingIds: string[]; // 関連するマッピングのID
};

const operationLabels: Record<string, string> = {
  CREATE: '作成',
  READ: '見る',
  UPDATE: '編集',
  DELETE: '削除',
};

const operationOrder = ['CREATE', 'UPDATE', 'READ', 'DELETE'];

export default function CrudMatrixPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [tables, setTables] = useState<Table[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [crudMappings, setCrudMappings] = useState<CrudMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // 編集モーダル
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    tableId: string;
    tableName: string;
    operation: string;
    roleId: string;
    roleName: string;
    how: string;
    mappingIds: string[];
  } | null>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getHeaders();

      // テーブル一覧
      const tablesRes = await fetch(`${API_URL}/api/tables/project/${projectId}`, { headers });
      const tablesData = tablesRes.ok ? await tablesRes.json() : [];

      // ロール一覧
      const rolesRes = await fetch(`${API_URL}/api/roles/project/${projectId}`, { headers });
      const rolesData = rolesRes.ok ? await rolesRes.json() : [];

      // CRUDマッピング一覧（全テーブル）
      const allMappings: CrudMapping[] = [];
      for (const table of tablesData) {
        for (const column of table.columns || []) {
          if (column.crudMappings) {
            for (const mapping of column.crudMappings) {
              allMappings.push({
                ...mapping,
                column: {
                  id: column.id,
                  name: column.name,
                  tableId: table.id,
                  table: table,
                },
              });
            }
          }
        }
      }

      setTables(tablesData);
      setRoles(rolesData.sort((a: Role, b: Role) => a.order - b.order));
      setCrudMappings(allMappings);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, getHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // テーブル×操作×ロールのマトリックスデータを構築
  const getMatrixData = useCallback(() => {
    const matrix: Record<string, Record<string, Record<string, { how: string; mappingIds: string[] }>>> = {};

    // 初期化
    for (const table of tables) {
      matrix[table.id] = {};
      for (const op of operationOrder) {
        matrix[table.id][op] = {};
        for (const role of roles) {
          matrix[table.id][op][role.id] = { how: '', mappingIds: [] };
        }
      }
    }

    // CRUDマッピングを集計
    for (const mapping of crudMappings) {
      const tableId = mapping.column?.tableId;
      if (!tableId || !matrix[tableId]) continue;

      const op = mapping.operation;
      const roleId = mapping.roleId;

      if (matrix[tableId][op] && matrix[tableId][op][roleId]) {
        // howが設定されていれば追加、なければ○を表示
        const currentHow = matrix[tableId][op][roleId].how;
        const newHow = mapping.how || mapping.description || '○';
        
        if (currentHow && currentHow !== newHow) {
          matrix[tableId][op][roleId].how = `${currentHow}, ${newHow}`;
        } else if (!currentHow) {
          matrix[tableId][op][roleId].how = newHow;
        }
        matrix[tableId][op][roleId].mappingIds.push(mapping.id);
      }
    }

    return matrix;
  }, [tables, roles, crudMappings]);

  const matrixData = getMatrixData();

  // セルクリック時の編集
  const handleCellClick = (tableId: string, tableName: string, operation: string, roleId: string, roleName: string) => {
    const cellData = matrixData[tableId]?.[operation]?.[roleId];
    setEditDialog({
      open: true,
      tableId,
      tableName,
      operation,
      roleId,
      roleName,
      how: cellData?.how || '',
      mappingIds: cellData?.mappingIds || [],
    });
  };

  // 保存処理
  const handleSave = async () => {
    if (!editDialog) return;

    try {
      const headers = getHeaders();

      // 該当テーブルの全カラムに対してマッピングを更新
      const table = tables.find((t) => t.id === editDialog.tableId);
      if (!table || !table.columns?.length) return;

      // 既存のマッピングを削除
      for (const mappingId of editDialog.mappingIds) {
        await fetch(`${API_URL}/api/crud-mappings/${mappingId}`, {
          method: 'DELETE',
          headers,
        });
      }

      // 新しいhowが設定されている場合、最初のカラムに対してマッピングを作成
      if (editDialog.how.trim()) {
        const firstColumn = table.columns[0];
        await fetch(`${API_URL}/api/crud-mappings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            columnId: firstColumn.id,
            operation: editDialog.operation,
            roleId: editDialog.roleId,
            how: editDialog.how,
          }),
        });
      }

      await fetchData();
      setEditDialog(null);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="text-gray-600">
              <ChevronLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">テーブルCRUD表</h1>
            <p className="text-gray-500 mt-1">テーブル×ロール×操作のマトリックス</p>
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      {tables.length > 0 && roles.length > 0 ? (
        <Card className="bg-white border-gray-200 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10 min-w-[120px]">
                      テーブル
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-700 min-w-[80px]">
                      操作
                    </th>
                    {roles.map((role) => (
                      <th
                        key={role.id}
                        className="border border-gray-200 px-4 py-3 text-center font-semibold text-gray-700 min-w-[150px]"
                        style={{ backgroundColor: role.color ? `${role.color}20` : undefined }}
                      >
                        {role.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tables.map((table, tableIndex) => (
                    operationOrder.map((operation, opIndex) => (
                      <tr
                        key={`${table.id}-${operation}`}
                        className={tableIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                      >
                        {/* テーブル名（最初の行のみ表示） */}
                        {opIndex === 0 && (
                          <td
                            rowSpan={4}
                            className="border border-gray-200 px-4 py-2 font-medium text-gray-900 sticky left-0 bg-inherit z-10"
                            style={{ backgroundColor: tableIndex % 2 === 0 ? 'white' : '#fafafa' }}
                          >
                            <Link
                              href={`/dashboard/projects/${projectId}/catalog/${table.id}`}
                              className="hover:text-blue-600 hover:underline"
                            >
                              {table.displayName || table.name}
                            </Link>
                          </td>
                        )}
                        {/* 操作 */}
                        <td className="border border-gray-200 px-4 py-2 text-sm text-gray-600">
                          {operationLabels[operation]}
                        </td>
                        {/* ロールごとのセル */}
                        {roles.map((role) => {
                          const cellData = matrixData[table.id]?.[operation]?.[role.id];
                          const hasMapping = cellData?.how;

                          return (
                            <td
                              key={`${table.id}-${operation}-${role.id}`}
                              className="border border-gray-200 px-2 py-1 text-center cursor-pointer hover:bg-blue-50 transition-colors group"
                              onClick={() =>
                                handleCellClick(
                                  table.id,
                                  table.displayName || table.name,
                                  operation,
                                  role.id,
                                  role.name
                                )
                              }
                            >
                              {hasMapping ? (
                                <span className="text-sm text-gray-700">{cellData.how}</span>
                              ) : (
                                <span className="text-gray-300 group-hover:text-blue-400 text-sm">
                                  +
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Grid3X3 className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">CRUD表を表示するには</p>
            <p className="text-sm text-gray-400 mb-4">
              テーブルとロールを先に作成してください
            </p>
            <div className="flex gap-2">
              <Link href={`/dashboard/projects/${projectId}/catalog`}>
                <Button variant="outline">データカタログへ</Button>
              </Link>
              <Link href={`/dashboard/projects/${projectId}/roles`}>
                <Button variant="outline">ロール管理へ</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 凡例 */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-sm text-gray-700">使い方</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p>• セルをクリックして、各テーブル×ロール×操作の内容を編集できます</p>
          <p>• 「○」は操作が可能なことを示します。具体的な方法（「power appsでやる」など）も記載できます</p>
          <p>• 空欄は該当操作が定義されていないことを示します</p>
        </CardContent>
      </Card>

      {/* 編集ダイアログ */}
      <Dialog open={editDialog?.open || false} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              CRUD定義を編集
            </DialogTitle>
          </DialogHeader>

          {editDialog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">テーブル:</span>
                  <span className="ml-2 font-medium text-gray-900">{editDialog.tableName}</span>
                </div>
                <div>
                  <span className="text-gray-500">操作:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {operationLabels[editDialog.operation]}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">ロール:</span>
                  <span className="ml-2 font-medium text-gray-900">{editDialog.roleName}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  操作方法・備考
                </label>
                <Input
                  placeholder="例: power appsでやる、○、チャップスからできる"
                  value={editDialog.how}
                  onChange={(e) => setEditDialog({ ...editDialog, how: e.target.value })}
                  className="bg-white border-gray-300"
                />
                <p className="text-xs text-gray-500">
                  空欄にすると定義が削除されます
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

