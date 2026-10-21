import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, CheckCircle2, Circle } from 'lucide-react';
import ToolConsole, { PanelLoading } from '@/components/tools/ToolConsole';
import { Panel, ConsoleTabs } from '@/components/console/Console';
import { base44 } from '@/api/base44Client';
import { loadAllContacts } from '@/lib/myContacts';
import { latLngToGrid, bandForFrequency, gridToLatLng } from '@/lib/adif';

// The 50 states for Worked All States (DC does not count toward WAS).
const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const VHF_BANDS = new Set(['6m', '4m', '2m', '1.25m', '70cm', '33cm', '23cm']);

const isConfirmed = (c) => c.qsl_received === 'Received';
const gridOf = (c) => {
  const fromNotes = String(c.notes || '').match(/\b([A-R]{2}\d{2}(?:[a-x]{2})?)\b/i)?.[1];
  return (c.lat != null && c.lng != null ? latLngToGrid(c.lat, c.lng) : null) || (fromNotes && gridToLatLng(fromNotes) ? fromNotes.slice(0, 4).toUpperCase() : null);
};

function AwardCard({ title, subtitle, worked, confirmed, goal, accent, children }) {
  const pct = goal ? Math.min(100, Math.round((worked / goal) * 100)) : null;
  return (
    <Panel title={title} accent={accent} meta={`${worked}${goal ? ` / ${goal}` : ''} worked · ${confirmed} confirmed`}>
      {pct != null && <div className="h-1 bg-muted"><div className="h-1 bg-primary transition-all" style={{ width: `${pct}%` }} aria-label={`${title} progress`} /></div>}
      <div className="p-3.5 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="text-xs text-muted-foreground">{subtitle}</div>
          <div className="text-lg font-mono font-semibold leading-none">{worked}{goal ? <span className="text-xs text-muted-foreground font-sans font-normal"> / {goal}</span> : null}</div>
        </div>
        {children}
      </div>
    </Panel>
  );
}

