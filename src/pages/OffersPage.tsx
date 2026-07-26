/**
 * Legacy /trips/:id/offers route — keep desk work on Dispatch waterfall.
 */
import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

export default function OffersPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!id) return
    const qs = new URLSearchParams()
    qs.set('drawer', 'offers')
    qs.set('focus', id)
    if (searchParams.get('add') === '1') qs.set('add', '1')
    if (searchParams.get('update') === '1') qs.set('update', '1')
    navigate(`/dispatch?${qs.toString()}`, { replace: true })
  }, [id, navigate, searchParams])

  return (
    <div className="p-8 text-sm text-muted">
      Opening in Dispatch center…
      {id ? (
        <div className="mt-2">
          <Link
            className="text-gold"
            to={`/dispatch?drawer=offers&focus=${id}`}
          >
            Continue →
          </Link>
        </div>
      ) : null}
    </div>
  )
}
