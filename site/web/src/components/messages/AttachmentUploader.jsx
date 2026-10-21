import { Image as ImageIcon, Paperclip, X, FileText, Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ImageLightbox from '@/components/messages/ImageLightbox';

function detectType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

export default function AttachmentUploader({ onAdd, disabled }) {
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      onAdd({ name: file.name, type: detectType(file), mime: file.type, file, uploading: true });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <label
        className={`grid place-items-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        title="Attach photos or videos"
        aria-label="Attach photos or videos"
      >
        <ImageIcon className="w-5 h-5" />
        <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} disabled={disabled} />
      </label>
      <label
        className={`grid place-items-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        title="Attach a file"
        aria-label="Attach a file"
      >
        <Paperclip className="w-5 h-5" />
        <input type="file" multiple className="hidden" onChange={handleFiles} disabled={disabled} />
      </label>
    </div>
  );
}

export function AttachmentPreviews({ attachments, onRemove }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 p-2 border-t border-border">
      {attachments.map((a, i) => (
        <div key={i} className="relative group rounded-lg overflow-hidden border border-border bg-muted">
          {a.uploading ? (
            <div className="w-20 h-20 grid place-items-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : a.type === 'image' ? (
            <img src={a.url} alt={a.name} className="w-20 h-20 object-cover" />
          ) : a.type === 'video' ? (
            <div className="w-20 h-20 grid place-items-center bg-black">
              <video src={a.url} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-20 h-20 grid place-items-center p-1 text-center">
              <FileText className="w-6 h-6 mx-auto text-muted-foreground" />
              <span className="text-[10px] truncate w-full mt-1">{a.name}</span>
            </div>
          )}
          {onRemove && !a.uploading && (
            <button
              type="button"
              onClick={() => onRemove(a.id || i)}
              className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function MessageAttachments({ attachments, canDelete = false, onDelete }) {
  const [lightbox, setLightbox] = useState(null);
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((a, i) => {
        if (a.type === 'image') {
          return (
            <div key={i} className="relative group w-fit max-w-full rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setLightbox({ url: a.url, name: a.name })}
                className="block overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <img src={a.url} alt={a.name} className="rounded-lg max-h-60 max-w-full object-cover cursor-zoom-in" />
              </button>
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(a, i)}
                  className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        }
        if (a.type === 'video') {
          return <video key={i} src={a.url} controls className="rounded-lg max-h-60 max-w-full" />;
        }
        return (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            download={a.name}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1">{a.name}</span>
            <Download className="w-4 h-4 shrink-0" />
          </a>
        );
      })}
      {lightbox && (
        <ImageLightbox src={lightbox.url} alt={lightbox.name} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}