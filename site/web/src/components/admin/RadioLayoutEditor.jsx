import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, Save, RotateCcw, Image as ImageIcon, Plus, Copy, Trash2, Star } from 'lucide-react';
import { cn, errMsg } from '@/lib/utils';
import { Loading, EmptyState } from '@/components/admin/parts';
import { LED_MODES, LED_DEFAULT } from '@/lib/radioLeds';
import { RADIO_ANIMATED_ICON_DEFS, RADIO_ANIMATIONS, RADIO_ANIMATED_ICON_DEFAULT, getRadioAnimatedIconDef } from '@/lib/radioAnimatedIcons';
import ColorAlphaInput from '@/components/ui/color-alpha-input';

// Every clickable/visible spot the live RadioWidget knows how to render on
// top of a photo. type 'text' and 'panel' get their own style fields in the
// properties panel below; plain button controls (the default type) just get
// position. mic_mute/speaker_mute/volume_up/volume_down are optional -- if
// left unplaced the widget falls back to its own footer buttons for them.
const CONTROL_DEFS = [
  { key: 'display_bg', label: 'Background panel', type: 'panel' },
  { key: 'text_zone', label: 'Zone', type: 'text' },
  { key: 'text_channel', label: 'Channel name', type: 'text' },
  { key: 'text_channel_number', label: 'Channel number', type: 'text' },
  { key: 'text_status', label: 'Status label', type: 'text' },
  { key: 'text_callsign', label: 'Callsign', type: 'text' },
  { key: 'zone', label: 'Zone' },
  { key: 'channel', label: 'Channel list' },
  { key: 'dpad_up', label: 'D-pad: Up' },
  { key: 'dpad_down', label: 'D-pad: Down' },
  { key: 'dpad_left', label: 'D-pad: Left' },
  { key: 'dpad_right', label: 'D-pad: Right' },
  { key: 'ptt', label: 'PTT' },
  { key: 'settings', label: 'Settings' },
  { key: 'collapse', label: 'Collapse' },
  { key: 'scan', label: 'Scan', optional: true },
  { key: 'mic_mute', label: 'Mic mute', optional: true },
  { key: 'speaker_mute', label: 'Speaker mute', optional: true },
  { key: 'volume_up', label: 'Volume up', optional: true },
  { key: 'volume_down', label: 'Volume down', optional: true },
  { key: 'who_on', label: "Who's On", optional: true },
  { key: 'call', label: 'Call', optional: true },
];

