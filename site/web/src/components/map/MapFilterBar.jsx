import { Input } from '@/components/ui/input';
import { SlidersHorizontal, X } from 'lucide-react';
import { GMRS_REPEATER_CHANNELS } from '@/lib/gmrsChannels';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
];

const GMRS_FREQS = GMRS_REPEATER_CHANNELS;

// Amateur-radio band ranges used by the HAM directory filter. Must stay in
// sync with the HAM_BANDS map in base44/functions/query-repeaters/entry.ts.
const HAM_BANDS = [
  { value: '10m', label: '10m (28–29.7 MHz)', min: 28, max: 29.7 },
  { value: '6m', label: '6m (50–54 MHz)', min: 50, max: 54 },
  { value: '2m', label: '2m (144–148 MHz)', min: 144, max: 148 },
  { value: '1.25m', label: '1.25m (222–225 MHz)', min: 222, max: 225 },
  { value: '70cm', label: '70cm (420–450 MHz)', min: 420, max: 450 },
  { value: '33cm', label: '33cm (902–928 MHz)', min: 902, max: 928 },
  { value: '23cm', label: '23cm (1240–1300 MHz)', min: 1240, max: 1300 },
];

// Digital voice / linking technologies parsed from the repeater's notes text,
// since the Repeater entity has no dedicated field for this. Each option lists
// every spelling variant the RepeaterBook importers write into notes (the API
// importer and the HTML-scraper importer use slightly different labels for
// the same technology), so the filter matches records from either source.
const HAM_TECH_GROUPS = [
  {
    label: 'Digital Voice',
    options: [
      { value: 'DMR', label: 'DMR' },
      { value: 'D-STAR', label: 'D-STAR' },
      { value: 'NXDN', label: 'NXDN' },
      { value: 'P25', label: 'P-25' },
      { value: 'M17', label: 'M17' },
      { value: 'TETRA', label: 'TETRA' },
      { value: 'FUSION', label: 'Fusion (YSF)' },
    ],
  },
  {
    label: 'Internet Linking',
    options: [
      { value: 'WIRESX', label: 'WIRES-X' },
      { value: 'ECHOLINK', label: 'EchoLink' },
      { value: 'ALLSTAR', label: 'AllStar' },
      { value: 'IRLP', label: 'IRLP' },
    ],
  },
];

const selectClass = 'h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm';

export default function MapFilterBar({ filters, onChange, resultCount, fetching, service = 'GMRS' }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const clear = () => onChange({});
  const activeCount = Object.values(filters || {}).filter((v) => v !== '' && v != null).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
        <SlidersHorizontal className="w-4 h-4" /> Filters:
      </div>
      <select value={filters.state || ''} onChange={(e) => set('state', e.target.value)} className={selectClass}>
        <option value="">All States</option>
        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <Input value={filters.city || ''} onChange={(e) => set('city', e.target.value)} placeholder="City" className="h-9 w-28" />
      <Input value={filters.callsign || ''} onChange={(e) => set('callsign', e.target.value.toUpperCase())} placeholder="Callsign" className="h-9 w-28 uppercase" />
      {service === 'HAM' ? (
        <select value={filters.band || ''} onChange={(e) => set('band', e.target.value)} className={selectClass}>
          <option value="">All HAM Bands</option>
          {HAM_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      ) : (
        <select value={filters.frequency || ''} onChange={(e) => set('frequency', e.target.value)} className={selectClass}>
          <option value="">All GMRS Freqs</option>
          {GMRS_FREQS.map((c) => <option key={c.ch} value={c.freq}>{c.label}</option>)}
        </select>
      )}
      <select value={filters.mode || ''} onChange={(e) => set('mode', e.target.value)} className={selectClass}>
        <option value="">All Modes</option>
        <option value="Analog">Analog</option>
        <option value="Digital">Digital</option>
        <option value="Mixed">Mixed</option>
      </select>
      {service === 'HAM' && (
        <select value={filters.tech || ''} onChange={(e) => set('tech', e.target.value)} className={selectClass}>
          <option value="">Any Technology</option>
          {HAM_TECH_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      )}
      <select value={filters.status || ''} onChange={(e) => set('status', e.target.value)} className={selectClass}>
        <option value="">All Status</option>
        <option value="Online">Online</option>
        <option value="Offline">Offline</option>
        <option value="Maintenance">Maintenance</option>
      </select>
      <select value={filters.verification || ''} onChange={(e) => set('verification', e.target.value)} className={selectClass}>
        <option value="">All Verification</option>
        <option value="Verified">Verified</option>
        <option value="Pending">Pending</option>
        <option value="Needs Review">Needs Review</option>
        <option value="Rejected">Rejected</option>
      </select>
      <select value={filters.access || ''} onChange={(e) => set('access', e.target.value)} className={selectClass}>
        <option value="">All Access</option>
        <option value="Public">Public</option>
        <option value="Closed">Closed</option>
      </select>
      <Input
        value={filters.tone || ''}
        onChange={(e) => set('tone', e.target.value)}
        placeholder={service === 'HAM' ? 'Tone/Code' : 'Tone'}
        className={service === 'HAM' ? 'h-9 w-28' : 'h-9 w-20'}
      />
      <Input type="number" value={filters.radius || ''} onChange={(e) => set('radius', e.target.value)} placeholder="Radius (mi)" className="h-9 w-28" />
      {activeCount > 0 && (
        <button onClick={clear} className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground hover:text-foreground hover:bg-accent">
          <X className="w-3.5 h-3.5" /> Clear ({activeCount})
        </button>
      )}
      <span className="text-sm text-muted-foreground ml-auto shrink-0">
        {fetching ? 'Loading…' : `${resultCount} repeaters`}
      </span>
    </div>
  );
}
