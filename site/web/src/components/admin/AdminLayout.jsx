import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/adminClient';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Users, RadioTower, Map, Satellite, Flag, Bell, Mail, BarChart3, PackageCheck,
  ShieldCheck, ScrollText, Settings as SettingsIcon, Menu, X, LogOut, ArrowLeft, ShieldAlert, Award, Radio, Tags, KeyRound, Trees, Mountain, RadioReceiver, Webhook, Antenna, ShoppingBag
} from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/lib/AuthContext';
import { hasPermission, isAdminRole } from '@/lib/permissions';
import { EmptyState } from '@/components/admin/parts';

// Grouped into sections instead of one flat 18-item list, for a command-center
// nav feel where you scan a section, not a wall of links.
//
// `perm` is the permission the page's own actions need, so staff only see
// pages they can use. `adminOnly` marks pages whose data (entity RLS) or
// backend functions only let administrators in, whatever a role's permission
// matrix says; moderators and other staff get a clear message there instead
// of a page full of permission errors.
const navSections = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, perm: 'admin.view' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, perm: 'users.view' },
      { to: '/admin/repeaters', label: 'Repeaters', icon: RadioTower, perm: 'repeaters.view' },
      { to: '/admin/map', label: 'Map Management', icon: Map, perm: 'repeaters.manage' },
      { to: '/admin/pota', label: 'POTA Parks', icon: Trees, perm: 'repeaters.manage', adminOnly: true },
      { to: '/admin/sota', label: 'SOTA Summits', icon: Mountain, perm: 'repeaters.manage', adminOnly: true },
      { to: '/admin/sdr', label: 'SDR Streams', icon: Antenna, perm: 'tools.manage' },
      { to: '/admin/badges', label: 'Badges', icon: Award, perm: 'admin.manage' },
      { to: '/admin/equipment', label: 'Equipment Guide', icon: PackageCheck, perm: 'users.manage', adminOnly: true },
      { to: '/admin/tags', label: 'Tags & Categories', icon: Tags, perm: 'tags.view', adminOnly: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/callsigns', label: 'Callsigns', icon: Radio, perm: 'callsigns.view' },
      { to: '/admin/fcc', label: 'FCC Data', icon: Satellite, perm: 'callsigns.view' },
      { to: '/admin/radio', label: 'Web Radio', icon: RadioReceiver, perm: 'radio.manage' },
      { to: '/admin/api-keys', label: 'API Access', icon: Webhook, perm: 'apikeys.view' },
      { to: '/admin/merch', label: 'Merch', icon: ShoppingBag, perm: 'settings.manage', adminOnly: true },
      { to: '/admin/reports', label: 'Reports', icon: Flag, perm: 'reports.view' },
      { to: '/admin/notifications', label: 'Announcements', icon: Bell, perm: 'admin.manage' },
      { to: '/admin/email', label: 'Email', icon: Mail, perm: 'email.view' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/analytics', label: 'Analytics & SEO', icon: BarChart3, perm: 'admin.view' },
      { to: '/admin/security', label: 'Security', icon: ShieldCheck, perm: 'admin.manage' },
      { to: '/admin/audit', label: 'Audit & Change Log', icon: ScrollText, perm: 'audit.view' },
      { to: '/admin/roles', label: 'Roles & Permissions', icon: KeyRound, perm: 'settings.manage' },
      { to: '/admin/settings', label: 'Settings', icon: SettingsIcon, perm: 'settings.manage' },
    ],
  },
];

const navItems = navSections.flatMap((section) => section.items);
const canOpen = (user, item) => (!item.adminOnly || isAdminRole(user)) && hasPermission(user, item.perm);

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-xs tabular-nums text-muted-foreground hidden sm:inline">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

function PulseDot({ tone = 'success' }) {
  const cls = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-destructive';
  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cls} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${cls}`} />
    </span>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const [activeCounts, setActiveCounts] = useState({ staff: 0, members: 0 });
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const path = location.pathname.replace(/\/+$/, '') || '/admin';
  const currentItem = navItems.find((item) => item.to === path);
  const blocked = !!currentItem && !canOpen(user, currentItem);

  useEffect(() => {
    let cancelled = false;

    const loadActiveCounts = () => {
      adminApi('presence')
        .then((d) => {
          if (!cancelled) {
            setActiveCounts({
              staff: d?.activeStaff || 0,
              members: d?.activeMembers || 0,
            });
          }
        })
        .catch(() => {});
    };

    // Delay the first presence read so the admin dashboard's initial stats
    // request is not competing with the header request for the same backend
    // rate-limit window. Presence is informational and can safely arrive a
    // moment after the command center renders.
    const initialTimer = setTimeout(loadActiveCounts, 2500);
    // Presence is intentionally refreshed much less often than the old full-
    // stats polling. The lightweight endpoint only reads User records.
    const timer = setInterval(() => { if (!document.hidden) loadActiveCounts(); }, 120000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors shrink-0">
        <div className="relative shrink-0">
          <Logo className="w-9 h-9" />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-sidebar">
            <PulseDot />
          </span>
        </div>
        <div className="leading-tight min-w-0">
          <div className="font-heading font-bold text-white text-[15px] tracking-wide">Command Center</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-mono">Repeater Nation · Admin</div>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-0.5">
        {navSections.map((section) => {
          const items = section.items.filter((item) => canOpen(user, item));
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              <div className="px-3 pt-4 pb-1.5 first:pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">{section.label}</span>
              </div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
                      )}
                      <item.icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'drop-shadow-[0_0_6px_hsl(var(--primary)/0.55)]' : ''}`} />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <Link to="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all">
          <ArrowLeft className="w-[18px] h-[18px]" /> Back to site
        </Link>
        <Button variant="ghost" onClick={() => { logout(); }} className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent">
          <LogOut className="w-[18px] h-[18px]" /> Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="dark admin-shell flex h-screen overflow-hidden bg-background">
      <div className="hidden lg:block flex-shrink-0">{Sidebar}</div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full animate-fade-in">{Sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 h-16 px-4 sm:px-6 border-b border-border bg-card/80 backdrop-blur-md flex-shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <span className="font-heading font-semibold text-foreground hidden sm:inline">Administration</span>
          </div>
          <div className="hidden md:flex items-center gap-2 ml-2 pl-3 border-l border-border">
            <PulseDot />
            <span className="text-[11px] font-medium uppercase tracking-wide text-success">Session Active</span>
            <span className="text-[11px] text-muted-foreground">
              Staff <span className="font-semibold text-foreground tabular-nums">{activeCounts.staff}</span>
              <span className="mx-1.5">·</span>
              Members <span className="font-semibold text-foreground tabular-nums">{activeCounts.members}</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LiveClock />
            <button onClick={() => navigate('/settings')} className="w-9 h-9 rounded-full bg-navy text-white grid place-items-center font-semibold text-sm ring-2 ring-transparent hover:ring-primary/40 transition-all shrink-0">
              {(user?.full_name || user?.email || 'A').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin relative">
          <div className="absolute inset-0 admin-grid-bg pointer-events-none" />
          <div className="relative p-5 sm:p-8 max-w-7xl mx-auto animate-fade-in">
            {blocked ? (
              <EmptyState
                icon={ShieldAlert}
                title={`${currentItem.label} isn't available for your role`}
                description={currentItem.adminOnly && hasPermission(user, currentItem.perm)
                  ? 'This page is for administrators only.'
                  : 'An administrator can change what your role can open under Roles & Permissions.'}
              />
            ) : <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