const DEFAULT_BOX = { left: 40, top: 40, width: 12, height: 12 };
const FONT_FAMILIES = [
  { value: 'monospace', label: 'Monospace' },
  { value: 'system-ui, sans-serif', label: 'Sans-serif' },
  { value: 'Georgia, serif', label: 'Serif' },
];
const ALIGN_OPTIONS = ['left', 'center', 'right'];
const JUSTIFY_FOR_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };
const DEFAULT_STATUS_LABELS = {
  idle: 'IDLE',
  connecting: 'CONNECTING…',
  listening: 'LISTENING',
  receiving: 'RECEIVING',
  transmitting: 'TRANSMITTING',
  busy: 'BUSY',
  disconnected: 'DISCONNECTED',
  error: 'ERROR',
  listen_only: 'LISTEN ONLY',
};
// Per-control defaults when first dropped onto the photo.
const CONTROL_DEFAULTS = {
  display_bg: { left: 28, top: 6, width: 44, height: 48, bgColor: '#ffffff', bgOpacity: 92, borderRadius: 2, borderColor: '', borderWidth: 0 },
  text_zone: { left: 29, top: 8, width: 41, height: 9, fontSize: 6.5, bold: false, color: '#64748b', align: 'left', uppercase: true, letterSpacing: 0.5, fontFamily: 'monospace', visible: true },
  text_channel: { left: 29, top: 19, width: 30, height: 13, fontSize: 8.5, bold: true, color: '#0f172a', align: 'left', uppercase: false, letterSpacing: 0, fontFamily: 'monospace', visible: true },
  text_channel_number: { left: 61, top: 19, width: 9, height: 13, fontSize: 8.5, bold: true, color: '#0f172a', align: 'right', uppercase: true, letterSpacing: 0, fontFamily: 'monospace', visible: true },
  text_status: { left: 29, top: 34, width: 41, height: 10, fontSize: 7, bold: true, color: '', align: 'left', uppercase: false, letterSpacing: 0.3, fontFamily: 'monospace', visible: true, labels: { ...DEFAULT_STATUS_LABELS } },
  text_callsign: { left: 29, top: 46, width: 41, height: 9, fontSize: 8, bold: true, color: '#ef4444', align: 'left', uppercase: true, letterSpacing: 1, fontFamily: 'monospace', visible: true },
  who_on: { left: 70, top: 40, width: 12, height: 10, shape: 'rounded' },
  call: { left: 70, top: 52, width: 12, height: 10, shape: 'rounded' },
};
const CONTROL_SHAPES = [
  { value: 'rectangle', label: 'Rectangle', radius: '4px' },
  { value: 'rounded', label: 'Rounded', radius: '12px' },
  { value: 'pill', label: 'Pill', radius: '999px' },
  { value: 'circle', label: 'Circle', radius: '50%' },
];
const CUSTOM_TEXT_DEFAULT = { left: 10, top: 10, width: 25, height: 10, text: 'Custom text', fontSize: 10, bold: false, color: '#ffffff', align: 'left', uppercase: false, letterSpacing: 0, fontFamily: 'monospace', visible: true };
const CUSTOM_BACKGROUND_DEFAULT = { left: 10, top: 10, width: 25, height: 10, bgColor: '#ffffff', bgOpacity: 80, borderRadius: 2, borderColor: '', borderWidth: 0 };
function shapeRadius(shape) { return CONTROL_SHAPES.find((s) => s.value === shape)?.radius || '4px'; }
const PREVIEW_WIDTHS = [320, 380, 440, 560];
const PREVIEW_ZOOMS = [1, 1.5, 2, 3, 4];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function hexToRgba(hex, opacityPct) {
  const h = (hex || '#ffffff').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16); const g = parseInt(h.substring(2, 4), 16); const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${Number.isNaN(r) ? 255 : r}, ${Number.isNaN(g) ? 255 : g}, ${Number.isNaN(b) ? 255 : b}, ${clamp(opacityPct ?? 92, 0, 100) / 100})`;
}

export default function RadioLayoutEditor() {
  const { toast } = useToast();
  const [layout, setLayout] = useState(null); // active layout
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState('zone');
  const [previewWidth, setPreviewWidth] = useState(440);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  // Sample text only -- never saved. Lets you see/edit how real zone and
  // channel names will actually look while you position and style the text.
  const [previewZone, setPreviewZone] = useState('Southern California');
  const [previewChannel, setPreviewChannel] = useState('Calling');
  const [previewChannelNum, setPreviewChannelNum] = useState('1');
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.RadioLayout.list('-updated_date', 100);
      const parsed = (rows || []).map((row) => {
        let controls = {};
        try { controls = JSON.parse(row.controls || '{}'); } catch { /* ignore malformed */ }
        return { ...row, controls };
      });
      setLayouts(parsed);
      const row = parsed.find((r) => r.is_default) || parsed[0] || null;
      if (row) {
        setLayout(row);
        if (row.widget_width) setPreviewWidth(row.widget_width);
      }
    } catch (err) {
      toast({ title: 'Failed to load layout', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (dragRef.current) {
      window.removeEventListener('pointermove', dragRef.current.onMove);
      window.removeEventListener('pointerup', dragRef.current.onUp);
    }
  }, []);

  const selectLayout = (id) => {
    const row = layouts.find((r) => r.id === id);
    if (!row) return;
    setLayout(row);
    setSelected('zone');
    setDrawMode(false);
    setDrawPoints([]);
    if (row.widget_width) setPreviewWidth(row.widget_width);
  };

  const newLayout = () => {
    setLayout({
      id: undefined,
      layout_name: 'Radio Layout ' + (layouts.length + 1),
      is_default: layouts.length === 0,
      image_url: '',
      image_width: 0,
      image_height: 0,
      controls: {},
      widget_width: 440,
    });
    setSelected('zone');
    setPreviewWidth(440);
    setDrawMode(false);
    setDrawPoints([]);
  };

  const duplicateLayout = () => {
    if (!layout) return;
    setLayout({
      ...layout,
      id: undefined,
      layout_name: (layout.layout_name || 'Radio Layout') + ' Copy',
      is_default: false,
      controls: JSON.parse(JSON.stringify(layout.controls || {})),
    });
    setSelected('zone');
    setDrawMode(false);
    setDrawPoints([]);
  };

  const setDefaultLayout = async () => {
    if (!layout?.id) {
      toast({ title: 'Save the layout first', description: 'A new layout needs to be saved before it can be the site default.' });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.RadioLayout.update(layout.id, { is_default: true });
      for (const other of layouts.filter((r) => r.id !== layout.id && r.is_default)) {
        await base44.entities.RadioLayout.update(other.id, { is_default: false });
      }
      await load();
      toast({ title: 'Default layout changed', description: (layout.layout_name || 'This layout') + ' is now the site default.' });
    } catch (err) {
      toast({ title: 'Could not change default', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const deleteLayout = async () => {
    if (!layout?.id) return;
    if (layouts.length <= 1) {
      toast({ title: 'Cannot delete last layout', description: 'Keep at least one radio layout available.' });
      return;
    }
    if (!confirm('Delete radio layout "' + (layout.layout_name || 'Untitled') + '"?')) return;
    try {
      await base44.entities.RadioLayout.delete(layout.id);
      const wasDefault = !!layout.is_default;
      const next = layouts.find((r) => r.id !== layout.id) || layouts[0];
      setLayouts((prev) => prev.filter((r) => r.id !== layout.id));
      if (wasDefault && next?.id) await base44.entities.RadioLayout.update(next.id, { is_default: true });
      await load();
      toast({ title: 'Layout deleted' });
    } catch (err) {
      toast({ title: 'Delete failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const dims = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('Could not read image dimensions'));
        img.src = file_url;
      });
      setLayout((prev) => ({
        id: prev?.id,
        image_url: file_url,
        image_width: dims.w,
        image_height: dims.h,
        controls: prev?.controls || {},
      }));
    } catch (err) {
      toast({ title: 'Upload failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setUploading(false);
  };

  const updateBox = (key, patch) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const cur = prev.controls?.[key] || CONTROL_DEFAULTS[key] || DEFAULT_BOX;
      return { ...prev, controls: { ...prev.controls, [key]: { ...cur, ...patch } } };
    });
  };

  const addControl = (key) => {
    setLayout((prev) => {
      if (!prev || prev.controls?.[key]) return prev;
      return { ...prev, controls: { ...prev.controls, [key]: { ...(CONTROL_DEFAULTS[key] || DEFAULT_BOX) } } };
    });
    setSelected(key);
  };

  const removeControl = (key) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev.controls };
      delete next[key];
      return { ...prev, controls: next };
    });
    setDrawMode(false);
    setDrawPoints([]);
  };

  const getCanvasPoint = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const startFreehandDraw = () => {
    if (!selectedDef || selectedDef.type === 'text' || selectedDef.type === 'panel' || selectedLed) return;
    setDrawMode(true);
    setDrawPoints([]);
  };

  const finishFreehandDraw = (points) => {
    if (points.length < 3) {
      setDrawMode(false);
      setDrawPoints([]);
      return;
    }
    const simplified = points.filter((p, i) => i === 0 || i === points.length - 1 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) >= 0.4);
    if (simplified.length < 3) {
      setDrawMode(false);
      setDrawPoints([]);
      return;
    }
    const minX = Math.min(...simplified.map((p) => p.x));
    const maxX = Math.max(...simplified.map((p) => p.x));
    const minY = Math.min(...simplified.map((p) => p.y));
    const maxY = Math.max(...simplified.map((p) => p.y));
    const width = Math.max(maxX - minX, 2);
    const height = Math.max(maxY - minY, 2);
    const polygon = simplified.map((p) => ({
      x: Number(clamp(((p.x - minX) / width) * 100, 0, 100).toFixed(2)),
      y: Number(clamp(((p.y - minY) / height) * 100, 0, 100).toFixed(2)),
    }));
    updateBox(selected, {
      left: Number(minX.toFixed(2)),
      top: Number(minY.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      shape: 'freehand',
      polygon,
    });
    setDrawMode(false);
    setDrawPoints([]);
  };

  const onFreehandPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = getCanvasPoint(e);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrawPoints([p]);
  };

  const onFreehandPointerMove = (e) => {
    if (!drawMode) return;
    const p = getCanvasPoint(e);
    if (!p) return;
    setDrawPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.4) return prev;
      return [...prev, p];
    });
  };

  const onFreehandPointerUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    finishFreehandDraw(drawPoints);
  };

  useEffect(() => {
    if (!drawMode) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDrawMode(false);
        setDrawPoints([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawMode]);

  // LEDs are a repeatable array (Admin can add as many as they want), unlike
  // every other control which is a single fixed-name slot -- kept separate
  // from `controls`'s keyed object for that reason, addressed by `led.id`.
  const leds = layout?.controls?.leds || [];
  const backgrounds = layout?.controls?.backgrounds || [];
  const customTexts = layout?.controls?.custom_texts || [];
  const animatedIcons = layout?.controls?.animated_icons || [];

  const addBackground = () => {
    const id = `bg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setLayout((prev) => {
      if (!prev) return prev;
      const next = [...(prev.controls?.backgrounds || []), { ...CUSTOM_BACKGROUND_DEFAULT, id }];
      return { ...prev, controls: { ...prev.controls, backgrounds: next } };
    });
    setSelected(`bg:${id}`);
  };
  const updateBackground = (id, patch) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const next = (prev.controls?.backgrounds || []).map((b) => (b.id === id ? { ...b, ...patch } : b));
      return { ...prev, controls: { ...prev.controls, backgrounds: next } };
    });
  };
  const removeBackground = (id) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return { ...prev, controls: { ...prev.controls, backgrounds: (prev.controls?.backgrounds || []).filter((b) => b.id !== id) } };
    });
    setSelected((cur) => (cur === `bg:${id}` ? 'zone' : cur));
  };

  const addCustomText = () => {
    const id = `text_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setLayout((prev) => {
      if (!prev) return prev;
      const next = [...(prev.controls?.custom_texts || []), { ...CUSTOM_TEXT_DEFAULT, id, text: `Custom text ${(prev.controls?.custom_texts || []).length + 1}` }];
      return { ...prev, controls: { ...prev.controls, custom_texts: next } };
    });
    setSelected(`customtext:${id}`);
  };
  const updateCustomText = (id, patch) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const next = (prev.controls?.custom_texts || []).map((t) => (t.id === id ? { ...t, ...patch } : t));
      return { ...prev, controls: { ...prev.controls, custom_texts: next } };
    });
  };
  const removeCustomText = (id) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return { ...prev, controls: { ...prev.controls, custom_texts: (prev.controls?.custom_texts || []).filter((t) => t.id !== id) } };
    });
    setSelected((cur) => (cur === `customtext:${id}` ? 'zone' : cur));
  };

  const addLed = () => {
    const id = `led_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setLayout((prev) => {
      if (!prev) return prev;
      const nextLeds = [...(prev.controls?.leds || []), { ...LED_DEFAULT, id }];
      return { ...prev, controls: { ...prev.controls, leds: nextLeds } };
    });
    setSelected(`led:${id}`);
  };

  const updateLed = (id, patch) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const nextLeds = (prev.controls?.leds || []).map((l) => (l.id === id ? { ...l, ...patch } : l));
      return { ...prev, controls: { ...prev.controls, leds: nextLeds } };
    });
  };

  const addAnimatedIcon = () => {
    const id = 'icon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setLayout((prev) => {
      if (!prev) return prev;
      const next = [...(prev.controls?.animated_icons || []), { ...RADIO_ANIMATED_ICON_DEFAULT, id }];
      return { ...prev, controls: { ...prev.controls, animated_icons: next } };
    });
    setSelected('icon:' + id);
  };
  const updateAnimatedIcon = (id, patch) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return { ...prev, controls: { ...prev.controls, animated_icons: (prev.controls?.animated_icons || []).map((item) => item.id === id ? { ...item, ...patch } : item) } };
    });
  };
  const removeAnimatedIcon = (id) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return { ...prev, controls: { ...prev.controls, animated_icons: (prev.controls?.animated_icons || []).filter((item) => item.id !== id) } };
    });
    setSelected((cur) => cur === 'icon:' + id ? 'zone' : cur);
  };

  const removeLed = (id) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const nextLeds = (prev.controls?.leds || []).filter((l) => l.id !== id);
      return { ...prev, controls: { ...prev.controls, leds: nextLeds } };
    });
    setSelected((cur) => (cur === `led:${id}` ? 'zone' : cur));
  };

  // Drag-to-move / drag-handle-to-resize, in percentages of the photo's own
  // rendered box so it stays correct at any preview width. Shared by named
  // controls and LEDs -- getBox/setBox let each caller plug in its own
  // storage (the controls object vs. the leds array) without duplicating
  // the pointer-tracking logic itself.
  const startDragBox = (selectKey, box, setBox) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(selectKey);
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      setBox({
        left: clamp(box.left + dxPct, 0, 100 - box.width),
        top: clamp(box.top + dyPct, 0, 100 - box.height),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragRef.current = null;
    };
    dragRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResizeBox = (selectKey, box, setBox) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(selectKey);
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      setBox({
        width: clamp(box.width + dxPct, 2, 100 - box.left),
        height: clamp(box.height + dyPct, 2, 100 - box.top),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragRef.current = null;
    };
    dragRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startDrag = (key, mode) => {
    const box = layout.controls[key] || CONTROL_DEFAULTS[key] || DEFAULT_BOX;
    const setBox = (patch) => updateBox(key, patch);
    return mode === 'move' ? startDragBox(key, box, setBox) : startResizeBox(key, box, setBox);
  };

  const startDragAnimatedIcon = (id, mode) => {
    const box = animatedIcons.find((item) => item.id === id) || RADIO_ANIMATED_ICON_DEFAULT;
    const setBox = (patch) => updateAnimatedIcon(id, patch);
    return mode === 'move' ? startDragBox('icon:' + id, box, setBox) : startResizeBox('icon:' + id, box, setBox);
  };
  const startDragLed = (id, mode) => {
    const box = leds.find((l) => l.id === id) || LED_DEFAULT;
    const setBox = (patch) => updateLed(id, patch);
    return mode === 'move' ? startDragBox(`led:${id}`, box, setBox) : startResizeBox(`led:${id}`, box, setBox);
  };
  const startDragBackground = (id, mode) => {
    const box = backgrounds.find((b) => b.id === id) || CUSTOM_BACKGROUND_DEFAULT;
    const setBox = (patch) => updateBackground(id, patch);
    return mode === 'move' ? startDragBox(`bg:${id}`, box, setBox) : startResizeBox(`bg:${id}`, box, setBox);
  };
  const startDragCustomText = (id, mode) => {
    const box = customTexts.find((t) => t.id === id) || CUSTOM_TEXT_DEFAULT;
    const setBox = (patch) => updateCustomText(id, patch);
    return mode === 'move' ? startDragBox(`customtext:${id}`, box, setBox) : startResizeBox(`customtext:${id}`, box, setBox);
  };

  const save = async () => {
    if (!layout?.image_url) return;
    setSaving(true);
    try {
      const payload = {
        layout_name: (layout.layout_name || 'Radio Layout').trim(),
        is_default: !!layout.is_default,
        image_url: layout.image_url,
        image_width: layout.image_width || 0,
        image_height: layout.image_height || 0,
        controls: JSON.stringify(layout.controls || {}),
        widget_width: previewWidth,
      };
      if (layout.id) {
        await base44.entities.RadioLayout.update(layout.id, payload);
      } else {
        const created = await base44.entities.RadioLayout.create(payload);
        setLayout((prev) => ({ ...prev, id: created.id }));
      }

      if (payload.is_default) {
        for (const other of layouts.filter((r) => r.id && r.id !== layout.id && r.is_default)) {
          await base44.entities.RadioLayout.update(other.id, { is_default: false });
        }
      }
      await load();
      toast({ title: 'Layout saved', description: 'The floating radio widget can use this layout.' });
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err) || err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading) return <Loading />;

  const controls = layout?.controls || {};
  const unmapped = CONTROL_DEFS.filter((c) => !c.optional && !controls[c.key]);
  const aspect = layout?.image_width && layout?.image_height ? `${layout.image_width} / ${layout.image_height}` : '481 / 137';
  const selectedLedId = typeof selected === 'string' && selected.startsWith('led:') ? selected.slice(4) : null;
  const selectedAnimatedIconId = typeof selected === 'string' && selected.startsWith('icon:') ? selected.slice(5) : null;
  const selectedBackgroundId = typeof selected === 'string' && selected.startsWith('bg:') ? selected.slice(3) : null;
  const selectedCustomTextId = typeof selected === 'string' && selected.startsWith('customtext:') ? selected.slice(11) : null;
  const selectedLed = selectedLedId ? leds.find((l) => l.id === selectedLedId) : null;
  const selectedAnimatedIcon = selectedAnimatedIconId ? animatedIcons.find((item) => item.id === selectedAnimatedIconId) : null;
  const selectedBackground = selectedBackgroundId ? backgrounds.find((b) => b.id === selectedBackgroundId) : null;
  const selectedCustomText = selectedCustomTextId ? customTexts.find((t) => t.id === selectedCustomTextId) : null;
  const selectedDef = CONTROL_DEFS.find((c) => c.key === selected);
  const selectedBox = selectedLed || selectedAnimatedIcon || selectedBackground || selectedCustomText || controls[selected];
  const updateSelected = (patch) => selectedLedId ? updateLed(selectedLedId, patch) : selectedAnimatedIconId ? updateAnimatedIcon(selectedAnimatedIconId, patch) : selectedBackgroundId ? updateBackground(selectedBackgroundId, patch) : selectedCustomTextId ? updateCustomText(selectedCustomTextId, patch) : updateBox(selected, patch);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium text-sm">Radio layouts</div>
            <p className="text-xs text-muted-foreground mt-0.5">Create multiple radio faces. Members can choose which layout they want to use.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={newLayout} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> New layout</Button>
            <Button type="button" variant="outline" size="sm" onClick={duplicateLayout} disabled={!layout?.image_url} className="gap-1.5"><Copy className="w-3.5 h-3.5" /> Duplicate</Button>
            <Button type="button" variant="ghost" size="sm" onClick={deleteLayout} disabled={!layout?.id || layouts.length <= 1} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={layout?.id || '__new__'}
            onChange={(e) => e.target.value === '__new__' ? newLayout() : selectLayout(e.target.value)}
            className="h-9 min-w-64 flex-1 px-3 rounded-md border border-input bg-background text-sm"
          >
            {layouts.length === 0 && <option value="__new__">New layout</option>}
            {layouts.map((r) => <option key={r.id} value={r.id}>{r.layout_name || 'Untitled'}{r.is_default ? ' · Default' : ''}</option>)}
            {!layout?.id && <option value="__new__">New unsaved layout</option>}
          </select>
          <Input
            value={layout?.layout_name || ''}
            onChange={(e) => setLayout((prev) => prev ? ({ ...prev, layout_name: e.target.value }) : prev)}
            placeholder="Layout name"
            className="h-9 w-52"
          />
          <Button type="button" variant={layout?.is_default ? 'default' : 'outline'} size="sm" onClick={setDefaultLayout} disabled={!layout?.id || layout.is_default} className="gap-1.5">
            <Star className="w-3.5 h-3.5" /> {layout?.is_default ? 'Default layout' : 'Set as default'}
          </Button>
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-medium text-sm">Reference photo</div>
          <p className="text-xs text-muted-foreground mt-0.5">Upload a photo of the physical radio, then drag a box onto each control below.</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {layout?.image_url ? 'Replace photo' : 'Upload photo'}
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving || !layout?.image_url} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save layout
          </Button>
        </div>
      </Card>

      {!layout?.image_url ? (
        <EmptyState title="No photo uploaded yet" description="Upload a photo above to start positioning controls." icon={ImageIcon} />
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Widget size & editor zoom</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Widget size is what members see. Editor zoom only magnifies the working canvas for precise placement.</p>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Widget</span>
                  <input type="range" min="280" max="640" step="4" value={previewWidth} onChange={(e) => setPreviewWidth(Number(e.target.value))} className="w-28 accent-primary" />
                  <span className="text-xs font-mono w-11 text-right shrink-0">{previewWidth}px</span>
                  <div className="flex items-center gap-1">
                    {PREVIEW_WIDTHS.map((w) => (
                      <Button key={w} type="button" size="sm" variant={previewWidth === w ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setPreviewWidth(w)}>
                        {w}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Zoom</span>
                  <input type="range" min="100" max="400" step="25" value={previewZoom * 100} onChange={(e) => setPreviewZoom(Number(e.target.value) / 100)} className="w-28 accent-primary" />
                  <span className="text-xs font-mono w-12 text-right shrink-0">{Math.round(previewZoom * 100)}%</span>
                  <div className="flex items-center gap-1">
                    {PREVIEW_ZOOMS.map((z) => (
                      <Button key={z} type="button" size="sm" variant={previewZoom === z ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setPreviewZoom(z)}>
                        {z}×
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-auto pb-2 max-h-[70vh] border border-border rounded-lg bg-muted/20 p-3">
              <div className="mx-auto" style={{ width: previewWidth * previewZoom }}>
                <div
                  ref={containerRef}
                  className="relative bg-black rounded-lg overflow-hidden touch-none"
                  style={{ width: previewWidth * previewZoom, aspectRatio: aspect }}
                >
                <img src={layout.image_url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" />
                {drawMode && (
                  <>
                    <svg
                      className="absolute inset-0 w-full h-full z-50 cursor-crosshair touch-none text-primary"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      onPointerDown={onFreehandPointerDown}
                      onPointerMove={onFreehandPointerMove}
                      onPointerUp={onFreehandPointerUp}
                      onPointerCancel={onFreehandPointerUp}
                    >
                      <rect x="0" y="0" width="100" height="100" fill="transparent" />
                      {drawPoints.length > 1 && (
                        <polyline
                          points={drawPoints.map((p) => p.x + ',' + p.y).join(' ')}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                    <div className="absolute z-[51] top-2 left-1/2 -translate-x-1/2 rounded-md bg-black/85 text-white text-xs px-3 py-1.5 pointer-events-none shadow-lg">
                      Draw around the button, then release. Press Esc to cancel.
                    </div>
                  </>
                )}
                {backgrounds.map((bg) => {
                  const isSelected = selected === `bg:${bg.id}`;
                  return (
                    <div
                      key={bg.id}
                      onPointerDown={startDragBackground(bg.id, 'move')}
                      className={cn('absolute cursor-move pointer-events-auto', isSelected && 'ring-2 ring-primary')}
                      style={{ left: `${bg.left}%`, top: `${bg.top}%`, width: `${bg.width}%`, height: `${bg.height}%`, backgroundColor: hexToRgba(bg.bgColor || '#ffffff', bg.bgOpacity ?? 80), borderRadius: `${bg.borderRadius ?? 2}px`, border: bg.borderWidth ? `${bg.borderWidth}px solid ${hexToRgba(bg.borderColor || '#000000', bg.borderOpacity ?? 100)}` : undefined }}
                    >
                      <span onPointerDown={startDragBackground(bg.id, 'resize')} className="absolute right-0 bottom-0 w-3 h-3 bg-primary cursor-nwse-resize translate-x-1/2 translate-y-1/2 rounded-sm" />
                    </div>
                  );
                })}
                {CONTROL_DEFS.filter((c) => controls[c.key]).map((c) => {
                  const box = controls[c.key];
                  const isSelected = selected === c.key;
                  const isPanel = c.type === 'panel';
                  const isText = c.type === 'text';
                  return (
                    <div
                      key={c.key}
                      onPointerDown={startDrag(c.key, 'move')}
                      className={cn(
                        'absolute cursor-move',
                        isPanel ? cn(isSelected && 'ring-2 ring-primary') :
                        isText ? cn('overflow-hidden flex items-center', isSelected && 'ring-2 ring-primary bg-primary/10') :
                        cn('border-2 flex items-end', isSelected ? 'border-primary bg-primary/20' : 'border-white/60 bg-white/10 hover:bg-white/20')
                      )}
                      style={{
                        left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`,
                        ...(isPanel ? {
                          backgroundColor: hexToRgba(box.bgColor || '#ffffff', box.bgOpacity ?? 92),
                          borderRadius: `${box.borderRadius ?? 2}px`,
                          border: box.borderWidth ? `${box.borderWidth}px solid ${hexToRgba(box.borderColor || '#000000', box.borderOpacity ?? 100)}` : undefined,
                        } : {
                          borderRadius: isText ? undefined : (box.shape === 'freehand' ? '0' : shapeRadius(box.shape)),
                          clipPath: !isText && box.shape === 'freehand' && box.polygon?.length ? `polygon(${box.polygon.map((p) => `${p.x}% ${p.y}%`).join(', ')})` : undefined,
                        }),
                      }}
                    >
                      {isText && box.visible !== false ? (
                        <div
                          className="w-full truncate pointer-events-none px-0.5"
                          style={{
                            fontSize: `${box.fontSize || 8}px`,
                            fontWeight: box.bold ? 700 : 400,
                            color: hexToRgba(box.color || (c.key === 'text_status' ? '#22c55e' : '#0f172a'), box.colorOpacity ?? 100),
                            textAlign: box.align || 'left',
                            textTransform: box.uppercase ? 'uppercase' : 'none',
                            letterSpacing: `${box.letterSpacing ?? 0}px`,
                            fontFamily: box.fontFamily || 'monospace',
                          }}
                        >
                          {c.key === 'text_zone' ? (previewZone || 'No zone') : c.key === 'text_channel' ? (previewChannel || '— No channel —') : c.key === 'text_channel_number' ? (previewChannelNum || '--') : c.key === 'text_callsign' ? 'W6EXAMPLE' : (box.labels?.listening || 'LISTENING')}
                        </div>
                      ) : isPanel ? null : !isText ? (
                        <span className="text-[8px] leading-none px-0.5 bg-black/70 text-white truncate max-w-full">{c.label}</span>
                      ) : null}
                      <span
                        onPointerDown={startDrag(c.key, 'resize')}
                        className="absolute right-0 bottom-0 w-3 h-3 bg-primary cursor-nwse-resize translate-x-1/2 translate-y-1/2 rounded-sm"
                      />
                    </div>
                  );
                })}
                {customTexts.map((item) => {
                  const isSelected = selected === `customtext:${item.id}`;
                  return (
                    <div
                      key={item.id}
                      onPointerDown={startDragCustomText(item.id, 'move')}
                      className={cn('absolute cursor-move overflow-hidden flex items-center', isSelected && 'ring-2 ring-primary bg-primary/10')}
                      style={{ left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%`, textAlign: item.align || 'left', justifyContent: JUSTIFY_FOR_ALIGN[item.align] || 'flex-start', color: hexToRgba(item.color || '#ffffff', item.colorOpacity ?? 100), textTransform: item.uppercase ? 'uppercase' : 'none', letterSpacing: `${item.letterSpacing ?? 0}px`, fontFamily: item.fontFamily || 'monospace', fontSize: `${item.fontSize || 10}px`, fontWeight: item.bold ? 700 : 400 }}
                    >
                      <span className="truncate w-full pointer-events-none">{item.text || 'Custom text'}</span>
                      <span onPointerDown={startDragCustomText(item.id, 'resize')} className="absolute right-0 bottom-0 w-3 h-3 bg-primary cursor-nwse-resize translate-x-1/2 translate-y-1/2 rounded-sm" />
                    </div>
                  );
                })}
                {animatedIcons.map((item) => {
                  const isSelected = selected === `icon:${item.id}`;
                  const def = getRadioAnimatedIconDef(item.icon);
                  const Icon = def.Icon;
                  return (
                    <div key={item.id} onPointerDown={startDragAnimatedIcon(item.id, 'move')} className={cn('absolute cursor-move flex items-center justify-center', isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-black')} style={{ left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%`, color: hexToRgba(item.color || '#22c55e', item.opacity ?? 100) }}>
                      <Icon className="w-full h-full" strokeWidth={item.strokeWidth ?? 2} />
                      <span onPointerDown={startDragAnimatedIcon(item.id, 'resize')} className="absolute right-0 bottom-0 w-3 h-3 bg-primary cursor-nwse-resize translate-x-1/2 translate-y-1/2 rounded-sm" />
                    </div>
                  );
                })}
                {leds.map((led) => {
                  const isSelected = selected === `led:${led.id}`;
                  return (
                    <div
                      key={led.id}
                      onPointerDown={startDragLed(led.id, 'move')}
                      className={cn('absolute rounded-full cursor-move', isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-black')}
                      style={{
                        left: `${led.left}%`, top: `${led.top}%`, width: `${led.width}%`, height: `${led.height}%`,
                        backgroundColor: hexToRgba(led.onColor || '#ef4444', led.onColorOpacity ?? 100),
                        boxShadow: led.glow !== false ? `0 0 6px 2px ${hexToRgba(led.onColor || '#ef4444', led.onColorOpacity ?? 100)}` : 'none',
                      }}
                    >
                      <span
                        onPointerDown={startDragLed(led.id, 'resize')}
                        className="absolute right-0 bottom-0 w-3 h-3 bg-primary cursor-nwse-resize translate-x-1/2 translate-y-1/2 rounded-sm"
                      />
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
            <Card className="p-3 space-y-1 max-h-[420px] overflow-y-auto">
              {CONTROL_DEFS.map((c) => {
                const has = !!controls[c.key];
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => (has ? setSelected(c.key) : addControl(c.key))}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded text-sm flex items-center justify-between gap-2',
                      selected === c.key && has ? 'bg-accent font-medium' : 'hover:bg-muted/60',
                      !has && 'text-muted-foreground italic'
                    )}
                  >
                    {c.label}
                    {has ? <span className="text-[10px] text-muted-foreground">placed</span> : <span className="text-[10px]">+ add</span>}
                  </button>
                );
              })}

              <div className="pt-2 mt-2 border-t border-border space-y-1">
                <div className="flex items-center justify-between px-2.5 pb-1">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Extra backgrounds</div>
                  <button type="button" onClick={addBackground} className="text-[11px] text-primary hover:underline">+ Add</button>
                </div>
                {backgrounds.map((bg, i) => (
                  <div key={bg.id} className={cn('w-full flex items-center gap-1 rounded', selected === `bg:${bg.id}` && 'bg-accent')}>
                    <button type="button" onClick={() => setSelected(`bg:${bg.id}`)} className={cn('flex-1 text-left px-2.5 py-1.5 text-sm truncate', selected === `bg:${bg.id}` && 'font-medium')}>Background {i + 1}</button>
                    <button type="button" onClick={() => removeBackground(bg.id)} title="Remove background" className="px-2 py-1.5 text-muted-foreground hover:text-destructive text-xs">✕</button>
                  </div>
                ))}
              </div>

              <div className="pt-2 mt-2 border-t border-border space-y-1">
                <div className="flex items-center justify-between px-2.5 pb-1">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Custom text</div>
                  <button type="button" onClick={addCustomText} className="text-[11px] text-primary hover:underline">+ Add</button>
                </div>
                {customTexts.map((item, i) => (
                  <div key={item.id} className={cn('w-full flex items-center gap-1 rounded', selected === `customtext:${item.id}` && 'bg-accent')}>
                    <button type="button" onClick={() => setSelected(`customtext:${item.id}`)} className={cn('flex-1 text-left px-2.5 py-1.5 text-sm truncate', selected === `customtext:${item.id}` && 'font-medium')}>{item.text || `Text ${i + 1}`}</button>
                    <button type="button" onClick={() => removeCustomText(item.id)} title="Remove text" className="px-2 py-1.5 text-muted-foreground hover:text-destructive text-xs">✕</button>
                  </div>
                ))}
              </div>

              <div className="pt-2 mt-2 border-t border-border">
                <div className="flex items-center justify-between px-2.5 pb-1">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Animated Radio Icons</div>
                  <button type="button" onClick={addAnimatedIcon} className="text-[11px] text-primary hover:underline">+ Add</button>
                </div>
                {animatedIcons.map((item, i) => (
                  <div key={item.id} className={cn('w-full flex items-center gap-1 rounded', selected === `icon:${item.id}` && 'bg-accent')}>
                    <button type="button" onClick={() => setSelected(`icon:${item.id}`)} className={cn('flex-1 text-left px-2.5 py-1.5 text-sm truncate', selected === `icon:${item.id}` && 'font-medium')}>
                      Icon {i + 1} — {getRadioAnimatedIconDef(item.icon).label}
                    </button>
                    <button type="button" onClick={() => removeAnimatedIcon(item.id)} title="Remove icon" className="px-2 py-1.5 text-muted-foreground hover:text-destructive text-xs">✕</button>
                  </div>
                ))}
              </div>

              <div className="pt-2 mt-2 border-t border-border">
                <div className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Indicator LEDs
                </div>
                {leds.map((led, i) => (
                  <div key={led.id} className={cn('w-full flex items-center gap-1 rounded', selected === `led:${led.id}` && 'bg-accent')}>
                    <button
                      type="button"
                      onClick={() => setSelected(`led:${led.id}`)}
                      className={cn('flex-1 text-left px-2.5 py-1.5 text-sm truncate', selected === `led:${led.id}` && 'font-medium')}
                    >
                      LED {i + 1} — {LED_MODES.find((m) => m.value === led.mode)?.label || led.mode}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLed(led.id)}
                      title="Remove LED"
                      className="px-2 py-1.5 text-muted-foreground hover:text-destructive text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLed}
                  className="w-full text-left px-2.5 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  + Add LED
                </button>
              </div>
            </Card>

            <Card className="p-4">
              {selectedBox ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{selectedAnimatedIcon ? `Animated Icon (${getRadioAnimatedIconDef(selectedAnimatedIcon.icon).label})` : selectedLed ? `Indicator LED (${LED_MODES.find((m) => m.value === selectedLed.mode)?.label || selectedLed.mode})` : selectedBackground ? 'Background' : selectedCustomText ? 'Custom text' : selectedDef?.label}</div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => (selectedLedId ? removeLed(selectedLedId) : selectedAnimatedIconId ? removeAnimatedIcon(selectedAnimatedIconId) : selectedBackgroundId ? removeBackground(selectedBackgroundId) : selectedCustomTextId ? removeCustomText(selectedCustomTextId) : removeControl(selected))} className="h-7 text-xs text-destructive hover:text-destructive gap-1">
                      <RotateCcw className="w-3 h-3" /> Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {['left', 'top', 'width', 'height'].map((field) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs capitalize">{field} (%)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={selectedBox[field]}
                          onChange={(e) => updateSelected({ [field]: clamp(Number(e.target.value) || 0, 0, 100) })}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  {selectedBackground && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Background color</Label><input type="color" value={selectedBackground.bgColor || '#ffffff'} onChange={(e) => updateSelected({ bgColor: e.target.value })} className="h-8 w-full rounded border border-input bg-transparent cursor-pointer" /></div>
                        <div className="space-y-1"><Label className="text-xs">Opacity (%)</Label><Input type="number" min="0" max="100" value={selectedBackground.bgOpacity ?? 80} onChange={(e) => updateSelected({ bgOpacity: clamp(Number(e.target.value) || 0, 0, 100) })} className="h-8 text-sm" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Border width</Label><Input type="number" min="0" max="10" value={selectedBackground.borderWidth ?? 0} onChange={(e) => updateSelected({ borderWidth: clamp(Number(e.target.value) || 0, 0, 10) })} className="h-8 text-sm" /></div>
                        <div className="space-y-1"><Label className="text-xs">Border radius</Label><Input type="number" min="0" max="50" value={selectedBackground.borderRadius ?? 2} onChange={(e) => updateSelected({ borderRadius: clamp(Number(e.target.value) || 0, 0, 50) })} className="h-8 text-sm" /></div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Border color</Label>
                        <ColorAlphaInput
                          color={selectedBackground.borderColor || '#000000'}
                          opacity={selectedBackground.borderOpacity ?? 100}
                          onColorChange={(v) => updateSelected({ borderColor: v })}
                          onOpacityChange={(v) => updateSelected({ borderOpacity: v })}
                        />
                      </div>
                    </div>
                  )}

                  {selectedCustomText && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="space-y-1"><Label className="text-xs">Text</Label><Input value={selectedCustomText.text || ''} onChange={(e) => updateSelected({ text: e.target.value })} placeholder="Enter text to display" className="h-8 text-sm" /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Font</Label><select value={selectedCustomText.fontFamily || 'monospace'} onChange={(e) => updateSelected({ fontFamily: e.target.value })} className="h-8 w-full px-2 rounded-md border border-input bg-background text-sm">{FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                        <div className="space-y-1"><Label className="text-xs">Font size (px)</Label><Input type="number" min="4" max="48" step="0.5" value={selectedCustomText.fontSize || 10} onChange={(e) => updateSelected({ fontSize: clamp(Number(e.target.value) || 10, 4, 48) })} className="h-8 text-sm" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Color</Label>
                          <ColorAlphaInput
                            color={selectedCustomText.color || '#ffffff'}
                            opacity={selectedCustomText.colorOpacity ?? 100}
                            onColorChange={(v) => updateSelected({ color: v })}
                            onOpacityChange={(v) => updateSelected({ colorOpacity: v })}
                          />
                        </div>
                        <div className="space-y-1"><Label className="text-xs">Align</Label><select value={selectedCustomText.align || 'left'} onChange={(e) => updateSelected({ align: e.target.value })} className="h-8 w-full px-2 rounded-md border border-input bg-background text-sm">{ALIGN_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant={selectedCustomText.bold ? 'default' : 'outline'} className="h-7 text-xs flex-1" onClick={() => updateSelected({ bold: !selectedCustomText.bold })}>Bold</Button>
                        <Button type="button" size="sm" variant={selectedCustomText.uppercase ? 'default' : 'outline'} className="h-7 text-xs flex-1" onClick={() => updateSelected({ uppercase: !selectedCustomText.uppercase })}>Uppercase</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Letter spacing</Label><Input type="number" step="0.5" min="-5" max="20" value={selectedCustomText.letterSpacing ?? 0} onChange={(e) => updateSelected({ letterSpacing: Number(e.target.value) || 0 })} className="h-8 text-sm" /></div>
                        <div className="space-y-1"><Label className="text-xs">Visible</Label><Switch checked={selectedCustomText.visible !== false} onCheckedChange={(v) => updateSelected({ visible: v })} /></div>
                      </div>
                    </div>
                  )}

                  {!selectedLed && !selectedAnimatedIcon && !selectedBackground && !selectedCustomText && selectedDef?.type !== "text" && selectedDef?.type !== "panel" && (
                    <div className="space-y-1.5 pt-3 border-t border-border">
                      <Label className="text-xs">Button shape</Label>
                      <select
                        value={selectedBox.shape || "rectangle"}
                        onChange={(e) => updateSelected({ shape: e.target.value })}
                        className="h-8 w-full px-2 rounded-md border border-input bg-background text-sm"
                      >
                        {CONTROL_SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        <option value="freehand">Freehand</option>
                      </select>
                      {selectedBox.shape === 'freehand' && (
                        <Button type="button" size="sm" className="w-full h-8 text-xs" onClick={startFreehandDraw}>
                          Redraw freehand shape
                        </Button>
                      )}
                      <p className="text-[11px] text-muted-foreground">Width and height control the clickable area. Shape changes the hit-area geometry.</p>
                    </div>
                  )}

                  {selectedAnimatedIcon && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="space-y-1"><Label className="text-xs">Radio icon</Label><select value={selectedAnimatedIcon.icon || 'gps'} onChange={(e) => updateSelected({ icon: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">{RADIO_ANIMATED_ICON_DEFS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                      <div className="space-y-1"><Label className="text-xs">Animation</Label><select value={selectedAnimatedIcon.animation || 'pulse'} onChange={(e) => updateSelected({ animation: e.target.value })} className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm">{RADIO_ANIMATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                      <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs">Color</Label><ColorAlphaInput color={selectedAnimatedIcon.color || '#22c55e'} opacity={selectedAnimatedIcon.opacity ?? 100} onColorChange={(v) => updateSelected({ color: v })} onOpacityChange={(v) => updateSelected({ opacity: v })} /></div><div className="space-y-1"><Label className="text-xs">Stroke width</Label><Input type="number" min="1" max="5" step="0.5" value={selectedAnimatedIcon.strokeWidth ?? 2} onChange={(e) => updateSelected({ strokeWidth: clamp(Number(e.target.value) || 2, 1, 5) })} className="h-8 text-sm" /></div></div>
                      <div className="flex items-center justify-between rounded-md border border-input px-3 py-2"><Label className="text-xs">Visible</Label><Switch checked={selectedAnimatedIcon.visible !== false} onCheckedChange={(v) => updateSelected({ visible: v })} /></div>
                    </div>
                  )}

                  {selectedLed && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="space-y-1">
                        <Label className="text-xs">Lights up when</Label>
                        <select
                          value={selectedLed.mode}
                          onChange={(e) => updateSelected({ mode: e.target.value })}
                          className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
                        >
                          {LED_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Color when on</Label>
                          <ColorAlphaInput
                            color={selectedLed.onColor || '#ef4444'}
                            opacity={selectedLed.onColorOpacity ?? 100}
                            onColorChange={(v) => updateSelected({ onColor: v })}
                            onOpacityChange={(v) => updateSelected({ onColorOpacity: v })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Color when off</Label>
                          <ColorAlphaInput
                            color={selectedLed.offColor || '#2a2a2a'}
                            opacity={selectedLed.offColorOpacity ?? 100}
                            onColorChange={(v) => updateSelected({ offColor: v })}
                            onOpacityChange={(v) => updateSelected({ offColorOpacity: v })}
                          />
                        </div>
                      </div>
                      <Button
                        type="button" size="sm" variant={selectedLed.glow !== false ? 'default' : 'outline'}
                        className="h-7 px-3 text-xs w-full"
                        onClick={() => updateSelected({ glow: selectedLed.glow === false })}
                      >
                        {selectedLed.glow !== false ? 'Glow effect: on' : 'Glow effect: off'}
                      </Button>
                      <p className="text-xs text-muted-foreground">Only the on-color is shown here on the photo above for visibility while placing it; the real widget shows the off-color until this LED's condition is true.</p>
                    </div>
                  )}

                  {selectedDef?.type === 'text' && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      {selected === 'text_zone' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Preview zone name</Label>
                          <Input value={previewZone} onChange={(e) => setPreviewZone(e.target.value)} placeholder="e.g. Southern California" className="h-8 text-sm" />
                        </div>
                      )}
                      {selected === 'text_channel_number' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Preview channel number</Label>
                          <Input value={previewChannelNum} onChange={(e) => setPreviewChannelNum(e.target.value)} placeholder="e.g. 1" className="h-8 text-sm" />
                        </div>
                      )}
                      {selected === 'text_channel' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Preview channel name</Label>
                          <Input value={previewChannel} onChange={(e) => setPreviewChannel(e.target.value)} placeholder="e.g. Calling" className="h-8 text-sm" />
                        </div>
                      )}

                      {selected === 'text_status' && (
                        <div className="space-y-3 rounded-md border border-input p-3">
                          <div>
                            <Label className="text-xs">Status labels</Label>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Change what the radio displays for each status.</p>
                          </div>
                          {Object.entries(DEFAULT_STATUS_LABELS).map(([key, defaultLabel]) => (
                            <div key={key} className="grid grid-cols-[110px_1fr] items-center gap-2">
                              <Label className="text-xs capitalize">{key.replace('_', ' ')}</Label>
                              <Input
                                value={selectedBox.labels?.[key] ?? defaultLabel}
                                onChange={(e) => updateBox(selected, { labels: { ...DEFAULT_STATUS_LABELS, ...(selectedBox.labels || {}), [key]: e.target.value } })}
                                className="h-8 text-sm"
                              />
                            </div>
                          ))}
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => updateBox(selected, { labels: { ...DEFAULT_STATUS_LABELS } })}>
                            Reset status labels
                          </Button>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Font</Label>
                          <select
                            value={selectedBox.fontFamily || 'monospace'}
                            onChange={(e) => updateBox(selected, { fontFamily: e.target.value })}
                            className="h-8 w-full px-2 rounded-md border border-input bg-background text-sm"
                          >
                            {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Font size (px)</Label>
                          <Input
                            type="number" min="4" max="32" step="0.5"
                            value={selectedBox.fontSize || 8}
                            onChange={(e) => updateBox(selected, { fontSize: clamp(Number(e.target.value) || 8, 4, 32) })}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Color {selected === 'text_status' && '(blank = auto)'}</Label>
                          <div className="flex items-center gap-2">
                            <ColorAlphaInput
                              color={selectedBox.color || (selected === 'text_status' ? '#22c55e' : '#0f172a')}
                              opacity={selectedBox.colorOpacity ?? 100}
                              onColorChange={(v) => updateBox(selected, { color: v })}
                              onOpacityChange={(v) => updateBox(selected, { colorOpacity: v })}
                              className="flex-1"
                            />
                            {selected === 'text_status' && selectedBox.color && (
                              <button type="button" onClick={() => updateBox(selected, { color: '' })} className="text-[10px] text-muted-foreground hover:text-foreground shrink-0">auto</button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Letter spacing (px)</Label>
                          <Input
                            type="number" min="-1" max="6" step="0.1"
                            value={selectedBox.letterSpacing ?? 0}
                            onChange={(e) => updateBox(selected, { letterSpacing: clamp(Number(e.target.value) || 0, -1, 6) })}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant={selectedBox.bold ? 'default' : 'outline'} className="h-7 px-3 text-xs flex-1" onClick={() => updateBox(selected, { bold: !selectedBox.bold })}>Bold</Button>
                        <Button type="button" size="sm" variant={selectedBox.uppercase ? 'default' : 'outline'} className="h-7 px-3 text-xs flex-1" onClick={() => updateBox(selected, { uppercase: !selectedBox.uppercase })}>Uppercase</Button>
                        <Button type="button" size="sm" variant={selectedBox.visible !== false ? 'default' : 'outline'} className="h-7 px-3 text-xs flex-1" onClick={() => updateBox(selected, { visible: selectedBox.visible === false })}>
                          {selectedBox.visible !== false ? 'Shown' : 'Hidden'}
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Alignment</Label>
                        <div className="flex items-center gap-1">
                          {ALIGN_OPTIONS.map((a) => (
                            <Button key={a} type="button" size="sm" variant={(selectedBox.align || 'left') === a ? 'default' : 'outline'} className="h-7 px-3 text-xs capitalize flex-1" onClick={() => updateBox(selected, { align: a })}>
                              {a}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedDef?.type === 'panel' && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="space-y-1">
                        <Label className="text-xs">Background</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={selectedBox.bgColor || '#ffffff'}
                            onChange={(e) => updateBox(selected, { bgColor: e.target.value })}
                            className="h-8 w-10 rounded border border-input bg-transparent cursor-pointer shrink-0"
                          />
                          <input
                            type="range" min="0" max="100"
                            value={selectedBox.bgOpacity ?? 92}
                            onChange={(e) => updateBox(selected, { bgOpacity: Number(e.target.value) })}
                            className="flex-1 accent-primary"
                          />
                          <span className="text-xs font-mono w-10 text-right shrink-0">{selectedBox.bgOpacity ?? 92}%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Corner radius (px)</Label>
                          <Input type="number" min="0" max="40" value={selectedBox.borderRadius ?? 2} onChange={(e) => updateBox(selected, { borderRadius: clamp(Number(e.target.value) || 0, 0, 40) })} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Border width (px)</Label>
                          <Input type="number" min="0" max="8" value={selectedBox.borderWidth ?? 0} onChange={(e) => updateBox(selected, { borderWidth: clamp(Number(e.target.value) || 0, 0, 8) })} className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Border color</Label>
                        <ColorAlphaInput
                          color={selectedBox.borderColor || '#000000'}
                          opacity={selectedBox.borderOpacity ?? 100}
                          onColorChange={(v) => updateBox(selected, { borderColor: v })}
                          onOpacityChange={(v) => updateBox(selected, { borderOpacity: v })}
                        />
                        <span className="text-xs text-muted-foreground">Only shows when border width is above 0.</span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">Drag the box on the photo above to move it, or drag its bottom-right handle to resize. You can also type exact values here.</p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Select a placed control on the left, or click one marked "+ add" to drop it onto the photo.</div>
              )}
            </Card>
          </div>

          {unmapped.length > 0 && (
            <p className="text-xs text-warning">Not yet placed: {unmapped.map((c) => c.label).join(', ')}. These still work using the built-in default position until you place and save them here.</p>
          )}
        </>
      )}
    </div>
  );
}
