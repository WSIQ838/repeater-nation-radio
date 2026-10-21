import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { repeaterIcon } from '@/lib/leaflet-setup';
import { RadioTower, Star, Trash2, ExternalLink, Lock, Check, Clock, X, Pencil, Flag, Camera, Upload, CheckCircle2, XCircle } from 'lucide-react';
import RepeaterComments from '@/components/repeaters/RepeaterComments';
import RepeaterDialog from '@/components/repeaters/RepeaterDialog';
import { formatFreq } from '@/utils';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-words">{value}</span>
    </div>
  );
}

export default function RepeaterDetailDialog({ repeater, open, onOpenChange, onDelete, canEdit, isFav, onToggleFav, userId, onUpdated, onReport }) {
  const r = repeater;
  const [myRequest, setMyRequest] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [form, setForm] = useState({ licenseeName: '', familyMembers: '', phoneNumber: '', email: '', usagePurpose: 'Personal', notes: '' });
  const today = new Date().toLocaleDateString();

  useEffect(() => {
    if (!open || !r) { setMyRequest(null); setPhotos([]); return; }
    setMyRequest(null);
    setPhotos([]);
    base44.entities.RepeaterPhoto.filter({ repeater_id: r.id }, '-created_date', 100)
      .then((items) => setPhotos((items || []).filter((p) => p.status === 'Approved' || p.created_by_id === userId)))
      .catch(() => {});
    base44.entities.RepeaterAccessRequest.filter({ repeater_id: r.id, created_by_id: userId })
      .then((reqs) => setMyRequest(reqs?.[0] || null))
      .catch(() => {});
    // Prefill licensee name + email from the current user's profile.
    base44.auth.me().then(async (me) => {
      let dispName = me?.full_name || '';
      let email = me?.email || '';
      try {
        const profiles = await base44.entities.Profile.filter({ created_by_id: me.id });
        dispName = profiles?.[0]?.display_name || dispName;
      } catch {}
      setForm((f) => ({ ...f, licenseeName: dispName, email }));
    }).catch(() => {});
  }, [open, r, userId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submitPhoto = async () => {
    if (!photoFile || !userId || !r?.id) return;
    setPhotoBusy(true);
    setPhotoMessage('');
    try {
      const me = await base44.auth.me();
      if (!me?.id) throw new Error('Please sign in to submit a photo.');
      if (me.callsign_verified === false) throw new Error('Your GMRS callsign must be verified before submitting photos.');
      let callsign = me.callsign || '';
      try {
        const profiles = await base44.entities.Profile.filter({ created_by_id: me.id });
        callsign = profiles?.[0]?.callsign || callsign;
      } catch {}
      const { file_url } = await base44.integrations.Core.UploadFile({ file: photoFile });
      const ownerId = r.owner_user_id || r.created_by_id;
      const approved = ownerId === me.id || me.role === 'admin';
      const created = await base44.entities.RepeaterPhoto.create({
        repeater_id: r.id,
        repeater_name: r.name,
        photo_url: file_url,
        caption: photoCaption.trim() || undefined,
        status: approved ? 'Approved' : 'Pending',
        submitted_by_id: me.id,
        submitted_by_callsign: callsign,
        ...(approved ? { approved_by_id: me.id, approved_date: new Date().toISOString() } : {}),
      });
      setPhotos((items) => [created, ...items]);
      setPhotoFile(null);
      setPhotoCaption('');
      setPhotoMessage(approved ? 'Photo added to the repeater.' : 'Photo submitted for owner approval.');
    } catch (e) {
      setPhotoMessage(e?.message || 'Could not upload photo.');
    } finally { setPhotoBusy(false); }
  };

  const reviewPhoto = async (photo, status) => {
    try {
      const me = await base44.auth.me();
      if (!me?.id || (me.id !== (r.owner_user_id || r.created_by_id) && me.role !== 'admin')) return;
      const updated = await base44.functions.invoke('review-repeater-photo', { photo_id: photo.id, status });
      setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, ...(updated?.data || updated), status } : p));
    } catch (e) { setPhotoMessage(e?.message || 'Could not review photo.'); }
  };

  if (!r) return null;
  const hasCoords = r.lat != null && r.lng != null;
  const isOwner = canEdit;
  const isClosed = r.access === 'Closed';
  const accessGranted = myRequest?.status === 'Granted';
  const showTones = !isClosed || isOwner || accessGranted;

  const requestAccess = async () => {
    setRequesting(true);
    try {
      const me = await base44.auth.me();
      let callsign = '';
      let name = form.licenseeName || me?.full_name || '';
      try {
        const profiles = await base44.entities.Profile.filter({ created_by_id: me.id });
        callsign = profiles?.[0]?.callsign || '';
        name = form.licenseeName || profiles?.[0]?.display_name || name;
      } catch {}
      const created = await base44.entities.RepeaterAccessRequest.create({
        repeater_id: r.id,
        repeater_name: r.name,
        repeater_callsign: r.callsign,
        repeater_frequency: r.frequency,
        repeater_input_tone: showTones ? r.input_tone : undefined,
        repeater_output_tone: showTones ? r.tone : undefined,
        owner_id: r.owner_user_id || r.created_by_id,
        requester_callsign: callsign,
        requester_name: name,
        licensee_name: form.licenseeName.trim() || undefined,
        family_members: form.familyMembers.trim() || undefined,
        phone_number: form.phoneNumber.trim() || undefined,
        email: form.email.trim() || undefined,
        usage_purpose: form.usagePurpose,
        message: form.notes.trim() || undefined,
        status: 'Pending',
      });
      setMyRequest(created);
      try { await base44.functions.invoke('notify-access-request', { request_id: created.id }); } catch (e) { console.error(e); }
    } catch (e) { console.error(e); }
    setRequesting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="grid place-items-center w-11 h-11 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">
              <RadioTower className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{r.name}</DialogTitle>
              <DialogDescription className="font-mono">{formatFreq(r.frequency)} MHz · {r.callsign}</DialogDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onToggleFav} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Favorite">
                <Star className={`w-4 h-4 ${isFav ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
              </button>
              {onReport && (
                <button onClick={() => { onReport(r); onOpenChange(false); }} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Report this repeater">
                  <Flag className="w-4 h-4" />
                </button>
              )}
              {canEdit && (
                <button onClick={() => setEditing(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Edit repeater">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {canEdit && onDelete && (
                <button onClick={() => { onDelete(r); onOpenChange(false); }} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete repeater">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'Online' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{r.mode}</span>
            {isClosed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                <Lock className="w-3 h-3" /> Closed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                <Check className="w-3 h-3" /> Public
              </span>
            )}
            {r.rating > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="w-3 h-3 fill-primary text-primary" /> {r.rating}</span>}
          </div>

          {hasCoords && (
            <div className="h-44 w-full rounded-lg overflow-hidden border border-border">
              <MapContainer center={[r.lat, r.lng]} zoom={10} className="h-full w-full" scrollWheelZoom={false}>
                <TileLayer
                  attribution='&copy; Google'
                  url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                  subdomains={['0', '1', '2', '3']}
                  maxZoom={20}
                />
                <Marker position={[r.lat, r.lng]} icon={repeaterIcon} />
                {r.coverage_radius && (
                  <Circle center={[r.lat, r.lng]} radius={r.coverage_radius * 1609} pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.08 }} />
                )}
              </MapContainer>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Repeater Photos</h3>
            </div>
            {photos.filter((p) => p.status === 'Approved').length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {photos.filter((p) => p.status === 'Approved').map((p) => (
                  <div key={p.id} className="rounded-lg overflow-hidden border border-border bg-muted/30">
                    <button type="button" onClick={() => setLightboxPhoto(p)} className="block w-full cursor-zoom-in" title="View full-size photo">
                      <img src={p.photo_url} alt={p.caption || `${r.name} repeater`} className="w-full h-36 object-cover transition-transform hover:scale-[1.02]" />
                    </button>
                    {(p.caption || p.submitted_by_callsign) && <div className="p-2 text-xs"><div><Linkify text={p.caption} /></div><div className="text-muted-foreground mt-1">Submitted by {p.submitted_by_callsign || 'member'}</div></div>}
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No photos have been approved yet.</p>}

            {userId && (
              <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
                <div className="text-xs text-muted-foreground">Owners and verified members can add photos. Photos from other members are sent to the repeater owner for approval.</div>
                <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} className="text-xs" />
                <Input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Optional caption" />
                <Button type="button" size="sm" onClick={submitPhoto} disabled={!photoFile || photoBusy}>
                  <Upload className="w-4 h-4 mr-2" /> {photoBusy ? 'Uploading…' : 'Add Photo'}
                </Button>
                {photoMessage && <p className="text-xs text-muted-foreground">{photoMessage}</p>}
              </div>
            )}

            {photos.some((p) => p.status === 'Pending') && (isOwner || userId) && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-900 p-3 space-y-2">
                <div className="text-xs font-semibold">Photos awaiting approval</div>
                {photos.filter((p) => p.status === 'Pending' && (isOwner || p.created_by_id === userId)).map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <img src={p.photo_url} alt="Pending repeater" className="w-14 h-14 rounded-md object-cover" />
                    <div className="min-w-0 flex-1 text-xs"><div className="truncate">{p.caption || 'No caption'}</div><div className="text-muted-foreground">{p.submitted_by_callsign || 'Member'}</div></div>
                    {isOwner && <><Button type="button" size="icon" variant="ghost" onClick={() => reviewPhoto(p, 'Approved')} title="Approve"><CheckCircle2 className="w-4 h-4 text-success" /></Button><Button type="button" size="icon" variant="ghost" onClick={() => reviewPhoto(p, 'Rejected')} title="Reject"><XCircle className="w-4 h-4 text-destructive" /></Button></>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-1">
            <Field label="Frequency" value={`${formatFreq(r.frequency)} MHz`} />
            <Field label="Offset" value={r.offset ? `${r.offset > 0 ? '+' : ''}${r.offset} MHz` : null} />
            {showTones ? (
              <>
                <Field label="Output Tone (TX)" value={r.tone} />
                <Field label="Input Tone (RX)" value={r.input_tone} />
              </>
            ) : (
              <div className="py-3 my-1 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-300 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Tones are private. Request access from the owner to view them.</span>
              </div>
            )}
            <Field label="Callsign" value={r.callsign} />
            <Field label="Mode" value={r.mode} />
            <Field label="Access" value={isClosed ? 'Closed' : 'Public'} />
            <Field label="Status" value={r.status} />
            <Field label="Coverage" value={r.coverage_radius ? `${r.coverage_radius} mi` : null} />
            <Field label="Elevation" value={r.elevation ? `${r.elevation} ft` : null} />
            <Field label="Owner" value={r.owner ? <span className="inline-flex items-center gap-1.5">{r.owner}<StaffTag userId={r.owner_user_id} /></span> : null} />
            <Field label="Linked System" value={r.linked_system} />
            {hasCoords && <Field label="Coordinates" value={`${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`} />}
            {hasCoords && (
              <div className="pt-3">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=12/${r.lat}/${r.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> View on OpenStreetMap
                </a>
              </div>
            )}
          </div>

          {isClosed && !isOwner && (
            <div className="rounded-xl border border-border p-4 bg-muted/40">
              {myRequest ? (
                myRequest.status === 'Pending' ? (
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                    <span className="flex-1">Access request submitted — waiting for the owner to respond.</span>
                  </div>
                ) : myRequest.status === 'Granted' ? (
                  <div className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-success shrink-0" />
                    <span className="flex-1">Access granted — tones are now visible above.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <X className="w-4 h-4 text-destructive shrink-0" />
                    <span className="flex-1">Access was denied by the owner.</span>
                    <Button size="sm" variant="outline" onClick={() => setMyRequest(null)} disabled={requesting}>Request again</Button>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">This is a closed repeater. Fill out the form below to request access from the owner.</p>

                  {/* Read-only repeater info */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/60 text-sm">
                    <div><span className="text-xs text-muted-foreground block">Repeater Name</span><span className="font-medium">{r.name}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Frequency</span><span className="font-medium font-mono">{formatFreq(r.frequency)} MHz</span></div>
                    <div><span className="text-xs text-muted-foreground block">Input Tone (RX)</span><span className="font-medium">{showTones ? (r.input_tone || '—') : 'Provided on approval'}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Output Tone (TX)</span><span className="font-medium">{showTones ? (r.tone || '—') : 'Provided on approval'}</span></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Licensee Name</Label>
                      <Input value={form.licenseeName} onChange={set('licenseeName')} placeholder="Your name" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Date Requested</Label>
                      <Input value={today} readOnly className="h-9 text-sm bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Family Members</Label>
                      <Input value={form.familyMembers} onChange={set('familyMembers')} placeholder="e.g. spouse, 2 kids" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone Number</Label>
                      <Input value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="(555) 123-4567" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Repeater Will Be Used For</Label>
                      <Select value={form.usagePurpose} onValueChange={(v) => setForm((f) => ({ ...f, usagePurpose: v }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Personal">Personal</SelectItem>
                          <SelectItem value="Family">Family</SelectItem>
                          <SelectItem value="Club / Group">Club / Group</SelectItem>
                          <SelectItem value="Emergency / Public Service">Emergency / Public Service</SelectItem>
                          <SelectItem value="Event Coordination">Event Coordination</SelectItem>
                          <SelectItem value="Business">Business</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Additional Notes from User</Label>
                      <Textarea value={form.notes} onChange={set('notes')} placeholder="Anything else the owner should know" className="text-sm min-h-[64px] resize-none" />
                    </div>
                  </div>

                  <Button onClick={requestAccess} disabled={requesting} className="w-full">
                    <Lock className="w-4 h-4 mr-2" /> {requesting ? 'Sending…' : 'Submit Access Request'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {r.notes && (
            <div className="p-3 rounded-lg bg-muted text-sm text-muted-foreground whitespace-pre-wrap"><Linkify text={r.notes} /></div>
          )}

          <div className="pt-2 border-t border-border">
            <RepeaterComments repeaterId={r.id} repeaterName={r.name} userId={userId} />
          </div>
        </div>
      </DialogContent>

      <Dialog open={!!lightboxPhoto} onOpenChange={(v) => !v && setLightboxPhoto(null)}>
        <DialogContent className="max-w-6xl w-[95vw] p-2 sm:p-4 bg-black/95 border-border/40">
          <DialogHeader className="sr-only">
            <DialogTitle>{lightboxPhoto?.caption || `${r.name} repeater photo`}</DialogTitle>
            <DialogDescription>Full-size repeater photo</DialogDescription>
          </DialogHeader>
          {lightboxPhoto && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={lightboxPhoto.photo_url}
                alt={lightboxPhoto.caption || `${r.name} repeater`}
                className="max-h-[80vh] max-w-full w-auto h-auto object-contain rounded-md"
              />
              {(lightboxPhoto.caption || lightboxPhoto.submitted_by_callsign) && (
                <div className="w-full text-center text-sm text-white/80 px-2">
                  {lightboxPhoto.caption && <div><Linkify text={lightboxPhoto.caption} /></div>}
                  {lightboxPhoto.submitted_by_callsign && <div className="text-white/60 mt-1">Submitted by {lightboxPhoto.submitted_by_callsign}</div>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {canEdit && (
        <RepeaterDialog
          open={editing}
          onOpenChange={setEditing}
          repeater={r}
          onUpdated={(updated) => { onUpdated?.(updated); setEditing(false); }}
        />
      )}
    </Dialog>
  );
}