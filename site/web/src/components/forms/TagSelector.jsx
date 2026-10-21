import React, { useState, useRef, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { X, Plus, Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Multi-select tag picker with searchable dropdown and chip display.
 * @param {string[]} value - array of tag IDs
 * @param {(ids: string[]) => void} onChange
 * @param {boolean} allowCreate - if true, users can create new tags inline
 */
export default function TagSelector({ value = [], onChange, allowCreate = false, placeholder = 'Search tags…' }) {
  const { toast } = useToast();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    base44.entities.Tag.list('name', 500)
      .then((rows) => setTags(rows.filter((t) => t.enabled)))
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

  const selected = useMemo(() => tags.filter((t) => value.includes(t.id)), [tags, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.display_name.toLowerCase().includes(q));
  }, [tags, query]);

  const toggle = (tag) => {
    if (value.includes(tag.id)) {
      onChange(value.filter((id) => id !== tag.id));
    } else {
      onChange([...value, tag.id]);
    }
  };

  const removeTag = (id, e) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== id));
  };

  const createTag = async () => {
    const name = query.trim();
    if (!name) return;
    const exists = tags.some((t) => t.name === name.toLowerCase());
    if (exists) {
      toast({ title: 'Tag already exists', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const created = await base44.entities.Tag.create({
        name: name.toLowerCase(),
        display_name: name,
        enabled: true,
      });
      setTags((prev) => [...prev, created]);
      onChange([...value, created.id]);
      setQuery('');
    } catch (err) {
      toast({ title: 'Could not create tag', description: err.message, variant: 'destructive' });
    }
    setCreating(false);
  };

  const showCreateOption = allowCreate && query.trim() && !filtered.some((t) => t.name === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
            >
              {tag.display_name}
              <button type="button" onClick={(e) => removeTag(tag.id, e)} className="hover:text-primary/70">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-ring"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length ? 'Add more…' : placeholder}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-56 overflow-y-auto scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && !showCreateOption && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">No tags found</div>
          )}
          {!loading && filtered.map((tag) => {
            const isSelected = value.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                  isSelected && 'bg-primary/5'
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: tag.color || '#f59e0b' }} />
                  {tag.display_name}
                </span>
                {isSelected && <Check className="w-4 h-4 text-primary" />}
              </button>
            );
          })}
          {showCreateOption && (
            <button
              type="button"
              onClick={createTag}
              disabled={creating}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/5 border-t border-border transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}