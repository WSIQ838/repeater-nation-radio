import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';

function sanitizeHtml(html) {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(String(html || ''), { USE_PROFILES: { html: true } });
}
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { Image } from '@/components/ui/image';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

export default function ClubPageView() {
  const { clubId, pageId } = useParams();
  const [page, setPage] = useState(null);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const p = await base44.entities.ClubPage.get(pageId).catch(() => null);
        setPage(p);
        if (clubId) setClub(await base44.entities.Club.get(clubId).catch(() => null));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [pageId, clubId]);

  if (loading) return <div className="p-8 max-w-3xl mx-auto"><div className="h-48 rounded-xl bg-muted animate-pulse" /></div>;
  if (!page) return (
    <div className="p-8 max-w-3xl mx-auto text-center text-muted-foreground">
      <p>Page not found.</p>
      <Link to={`/clubs/${clubId}`}><Button variant="outline" className="mt-4">Back to club</Button></Link>
    </div>
  );

  return (
    <div className="p-5 sm:p-8 max-w-3xl mx-auto space-y-6">
      <Link to={`/clubs/${clubId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> {club?.name || 'Club'}</Link>
      <Card className="p-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><FileText className="w-3.5 h-3.5" /> Club page{page.page_type && <span className="font-semibold uppercase tracking-wide text-primary">· {page.page_type}</span>}</div>
        <h1 className="text-3xl font-heading font-bold mb-2">{page.title}</h1>
        <div className="text-sm text-muted-foreground mb-6">by {page.author_callsign || page.author_name || '—'}<StaffTag userId={page.created_by_id} callsign={page.created_by_id ? undefined : page.author_callsign} className="ml-1.5" />{page.content_format && <span className="ml-2">· {page.content_format === 'html' ? 'HTML' : page.content_format === 'text' ? 'Plain text' : 'Markdown'}</span>}</div>
        <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
          {page.content_format === 'html' ? (
            <div
              className="[&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-3"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.body) }}
            />
          ) : page.content_format === 'text' ? (
            <div className="whitespace-pre-wrap break-words"><Linkify text={page.body} /></div>
          ) : (
            <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (p) => <h1 className="text-2xl font-bold mt-4" {...p} />,
              h2: (p) => <h2 className="text-xl font-bold mt-4" {...p} />,
              h3: (p) => <h3 className="text-lg font-semibold mt-3" {...p} />,
              p: (p) => <p {...p} />,
              ul: (p) => <ul className="list-disc pl-5 space-y-1" {...p} />,
              ol: (p) => <ol className="list-decimal pl-5 space-y-1" {...p} />,
              a: ({ node: _node, ...p }) => <a className="text-primary underline break-words" {...p} target="_blank" rel="noopener noreferrer nofollow ugc" />,
              code: (p) => <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" {...p} />,
            }}
            >{page.body}</ReactMarkdown>
          )}
        </div>
        {page.image_urls?.length > 0 && (
          <div className="grid gap-3 mt-6 sm:grid-cols-2">
            {page.image_urls.map((url, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-border">
                <Image src={url} alt="" className="w-full max-h-80 object-cover" />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}