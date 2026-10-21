import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Cpu, SlidersHorizontal } from "lucide-react";
import EquipmentStats from "@/components/equipment/EquipmentStats";
import EquipmentCard from "@/components/equipment/EquipmentCard";
import EquipmentDialog from "@/components/equipment/EquipmentDialog";
import { EQUIPMENT_TYPES, EQUIPMENT_STATUSES, EQUIPMENT_LOCATIONS } from "@/components/equipment/constants";
import TooltipHint from "@/components/ui/TooltipHint";

export default function Equipment() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (u) {
        const rows = await base44.entities.Equipment.filter({ created_by_id: u.id }, "-updated_date", 500).catch(() => []);
        setItems(rows || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    let timer = null;
    const scheduleRefresh = async () => {
      if (timer) return;
      timer = setTimeout(async () => {
        timer = null;
        try {
          if (user?.id) {
            const rows = await base44.entities.Equipment.filter({ created_by_id: user.id }, "-updated_date", 500).catch(() => []);
            setItems(rows || []);
          }
        } catch (e) { console.error(e); }
      }, 800);
    };
    // Every member's equipment changes reach every open Equipment page; only
    // this member's own items change this list.
    const unsub = base44.entities.Equipment.subscribe((event) => {
      const row = event?.data;
      if (row && !row._oversize && user?.id && row.created_by_id !== user.id) return;
      scheduleRefresh();
    });
    return () => { if (unsub) unsub(); if (timer) clearTimeout(timer); };
  }, [user?.id]);

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.manufacturer?.toLowerCase().includes(q) ||
        i.model?.toLowerCase().includes(q) ||
        i.serial_number?.toLowerCase().includes(q) ||
        i.asset_number?.toLowerCase().includes(q) ||
        i.callsign?.toLowerCase().includes(q) ||
        i.current_borrower_name?.toLowerCase().includes(q) ||
        i.current_borrower_callsign?.toLowerCase().includes(q)
      );
    }
    if (filterType) result = result.filter(i => i.type === filterType);
    if (filterStatus) result = result.filter(i => i.status === filterStatus);
    if (filterLocation) result = result.filter(i => i.location === filterLocation);
    return result;
  }, [items, search, filterType, filterStatus, filterLocation]);

  const hasFilters = filterType || filterStatus || filterLocation;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold flex items-center gap-2">Equipment Manager <TooltipHint>Keep track of your radios and other gear, including condition, availability, location, inventory details, and assigned callsigns.</TooltipHint></h1>
          <p className="text-muted-foreground mt-1 text-sm">Track your radios, antennas, and gear — what you have, where it is, who borrowed it.</p>
        </div>
        <Button title="Add a radio, antenna, accessory, or other equipment item to your inventory." onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> Add Equipment</Button>
      </div>

      <EquipmentStats items={items} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            title="Search your equipment by name, manufacturer, model, serial number, callsign, or borrower." placeholder="Search by name, manufacturer, model, serial, callsign, borrower…"
            className="pl-10"
          />
        </div>
        <Button variant="outline" title="Show or hide equipment filters." onClick={() => setShowFilters(f => !f)}>
          <SlidersHorizontal className="w-4 h-4 mr-2" /> Filters
        </Button>
        {hasFilters && (
          <Button variant="ghost" title="Clear all equipment filters." onClick={() => { setFilterType(""); setFilterStatus(""); setFilterLocation(""); }}>
            Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/40 rounded-xl p-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Equipment Type <TooltipHint>Limit the equipment list to one type, such as a radio, antenna, or accessory.</TooltipHint></label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm mt-1">
              <option value="">All Types</option>
              {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Status <TooltipHint>Filter by whether equipment is available, in use, in the shop, or otherwise marked in your inventory.</TooltipHint></label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm mt-1">
              <option value="">All Statuses</option>
              {EQUIPMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Location <TooltipHint>Filter equipment by its stored location, such as Home, Vehicle, Go-bag, or Shop.</TooltipHint></label>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm mt-1">
              <option value="">All Locations</option>
              {EQUIPMENT_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <Cpu className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {items.length === 0 ? "No equipment tracked yet. Add your radios, antennas, and accessories." : "No equipment matches your filters."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => <EquipmentCard key={item.id} item={item} />)}
        </div>
      )}

      <EquipmentDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} />
    </div>
  );
}