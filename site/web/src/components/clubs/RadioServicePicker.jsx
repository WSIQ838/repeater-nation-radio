const OPTIONS = ['GMRS', 'HAM'];

// Toggle pair for "which radio service(s) is this club for" — a club can be
// GMRS, HAM, or both, but never zero (falls back to the last-checked one).
export default function RadioServicePicker({ value, onChange }) {
  const toggle = (service) => {
    const has = value.includes(service);
    if (has && value.length === 1) return; // keep at least one selected
    onChange(has ? value.filter((s) => s !== service) : [...value, service]);
  };

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 bg-muted/30">
      {OPTIONS.map((service) => (
        <button
          key={service}
          type="button"
          onClick={() => toggle(service)}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            value.includes(service)
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {service}
        </button>
      ))}
    </div>
  );
}
