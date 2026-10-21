// Native color swatch + opacity slider, matching the layout the Radio Layout
// Editor's background-panel opacity control already established. Callers pass
// color/opacity as two separate values; how those get stored (as two sibling
// fields, or combined into one hex string via src/lib/colorAlpha.js) is up to
// the caller.
export default function ColorAlphaInput({ color, opacity = 100, onColorChange, onOpacityChange, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="color"
        value={color || '#000000'}
        onChange={(e) => onColorChange(e.target.value)}
        className="h-8 w-10 rounded border border-input bg-transparent cursor-pointer shrink-0"
      />
      <input
        type="range"
        min="0"
        max="100"
        value={opacity}
        onChange={(e) => onOpacityChange(Number(e.target.value))}
        className="flex-1 accent-primary"
        title={`Opacity: ${opacity}%`}
      />
      <span className="text-xs font-mono w-10 text-right shrink-0 text-muted-foreground">{opacity}%</span>
    </div>
  );
}
