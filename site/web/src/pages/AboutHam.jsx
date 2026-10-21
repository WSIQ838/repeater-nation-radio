import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, ArrowRight, UserPlus } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import PublicNavTabs from '@/components/PublicNavTabs';
import { aboutHamCards } from '@/data/aboutHamCards';

export default function AboutHam() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => { base44.auth.isAuthenticated().then(setAuthed).catch(() => {}); }, []);
  const handleLogout = async () => { await base44.auth.logout(); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="w-9 h-9" />
            <span className="font-heading font-bold text-lg">Repeater Nation</span>
          </Link>
          <PublicNavTabs />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {authed ? (
              <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Log out</span></Button>
            ) : (
              <Link to="/login"><Button variant="ghost" size="sm"><LogIn className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Sign in</span></Button></Link>
            )}
            {!authed ? (
              <Link to="/register"><Button size="sm" className="px-2.5 sm:px-4"><span className="hidden sm:inline">Get Started</span><UserPlus className="w-4 h-4 sm:hidden" /></Button></Link>
            ) : (
              <Link to="/dashboard"><Button size="sm" className="px-2.5 sm:px-4"><span className="hidden sm:inline">Dashboard</span> <ArrowRight className="w-4 h-4 sm:ml-1.5" /></Button></Link>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 py-20 scroll-mt-16">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Learn About HAM</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-heading font-bold">What is Amateur (HAM) Radio?</h2>
          <p className="mt-4 text-muted-foreground">
            Amateur radio — commonly called HAM radio — is a licensed radio service for technical experimentation, emergency communication, and talking with other operators across town or around the world. It offers far more frequencies, power, and modes than GMRS.
          </p>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {aboutHamCards.map((f) => (
            <div key={f.t} className="rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition-shadow">
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary/10 text-primary mb-4">
                <f.icon className="w-5 h-5" />
              </div>
              <div className="font-heading font-semibold text-lg">{f.t}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/get-licensed#ham">
            <Button size="lg">Get a HAM License <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <Logo className="w-8 h-8" />
              <span className="font-heading font-semibold text-foreground">Repeater Nation</span>
            </Link>
            <span className="text-sm">© {new Date().getFullYear()}</span>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        </div>
      </footer>
    </div>
  );
}