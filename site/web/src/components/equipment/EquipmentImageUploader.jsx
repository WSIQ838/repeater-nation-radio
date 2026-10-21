import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function EquipmentImageUploader({ photos = [], onChange }) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        urls.push(file_url);
      }
      onChange([...photos, ...urls]);
    } catch (err) {
      toast({ title: "Upload failed", description: err?.message || "Please try again.", variant: "destructive" });
    }
    setUploading(false);
  };

  const removePhoto = (idx) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url, idx) => (
          <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border">
            <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(idx)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <label>
        <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
          <span className="cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? "Uploading…" : "Add Photos"}
          </span>
        </Button>
      </label>
    </div>
  );
}