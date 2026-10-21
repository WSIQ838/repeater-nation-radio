import { base44 } from '@/api/base44Client';
import { errMsg } from '@/lib/utils';

export async function merchAdmin(action, payload = {}) {
  try {
    const res = await base44.functions.invoke('merch-admin', { ...payload, action });
    if (res?.data?.error) throw new Error(res.data.error);
    return res?.data || {};
  } catch (e) {
    throw new Error(errMsg(e) || e?.message || 'Request failed');
  }
}
