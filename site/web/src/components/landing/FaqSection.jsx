import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const FAQS = [
  {
    q: 'What is GMRS and how is it different from FRS or Ham radio?',
    a: 'GMRS (General Mobile Radio Service) is a licensed FCC radio service operating on channels around 462–467 MHz. Unlike FRS, GMRS allows up to 50 watts of power and repeater use for much longer range. Unlike amateur (Ham) radio, GMRS requires no exam — just a simple FCC application. One license covers your entire immediate family for 10 years.',
  },
  {
    q: 'Do I need a license to use GMRS?',
    a: 'Yes. GMRS requires an FCC license, but there is no test. You register for an FRN (FCC Registration Number) in CORES, apply through the ULS, and pay a one-time $35 fee. Your license is valid for 10 years and covers your whole family. See the "Get Licensed" section above for step-by-step instructions.',
  },
  {
    q: 'Does Repeater Nation support HAM (amateur) radio too?',
    a: 'Yes. Repeater Nation supports both GMRS and amateur (HAM) radio side by side — a dedicated HAM repeater directory with band and digital-mode filters (DMR, D-STAR, YSF, P25, NXDN, M17), HAM callsign verification, GPS navigation with HAM repeater detection, and step-by-step Technician license instructions on our "Get Licensed" page.',
  },
  {
    q: 'Is Repeater Nation free to use?',
    a: 'Yes! Creating an account, logging contacts, browsing the repeater map, joining clubs, using the operator tools, and participating in the community are all free. Some clubs may offer paid memberships with premium features — those are set by individual club owners.',
  },
  {
    q: 'How do I verify my callsign on Repeater Nation?',
    a: 'After registering, go to your Profile and enter your FCC callsign. We verify it against the FCC Universal Licensing System (ULS) in real time. Once verified, you earn a "Verified" badge on your profile and your callsign is linked across the platform.',
  },
  {
    q: 'Can I share my callsign with family members?',
    a: 'Yes. Repeater Nation includes a secure Callsign Authorization system. As the primary license holder, you can approve or deny requests from family members to use your callsign on their own accounts. All shared usage is tracked in an audit log for accountability.',
  },
  {
    q: 'What are repeaters and how do I find them?',
    a: 'Repeaters are stations that re-broadcast your signal to extend range — often 30+ miles from a good site. Our interactive Repeater Directory and Community Map show verified repeaters nationwide with frequency, tone, coverage radius, and live status. You can filter by location, access type, and more.',
  },
  {
    q: 'Can I create my own club on Repeater Nation?',
    a: 'Absolutely. Any member can create a club, set a description, upload a logo, and invite others. Club owners get tools for member management, discussion forums, club pages, event calendars, and net control sessions. You can even set up paid memberships with Stripe Connect.',
  },
  {
    q: 'What operator tools are included?',
    a: 'Repeater Nation offers a full Operator Toolbox: Frequency Calculator, CTCSS/DCS Tone Calculator, Channel Planner, Antenna Calculator, Coax Loss Calculator, Power/ERP Calculator, Distance Calculator, Weather Tool, Sunrise & Sunset tool, and an FCC License Lookup — all free.',
  },
  {
    q: 'How does the Digital Logbook work?',
    a: 'Log every QSO (contact) with callsign, frequency, channel, signal report, radio used, GPS location, and notes. When you enter a callsign, we auto-fill the location from the FCC database. You can filter, search, export, and visualize your contacts on a map.',
  },
  {
    q: 'What is the Trip Planner?',
    a: 'Plan a road trip or outdoor adventure and Repeater Nation will find GMRS and HAM repeaters along your route. Enter start and end addresses, add waypoints, and we geocode everything, calculate driving distance and time, and show in-range repeaters near each stop. Pair it with GPS Navigation for live turn-by-turn directions and repeater detection while you drive.',
  },
  {
    q: 'How do badges and achievements work?',
    a: 'Earn badges by being active in the community — logging contacts, contributing repeaters, posting in forums, completing your profile, and more. Some badges are awarded automatically based on your activity; others are given manually by admins. Display your earned badges on your public profile.',
  },
  {
    q: 'Does Repeater Nation work on mobile?',
    a: 'Yes. The entire platform is fully responsive and works beautifully on phones and tablets. You can also install it as a native app on iOS and Android from the same codebase, with push notifications for messages and alerts.',
  },
  {
    q: 'Is my data private and secure?',
    a: 'Your logbook, equipment, trips, and messages are private to you. Your profile and callsign are visible to other community members. Admins can manage platform-wide data for moderation. We use row-level security to ensure each user only sees what they are allowed to see.',
  },
];

export default function FaqSection() {
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="max-w-3xl mx-auto px-5 py-20 scroll-mt-16">
      <div className="text-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">FAQ</span>
        <h2 className="mt-2 text-3xl sm:text-4xl font-heading font-bold">Frequently asked questions</h2>
        <p className="mt-4 text-muted-foreground">Everything you need to know about GMRS, HAM radio, and the Repeater Nation platform.</p>
      </div>
      <div className="mt-10 space-y-3">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-accent/40 transition-colors"
              >
                <span className="font-heading font-semibold text-[15px]">{item.q}</span>
                <ChevronDown className={cn('w-5 h-5 text-muted-foreground shrink-0 transition-transform', isOpen && 'rotate-180')} />
              </button>
              <div className={cn('grid transition-all duration-200', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}