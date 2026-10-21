import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Lightweight image lightbox. Renders a full-screen overlay with the image
// centered; click backdrop or press Escape to close. Portaled to <body> so a
// transformed or scrolling ancestor (feed cards, the page's fade-in wrapper)
// can't trap the fixed overlay inside the page and push the image off-screen.
export default function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
      />
    </div>,
    document.body,
  );
}