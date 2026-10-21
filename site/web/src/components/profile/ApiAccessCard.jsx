import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Code2, Plus, Copy, Trash2, Loader2, Check, ShieldCheck } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { apiKeyApi } from '@/lib/apiKeyClient';
import { errMsg } from '@/lib/utils';

// Keep in sync with DEV_API_TERMS_VERSION in api-key-manage/entry.ts --
// server-side enforcement is the real gate (never trust this checkbox
// alone), this is only what's shown/recorded client-side.
const DEV_API_TERMS_VERSION = 'v1';
const DEV_API_TERMS = [
  'I will respect the documented rate limits and will not attempt to circumvent them.',
  'I will not use this API to scrape, republish, or resell this data as a competing directory service.',
  'I understand Repeater Nation may suspend or revoke my API access at any time, with or without notice, for violating these terms.',
  'I understand the API and its data are provided "as is" with no warranty of accuracy, completeness, or availability.',
  'I understand these terms may change, and continued use after a material change means I accept the revised terms.',
];

export default function ApiAccessCard({ user }) {
  const { toast } = useToast();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(user?.dev_api_agreed === true);
  const [showTerms, setShowTerms] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [agreeing, setAgreeing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealKey, setRevealKey] = useState(null); // { raw_key, label } shown once right after create
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiKeyApi('list');
      setKeys(res?.keys || []);
    } catch (err) {
      toast({ title: 'Could not load API keys', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { if (hasPermission(user, 'apikeys.view')) load(); else setLoading(false); }, [user, load]);

  if (!hasPermission(user, 'apikeys.view')) return null;

  const startCreate = () => {
    if (agreed) { setShowCreate(true); return; }
    setTermsChecked(false);
    setShowTerms(true);
  };

  const agreeToTerms = async () => {
    setAgreeing(true);
    try {
      await apiKeyApi('agree');
      setAgreed(true);
      setShowTerms(false);
      setShowCreate(true);
    } catch (err) {
      toast({ title: 'Could not record agreement', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setAgreeing(false);
  };

  const create = async () => {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const res = await apiKeyApi('create', { label: label.trim() });
      setShowCreate(false);
      setLabel('');
      setRevealKey({ raw_key: res.key.raw_key, label: res.key.label });
      await load();
    } catch (err) {
      toast({ title: 'Could not create key', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setCreating(false);
  };

  const revoke = async (key) => {
    if (!confirm(`Revoke "${key.label}"? Anything using this key will stop working immediately.`)) return;
    try {
      await apiKeyApi('revoke', { id: key.id });
      toast({ title: 'API key revoked' });
      load();
    } catch (err) {
      toast({ title: 'Revoke failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const copyKey = () => {
    if (!revealKey) return;
    navigator.clipboard?.writeText(revealKey.raw_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            <h3 className="font-heading font-semibold text-lg">API Access</h3>
          </div>
          {hasPermission(user, 'apikeys.create') && (
            <Button size="sm" variant="outline" onClick={startCreate} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New key
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          Read-only API keys for building on top of our public data (repeaters, POTA parks, clubs, events, and more).
          See the <Link to="/api-docs" className="underline hover:text-foreground">API documentation</Link> for endpoints and examples.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4 min-h-4">
          {agreed && <><ShieldCheck className="w-3.5 h-3.5 text-success" /> Developer Mode enabled</>}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 rounded-lg border border-dashed border-border text-center">
            No API keys yet.
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-muted/20">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {key.label}
                    <Badge variant={key.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {key.status === 'active' ? 'Active' : 'Revoked'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {key.key_prefix}… · {key.rate_limit_tier} tier
                    {key.last_used_at && ` · last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                {key.status === 'active' && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(key)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive shrink-0">
                    <Trash2 className="w-3.5 h-3.5" /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={showTerms} onOpenChange={(o) => !o && setShowTerms(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Developer API Terms</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Before creating your first API key, please review and agree to the following:</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
              {DEV_API_TERMS.map((term, i) => <li key={i}>{term}</li>)}
            </ul>
            <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
              <Checkbox checked={termsChecked} onCheckedChange={(v) => setTermsChecked(v === true)} className="mt-0.5" />
              <span className="text-sm">I have read and agree to these Developer API Terms.</span>
            </label>
            <p className="text-[11px] text-muted-foreground">Terms version {DEV_API_TERMS_VERSION}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTerms(false)}>Cancel</Button>
            <Button onClick={agreeToTerms} disabled={!termsChecked || agreeing} className="gap-1.5">
              {agreeing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Agree &amp; enable Developer Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New API key</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My weather dashboard" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create} disabled={creating || !label.trim()}>
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealKey} onOpenChange={(o) => !o && setRevealKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Your new API key</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Copy this now — for security, you will not be able to see it again after closing this dialog.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-md border border-input bg-muted font-mono text-xs">
                {revealKey?.raw_key}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copyKey} className="shrink-0 gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
