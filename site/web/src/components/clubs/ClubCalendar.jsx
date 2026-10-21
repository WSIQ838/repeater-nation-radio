import { useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Linkify from '@/components/shared/Linkify';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ClubCalendar({ events = [] }) {
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsForDay = (d) => events.filter((e) => e.date && isSameDay(new Date(e.date), d));
  const selectedEvents = eventsForDay(selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg">{format(cursor, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = isSameMonth(d, cursor);
          const evs = eventsForDay(d);
          const isSel = isSameDay(d, selected);
          const isToday = isSameDay(d, new Date());
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelected(d)}
              className={`aspect-square rounded-lg p-1 flex flex-col items-center justify-start gap-0.5 text-xs transition-colors border ${
                isSel ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
              } ${inMonth ? '' : 'text-muted-foreground/40'}`}
            >
              <span className={`leading-none ${isToday ? 'w-5 h-5 grid place-items-center rounded-full bg-primary text-primary-foreground font-semibold' : ''}`}>
                {format(d, 'd')}
              </span>
              <span className="flex flex-wrap gap-0.5 justify-center">
                {evs.slice(0, 3).map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />)}
                {evs.length > 3 && <span className="text-[8px]">+{evs.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">{format(selected, 'EEEE, MMMM d')}</span>
          <span className="text-xs text-muted-foreground">{selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'}</span>
        </div>
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events this day.</p>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                <div className="text-xs font-mono text-muted-foreground w-16 shrink-0">{e.date ? format(new Date(e.date), 'h:mm a') : ''}</div>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{e.type}{e.location ? ` · ${e.location}` : ''}</div>
                  {e.description && <p className="text-xs text-muted-foreground mt-1"><Linkify text={e.description} /></p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}