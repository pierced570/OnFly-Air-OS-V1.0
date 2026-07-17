import {
  OPERATOR_DOC_KINDS,
  OPERATOR_DOC_LABELS,
  docStatus,
  type OperatorCompliance,
  type OperatorDocKind,
} from '@/lib/operatorComplianceStore'

const STATUS_STYLE: Record<ReturnType<typeof docStatus>, string> = {
  missing: 'text-muted',
  ok: 'text-onplan',
  expired: 'text-late',
  no_expiry: 'text-gold',
}

const STATUS_LABEL: Record<ReturnType<typeof docStatus>, string> = {
  missing: 'Missing',
  ok: 'Current',
  expired: 'Expired',
  no_expiry: 'No expiry set',
}

export function OperatorDocSlots({
  compliance,
  onUpload,
  onExpiryChange,
}: {
  compliance: OperatorCompliance
  onUpload: (kind: OperatorDocKind, file: File) => void
  onExpiryChange: (kind: OperatorDocKind, expiresOn: string) => void
}) {
  return (
    <div className="space-y-4">
      {OPERATOR_DOC_KINDS.map((kind) => {
        const slot = compliance.docs[kind]
        const status = docStatus(slot)
        return (
          <div
            key={kind}
            className="rounded-md border border-border bg-surface-2/40 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-cream">
                {OPERATOR_DOC_LABELS[kind]}
              </div>
              <span className={`text-xs uppercase tracking-wide ${STATUS_STYLE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-muted">
                File
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                  className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-gold/20 file:px-2 file:py-1 file:text-gold"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onUpload(kind, f)
                  }}
                />
                {slot.fileName && (
                  <span className="mt-1 block text-xs text-cream">
                    {slot.previewUrl ? (
                      <a
                        href={slot.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold hover:text-gold-lt"
                      >
                        {slot.fileName}
                      </a>
                    ) : (
                      slot.fileName
                    )}
                    {slot.sizeBytes != null && (
                      <span className="text-muted">
                        {' '}
                        · {(slot.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </span>
                )}
              </label>
              <label className="block text-xs text-muted">
                Expires
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-border bg-ink px-2 py-1.5 text-sm text-cream"
                  value={slot.expiresOn ?? ''}
                  onChange={(e) => onExpiryChange(kind, e.target.value)}
                />
              </label>
            </div>
            {kind === 'coi' && (
              <p className="mt-2 text-[11px] text-muted">
                When this date passes we email the operator for an updated COI.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
