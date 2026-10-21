import { useEffect, useRef } from 'react';
import { useMapEvents } from 'react-leaflet';

/**
 * Tracks map bounds and zoom level, reporting them to the parent via callbacks.
 * Debounces bounds changes so dragging doesn't fire a query on every frame.
 * Also exposes the map instance for imperative flyTo calls.
 */
export default function MapBoundsTracker({ onBoundsChange, onZoomChange, onMapReady, debounceMs = 350 }) {
  const timerRef = useRef(null);

  const map = useMapEvents({
    moveend: () => {
      onZoomChange(map.getZoom());
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const b = map.getBounds();
        onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      }, debounceMs);
    },
  });

  useEffect(() => {
    onMapReady(map);
    onZoomChange(map.getZoom());

    const reportBounds = () => {
      try {
        const b = map.getBounds();
        onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      } catch {
        // Map pane not laid out yet — retry once the map is ready
        map.once('load moveend', reportBounds);
      }
    };
    reportBounds();
  }, [map]);

  return null;
}