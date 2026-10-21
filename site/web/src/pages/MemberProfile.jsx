import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ActivityFeed from '@/components/profile/ActivityFeed';
import ProfileFeed from '@/components/dashboard/ProfileFeed';
import ProfileGallery from '@/components/dashboard/ProfileGallery';
import TaggedFeed from '@/components/profile/TaggedFeed';
import { formatOnlineStatus } from '@/lib/onlineStatus';
import {
  BadgeCheck, MapPin, Radio, Globe, ArrowLeft, UserSearch, Shield, ShieldCheck, Scale, PenSquare, LifeBuoy, Crown, Users, Mail, UserPlus,
  Activity as ActivityIcon, Award, Trophy, Trees, MessageSquare, Images, AtSign,
} from 'lucide-react';

const ROLE_META = {
  super_admin: { icon: Crown, label: 'Super Admin', color: 'text-amber-500' },
  admin: { icon: ShieldCheck, label: 'Administrator', color: 'text-primary' },
  moderator: { icon: Scale, label: 'Moderator', color: 'text-blue-500' },
  editor: { icon: PenSquare, label: 'Content Editor', color: 'text-purple-500' },
  support_staff: { icon: LifeBuoy, label: 'Support Staff', color: 'text-cyan-500' },
  user: { icon: Shield, label: 'Member', color: 'text-muted-foreground' },
};
import ProfileBadges from '@/components/profile/ProfileBadges';
import NetGamification from '@/components/profile/NetGamification';
import PotaStats from '@/components/pota/PotaStats';
import CommonConnections from '@/components/messages/CommonConnections';
import StaffTag from '@/components/shared/StaffTag';
import ConnectedAccountsPublic from '@/components/profile/ConnectedAccountsPublic';
import Linkify from '@/components/shared/Linkify';

// A callsign counts as Verified if its license is active, or — for records
// where license_status hasn't been (re)synced — verification_status already
// confirmed the claim itself. An authorized (non-primary) holder's callsign
// falls back the same way, since being authorized only means the primary
// holder's claim was approved, not that it was re-verified.
function isCallsignVerified(cs) {
  if (['expired', 'suspended', 'cancelled'].includes(cs.license_status)) return false;
  return cs.license_status === 'active' || cs.verification_status === 'verified';
}

