import { useEffect } from 'react';

/**
 * Injects Schema.org JSON-LD structured data into the document head.
 * Accepts a single schema object or an array of schema objects.
 * Cleans up on unmount or when data changes.
 */
export default function StructuredData({ data }) {
  useEffect(() => {
    if (!data) return;
    const schemas = Array.isArray(data) ? data : [data];
    const scripts = [];
    for (const schema of schemas) {
      if (!schema || typeof schema !== 'object') continue;
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'structured-data');
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
      scripts.push(script);
    }
    return () => {
      for (const s of scripts) {
        if (s.parentNode) s.parentNode.removeChild(s);
      }
    };
  }, [data]);
  return null;
}