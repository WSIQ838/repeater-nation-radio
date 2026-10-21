import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, LogIn, UserPlus, RadioTower, BookOpen, Users, Map } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import StructuredData from '@/components/seo/StructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const pageSchema = {
  '@context': 'https://schema.org', '@type': 'AboutPage',
  name: 'About Repeater Nation', url: 'https://repeaternation.com/about',
  description: 'Learn about Repeater Nation and its GMRS and amateur (HAM) radio repeaters, clubs, nets, and operator tools.',
};

export default function About() {
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
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'About Us' }]} />
        <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight">
          About Repeater Nation
        </h1>

        <div className="mt-8 space-y-5 text-lg text-muted-foreground leading-relaxed">
          <p>
            Repeater Nation is a platform for GMRS (General Mobile Radio
            Service) and amateur (HAM) radio operators across the United States. It brings together the
            tools radio enthusiasts need into one place: a nationwide repeater directory
            with an interactive map for both services, a digital logbook for recording contacts, an
            equipment manager for tracking radios and antennas, a club and events system for local
            groups, a community forum, GPS navigation with live repeater detection, trip planning with
            in-range repeater discovery, and a searchable member directory.
          </p>
          <p>
            The platform is designed for licensed GMRS and HAM operators and their families — from
            newcomers getting their first FCC license or passing their Technician exam to experienced
            coordinators running regional repeater networks. Whether you're logging a contact from a
            weekend trip, requesting access to a closed repeater, or organizing a weekly net for your
            local club, Repeater Nation gives you a centralized place to do it. Every member can verify
            their FCC callsign, build a public profile, and connect with thousands of fellow operators
            nationwide.
          </p>
          <p>
            Repeater Nation is built and maintained by radio operators and developers who use GMRS and HAM radio. The platform is free to join, works on both
            desktop and mobile, and evolves directly from member feedback. The goal is simple: make it easier to find radio resources, stay organized, and connect with other operators.
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: RadioTower, label: 'Repeater Directory' },
            { icon: BookOpen, label: 'Digital Logbook' },
            { icon: Users, label: 'Clubs & Community' },
            { icon: Map, label: 'Trip Planner' },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="grid place-items-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                <f.icon className="w-5 h-5" />
              </div>
              <span className="font-medium text-sm">{f.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link to="/register">
            <Button size="lg"><UserPlus className="w-4 h-4 mr-2" /> Register Account (Free)</Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="lg"><LogIn className="w-4 h-4 mr-2" /> Sign in</Button>
          </Link>
          <Link to="/contact">
            <Button variant="ghost" size="lg">Contact us <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
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