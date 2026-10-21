import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, ConfirmDialog } from '@/components/admin/parts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Star, ExternalLink, PackageCheck, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES = [
  ['best-picks','Best Picks'],['best-buy','Best Buy'],['under-50','Best Under $50'],['under-100','Best Under $100'],
  ['radios','Best Radios'],['antennas','Best Antennas'],['accessories','Best Accessories'],['emergency','Emergency & Preparedness'],
];
const blank = { name:'', manufacturer:'', model:'', category:'best-picks', service_type:'Both', price_label:'', description:'', image_url:'', affiliate_url:'', store:'Amazon', featured:false, sort_order:0, active:true };

export default function AdminEquipment() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items,setItems]=useState([]), [submissions,setSubmissions]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState('');
  const [edit,setEdit]=useState(null), [form,setForm]=useState(blank), [deleteTarget,setDeleteTarget]=useState(null), [submissionEdit,setSubmissionEdit]=useState(null), [submissionForm,setSubmissionForm]=useState(null), [submissionDelete,setSubmissionDelete]=useState(null), [busy,setBusy]=useState(false);

  const load=async()=>{
    setLoading(true); setError('');
    try {
      const [r,s]=await Promise.all([
        base44.entities.EquipmentRecommendation.list('sort_order',500),
        base44.entities.EquipmentSubmission.list('-created_date',500)
      ]);
      setItems(r||[]); setSubmissions(s||[]);
    } catch(e){ setError(e?.message||'Could not load equipment management data'); }
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const save=async()=>{
    if(!form.name.trim()||!form.affiliate_url.trim()){toast({title:'Product name and affiliate/product link are required',variant:'destructive'});return;}
    setBusy(true);
    try{
      const fields={...form,sort_order:Number(form.sort_order)||0};
      if(edit?.id) await base44.entities.EquipmentRecommendation.update(edit.id,fields);
      else await base44.entities.EquipmentRecommendation.create(fields);
      toast({title:edit?.id?'Equipment updated':'Equipment added'});
      setEdit(null); setForm(blank); load();
    }catch(e){toast({title:e?.message||'Could not save equipment',variant:'destructive'});}
    finally{setBusy(false);}
  };

  const remove=async()=>{
    if(!deleteTarget)return; setBusy(true);
    try{await base44.entities.EquipmentRecommendation.delete(deleteTarget.id);toast({title:'Equipment removed'});setDeleteTarget(null);load();}
    catch(e){toast({title:e?.message||'Could not remove equipment',variant:'destructive'});}
    finally{setBusy(false);}
  };

  const setActive=async(item)=>{
    try{await base44.entities.EquipmentRecommendation.update(item.id,{active:item.active===false});load();}
    catch(e){toast({title:'Could not update status',variant:'destructive'});}
  };

  const markUnderReview=async(s)=>{
    try{await base44.entities.EquipmentSubmission.update(s.id,{status:'Under Review'});toast({title:'Submission moved to review'});load();}
    catch(e){toast({title:'Could not update submission',variant:'destructive'});}
  };
  const approveSubmission=async(s)=>{
    try{await base44.entities.EquipmentSubmission.update(s.id,{status:'Approved'});toast({title:'Submission approved for research'});load();}
    catch(e){toast({title:'Could not approve submission',variant:'destructive'});}
  };
  const reject=async(s)=>{
    try{await base44.entities.EquipmentSubmission.update(s.id,{status:'Rejected'});load();}
    catch(e){toast({title:'Could not reject submission',variant:'destructive'});}
  };
  const saveSubmission=async()=>{
    if(!submissionEdit?.id||!submissionForm?.name?.trim()||!submissionForm?.product_url?.trim()){
      toast({title:'Product name and product link are required',variant:'destructive'}); return;
    }
    setBusy(true);
    try{
      await base44.entities.EquipmentSubmission.update(submissionEdit.id,{
        name:submissionForm.name.trim(),
        manufacturer:submissionForm.manufacturer||'',
        model:submissionForm.model||'',
        category:submissionForm.category||'',
        service_type:submissionForm.service_type||'Both',
        price:submissionForm.price===''?undefined:Number(submissionForm.price)||0,
        store:submissionForm.store||'',
        product_url:submissionForm.product_url.trim(),
        image_url:submissionForm.image_url||'',
        reason:submissionForm.reason||'',
        status:submissionForm.status||'Pending',
        admin_notes:submissionForm.admin_notes||''
      });
      toast({title:'Community submission updated'});
      setSubmissionEdit(null); setSubmissionForm(null); load();
    }catch(e){toast({title:e?.message||'Could not update submission',variant:'destructive'});}
    finally{setBusy(false);}
  };
  const removeSubmission=async()=>{
    if(!submissionDelete?.id)return; setBusy(true);
    try{
      await base44.entities.EquipmentSubmission.delete(submissionDelete.id);
      toast({title:'Community submission removed'});
      setSubmissionDelete(null); load();
    }catch(e){toast({title:e?.message||'Could not remove submission',variant:'destructive'});}
    finally{setBusy(false);}
  };

  if(user?.role!=='admin' && user?.role!=='super_admin') return <ErrorState message="Administrator access required." />;

  return <div className="space-y-6">
    <PageHeader title="Equipment Guide" subtitle="Manage official equipment recommendations and community submissions">
      <Button onClick={()=>{setEdit({});setForm(blank);}}><Plus className="w-4 h-4 mr-2"/>Add Equipment</Button>
    </PageHeader>
    {loading?<Loading/>:error?<ErrorState message={error} onRetry={load}/>:<>
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-2xl font-bold">{items.length}</div><div className="text-sm text-muted-foreground">Recommendations</div></Card>
        <Card className="p-5"><div className="text-2xl font-bold">{items.filter(x=>x.featured).length}</div><div className="text-sm text-muted-foreground">Featured</div></Card>
        <Card className="p-5"><div className="text-2xl font-bold">{submissions.filter(x=>x.status==='Pending'||x.status==='Under Review').length}</div><div className="text-sm text-muted-foreground">Pending submissions</div></Card>
      </div>

      <section>
        <h2 className="text-xl font-heading font-bold mb-3">Official Equipment</h2>
        {items.length===0?<EmptyState title="No equipment yet" description="Add your first recommendation."/>:
        <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>
          <th className="text-left p-3">Equipment</th><th className="text-left p-3">Category</th><th className="text-left p-3">Price</th><th className="text-left p-3">Status</th><th className="text-right p-3">Actions</th>
        </tr></thead><tbody className="divide-y">
        {items.map(i=><tr key={i.id}>
          <td className="p-3"><div className="font-medium flex items-center gap-2">{i.name}{i.featured&&<Star className="w-3.5 h-3.5 fill-current"/>}</div><div className="text-xs text-muted-foreground">{i.manufacturer} {i.model}</div></td>
          <td className="p-3">{CATEGORIES.find(c=>c[0]===i.category)?.[1]||i.category||'—'}</td><td className="p-3">{i.price_label||'—'}</td>
          <td className="p-3">{i.active===false?<Badge tone="muted">Hidden</Badge>:<Badge tone="success">Published</Badge>}</td>
          <td className="p-3"><div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={()=>{setEdit(i);setForm({...blank,...i});}}><Pencil className="w-4 h-4"/></Button>
            <Button size="sm" variant="ghost" onClick={()=>setActive(i)}>{i.active===false?<CheckCircle2 className="w-4 h-4"/>:<PackageCheck className="w-4 h-4"/>}</Button>
            <Button size="sm" variant="ghost" onClick={()=>setDeleteTarget(i)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
          </div></td>
        </tr>)}</tbody></table></div></Card>}
      </section>

      <section>
        <h2 className="text-xl font-heading font-bold mb-3">Community Submissions</h2>
        {submissions.length===0?<EmptyState title="No submissions" description="Member submissions will appear here."/>:
        <div className="grid lg:grid-cols-2 gap-4">{submissions.map(s=><Card key={s.id} className="p-5">
          <div className="flex justify-between gap-3"><div><h3 className="font-semibold">{s.name}</h3><p className="text-xs text-muted-foreground">{s.manufacturer} {s.model} · {s.store||'Store not specified'}</p></div><Badge tone={s.status==='Approved'?'success':s.status==='Rejected'?'destructive':'warn'}>{s.status||'Pending'}</Badge></div>
          {s.reason&&<p className="text-sm text-muted-foreground mt-3">{s.reason}</p>}
          {s.image_url&&<img src={s.image_url} alt={s.name} className="mt-4 w-full h-44 object-contain rounded-lg border bg-muted/20" onError={(e)=>{e.currentTarget.style.display='none';}}/>}
          <div className="flex items-center gap-2 mt-4"><a href={s.product_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1 mr-auto">Product <ExternalLink className="w-3.5 h-3.5"/></a>
          {s.status==='Pending'&&<Button size="sm" onClick={()=>markUnderReview(s)} disabled={busy}><PackageCheck className="w-3.5 h-3.5 mr-1"/> Review</Button>}
          {s.status==='Under Review'&&<Button size="sm" onClick={()=>approveSubmission(s)} disabled={busy}><CheckCircle2 className="w-3.5 h-3.5 mr-1"/> Approve</Button>}
          {s.status!=='Rejected'&&s.status!=='Approved'&&<Button size="sm" variant="outline" onClick={()=>reject(s)} disabled={busy}>Reject</Button>}
          <Button size="sm" variant="ghost" onClick={()=>{setSubmissionEdit(s);setSubmissionForm({...s});}} disabled={busy}><Pencil className="w-3.5 h-3.5 mr-1"/> Edit</Button>
          <Button size="sm" variant="ghost" onClick={()=>setSubmissionDelete(s)} disabled={busy}><Trash2 className="w-3.5 h-3.5 text-destructive mr-1"/> Remove</Button></div>
        </Card>)}</div>}
      </section>
    </>}

    <Dialog open={!!edit} onOpenChange={o=>{if(!o){setEdit(null);setForm(blank);}}}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{edit?.id?'Edit Equipment':'Add Equipment'}</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <Input placeholder="Product name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <Input placeholder="Manufacturer" value={form.manufacturer} onChange={e=>setForm({...form,manufacturer:e.target.value})}/>
        <Input placeholder="Model" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/>
        <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="h-10 px-3 rounded-md border bg-background">{CATEGORIES.map(c=><option key={c[0]} value={c[0]}>{c[1]}</option>)}</select>
        <select value={form.service_type||'Both'} onChange={e=>setForm({...form,service_type:e.target.value})} className="h-10 px-3 rounded-md border bg-background"><option value="Both">GMRS & HAM</option><option value="GMRS">GMRS only</option><option value="HAM">HAM only</option></select>
        <Input placeholder="Price label (e.g. $49.99)" value={form.price_label} onChange={e=>setForm({...form,price_label:e.target.value})}/>
        <Input placeholder="Store (Amazon, Best Buy, etc.)" value={form.store} onChange={e=>setForm({...form,store:e.target.value})}/>
        <Input placeholder="Product image URL" value={form.image_url} onChange={e=>setForm({...form,image_url:e.target.value})}/>
        <Input placeholder="Amazon affiliate/product URL" value={form.affiliate_url} onChange={e=>setForm({...form,affiliate_url:e.target.value})}/>
        <Input type="number" placeholder="Sort order (lower appears first)" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/>
        <label className="flex items-center gap-2 h-10 px-2"><input type="checkbox" checked={!!form.featured} onChange={e=>setForm({...form,featured:e.target.checked})}/> Featured recommendation</label>
        <label className="flex items-center gap-2 h-10 px-2"><input type="checkbox" checked={form.active!==false} onChange={e=>setForm({...form,active:e.target.checked})}/> Published / visible</label>
      </div>
      <textarea placeholder="Why we recommend it / description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full min-h-28 p-3 rounded-md border bg-background resize-none"/>
      <DialogFooter><Button variant="outline" onClick={()=>setEdit(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy?'Saving…':'Save Equipment'}</Button></DialogFooter>
    </DialogContent></Dialog>

    <ConfirmDialog open={!!deleteTarget} onOpenChange={o=>!o&&setDeleteTarget(null)} title="Remove equipment?" description={deleteTarget ? 'Remove ' + deleteTarget.name + ' from the Equipment Guide?' : ''} confirmLabel="Remove" destructive loading={busy} onConfirm={remove}/>
    <Dialog open={!!submissionEdit} onOpenChange={o=>{if(!o){setSubmissionEdit(null);setSubmissionForm(null);}}}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Edit Community Submission</DialogTitle></DialogHeader>
      {submissionForm&&<div className="grid sm:grid-cols-2 gap-3">
        <Input placeholder="Product name" value={submissionForm.name||''} onChange={e=>setSubmissionForm({...submissionForm,name:e.target.value})}/>
        <Input placeholder="Manufacturer" value={submissionForm.manufacturer||''} onChange={e=>setSubmissionForm({...submissionForm,manufacturer:e.target.value})}/>
        <Input placeholder="Model" value={submissionForm.model||''} onChange={e=>setSubmissionForm({...submissionForm,model:e.target.value})}/>
        <Input placeholder="Category" value={submissionForm.category||''} onChange={e=>setSubmissionForm({...submissionForm,category:e.target.value})}/>
        <select value={submissionForm.service_type||'Both'} onChange={e=>setSubmissionForm({...submissionForm,service_type:e.target.value})} className="h-10 px-3 rounded-md border bg-background"><option value="Both">GMRS & HAM</option><option value="GMRS">GMRS only</option><option value="HAM">HAM only</option></select>
        <Input type="number" placeholder="Price" value={submissionForm.price??''} onChange={e=>setSubmissionForm({...submissionForm,price:e.target.value})}/>
        <Input placeholder="Store" value={submissionForm.store||''} onChange={e=>setSubmissionForm({...submissionForm,store:e.target.value})}/>
        <Input placeholder="Product URL" value={submissionForm.product_url||''} onChange={e=>setSubmissionForm({...submissionForm,product_url:e.target.value})}/>
        <Input placeholder="Image URL" value={submissionForm.image_url||''} onChange={e=>setSubmissionForm({...submissionForm,image_url:e.target.value})}/>
        <select value={submissionForm.status||'Pending'} onChange={e=>setSubmissionForm({...submissionForm,status:e.target.value})} className="h-10 px-3 rounded-md border bg-background">
          {['Pending','Under Review','Approved','Rejected'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <Input placeholder="Admin notes" value={submissionForm.admin_notes||''} onChange={e=>setSubmissionForm({...submissionForm,admin_notes:e.target.value})}/>
        <textarea placeholder="Why they recommend it" value={submissionForm.reason||''} onChange={e=>setSubmissionForm({...submissionForm,reason:e.target.value})} className="sm:col-span-2 w-full min-h-28 p-3 rounded-md border bg-background resize-none"/>
      </div>}
      <DialogFooter><Button variant="outline" onClick={()=>setSubmissionEdit(null)}>Cancel</Button><Button onClick={saveSubmission} disabled={busy}>{busy?'Saving…':'Save Changes'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <ConfirmDialog open={!!submissionDelete} onOpenChange={o=>!o&&setSubmissionDelete(null)} title="Remove community submission?" description={submissionDelete ? 'Permanently remove ' + submissionDelete.name + ' from Community Submissions?' : ''} confirmLabel="Remove" destructive loading={busy} onConfirm={removeSubmission}/>
  </div>;
}
