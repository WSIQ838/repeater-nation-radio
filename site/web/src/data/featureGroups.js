import {
  RadioTower, BookOpen, Map, Cpu, Users, CalendarDays, MessagesSquare,
  IdCard, MessageCircle, Award, Route, Compass, ShieldCheck, Gauge,
  Wrench, Hash, CloudSun, Search, Radio, Trees, Mountain, Navigation,
  FileDown, Mail, Trophy, CheckCircle2, Sun, Waves, Satellite, Network,
  ShieldAlert, Plane, GraduationCap, Headphones,
} from 'lucide-react';

export const featureGroups = [
  {
    label: 'Core Platform',
    features: [
      { icon: RadioTower, title: 'Repeater Directory', text: 'Search the nationwide GMRS and HAM repeater network with an interactive map, coverage radius, live status, and access controls.' },
      { icon: Radio, title: 'Web Radio', text: 'Talk with other members right from your browser: push-to-talk channels and zones, scanning, roger beeps, and direct calls to members who are online.' },
      { icon: BookOpen, title: 'Digital Logbook', text: 'Log every QSO with GPS, signal reports, weather, and auto-filled FCC location data. Filter, export, and visualize on a map.' },
      { icon: Map, title: 'Community Map', text: 'See repeaters, contacts, clubs, and events across the country on an interactive map with clustering and filters.' },
      { icon: Cpu, title: 'Equipment Manager', text: 'Track your radios, antennas, and accessories with serials, warranties, and maintenance history — all in one place.' },
      { icon: Headphones, title: 'SDR Streams', text: 'Browse and listen to member-run SDR web receivers, or share your own.' },
    ],
  },
  {
    label: 'Community & Social',
    features: [
      { icon: Users, title: 'Clubs & Community', text: 'Create or join clubs with discussion forums, club pages, event calendars, member rosters, and paid memberships via Stripe.' },
      { icon: CalendarDays, title: 'Events & Nets', text: 'Weekly nets, meetups, training classes, and public service events — all in one shared community calendar.' },
      { icon: MessagesSquare, title: 'Forums', text: 'Discuss gear, ask questions, share repeater news, and connect with operators in categorized community forums.' },
      { icon: IdCard, title: 'Member Directory', text: 'Browse a searchable directory of verified GMRS and HAM operators. View profiles, callsigns, locations, and earned badges.' },
      { icon: MessageCircle, title: 'Messaging', text: 'Send private messages, receive notifications, and keep in touch with other GMRS and HAM operators.' },
      { icon: Award, title: 'Badges & Achievements', text: 'Earn badges for logging contacts, contributing repeaters, posting in forums, and more. Showcase them on your profile.' },
    ],
  },
  {
    label: 'On the Air & Planning',
    features: [
      { icon: Compass, title: 'Net Control', text: 'Run live net control sessions with rosters, check-ins, roll-call scripts, emergency mode positions, and attendance reporting.' },
      { icon: Trees, title: 'POTA — Parks on the Air', text: 'Plan park activations, log contacts from the field, and follow POTA activity across the community.' },
      { icon: Mountain, title: 'SOTA — Summits on the Air', text: 'A summit directory and map, scheduled and live activations with rosters and co-hosts, qualification tracking, chases, and SOTA CSV export.' },
      { icon: Route, title: 'Trip Planner', text: 'Plan routes with start/end geocoding, multi-stop waypoints, driving distance and time, and in-range repeater discovery along the way.' },
      { icon: Navigation, title: 'GPS Navigation', text: 'Turn-by-turn navigation that shows the repeaters in range as you drive.' },
      { icon: ShieldCheck, title: 'Callsign Management', text: 'Secure callsign authorization system. Claim your callsign, approve family access requests, and track all shared usage in an audit log.' },
    ],
  },
  {
    label: 'Logbook & Awards',
    features: [
      { icon: FileDown, title: 'ADIF Import & Export', text: 'Move contacts between your logbook and other logging software with standard ADIF files.' },
      { icon: Mail, title: 'QSL Management', text: 'Track QSL cards sent, requested, and received for every contact.' },
      { icon: Trophy, title: 'HAM Awards Tracker', text: 'Progress toward Worked All States, grids, counties, and band totals, built straight from your log.' },
      { icon: Hash, title: 'Contest Logging', text: 'Fast contest entry with dupe checking, exchanges, and Cabrillo export.' },
      { icon: CheckCircle2, title: 'QRZ, LoTW & eQSL', text: 'Sync contacts with your QRZ Logbook, and mark contacts confirmed from your LoTW and eQSL downloads.' },
    ],
  },
  {
    label: 'Propagation, Satellites & Digital',
    features: [
      { icon: Sun, title: 'Space Weather & HF Propagation', text: 'Solar flux, sunspots, Kp, NOAA space-weather scales, and day/night HF band conditions.' },
      { icon: Waves, title: 'Spotting Networks', text: 'DX Cluster spots, PSK Reporter, WSPR, and the Reverse Beacon Network: see where your signal is being heard.' },
      { icon: Satellite, title: 'ISS & Satellite Tracker', text: 'Live positions and upcoming passes over your location for the ISS and amateur satellites.' },
      { icon: Network, title: 'Digital Radio Networks', text: 'Browse BrandMeister DMR, D-STAR/XLX reflectors, AllStarLink, EchoLink, and WIRES-X, plus APRS station lookups.' },
    ],
  },
  {
    label: 'Awareness & Operator Toolbox',
    features: [
      { icon: ShieldAlert, title: 'Emergency & Situational Awareness', text: 'Live weather alerts, earthquakes, wildfires, shelters, and the nearby GMRS/HAM repeaters for any area.' },
      { icon: CloudSun, title: 'Weather & Sunrise/Sunset', text: 'Check current weather conditions and sunrise/sunset times for any location — perfect for planning outdoor operations.' },
      { icon: Plane, title: 'Flight Radar', text: 'Live aircraft positions and ADS-B traffic around you.' },
      { icon: Gauge, title: 'Frequency & Tone Calculators', text: 'Calculate GMRS and HAM frequencies, offsets, and CTCSS/DCS tones with built-in channel reference tables.' },
      { icon: Wrench, title: 'Antenna, Coax & ERP Calculators', text: 'Calculate antenna lengths, coax loss, SWR impact, ERP, and distances for your station setup.' },
      { icon: Hash, title: 'Channel Planner & Morse', text: 'Build, save, and print channel lists, with a Morse code chart and text-to-Morse converter.' },
      { icon: Search, title: 'FCC License Lookup', text: 'Look up any GMRS or HAM callsign directly from the FCC ULS database with real-time results.' },
    ],
  },
  {
    label: 'HAM Learning',
    features: [
      { icon: GraduationCap, title: 'Practice Exams', text: 'Technician, General, and Extra practice tests drawn from the current official question pools.' },
      { icon: BookOpen, title: 'Study & Flashcards', text: 'Learn the question pool topic by topic and track which questions you know.' },
    ],
  },
];
