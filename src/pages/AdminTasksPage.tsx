const DEMO_TASKS = [
  { entity: 'aircraft', field: 'door dims', note: 'Verify cargo door on King Air conversions' },
  { entity: 'operator', field: 'block rates', note: 'Collect block rates — top 15' },
  { entity: 'operator', field: 'consent_sms', note: 'TCPA consent for offer pings' },
]

export default function AdminTasksPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold text-cream">NEEDS-INFO tasks</h1>
      <ul className="space-y-2">
        {DEMO_TASKS.map((t) => (
          <li key={t.field} className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-gold">{t.entity}</div>
            <div className="text-cream">{t.field}</div>
            <div className="text-sm text-muted">{t.note}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
