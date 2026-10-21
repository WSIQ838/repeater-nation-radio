import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Crop, Move } from "lucide-react";

export default function BannerEditor({ open, onClose, bannerUrl, focalX = 50, focalY = 50, zoom = 1, onSave }) {
  const [pos, setPos] = useState({ x: focalX, y: focalY });
  const [z, setZ] = useState(zoom);
  const frameRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPos({ x: focalX, y: focalY });
      setZ(zoom);
    }
  }, [open, focalX, focalY, zoom]);

  const updateFromPointer = (clientX, clientY) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    setPos({ x, y });
  };

  const onPointerDown = (e) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };
  const onPointerUp = () => { draggingRef.current = false; };

  const save = () => {
    onSave({ banner_focal_x: pos.x, banner_focal_y: pos.y, banner_zoom: z });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crop className="w-4 h-4" /> Adjust cover photo</DialogTitle>
        </DialogHeader>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative w-full h-44 rounded-lg overflow-hidden bg-navy cursor-grab active:cursor-grabbing touch-none select-none"
        >
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt="cover preview"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${z})` }}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-sidebar-foreground/60 text-sm">No cover photo</div>
          )}
          <div className="absolute inset-0 pointer-events-none border-2 border-white/30 rounded-lg" />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
            <Move className="w-3 h-3" /> Drag to reposition
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Zoom</span>
            <span className="text-muted-foreground">{z.toFixed(1)}×</span>
          </div>
          <Slider value={[z]} min={1} max={3} step={0.1} onValueChange={(v) => setZ(v[0])} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}