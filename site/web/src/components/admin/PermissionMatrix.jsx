import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Search, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

const TYPE_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', manage: 'Manage', approve: 'Approve' };

export default function PermissionMatrix({ categories, types, permissions, onChange, searchQuery, disabled, readOnly }) {
  const [expanded, setExpanded] = useState(() => new Set(categories.map((c) => c.key)));
  const [localSearch, setLocalSearch] = useState('');
  const q = (searchQuery || localSearch || '').toLowerCase().trim();

  const toggleCategory = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const matchesSearch = (cat) => {
    if (!q) return true;
    if (cat.label.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q)) return true;
    for (const t of types) {
      if (`${cat.key}.${t}`.includes(q) || TYPE_LABELS[t].toLowerCase().includes(q)) return true;
    }
    return false;
  };

  return (
    <div className="space-y-2">
      {!searchQuery && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="Search permissions…" className="pl-9" />
        </div>
      )}
      {categories.filter(matchesSearch).map((cat) => {
        const isExpanded = expanded.has(cat.key);
        const allOn = types.every((t) => permissions[`${cat.key}.${t}`] === true);
        return (
          <div key={cat.key} className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(cat.key)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="font-medium text-sm">{cat.label}</span>
              {allOn && <span className="text-xs bg-success/15 text-success px-2 py-0.5 rounded-full">All ON</span>}
              <span className="text-xs text-muted-foreground ml-auto truncate hidden sm:block">{cat.description}</span>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pt-1">
                <p className="text-xs text-muted-foreground mb-3">{cat.description}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {types.map((t) => {
                    const key = `${cat.key}.${t}`;
                    const val = permissions[key] === true;
                    return (
                      <label key={key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border ${val ? 'bg-primary/5' : 'bg-card'} ${(disabled || readOnly) ? 'opacity-60' : 'cursor-pointer hover:bg-muted/30'} transition-colors`}>
                        <Switch
                          checked={val}
                          disabled={disabled || readOnly}
                          onCheckedChange={(checked) => onChange(key, checked)}
                        />
                        <span className="text-sm font-medium">{TYPE_LABELS[t]}</span>
                        {readOnly && <Lock className="w-3 h-3 text-muted-foreground ml-auto" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}