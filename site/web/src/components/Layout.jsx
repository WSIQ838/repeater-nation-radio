import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { loadNavConfig } from '@/lib/configCache';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Users, CalendarDays, Store,
  CircleUserRound, Search, Menu, X, LogOut, Radio, MessageSquare, MessageCircle, Shield, Bug, Wrench, Settings2, Trophy, LogIn, Bell, Mail, Settings, ShoppingBag
} from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import InstallButton from '@/components/InstallButton';
import { hasPermission, isAdminRole } from '@/lib/permissions';
import { useMerchSettings, useCart } from '@/lib/merch';
import { useAuth } from '@/lib/AuthContext';
import { useSiteSocials } from '@/lib/useSiteSocials';
import SiteSocialLinks from '@/components/SiteSocialLinks';
import DonateButton from '@/components/DonateButton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import NotificationsPanel from '@/components/dashboard/NotificationsPanel';
import { playNotificationSound } from '@/lib/notificationSound';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, authOnly: true, end: true },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/messages', label: 'Messages', icon: MessageCircle, authOnly: true },
  { to: '/forums', label: 'Forums', icon: MessageSquare },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/clubs', label: 'Clubs', icon: Users },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/directory', label: 'Members', icon: CircleUserRound },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/merch', label: 'Merch', icon: ShoppingBag, storeOnly: true },
  { to: '/equipment-guide', label: 'Recommended Gear', icon: Radio },
  { to: '/club-manager', label: 'Club Manager', icon: Settings2, authOnly: true, requiresClubRole: true },
  { to: '/callsign-management', label: 'My Callsign', icon: Radio, authOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, authOnly: true },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  // The Merch tab and cart button only appear once an admin opens the store
  // (admins see them early so they can preview it).
  const merchSettings = useMerchSettings();
  const showStore = !!merchSettings?.enabled || isAdminRole(user);
  const cart = useCart();
  const [unread, setUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasClubRole, setHasClubRole] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const userRef = useRef(null);
  const navigate = useNavigate();
  const socials = useSiteSocials();

  // Admin Settings' nav-order editor (NavOrderEditor.jsx) saves a custom
  // sidebar order to AdminSetting.nav_order; get-nav-config is the public
  // projection of just that field. Any tab not in the saved order (or a
  // fresh install with no saved order at all) keeps its default position.
  const [navOrder, setNavOrder] = useState(null);
  useEffect(() => {
    loadNavConfig().then((data) => {
      const order = data?.nav_order;
      if (Array.isArray(order) && order.length) setNavOrder(order);
    }).catch(() => {});
  }, []);

  const orderedNav = useMemo(() => {
    if (!navOrder?.length) return nav;
    const byPath = new Map(nav.map((item) => [item.to, item]));
    const ordered = navOrder.map((path) => byPath.get(path)).filter(Boolean);
    const seen = new Set(ordered.map((item) => item.to));
    nav.forEach((item) => { if (!seen.has(item.to)) ordered.push(item); });
    return ordered;
  }, [navOrder]);

  const refreshUnread = async (u) => {
    const currentUser = u || userRef.current;
    if (!currentUser) return;
    const [m, n] = await Promise.all([
      base44.entities.Message.filter({ recipient_id: currentUser.id, read: false }, '-created_date', 100).catch(() => []),
      base44.entities.UserNotification.filter({ user_id: currentUser.id, read: false }, '-created_date', 100).catch(() => []),
    ]);
    setUnread(Array.isArray(m) ? m.length : 0);
    setNotifUnread(Array.isArray(n) ? n.length : 0);
  };

  // Club Manager is only useful (and should only be visible) to someone who
  // owns a club or holds an Admin/Officer membership role in one — plain
  // members have nothing to manage there.
  const checkClubRole = async (u) => {
    if (!u) { setHasClubRole(false); return; }
    try {
      const [ownedById, ownedByCallsign, memberships] = await Promise.all([
        base44.entities.Club.filter({ created_by_id: u.id }, undefined, 1).catch(() => []),
        u.callsign ? base44.entities.Club.filter({ creator_callsign: u.callsign }, undefined, 1).catch(() => []) : Promise.resolve([]),
        u.callsign ? base44.entities.Membership.filter({ member_callsign: u.callsign }, undefined, 200).catch(() => []) : Promise.resolve([]),
      ]);
      const isOwner = (ownedById?.length || 0) > 0 || (ownedByCallsign?.length || 0) > 0;
      const isStaff = (memberships || []).some((m) => ['Admin', 'Officer'].includes(m.role) && String(m.status || 'Active') === 'Active');
      setHasClubRole(isOwner || isStaff);
    } catch {
      setHasClubRole(false);
    }
  };

  useEffect(() => {
    userRef.current = user;
    if (user) {
      refreshUnread(user);
      checkClubRole(user);
      base44.entities.Profile.filter({ created_by_id: user.id }, '-updated_date', 1)
        .then((profiles) => setProfileAvatarUrl(profiles?.[0]?.avatar_url || ''))
        .catch(() => setProfileAvatarUrl(''));
    } else {
      setUnread(0);
      setNotifUnread(0);
      setHasClubRole(false);
      setProfileAvatarUrl('');
    }
  }, [user]);

  useEffect(() => {
    // Every open tab hears every Message and UserNotification change on the
    // whole site. Re-counting on all of them made each member's tab run two
    // queries per message anyone sent, and an announcement to every member
    // made every open tab query at once. Only changes addressed to this member
    // can move their badges, and a burst is counted once, a moment later.
    // A hidden tab counts once when it's shown again.
    let timer = null;
    let missed = false;
    const scheduleUnread = () => {
      if (document.hidden) { missed = true; return; }
      if (timer) return;
      timer = setTimeout(() => { timer = null; refreshUnread(); }, 1500);
    };
    const onVisible = () => { if (!document.hidden && missed) { missed = false; scheduleUnread(); } };
    document.addEventListener('visibilitychange', onVisible);
    // An event without its record, or with one Base44 cut down to fit the
    // realtime channel (_oversize), can't be checked, so it counts as ours.
    const isMine = (row, key) => !row || row._oversize || !userRef.current || row[key] === userRef.current.id;

    const unsubMessages = base44.entities.Message.subscribe((event) => {
      if (event?.type !== 'create' && event?.type !== 'update') return;
      const msg = event.data;
      if (!isMine(msg, 'recipient_id')) return;
      scheduleUnread();
      if (event.type === 'create' && msg && msg.recipient_id === userRef.current?.id && msg.sender_id !== userRef.current?.id && userRef.current?.sound_notifications !== false) {
        playNotificationSound();
      }
    });
    // The notification bell's own badge count comes from UserNotification, not
    // Message -- without subscribing to it too, a new notification (friend
    // request, announcement, etc.) never updated the badge live; it only
    // happened to refresh as a side effect of message activity, or once the
    // popover was opened and closed.
    const unsubNotifs = base44.entities.UserNotification.subscribe((event) => {
      if (event?.type !== 'create' && event?.type !== 'update') return;
      const notif = event.data;
      if (!isMine(notif, 'user_id')) return;
      scheduleUnread();
      if (event.type === 'create' && notif && notif.user_id === userRef.current?.id && userRef.current?.sound_notifications !== false) {
        playNotificationSound();
      }
    });
    return () => {
      unsubMessages?.(); unsubNotifs?.();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleLogout = async () => { await base44.auth.logout(); };

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <button onClick={() => { navigate(user ? '/dashboard' : '/'); setOpen(false); }} className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border w-full hover:bg-sidebar-accent/50 transition-colors">
        <Logo className="w-10 h-10" />
        <div className="leading-tight text-left"><div className="font-heading font-bold text-white text-[15px]">Repeater Nation</div><div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Community Platform</div></div>
      </button>
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
        {orderedNav
          .filter((item) => (!item.authOnly || !!user) && (!item.adminOnly || hasPermission(user, 'admin.view')) && (!item.requiresClubRole || hasClubRole) && (!item.storeOnly || showStore))
          .map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}>
              <item.icon className="w-[18px] h-[18px]" />{item.label}
              {item.to === '/messages' && unread > 0 && <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
            </NavLink>
          ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {user ? (
          <>
            {socials.show_bug_report_link !== false && <NavLink to="/bug-report" onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><Bug className="w-[18px] h-[18px]" /> Report a Bug</NavLink>}
            {hasPermission(user, 'admin.view') && <NavLink to="/admin" onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><Shield className="w-[18px] h-[18px]" /> Admin Panel</NavLink>}
            {socials.social_discord_url && <a href={socials.social_discord_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"><MessageSquare className="w-[18px] h-[18px]" /> Join Discord</a>}
            <InstallButton variant="ghost" size="sm" className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent [&_svg]:w-[18px] [&_svg]:h-[18px] px-3" />
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent"><LogOut className="w-4 h-4" /> Sign out</Button>
          </>
        ) : (
          <>
            <NavLink to="/login" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"><LogIn className="w-[18px] h-[18px]" /> Sign in</NavLink>
            <NavLink to="/register" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all">Create Account</NavLink>
            <InstallButton variant="ghost" size="sm" className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent [&_svg]:w-[18px] [&_svg]:h-[18px] px-3" />
          </>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden lg:block flex-shrink-0">{Sidebar}</div>
      {open && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="absolute left-0 top-0 h-full animate-fade-in">{Sidebar}</div></div>}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 h-16 px-4 sm:px-6 border-b border-border bg-card/80 backdrop-blur-md flex-shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
          <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input placeholder="Search callsigns, repeaters, users…" className="w-full min-w-0 h-10 pl-9 pr-4 rounded-lg bg-muted text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" onKeyDown={(e) => { if (e.key === 'Enter') navigate('/repeaters'); }} /></div>
          <div className="ml-auto flex items-center gap-2">
            {user && <SiteSocialLinks className="hidden md:flex mr-1" iconClassName="w-8 h-8" />}
            <DonateButton className="hidden sm:inline-flex" />
            {user && (
              <button onClick={() => navigate('/contact')} className="w-9 h-9 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Contact us" title="Contact us">
                <Mail className="w-[18px] h-[18px]" />
              </button>
            )}
            {user && (
              <Popover open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (!o) refreshUnread(); }}>
                <PopoverTrigger asChild>
                  <button className="relative w-9 h-9 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Notifications">
                    <Bell className="w-[18px] h-[18px]" />
                    {notifUnread > 0 && (
                      <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold grid place-items-center">
                        {notifUnread > 9 ? '9+' : notifUnread}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[22rem] max-w-[90vw] p-4">
                  <NotificationsPanel userId={user.id} bare />
                </PopoverContent>
              </Popover>
            )}
            {showStore && cart.count > 0 && (
              <button onClick={() => navigate('/merch?cart=1')} className="relative w-9 h-9 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label={`Cart, ${cart.count} item${cart.count === 1 ? '' : 's'}`} title="Your cart">
                <ShoppingBag className="w-[18px] h-[18px]" />
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold grid place-items-center">{cart.count > 9 ? '9+' : cart.count}</span>
              </button>
            )}
            <ThemeToggle />
            {user ? (
              <button onClick={() => navigate('/settings')} className="w-9 h-9 rounded-full bg-navy text-white grid place-items-center font-semibold text-sm overflow-hidden" aria-label="Account settings" title="Account settings">
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt="Your profile" className="w-full h-full object-cover" />
                ) : (
                  <CircleUserRound className="w-4 h-4" />
                )}
              </button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin"><div className="animate-fade-in"><Outlet /></div></main>
      </div>
    </div>
  );
}
