import {
  RadioTower, BookOpen, Map, Cpu, Users, CalendarDays, MessagesSquare,
  IdCard, MessageCircle, Award, Route, Compass, ShieldCheck, Gauge,
  Wrench, Hash, CloudSun, Search,
} from 'lucide-react';

export const featureGroups = [
  {
    label: 'Core Platform',
    features: [
      { icon: RadioTower, title: 'Repeater Directory', text: 'Search the nationwide GMRS and HAM repeater network with an interactive map, coverage radius, live status, and access controls.' },
      { icon: BookOpen, title: 'Digital Logbook', text: 'Log every QSO with GPS, signal reports, weather, and auto-filled FCC location data. Filter, export, and visualize on a map.' },
      { icon: Map, title: 'Community Map', text: 'See repeaters, contacts, clubs, and events across the country on an interactive map with clustering and filters.' },
      { icon: Cpu, title: 'Equipment Manager', text: 'Track your radios, antennas, and accessories with serials, warranties, and maintenance history — all in one place.' },
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
    label: 'Planning & Operations',
    features: [
      { icon: Route, title: 'Trip Planner', text: 'Plan routes with start/end geocoding, multi-stop waypoints, driving distance and time, and in-range repeater discovery along the way.' },
      { icon: Compass, title: 'Net Control', text: 'Run live net control sessions with rosters, check-ins, roll-call scripts, emergency mode positions, and attendance reporting.' },
      { icon: ShieldCheck, title: 'Callsign Management', text: 'Secure callsign authorization system. Claim your callsign, approve family access requests, and track all shared usage in an audit log.' },
    ],
  },
  {
    label: 'Operator Toolbox',
    features: [
      { icon: Gauge, title: 'Frequency & Tone Calculators', text: 'Calculate GMRS and HAM frequencies, offsets, and CTCSS/DCS tones with built-in channel reference tables.' },
      { icon: Wrench, title: 'Antenna & Coax Calculators', text: 'Calculate antenna lengths, coax loss, SWR impact, and ERP for your station setup.' },
      { icon: Hash, title: 'Channel Planner', text: 'Plan and organize your channel assignments with a visual channel planner and printable reference.' },
      { icon: CloudSun, title: 'Weather & Sunrise/Sunset', text: 'Check current weather conditions and sunrise/sunset times for any location — perfect for planning outdoor operations.' },
      { icon: Search, title: 'FCC License Lookup', text: 'Look up any GMRS or HAM callsign directly from the FCC ULS database with real-time results.' },
    ],
  },
];