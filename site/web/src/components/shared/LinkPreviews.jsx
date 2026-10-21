import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { findLinks } from './Linkify';

// Preview cards (site, title, description, picture) for links in a post or
// message, like chat apps show. Details come from the link-preview function,
// which fetches the page safely on the server and caches it for a week.
// Links back to this site and email addresses don't get a card.

const SITE_HOSTS = new Set(['repeaternation.com', 'www.repeaternation.com']);
const pending = new Map();

function loadPreview(url) {
  if (!pending.has(url)) {
    const key = `rn.lp:${url}`;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* storage blocked */ }
    pending.set(url, saved ? Promise.resolve(saved) : base44.functions.invoke('link-preview', { url })
      .then((res) => {
        const data = res?.data || { ok: false };
        try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
        return data;
      })
      .catch(() => ({ ok: false })));
  }
  return pending.get(url);
}

function previewable(link) {
  if (link.href.startsWith('mailto:')) return false;
  try {
    const host = new URL(link.href).host.toLowerCase();
    return !SITE_HOSTS.has(host) && host !== window.location.host;
  } catch { return false; }
}

const stop = (e) => e.stopPropagation();

function PreviewCard({ url }) {
  const [data, setData] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPreview(url).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [url]);
  if (!data?.ok || !(data.title || data.description)) return null;
  const image = !imageFailed && /^https:\/\//i.test(data.image || '') ? data.image : '';
  return (
    <a
      href={data.final_url || url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={stop}
      className="mt-2 flex max-w-md overflow-hidden rounded-lg border border-border bg-muted/40 text-left text-foreground no-underline hover:bg-muted/70 transition-colors"
      data-link-preview=""
    >
      <span className="w-1 shrink-0 bg-primary/70" aria-hidden="true" />
      <span className="min-w-0 flex-1 px-3 py-2.5">
        {data.site_name && <span className="block text-[11px] text-muted-foreground truncate">{data.site_name}</span>}
        {data.title && <span className="block text-sm font-semibold text-primary line-clamp-2 [overflow-wrap:anywhere]">{data.title}</span>}
        {data.description && <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">{data.description}</span>}
      </span>
      {image && (
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="m-2 h-16 w-16 sm:h-20 sm:w-20 shrink-0 self-center rounded-md object-cover bg-muted" />
      )}
    </a>
  );
}

export default function LinkPreviews({ text, max = 1 }) {
  if (!text) return null;
  const seen = new Set();
  const links = findLinks(text).filter((l) => previewable(l) && !seen.has(l.href) && seen.add(l.href)).slice(0, max);
  if (!links.length) return null;
  return <>{links.map((l) => <PreviewCard key={l.href} url={l.href} />)}</>;
}
