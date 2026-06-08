'use client';

// 参考マスタ（仕入先 / 商品 / 過去需要）の表エディタ。
// 旧 RecordSheetTable（JSON 保存）に代わり、Supplier / Product / DemandData の
// 専用テーブル API（de-JSON 化 No.3）を直接読み書きする。
//
// 各エディタは「行追加 / 編集 / 削除 / 保存」を備える表。
// 商品（Product）の仕入先列は既存 Supplier の SELECT（supplierId FK）で、
// 一覧に無い仕入先はフリーテキスト入力にフォールバックできる。

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, Save, Check } from 'lucide-react';
import {
  suppliersApi,
  productsApi,
  demandDataApi,
  type Supplier,
  type SupplierInput,
  type Product,
  type ProductInput,
  type DemandData,
  type DemandDataInput,
} from '@/lib/catalog-masters';

// 仕入先のフリーテキスト入力を選ぶための番兵値（Radix Select は空文字を許可しない）
const FREE_TEXT_VALUE = '__free_text__';

// ========== 共通ヘルパー ==========

// 文字列入力 → number | null（空欄は null）
function toIntOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function numToStr(v: number | null): string {
  return v === null || v === undefined ? '' : String(v);
}

function strOrNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

// 保存完了の一時表示
function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const flash = useCallback(() => {
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, []);
  return [saved, flash] as const;
}

// テーブル外枠（白 iplot テーマ）
function TableShell({
  children,
  onAdd,
  addLabel,
  error,
}: {
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  error: string | null;
}) {
  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">{children}</table>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="border-amber-300 text-amber-700 hover:bg-amber-50"
      >
        <Plus className="h-4 w-4 mr-1" />
        {addLabel}
      </Button>
    </div>
  );
}

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
      {children}
    </th>
  );
}

// 行アクション（保存 / 削除）
function RowActions({
  onSave,
  onDelete,
  saving,
  deleting,
  saved,
}: {
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
  saved: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        disabled={saving || deleting}
        className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
        title="保存"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={saving || deleting}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        title="削除"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

const cellInput =
  'h-8 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400';

// 空状態 / ローディング
function StatusRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-gray-400">
        {children}
      </td>
    </tr>
  );
}

// ========== 仕入先（Supplier）エディタ ==========

