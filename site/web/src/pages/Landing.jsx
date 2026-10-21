import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  GraduationCap, BadgeCheck, UserPlus, ArrowRight, CheckCircle2,
  LogIn, LogOut, MessageCircle, Users, RadioTower, Radio, Antenna, Heart, Code2, Download,
} from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import InstallButton from '@/components/InstallButton';
import DiscordWidget from '@/components/DiscordWidget';
import StructuredData from '@/components/seo/StructuredData';
import PublicNavTabs from '@/components/PublicNavTabs';
import AnnouncementPopup from '@/components/AnnouncementPopup';
import SiteSocialLinks from '@/components/SiteSocialLinks';
import DonateButton from '@/components/DonateButton';
import DonateDialog from '@/components/DonateDialog';
import { useSiteSocials } from '@/lib/useSiteSocials';

const APP_BASE = 'https://repeaternation.com';
const orgSchema = {
  '@context': 'https://schema.org', '@type': 'Organization',
  name: 'Repeater Nation', url: APP_BASE, logo: `${APP_BASE}/branding/logo-badge-512.png`,
  description: 'GMRS and HAM radio tools for repeaters, logs, equipment, clubs, events, and everyday operators.',
};
const websiteSchema = {
  '@context': 'https://schema.org', '@type': 'WebSite',
  name: 'Repeater Nation', url: APP_BASE,
  potentialAction: { '@type': 'SearchAction', target: `${APP_BASE}/repeaters?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
};

export default function Landing() {
  const socials = useSiteSocials();
  const [authed, setAuthed] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [memberCount, setMemberCount] = useState(null);
  const [potaCount, setPotaCount] = useState(null);
  const [clubCount, setClubCount] = useState(null);
  const [qsoCount, setQsoCount] = useState(null);
  const [repeaterCount, setRepeaterCount] = useState(null);
  const [netCount, setNetCount] = useState(null);
  useEffect(() => {
    base44.auth.isAuthenticated().then(setAuthed).catch(() => {});
    base44.functions.invoke('public-member-directory', {}).then((r) => {
      const stats = r?.data?.stats || r?.stats;
      if (stats) {
        setMemberCount(stats.members);
        setNetCount(stats.nets);

        setPotaCount(stats.potaActivations);
        setClubCount(stats.clubs);
        setQsoCount(stats.qsoLogs);

        const gmrsRepeaters = Number(stats.repeaters || 0);
        const hamRepeaters = Number(stats.hamRepeaters || 0);
        setRepeaterCount(gmrsRepeaters + hamRepeaters);
      } else {
        const members = r?.data?.members || r?.members || [];
        setMemberCount(members.length);
      }
    }).catch(() => setMemberCount(null));
  }, []);

  const handleLogout = async () => { await base44.auth.logout(); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnnouncementPopup />
      <StructuredData data={[orgSchema, websiteSchema]} />
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="w-9 h-9" />
            <span className="font-heading font-bold text-lg">Repeater Nation</span>
          </Link>
          <PublicNavTabs />
          <div className="flex items-center gap-2">
            <DonateButton className="hidden sm:inline-flex" />
            <ThemeToggle />
            <InstallButton />
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

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy to-navy-light" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-5 pt-16 sm:pt-24 pb-24 text-center text-white">
          <div className="flex justify-center mb-6">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56">
              <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl scale-110" aria-hidden="true" />
              <Logo className="relative w-full h-full rounded-full ring-4 ring-white/10 shadow-2xl" />
            </div>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-medium backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> GMRS &amp; HAM tools for the radio community
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-heading font-bold leading-tight tracking-tight">
            GMRS &amp; HAM tools,<br className="hidden sm:block" /> in one place.
          </h1>
          <p className="mt-5 text-lg text-white/70 max-w-2xl mx-auto">
            Find repeaters, log contacts, plan trips, join clubs, and keep up with other GMRS and HAM operators from one dashboard.
          </p>

          {/* Community stats */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-primary/20 text-primary-foreground">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-heading font-bold leading-none">{memberCount === null ? '—' : memberCount.toLocaleString()}</div>
                <div className="text-xs text-white/60 mt-1">Members</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-green-500/20 text-green-300">
                <RadioTower className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-heading font-bold leading-none">{potaCount === null ? '—' : potaCount.toLocaleString()}</div>
                <div className="text-xs text-white/60 mt-1">POTA activations</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-orange-500/20 text-orange-300">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-heading font-bold leading-none">{clubCount === null ? '—' : clubCount.toLocaleString()}</div>
                <div className="text-xs text-white/60 mt-1">clubs</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300">
                <Radio className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-heading font-bold leading-none">{qsoCount === null ? '—' : qsoCount.toLocaleString()}</div>
                <div className="text-xs text-white/60 mt-1">QSO contact logs</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300">
                <RadioTower className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-heading font-bold leading-none">
                  {repeaterCount === null ? '—' : repeaterCount >= 10000 ? '10,000+' : repeaterCount.toLocaleString()}
                </div>
                <div className="text-xs text-white/60 mt-1">Total Repeaters</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300">
                <Antenna className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-heading font-bold leading-none">{netCount === null ? '—' : netCount.toLocaleString()}</div>
                <div className="text-xs text-white/60 mt-1">Total Nets</div>
              </div>
            </div>
          </div>

          <div className="mt-12 max-w-4xl mx-auto space-y-5 text-left">
            <div className="grid sm:grid-cols-2 gap-5">
              <ActionCard icon={GraduationCap} tint="bg-blue-500/15 text-blue-300" title="Learn About GMRS" text="New to radio? Understand what GMRS is, how it works, and why millions use it." cta="Start learning" to="/about-gmrs" />
              <ActionCard icon={BadgeCheck} tint="bg-orange-500/15 text-orange-300" title="Get a GMRS License" text="No exam needed. Get FCC-licensed in minutes and cover your whole family." cta="Get licensed" to="/get-licensed#gmrs" />
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <ActionCard icon={GraduationCap} tint="bg-purple-500/15 text-purple-300" title="Learn About HAM" text="Ready for more range and power? Discover amateur radio and what it can do." cta="Start learning" to="/about-ham" />
              <ActionCard icon={BadgeCheck} tint="bg-cyan-500/15 text-cyan-300" title="Get a HAM License" text="Pass the required exam and get access to the bands and modes available through amateur radio." cta="Get licensed" to="/get-licensed#ham" />
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-12">
        <img
          src="/branding/hero-banner.webp?v=2"
          width="1983"
          height="793"
          alt="Repeater Nation — GMRS and HAM radio community. Friends, family, community. Stay connected, stay prepared."
          className="w-full h-auto rounded-3xl shadow-2xl"
        />
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-light text-white p-10 sm:p-16 text-center">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-heading font-bold">Ready to get on the air?</h2>
            <p className="mt-4 text-white/70 max-w-xl mx-auto">Use the tools, find repeaters, and keep track of your radio activity — for free.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register"><Button size="lg" className="h-12"><UserPlus className="w-4 h-4 mr-2" /> Register Account (Free)</Button></Link>
              <Link to="/login"><Button variant="outline" size="lg" className="h-12 bg-white/10 border-white/20 text-white hover:bg-white/20"><LogIn className="w-4 h-4 mr-2" /> Sign in</Button></Link>
            </div>
            <div className="mt-6 flex items-center justify-center gap-5 text-xs text-white/50">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> No exam required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Free forever</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Works on mobile</span>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5">
        <img
          src="/branding/app-ad.jpg"
          alt="The Repeater Nation app on two phones: the sign-in screen and the More menu with Parks and Summits, Forum, Marketplace, Equipment, Trips, SDR Streams, Logbook, Tools, Messages, Emergency and Me. Free for Android and iPhone."
          width="2880"
          height="1620"
          loading="lazy"
          className="w-full h-auto rounded-3xl shadow-2xl"
        />
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <a href="https://github.com/WSIQ838/repeater-nation-app/releases/latest" target="_blank" rel="noopener noreferrer"><Button size="lg" className="h-12"><Download className="w-4 h-4 mr-2" /> Download the App</Button></a>
          <p className="text-sm text-muted-foreground max-w-md">Android: download the .apk and open it. iPhone: install with Sideloadly, steps are on the download page. Free.</p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pt-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-light text-white p-8 sm:p-12">
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="grid place-items-center w-16 h-16 rounded-2xl bg-primary/20 text-primary shrink-0"><Radio className="w-8 h-8" /></div>
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-heading font-bold">Download our Radio App</h2>
              <p className="mt-2 text-white/70 max-w-xl">Talk on Repeater Nation channels from your computer with push-to-talk, zones and channels. Sign in with your Repeater Nation account.</p>
              <div className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-white/50">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Windows</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Mac</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Linux</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-success" /> Free</span>
              </div>
            </div>
            <a href="https://github.com/WSIQ838/repeater-nation-radio/releases/latest" target="_blank" rel="noopener noreferrer" className="shrink-0"><Button size="lg" className="h-12"><Download className="w-4 h-4 mr-2" /> Download the App</Button></a>
          </div>
          <img
            src="/branding/radio-ad.jpg"
            alt="Repeater Nation Radio app on desktop: the radio screen showing Nation Wide channel 1, with the push-to-talk microphone. Free for Windows, Mac and Linux."
            width="2880"
            height="1200"
            loading="lazy"
            className="relative mt-8 w-full h-auto rounded-2xl border border-white/10"
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          <div className="relative overflow-hidden rounded-3xl bg-[#5865F2] text-white p-10 sm:p-14 text-center flex flex-col justify-center">
            <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -right-10 w-72 h-72 rounded-full bg-black/10 blur-3xl" />
            <div className="relative">
              <div className="flex justify-center mb-5">
                <div className="grid place-items-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur"><MessageCircle className="w-7 h-7" /></div>
              </div>
              <h2 className="text-3xl sm:text-4xl font-heading font-bold">Join the conversation on Discord</h2>
              <p className="mt-4 text-white/80 max-w-xl mx-auto">Talk with other GMRS and HAM operators, ask questions, share repeater information, and keep up with events and updates.</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a href={socials.social_discord_url || 'https://discord.gg/SjNy9jR9ej'} target="_blank" rel="noopener noreferrer"><Button size="lg" className="h-12 bg-white text-[#5865F2] hover:bg-white/90"><MessageCircle className="w-4 h-4 mr-2" /> Join Discord</Button></a>
                {!authed && <Link to="/register"><Button variant="outline" size="lg" className="h-12 bg-white/10 border-white/30 text-white hover:bg-white/20"><UserPlus className="w-4 h-4 mr-2" /> Create an account</Button></Link>}
              </div>
            </div>
          </div>
          <DiscordWidget guildId="1532997472815677570" className="min-h-[300px]" />
        </div>
      </section>

      {socials.donation_mode !== 'none' && (
        <section className="max-w-6xl mx-auto px-5 pb-12">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 sm:p-14 text-center">
            <div className="flex justify-center mb-5">
              <div className="grid place-items-center w-14 h-14 rounded-2xl bg-destructive/10 text-destructive"><Heart className="w-7 h-7" /></div>
            </div>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold">Help keep Repeater Nation free</h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">Repeater Nation is free to use. Donations help cover hosting, tools, and the day-to-day cost of keeping the site running without ads.</p>
            <div className="mt-8 flex justify-center">
              <DonateButton variant="default" size="lg" className="h-12 px-6">Donate to keep it free</DonateButton>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <Logo className="w-8 h-8" />
              <span className="font-heading font-semibold text-foreground">Repeater Nation</span>
            </Link>
            <span className="text-sm">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
            <Link to="/register" className="hover:text-foreground">Register</Link>
            <Link to="/about" className="hover:text-foreground">About Us</Link>
            <Link to="/partners" className="hover:text-foreground">Partner With Us</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <a href="https://www.fcc.gov" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">FCC</a>
            {socials.donation_mode === 'stripe' && <button onClick={() => setDonateOpen(true)} className="hover:text-foreground">Donate</button>}
            {socials.donation_mode === 'link' && <a href={socials.donation_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Donate</a>}
          </div>
          <SiteSocialLinks />
        </div>
      </footer>
      <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />
    </div>
  );
}

function ActionCard({ icon: Icon, tint, title, text, cta, onClick, to, primary, badge }) {
  const inner = (
    <div className={`group relative rounded-2xl p-6 text-left h-full flex flex-col transition-all ${primary ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white border border-white/15 hover:bg-white/15 backdrop-blur'}`}>
      {badge && <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-success/20 text-success">{badge}</span>}
      <div className={`grid place-items-center w-12 h-12 rounded-xl mb-4 ${primary ? 'bg-white/15' : tint}`}><Icon className="w-6 h-6" /></div>
      <div className="font-heading font-bold text-xl">{title}</div>
      <p className={`mt-2 text-sm flex-1 ${primary ? 'text-primary-foreground/80' : 'text-white/65'}`}>{text}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">{cta} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
    </div>
  );
  if (to) return <Link to={to} className="block text-left">{inner}</Link>;
  return <button onClick={onClick} className="block text-left">{inner}</button>;
}