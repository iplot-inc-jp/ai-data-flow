'use client';

import { Building2, Check, ChevronDown } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

/**
 * 所属会社を切り替えるドロップダウン。会社が無ければ何も表示しない。
 */
export function CompanySwitcher() {
  const { organizations, selectedOrganization, selectOrganization } = useProject();

  if (!organizations || organizations.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="会社を切り替え" className="w-full flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left text-sm hover:bg-secondary transition-colors">
            <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-foreground">
              {selectedOrganization?.name ?? '会社を選択'}
            </span>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>会社を切り替え</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => selectOrganization(org)}
              className="flex items-center gap-2"
            >
              <Check
                className={
                  'h-4 w-4 ' + (selectedOrganization?.id === org.id ? 'opacity-100' : 'opacity-0')
                }
              />
              <span className="truncate">{org.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
