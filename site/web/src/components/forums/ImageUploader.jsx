import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Image } from '@/components/ui/image';

// Multi-image uploader for forum posts/replies. Uploads via the Core UploadFile
// integration and hands the resulting URLs back to the parent as an array.
export default function ImageUploader({ images = [], onChange }) {
  const [uploading, setUploading] = useState(false);

  const add = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => base44.integrations.Core.UploadPublicFile({ file: f })));
      onChange([...images, ...uploaded.map((u) => u.file_url)]);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
    e.target.value = '';
  };

  const remove = (i) => onChange(images.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
              <Image src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-transparent text-sm font-medium cursor-pointer hover:bg-accent">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        {uploading ? 'Uploading…' : 'Add photos'}
        <input type="file" accept="image/*" multiple className="hidden" onChange={add} disabled={uploading} />
      </label>
    </div>
  );
}