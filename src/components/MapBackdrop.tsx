/**
 * Full-bleed animated US map backdrop (doc 02).
 * Static SVG paths + CSS/SMIL — no runtime map libraries.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import portalMapData from '@/data/portalMapData.json'
import {
  MAP_VIEWBOX,
  arcControl,
  arcPathD,
  bezierPoint,
  bezierSubcurve,
  bezierTangent,
  clampLabelX,
  formatHubLabel,
  formatNmLabel,
  nextQuotePoints,
  projectLonLat,
  quoteHint,
  resolveMapClick,
  telemetryFlipLeft,
  type MapAirport,
  type MapProjection,
  type QuoteClickPoint,
} from '@/domain/portalMap'

export type MapBackdropAirport = MapAirport

export type MapBackdropPoint = {
  x: number
  y: number
  label?: string
  lat?: number
  lon?: number
  icao?: string
}

export type MapBackdropFlight = {
  from: string | MapAirport
  to: string | MapAirport
  /** Ambient loop duration (demo flights). */
  seconds?: number
  /** Ambient SMIL/CSS begin offset. */
  offset?: number
  /** Live progress 0..1 along the arc. */
  progress?: number
  telemetry?: string
}

export type MapBackdropProps = {
  viewBox?: string
  mode: 'ambient' | 'interactive'
  /** 1 normally; 0.35 when a trip/quote is shown (transition .4s). */
  ambientOpacity?: number
  selectedRoute?: {
    from: MapAirport
    to: MapAirport
    progress?: number
    telemetry?: string
  }
  quotePoints?: {
    a?: MapBackdropPoint
    b?: MapBackdropPoint
    nm?: number
  }
  liveFlights?: MapBackdropFlight[]
  onMapClick?: (p: { lat: number; lon: number; icao?: string }) => void
  /** Plane glyph scale — login ~0.9, portal ~0.75, phone ~1. */
  planeScale?: number
  /** Show soft-quote hint chip (interactive). Default true. */
  showQuoteHint?: boolean
  className?: string
  style?: CSSProperties
}

type Twinkle = {
  lat: number
  lon: number
  r: number
  dur: number
  delay: number
  gold: boolean
  halo: boolean
  near?: boolean
}

type DemoFlight = { from: string; to: string; seconds: number; offset: number }

const projection = portalMapData.us_map.projection as MapProjection
const outline = portalMapData.us_map.outline as string
const borders = portalMapData.us_map.borders as string
const airports = portalMapData.airports as MapAirport[]
const twinklePoints = portalMapData.twinkles.points as Twinkle[]
const demoFlights = portalMapData.flights.flights as DemoFlight[]
const planePath = portalMapData.flights.plane_path as string

const airportByIcao = new Map(airports.map((a) => [a.icao, a]))

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return reduced
}

function useCompactMap(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return compact
}

/** Login framing: tall/narrow (< 0.9) → East Coast; else coast-to-coast. */
function useAmbientLoginViewBox(enabled: boolean): string {
  const [vb, setVb] = useState<string>(MAP_VIEWBOX.loginWide)
  useEffect(() => {
    if (!enabled) return
    const frame = () => {
      const tall = window.innerWidth / window.innerHeight < 0.9
      setVb(tall ? MAP_VIEWBOX.loginPhone : MAP_VIEWBOX.loginWide)
    }
    frame()
    window.addEventListener('resize', frame)
    return () => window.removeEventListener('resize', frame)
  }, [enabled])
  return vb
}

function resolveEndpoint(
  ref: string | MapAirport,
): MapAirport | null {
  if (typeof ref === 'string') return airportByIcao.get(ref) ?? null
  return ref
}

function clientToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function AmbientFlightLayer(props: {
  flight: DemoFlight
  reducedMotion: boolean
  planeScale: number
  showEndpoints: boolean
  uid: string
}) {
  const from = airportByIcao.get(props.flight.from)
  const to = airportByIcao.get(props.flight.to)
  if (!from || !to) return null

  const a = { x: from.x, y: from.y }
  const b = { x: to.x, y: to.y }
  const c = arcControl(a, b)
  const d = arcPathD(a, b, c)
  const { seconds, offset } = props.flight
  const midY = (a.y + b.y) / 2
  const labelAbove = c.y < midY

  return (
    <g className="ofa-map-flight" data-from={from.icao} data-to={to.icao}>
      <path
        d={d}
        fill="none"
        stroke="rgba(227,179,65,.24)"
        strokeWidth={1}
        strokeDasharray="2 5"
        pointerEvents="none"
      />
      {!props.reducedMotion && (
        <>
          <path
            d={d}
            fill="none"
            pathLength={1000}
            stroke="#E3B341"
            strokeWidth={4.5}
            strokeOpacity={0.32}
            strokeLinecap="round"
            strokeDasharray="170 3000"
            filter={`url(#${props.uid}-tailBlur)`}
            style={{
              animation: `ofaTail ${seconds}s linear ${offset}s infinite`,
            }}
            pointerEvents="none"
          />
          <path
            d={d}
            fill="none"
            pathLength={1000}
            stroke="#F2CF6B"
            strokeWidth={1.45}
            strokeLinecap="round"
            strokeDasharray="170 3000"
            style={{
              animation: `ofaTail ${seconds}s linear ${offset}s infinite`,
            }}
            pointerEvents="none"
          />
          <g pointerEvents="none">
            <animateMotion
              dur={`${seconds}s`}
              begin={`${offset}s`}
              repeatCount="indefinite"
              rotate="auto"
              path={d}
            />
            <circle r={11.5} fill="rgba(227,179,65,.22)" />
            <g transform={`scale(${props.planeScale})`}>
              <path
                d={planePath}
                fill="#F7F2E3"
                stroke="#0C0C0E"
                strokeWidth={0.6}
              />
            </g>
          </g>
        </>
      )}
      {props.showEndpoints && (
        <>
          {[from, to].map((ap) => {
            const labelY = labelAbove ? ap.y + 16 : ap.y - 10
            return (
              <g key={ap.icao} pointerEvents="none">
                <circle cx={ap.x} cy={ap.y} r={3.2} fill="#E3B341" />
                {!props.reducedMotion && (
                  <circle
                    cx={ap.x}
                    cy={ap.y}
                    r={3}
                    fill="none"
                    stroke="#E3B341"
                    strokeWidth={1.2}
                  >
                    <animate
                      attributeName="r"
                      values="3;15"
                      dur="2.6s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values=".9;0"
                      dur="2.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <text
                  x={ap.x}
                  y={labelY}
                  textAnchor="middle"
                  fill="rgba(247,242,227,.7)"
                  style={{
                    fontFamily: 'var(--ofa-mono)',
                    fontSize: 8.5,
                    letterSpacing: '0.03em',
                  }}
                >
                  {ap.icao}
                </text>
              </g>
            )
          })}
        </>
      )}
    </g>
  )
}

function LiveFlightGlyph(props: {
  flight: MapBackdropFlight
  planeScale: number
  reducedMotion: boolean
}) {
  const from = resolveEndpoint(props.flight.from)
  const to = resolveEndpoint(props.flight.to)
  if (!from || !to) return null
  const a = { x: from.x, y: from.y }
  const b = { x: to.x, y: to.y }
  const c = arcControl(a, b)
  const t = Math.min(1, Math.max(0, props.flight.progress ?? 0))
  const pt = bezierPoint(a, c, b, t)
  const tan = bezierTangent(a, c, b, t)
  const angle = (Math.atan2(tan.y, tan.x) * 180) / Math.PI
  const flip = telemetryFlipLeft(pt.x)
  const tagX = flip ? pt.x - 14 : pt.x + 14
  const tagAnchor = flip ? 'end' : 'start'

  return (
    <g pointerEvents="none">
      <g transform={`translate(${pt.x} ${pt.y}) rotate(${angle})`}>
        {!props.reducedMotion && (
          <circle r={12} fill="none" stroke="#E3B341" strokeWidth={1.2}>
            <animate
              attributeName="r"
              values="6;14"
              dur="2.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values=".85;0"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </circle>
        )}
        <circle r={10} fill="rgba(227,179,65,.2)" />
        <g transform={`scale(${props.planeScale})`}>
          <path
            d={planePath}
            fill="#F7F2E3"
            stroke="#0C0C0E"
            strokeWidth={0.6}
          />
        </g>
      </g>
      {props.flight.telemetry && (
        <g transform={`translate(${tagX} ${pt.y - 18})`}>
          <rect
            x={flip ? -118 : 0}
            y={-10}
            width={118}
            height={18}
            rx={4}
            fill="rgba(12,12,14,.88)"
            stroke="rgba(227,179,65,.35)"
          />
          <text
            x={flip ? -8 : 8}
            y={3}
            textAnchor={tagAnchor}
            fill="#E3B341"
            style={{
              fontFamily: 'var(--ofa-mono)',
              fontSize: 9,
              letterSpacing: '0.03em',
            }}
          >
            {props.flight.telemetry}
          </text>
        </g>
      )}
    </g>
  )
}

function SelectedRouteOverlay(props: {
  from: MapAirport
  to: MapAirport
  progress?: number
  telemetry?: string
  planeScale: number
  reducedMotion: boolean
}) {
  const a = { x: props.from.x, y: props.from.y }
  const b = { x: props.to.x, y: props.to.y }
  const c = arcControl(a, b)
  const d = arcPathD(a, b, c)
  const progress = props.progress
  const hasProgress =
    typeof progress === 'number' && progress >= 0 && Number.isFinite(progress)
  const t = hasProgress ? Math.min(1, Math.max(0, progress)) : undefined
  const flown =
    t !== undefined ? bezierSubcurve(a, c, b, t) : null
  const flownD = flown
    ? arcPathD(flown.a, flown.b, flown.c)
    : null

  const labelFromX = clampLabelX(a.x)
  const labelToX = clampLabelX(b.x)

  return (
    <g className="ofa-map-selected" pointerEvents="none">
      <path
        d={d}
        fill="none"
        stroke="rgba(201,162,39,.35)"
        strokeWidth={1.4}
        strokeDasharray="4 7"
      />
      {flownD && (
        <>
          <path
            d={flownD}
            fill="none"
            stroke="#E3B341"
            strokeWidth={4}
            strokeOpacity={0.35}
            filter="blur(2.5px)"
          />
          <path
            d={flownD}
            fill="none"
            stroke="#E3B341"
            strokeWidth={1.8}
          />
        </>
      )}
      <circle cx={a.x} cy={a.y} r={4} fill="#E3B341" />
      <circle
        cx={b.x}
        cy={b.y}
        r={4}
        fill="none"
        stroke="#E3B341"
        strokeWidth={1.5}
      />
      <g transform={`translate(${labelFromX} ${a.y + 18})`}>
        <rect
          x={-4}
          y={-12}
          width={Math.max(88, formatHubLabel(props.from).length * 6.2)}
          height={16}
          rx={3}
          fill="rgba(12,12,14,.9)"
        />
        <text
          x={2}
          y={0}
          fill="#F7F2E3"
          style={{
            fontFamily: 'var(--ofa-mono)',
            fontSize: 10.5,
            letterSpacing: '0.03em',
          }}
        >
          {formatHubLabel(props.from)}
        </text>
      </g>
      <g transform={`translate(${labelToX} ${b.y + 18})`}>
        <rect
          x={-4}
          y={-12}
          width={Math.max(88, formatHubLabel(props.to).length * 6.2)}
          height={16}
          rx={3}
          fill="rgba(12,12,14,.9)"
        />
        <text
          x={2}
          y={0}
          fill="#F7F2E3"
          style={{
            fontFamily: 'var(--ofa-mono)',
            fontSize: 10.5,
            letterSpacing: '0.03em',
          }}
        >
          {formatHubLabel(props.to)}
        </text>
      </g>
      {t !== undefined && (
        <LiveFlightGlyph
          flight={{
            from: props.from,
            to: props.to,
            progress: t,
            telemetry: props.telemetry,
          }}
          planeScale={props.planeScale}
          reducedMotion={props.reducedMotion}
        />
      )}
    </g>
  )
}

function QuoteOverlay(props: {
  a: MapBackdropPoint
  b?: MapBackdropPoint
  nm?: number
  reducedMotion: boolean
}) {
  const a = { x: props.a.x, y: props.a.y }
  const b = props.b ? { x: props.b.x, y: props.b.y } : null
  const c = b ? arcControl(a, b) : null
  const d = b && c ? arcPathD(a, b, c) : null
  const mid = b && c ? bezierPoint(a, c, b, 0.5) : null

  return (
    <g className="ofa-map-quote" pointerEvents="none">
      {d && (
        <path
          d={d}
          fill="none"
          stroke="#E3B341"
          strokeWidth={1.6}
          strokeDasharray="6 6"
          style={
            props.reducedMotion
              ? undefined
              : { animation: 'ofaDash 1.2s linear infinite' }
          }
        />
      )}
      <circle cx={a.x} cy={a.y} r={4.2} fill="#E3B341" />
      <circle
        cx={a.x}
        cy={a.y}
        r={10}
        fill="none"
        stroke="#E3B341"
        strokeOpacity={0.6}
        strokeWidth={1.2}
      />
      <g transform={`translate(${a.x} ${a.y + 22})`}>
        <rect
          x={-36}
          y={-11}
          width={72}
          height={16}
          rx={3}
          fill="rgba(201,162,39,.92)"
        />
        <text
          textAnchor="middle"
          y={1}
          fill="#0C0C0E"
          style={{
            fontFamily: 'var(--ofa-mono)',
            fontSize: 9.5,
            letterSpacing: '0.03em',
          }}
        >
          {props.a.label ?? props.a.icao ?? 'A'}
        </text>
      </g>
      {b && (
        <>
          <circle
            cx={b.x}
            cy={b.y}
            r={4.2}
            fill="none"
            stroke="#E3B341"
            strokeWidth={1.6}
          />
          <circle
            cx={b.x}
            cy={b.y}
            r={10}
            fill="none"
            stroke="#E3B341"
            strokeOpacity={0.6}
            strokeWidth={1.2}
          />
          <g transform={`translate(${b.x} ${b.y + 22})`}>
            <rect
              x={-36}
              y={-11}
              width={72}
              height={16}
              rx={3}
              fill="rgba(201,162,39,.92)"
            />
            <text
              textAnchor="middle"
              y={1}
              fill="#0C0C0E"
              style={{
                fontFamily: 'var(--ofa-mono)',
                fontSize: 9.5,
                letterSpacing: '0.03em',
              }}
            >
              {props.b?.label ?? props.b?.icao ?? 'B'}
            </text>
          </g>
        </>
      )}
      {mid && props.nm !== undefined && (
        <g transform={`translate(${mid.x} ${mid.y})`}>
          <rect
            x={-42}
            y={-11}
            width={84}
            height={20}
            rx={10}
            fill="rgba(12,12,14,.9)"
            stroke="rgba(227,179,65,.4)"
          />
          <text
            textAnchor="middle"
            y={4}
            fill="#E3B341"
            style={{
              fontFamily: 'var(--ofa-mono)',
              fontSize: 11,
              letterSpacing: '0.03em',
            }}
          >
            {formatNmLabel(props.nm)}
          </text>
        </g>
      )}
    </g>
  )
}

export function MapBackdrop(props: MapBackdropProps) {
  const {
    mode,
    viewBox: viewBoxProp,
    ambientOpacity = 1,
    selectedRoute,
    quotePoints: quotePointsProp,
    liveFlights,
    onMapClick,
    planeScale: planeScaleProp,
    showQuoteHint = true,
    className,
    style,
  } = props

  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const compact = useCompactMap()
  const ambientAutoVb = useAmbientLoginViewBox(
    mode === 'ambient' && viewBoxProp === undefined,
  )
  const viewBox =
    viewBoxProp ??
    (mode === 'interactive' ? MAP_VIEWBOX.portalDesktop : ambientAutoVb)
  const planeScale =
    planeScaleProp ??
    (compact ? 1 : mode === 'interactive' ? 0.75 : 0.9)

  const [internalQuote, setInternalQuote] = useState<{
    a?: QuoteClickPoint
    b?: QuoteClickPoint
    nm?: number
  }>({})

  const quoteControlled = quotePointsProp !== undefined
  const quote = quoteControlled
    ? {
        a: quotePointsProp.a,
        b: quotePointsProp.b,
        nm: quotePointsProp.nm,
      }
    : internalQuote

  const twinkles = compact ? twinklePoints.slice(0, 80) : twinklePoints
  const flights = compact ? demoFlights.slice(0, 5) : demoFlights
  const showHubs = mode === 'interactive'
  const showLoginEndpoints = mode === 'ambient'

  const handleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (mode !== 'interactive') return
    const svg = svgRef.current
    if (!svg) return
    const local = clientToSvgPoint(svg, e.clientX, e.clientY)
    if (!local) return
    const resolved = resolveMapClick(local, airports, projection)
    onMapClick?.({
      lat: resolved.lat,
      lon: resolved.lon,
      icao: resolved.icao,
    })
    if (!quoteControlled) {
      setInternalQuote((prev) => nextQuotePoints(prev, resolved))
    }
  }

  const hint = quoteHint(quote)

  return (
    <div
      className={['ofa-map-backdrop', className].filter(Boolean).join(' ')}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#08080A',
        ...style,
      }}
      aria-hidden={mode === 'ambient' ? true : undefined}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        role={mode === 'interactive' ? 'img' : 'presentation'}
        aria-label={
          mode === 'interactive'
            ? 'United States map — click two points for a soft quote'
            : undefined
        }
        onClick={mode === 'interactive' ? handleClick : undefined}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: mode === 'interactive' ? 'crosshair' : 'default',
        }}
      >
        <defs>
          <radialGradient id={`${uid}-vignette`} cx="50%" cy="48%" r="62%">
            <stop offset="0%" stopColor="#141417" />
            <stop offset="100%" stopColor="#08080A" />
          </radialGradient>
          <pattern
            id={`${uid}-dotGrid`}
            width={16}
            height={16}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={0.6} fill="rgba(255,255,255,.05)" />
          </pattern>
          <pattern
            id={`${uid}-landDots`}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1} cy={1} r={0.75} fill="rgba(247,242,227,.2)" />
          </pattern>
          <filter
            id={`${uid}-coastGlow`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation={4} />
          </filter>
          <filter
            id={`${uid}-tailBlur`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation={3} />
          </filter>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E3B341" stopOpacity={0.65} />
            <stop offset="100%" stopColor="#E3B341" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* 1. Background vignette + dot grid */}
        <rect
          x={0}
          y={0}
          width={1440}
          height={900}
          fill={`url(#${uid}-vignette)`}
          pointerEvents="none"
        />
        <rect
          x={0}
          y={0}
          width={1440}
          height={900}
          fill={`url(#${uid}-dotGrid)`}
          pointerEvents="none"
        />

        {/* 2. Coast glow */}
        <path
          d={outline}
          fill="none"
          stroke="rgba(227,179,65,.34)"
          strokeWidth={6}
          filter={`url(#${uid}-coastGlow)`}
          pointerEvents="none"
        />

        {/* 3. Land fill */}
        <path d={outline} fill="#1D1D22" pointerEvents="none" />

        {/* 4. Land dots + coastline */}
        <path
          d={outline}
          fill={`url(#${uid}-landDots)`}
          stroke="rgba(227,179,65,.5)"
          strokeWidth={1}
          pointerEvents="none"
        />

        {/* 5. State borders */}
        <path
          d={borders}
          fill="none"
          stroke="rgba(247,242,227,.15)"
          strokeWidth={0.7}
          pointerEvents="none"
        />

        {/* 6. Twinkles */}
        <g className="ofa-map-twinkles" pointerEvents="none">
          {twinkles.map((tw, i) => {
            const p = projectLonLat(tw.lon, tw.lat, projection)
            const fill = tw.gold ? '#E3B341' : '#F7F2E3'
            const anim = reducedMotion
              ? undefined
              : {
                  animation: `ofaTw ${tw.dur}s ease-in-out ${tw.delay}s infinite`,
                }
            return (
              <g key={i} style={anim}>
                {tw.halo && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={tw.r * 6}
                    fill={`url(#${uid}-glow)`}
                  />
                )}
                <circle cx={p.x} cy={p.y} r={tw.r * 1.5} fill={fill} />
              </g>
            )
          })}
        </g>

        {/* 7. Hub airports (portal / interactive) */}
        {showHubs && (
          <g className="ofa-map-hubs" pointerEvents="none">
            {airports.map((ap) => (
              <g key={ap.icao}>
                <circle
                  cx={ap.x}
                  cy={ap.y}
                  r={7}
                  fill="rgba(227,179,65,.18)"
                />
                <circle
                  cx={ap.x}
                  cy={ap.y}
                  r={2.2}
                  fill="rgba(247,242,227,.75)"
                />
                <text
                  x={ap.x + 6}
                  y={ap.y - 6}
                  fill="rgba(247,242,227,.42)"
                  style={{
                    fontFamily: 'var(--ofa-mono)',
                    fontSize: 9,
                    letterSpacing: '0.03em',
                  }}
                >
                  {ap.icao}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* 8. Ambient flights */}
        <g
          className="ofa-map-ambient"
          opacity={ambientOpacity}
          style={{ transition: 'opacity .4s ease' }}
          pointerEvents="none"
        >
          {flights.map((f) => (
            <AmbientFlightLayer
              key={`${f.from}-${f.to}-${f.offset}`}
              flight={f}
              reducedMotion={reducedMotion}
              planeScale={planeScale}
              showEndpoints={showLoginEndpoints}
              uid={uid}
            />
          ))}
          {liveFlights?.map((f, i) => (
            <LiveFlightGlyph
              key={`live-${i}`}
              flight={f}
              planeScale={planeScale}
              reducedMotion={reducedMotion}
            />
          ))}
        </g>

        {/* 9. Selected route / quote overlay */}
        {selectedRoute && (
          <SelectedRouteOverlay
            from={selectedRoute.from}
            to={selectedRoute.to}
            progress={selectedRoute.progress}
            telemetry={selectedRoute.telemetry}
            planeScale={planeScale}
            reducedMotion={reducedMotion}
          />
        )}
        {quote.a && (
          <QuoteOverlay
            a={quote.a}
            b={quote.b}
            nm={quote.nm}
            reducedMotion={reducedMotion}
          />
        )}
      </svg>

      {mode === 'interactive' && showQuoteHint && (
        <div
          className="ofa-map-hint"
          style={{
            position: 'absolute',
            top: 18,
            right: 22,
            padding: '8px 12px',
            borderRadius: 999,
            background: 'rgba(12,12,14,.72)',
            border: '1px solid rgba(255,255,255,.12)',
            color: 'rgba(247,242,227,.78)',
            font: '500 12px/1.2 var(--ofa-font)',
            letterSpacing: '-0.01em',
            pointerEvents: 'none',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

export { airports as mapBackdropAirports, MAP_VIEWBOX }
