import { HelpCircle } from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

const GROUPS = [
  {
    title: 'Getting Started',
    items: [
      { q: 'Set up your profile', a: 'Open Profile from the sidebar to add your display name, callsign, avatar, banner, bio, location, and social links. Your profile is visible to other members in the directory.' },
      { q: 'Claim your callsign', a: 'Open Callsign Management to claim the callsign tied to your FCC license. The system verifies it against the FCC ULS. You can also authorize other operators to use your callsign, or request access to use someone else\'s.' },
      { q: 'Use the Dashboard', a: 'Your Dashboard is your home base — it shows your stats, recent activity, announcements, and quick links to every part of the platform.' },
    ],
  },
  {
    title: 'Repeaters & Map',
    items: [
      { q: 'Find repeaters', a: 'The Repeater Directory lets you search and filter by state, city, frequency, mode, status, access, and verification. Click any repeater for full details, tones, coverage, and comments.' },
      { q: 'Use the Community Map', a: 'The map loads repeaters dynamically as you pan and zoom. Toggle the Repeaters, Clubs, and Events layers, filter with the bar above, search, and sort. Click a marker for details or fly to it from the results list.' },
      { q: 'Manage your own repeaters', a: 'If a repeater\'s owner callsign matches yours, you become its owner. Manage access requests, reveal or hide tones, and update status from My Repeaters.' },
    ],
  },
  {
    title: 'Logging & Equipment',
    items: [
      { q: 'Log contacts (QSOs)', a: 'The Logbook records each contact — date, callsign, frequency, channel, mode, signal report, radio, antenna, power, weather, location, and notes. Distances are calculated automatically.' },
      { q: 'Track your equipment', a: 'The Equipment Manager keeps a list of your radios, antennas, feedlines, and accessories so you can reference them when logging contacts or planning a setup.' },
    ],
  },
  {
    title: 'Community',
    items: [
      { q: 'Join and run Clubs', a: 'Browse Clubs, join open ones, or create your own. Club owners manage members, pages, discussion threads, events, and optional paid memberships via Stripe. Each club profile includes a Nets tab showing all associated nets with live status.' },
      { q: 'Find and attend Events', a: 'The Events page lists upcoming club and community events you have access to. Club members, owners, and admins can see their club\'s events.' },
      { q: 'Use the Forums', a: 'Post questions, swap gear, and share knowledge in the Forums. Filter by category and tags, upvote or downvote, mention members, and attach photos.' },
      { q: 'Browse the Member Directory', a: 'The Directory lists all members alphabetically. Open any profile to see their bio, callsign, badges, and activity.' },
      { q: 'Message friends', a: 'Send a friend request from a member\'s profile. Once accepted, you can exchange private messages and see when they\'re online.' },
    ],
  },
  {
    title: 'Trip Planning & Nets',
    items: [
      { q: 'Plan a trip with repeaters', a: 'The Trip Planner geocodes your start and end addresses, lets you add stops, finds repeaters within your search radius along the route, optimizes the order, and exports the results.' },
      { q: 'Run a Net Control session', a: 'Net Control lets you schedule and run live nets, sync a club roster, manage check-ins in real time, use emergency mode with position assignments, and record attendance. When you start a net, its status automatically changes to LIVE — on the club profile and anywhere it appears.' },
      { q: 'Associate a net with a club', a: 'When creating a net, use the Associated Club selector to link it to a club you belong to or manage. The net then appears on that club\'s profile under the Nets tab, grouped into Live, Upcoming, and Past. Choose "No Club / Independent Net" for nets that aren\'t tied to a club. Multiple nets can be associated with the same club.' },
      { q: 'Collaborative Net Control (co-hosts)', a: 'Invite other operators to co-host a net from the Hosts tab when creating, or from the Share button during a live session. Co-hosts get permission tiers: Full (all controls), Check-in (check in/out, guests, notes), or View (read-only). The primary operator can transfer control or remove co-hosts at any time. All hosts see check-ins and script updates sync in real time.' },
      { q: 'Share a live net session', a: 'During a live net, click Share to invite co-hosts by searching for members by name or callsign. Invited operators get an in-app notification and can accept or decline from the Net Control page under "Shared With Me."' },
    ],
  },
  {
    title: 'Gamification & Achievements',
    items: [
      { q: 'Net check-in streaks', a: 'When you check in to a club net, your attendance streak is tracked automatically. Each club has its own independent streak per member. Streaks grow with consecutive qualifying check-ins and reset when a qualifying net is missed (based on the club\'s net schedule).' },
      { q: 'Earn badges', a: 'Badges are awarded for milestones like your first check-in, streak achievements, forum participation, repeater contributions, profile completion, and more. Some badges are automatic; others are manually awarded by admins. View your badges on your profile.' },
      { q: 'Club leaderboards', a: 'Clubs with leaderboards enabled show a ranking of members by longest check-in streak. Compete with fellow members and build your streak by attending nets regularly.' },
      { q: 'Club streak badges', a: 'Each club tracks your longest streak with a per-club streak badge. Check in consistently to build your streak and earn higher-tier badges.' },
      { q: 'Configure club gamification', a: 'Club owners can enable or disable gamification, toggle leaderboards, select which check-in types count toward streaks (standard, late, guest, mobile), and set the net schedule that determines when a missed net resets streaks — all from the club profile.' },
    ],
  },
  {
    title: 'Operator Tools',
    items: [
      { q: 'Frequency Calculator', a: 'Enter a repeater output frequency and offset to compute the input frequency and confirm proper spacing.' },
      { q: 'CTCSS / DCS Tones', a: 'Look up standard CTCSS tones and DCS codes, then copy them for programming your radio.' },
      { q: 'Channel Planner', a: 'Build, save, and export custom channel lists for programming multiple radios consistently.' },
      { q: 'Antenna Calculator', a: 'Enter a frequency to estimate quarter-wave, half-wave, and five-eighths-wave element lengths.' },
      { q: 'Coax Loss Calculator', a: 'Pick a feedline type and length to estimate signal loss and the power remaining at the antenna.' },
      { q: 'Power & ERP Calculator', a: 'Enter radio power, feedline loss, and antenna gain to estimate your effective radiated power.' },
      { q: 'Distance Calculator', a: 'Measure the great-circle distance between two coordinates or locations.' },
      { q: 'Weather & Sunrise/Sunset', a: 'Check current conditions and forecasts, and look up sunrise, sunset, and civil twilight times for any location.' },
      { q: 'FCC / Callsign Lookup', a: 'Search the FCC ULS database by callsign to verify license status, expiration, and location.' },
      { q: 'Morse Code Chart', a: 'Reference the full letter, number, and punctuation chart, plus a live text-to-Morse and Morse-to-text converter.' },
    ],
  },
];

export default function HelpSection() {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="w-4 h-4 text-primary" />
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">Help — How to use everything</h2>
      </div>
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="font-heading font-semibold mb-1">{g.title}</h3>
            <Accordion type="single" collapsible>
              {g.items.map((it, i) => (
                <AccordionItem key={i} value={`${g.title}-${i}`}>
                  <AccordionTrigger>{it.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">{it.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </section>
  );
}