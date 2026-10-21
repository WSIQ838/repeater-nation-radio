import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function MessageDialog({ open, onOpenChange, recipientId, recipientName, sender }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim() || !recipientId || !sender) return;
    setSending(true);
    try {
      const msgBody = body.trim();
      await base44.entities.Message.create({
        conversation_id: [sender.id, recipientId].sort().join('__'),
        sender_id: sender.id,
        sender_name: sender.full_name || sender.email,
        recipient_id: recipientId,
        recipient_name: recipientName,
        body: msgBody,
        read: false,
      });
      try { await base44.functions.invoke('notify-message', { recipient_id: recipientId, sender_name: sender.full_name || sender.email, message_body: msgBody }); } catch (e) { console.error(e); }
      setBody('');
      onOpenChange(false);
    } catch (err) { console.error(err); }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Message {recipientName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={send} className="space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message…"
            rows={4}
            required
            autoFocus
          />
          <DialogFooter>
            <Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}