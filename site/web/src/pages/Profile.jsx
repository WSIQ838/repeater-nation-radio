import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  BadgeCheck, MapPin, Radio, Award, BookOpen, Cpu, Save, Camera, Globe, Mail, Settings,
  User, Bell, Shield, KeyRound, Loader2,
  ExternalLink, Volume2, Crop, ChevronRight, Link2
} from 'lucide-react';
import BannerEditor from '@/components/profile/BannerEditor';
import AvatarEditor from '@/components/profile/AvatarEditor';
import ProfileBadges from '@/components/profile/ProfileBadges';
import NetGamification from '@/components/profile/NetGamification';
import PotaStats from '@/components/pota/PotaStats';
import DangerZone from '@/components/profile/DangerZone';
import ConnectedAccounts from '@/components/ConnectedAccounts';
import { toast } from '@/components/ui/use-toast';
import ApiAccessCard from '@/components/profile/ApiAccessCard';
import StaffTag from '@/components/shared/StaffTag';

const SETTINGS_NAV = [
  { id: 'profile', label: 'Profile', description: 'Your public information', icon: User },
  { id: 'radio', label: 'Radio Identity', description: 'GMRS & HAM callsigns', icon: Radio },
  { id: 'notifications', label: 'Notifications', description: 'Alerts and sounds', icon: Bell },
  { id: 'privacy', label: 'Privacy', description: 'Visibility controls', icon: Shield },
  { id: 'connected', label: 'Connected Accounts', description: 'Social media links', icon: Link2 },
  { id: 'api', label: 'API Access', description: 'Developer access', icon: KeyRound },
  { id: 'account', label: 'Account', description: 'Security & account actions', icon: Settings },
];

function isCallsignVerified(cs) {
  if (['expired', 'suspended', 'cancelled'].includes(cs.license_status)) return false;
  return cs.license_status === 'active' || cs.verification_status === 'verified';
}

