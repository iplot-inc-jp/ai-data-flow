'use client';

import { Button } from '@/components/ui/button';
import { Save, Loader2, Check, Plus } from 'lucide-react';

/** 各 purpose-built UI 共通の「追加 + 保存」ツールバー。 */
export function SaveBar({
  onAdd,
  addLabel = '追加',
  onSave,
  saving,
  savedAt,
}: {
  onAdd?: () => void;
  addLabel?: string;
  onSave: () => void;
  saving: boolean;
  savedAt: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {onAdd && (
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      )}
      <Button
        size="sm"
        onClick={onSave}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 gap-1.5"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : savedAt ? (
          <Check className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? '保存中...' : savedAt ? '保存しました' : '保存'}
      </Button>
    </div>
  );
}
