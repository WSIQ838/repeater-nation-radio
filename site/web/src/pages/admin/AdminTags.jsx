import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Tags, FolderTree, CalendarDays, Plus, Pencil, Trash2, Search, Power, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/admin/parts';

const TAG_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const CAT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
const DEFAULT_EVENT_TYPES = [
  { name: 'Weekly Net', color: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400', display_order: 0 },
  { name: 'Meetup', color: 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400', display_order: 1 },
  { name: 'Gathering', color: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400', display_order: 2 },
  { name: 'Public Service', color: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400', display_order: 3 },
  { name: 'Training', color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400', display_order: 4 },
  { name: 'Swap Meet', color: 'bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400', display_order: 5 },
];

export default function AdminTags() {
  const { toast } = useToast();
  const [tab, setTab] = useState('tags');
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c, et] = await Promise.all([
        base44.entities.Tag.list('name', 500),
        base44.entities.Category.list('display_order', 500),
        base44.entities.EventType.list('display_order', 500).catch(() => []),
      ]);
      setTags(t);
      setCategories(c);
      if (!et.length) {
        const seeded = [];
        for (const type of DEFAULT_EVENT_TYPES) {
          try { seeded.push(await base44.entities.EventType.create({ ...type, enabled: true })); } catch (_) {}
        }
        setEventTypes(seeded);
      } else {
        setEventTypes(et);
      }
    } catch (err) {
      toast({ title: 'Failed to load', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title="Tags & Categories" subtitle="Manage tags and categories used across Repeater Nation forms and directories." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tags" className="gap-1.5"><Tags className="w-4 h-4" /> Tags</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5"><FolderTree className="w-4 h-4" /> Categories</TabsTrigger>
          <TabsTrigger value="event-types" className="gap-1.5"><CalendarDays className="w-4 h-4" /> Event Types</TabsTrigger>
        </TabsList>

        <TabsContent value="tags">
          <TagsManager tags={tags} loading={loading} search={search} setSearch={setSearch} reload={load} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesManager categories={categories} loading={loading} search={search} setSearch={setSearch} reload={load} />
        </TabsContent>
        <TabsContent value="event-types">
          <EventTypesManager eventTypes={eventTypes} loading={loading} search={search} setSearch={setSearch} reload={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Tags Manager ---------- */
function TagsManager({ tags, loading, search, setSearch, reload }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = tags.filter((t) => t.display_name.toLowerCase().includes(search.toLowerCase()));

  const toggleEnabled = async (tag) => {
    try {
      await base44.entities.Tag.update(tag.id, { enabled: !tag.enabled });
      reload();
    } catch (err) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const del = async (tag) => {
    if (!confirm(`Delete tag "${tag.display_name}"? This cannot be undone.`)) return;
    try {
      await base44.entities.Tag.delete(tag.id);
      toast({ title: 'Tag deleted' });
      reload();
    } catch (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tags…" className="pl-9" />
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Tag
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState title="No tags yet" description="Create one to get started." icon={Tags} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((tag) => (
            <Card key={tag.id} className={cn('p-4 space-y-3', !tag.enabled && 'opacity-50')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: tag.color || '#f59e0b' }} />
                  <span className="font-medium text-sm">{tag.display_name}</span>
                </div>
                <Badge variant={tag.enabled ? 'default' : 'secondary'} className="text-xs">
                  {tag.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(tag); setShowForm(true); }} className="h-8 gap-1 text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(tag)} className="h-8 gap-1 text-xs">
                  <Power className="w-3 h-3" /> {tag.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(tag)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TagFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} onSaved={reload} />
    </div>
  );
}

function TagFormDialog({ open, onClose, editing, onSaved }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.display_name || '');
      setColor(editing?.color || TAG_COLORS[0]);
    }
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Tag.update(editing.id, {
          display_name: name.trim(),
          name: name.trim().toLowerCase(),
          color,
        });
        toast({ title: 'Tag updated' });
      } else {
        await base44.entities.Tag.create({
          name: name.trim().toLowerCase(),
          display_name: name.trim(),
          color,
          enabled: true,
        });
        toast({ title: 'Tag created' });
      }
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Tag' : 'New Tag'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tag Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn('w-8 h-8 rounded-lg border-2 transition-all', color === c ? 'border-foreground scale-110' : 'border-transparent')}
                  style={{ background: c }}
                >
                  {color === c && <Check className="w-4 h-4 text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Categories Manager ---------- */
function CategoriesManager({ categories, loading, search, setSearch, reload }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = categories.filter((c) => c.display_name.toLowerCase().includes(search.toLowerCase()));

  const toggleEnabled = async (cat) => {
    try {
      await base44.entities.Category.update(cat.id, { enabled: !cat.enabled });
      reload();
    } catch (err) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const del = async (cat) => {
    if (!confirm(`Delete category "${cat.display_name}"?`)) return;
    try {
      await base44.entities.Category.delete(cat.id);
      toast({ title: 'Category deleted' });
      reload();
    } catch (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="pl-9" />
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Category
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState title="No categories yet" description="Create one to get started." icon={FolderTree} />
      ) : (
        <div className="space-y-2">
          {filtered.map((cat) => (
            <Card key={cat.id} className={cn('p-4 flex items-center gap-4', !cat.enabled && 'opacity-50')}>
              <span className="w-4 h-4 rounded-full shrink-0" style={{ background: cat.color || '#3b82f6' }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{cat.display_name}</div>
                {cat.description && <div className="text-xs text-muted-foreground truncate">{cat.description}</div>}
              </div>
              <Badge variant={cat.enabled ? 'default' : 'secondary'} className="text-xs">
                {cat.enabled ? 'Active' : 'Disabled'}
              </Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(cat); setShowForm(true); }} className="h-8 gap-1 text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(cat)} className="h-8 gap-1 text-xs">
                  <Power className="w-3 h-3" /> {cat.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(cat)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CategoryFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} onSaved={reload} categories={categories} />
    </div>
  );
}

function CategoryFormDialog({ open, onClose, editing, onSaved, categories }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(CAT_COLORS[0]);
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.display_name || '');
      setDescription(editing?.description || '');
      setColor(editing?.color || CAT_COLORS[0]);
      setOrder(editing?.display_order || 0);
    }
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) return;
    const exists = categories.some((c) => c.name === name.trim().toLowerCase() && c.id !== editing?.id);
    if (exists) {
      toast({ title: 'Category already exists', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Category.update(editing.id, {
          display_name: name.trim(),
          name: name.trim().toLowerCase(),
          description: description.trim() || undefined,
          color,
          display_order: Number(order) || 0,
        });
        toast({ title: 'Category updated' });
      } else {
        await base44.entities.Category.create({
          name: name.trim().toLowerCase(),
          display_name: name.trim(),
          description: description.trim() || undefined,
          color,
          display_order: Number(order) || 0,
          enabled: true,
        });
        toast({ title: 'Category created' });
      }
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Category Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Repeater" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CAT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn('w-8 h-8 rounded-lg border-2 transition-all', color === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ background: c }}
                  >
                    {color === c && <Check className="w-4 h-4 text-white mx-auto" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Display Order</Label>
              <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Event Types Manager ---------- */
function EventTypesManager({ eventTypes, loading, search, setSearch, reload }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = eventTypes.filter((t) => (t.name || '').toLowerCase().includes(search.toLowerCase()));

  const toggleEnabled = async (type) => {
    try {
      await base44.entities.EventType.update(type.id, { enabled: !type.enabled });
      reload();
    } catch (err) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const del = async (type) => {
    if (!confirm(`Delete event type "${type.name}"? Existing events keep their current type text.`)) return;
    try {
      await base44.entities.EventType.delete(type.id);
      toast({ title: 'Event type deleted' });
      reload();
    } catch (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event types…" className="pl-9" />
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Event Type
        </Button>
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState title="No event types yet" description="Create one to use it when creating events." icon={CalendarDays} />
      ) : (
        <div className="space-y-2">
          {filtered.map((type) => (
            <Card key={type.id} className={cn('p-4 flex items-center gap-4', !type.enabled && 'opacity-50')}>
              <span className="w-4 h-4 rounded-full shrink-0 bg-muted border" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{type.name}</div>
                <div className="text-xs text-muted-foreground">Order {type.display_order ?? 0}</div>
              </div>
              <Badge variant={type.enabled ? 'default' : 'secondary'} className="text-xs">
                {type.enabled ? 'Active' : 'Disabled'}
              </Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(type); setShowForm(true); }} className="h-8 gap-1 text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(type)} className="h-8 gap-1 text-xs">
                  <Power className="w-3 h-3" /> {type.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(type)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EventTypeFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} onSaved={reload} eventTypes={eventTypes} />
    </div>
  );
}

function EventTypeFormDialog({ open, onClose, editing, onSaved, eventTypes }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState('bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400');
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name || '');
      setColor(editing?.color || 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400');
      setOrder(editing?.display_order || 0);
    }
  }, [open, editing]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = eventTypes.some((t) => t.name?.toLowerCase() === trimmed.toLowerCase() && t.id !== editing?.id);
    if (exists) {
      toast({ title: 'Event type already exists', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const oldName = editing.name;
        await base44.entities.EventType.update(editing.id, {
          name: trimmed,
          color,
          display_order: Number(order) || 0,
        });
        if (oldName !== trimmed) {
          const events = await base44.entities.Event.filter({ type: oldName });
          for (const event of events || []) {
            try { await base44.entities.Event.update(event.id, { type: trimmed }); } catch (_) {}
          }
        }
        toast({ title: 'Event type updated' });
      } else {
        await base44.entities.EventType.create({
          name: trimmed,
          color,
          display_order: Number(order) || 0,
          enabled: true,
        });
        toast({ title: 'Event type created' });
      }
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit Event Type' : 'New Event Type'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Event Type Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Club Meeting" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Tailwind classes, e.g. bg-blue-100 text-blue-600" />
          </div>
          <div className="space-y-1.5">
            <Label>Display Order</Label>
            <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}