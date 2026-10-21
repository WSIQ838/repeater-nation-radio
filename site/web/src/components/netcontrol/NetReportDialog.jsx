import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatFreq } from '@/utils';
import { Loader2, Printer, Clock, Users, Radio, MapPin, FileText, AlertTriangle } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return '—'; }
}

export default function NetReportDialog({ open, onClose, session }) {
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !session) return;
    setLoading(true);
    base44.entities.NetControlCheckIn.filter({ session_id: session.id }, 'check_in_time', 500)
      .then((r) => { setCheckIns(r || []); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, [open, session]);

  if (!session) return null;

  const freq = session.frequency ? `${formatFreq(session.frequency)} MHz` : session.channel ? `CH ${session.channel}` : '—';
  const emergencyPositions = session.emergency_positions ? JSON.parse(session.emergency_positions) : [];
  const activeStations = checkIns.filter((c) => c.status === 'checked_in' || (c.check_in_time && !c.check_out_time));
  const checkedOut = checkIns.filter((c) => c.status === 'checked_out');
  const guests = checkIns.filter((c) => c.is_guest);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />Net Report — {session.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="w-5 h-5 animate-spin" />Loading report…</div>
        ) : (
          <div className="space-y-4 print:space-y-2">
            {/* Net info */}
            <Card className="p-4 space-y-2 print:border-2">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Net Type:</span> <strong>{session.net_type}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> <strong>{session.status}</strong></div>
                <div className="flex items-center gap-1"><Radio className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Frequency:</span> <strong>{freq}</strong></div>
                <div><span className="text-muted-foreground">Tone:</span> <strong>{session.tone || '—'}</strong></div>
                {session.repeater_name && <div><span className="text-muted-foreground">Repeater:</span> <strong>{session.repeater_name}</strong></div>}
                {session.location && <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Location:</span> <strong>{session.location}</strong></div>}
                <div><span className="text-muted-foreground">Operator:</span> <strong>{session.operator_callsign || session.operator_name || '—'}</strong> <StaffTag userId={session.primary_user_id} callsign={session.primary_user_id ? undefined : session.operator_callsign} /></div>
                {session.club_name && <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Club:</span> <strong>{session.club_name}</strong></div>}
                <div><span className="text-muted-foreground">Started:</span> <strong>{fmtDateTime(session.started_at)}</strong></div>
                <div><span className="text-muted-foreground">Ended:</span> <strong>{fmtDateTime(session.ended_at)}</strong></div>
                <div><span className="text-muted-foreground">Duration:</span> <strong>{session.duration_minutes || 0} min</strong></div>
                <div><span className="text-muted-foreground">Total Check-ins:</span> <strong>{checkIns.length}</strong></div>
              </div>
              {session.description && <p className="text-sm text-muted-foreground pt-2 border-t"><Linkify text={session.description} /></p>}
              {session.notes && <p className="text-sm pt-2 border-t"><span className="text-muted-foreground">Notes: </span><Linkify text={session.notes} /></p>}
            </Card>

            {/* Emergency assignments */}
            {session.emergency_mode && emergencyPositions.length > 0 && (
              <Card className="p-4">
                <h3 className="font-heading font-semibold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />Emergency Assignments</h3>
                <div className="space-y-1">
                  {emergencyPositions.filter((p) => p.callsign).map((p) => {
                    const ci = checkIns.find((c) => c.callsign?.toUpperCase() === p.callsign?.toUpperCase());
                    return (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium w-28">{p.name}</span>
                        <span className="flex-1 inline-flex items-center gap-1.5">{p.callsign}<StaffTag callsign={p.callsign} /></span>
                        {p.scheduled_time && <span className="text-xs text-muted-foreground">Expected: {p.scheduled_time}</span>}
                        {ci ? <Badge className="bg-green-100 text-green-700">Checked In {fmtTime(ci.check_in_time)}</Badge> : <Badge variant="outline">No Show</Badge>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Check-in list */}
            <Card className="p-4">
              <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="w-4 h-4" />Check-in Log</h3>
              {checkIns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No check-ins recorded.</p>
              ) : (
                <div className="space-y-1">
                  {checkIns.sort((a, b) => new Date(a.check_in_time) - new Date(b.check_in_time)).map((ci, i) => (
                    <div key={ci.id} className="flex items-center gap-2 text-sm border-b last:border-0 py-1.5">
                      <span className="text-muted-foreground w-6">{i + 1}.</span>
                      <span className="font-medium w-20">{ci.callsign}</span><StaffTag callsign={ci.callsign} compact />
                      <span className="flex-1 text-muted-foreground">{ci.name}{ci.location ? ` · ${ci.location}` : ''}{ci.station_type ? ` · ${ci.station_type}` : ''}</span>
                      {ci.is_guest && <Badge variant="outline" className="text-xs">Guest</Badge>}
                      {ci.assignment && <Badge variant="outline" className="text-xs">{ci.assignment}</Badge>}
                      <span className="text-xs text-muted-foreground w-16 text-right">In: {fmtTime(ci.check_in_time)}</span>
                      <span className="text-xs text-muted-foreground w-16 text-right">Out: {fmtTime(ci.check_out_time)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 print:grid-cols-3">
              <Card className="p-3 text-center"><div className="text-xs text-muted-foreground">Active</div><div className="text-xl font-bold text-green-600">{activeStations.length}</div></Card>
              <Card className="p-3 text-center"><div className="text-xs text-muted-foreground">Checked Out</div><div className="text-xl font-bold">{checkedOut.length}</div></Card>
              <Card className="p-3 text-center"><div className="text-xs text-muted-foreground">Guests</div><div className="text-xl font-bold text-primary">{guests.length}</div></Card>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint} disabled={loading}><Printer className="w-4 h-4 mr-1" />Print / Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}