import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, ArrowRight, ExternalLink, UserPlus } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import PublicNavTabs from '@/components/PublicNavTabs';
import { licenseSteps } from '@/data/licenseSteps';
import { hamLicenseSteps } from '@/data/hamLicenseSteps';

export default function GetLicensed() {
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

      <section id="gmrs" className="bg-navy text-white scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Get a GMRS License</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-heading font-bold">Get licensed in four simple steps</h2>
            <p className="mt-4 text-white/60">GMRS licensing is quick, affordable, and requires no exam. Your license covers your whole family for 10 years.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {licenseSteps.map((s) => {
              const Card = (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur h-full flex flex-col transition-colors hover:bg-white/10">
                  <div className="grid place-items-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold mb-4">{s.n}</div>
                  <div className="font-heading font-semibold flex items-center gap-1.5">
                    {s.title}
                    {s.href && <ExternalLink className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="mt-2 text-sm text-white/60">{s.text}</p>
                  {s.href && (
                    <span className="mt-4 inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-md bg-primary text-primary-foreground px-3 py-1.5 self-start">
                      Go to site <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              );
              return s.href ? (
                <a key={s.n} href={s.href} target="_blank" rel="noopener noreferrer" className="block">{Card}</a>
              ) : (
                <div key={s.n}>{Card}</div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="ham" className="bg-background scroll-mt-16">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Get a HAM License</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-heading font-bold">Get licensed in four steps</h2>
            <p className="mt-4 text-muted-foreground">Amateur radio requires passing a short multiple-choice exam — no Morse code — administered by volunteer examiners. Your Technician license is issued for 10 years and opens up frequencies worldwide.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {hamLicenseSteps.map((s) => {
              const Card = (
                <div className="rounded-2xl border border-border bg-card p-6 h-full flex flex-col transition-colors hover:shadow-lg">
                  <div className="grid place-items-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold mb-4">{s.n}</div>
                  <div className="font-heading font-semibold flex items-center gap-1.5">
                    {s.title}
                    {s.href && <ExternalLink className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                  {s.href && (
                    <span className="mt-4 inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-md bg-primary text-primary-foreground px-3 py-1.5 self-start">
                      Go to site <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              );
              return s.href ? (
                <a key={s.n} href={s.href} target="_blank" rel="noopener noreferrer" className="block">{Card}</a>
              ) : (
                <div key={s.n}>{Card}</div>
              );
            })}
          </div>
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