export default function AwardsTracker() {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState('');
  const [service, setService] = useState('HAM');

  useEffect(() => {
    base44.auth.me()
      .then((me) => loadAllContacts(me.id))
      .then(setContacts)
      .catch((e) => setError(e?.message || 'Could not load your logbook.'));
  }, []);

  const stats = useMemo(() => {
    const list = (contacts || []).filter((c) => service === 'All' || (c.radio_service || 'GMRS') === service);
    const states = new Map(); const grids = new Map(); const vhfGrids = new Map(); const counties = new Map(); const bands = new Map(); const calls = new Set();
    const bump = (map, key, c) => {
      if (!key) return;
      const cur = map.get(key) || { worked: 0, confirmed: false };
      cur.worked += 1;
      cur.confirmed = cur.confirmed || isConfirmed(c);
      map.set(key, cur);
    };
    for (const c of list) {
      calls.add(String(c.callsign || '').toUpperCase());
      const st = String(c.state || '').toUpperCase();
      if (STATES.includes(st)) bump(states, st, c);
      const g = gridOf(c);
      const band = c.band || bandForFrequency(c.frequency);
      bump(grids, g, c);
      if (g && VHF_BANDS.has(band)) bump(vhfGrids, g, c);
      if (c.county && st) bump(counties, `${c.county.replace(/\s+county$/i, '').trim()}, ${st}`, c);
      bump(bands, band || (c.radio_service === 'GMRS' ? 'GMRS' : null), c);
    }
    const confirmedCount = (m) => [...m.values()].filter((v) => v.confirmed).length;
    return { list, states, grids, vhfGrids, counties, bands, calls, confirmedCount };
  }, [contacts, service]);

  return (
    <ToolConsole
      icon={Trophy}
      title="HAM Awards Tracker"
      subtitle="Award progress from your logbook"
      kpis={[
        { label: 'States (WAS)', value: contacts ? `${stats.states.size} / 50` : '—', tone: 'primary' },
        { label: 'Grid squares', value: contacts ? stats.grids.size : '—' },
        { label: 'Counties', value: contacts ? stats.counties.size : '—' },
        { label: 'Unique stations', value: contacts ? stats.calls.size : '—' },
      ]}
      footnote="Official awards (ARRL WAS, VUCC, CQ USA-CA) require confirmations through their own programs such as LoTW. This tracker shows your progress; it does not submit applications."
    >
      {error ? <Panel title="Awards" accent="danger"><p className="p-3.5 text-sm text-destructive">{error}</p></Panel> : contacts === null ? (
        <Panel title="Awards"><PanelLoading text="Loading your logbook…" /></Panel>
      ) : (
        <>
          <ConsoleTabs
            value={service}
            onChange={setService}
            tabs={['HAM', 'GMRS', 'All'].map((s) => ({ id: s, label: s === 'All' ? 'All contacts' : s, count: s === service ? stats.list.length : undefined }))}
            right={<span className="text-[11px] text-muted-foreground hidden md:inline">"Confirmed" = QSL received · track it in <Link to="/tools/qsl" className="text-primary hover:underline">QSL Management</Link></span>}
          />

          <AwardCard title="Worked All States (WAS)" subtitle="Contact all 50 US states" worked={stats.states.size} confirmed={stats.confirmedCount(stats.states)} goal={50}>
            <div className="grid grid-cols-10 gap-1">
              {STATES.map((st) => {
                const v = stats.states.get(st);
                return (
                  <div key={st} title={v ? `${st}: ${v.worked} contact${v.worked === 1 ? '' : 's'}${v.confirmed ? ', confirmed' : ''}` : `${st}: not worked yet`}
                    className={`rounded-[3px] text-[11px] font-mono text-center py-1 border ${v?.confirmed ? 'bg-primary text-primary-foreground border-primary' : v ? 'bg-primary/15 border-primary/40' : 'text-muted-foreground border-border'}`}>
                    {st}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-primary" /> Solid: confirmed</span>
              <span className="inline-flex items-center gap-1"><Circle className="w-3 h-3 text-primary" /> Tinted: worked</span>
              <span>Outline: needed</span>
            </div>
            {stats.states.size < 50 && stats.states.size > 0 && (
              <div className="text-xs text-muted-foreground">Still needed: {STATES.filter((s) => !stats.states.has(s)).join(', ')}</div>
            )}
          </AwardCard>

          <div className="grid xl:grid-cols-2 gap-3 items-start">
            <AwardCard title="VUCC (VHF/UHF grids)" accent="success" subtitle="100 grid squares on 6 m and up" worked={stats.vhfGrids.size} confirmed={stats.confirmedCount(stats.vhfGrids)} goal={100} />
            <AwardCard title="Grid squares (all bands)" accent="success" subtitle="Unique 4-character Maidenhead grids" worked={stats.grids.size} confirmed={stats.confirmedCount(stats.grids)}>
              {stats.grids.size > 0 && <div className="text-xs text-muted-foreground font-mono break-words">{[...stats.grids.keys()].sort().join(' ')}</div>}
            </AwardCard>
            <AwardCard title="US counties" subtitle="USA-CA counts 3,077 counties" worked={stats.counties.size} confirmed={stats.confirmedCount(stats.counties)} goal={3077} />
            <AwardCard title="Bands" subtitle="Bands with at least one contact" worked={stats.bands.size} confirmed={stats.confirmedCount(stats.bands)}>
              <div className="flex flex-wrap gap-1.5">
                {[...stats.bands.entries()].map(([b, v]) => <span key={b} className="text-[11px] font-mono border border-border rounded-[3px] px-2 py-0.5">{b} · {v.worked}</span>)}
              </div>
            </AwardCard>
          </div>

          <Panel title="About these numbers" accent="muted">
            <p className="p-3.5 text-sm text-muted-foreground">States and counties come from each contact's location fields; grid squares from its coordinates (or a grid square in its notes). Contacts without a location don't count yet — add one in your logbook.</p>
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