function SupplierRow({
  supplier,
  onChanged,
}: {
  supplier: Supplier;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<SupplierInput>({
    code: supplier.code,
    name: supplier.name,
    salesRep: supplier.salesRep,
    tel: supplier.tel,
    email: supplier.email,
    leadTimeDays: supplier.leadTimeDays,
    note: supplier.note,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, flash] = useSavedFlash();
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await suppliersApi.update(supplier.id, form);
      flash();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await suppliersApi.delete(supplier.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '削除に失敗しました');
      setDeleting(false);
    }
  };

  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1">
        <Input
          value={form.code ?? ''}
          onChange={(e) => setForm({ ...form, code: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="S001"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.name ?? ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cellInput}
          placeholder="〇〇商事"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.salesRep ?? ''}
          onChange={(e) => setForm({ ...form, salesRep: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="山田"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.tel ?? ''}
          onChange={(e) => setForm({ ...form, tel: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="03-..."
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.email ?? ''}
          onChange={(e) => setForm({ ...form, email: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="x@example.com"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={numToStr(form.leadTimeDays ?? null)}
          onChange={(e) => setForm({ ...form, leadTimeDays: toIntOrNull(e.target.value) })}
          className={`${cellInput} w-20`}
          placeholder="7"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.note ?? ''}
          onChange={(e) => setForm({ ...form, note: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="備考"
        />
      </td>
      <td className="px-2 py-1">
        <RowActions
          onSave={save}
          onDelete={remove}
          saving={saving}
          deleting={deleting}
          saved={saved}
        />
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </td>
    </tr>
  );
}

export function SupplierTable({
  projectId,
  onSuppliersChange,
}: {
  projectId: string;
  onSuppliersChange?: (suppliers: Supplier[]) => void;
}) {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await suppliersApi.list(projectId);
      setRows(data);
      onSuppliersChange?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [projectId, onSuppliersChange]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = async () => {
    setAdding(true);
    setError(null);
    try {
      await suppliersApi.create(projectId, { name: '', order: rows.length });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '行の追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  return (
    <TableShell
      onAdd={addRow}
      addLabel={adding ? '追加中...' : '仕入先を追加'}
      error={error}
    >
      <thead className="bg-gray-50">
        <tr>
          <HeadCell>コード</HeadCell>
          <HeadCell>仕入先名</HeadCell>
          <HeadCell>担当営業</HeadCell>
          <HeadCell>電話番号</HeadCell>
          <HeadCell>メール</HeadCell>
          <HeadCell>リードタイム(日)</HeadCell>
          <HeadCell>備考</HeadCell>
          <HeadCell>操作</HeadCell>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <StatusRow colSpan={8}>
            <Loader2 className="h-5 w-5 animate-spin inline text-amber-500" />
          </StatusRow>
        ) : rows.length === 0 ? (
          <StatusRow colSpan={8}>仕入先がありません。「仕入先を追加」から登録してください。</StatusRow>
        ) : (
          rows.map((s) => <SupplierRow key={s.id} supplier={s} onChanged={load} />)
        )}
      </tbody>
    </TableShell>
  );
}

// ========== 商品（Product）エディタ ==========

function ProductRow({
  product,
  suppliers,
  onChanged,
}: {
  product: Product;
  suppliers: Supplier[];
  onChanged: () => void;
}) {
  // 既存 supplierId を持つ場合は SELECT、無ければ（supplierName のみ等）フリーテキスト
  const initialFreeText =
    !product.supplierId && (product.supplierName ?? '') !== '';
  const [form, setForm] = useState<ProductInput>({
    code: product.code,
    name: product.name,
    supplierId: product.supplierId,
    supplierName: product.supplierName,
    minLot: product.minLot,
    unitPrice: product.unitPrice,
    note: product.note,
  });
  const [freeText, setFreeText] = useState(initialFreeText);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, flash] = useSavedFlash();
  const [err, setErr] = useState<string | null>(null);

  const onSelectSupplier = (value: string) => {
    if (value === FREE_TEXT_VALUE) {
      // フリーテキストへ切替（FK は外す）
      setFreeText(true);
      setForm((f) => ({ ...f, supplierId: null }));
      return;
    }
    setFreeText(false);
    const picked = suppliers.find((s) => s.id === value);
    setForm((f) => ({
      ...f,
      supplierId: value,
      supplierName: picked ? picked.name : f.supplierName,
    }));
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await productsApi.update(product.id, form);
      flash();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await productsApi.delete(product.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '削除に失敗しました');
      setDeleting(false);
    }
  };

  const selectValue = freeText
    ? FREE_TEXT_VALUE
    : form.supplierId ?? FREE_TEXT_VALUE;

  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1">
        <Input
          value={form.code ?? ''}
          onChange={(e) => setForm({ ...form, code: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="P001"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.name ?? ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={cellInput}
          placeholder="商品A"
        />
      </td>
      <td className="px-2 py-1 min-w-[200px]">
        <Select value={selectValue} onValueChange={onSelectSupplier}>
          <SelectTrigger className="h-8 bg-white border-gray-300 text-gray-900">
            <SelectValue placeholder="仕入先を選択" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name || s.code || '(無名の仕入先)'}
              </SelectItem>
            ))}
            <SelectItem value={FREE_TEXT_VALUE}>その他（手入力）</SelectItem>
          </SelectContent>
        </Select>
        {freeText && (
          <Input
            value={form.supplierName ?? ''}
            onChange={(e) =>
              setForm({ ...form, supplierName: strOrNull(e.target.value) })
            }
            className={`${cellInput} mt-1`}
            placeholder="仕入先名を入力"
          />
        )}
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={numToStr(form.minLot ?? null)}
          onChange={(e) => setForm({ ...form, minLot: toIntOrNull(e.target.value) })}
          className={`${cellInput} w-24`}
          placeholder="100"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={numToStr(form.unitPrice ?? null)}
          onChange={(e) => setForm({ ...form, unitPrice: toIntOrNull(e.target.value) })}
          className={`${cellInput} w-24`}
          placeholder="500"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.note ?? ''}
          onChange={(e) => setForm({ ...form, note: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="備考"
        />
      </td>
      <td className="px-2 py-1">
        <RowActions
          onSave={save}
          onDelete={remove}
          saving={saving}
          deleting={deleting}
          saved={saved}
        />
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </td>
    </tr>
  );
}

export function ProductTable({
  projectId,
  suppliers,
}: {
  projectId: string;
  suppliers: Supplier[];
}) {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await productsApi.list(projectId);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = async () => {
    setAdding(true);
    setError(null);
    try {
      await productsApi.create(projectId, { name: '', order: rows.length });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '行の追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  return (
    <TableShell
      onAdd={addRow}
      addLabel={adding ? '追加中...' : '商品を追加'}
      error={error}
    >
      <thead className="bg-gray-50">
        <tr>
          <HeadCell>コード</HeadCell>
          <HeadCell>商品名</HeadCell>
          <HeadCell>仕入先</HeadCell>
          <HeadCell>最小ロット(個)</HeadCell>
          <HeadCell>単価(円)</HeadCell>
          <HeadCell>備考</HeadCell>
          <HeadCell>操作</HeadCell>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <StatusRow colSpan={7}>
            <Loader2 className="h-5 w-5 animate-spin inline text-amber-500" />
          </StatusRow>
        ) : rows.length === 0 ? (
          <StatusRow colSpan={7}>商品がありません。「商品を追加」から登録してください。</StatusRow>
        ) : (
          rows.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              suppliers={suppliers}
              onChanged={load}
            />
          ))
        )}
      </tbody>
    </TableShell>
  );
}

// ========== 過去需要（DemandData）エディタ ==========

function DemandDataRow({
  demand,
  onChanged,
}: {
  demand: DemandData;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<DemandDataInput>({
    productName: demand.productName,
    period: demand.period,
    quantity: demand.quantity,
    note: demand.note,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, flash] = useSavedFlash();
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await demandDataApi.update(demand.id, form);
      flash();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await demandDataApi.delete(demand.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '削除に失敗しました');
      setDeleting(false);
    }
  };

  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1">
        <Input
          value={form.productName ?? ''}
          onChange={(e) => setForm({ ...form, productName: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="商品A"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.period ?? ''}
          onChange={(e) => setForm({ ...form, period: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="2025-04"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={numToStr(form.quantity ?? null)}
          onChange={(e) => setForm({ ...form, quantity: toIntOrNull(e.target.value) })}
          className={`${cellInput} w-28`}
          placeholder="120"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={form.note ?? ''}
          onChange={(e) => setForm({ ...form, note: strOrNull(e.target.value) })}
          className={cellInput}
          placeholder="備考"
        />
      </td>
      <td className="px-2 py-1">
        <RowActions
          onSave={save}
          onDelete={remove}
          saving={saving}
          deleting={deleting}
          saved={saved}
        />
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </td>
    </tr>
  );
}

export function DemandDataTable({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<DemandData[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await demandDataApi.list(projectId);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = async () => {
    setAdding(true);
    setError(null);
    try {
      await demandDataApi.create(projectId, { order: rows.length });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '行の追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  return (
    <TableShell
      onAdd={addRow}
      addLabel={adding ? '追加中...' : '需要データを追加'}
      error={error}
    >
      <thead className="bg-gray-50">
        <tr>
          <HeadCell>商品</HeadCell>
          <HeadCell>期間(月/年月)</HeadCell>
          <HeadCell>需要数</HeadCell>
          <HeadCell>備考</HeadCell>
          <HeadCell>操作</HeadCell>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <StatusRow colSpan={5}>
            <Loader2 className="h-5 w-5 animate-spin inline text-amber-500" />
          </StatusRow>
        ) : rows.length === 0 ? (
          <StatusRow colSpan={5}>過去需要データがありません。「需要データを追加」から登録してください。</StatusRow>
        ) : (
          rows.map((d) => <DemandDataRow key={d.id} demand={d} onChanged={load} />)
        )}
      </tbody>
    </TableShell>
  );
}
