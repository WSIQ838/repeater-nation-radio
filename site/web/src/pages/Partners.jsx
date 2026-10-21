import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus, ArrowRight, Radio, MapPin, Cpu, Megaphone } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import StructuredData from '@/components/seo/StructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const pageSchema = {
  '@context': 'https://schema.org', '@type': 'WebPage',
  name: 'Partner with Repeater Nation', url: 'https://repeaternation.com/partners',
  description: 'Partnership and sponsorship opportunities on Repeater Nation, reaching an engaged community of GMRS and HAM radio operators.',
};

const PLACEMENTS = [
  {
    icon: Cpu,
    title: 'Equipment Guide',
    desc: 'Featured or sponsored placement for radios, antennas, and accessories in front of operators actively researching gear to buy.',
  },
  {
    icon: MapPin,
    title: 'Directory & Trip Planner',
    desc: 'Visibility where operators are already looking — the repeater directory, club listings, and trip planning tools used for real, in-the-field decisions.',
  },
  {
    icon: Megaphone,
    title: 'Site & Email Placements',
    desc: 'Banner or card placements on high-traffic pages, and sponsorship of email notifications members already opt into.',
  },
  {
    icon: Radio,
    title: 'Club & Event Sponsorship',
    desc: 'Sponsor a club page, a Net Control event, or a community activation, with visibility to the members actually participating.',
  },
];

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-heading font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Partners() {
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
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Partner With Us' }]} />
        <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight">
          Partner with Repeater Nation
        </h1>

        <p className="mt-8 text-lg text-muted-foreground leading-relaxed">
          Repeater Nation reaches a focused, engaged audience: licensed GMRS and HAM radio operators who
          are actively using the platform to plan trips, research gear, run nets, and manage clubs. If your
          business serves that community, there are several ways to get in front of them.
        </p>

        <div className="mt-12 grid sm:grid-cols-2 gap-4">
          {PLACEMENTS.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-5">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <p.icon className="w-5 h-5" />
              </div>
              <h3 className="mt-3 font-heading font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        <Section title="Why partner here">
          <p>
            Radio operators are a hard audience to reach through generic ad networks — Repeater Nation's
            members are self-selected: licensed, equipped, and actively participating in the hobby. A
            placement here reaches people already in the market for radios, antennas, club memberships,
            and related gear, not a broad, untargeted audience.
          </p>
        </Section>

        <Section title="How it works">
          <p>
            There's no fixed ad platform or self-serve checkout yet — every placement is arranged directly
            so it fits both the partner and the community. Tell us what you're looking for (equipment
            listing, banner placement, club or event sponsorship, something else) and we'll follow up with
            options and rates.
          </p>
        </Section>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link to="/contact">
            <Button size="lg">Contact us about partnering <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
          </Link>
          <Link to="/register">
            <Button variant="outline" size="lg"><UserPlus className="w-4 h-4 mr-2" /> Register Account (Free)</Button>
          </Link>
          <Link to="/login">
            <Button variant="ghost" size="lg"><LogIn className="w-4 h-4 mr-2" /> Sign in</Button>
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
