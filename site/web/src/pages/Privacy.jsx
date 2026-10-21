import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import StructuredData from '@/components/seo/StructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const pageSchema = {
  '@context': 'https://schema.org', '@type': 'WebPage',
  name: 'Privacy Policy — Repeater Nation', url: 'https://repeaternation.com/privacy',
  description: 'How Repeater Nation collects, uses, and protects member information across the GMRS and HAM radio community platform.',
};

const EFFECTIVE_DATE = 'September 23, 2026';

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-heading font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="w-9 h-9" />
            <span className="font-heading font-bold text-lg">Repeater Nation</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/register"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-16">
        <StructuredData data={pageSchema} />
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Privacy Policy' }]} />
        <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

        <p className="mt-8 text-lg text-muted-foreground leading-relaxed">
          This policy explains what information Repeater Nation collects, why, and how members can
          control it. It covers every part of the platform: the repeater and club directories, logbook,
          Net Control, GPS Navigation, forums, messaging, and payments.
        </p>

        <Section title="Information we collect">
          <p><strong className="text-foreground">Account information.</strong> Email address, password (stored hashed, never in plain text), and — if you provide them — your name, GMRS or HAM callsign, license number and status, location (city/state), bio, avatar and banner images, and social links.</p>
          <p><strong className="text-foreground">Callsign and license data.</strong> When you verify a callsign, we check it against the FCC's public license records (via OpenCallbook, itself backed by the FCC's own public ULS database) to confirm it's valid and currently licensed.</p>
          <p><strong className="text-foreground">Location data.</strong> Some tools ask for your location directly: GPS Navigation uses your live device location (only while that page is open, and only to show nearby repeaters and your position on the map) and Trip Planner uses a route you enter. Net Control and the logbook may also store a station's location when a callsign is checked in or a contact is logged, either typed in or looked up from the callsign.</p>
          <p><strong className="text-foreground">Content you create.</strong> Logbook contacts, forum posts and replies, club pages and events, direct messages to other members, Net Control check-ins and rosters, equipment records, and profile posts.</p>
          <p><strong className="text-foreground">Payment information.</strong> Donations and paid club memberships are processed by Stripe. We never see or store your card number — Stripe handles that directly and shares back only what's needed to confirm the transaction (amount, status, a transaction reference).</p>
          <p><strong className="text-foreground">Usage information.</strong> Basic activity like your last-active time (used for online/offline status, which you can hide in Profile settings) and, for administrators, audit logs of moderation actions.</p>
        </Section>

        <Section title="How we use it">
          <ul className="list-disc pl-5 space-y-2">
            <li>Operate core features — the repeater/club directories, logbook, Net Control, messaging, forums, and GPS tools.</li>
            <li>Verify callsigns and license status against public FCC records.</li>
            <li>Send email notifications you've opted into (announcements, forum replies, direct messages, access requests) — every category can be turned off individually in Profile settings, and there's a master switch to disable all of them.</li>
            <li>Play an in-app sound for new notifications and messages, unless you've muted it in Profile settings.</li>
            <li>Process donations and paid memberships through Stripe.</li>
            <li>Maintain the safety and integrity of the platform — moderation, abuse prevention, and account security.</li>
          </ul>
        </Section>

        <Section title="What's public vs. private">
          <p>
            Repeater Nation is a community directory, so some content is public by design: repeaters marked
            public, club pages, public events, forum posts, and a member's public profile (display name,
            callsign, bio, badges) are visible to anyone, including search engines, unless you or a club
            owner mark them private or hidden.
          </p>
          <p>
            Direct messages, your logbook, your email address, and your exact device location are never
            public. Your online/last-active status is visible to other members by default, but can be
            hidden in Profile settings.
          </p>
        </Section>

        <Section title="Third parties we work with">
          <p>We use a small number of outside services to run the platform, and only share what each one needs to do its job:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Stripe</strong> — payment processing for donations and memberships.</li>
            <li><strong className="text-foreground">OpenCallbook / FCC ULS</strong> — public callsign and license lookups.</li>
            <li><strong className="text-foreground">WeatherAPI.com</strong> — weather data for the Weather tool (location you provide, not stored by them on your behalf).</li>
            <li><strong className="text-foreground">Discord</strong> — if a club owner or administrator sets up a webhook, certain club or admin events can be posted to their Discord server. This is opt-in and configured by the club/admin, not by member-level accounts.</li>
          </ul>
          <p>We do not sell member data, and we do not share it with advertisers.</p>
        </Section>

        <Section title="Your controls">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Email preferences</strong> — turn any category off, or all of them, in Profile settings.</li>
            <li><strong className="text-foreground">Notification sound</strong> — mute it in Profile settings.</li>
            <li><strong className="text-foreground">Online status</strong> — hide your last-active time from other members.</li>
            <li><strong className="text-foreground">Account deletion</strong> — delete your account from Profile settings at any time. This removes your account and cascades to the data tied to it (profile, logbook, posts, etc.); some records tied to shared content, like a forum reply, may be retained in de-identified form so conversations stay coherent for other members.</li>
          </ul>
        </Section>

        <Section title="Children's privacy">
          <p>
            Repeater Nation is not directed at children under 13, and we do not knowingly collect
            information from anyone under that age. If you believe a child has created an account, contact
            us and we'll remove it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes in a material way, we'll update the effective date above and, for
            significant changes, notify members by email or an in-app announcement.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your data? Reach out through our{' '}
            <Link to="/contact" className="text-primary hover:underline">Contact page</Link>. For the rules
            of using the platform, see our{' '}
            <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>.
          </p>
        </Section>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link to="/register">
            <Button size="lg"><UserPlus className="w-4 h-4 mr-2" /> Register Account (Free)</Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="lg"><LogIn className="w-4 h-4 mr-2" /> Sign in</Button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <Logo className="w-7 h-7" />
              <span className="font-heading font-semibold text-foreground">Repeater Nation</span>
            </Link>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <Link to="/about" className="hover:text-foreground">About Us</Link>
            <Link to="/partners" className="hover:text-foreground">Partner With Us</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
