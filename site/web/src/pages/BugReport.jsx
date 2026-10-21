import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Bug, Send, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const categories = ['General', 'Map / Trip Planner', 'Repeaters', 'Logbook', 'Clubs', 'Forums', 'Messages', 'Profile / Account', 'Payments', 'Other'];
const severities = ['Low', 'Medium', 'High', 'Critical'];

export default function BugReport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: '', category: 'General', severity: 'Medium', page: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: 'Please add a title and description.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('submitBugReport', form);
      if (res?.data?.ok) {
        setSubmitted(true);
        setForm({ title: '', category: 'General', severity: 'Medium', page: '', description: '' });
      } else {
        toast({ title: res?.data?.error || 'Could not send report.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: err?.message || 'Could not send report.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4 gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center">
              <Bug className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Report an Issue</CardTitle>
              <CardDescription>Spotted a bug or have feedback? Send it straight to our team.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 mx-auto text-success mb-3" />
              <h3 className="font-heading font-semibold text-lg">Thank you!</h3>
              <p className="text-sm text-muted-foreground mt-1">Your report has been forwarded to the team.</p>
              <Button className="mt-6" onClick={() => setSubmitted(false)}>Report another</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" placeholder="Short summary of the issue" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {severities.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="page">Page / Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="page" placeholder="e.g. Trip Planner, Repeaters map" value={form.page}
                  onChange={(e) => setForm({ ...form, page: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={6} placeholder="What happened? What did you expect? Steps to reproduce?"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>

              <Button type="submit" disabled={submitting} className="w-full gap-2">
                <Send className="w-4 h-4" /> {submitting ? 'Sending…' : 'Send Report'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}