/** Skeleton shown while a server-rendered page streams in. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-20 animate-pulse border border-line bg-surface" />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-64 animate-pulse border border-line bg-surface" />
        <div className="h-64 animate-pulse border border-line bg-surface" />
      </div>
    </div>
  )
}
