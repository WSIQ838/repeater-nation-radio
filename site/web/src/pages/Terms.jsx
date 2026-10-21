import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import StructuredData from '@/components/seo/StructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const pageSchema = {
  '@context': 'https://schema.org', '@type': 'WebPage',
  name: 'Terms of Service — Repeater Nation', url: 'https://repeaternation.com/terms',
  description: 'The rules for using Repeater Nation, the community platform for GMRS and HAM radio operators.',
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

export default function Terms() {
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
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Terms of Service' }]} />
        <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

        <p className="mt-8 text-lg text-muted-foreground leading-relaxed">
          These terms govern your use of Repeater Nation. By creating an account or using the platform,
          you agree to them. If you don't agree, please don't use the platform.
        </p>

        <Section title="Who can use Repeater Nation">
          <p>
            Repeater Nation is built for GMRS and amateur (HAM) radio operators and their families. You
            must be able to form a binding agreement to create an account (in most places, this means
            being 13 or older, with parental involvement for minors as your local law requires). You're
            responsible for the accuracy of the information you provide, including any callsign or license
            details.
          </p>
          <p>
            Verifying a callsign against public FCC records is a convenience feature to confirm license
            status — it doesn't grant you any rights to that callsign beyond what the FCC itself has
            issued, and misrepresenting a callsign as your own is a violation of these terms.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            Keep your login credentials confidential — you're responsible for activity that happens under
            your account. Tell us right away if you suspect unauthorized access. You can delete your
            account at any time from Profile settings.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>When using Repeater Nation, you agree not to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Impersonate another operator or misrepresent a callsign, license, or identity that isn't yours.</li>
            <li>Harass, threaten, or abuse other members in forums, direct messages, clubs, or during a live Net Control session.</li>
            <li>Post spam, malware, or content unrelated to the community's purpose.</li>
            <li>Submit false or fraudulent repeater, club, or event listings.</li>
            <li>Attempt to bypass rate limits, security controls, or access data you're not authorized to see.</li>
            <li>Use the platform for any activity that violates FCC rules or other applicable law.</li>
          </ul>
          <p>
            Administrators may remove content, suspend, or terminate accounts that violate these terms, at
            their discretion, with or without notice depending on severity.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            You retain ownership of the content you post — logbook entries, forum posts, profile
            information, club pages, and so on. By posting it, you grant Repeater Nation a license to
            store, display, and distribute it as part of operating the platform (for example, showing your
            public profile or forum post to other members and search engines).
          </p>
          <p>
            You're responsible for having the rights to anything you upload (avatars, banners, attachments,
            club/event images). Don't post content that infringes someone else's copyright or other rights.
          </p>
        </Section>

        <Section title="Clubs and Net Control">
          <p>
            Club owners and Net Control operators take on added responsibility for the members and
            sessions they run — accurate rosters, fair moderation, and respecting the permission tiers
            (view / check-in / full) they grant to co-hosts. Repeater Nation isn't a party to disputes
            between club members but may step in where these terms are violated.
          </p>
        </Section>

        <Section title="Payments and donations">
          <p>
            Donations and paid club memberships are processed through Stripe. Prices and features for paid
            memberships are set by the club or, where applicable, Repeater Nation, and may change with
            notice. Donations are voluntary contributions to support the platform and are generally
            non-refundable, except where required by law or at our discretion.
          </p>
        </Section>

        <Section title="Tools and information disclaimer">
          <p>
            The calculators, lookups, and planning tools on Repeater Nation (frequency, tone, antenna,
            coax loss, distance, weather, FCC lookup, and similar) provide estimates and general
            information for educational and planning purposes. They do not replace FCC rules, official
            licensing information, equipment documentation, or professional engineering advice. Always
            operate within applicable laws and regulations.
          </p>
        </Section>

        <Section title="Service availability">
          <p>
            Repeater Nation is provided "as is" and "as available." We aim for reliable uptime but don't
            guarantee the platform will be uninterrupted, error-free, or available at all times — including
            during maintenance, upgrades, or events outside our control.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the fullest extent permitted by law, Repeater Nation and its operators aren't liable for
            indirect, incidental, or consequential damages arising from your use of the platform, including
            reliance on directory data, tool estimates, or interactions with other members. Nothing here
            limits liability that can't be limited under applicable law.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            If these terms change in a material way, we'll update the effective date above and, for
            significant changes, notify members by email or an in-app announcement. Continued use of the
            platform after a change means you accept the updated terms.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about these terms? Reach out through our{' '}
            <Link to="/contact" className="text-primary hover:underline">Contact page</Link>. For how we
            handle your data, see our{' '}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
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
