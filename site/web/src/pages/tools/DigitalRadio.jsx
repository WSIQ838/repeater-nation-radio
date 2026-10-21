import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Network, Loader2, Search } from 'lucide-react';
import ToolConsole, { PanelLoading, TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel, ConsoleTabs, EmptyPanel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

const NETWORKS = {
  brandmeister: { label: 'DMR / BrandMeister', action: 'brandmeister', source: 'BrandMeister network API · repeaters seen in the last 7 days' },
  dstar: { label: 'D-STAR / Reflectors', action: 'xlx', source: 'XLX reflector registry (xlxapi.rlx.lu) · multi-mode D-STAR, DMR and YSF reflectors' },
  allstar: { label: 'AllStarLink', action: 'allstar', source: 'AllStarLink node database and live node stats' },
  echolink: { label: 'EchoLink', action: 'echolink', source: 'EchoLink current logins · repeaters, links and conferences (refreshed every 5 minutes)' },
  wiresx: { label: 'WIRES-X', action: 'wiresx', source: 'Yaesu WIRES-X active node list' },
};
const PAGE = 200;

async function call(body) {
  const res = await base44.functions.invoke('digital-radio', body);
  const d = res?.data || res;
  if (!d?.ok) throw new Error(d?.error || 'Directory unavailable');
  return d;
}

function NodeMap({ points, render }) {
  if (!points.length) return null;
  return (
    <Panel title="Network map" accent="success" meta={`${points.length.toLocaleString()} mapped`}>
      <div className="h-[62vh] min-h-[420px]">
        <MapContainer center={[39, -98]} zoom={3} minZoom={2} className="h-full w-full" scrollWheelZoom={false} preferCanvas worldCopyJump>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
          {points.map((p, i) => (
            <CircleMarker key={i} center={[p.lat, p.lng]} radius={4} pathOptions={{ color: '#ffffff', weight: 1, fillColor: '#f97316', fillOpacity: 0.85 }}>
              <Popup>{render(p)}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </Panel>
  );
}

function Table({ title, meta, headers, rows, footer }) {
  return (
    <Panel title={title} meta={meta}>
      <div className="overflow-x-auto max-h-[62vh] overflow-y-auto scrollbar-thin">
        <table className={TABLE}>
          <thead className={`${THEAD} sticky top-0`}><tr>{headers.map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
      {footer}
    </Panel>
  );
}

function AllStar() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setError('');
    try { setResult(await call({ action: 'allstar', query })); } catch (e) { setError(e?.message); }
    setLoading(false);
  };
  const check = async (node) => {
    setStatus((s) => ({ ...s, [node]: { loading: true } }));
    try { const d = await call({ action: 'allstar_node', node }); setStatus((s) => ({ ...s, [node]: d })); }
    catch (e) { setStatus((s) => ({ ...s, [node]: { error: e?.message || 'Unavailable' } })); }
  };

  return (
    <div className="space-y-3">
      <Panel title="Node search" accent="muted" meta={result ? `${result.nodes.length} of ${result.total.toLocaleString()} nodes${result.nodes.length === 200 ? ' (first 200)' : ''}` : undefined}>
        <div className="p-3 flex flex-wrap gap-2 items-center">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Node number, callsign, city or description" className="h-8 text-xs max-w-sm" aria-label="Search AllStarLink nodes" />
          <Button size="sm" className="h-8 text-xs" onClick={search} disabled={loading || !query.trim()}>{loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />} Search</Button>
        </div>
        {error && <p className="px-3.5 pb-3 text-sm text-destructive">{error}</p>}
      </Panel>
      {result?.nodes?.length > 0 ? (
        <Table title="AllStarLink nodes" meta={`${result.nodes.length} matches`} headers={['Node', 'Callsign', 'Description', 'Location', 'Live status']} rows={result.nodes.map((n) => {
          const st = status[n.node];
          return (
            <tr key={n.node} className={TR}>
              <td className={`${TD} font-mono text-[12px]`}>{n.node}</td><td className={`${TD} font-mono font-semibold text-primary`}>{n.callsign}</td><td className={TD}>{n.description}</td><td className={`${TD} text-muted-foreground text-[12px]`}>{n.location}</td>
              <td className={`${TD} text-xs`}>
                {!st ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => check(n.node)}>Check</Button>
                  : st.loading ? <Loader2 className="w-4 h-4 animate-spin" />
                  : st.error ? <span className="text-muted-foreground">{st.error}</span>
                  : <span>{st.keyed ? 'Transmitting' : 'Idle'} · {st.linkedNodes.length} linked{st.linkedNodes.length ? `: ${st.linkedNodes.slice(0, 5).join(', ')}${st.linkedNodes.length > 5 ? '…' : ''}` : ''}</span>}
              </td>
            </tr>
          );
        })} />
      ) : !result && (
        <Panel title="AllStarLink nodes"><EmptyPanel icon={Network} title="Search the AllStarLink directory" text="The AllStarLink directory has no coordinates, so it's searchable rather than mapped. Search, then check any node's live status." /></Panel>
      )}
    </div>
  );
}

export default function DigitalRadio() {
  const { network: param } = useParams();
  const navigate = useNavigate();
  const network = NETWORKS[param] ? param : 'brandmeister';
  const net = NETWORKS[network];
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setFilter(''); setKind('all'); setLimit(PAGE); setError('');
    if (network === 'allstar' || data[network]) return;
    call({ action: net.action }).then((d) => setData((s) => ({ ...s, [network]: d }))).catch((e) => setError(e?.message || 'Directory unavailable'));
  }, [network]);  

  const d = data[network];
  const q = filter.trim().toLowerCase();
  const match = (...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q));

  const list = useMemo(() => {
    if (!d) return [];
    if (network === 'brandmeister') return d.repeaters.filter((r) => match(r.callsign, r.city, r.tx, r.id));
    if (network === 'dstar') return d.reflectors.filter((r) => (kind === 'all' || (kind === 'online') === r.online) && match(r.name, r.country, r.comment));
    if (network === 'echolink') return d.nodes.filter((n) => (kind === 'all' || n.type === kind) && match(n.call, n.location, n.node));
    if (network === 'wiresx') return d.nodes.filter((n) => match(n.callsign, n.id, n.dtmf, n.city, n.state, n.country, n.freq));
    return [];
  }, [d, network, q, kind]);  

  const mapPoints = network === 'brandmeister' || network === 'wiresx' ? list.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  const shown = list.slice(0, limit);

  const total = d ? (d.repeaters || d.reflectors || d.nodes || []).length : null;
  const online = network === 'dstar' && d ? d.reflectors.filter((r) => r.online).length : null;
  const SEG = (on) => `h-7 px-2.5 rounded text-[11px] font-semibold uppercase tracking-[0.08em] border ${on ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`;

  const table = d && (
    network === 'brandmeister' ? <Table title="Repeaters" meta={`${shown.length.toLocaleString()} of ${list.length.toLocaleString()}`} headers={['Callsign', 'Location', 'Output', 'Input', 'CC', 'BM ID']} rows={shown.map((r) => (
      <tr key={r.id} className={TR}><td className={`${TD} font-mono font-semibold text-primary`}>{r.callsign}</td><td className={TD}>{r.city}</td><td className={`${TD} font-mono text-[12px]`}>{r.tx}</td><td className={`${TD} font-mono text-[12px]`}>{r.rx}</td><td className={TD}>{r.cc}</td><td className={`${TD} font-mono text-[12px] text-muted-foreground`}>{r.id}</td></tr>
    ))} />
    : network === 'dstar' ? <Table title="Reflectors" meta={`${shown.length.toLocaleString()} of ${list.length.toLocaleString()}`} headers={['Reflector', 'Country', 'Description', 'Status', 'Dashboard']} rows={shown.map((r) => (
      <tr key={r.name} className={TR}><td className={`${TD} font-mono font-semibold text-primary`}>{r.name}</td><td className={TD}>{r.country}</td><td className={`${TD} text-[12px]`}>{r.comment}</td><td className={TD}>{r.online ? <span className="text-success text-[12px] font-semibold">Online</span> : <span className="text-muted-foreground text-[12px]">Offline</span>}</td>
        <td className={TD}>{/^https?:\/\//i.test(r.dashboard) ? <a href={r.dashboard} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">Open</a> : ''}</td></tr>
    ))} />
    : network === 'echolink' ? <Table title="Nodes online" meta={`${shown.length.toLocaleString()} of ${list.length.toLocaleString()}`} headers={['Node', 'Callsign', 'Type', 'Location / info', 'Status', 'Since (UTC)']} rows={shown.map((n) => (
      <tr key={`${n.call}-${n.node}`} className={TR}><td className={`${TD} font-mono text-[12px]`}>{n.node}</td><td className={`${TD} font-mono font-semibold text-primary`}>{n.call}</td><td className={`${TD} capitalize`}>{n.type}</td><td className={`${TD} text-[12px]`}>{n.location}</td><td className={`${TD} text-[12px]`}>{n.status}</td><td className={`${TD} font-mono text-[12px]`}>{n.time}</td></tr>
    ))} />
    : network === 'wiresx' ? <Table title="Nodes and rooms" meta={`${shown.length.toLocaleString()} of ${list.length.toLocaleString()}`} headers={['Node / room', 'Callsign', 'Location', 'Frequency', 'Mode', 'Comment']} rows={shown.map((n, i) => (
      <tr key={`${n.dtmf}-${i}`} className={TR}><td className={`${TD} font-mono text-[12px]`}>{n.dtmf} <span className="text-muted-foreground">{n.id}</span></td><td className={`${TD} font-mono font-semibold text-primary`}>{n.callsign}</td><td className={`${TD} text-[12px]`}>{[n.city, n.state, n.country].filter(Boolean).join(', ')}</td><td className={`${TD} font-mono text-[12px]`}>{n.freq} {n.squelch}</td><td className={TD}>{n.mode}</td><td className={`${TD} text-muted-foreground text-[12px]`}>{n.comment}</td></tr>
    ))} />
    : null
  );

  return (
    <ToolConsole
      icon={Network}
      title="Digital Radio Networks"
      subtitle={net.label}
      status={d || network === 'allstar' ? 'Live' : undefined}
      kpis={network === 'allstar' ? undefined : [
        { label: network === 'brandmeister' ? 'Repeaters' : network === 'dstar' ? 'Reflectors' : 'Nodes', value: total != null ? total.toLocaleString() : '—' },
        { label: 'Matching', value: d ? list.length.toLocaleString() : '—', tone: 'primary' },
        { label: network === 'dstar' ? 'Online now' : 'Mapped', value: network === 'dstar' ? (online ?? '—') : (d ? mapPoints.length.toLocaleString() : '—'), tone: 'success' },
        { label: 'Shown', value: d ? shown.length.toLocaleString() : '—' },
      ]}
      footnote={`Source: ${net.source}`}
    >
      <ConsoleTabs
        value={network}
        onChange={(k) => navigate(`/tools/digital/${k}`)}
        tabs={Object.entries(NETWORKS).map(([k, v]) => ({ id: k, label: v.label }))}
      />

      {network === 'allstar' ? <AllStar /> : error ? <Panel title={net.label} accent="danger"><p className="p-3.5 text-sm text-destructive">{error}</p></Panel> : !d ? (
        <Panel title={net.label}><PanelLoading text={`Loading ${net.label}…`} /></Panel>
      ) : (
        <>
          <Panel title="Filters" accent="muted" meta={`${list.length.toLocaleString()} match`}>
            <div className="p-3 flex flex-wrap items-center gap-2">
              <Input value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(PAGE); }} placeholder="Filter by callsign, place, or ID" className="h-8 text-xs max-w-sm" aria-label="Filter" />
              {network === 'echolink' && ['all', 'repeater', 'link', 'conference'].map((k) => <button key={k} type="button" className={SEG(kind === k)} onClick={() => setKind(k)}>{k === 'all' ? 'All' : `${k}s`}</button>)}
              {network === 'dstar' && ['all', 'online'].map((k) => <button key={k} type="button" className={SEG(kind === k)} onClick={() => setKind(k)}>{k === 'all' ? 'All' : 'Online now'}</button>)}
            </div>
          </Panel>

          {mapPoints.length ? (
            <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start">
              {table}
              <NodeMap points={mapPoints} render={(p) => (network === 'brandmeister'
                ? <div className="text-xs"><div className="font-semibold">{p.callsign}</div><div>{p.city}</div><div>TX {p.tx} · RX {p.rx} · CC{p.cc}</div><div>BM ID {p.id}</div></div>
                : <div className="text-xs"><div className="font-semibold">{p.callsign} · {p.id}</div><div>{[p.city, p.state, p.country].filter(Boolean).join(', ')}</div><div>{p.freq} {p.squelch}</div><div>Node {p.dtmf} · {p.mode}</div></div>)} />
            </div>
          ) : table}
          {list.length > limit && <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show more ({(list.length - limit).toLocaleString()} more)</Button>}
        </>
      )}
    </ToolConsole>
  );
}
