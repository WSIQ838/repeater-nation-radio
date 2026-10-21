import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';

// Canonical sidebar tabs — kept in sync with Layout.jsx's `nav` array. Must
// match its `to` paths exactly, since that's the join key get-nav-config's
// saved order is applied against.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/tools', label: 'Tools' },
  { to: '/clubs', label: 'Clubs' },
  { to: '/club-manager', label: 'Club Manager' },
  { to: '/events', label: 'Events' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/equipment-guide', label: 'Recommended Gear' },
  { to: '/forums', label: 'Forums' },
  { to: '/messages', label: 'Messages' },
  { to: '/directory', label: 'Members' },
  { to: '/callsign-management', label: 'My Callsign' },
  { to: '/settings', label: 'Settings' },
];

export default function NavOrderEditor({ order, onChange }) {
  // `order` is an array of route paths. Build the working list from the
  // canonical items, applying the saved order; any items not in the saved
  // order append at the end in their default position.
  const buildList = (saved) => {
    const map = Object.fromEntries(NAV_ITEMS.map((n) => [n.to, n]));
    const ordered = (saved || [])
      .filter((p) => map[p])
      .map((p) => map[p]);
    const seen = new Set(ordered.map((n) => n.to));
    NAV_ITEMS.forEach((n) => { if (!seen.has(n.to)) ordered.push(n); });
    return ordered;
  };

  const [items, setItems] = useState(() => buildList(order));

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const next = Array.from(items);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setItems(next);
    onChange(next.map((n) => n.to));
  };

  const reset = () => {
    setItems(NAV_ITEMS);
    onChange(NAV_ITEMS.map((n) => n.to));
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Drag to reorder the main sidebar tabs. Save changes to apply the new order across the site.</p>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="nav-order">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
              {items.map((item, index) => (
                <Draggable key={item.to} draggableId={item.to} index={index}>
                  {(p) => (
                    <div
                      ref={p.innerRef}
                      {...p.draggableProps}
                      {...p.dragHandleProps}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-accent/40 cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground font-mono">{item.to}</span>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <button type="button" onClick={reset} className="mt-3 text-xs text-primary hover:underline">Reset to default order</button>
    </div>
  );
}