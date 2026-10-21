// Small "GMRS" / "HAM" pills shown wherever a club's radio service(s) need
// to be visible. Clubs created before this field existed have no
// `radio_services` value — treat that as GMRS-only (the platform's original,
// only supported service) rather than showing nothing.
export default function RadioServiceBadges({ services, className = '' }) {
  const list = services?.length ? services : ['GMRS'];
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {list.map((s) => (
        <span
          key={s}
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            s === 'HAM'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              : 'bg-primary/15 text-primary'
          }`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}
