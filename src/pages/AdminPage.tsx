export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Admin</h1>
        <p className="mt-1 text-sm text-muted">
          Add Operator / Client / FBO wizards arrive in Chunk 6.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {['Add Operator', 'Add Client', 'Add FBO'].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-border border-dashed bg-surface p-5 opacity-60"
          >
            <div className="text-sm font-medium text-cream">{label}</div>
            <div className="mt-1 text-xs text-muted">Coming in Chunk 6</div>
          </div>
        ))}
      </div>
    </div>
  )
}
