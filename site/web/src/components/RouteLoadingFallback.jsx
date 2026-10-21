export default function RouteLoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 dark:border-slate-700 dark:border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
}