import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import StructuredData from './StructuredData';

const APP_BASE = 'https://repeaternation.com';

/**
 * Breadcrumb navigation with BreadcrumbList schema.
 * items: [{ label: string, to?: string }]
 */
export default function Breadcrumbs({ items }) {
  if (!items || !items.length) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.to ? { item: `${APP_BASE}${item.to}` } : {}),
    })),
  };

  return (
    <>
      <StructuredData data={schema} />
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4 flex-wrap" aria-label="Breadcrumb">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />}
            {item.to && i < items.length - 1 ? (
              <Link to={item.to} className="hover:text-foreground transition-colors truncate">
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium truncate">{item.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}