export function PageLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Cargando">
      <div className="h-8 w-48 rounded bg-neutral-200" />
      <div className="h-40 rounded-xl bg-neutral-200" />
      <div className="h-40 rounded-xl bg-neutral-200" />
    </div>
  );
}
