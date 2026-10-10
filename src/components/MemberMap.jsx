import { useEffect, useRef, useState } from "react";
import { memberLocations } from "../lib/auth";

const POLL_MS = 10000;
const STYLE = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Members who chose to show their location, on a map. You see them only while you show yours too.
export default function MemberMap({ showing, myPos, onShow }) {
  const el = useRef(null), map = useRef(null), lib = useRef(null);
  const markers = useRef(new Map()), mine = useRef(null), fitted = useRef(false);
  const [others, setOthers] = useState([]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ml = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!alive || !el.current) return;
      lib.current = ml;
      map.current = new ml.Map({ container: el.current, style: STYLE, center: [-98.5, 39.8], zoom: 3 });
      map.current.addControl(new ml.NavigationControl(), "top-right");
      setReady(true);
    })().catch((e) => setError(e?.message || "The map could not load."));
    return () => { alive = false; map.current?.remove(); map.current = null; markers.current.clear(); mine.current = null; };
  }, []);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await memberLocations();
        if (stop) return;
        setLocked(!!r?.locked); setOthers(r?.locations || []); setError("");
      } catch (e) { if (!stop) setError(e?.message || "Could not load locations."); }
    };
    poll(); const t = setInterval(poll, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [showing]);

  useEffect(() => {
    const ml = lib.current, m = map.current;
    if (!ml || !m) return;
    const live = new Set(others.map((o) => o.key));
    for (const [k, mk] of markers.current) if (!live.has(k)) { mk.remove(); markers.current.delete(k); }
    for (const o of others) {
      const label = o.callsign || o.displayName;
      let mk = markers.current.get(o.key);
      if (!mk) {
        const dot = document.createElement("div"); dot.className = "rnpin"; dot.textContent = label;
        mk = new ml.Marker({ element: dot }).setLngLat([o.lng, o.lat]).addTo(m);
        markers.current.set(o.key, mk);
      } else mk.setLngLat([o.lng, o.lat]);
    }
    if (myPos) {
      if (!mine.current) { const dot = document.createElement("div"); dot.className = "rnpin me"; dot.textContent = "You"; mine.current = new ml.Marker({ element: dot }).setLngLat([myPos.lng, myPos.lat]).addTo(m); }
      else mine.current.setLngLat([myPos.lng, myPos.lat]);
    }
    if (!fitted.current && (others.length || myPos)) {
      fitted.current = true;
      const b = new ml.LngLatBounds();
      others.forEach((o) => b.extend([o.lng, o.lat])); if (myPos) b.extend([myPos.lng, myPos.lat]);
      m.fitBounds(b, { padding: 60, maxZoom: 13, duration: 0 });
    }
  }, [others, myPos, ready]);

  return (
    <div className="rnmapwrap">
      {!showing && (
        <div className="rnmapnote">
          <strong>See other members on the map</strong>
          <p>Members who choose to show their location appear here, blurred to about 100 m. You see them only while you show yours too.</p>
          <button type="button" className="primary" onClick={onShow}>Show my location to other members</button>
        </div>
      )}
      {showing && locked && <div className="rnmapnote"><p>Waiting for your own location to be sent. Make sure the radio is connected and location is allowed.</p></div>}
      {error && <div className="error">{error}</div>}
      {showing && !locked && <div className="rnmapcount">{others.length} other member{others.length === 1 ? "" : "s"} showing</div>}
      <div ref={el} className="rnmap" />
    </div>
  );
}