function CallsignSlot({ label, service, callsigns }) {
  const matches = callsigns.filter((cs) => (cs.radio_service || 'GMRS') === service);
  return (
    <div className="rounded-xl border border-border p-4 bg-muted/20">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{label}</div>
      {matches.length > 0 ? (
        <div className="space-y-2">
          {matches.map((cs) => (
            <div key={cs.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono font-bold text-lg">{cs.display_callsign}</span>
                {cs.relationship === 'Authorized' && (
                  <span className="ml-2 text-[10px] text-muted-foreground">(authorized)</span>
                )}
              </div>
              {isCallsignVerified(cs) ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
                  <BadgeCheck className="w-3.5 h-3.5" /> Verified
                </span>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">Pending</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No {service} callsign added.</p>
      )}
    </div>
  );
}

export default function Profile() {
  const { checkUserAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const [form, setForm] = useState({
    display_name: '', callsign: '', location: '', city: '', state: '', bio: '', website: '',
    avatar_url: '', banner_url: '', banner_focal_x: 50, banner_focal_y: 50, banner_zoom: 1,
    avatar_focal_x: 50, avatar_focal_y: 50, avatar_zoom: 1, license_number: '',
    license_status: 'Unverified', email_notifications: true, email_announcements: true,
    email_forum_replies: true, email_messages: true, email_access_requests: true,
    show_online_status: true, sound_notifications: true,
  });
  const [stats, setStats] = useState({ contacts: 0, equipment: 0, badges: 0 });
  const [profileCallsigns, setProfileCallsigns] = useState([]);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const existing = await base44.entities.Profile.filter({ created_by_id: me.id }, '-updated_date', 1);
        let p = existing?.[0];
        if (!p) {
          p = await base44.entities.Profile.create({
            display_name: me.full_name || '',
            callsign: me.callsign || '',
            location: me.location || '',
            bio: me.bio || '',
            license_number: me.license_number || '',
            license_status: me.license_status || 'Unverified',
          });
        }
        setProfile(p);
        setForm({
          display_name: p.display_name || me.full_name || '',
          callsign: p.callsign || me.callsign || '',
          location: p.location || me.location || '',
          city: p.city || '', state: p.state || '', bio: p.bio || me.bio || '',
          website: p.website || '', avatar_url: p.avatar_url || '', banner_url: p.banner_url || '',
          banner_focal_x: p.banner_focal_x ?? 50, banner_focal_y: p.banner_focal_y ?? 50,
          banner_zoom: p.banner_zoom ?? 1, avatar_focal_x: p.avatar_focal_x ?? 50,
          avatar_focal_y: p.avatar_focal_y ?? 50, avatar_zoom: p.avatar_zoom ?? 1,
          license_number: p.license_number || me.license_number || '',
          license_status: p.license_status || me.license_status || 'Unverified',
          email_notifications: me.email_notifications !== false,
          email_announcements: me.email_announcements !== false,
          email_forum_replies: me.email_forum_replies !== false,
          email_messages: me.email_messages !== false,
          email_access_requests: me.email_access_requests !== false,
          show_online_status: me.show_online_status !== false,
          sound_notifications: me.sound_notifications !== false,
        });

        const [c, e, ub, ownedCallsigns, authorizedAccess] = await Promise.all([
          base44.entities.ContactLog.filter({ created_by_id: me.id }, '-date', 500).catch(() => []),
          base44.entities.Equipment.filter({ created_by_id: me.id }, '-updated_date', 500).catch(() => []),
          base44.entities.UserBadge.filter({ user_id: me.id }, '-awarded_at', 500).catch(() => []),
          base44.entities.Callsign.filter({ primary_user_id: me.id, duplicate_flagged: { $ne: true } }, '-created_date', 50).catch(() => []),
          base44.entities.CallsignAccess.filter({ user_id: me.id, status: 'approved' }, '-approved_at', 50).catch(() => []),
        ]);
        const owned = (ownedCallsigns || []).map((cs) => ({ ...cs, relationship: 'Primary' }));
        const authorizedRecords = await Promise.all(
          (authorizedAccess || []).map((a) => base44.entities.Callsign.get(a.callsign_id).catch(() => null))
        );
        const authorized = authorizedRecords.filter(Boolean).map((cs) => ({ ...cs, relationship: 'Authorized' }));
        setProfileCallsigns(Array.from(new Map([...owned, ...authorized].map((cs) => [cs.id, cs])).values()));
        setStats({ contacts: (c || []).length, equipment: (e || []).length, badges: (ub || []).length });
      } catch (err) {
        console.error(err);
      }

      // Handle OAuth callback redirect params
      const urlParams = new URLSearchParams(window.location.search);
      const section = urlParams.get('section');
      if (section) setActiveSection(section);
      const connectedPlatform = urlParams.get('social_connected');
      const socialError = urlParams.get('social_error');
      if (connectedPlatform) toast({ title: 'Account connected', description: `Your ${connectedPlatform} account has been verified and linked.` });
      if (socialError) toast({ title: 'Connection failed', description: socialError, variant: 'destructive' });
      if (urlParams.has('section') || urlParams.has('social_connected') || urlParams.has('social_error')) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      setLoading(false);
    })();
  }, []);

  const persistProfile = async (patch) => {
    if (!profile?.id) return;
    try {
      await base44.entities.Profile.update(profile.id, patch);
      setProfile((p) => ({ ...p, ...patch }));
    } catch (err) {
      console.error('persistProfile error', err);
    }
  };

  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const patch = { avatar_url: file_url, avatar_focal_x: 50, avatar_focal_y: 50, avatar_zoom: 1 };
      setForm((f) => ({ ...f, ...patch }));
      await persistProfile(patch);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

  const onBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const patch = { banner_url: file_url, banner_focal_x: 50, banner_focal_y: 50, banner_zoom: 1 };
      setForm((f) => ({ ...f, ...patch }));
      await persistProfile(patch);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await base44.entities.Profile.update(profile.id, form);
      await base44.auth.updateMe({
        location: form.location,
        bio: form.bio,
        email_notifications: form.email_notifications,
        email_announcements: form.email_announcements,
        email_forum_replies: form.email_forum_replies,
        email_messages: form.email_messages,
        email_access_requests: form.email_access_requests,
        show_online_status: form.show_online_status,
        sound_notifications: form.sound_notifications,
      });
      const me = await base44.auth.me();
      setUser(me);
      checkUserAuth();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8"><div className="h-96 rounded-2xl bg-muted animate-pulse" /></div>;

  const initial = (form.display_name || form.callsign || user?.email || 'U').charAt(0).toUpperCase();

  const selectSection = (id) => {
    setActiveSection(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-primary text-sm font-semibold">
            <Settings className="w-4 h-4" /> Account Center
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mt-1">
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight">Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">Manage your Repeater Nation account and community identity.</p>
            </div>
            <Link to={`/members/${user?.id}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              View public profile <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="lg:hidden mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Settings section</label>
          <select
            value={activeSection}
            onChange={(e) => selectSection(e.target.value)}
            className="mt-2 w-full h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            {SETTINGS_NAV.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>

        <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] gap-6 items-start">
          <aside className="hidden lg:block lg:sticky lg:top-20">
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground overflow-hidden grid place-items-center font-bold shrink-0">
                    {form.avatar_url ? <img src={form.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold flex items-center gap-1.5 min-w-0"><span className="truncate">{form.display_name || form.callsign || 'Account'}</span><StaffTag userId={user?.id} /></div>
                    <div className="text-xs text-muted-foreground truncate">{form.callsign || user?.email || 'Member'}</div>
                  </div>
                </div>
              </div>
              <nav className="p-2">
                {SETTINGS_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSection(item.id)}
                      className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-lg transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="block text-[11px] mt-0.5 opacity-75">{item.description}</span>
                      </span>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${active ? 'translate-x-0.5' : 'opacity-40'}`} />
                    </button>
                  );
                })}
              </nav>
              <div className="p-2 border-t border-border">
                <Link to="/callsign-management" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent">
                  <Radio className="w-4 h-4" /> Manage callsigns
                </Link>
              </div>
            </Card>
          </aside>

          <main className="min-w-0">
            {activeSection === 'profile' && (
              <div className="space-y-5">
                <Card className="overflow-hidden">
                  <div className="relative h-40 sm:h-48 bg-gradient-to-r from-navy to-navy-light overflow-hidden">
                    {form.banner_url && (
                      <img src={form.banner_url} alt="cover" className="w-full h-full object-cover" style={{ objectPosition: `${form.banner_focal_x}% ${form.banner_focal_y}%`, transform: `scale(${form.banner_zoom || 1})` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                    <div className="absolute top-3 right-3 flex gap-2">
                      {form.banner_url && <Button type="button" size="sm" variant="secondary" onClick={() => setBannerEditorOpen(true)}><Crop className="w-4 h-4 mr-1" /> Adjust</Button>}
                      <label className="inline-flex items-center h-9 px-3 rounded-md bg-background/90 text-foreground text-sm font-medium cursor-pointer">
                        <Camera className="w-4 h-4 mr-1.5" /> {form.banner_url ? 'Change cover' : 'Add cover'}
                        <input type="file" accept="image/*" className="hidden" onChange={onBanner} disabled={uploading} />
                      </label>
                    </div>
                  </div>
                  <div className="px-5 sm:px-6 pb-6">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 relative">
                      <div className="w-24 h-24 rounded-full border-4 border-card bg-primary text-primary-foreground overflow-hidden grid place-items-center shadow-lg shrink-0">
                        {form.avatar_url ? <img src={form.avatar_url} alt="avatar" className="w-full h-full object-cover" style={{ objectPosition: `${form.avatar_focal_x}% ${form.avatar_focal_y}%`, transform: `scale(${form.avatar_zoom || 1})` }} /> : <span className="text-3xl font-bold">{initial}</span>}
                      </div>
                      <div className="pb-1 min-w-0">
                        <h2 className="text-xl font-bold flex items-center gap-2 min-w-0"><span className="truncate">{form.display_name || form.callsign || 'Operator'}</span><StaffTag userId={user?.id} /></h2>
                        <p className="text-sm text-muted-foreground truncate">{form.callsign ? `${form.callsign} · ` : ''}{user?.email}</p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-5 sm:p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><User className="w-5 h-5" /></div>
                    <div>
                      <h2 className="font-heading font-semibold text-lg">Profile information</h2>
                      <p className="text-sm text-muted-foreground">Choose how the Repeater Nation community sees you.</p>
                    </div>
                  </div>
                  <form onSubmit={save} className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div><Label>Display Name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Your name or handle" /></div>
                      <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value, city: '', state: '' })} placeholder="City, State or general area" /></div>
                      <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://your-site.com" /></div>
                    </div>
                    <div><Label>Bio</Label><textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={5} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-y" placeholder="Tell the community about yourself..." /></div>
                    <div className="border-t border-border pt-5">
                      <div className="flex flex-wrap gap-3">
                        <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent">
                          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                          {uploading ? 'Uploading...' : 'Upload avatar'}
                          <input type="file" accept="image/*" className="hidden" onChange={onAvatar} disabled={uploading} />
                        </label>
                        {form.avatar_url && <Button type="button" variant="outline" onClick={() => setAvatarEditorOpen(true)}><Crop className="w-4 h-4 mr-2" /> Adjust avatar</Button>}
                        {form.banner_url && <Button type="button" variant="outline" onClick={() => setBannerEditorOpen(true)}><Crop className="w-4 h-4 mr-2" /> Adjust cover</Button>}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={saving} size="lg"><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save changes'}</Button>
                    </div>
                  </form>
                </Card>

                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-4"><BookOpen className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{stats.contacts}</div><div className="text-xs text-muted-foreground">Radio Contacts</div></Card>
                  <Card className="p-4"><Cpu className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{stats.equipment}</div><div className="text-xs text-muted-foreground">Equipment</div></Card>
                  <Card className="p-4"><Award className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{stats.badges}</div><div className="text-xs text-muted-foreground">Badges</div></Card>
                </div>

                <ProfileBadges userId={user?.id} />
                <NetGamification userId={user?.id} />
                <PotaStats userId={user?.id} />
              </div>
            )}

            {activeSection === 'radio' && (
              <Card className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Radio className="w-5 h-5" /></div>
                    <div><h2 className="font-heading font-semibold text-lg">Radio Identity</h2><p className="text-sm text-muted-foreground">Your GMRS and HAM identities.</p></div>
                  </div>
                  <Link to="/callsign-management" className="text-sm text-primary hover:underline">Add / manage callsigns</Link>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CallsignSlot label="GMRS Callsign" service="GMRS" callsigns={profileCallsigns} />
                  <CallsignSlot label="HAM Callsign" service="HAM" callsigns={profileCallsigns} />
                </div>
                <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="w-5 h-5 text-primary mt-0.5" />
                    <div><div className="text-sm font-semibold">Verification is managed separately</div><p className="text-xs text-muted-foreground mt-1">Use My Callsign to add, verify, reverify, or manage your radio identities. Saving this page will not overwrite authoritative callsign verification data.</p></div>
                  </div>
                </div>
              </Card>
            )}

            {activeSection === 'notifications' && (
              <Card className="overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-border">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Bell className="w-5 h-5" /></div><div><h2 className="font-heading font-semibold text-lg">Notifications</h2><p className="text-sm text-muted-foreground">Control how Repeater Nation keeps you informed.</p></div></div>
                </div>
                <form onSubmit={save} className="p-5 sm:p-6">
                  <div className="rounded-xl border border-border divide-y divide-border">
                    {[
                      ['email_notifications','All email notifications','Master switch for account emails'],
                      ['email_announcements','Announcements & alerts','Admin broadcasts and important site notices'],
                      ['email_forum_replies','Forum replies','Replies to your forum posts'],
                      ['email_messages','Direct messages','New messages from members'],
                      ['email_access_requests','Repeater access requests','Requests for access to your repeaters'],
                      ['sound_notifications','Notification sound','Play a chime for new in-app notifications and messages'],
                    ].map(([key, label, desc]) => (
                      <div key={key} className="flex items-center justify-between gap-4 p-4">
                        <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground mt-0.5">{desc}</div></div>
                        <Switch checked={form[key] !== false} onCheckedChange={(v) => setForm({ ...form, [key]: v })} />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-5"><Button type="submit" disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save notification settings'}</Button></div>
                </form>
              </Card>
            )}

            {activeSection === 'privacy' && (
              <Card className="p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Shield className="w-5 h-5" /></div><div><h2 className="font-heading font-semibold text-lg">Privacy</h2><p className="text-sm text-muted-foreground">Control your visibility in the community.</p></div></div>
                <form onSubmit={save}>
                  <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                    <div><div className="text-sm font-medium">Show online status</div><div className="text-xs text-muted-foreground mt-1">Allow other members to see when you're online and your last-active time.</div></div>
                    <Switch checked={form.show_online_status !== false} onCheckedChange={(v) => setForm({ ...form, show_online_status: v })} />
                  </div>
                  <div className="flex justify-end mt-5"><Button type="submit" disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save privacy settings'}</Button></div>
                </form>
              </Card>
            )}

            {activeSection === 'connected' && (
              <ConnectedAccounts user={user} />
            )}

            {activeSection === 'api' && (
              <div><ApiAccessCard user={user} /></div>
            )}

            {activeSection === 'account' && (
              <div className="space-y-5">
                <Card className="p-5 sm:p-6">
                  <div className="flex items-center gap-3 mb-5"><div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Settings className="w-5 h-5" /></div><div><h2 className="font-heading font-semibold text-lg">Account</h2><p className="text-sm text-muted-foreground">Account-level actions and security tools.</p></div></div>
                  <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                    <div><div className="text-sm font-medium">Email address</div><div className="text-sm text-muted-foreground mt-1">{user?.email || 'Not available'}</div></div>
                    <span className="text-xs text-muted-foreground">Managed by account authentication</span>
                  </div>
                </Card>
                <DangerZone user={user} />
              </div>
            )}
          </main>
        </div>
      </div>

      <BannerEditor
        open={bannerEditorOpen}
        onClose={() => setBannerEditorOpen(false)}
        bannerUrl={form.banner_url}
        focalX={form.banner_focal_x}
        focalY={form.banner_focal_y}
        zoom={form.banner_zoom}
        onSave={(vals) => { setForm((f) => ({ ...f, ...vals })); persistProfile(vals); }}
      />
      <AvatarEditor
        open={avatarEditorOpen}
        onClose={() => setAvatarEditorOpen(false)}
        avatarUrl={form.avatar_url}
        focalX={form.avatar_focal_x}
        focalY={form.avatar_focal_y}
        zoom={form.avatar_zoom}
        onSave={(vals) => { setForm((f) => ({ ...f, ...vals })); persistProfile(vals); }}
      />
    </div>
  );
}