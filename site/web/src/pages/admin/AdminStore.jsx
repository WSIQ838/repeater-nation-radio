import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PageHeader, Loading, ErrorState, Badge } from '@/components/admin/parts';
import OrdersTab from '@/components/admin/store/OrdersTab';
import ProductsTab from '@/components/admin/store/ProductsTab';
import SettingsTab from '@/components/admin/store/SettingsTab';
import PrintfulTab from '@/components/admin/store/PrintfulTab';
import { merchAdmin } from '@/components/admin/store/api';

export default function AdminStore() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('orders');
  const load = () => merchAdmin('status').then(setStatus).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!status) return <Loading />;
  const pfOk = !!(status.printful?.configured && status.printful?.ok);
  return (
    <div>
      <PageHeader title="Merch" subtitle="Orders, products and settings for the Merch page">
        <Badge tone={status.settings.enabled ? 'success' : 'muted'}>{status.settings.enabled ? 'Open' : 'Closed'}</Badge>
        <Badge tone={pfOk ? 'success' : 'warn'}>{pfOk ? 'Printful connected' : 'Printful not connected'}</Badge>
        <Link to="/merch"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1.5" /> View Merch page</Button></Link>
      </PageHeader>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="printful">Printful &amp; payments</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-5"><OrdersTab /></TabsContent>
        <TabsContent value="products" className="mt-5"><ProductsTab printfulConfigured={pfOk} settings={status.settings} /></TabsContent>
        <TabsContent value="settings" className="mt-5"><SettingsTab settings={status.settings} printfulConfigured={pfOk} onSaved={(s) => setStatus((st) => ({ ...st, settings: s }))} /></TabsContent>
        <TabsContent value="printful" className="mt-5"><PrintfulTab status={status} onRefresh={load} /></TabsContent>
      </Tabs>
    </div>
  );
}
