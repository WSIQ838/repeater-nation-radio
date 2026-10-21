import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wrench, RadioTower, Landmark, Radio, Music, ClipboardList, Ruler, ShieldAlert,
  Cable, Zap, MapPin, CloudSun, Sunrise, BookOpen, Loader2, Megaphone, MapPinned,
  Cpu, Trees, Navigation, Binary, Plane, Antenna, Satellite, Activity, GraduationCap,
  Trophy, FileDown, MessageSquare, RadioReceiver, Network, Waves, Sun, Search, HelpCircle, Mountain,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { loadToolsConfig } from '@/lib/configCache';

// Every tool, grouped by what an operator is trying to do. Items with a
// `flag` can be switched off by an admin (Admin -> Settings -> tools);
// the rest are always shown. `comingSoon` items render as placeholders.
const CATEGORIES = [
  {
    id: 'most-used', title: 'Most Used', blurb: 'The tools members reach for most.',
    items: [
      { to: '/tools/net-control', icon: Megaphone, title: 'Net Control', desc: 'Run live nets, manage check-ins, and track attendance.' },
      { to: '/tools/pota', icon: Trees, title: 'POTA — Parks on the Air', desc: 'Plan park activations, log contacts, and track POTA activity.' },
      { to: '/equipment', icon: Cpu, title: 'Equipment Manager', desc: 'Track your radios, antennas, and gear.' },
      { to: '/logbook', icon: BookOpen, title: 'QSO / Contact Logger', desc: 'Log contacts and manage your radio activity.' },
      { to: '/tools/emergency', icon: ShieldAlert, title: 'Emergency & Situational Awareness', desc: 'Live alerts, earthquakes, and nearby GMRS/HAM infrastructure.' },
      { to: '/tools/sota', icon: Mountain, title: 'SOTA — Summits on the Air', desc: 'Summit directory and map, activations, chases, and SOTA CSV.' },
    ],
  },
  {
    id: 'directories', title: 'Repeaters & Directories', blurb: 'Find repeaters, look up callsigns, and listen in.',
    items: [
      { to: '/tools/gmrs-directory', icon: RadioTower, title: 'GMRS Directory', desc: 'Browse GMRS repeaters on the map and in the directory.' },
      { to: '/tools/ham-directory', icon: RadioTower, title: 'HAM Directory', desc: 'Browse amateur radio repeaters on the map and in the directory.' },
      { to: '/tools/fcc', icon: Landmark, title: 'FCC / Callsign Lookup', desc: 'FCC ULS and callsign lookup.' },
      { to: '/tools/sdr', icon: Antenna, title: 'SDR Streams', desc: 'Browse and submit member-run SDR web receivers.' },
    ],
  },
  {
    id: 'logbook', title: 'Logbook & Awards', blurb: 'Log contacts, confirm them, and track your progress.',
    items: [
      { to: '/logbook', icon: BookOpen, title: 'QSO / Contact Logger', desc: 'Log contacts and manage your radio activity.' },
      { to: '/tools/adif', icon: FileDown, title: 'ADIF Import / Export', desc: 'Move contacts between your logbook and other loggers.' },
      { to: '/tools/qsl', icon: MessageSquare, title: 'QSL Management', desc: 'Track QSLs sent, requested, and received.' },
      { to: '/tools/awards', icon: Trophy, title: 'HAM Awards Tracker', desc: 'Worked All States, grids, counties, and bands from your log.' },
      { to: '/tools/contest', icon: ClipboardList, title: 'Contest Logging', desc: 'Fast logging with dupe checks and Cabrillo export.' },
      { to: '/tools/qrz', icon: BookOpen, title: 'QRZ Logbook Sync', desc: 'Upload contacts to your QRZ Logbook or bring your QRZ log in.' },
      { to: '/tools/lotw', icon: Trophy, title: 'LoTW Confirmations', desc: 'Mark contacts confirmed in Logbook of The World.' },
      { to: '/tools/eqsl', icon: MessageSquare, title: 'eQSL Confirmations', desc: 'Mark contacts confirmed by eQSL cards.' },
    ],
  },
  {
    id: 'operating', title: 'On the Air & Nets', blurb: 'Run nets, activate parks, and plan trips.',
    items: [
      { to: '/tools/net-control', icon: Megaphone, title: 'Net Control', desc: 'Run live nets, manage check-ins, and track attendance.' },
      { to: '/tools/pota', icon: Trees, title: 'POTA — Parks on the Air', desc: 'Plan park activations, log contacts, and track POTA activity.' },
      { to: '/tools/sota', icon: Mountain, title: 'SOTA — Summits on the Air', desc: 'Summit directory and map, activations, chases, and SOTA CSV.' },
      { to: '/trips', icon: MapPinned, title: 'Trip Planner', desc: 'Plan routes and find repeaters along the way.' },
      { to: '/gps', icon: Navigation, title: 'GPS Navigation', desc: 'Turn-by-turn navigation with live repeater detection.' },
      { to: '/equipment', icon: Cpu, title: 'Equipment Manager', desc: 'Track your radios, antennas, and gear.' },
    ],
  },
  {
    id: 'propagation', title: 'Propagation & Spotting', blurb: 'Band conditions and where signals are being heard.',
    items: [
      { to: '/tools/space-weather', icon: Sun, title: 'Solar / Space Weather', desc: 'Solar flux, sunspots, Kp, and NOAA space-weather scales.' },
      { to: '/tools/propagation', icon: Activity, title: 'HF Propagation', desc: 'Day and night HF band conditions and VHF openings.' },
      { to: '/tools/dx-cluster', icon: Activity, title: 'DX Cluster', desc: 'Live DX spots, filterable by band.' },
      { to: '/tools/psk-reporter', icon: RadioReceiver, title: 'PSK Reporter', desc: 'See where your digital signals are being heard.' },
      { to: '/tools/wspr', icon: Waves, title: 'WSPR Propagation', desc: 'Map where a WSPR beacon was heard over the last day.' },
      { to: '/tools/rbn', icon: Waves, title: 'Reverse Beacon Network', desc: 'Which skimmers heard your CW, RTTY or FT8 signal.' },
    ],
  },
  {
    id: 'satellites', title: 'Satellites', blurb: 'Track satellites and predict passes over you.',
    items: [
      { to: '/tools/iss', icon: Satellite, title: 'ISS Pass Tracker', desc: 'Where the ISS is now and when it passes over you.' },
      { to: '/tools/satellites', icon: Satellite, title: 'Amateur Satellite Tracker', desc: 'Live positions and passes for amateur satellites.' },
    ],
  },
  {
    id: 'digital', title: 'Digital Radio Networks', blurb: 'DMR, D-STAR, AllStarLink, EchoLink, and WIRES-X.',
    items: [
      { to: '/tools/digital/brandmeister', icon: Network, title: 'DMR / BrandMeister', desc: 'Map and list of BrandMeister DMR repeaters.' },
      { to: '/tools/digital/dstar', icon: Network, title: 'D-STAR / Reflectors', desc: 'XLX multi-mode reflectors and their dashboards.' },
      { to: '/tools/digital/allstar', icon: Network, title: 'AllStarLink Nodes', desc: 'Search AllStarLink nodes and check live status.' },
      { to: '/tools/digital/echolink', icon: Network, title: 'EchoLink Nodes', desc: 'EchoLink repeaters, links, and conferences online now.' },
      { to: '/tools/digital/wiresx', icon: Network, title: 'WIRES-X Nodes', desc: 'Map and list of active WIRES-X nodes and rooms.' },
      { to: '/tools/aprs', icon: Radio, title: 'APRS', desc: 'Latest APRS position or weather report for a station.' },
    ],
  },
  {
    id: 'awareness', title: 'Weather & Situational Awareness', blurb: 'Conditions, alerts, and what is overhead.',
    items: [
      { to: '/tools/emergency', icon: ShieldAlert, title: 'Emergency & Situational Awareness', desc: 'Live alerts, earthquakes, and nearby GMRS/HAM infrastructure.' },
      { to: '/tools/weather', icon: CloudSun, title: 'Weather', desc: 'Current conditions and forecast.', flag: 'tool_weather' },
      { to: '/tools/sunrise', icon: Sunrise, title: 'Sunrise & Sunset', desc: 'Sun times and civil twilight.', flag: 'tool_sunrise_sunset' },
      { to: '/tools/flight-radar', icon: Plane, title: 'Flight Radar', desc: 'View live aircraft positions and search ADS-B traffic.' },
    ],
  },
  {
    id: 'calculators', title: 'Calculators & Reference', blurb: 'Quick math and look-ups for building and tuning a station.',
    items: [
      { to: '/tools/frequency', icon: Radio, title: 'Frequency Calculator', desc: 'Repeater input/output and offset math.', flag: 'tool_frequency_calc' },
      { to: '/tools/tone', icon: Music, title: 'CTCSS / DCS Tones', desc: 'Search and copy tones and codes.', flag: 'tool_tone_calc' },
      { to: '/tools/channels', icon: ClipboardList, title: 'Channel Planner', desc: 'Build, save, and export channel lists.', flag: 'tool_channel_planner' },
      { to: '/tools/antenna', icon: Ruler, title: 'Antenna Calculator', desc: 'Estimate 1/4, 1/2, and 5/8 wave lengths.', flag: 'tool_antenna_calc' },
      { to: '/tools/coax', icon: Cable, title: 'Coax Loss Calculator', desc: 'Estimate feedline loss and remaining power.', flag: 'tool_coax_calc' },
      { to: '/tools/power', icon: Zap, title: 'Power & ERP Calculator', desc: 'Estimate EIRP and ERP from your system.', flag: 'tool_power_calc' },
      { to: '/tools/distance', icon: MapPin, title: 'Distance Calculator', desc: 'Measure distance between two locations.', flag: 'tool_distance_calc' },
      { to: '/tools/morse', icon: Binary, title: 'Morse Code Chart', desc: 'Reference chart plus a text ⇄ Morse converter.', flag: 'tool_morse_code' },
    ],
  },
  {
    id: 'learning', title: 'HAM Learning', blurb: 'Study for your license and practice the exam.',
    items: [
      { to: '/tools/ham-study', icon: GraduationCap, title: 'HAM Study / Flashcards', desc: 'Learn the question pool by topic and track what you know.' },
      { to: '/tools/ham-exam', icon: GraduationCap, title: 'HAM License Practice Exams', desc: 'Technician, General, and Extra practice tests from the official pools.' },
      { to: '/help', icon: HelpCircle, title: 'Help & Guides', desc: 'Guides for the tools and features on Repeater Nation.' },
    ],
  },
];

