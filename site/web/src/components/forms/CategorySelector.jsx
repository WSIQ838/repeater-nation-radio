import React, { useState, useRef, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Single-select category picker with searchable dropdown.
 * @param {string} value - category ID
 * @param {(id: string) => void} onChange
 */
export default function CategorySelector({ value, onChange, placeholder = 'Select a category…' }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    base44.entities.Category.list('display_order', 500)
      .then((rows) => setCategories(rows.filter((c) => c.enabled)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = useMemo(() => categories.find((c) => c.id === value), [categories, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.display_name.toLowerCase().includes(q));
  }, [categories, query]);

  const clear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-ring"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        {selected ? (
          <span className="flex-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: selected.color || '#3b82f6' }} />
            {selected.display_name}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        )}
        {selected ? (
          <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-56 overflow-y-auto scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">No categories found</div>
          )}
          {!loading && filtered.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => { onChange(cat.id); setOpen(false); setQuery(''); }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                value === cat.id && 'bg-primary/5'
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color || '#3b82f6' }} />
              <span className="flex-1">
                {cat.display_name}
                {cat.description && <span className="block text-xs text-muted-foreground">{cat.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}