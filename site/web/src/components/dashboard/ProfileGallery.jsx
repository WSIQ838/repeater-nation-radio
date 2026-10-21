import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Image as ImageIcon } from 'lucide-react';
import ImageLightbox from '@/components/messages/ImageLightbox';

export default function ProfileGallery({ userId, refreshKey, limit = 12 }) {
  const [images, setImages] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (!userId) { setImages([]); return; }
    base44.entities.ProfilePost.filter({ created_by_id: userId }, '-created_date', 100)
      .then((posts) => setImages((posts || []).flatMap((p) => [
        ...(p.image_urls || []),
        ...(p.attachments || []).filter((a) => a.type === 'image').map((a) => a.url),
      ])))
      .catch(() => setImages([]));
  }, [userId, refreshKey]);

  if (images === null) {
    return <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}</div>;
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-6">
        <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No photos yet — add one next time you post.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {images.slice(0, limit).map((url, i) => (
          <button key={i} type="button" onClick={() => setLightbox(url)} className="aspect-square rounded-lg overflow-hidden border border-border">
            <img src={url} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
          </button>
        ))}
      </div>
      {lightbox && <ImageLightbox src={lightbox} alt="" onClose={() => setLightbox(null)} />}
    </>
  );
}