export default function MemberProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [friendship, setFriendship] = useState(null);
  const [fsLoading, setFsLoading] = useState(false);
  const [presence, setPresence] = useState(null);
  const [badgeCount, setBadgeCount] = useState(0);
  const [activeTab, setActiveTab] = useState('posts');

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  useEffect(() => {
    if (!me || !id) { setPresence(null); return; }
    base44.functions.invoke('getFriendsPresence', { user_ids: [id], requester_id: me.id })
      .then((r) => {
        const list = r?.data?.users || r?.users || [];
        setPresence(list[0] || null);
      }).catch(() => setPresence(null));
  }, [me, id]);

  useEffect(() => {
    (async () => {
      try {
        const [res, infoRes] = await Promise.all([
          base44.entities.Profile.filter({ created_by_id: id }, '-updated_date', 1),
          base44.functions.invoke('getMemberInfo', { user_id: id })
            .then((r) => r?.data || r).catch(() => null),
        ]);
        setProfile(res?.[0] || null);
        setInfo(infoRes);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!me || me.id === id) { setFriendship(null); return; }
    (async () => {
      try {
        const [req, rec] = await Promise.all([
          base44.entities.Friendship.filter({ requester_id: me.id, recipient_id: id }, '-created_date', 1),
          base44.entities.Friendship.filter({ requester_id: id, recipient_id: me.id }, '-created_date', 1),
        ]);
        setFriendship(req?.[0] || rec?.[0] || null);
      } catch (e) { console.error(e); setFriendship(null); }
    })();
  }, [me, id]);

  const addFriend = async () => {
    if (!me) return;
    setFsLoading(true);
    try {
      const fs = await base44.entities.Friendship.create({
        requester_id: me.id,
        requester_name: me.full_name || me.email,
        recipient_id: id,
        recipient_name: profile?.display_name || profile?.callsign || 'Member',
        status: 'pending',
      });
      setFriendship(fs);
      base44.functions.invoke('notify-friend-request', {
        recipient_id: id,
        requester_id: me.id,
        requester_name: me.full_name || me.email,
      }).catch((e) => console.error('friend request notify failed', e));
    } catch (e) { console.error(e); }
    setFsLoading(false);
  };

  const acceptFriend = async () => {
    if (!friendship) return;
    setFsLoading(true);
    try {
      await base44.entities.Friendship.update(friendship.id, { status: 'accepted' });
      base44.functions.invoke('notify-friend-accepted', { friendship_id: friendship.id })
        .catch((e) => console.error('friend accepted notify failed', e));
      setFriendship({ ...friendship, status: 'accepted' });
    } catch (e) { console.error(e); }
    setFsLoading(false);
  };

  const removeFriend = async () => {
    if (!friendship) return;
    setFsLoading(true);
    try {
      await base44.entities.Friendship.delete(friendship.id);
      setFriendship(null);
    } catch (e) { console.error(e); }
    setFsLoading(false);
  };

  if (loading) return <div className="p-8 max-w-3xl mx-auto"><div className="h-64 rounded-xl bg-muted animate-pulse" /></div>;

  if (!profile) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <Link to="/directory" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <Card className="p-12 text-center">
          <UserSearch className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-heading font-semibold text-lg">No public profile yet</h2>
          <p className="text-sm text-muted-foreground mt-1">This member hasn't set up their profile.</p>
        </Card>
      </div>
    );
  }

  const initial = (profile.display_name || profile.callsign || '?').charAt(0).toUpperCase();
  const website = profile.website?.trim();
  const role = info?.role || 'user';
  const roleMeta = ROLE_META[role] || ROLE_META.user;
  const RoleIcon = roleMeta.icon;
  const clubs = Array.isArray(info?.clubs) ? info.clubs : [];
  const friendsCount = info?.friends_count ?? 0;
  const callsigns = Array.isArray(info?.callsigns) ? info.callsigns : [];
  const taggedCallsigns = callsigns.length
    ? callsigns.map((cs) => cs.display_callsign).filter(Boolean)
    : (profile.callsign ? [profile.callsign] : []);
  // profile.license_status is a legacy Profile-entity field that the newer
  // Callsign-based verification flow never touches, so it goes stale the
  // moment someone verifies through My Callsign instead. Prefer the real
  // callsign records when there are any.
  const verified = callsigns.length > 0 ? callsigns.some(isCallsignVerified) : profile.license_status === 'Active';
  const isOwnProfile = me && me.id === id;
  const onlineStatus = presence?.last_active ? formatOnlineStatus(presence.last_active) : null;
  const canViewPosts = !!isOwnProfile
    || ['admin', 'super_admin'].includes(me?.role)
    || friendship?.status === 'accepted';

  const tabTriggerClass = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold hover:text-foreground transition-colors";

  return (
    <div className="p-0 sm:p-8 max-w-5xl mx-auto space-y-5">
      <div className="px-5 pt-5 sm:p-0">
        <Link to="/directory" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to directory</Link>
      </div>

      <Card className="overflow-hidden rounded-none sm:rounded-xl border-x-0 sm:border-x">
        <div className="h-44 sm:h-72 relative bg-gradient-to-r from-navy to-navy-light overflow-hidden">
          {profile.banner_url && (
            <img
              src={profile.banner_url}
              alt="cover"
              className="w-full h-full object-cover"
              style={{ objectPosition: `${profile.banner_focal_x ?? 50}% ${profile.banner_focal_y ?? 50}%`, transform: `scale(${profile.banner_zoom || 1})` }}
            />
          )}
        </div>
        <div className="px-4 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between -mt-12 sm:-mt-20 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="relative shrink-0 mx-auto sm:mx-0">
                <div className="w-24 h-24 sm:w-36 sm:h-36 rounded-full border-4 border-card bg-primary text-primary-foreground overflow-hidden grid place-items-center shadow-lg">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="avatar"
                      className="w-full h-full object-cover"
                      style={{ objectPosition: `${profile.avatar_focal_x ?? 50}% ${profile.avatar_focal_y ?? 50}%`, transform: `scale(${profile.avatar_zoom || 1})` }}
                    />
                  ) : <span className="text-3xl sm:text-4xl font-heading font-bold">{initial}</span>}
                </div>
                {onlineStatus?.status === 'online' && (
                  <span className="absolute bottom-1.5 right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-success border-2 border-card" title="Online now" />
                )}
              </div>

              <div className="text-center sm:text-left pb-1 sm:pb-2 mt-2 sm:mt-0">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-heading font-bold">{profile.display_name || profile.callsign || 'Operator'}</h1>
                  <StaffTag userId={profile.created_by_id || id} className="text-xs px-2 py-0.5" />
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1 flex-wrap text-sm text-muted-foreground">
                  {callsigns.length > 0 ? (
                    <span className="font-mono">{callsigns.map((cs) => cs.display_callsign).join(' · ')}</span>
                  ) : profile.callsign && <span className="font-mono">@{profile.callsign}</span>}
                  <span aria-hidden="true">·</span>
                  <span>{friendsCount.toLocaleString()} friend{friendsCount === 1 ? '' : 's'}</span>
                  {onlineStatus && (
                    <span className={`font-medium ${onlineStatus.status === 'online' ? 'text-success' : onlineStatus.status === 'idle' ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {onlineStatus.status === 'online' ? '● Online' : onlineStatus.status === 'idle' ? '● Idle' : onlineStatus.text}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!isOwnProfile && me && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4 sm:mt-0 sm:pb-2">
                {friendship?.status === 'accepted' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success/15 text-success text-sm font-medium"><BadgeCheck className="w-4 h-4" /> Friends</span>
                    <Button variant="outline" size="sm" className="rounded-md" onClick={removeFriend} disabled={fsLoading}>Remove</Button>
                  </>
                ) : friendship?.status === 'pending' && friendship.requester_id === me.id ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-sm font-medium">Request pending…</span>
                ) : friendship?.status === 'pending' && friendship.recipient_id === me.id ? (
                  <>
                    <Button size="sm" className="rounded-md" onClick={acceptFriend} disabled={fsLoading}><UserPlus className="w-4 h-4 mr-1.5" /> Accept</Button>
                    <Button variant="outline" size="sm" className="rounded-md" onClick={removeFriend} disabled={fsLoading}>Decline</Button>
                  </>
                ) : (
                  <Button size="sm" className="rounded-md" onClick={addFriend} disabled={fsLoading}><UserPlus className="w-4 h-4 mr-1.5" /> Add Friend</Button>
                )}
                <Button variant="outline" size="sm" className="rounded-md" onClick={() => navigate(`/messages?u=${id}`)}><Mail className="w-4 h-4 mr-1.5" /> Message</Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5 px-5 sm:px-0">
        <div className="space-y-5 order-2 lg:order-1">
          <Card className="p-5">
            <h2 className="font-heading font-semibold text-base mb-3">Intro</h2>
            {profile.bio && <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words mb-3"><Linkify text={profile.bio} /></p>}
            <ul className="space-y-2.5 text-sm">
              {(profile.city || profile.state || profile.location) && (
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" /> Lives in <span className="text-foreground font-medium">{[profile.city, profile.state].filter(Boolean).join(', ') || profile.location}</span>
                </li>
              )}
              {website && (
                <li className="flex items-center gap-2.5 text-muted-foreground min-w-0">
                  <Globe className="w-4 h-4 shrink-0" />
                  <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{website.replace(/^https?:\/\//, '')}</a>
                </li>
              )}
              {callsigns.length > 0 && (
                <li className="flex items-start gap-2.5 text-muted-foreground">
                  <Radio className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex flex-wrap gap-x-2 gap-y-1">
                    {callsigns.map((cs) => (
                      <span key={cs.id} className="inline-flex items-center gap-1">
                        <span className="font-mono font-semibold text-foreground">{cs.display_callsign}</span>
                        <span className="text-xs">({cs.radio_service || 'GMRS'}{cs.relationship === 'Authorized' ? ' · authorized' : ''})</span>
                      </span>
                    ))}
                  </span>
                </li>
              )}
              {callsigns.length === 0 && (
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <BadgeCheck className="w-4 h-4 shrink-0" /> License: <span className={`font-medium ${verified ? 'text-success' : 'text-foreground'}`}>{profile.license_status || 'Unverified'}</span>
                </li>
              )}
              {profile.license_number && (
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <Radio className="w-4 h-4 shrink-0" /> FRN <span className="font-mono text-foreground">{profile.license_number}</span>
                </li>
              )}
              {role !== 'user' && (
                <li className={`flex items-center gap-2.5 ${roleMeta.color}`}>
                  <RoleIcon className="w-4 h-4 shrink-0" /> <span className="font-medium">{roleMeta.label}</span>
                </li>
              )}
            </ul>

            <ConnectedAccountsPublic userId={id} />
          </Card>

          {clubs.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading font-semibold text-base">Clubs</h2>
                <span className="text-xs text-muted-foreground">{clubs.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {clubs.slice(0, 4).map((c) => (
                  <Link key={c.club_id} to={`/clubs/${c.club_id}`} className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted hover:bg-accent transition-colors text-center">
                    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center"><Radio className="w-4 h-4" /></div>
                    <span className="text-xs font-medium truncate w-full">{c.club_name || 'Club'}</span>
                  </Link>
                ))}
              </div>
              {clubs.length > 4 && (
                <button onClick={() => setActiveTab('clubs')} className="w-full mt-3 text-sm text-primary hover:underline font-medium">See all clubs</button>
              )}
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-semibold text-base">Photos</h2>
              {canViewPosts && <button onClick={() => setActiveTab('photos')} className="text-xs text-primary hover:underline font-medium">See all</button>}
            </div>
            {canViewPosts ? (
              <ProfileGallery userId={id} limit={6} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Only friends can see this.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5 order-1 lg:order-2 min-w-0">
          {!isOwnProfile && me && <CommonConnections userId={id} />}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start overflow-x-auto bg-transparent p-0 h-auto gap-1 rounded-none border-b border-border">
              <TabsTrigger value="posts" className={tabTriggerClass}><MessageSquare className="w-4 h-4" /> Posts</TabsTrigger>
              <TabsTrigger value="tagged" className={tabTriggerClass}><AtSign className="w-4 h-4" /> Tagged</TabsTrigger>
              <TabsTrigger value="photos" className={tabTriggerClass}><Images className="w-4 h-4" /> Photos</TabsTrigger>
              <TabsTrigger value="activity" className={tabTriggerClass}><ActivityIcon className="w-4 h-4" /> Activity</TabsTrigger>
              <TabsTrigger value="badges" className={tabTriggerClass}><Award className="w-4 h-4" /> Badges</TabsTrigger>
              <TabsTrigger value="stats" className={tabTriggerClass}><Trophy className="w-4 h-4" /> Net Stats</TabsTrigger>
              <TabsTrigger value="pota" className={tabTriggerClass}><Trees className="w-4 h-4" /> POTA</TabsTrigger>
              {clubs.length > 0 && <TabsTrigger value="clubs" className={tabTriggerClass}><Users className="w-4 h-4" /> Clubs</TabsTrigger>}
            </TabsList>

            <TabsContent value="posts" className="mt-4">
              {canViewPosts ? (
                <ProfileFeed userId={me?.id} authorId={id} />
              ) : (
                <Card className="p-8 text-center">
                  <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Only friends can see {profile.display_name || profile.callsign || 'this member'}'s posts.</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="tagged" className="mt-4">
              {canViewPosts ? (
                <TaggedFeed callsigns={taggedCallsigns} />
              ) : (
                <Card className="p-8 text-center">
                  <AtSign className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Only friends can see what {profile.display_name || profile.callsign || 'this member'} has been tagged in.</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="photos" className="mt-4">
              {canViewPosts ? (
                <Card className="p-6">
                  <ProfileGallery userId={id} limit={60} />
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <Images className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Only friends can see {profile.display_name || profile.callsign || 'this member'}'s photos.</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <ActivityFeed userId={id} />
            </TabsContent>

            <TabsContent value="badges" className="mt-4">
              <ProfileBadges userId={id} onCount={setBadgeCount} />
            </TabsContent>

            <TabsContent value="stats" className="mt-4">
              <NetGamification userId={id} />
            </TabsContent>

            <TabsContent value="pota" className="mt-4">
              <PotaStats userId={id} />
            </TabsContent>

            {clubs.length > 0 && (
              <TabsContent value="clubs" className="mt-4">
                <Card className="p-6">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {clubs.map((c) => (
                      <Link key={c.club_id} to={`/clubs/${c.club_id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-input hover:border-primary/40 hover:bg-accent/40 transition-colors">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.club_name || 'Club'}</div>
                          <div className="text-xs text-muted-foreground">{c.status || 'Member'}</div>
                        </div>
                        <Radio className="w-4 h-4 text-primary shrink-0" />
                      </Link>
                    ))}
                  </div>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}