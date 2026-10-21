import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, ArrowRight, LogIn, UserPlus, LifeBuoy, Flag } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import StructuredData from '@/components/seo/StructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { useSiteSocials } from '@/lib/useSiteSocials';

const pageSchema = {
  '@context': 'https://schema.org', '@type': 'ContactPage',
  name: 'Contact Repeater Nation', url: 'https://repeaternation.com/contact',
  description: 'Get in touch with the Repeater Nation team for questions, suggestions, and support.',
};

export default function Contact() {
  const socials = useSiteSocials();
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
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Contact' }]} />
        <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight">
          Contact Us
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Have a question, suggestion, or need a hand? We'd love to hear from you. Reach out through any of the methods below.
        </p>

        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          <a
            href="mailto:support@repeaternation.com"
            className="group rounded-2xl border border-border bg-card p-6 hover:shadow-lg hover:border-primary/40 transition-all"
          >
            <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div className="font-heading font-semibold text-lg">Support</div>
            <p className="mt-1 text-sm text-muted-foreground">Account help, technical issues, and troubleshooting.</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              support@repeaternation.com <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </a>

          <a
            href="mailto:inquiries@repeaternation.com"
            className="group rounded-2xl border border-border bg-card p-6 hover:shadow-lg hover:border-primary/40 transition-all"
          >
            <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <Mail className="w-6 h-6" />
            </div>
            <div className="font-heading font-semibold text-lg">General Inquiries</div>
            <p className="mt-1 text-sm text-muted-foreground">Questions, feedback, and partnership opportunities.</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              inquiries@repeaternation.com <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </a>

          <a
            href="mailto:report@repeaternation.com"
            className="group rounded-2xl border border-border bg-card p-6 hover:shadow-lg hover:border-primary/40 transition-all"
          >
            <div className="grid place-items-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <Flag className="w-6 h-6" />
            </div>
            <div className="font-heading font-semibold text-lg">Report an Issue</div>
            <p className="mt-1 text-sm text-muted-foreground">Report abuse, scams, or violations of our community guidelines.</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              report@repeaternation.com <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </a>

          <a
            href={socials.social_discord_url || 'https://discord.gg/SjNy9jR9ej'}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-border bg-card p-6 hover:shadow-lg hover:border-primary/40 transition-all"
          >
            <div className="grid place-items-center w-12 h-12 rounded-xl bg-[#5865F2]/15 text-[#5865F2] mb-4">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div className="font-heading font-semibold text-lg">Discord Community</div>
            <p className="mt-1 text-sm text-muted-foreground">Chat live with operators and the team on our Discord server.</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              Join the server <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </a>
        </div>

        <div className="mt-12 rounded-2xl bg-navy text-white p-8 text-center">
          <h2 className="text-2xl font-heading font-bold">Looking for help getting started?</h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            Create a free account to join the community, find repeaters, and connect with thousands of GMRS and HAM operators.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register">
              <Button size="lg"><UserPlus className="w-4 h-4 mr-2" /> Register Account (Free)</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                <LogIn className="w-4 h-4 mr-2" /> Sign in
              </Button>
            </Link>
          </div>
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