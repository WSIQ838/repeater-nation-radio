// Dynamic XML sitemap generator for public, indexable Repeater Nation content.
// Public endpoint — no auth required. Returns application/xml.
// Excludes private/admin/user-only pages, hidden repeaters, and non-public nets.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { listAll } from '../../shared/adminGuard.ts';

const APP_BASE = 'https://repeaternation.com';

function escapeXml(str) {
  return String(str || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Load SEO settings to respect index/noindex toggles
    let seoSettings: any = null;
    try {
      seoSettings = (await base44.asServiceRole.entities.SeoSetting.list('-updated_date', 1))[0];
    } catch (e) {
      console.error('[sitemap] seo settings load failed:', e?.message || e);
    }

    // If sitemap is explicitly disabled, return 404
    if (seoSettings && seoSettings.enable_sitemap === false) {
      return new Response('Sitemap is disabled', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    const indexRepeaters = seoSettings ? seoSettings.index_repeaters !== false : true;
    const indexClubs = seoSettings ? seoSettings.index_clubs !== false : true;
    const indexNets = seoSettings ? seoSettings.index_nets !== false : true;
    const indexEvents = seoSettings ? seoSettings.index_events !== false : true;
    const indexForum = seoSettings ? seoSettings.index_forum !== false : true;

    const [repeaters, clubs, nets, events, forums] = await Promise.all([
      listAll(base44.asServiceRole.entities.Repeater, '-updated_date'),
      listAll(base44.asServiceRole.entities.Club, '-updated_date'),
      listAll(base44.asServiceRole.entities.NetControlSession, '-updated_date'),
      listAll(base44.asServiceRole.entities.Event, '-updated_date'),
      listAll(base44.asServiceRole.entities.ForumPost, '-updated_date'),
    ]);

    const urls: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [];

    // Static public pages
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/repeaters', priority: '0.9', changefreq: 'daily' },
      { loc: '/clubs', priority: '0.8', changefreq: 'daily' },
      { loc: '/forums', priority: '0.7', changefreq: 'daily' },
      { loc: '/map', priority: '0.7', changefreq: 'weekly' },
      { loc: '/directory', priority: '0.6', changefreq: 'weekly' },
      { loc: '/tools', priority: '0.6', changefreq: 'weekly' },
      { loc: '/tools/fcc', priority: '0.6', changefreq: 'weekly' },
      { loc: '/about', priority: '0.5', changefreq: 'monthly' },
      { loc: '/partners', priority: '0.5', changefreq: 'monthly' },
      { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
      { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
      { loc: '/contact', priority: '0.5', changefreq: 'monthly' },
    ];
    for (const p of staticPages) urls.push(p);

    // Public repeaters (exclude hidden)
    if (indexRepeaters) {
      for (const r of (repeaters || [])) {
        if (r.hidden) continue;
        urls.push({
          loc: `/repeaters/${r.id}`,
          priority: '0.6',
          changefreq: 'weekly',
          lastmod: r.updated_date,
        });
      }
    }

    // Clubs
    if (indexClubs) {
      for (const c of (clubs || [])) {
        urls.push({
          loc: `/clubs/${c.id}`,
          priority: '0.6',
          changefreq: 'weekly',
          lastmod: c.updated_date,
        });
      }
    }

    // Public nets only
    if (indexNets) {
      for (const n of (nets || [])) {
        if (!n.is_public) continue;
        urls.push({
          loc: `/tools/net-control?net=${n.id}`,
          priority: '0.4',
          changefreq: 'weekly',
          lastmod: n.updated_date,
        });
      }
    }

    // Events
    if (indexEvents) {
      for (const e of (events || [])) {
        urls.push({
          loc: `/events?event=${e.id}`,
          priority: '0.5',
          changefreq: 'weekly',
          lastmod: e.updated_date,
        });
      }
    }

    // Forum posts
    if (indexForum) {
      for (const f of (forums || [])) {
        urls.push({
          loc: `/forums/${f.id}`,
          priority: '0.5',
          changefreq: 'weekly',
          lastmod: f.updated_date,
        });
      }
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => {
      const lastmod = u.lastmod ? `\n    <lastmod>${new Date(u.lastmod).toISOString().split('T')[0]}</lastmod>` : '';
      return `  <url>\n    <loc>${escapeXml(APP_BASE + u.loc)}</loc>${lastmod}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
    }).join('\n')}\n</urlset>`;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[sitemap] error:', error?.message || error);
    return Response.json({ error: error?.message || 'unexpected error' }, { status: 500 });
  }
}