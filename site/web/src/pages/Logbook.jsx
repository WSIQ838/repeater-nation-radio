import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Plus, Clock, MapPin, Radio, Download, Trash2, Pencil } from 'lucide-react';
import { formatFreq } from '@/utils';
import QsoFormDialog from '@/components/logbook/QsoFormDialog';
import QsoMap from '@/components/logbook/QsoMap';
import LogbookRadioInfo from '@/components/logbook/LogbookRadioInfo';
import { useLogbookRadioInfo } from '@/hooks/useLogbookRadioInfo';

export default function Logbook() {
  const [logs, setLogs] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingContact, setEditingContact] = useState(null);
  const [popoutSection, setPopoutSection] = useState(null);
  const { radioInfo, updateRadioInfo, resetRadioInfo } = useLogbookRadioInfo();

  const load = async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const rows = u
        ? await base44.entities.ContactLog.filter({ created_by_id: u.id }, '-date', 200).catch(() => [])
        : [];
      setLogs(rows || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Live updates: refresh when contacts change anywhere
  useEffect(() => {
    let timer = null;
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(async () => {
        timer = null;
        try {
          const rows = await base44.entities.ContactLog.filter({ created_by_id: user?.id }, '-date', 200).catch(() => []);
          setLogs(rows || []);
        } catch (e) { console.error(e); }
      }, 800);
    };
    // Every member's log changes reach every open Logbook; only this member's
    // own entries change this list.
    const unsubscribe = base44.entities.ContactLog.subscribe((event) => {
      const row = event?.data;
      if (row && !row._oversize && user?.id && row.created_by_id !== user.id) return;
      scheduleRefresh();
    });
    return () => {
      if (unsubscribe) unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [user?.id]);

  const deleteLog = async (l) => {
    if (!l?.id) return;
    try {
      await base44.entities.ContactLog.delete(l.id);
      setLogs((ls) => ls.filter((x) => x.id !== l.id));
    } catch (e) { console.error(e); }
  };

  const focusContactForm = () => {
    requestAnimationFrame(() => {
      document.getElementById('log-contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openNew = () => {
    setEditingContact(null);
    focusContactForm();
  };

  const openEdit = (contact) => {
    setEditingContact(contact);
    focusContactForm();
  };

  const exportCSV = () => {
    const headers = ['Date', 'Callsign', 'Name', 'Frequency', 'Channel', 'Signal', 'Radio', 'City', 'State', 'ZIP', 'County', 'Lat', 'Lng', 'Notes'];
    const rows = logs.map((l) => [l.date, l.callsign, l.contact_name, l.frequency, l.channel, l.signal_report, l.radio_used, l.city, l.state, l.zip, l.county, l.lat, l.lng, l.notes]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gmrs-logbook.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-background p-3 sm:p-4 lg:p-5 max-w-[1700px] mx-auto space-y-4">
      {/* Command-center header */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-orange-500" />
        <div className="px-4 py-3 sm:px-5 sm:py-4 flex flex-wrap items-center justify-between gap-4 bg-card">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-10 h-10 rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-heading font-bold tracking-tight">Digital Logbook</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 text-success px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">Community radio contact operations center</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" /> Log Contact
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border bg-muted/30">
          <div className="px-4 py-3 border-r border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total QSOs</div>
            <div className="text-lg font-heading font-bold mt-0.5 text-foreground">{logs.length}</div>
          </div>
          <div className="px-4 py-3 border-r border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Latest Contact</div>
            <div className="text-sm font-medium mt-1 truncate">{logs[0]?.callsign || '—'}</div>
          </div>
          <div className="px-4 py-3 border-r border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Radio Service</div>
            <div className="text-sm font-medium mt-1">{logs[0]?.radio_service || 'GMRS'}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Map Points</div>
            <div className="text-sm font-medium mt-1">{logs.filter((l) => l.lat && l.lng).length}</div>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="relative xl:order-2 xl:h-[280px]">
          <div className="h-full">
            <LogbookRadioInfo
              radioInfo={radioInfo}
              onChange={updateRadioInfo}
              onReset={resetRadioInfo}
            />
          </div>
          <Button variant="outline" size="sm" className="absolute top-3 right-3" onClick={() => setPopoutSection('radio')} title="Open Radio Information in a popout">Pop Out</Button>
        </div>

        {/* Contact operations panel */}
        <Card className="overflow-hidden border-border shadow-sm rounded-xl xl:order-1 xl:h-[280px] flex flex-col">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-primary" /><h2 className="font-heading font-semibold text-sm">Contact Log</h2></div>
              <p className="text-[11px] text-muted-foreground">Most recent communications</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPopoutSection('log')} title="Open Contact Log in a popout">Pop Out</Button>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-success" />
              {logs.length ? 'Operational' : 'Standby'}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="p-3 space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-[68px] rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-20 px-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3">
                  <Radio className="w-5 h-5" />
                </div>
                <p className="font-medium text-foreground">No contacts logged yet</p>
                <p className="text-xs mt-1">Use the Log a Contact panel next to this log to record your first QSO.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {logs.map((l) => (
                  <div key={l.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 grid place-items-center font-bold text-[10px] shrink-0">
                        {l.callsign?.slice(0, 4)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{l.callsign}</span>
                          {l.contact_name && <span className="text-xs text-muted-foreground truncate">· {l.contact_name}</span>}
                          {l.radio_service && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wide">{l.radio_service}</span>}
                          {l.mode && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 font-semibold uppercase tracking-wide">{l.mode}</span>}
                        </div>
                        <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
                          {l.frequency && <span className="font-mono font-medium text-foreground/80">{formatFreq(l.frequency)} MHz</span>}
                          {l.channel && <span>CH {l.channel}</span>}
                          {l.signal_report && <span className="font-mono px-1.5 py-0.5 rounded bg-muted">{l.signal_report}</span>}
                          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {l.date ? new Date(l.date).toLocaleString() : '—'}</span>
                          {(l.city || l.state) && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {[l.city, l.state, l.zip].filter(Boolean).join(', ')}</span>}
                        </div>
                        {(l.radio_used || l.notes) && <div className="mt-1.5 text-[11px] text-muted-foreground truncate">{l.radio_used && <span className="mr-3">📻 {l.radio_used}</span>}{l.notes && <span>{l.notes}</span>}</div>}
                      </div>
                      {l.created_by_id === user?.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openEdit(l)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteLog(l)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">

        {/* Operations map */}
        <Card className="overflow-hidden border-border shadow-sm rounded-xl p-0 h-[55vh] xl:h-[62vh]">
          <div className="h-11 px-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-success" /><h2 className="font-heading font-semibold text-sm">Contact Map</h2></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {logs.filter((l) => l.lat && l.lng).length} mapped
              </span>
              <Button variant="outline" size="sm" onClick={() => setPopoutSection('map')} title="Open Contact Map in a popout">Pop Out</Button>
            </div>
          </div>
          <div className="h-[calc(100%-2.75rem)]">
            <QsoMap logs={logs} />
          </div>
        </Card>

        {/* Log a Contact panel */}
        <Card id="log-contact-form" className="overflow-hidden border-border shadow-sm rounded-xl scroll-mt-6">
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-orange-500" /><h2 className="font-heading font-semibold text-sm">{editingContact ? 'Edit Contact' : 'Log a Contact'}</h2></div>
              <p className="text-[11px] text-muted-foreground">{editingContact ? 'Update the selected QSO.' : 'Record a new QSO directly from the logbook.'}</p>
            </div>
            <div className="flex items-center gap-2">
              {editingContact && <Button variant="outline" size="sm" onClick={() => setEditingContact(null)}>New Contact</Button>}
              <Button variant="outline" size="sm" onClick={() => setPopoutSection('form')} title="Open Log a Contact in a popout">Pop Out</Button>
            </div>
          </div>
          <div className="p-4 sm:p-5 max-h-[62vh] overflow-y-auto scrollbar-thin">
            <QsoFormDialog
              open={true}
              inline
              onOpenChange={() => {}}
              editingContact={editingContact}
              radioInfo={radioInfo}
              onSaved={async () => { await load(); setEditingContact(null); }}
            />
          </div>
        </Card>


      </div>

      <Dialog open={popoutSection === 'log'} onOpenChange={(open) => !open && setPopoutSection(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-heading font-bold">Contact Log</h2>
              <p className="text-sm text-muted-foreground">Most recent communications</p>
            </div>
            <span className="text-xs text-muted-foreground">{logs.length} contact{logs.length === 1 ? '' : 's'}</span>
          </div>
          <div className="max-h-[72vh] overflow-y-auto scrollbar-thin rounded-lg border border-border">
            {loading ? (
              <div className="p-3 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-[68px] rounded-lg bg-muted animate-pulse" />)}</div>
            ) : logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 px-6">
                <Radio className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-foreground">No contacts logged yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {logs.map((l) => (
                  <div key={l.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 grid place-items-center font-bold text-[10px] shrink-0">{l.callsign?.slice(0, 4)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{l.callsign}</span>
                          {l.contact_name && <span className="text-xs text-muted-foreground truncate">· {l.contact_name}</span>}
                          {l.radio_service && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wide">{l.radio_service}</span>}
                          {l.mode && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 font-semibold uppercase tracking-wide">{l.mode}</span>}
                        </div>
                        <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
                          {l.frequency && <span className="font-mono font-medium text-foreground/80">{formatFreq(l.frequency)} MHz</span>}
                          {l.channel && <span>CH {l.channel}</span>}
                          {l.signal_report && <span className="font-mono px-1.5 py-0.5 rounded bg-muted">{l.signal_report}</span>}
                          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {l.date ? new Date(l.date).toLocaleString() : '—'}</span>
                          {(l.city || l.state) && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {[l.city, l.state, l.zip].filter(Boolean).join(', ')}</span>}
                        </div>
                        {(l.radio_used || l.notes) && <div className="mt-1.5 text-[11px] text-muted-foreground truncate">{l.radio_used && <span className="mr-3">📻 {l.radio_used}</span>}{l.notes && <span>{l.notes}</span>}</div>}
                      </div>
                      {l.created_by_id === user?.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { setPopoutSection(null); openEdit(l); }} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteLog(l)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={popoutSection === 'radio'} onOpenChange={(open) => !open && setPopoutSection(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <LogbookRadioInfo radioInfo={radioInfo} onChange={updateRadioInfo} onReset={resetRadioInfo} />
        </DialogContent>
      </Dialog>

      <Dialog open={popoutSection === 'map'} onOpenChange={(open) => !open && setPopoutSection(null)}>
        <DialogContent className="max-w-6xl h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-success" />
            <h2 className="text-lg font-heading font-bold">Contact Map</h2>
            <span className="text-xs text-muted-foreground ml-auto">{logs.filter((l) => l.lat && l.lng).length} mapped</span>
          </div>
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border">
            <QsoMap logs={logs} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={popoutSection === 'form'} onOpenChange={(open) => !open && setPopoutSection(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <QsoFormDialog
            open={popoutSection === 'form'}
            onOpenChange={(open) => !open && setPopoutSection(null)}
            editingContact={editingContact}
            radioInfo={radioInfo}
            onSaved={async () => { await load(); setEditingContact(null); setPopoutSection(null); }}
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}
