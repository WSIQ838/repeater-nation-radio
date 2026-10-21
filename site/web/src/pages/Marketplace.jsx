import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Store, Plus, Search, Flag, User, MapPin, CheckCircle2, XCircle, MessageCircle, ChevronLeft, ChevronRight, Pencil, ChevronDown, Tag } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const TYPES = ['For Sale', 'Wanted', 'Trade', 'Free'];
const CATEGORIES = ['Radios', 'Antennas', 'Repeaters', 'Accessories', 'Parts', 'Cables', 'Power', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Good', 'Used', 'For Parts'];
const PAGE_SIZE = 60;
const EMPTY = { title: '', description: '', listing_type: 'For Sale', category: 'Radios', condition: 'Good', price: '', location: '', image_urls: '' };
const TYPE_COLOR = {
  'For Sale': 'bg-primary text-primary-foreground',
  'Wanted': 'bg-blue-600 text-white',
  'Trade': 'bg-purple-600 text-white',
  'Free': 'bg-green-600 text-white',
};
const SORTS = [['newest', 'Newest First'], ['price_low', 'Price: Low to High'], ['price_high', 'Price: High to Low']];

export default function Marketplace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [reportReason, setReportReason] = useState('Scam or suspicious listing');
  const [reportDetails, setReportDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.MarketplaceListing.list('-created_date', 500);
      setListings(Array.isArray(data) ? data.filter(x => x.status === 'Active') : []);
    } catch (e) { console.error(e); setListings([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [query, typeFilter, categoryFilter, sort]);

  const editListing = (item) => {
    if (!user || item.created_by_id !== user.id) return;
    setSelected(item);
    setForm({
      title: item.title || '',
      description: item.description || '',
      listing_type: item.listing_type || 'For Sale',
      category: item.category || 'Other',
      condition: item.condition || 'Good',
      price: item.price == null ? '' : String(item.price),
      location: item.location || '',
      image_urls: Array.isArray(item.image_urls) ? item.image_urls.join('\n') : '',
    });
    setEditOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!user || !selected || selected.created_by_id !== user.id || !form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const imageUrls = form.image_urls.split(/[\n,]+/).map(x => x.trim()).filter(Boolean).slice(0, 8);
      await base44.entities.MarketplaceListing.update(selected.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        listing_type: form.listing_type,
        category: form.category,
        condition: form.condition,
        price: form.price === '' ? undefined : Number(form.price),
        location: form.location.trim(),
        image_urls: imageUrls,
      });
      setEditOpen(false);
      setSelected(null);
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user || !form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const imageUrls = form.image_urls.split(/[\n,]+/).map(x => x.trim()).filter(Boolean).slice(0, 8);
      await base44.entities.MarketplaceListing.create({
        title: form.title.trim(), description: form.description.trim(), listing_type: form.listing_type,
        category: form.category, condition: form.condition, price: form.price === '' ? undefined : Number(form.price),
        location: form.location.trim(), image_urls: imageUrls,
        seller_name: user.full_name || user.name || user.email || 'Repeater Nation Member',
        seller_callsign: user.callsign || '', seller_user_id: user.id, status: 'Active', report_count: 0,
      });
      setForm(EMPTY); setOpen(false); await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const report = async (e) => {
    e.preventDefault();
    if (!user || !selected) return;
    setSaving(true);
    try {
      await base44.entities.AdminReport.create({
        title: `Marketplace report: ${selected.title}`, reason: reportDetails.trim() || reportReason,
        category: 'Marketplace', target_type: 'MarketplaceListing', target_id: selected.id, target_label: selected.title,
        priority: reportReason === 'Prohibited item' ? 'High' : 'Medium', status: 'Open',
        created_by_name: user.full_name || user.name || user.email || 'Member',
      });
      try { await base44.entities.MarketplaceListing.update(selected.id, { report_count: Number(selected.report_count || 0) + 1 }); } catch {}
      setReportOpen(false); setSelected(null); setReportDetails('');
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const markSold = async (item) => {
    if (!user || item.created_by_id !== user.id) return;
    try { await base44.entities.MarketplaceListing.update(item.id, { status: 'Sold' }); setListings(xs => xs.filter(x => x.id !== item.id)); } catch (e) { console.error(e); }
  };

  const remove = async (item) => {
    if (!user || (item.created_by_id !== user.id && user.role !== 'admin' && user.role !== 'super_admin')) return;
    if (!window.confirm('Remove this marketplace listing?')) return;
    try { await base44.entities.MarketplaceListing.delete(item.id); setListings(xs => xs.filter(x => x.id !== item.id)); } catch (e) { console.error(e); }
  };

  const typeCounts = useMemo(() => {
    const map = {};
    TYPES.forEach((t) => { map[t] = 0; });
    listings.forEach((l) => { if (map[l.listing_type] !== undefined) map[l.listing_type] += 1; });
    return map;
  }, [listings]);

  const categoryCounts = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => { map[c] = 0; });
    listings.forEach((l) => { if (map[l.category] !== undefined) map[l.category] += 1; });
    return map;
  }, [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = listings.filter(item => {
      const matchesType = typeFilter === 'All' || item.listing_type === typeFilter;
      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
      const matchesQuery = !q || [item.title, item.description, item.category, item.location, item.seller_callsign].some(v => String(v || '').toLowerCase().includes(q));
      return matchesType && matchesCategory && matchesQuery;
    });
    const sorted = [...list];
    if (sort === 'price_low') sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    else if (sort === 'price_high') sorted.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    return sorted;
  }, [listings, query, typeFilter, categoryFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleListings = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const price = (item) => {
    if (item.listing_type === 'Free') return 'FREE';
    if (item.price == null || item.price === '') return item.listing_type === 'Trade' ? 'TRADE' : 'Contact seller';
    return `$${Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const FormFields = () => (
    <>
      <div><label className="text-sm font-medium">Title *</label><Input value={form.title} onChange={e => setForm({...form,title:e.target.value})} required /></div>
      <div><label className="text-sm font-medium">Listing type</label><select value={form.listing_type} onChange={e=>setForm({...form,listing_type:e.target.value})} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm">{TYPES.map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="text-sm font-medium">Category</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm">{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></div><div><label className="text-sm font-medium">Condition</label><select value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm">{CONDITIONS.map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div><label className="text-sm font-medium">Price <span className="text-muted-foreground">(leave blank if wanted/trade/free)</span></label><Input type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} /></div>
      <div><label className="text-sm font-medium">General location</label><Input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="City, State (no street address)" /></div>
      <div><label className="text-sm font-medium">Photo URLs <span className="text-muted-foreground">(optional, one per line or comma-separated, up to 8)</span></label><textarea value={form.image_urls} onChange={e=>setForm({...form,image_urls:e.target.value})} rows={3} placeholder="https://..." className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40" /></div>
      <div><label className="text-sm font-medium">Description *</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={5} maxLength={5000} required className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40" /></div>
    </>
  );

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">Marketplace</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {user ? <Button onClick={() => {setForm(EMPTY);setOpen(true)}}><Plus className="w-4 h-4 mr-2" /> Post a Listing</Button> : <Button onClick={() => window.location.href='/login'}>Sign in to Post</Button>}
      </div>

      <Card className="p-4 bg-muted/40"><p className="text-sm"><strong>Community marketplace only:</strong> Repeater Nation does not process payments or handle money. Transactions, shipping, and payment arrangements are between members.</p></Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search radios, antennas, accessories…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">{SORTS.find(([k]) => k === sort)?.[1]} <ChevronDown className="w-3.5 h-3.5 ml-1.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              {SORTS.map(([key, label]) => <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6 items-start">
        <div className="space-y-5 lg:sticky lg:top-4 order-2 lg:order-1">
          <Card className="p-4">
            <h2 className="font-heading font-semibold text-sm mb-2.5">Listing Type</h2>
            <div className="space-y-0.5">
              <button onClick={() => setTypeFilter('All')} className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === 'All' ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground/80'}`}>
                <span>All</span><span className="text-xs text-muted-foreground">{listings.length}</span>
              </button>
              {TYPES.map((t) => (
                <button key={t} onClick={() => setTypeFilter(t)} className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === t ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground/80'}`}>
                  <span>{t}</span><span className="text-xs text-muted-foreground">{typeCounts[t]}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="font-heading font-semibold text-sm mb-2.5">Categories</h2>
            <div className="space-y-0.5">
              <button onClick={() => setCategoryFilter('All')} className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${categoryFilter === 'All' ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground/80'}`}>
                <span>All</span><span className="text-xs text-muted-foreground">{listings.length}</span>
              </button>
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategoryFilter(c)} className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${categoryFilter === c ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground/80'}`}>
                  <span>{c}</span><span className="text-xs text-muted-foreground">{categoryCounts[c]}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(x=><div key={x} className="h-64 rounded-xl bg-muted animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><Store className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>No listings match your filters.</p><p className="text-sm mt-1">Be the first to post some GMRS gear.</p></div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleListings.map(item => {
                  const image = item.image_urls?.[0];
                  const mine = item.created_by_id === user?.id;
                  return (
                    <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden relative">
                        {image ? <img src={image} alt="" className="w-full h-full object-cover" onError={e=>{e.currentTarget.style.display='none'}} /> : <Store className="w-10 h-10 opacity-20" />}
                        <span className={`absolute top-2 left-2 text-[10px] px-2 py-1 rounded-full font-semibold shadow-sm ${TYPE_COLOR[item.listing_type] || TYPE_COLOR['For Sale']}`}>{item.listing_type}</span>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="font-heading font-bold text-xl leading-none">{price(item)}</div>
                        <h2 className="font-medium text-sm line-clamp-1">{item.title}</h2>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />{item.category}</span>
                          <span>{item.condition}</span>
                          {item.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{item.location}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2"><Linkify text={item.description} /></p>
                        <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                          <span className="text-xs inline-flex items-center gap-1 text-muted-foreground truncate"><User className="w-3 h-3 shrink-0" />{item.seller_callsign||item.seller_name||'Member'}<StaffTag userId={item.seller_user_id || item.created_by_id} compact /></span>
                          <div className="flex gap-1 shrink-0">
                            {user && !mine && <Button size="sm" variant="outline" onClick={()=>navigate(`/messages?u=${encodeURIComponent(item.seller_user_id)}&listing=${encodeURIComponent(item.title)}`)} disabled={!item.seller_user_id}><MessageCircle className="w-3.5 h-3.5" /></Button>}
                            {mine && <>
                              <Button size="sm" variant="outline" onClick={()=>editListing(item)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="outline" onClick={()=>markSold(item)} title="Mark sold"><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={()=>remove(item)} title="Remove"><XCircle className="w-3.5 h-3.5" /></Button>
                            </>}
                            {user && !mine && <Button size="sm" variant="ghost" onClick={()=>{setSelected(item);setReportOpen(true)}} title="Report"><Flag className="w-3.5 h-3.5" /></Button>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button variant="outline" size="sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft className="w-4 h-4 mr-1" />Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Post a Marketplace Listing</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-3"><FormFields /><DialogFooter><Button type="submit" disabled={saving}>{saving?'Posting…':'Post Listing'}</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Edit Marketplace Listing</DialogTitle></DialogHeader><form onSubmit={saveEdit} className="space-y-3"><FormFields /><DialogFooter><Button type="button" variant="outline" onClick={()=>setEditOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?'Saving…':'Save Changes'}</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Report Marketplace Listing</DialogTitle></DialogHeader><form onSubmit={report} className="space-y-4"><p className="text-sm text-muted-foreground">Report <strong>{selected?.title}</strong>. Reports are sent to the Repeater Nation moderation team for review.</p><select value={reportReason} onChange={e=>setReportReason(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm">{['Scam or suspicious listing','Prohibited item','Spam','Misleading information','Harassment','Inappropriate content','Other'].map(x=><option key={x}>{x}</option>)}</select><textarea value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Additional details (optional)" rows={4} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40" /><DialogFooter><Button type="button" variant="outline" onClick={()=>setReportOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}><Flag className="w-4 h-4 mr-2" />{saving?'Sending…':'Submit Report'}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}