// Planned tools waiting on something outside this app. Empty for now; the
// section and its jump button hide themselves when there's nothing here.
const COMING_SOON = [];

function ToolCard({ item }) {
  const Icon = item.icon;
  return (
    <Link to={item.to}>
      <Card className="p-5 h-full hover:border-primary/50 hover:shadow-md transition-all">
        <Icon className="w-7 h-7 text-primary mb-3" />
        <div className="font-heading font-semibold">{item.title}</div>
        <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
      </Card>
    </Link>
  );
}

function ComingSoonCard({ item }) {
  const Icon = item.icon;
  return (
    <Card className="p-5 h-full border-dashed bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <Icon className="w-7 h-7 text-primary shrink-0" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border rounded-full px-2 py-1">
          Coming soon
        </span>
      </div>
      <div className="font-heading font-semibold mt-3">{item.title}</div>
      <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
    </Card>
  );
}

export default function Tools() {
  const [config, setConfig] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadToolsConfig()
      .then((config) => setConfig(config || {}))
      .catch(() => setConfig({}));
  }, []);

  const q = query.trim().toLowerCase();

  const sections = useMemo(() => {
    // Flagged tools stay hidden until the config loads, so a disabled tool
    // never flashes on screen.
    const enabled = (item) => !item.flag || (config !== null && config[item.flag] !== false);
    return CATEGORIES
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => enabled(item) && (!q || `${item.title} ${item.desc} ${cat.title}`.toLowerCase().includes(q))),
      }))
      .filter((cat) => cat.items.length);
  }, [config, q]);

  const comingSoon = COMING_SOON.filter((item) => !q || `${item.title} ${item.desc}`.toLowerCase().includes(q));

  const jump = (id) => document.getElementById(`tools-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Wrench className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">Operator Tools</h1>
            <p className="text-sm text-muted-foreground">GMRS, HAM, digital radio, and other tools for everyday radio use.</p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools" className="pl-9" aria-label="Search tools" />
        </div>
      </div>

      {!q && (
        <nav aria-label="Tool categories" className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button key={cat.id} type="button" onClick={() => jump(cat.id)}
              className="text-xs font-medium rounded-full border px-3 py-1.5 hover:border-primary/50 hover:text-primary transition-colors">
              {cat.title}
            </button>
          ))}
          {COMING_SOON.length > 0 && (
            <button type="button" onClick={() => jump('coming-soon')}
              className="text-xs font-medium rounded-full border border-dashed px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              Coming soon
            </button>
          )}
        </nav>
      )}

      {config === null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading tools…</div>
      )}

      {sections.map((cat) => (
        <section key={cat.id} id={`tools-${cat.id}`} className="scroll-mt-6">
          <div className="mb-3">
            <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">{cat.title}</h2>
            <p className="text-xs text-muted-foreground">{cat.blurb}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {cat.items.map((item) => (item.comingSoon
              ? <ComingSoonCard key={item.title} item={item} />
              : <ToolCard key={item.to} item={item} />))}
          </div>
        </section>
      ))}

      {config !== null && q && !sections.length && !comingSoon.length && (
        <p className="text-sm text-muted-foreground">No tools match “{query}”.</p>
      )}

      {comingSoon.length > 0 && (
        <section id="tools-coming-soon" className="scroll-mt-6">
          <div className="mb-3">
            <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">Coming soon</h2>
            <p className="text-xs text-muted-foreground">Planned tools that need a partner service's access before they can be built.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {comingSoon.map((item) => <ComingSoonCard key={item.title} item={item} />)}
          </div>
        </section>
      )}
    </div>
  );
}
