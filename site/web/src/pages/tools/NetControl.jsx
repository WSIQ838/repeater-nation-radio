import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import ToolShell from '@/components/tools/ToolShell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { formatFreq } from '@/utils';
import { PERMISSION_LABELS, PERMISSION_COLORS } from '@/lib/netHostPermissions';
import CreateNetDialog from '@/components/netcontrol/CreateNetDialog';
import LiveNetDashboard from '@/components/netcontrol/LiveNetDashboard';
import RosterDialog from '@/components/netcontrol/RosterDialog';
import NetReportDialog from '@/components/netcontrol/NetReportDialog';
import {
  Megaphone, Plus, Users, Globe, Play, FileText, Trash2, Edit, Copy,
  Search, Calendar, Radio, MapPin, Loader2, ClipboardList,
  Check, X, Mail, Inbox, Activity, RadioTower,
} from 'lucide-react';

import { errMsg } from '@/lib/utils';
import TooltipHint from '@/components/ui/TooltipHint';
const NET_TYPES = ['Regular', 'Weekly', 'Community', 'Training', 'Special Event', 'Emergency', 'Other'];
const STATUS_TONE = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  ended: 'bg-muted text-muted-foreground',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function NetRow({ net, onOpen, onReport, onDelete, onEdit, canManage, permission }) {
  const freq = net.frequency ? `${formatFreq(net.frequency)} MHz` : net.channel ? `CH ${net.channel}` : '';
  return (
    <Card className="p-4 rounded-xl shadow-sm flex items-center gap-4 flex-wrap hover:border-primary/40 transition-colors">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-heading font-semibold">{net.name}</span>
          <Badge className={STATUS_TONE[net.status] || ''} variant="secondary">{net.status}</Badge>
          <Badge variant="outline">{net.net_type}</Badge>
          {net.is_public && <Badge variant="outline"><Globe className="w-3 h-3 mr-1" />Public</Badge>}
          {permission && (
            <Badge className={PERMISSION_COLORS[permission] || ''}>{PERMISSION_LABELS[permission] || permission}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          {freq && <span className="flex items-center gap-1"><Radio className="w-3 h-3" />{freq}</span>}
          {net.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{net.location}</span>}
          {net.scheduled_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(net.scheduled_date).toLocaleDateString()}</span>}
          {net.club_name && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{net.club_name}</span>}
          {net.total_checkins > 0 && <span>{net.total_checkins} check-ins</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {net.status === 'active' && onOpen && (
          <Button size="sm" title="Open the live net dashboard to manage check-ins and the active session." onClick={() => onOpen(net)}><Play className="w-4 h-4 mr-1" />Live Dashboard</Button>
        )}
        {net.status === 'scheduled' && onOpen && (
          <Button size="sm" title="Open this scheduled net and review its settings before it starts." onClick={() => onOpen(net)}><Play className="w-4 h-4 mr-1" />Open</Button>
        )}
        {net.status === 'ended' && onReport && (
          <Button size="sm" variant="outline" title="View the completed net report and attendance details." onClick={() => onReport(net)}><FileText className="w-4 h-4 mr-1" />Report</Button>
        )}
        {canManage && onEdit && (
          <Button size="icon" variant="ghost" title="Edit this net" aria-label="Edit this net" onClick={() => onEdit(net)}><Edit className="w-4 h-4" /></Button>
        )}
        {canManage && net.status !== 'active' && onDelete && (
          <Button size="icon" variant="ghost" title="Delete this net" aria-label="Delete this net" onClick={() => onDelete(net)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        )}
      </div>
    </Card>
  );
}

function InvitationCard({ inv, onAccept, onDecline }) {
  return (
    <Card className="p-4 rounded-xl border-primary/30 bg-primary/5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Mail className="w-4 h-4 text-primary" />
            <span className="font-heading font-semibold">{inv.name}</span>
            <Badge variant="outline">{inv.net_type}</Badge>
            <Badge className={PERMISSION_COLORS[inv.permission_level] || ''}>
              {PERMISSION_LABELS[inv.permission_level] || inv.permission_level}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <strong>{inv.invited_by_name || 'A net operator'}</strong> invited you to co-host this net.
          </p>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {inv.scheduled_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(inv.scheduled_date).toLocaleDateString()}</span>}
            {inv.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{inv.location}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" title="Accept the invitation and add this shared net to your workspace." onClick={() => onAccept(inv)}><Check className="w-4 h-4 mr-1" />Accept</Button>
          <Button size="sm" variant="outline" title="Decline this co-host invitation." onClick={() => onDecline(inv)}><X className="w-4 h-4 mr-1" />Decline</Button>
        </div>
      </div>
    </Card>
  );
}

function RosterRow({ roster, onEdit, onDuplicate, onDelete }) {
  const members = roster.members ? JSON.parse(roster.members) : [];
  return (
    <Card className="p-4 flex items-center gap-4 flex-wrap hover:border-primary/40 transition-colors">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-heading font-semibold">{roster.name}</span>
          <Badge variant="outline">{roster.roster_type === 'club_sync' ? 'Club Sync' : 'Custom'}</Badge>
          {roster.sync_enabled && <Badge variant="outline" className="text-green-600">Auto-sync</Badge>}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{roster.member_count || members.length} members</span>
          {roster.club_name && <span>{roster.club_name}</span>}
          {roster.last_sync_at && <span>Last sync: {new Date(roster.last_sync_at).toLocaleString()}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" title="Edit this roster" onClick={() => onEdit(roster)}><Edit className="w-4 h-4 mr-1" />Edit</Button>
        <Button size="sm" variant="outline" title="Create a copy of this roster to use as a starting point for another net." onClick={() => onDuplicate(roster)}><Copy className="w-4 h-4 mr-1" />Duplicate</Button>
        <Button size="icon" variant="ghost" title="Delete this roster" aria-label="Delete this roster" onClick={() => onDelete(roster)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </div>
    </Card>
  );
}

export default function NetControl() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('myNets');
  const [nets, setNets] = useState([]);
  const [sharedNets, setSharedNets] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [publicNets, setPublicNets] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeSession, setActiveSession] = useState(null);
  const [showCreateNet, setShowCreateNet] = useState(false);
  const [editingNet, setEditingNet] = useState(null);
  const [showRosterDialog, setShowRosterDialog] = useState(false);
  const [editingRoster, setEditingRoster] = useState(null);
  const [reportNet, setReportNet] = useState(null);
  const [search, setSearch] = useState('');
  const [processingInv, setProcessingInv] = useState(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [myNets, pubNets, myRosters, sharedRes] = await Promise.all([
        base44.entities.NetControlSession.filter({ created_by_id: user.id }, '-updated_date', 200),
        base44.entities.NetControlSession.filter({ is_public: true }, '-updated_date', 100),
        base44.entities.NetControlRoster.filter({ created_by_id: user.id }, '-updated_date', 100),
        base44.functions.invoke('manage-net-hosts', { action: 'my_shared_nets' }).catch(() => ({ data: { nets: [], invitations: [] } })),
      ]);
      setNets(myNets || []);
      setPublicNets(pubNets || []);
      setRosters(myRosters || []);
      setSharedNets(sharedRes?.data?.nets || []);
      setInvitations(sharedRes?.data?.invitations || []);
    } catch (e) { console.error('NetControl load error:', e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenNet = (net) => { setActiveSession(net); setView('dashboard'); };
  const handleBackFromDashboard = () => { setView('list'); setActiveSession(null); loadData(); };

  const handleEditNet = (net) => { setEditingNet(net); setShowCreateNet(true); };

  const handleDeleteNet = async (net) => {
    if (!confirm(`Delete "${net.name}"? This cannot be undone.`)) return;
    try {
      await base44.entities.NetControlSession.delete(net.id);
      setNets((prev) => prev.filter((n) => n.id !== net.id));
    } catch (e) { console.error(e); }
  };

  const handleDeleteRoster = async (roster) => {
    if (!confirm(`Delete roster "${roster.name}"?`)) return;
    try {
      await base44.entities.NetControlRoster.delete(roster.id);
      setRosters((prev) => prev.filter((r) => r.id !== roster.id));
    } catch (e) { console.error(e); }
  };

  const handleDuplicateRoster = async (roster) => {
    try {
      await base44.entities.NetControlRoster.create({
        name: `${roster.name} (Copy)`,
        description: roster.description || '',
        roster_type: 'custom',
        members: roster.members || '[]',
        member_count: roster.member_count || 0,
      });
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleAcceptInvitation = async (inv) => {
    setProcessingInv(inv.invitation_id);
    try {
      await base44.functions.invoke('manage-net-hosts', { action: 'accept', host_id: inv.invitation_id });
      loadData();
    } catch (e) { alert(errMsg(e) || 'Failed to accept'); }
    setProcessingInv(null);
  };

  const handleDeclineInvitation = async (inv) => {
    setProcessingInv(inv.invitation_id);
    try {
      await base44.functions.invoke('manage-net-hosts', { action: 'decline', host_id: inv.invitation_id });
      loadData();
    } catch (e) { alert(errMsg(e) || 'Failed to decline'); }
    setProcessingInv(null);
  };

  if (view === 'dashboard' && activeSession) {
    return <LiveNetDashboard session={activeSession} user={user} onBack={handleBackFromDashboard} />;
  }

  const filteredNets = nets.filter((n) =>
    !search || n.name?.toLowerCase().includes(search.toLowerCase()) || n.net_type?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredShared = sharedNets.filter((n) =>
    !search || n.name?.toLowerCase().includes(search.toLowerCase()) || n.net_type?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPublic = publicNets.filter((n) =>
    !search || n.name?.toLowerCase().includes(search.toLowerCase()) || n.location?.toLowerCase().includes(search.toLowerCase()) || n.net_type?.toLowerCase().includes(search.toLowerCase())
  );

  const activeNets = nets.filter((n) => n.status === 'active');
  const scheduledNets = nets.filter((n) => n.status === 'scheduled');
  const totalCheckins = nets.reduce((sum, n) => sum + Number(n.total_checkins || 0), 0);

  return (
    <ToolShell title="Net Control" description="Run live GMRS and HAM nets, manage check-ins, track attendance, and generate reports." icon={Megaphone} disclaimer={false}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-orange-500" />
          <div className="p-4 sm:p-5 flex items-center gap-3 flex-wrap">
            <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground grid place-items-center"><RadioTower className="w-5 h-5" /></div>
            <div className="flex-1 min-w-[220px]"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Operations Center</div><h2 className="text-xl font-heading font-bold tracking-tight flex items-center gap-2">Net Control Command Center <TooltipHint>Use this workspace to create and manage nets, handle shared hosting, maintain operator rosters, and open live net dashboards.</TooltipHint></h2><p className="text-xs text-muted-foreground">Coordinate live radio nets, operators, rosters, and check-ins from one workspace.</p></div>
            <Badge variant="outline" className="text-green-600 border-green-300"><Activity className="w-3 h-3 mr-1" />{activeNets.length} active</Badge>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border-t">
            {[["Active Nets",activeNets.length],["Scheduled",scheduledNets.length],["My Nets",nets.length],["Check-ins",totalCheckins]].map(([label,value]) => <div key={label} className="bg-muted/30 px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-xl font-heading font-bold">{value}</div></div>)}
          </div>
        </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3 p-1">
          <TabsList className="bg-muted/50 p-1.5 rounded-xl">
            <TabsTrigger value="myNets"><ClipboardList className="w-4 h-4 mr-1.5" />My Nets</TabsTrigger>
            <TabsTrigger value="shared">
              <Inbox className="w-4 h-4 mr-1.5" />Shared With Me
              {invitations.length > 0 && <Badge className="ml-1.5 bg-primary text-primary-foreground text-[10px] px-1.5">{invitations.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="directory"><Globe className="w-4 h-4 mr-1.5" />Directory</TabsTrigger>
            <TabsTrigger value="rosters"><Users className="w-4 h-4 mr-1.5" />Rosters</TabsTrigger>
          </TabsList>
          {tab === 'myNets' && <Button title="Create a new GMRS or HAM net." onClick={() => setShowCreateNet(true)}><Plus className="w-4 h-4 mr-1.5" />Create Net</Button>}
          {tab === 'rosters' && <Button title="Create a reusable operator roster for net check-ins." onClick={() => { setEditingRoster(null); setShowRosterDialog(true); }}><Plus className="w-4 h-4 mr-1.5" />Create Roster</Button>}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input title={tab === 'rosters' ? 'Search your saved rosters by name.' : 'Search your nets by name, type, or directory location.'} placeholder={tab === 'rosters' ? 'Search rosters…' : 'Search nets…'} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading…</div>
        ) : (
          <>
            <TabsContent value="myNets" className="space-y-3 mt-0">
              {filteredNets.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No nets yet. Click <strong>Create Net</strong> to start.</p>
                </Card>
              ) : (
                filteredNets.map((net) => (
                  <NetRow key={net.id} net={net} onOpen={handleOpenNet} onReport={setReportNet} onEdit={handleEditNet} onDelete={handleDeleteNet} canManage />
                ))
              )}
            </TabsContent>

            <TabsContent value="shared" className="space-y-4 mt-0">
              {/* Pending invitations */}
              {invitations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                    <Mail className="w-4 h-4" />Pending Invitations
                  </h3>
                  {invitations.map((inv) => (
                    <InvitationCard
                      key={inv.invitation_id}
                      inv={inv}
                      onAccept={handleAcceptInvitation}
                      onDecline={handleDeclineInvitation}
                    />
                  ))}
                </div>
              )}
              {/* Shared nets */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                  <Users className="w-4 h-4" />Shared Nets
                </h3>
                {filteredShared.length === 0 && invitations.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>No shared nets yet. When a primary operator invites you to co-host, the net will appear here.</p>
                  </Card>
                ) : (
                  filteredShared.map((net) => (
                    <NetRow
                      key={net.id}
                      net={net}
                      onOpen={handleOpenNet}
                      onReport={setReportNet}
                      canManage={false}
                      permission={net.host_permission}
                    />
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="directory" className="space-y-3 mt-0">
              {filteredPublic.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No public nets in the directory.</p>
                </Card>
              ) : (
                filteredPublic.map((net) => (
                  <NetRow key={net.id} net={net} onOpen={net.created_by_id === user?.id ? handleOpenNet : null} onReport={net.created_by_id === user?.id ? setReportNet : null} onDelete={null} canManage={false} />
                ))
              )}
            </TabsContent>

            <TabsContent value="rosters" className="space-y-3 mt-0">
              {rosters.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No saved rosters yet. Click <strong>Create Roster</strong> to build one.</p>
                </Card>
              ) : (
                rosters.map((roster) => (
                  <RosterRow key={roster.id} roster={roster} onEdit={(r) => { setEditingRoster(r); setShowRosterDialog(true); }} onDuplicate={handleDuplicateRoster} onDelete={handleDeleteRoster} />
                ))
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <CreateNetDialog open={showCreateNet} editingNet={editingNet} onClose={() => { setShowCreateNet(false); setEditingNet(null); }} user={user} onCreated={() => { setShowCreateNet(false); setEditingNet(null); loadData(); }} />
      <RosterDialog open={showRosterDialog} onClose={() => { setShowRosterDialog(false); setEditingRoster(null); }} editingRoster={editingRoster} user={user} onSaved={() => { setShowRosterDialog(false); setEditingRoster(null); loadData(); }} />
      <NetReportDialog open={!!reportNet} onClose={() => setReportNet(null)} session={reportNet} />
      </div>
    </ToolShell>
  );
}