/**
 * Bundled ICAO catalog with city/state for picker UX + geo/tz lookups.
 */

export type AirportInfo = {
  icao: string
  name: string
  city: string
  state: string
  lat: number
  lon: number
  tz: string
}

/** Label for dropdowns: "KCAK — Akron, OH · Akron-Canton Regional" */
export function formatAirportLabel(a: AirportInfo): string {
  const place = a.state ? `${a.city}, ${a.state}` : a.city
  return `${a.icao} — ${place} · ${a.name}`
}

export function formatAirportShort(a: AirportInfo): string {
  const place = a.state ? `${a.city}, ${a.state}` : a.city
  return `${a.icao} — ${place}`
}

type Row = [
  icao: string,
  name: string,
  city: string,
  state: string,
  lat: number,
  lon: number,
  tz: string,
]

const ROWS: Row[] = [
  ['KABE', 'Lehigh Valley Intl', 'Allentown', 'PA', 40.6521, -75.4404, 'America/New_York'],
  ['KADS', 'Addison', 'Dallas', 'TX', 32.9686, -96.8364, 'America/Chicago'],
  ['KAFW', 'Fort Worth Alliance', 'Fort Worth', 'TX', 32.9876, -97.3188, 'America/Chicago'],
  ['KAID', 'Anderson Municipal', 'Anderson', 'IN', 40.1086, -85.6128, 'America/Indiana/Indianapolis'],
  ['KAND', 'Anderson Regional', 'Anderson', 'SC', 34.4947, -82.7094, 'America/New_York'],
  ['KATL', 'Hartsfield-Jackson Atlanta', 'Atlanta', 'GA', 33.6407, -84.4277, 'America/New_York'],
  ['KAUS', 'Austin-Bergstrom', 'Austin', 'TX', 30.1945, -97.6699, 'America/Chicago'],
  ['KBDL', 'Bradley Intl', 'Windsor Locks', 'CT', 41.9389, -72.6832, 'America/New_York'],
  ['KBFI', 'Boeing Field', 'Seattle', 'WA', 47.53, -122.302, 'America/Los_Angeles'],
  ['KBHM', 'Birmingham-Shuttlesworth', 'Birmingham', 'AL', 33.5629, -86.7535, 'America/Chicago'],
  ['KBJJ', 'Wayne County', 'Wooster', 'OH', 40.8748, -81.8882, 'America/New_York'],
  ['KBNA', 'Nashville Intl', 'Nashville', 'TN', 36.1245, -86.6782, 'America/Chicago'],
  ['KBOS', 'Logan Intl', 'Boston', 'MA', 42.3656, -71.0096, 'America/New_York'],
  ['KBTR', 'Baton Rouge Metro', 'Baton Rouge', 'LA', 30.5329, -91.1496, 'America/Chicago'],
  ['KBWI', 'Baltimore/Washington Intl', 'Baltimore', 'MD', 39.1754, -76.6683, 'America/New_York'],
  ['KCAK', 'Akron-Canton Regional', 'Akron', 'OH', 40.9162, -81.4423, 'America/New_York'],
  ['KCGF', 'Cuyahoga County', 'Cleveland', 'OH', 41.5651, -81.4864, 'America/New_York'],
  ['KCHS', 'Charleston AFB/Intl', 'Charleston', 'SC', 32.8986, -80.0405, 'America/New_York'],
  ['KCLE', 'Cleveland Hopkins', 'Cleveland', 'OH', 41.4117, -81.8498, 'America/New_York'],
  ['KCLT', 'Charlotte Douglas', 'Charlotte', 'NC', 35.214, -80.9431, 'America/New_York'],
  ['KCMH', 'John Glenn Columbus', 'Columbus', 'OH', 39.998, -82.8919, 'America/New_York'],
  ['KCVG', 'Cincinnati/Northern Kentucky', 'Hebron', 'KY', 39.0488, -84.6678, 'America/New_York'],
  ['KDAL', 'Dallas Love Field', 'Dallas', 'TX', 32.8471, -96.8518, 'America/Chicago'],
  ['KDAY', 'James M Cox Dayton', 'Dayton', 'OH', 39.9024, -84.2194, 'America/New_York'],
  ['KDEN', 'Denver Intl', 'Denver', 'CO', 39.8561, -104.6737, 'America/Denver'],
  ['KDFW', 'Dallas/Fort Worth Intl', 'Dallas', 'TX', 32.8998, -97.0403, 'America/Chicago'],
  ['KDTW', 'Detroit Metro', 'Detroit', 'MI', 42.2162, -83.3554, 'America/Detroit'],
  ['KDNL', 'Daniel Field', 'Augusta', 'GA', 33.4665, -82.0394, 'America/New_York'],
  ['KEWR', 'Newark Liberty', 'Newark', 'NJ', 40.6895, -74.1745, 'America/New_York'],
  ['KFLL', 'Fort Lauderdale/Hollywood', 'Fort Lauderdale', 'FL', 26.0722, -80.1527, 'America/New_York'],
  ['KFWA', 'Fort Wayne Intl', 'Fort Wayne', 'IN', 40.9785, -85.1951, 'America/Indiana/Indianapolis'],
  ['KGRD', 'Greenwood County', 'Greenwood', 'SC', 34.2487, -82.1591, 'America/New_York'],
  ['KHFY', 'Greenwood Municipal', 'Greenwood', 'IN', 39.6297, -86.088, 'America/Indiana/Indianapolis'],
  ['KHHG', 'Huntington Municipal', 'Huntington', 'IN', 40.8534, -85.4572, 'America/Indiana/Indianapolis'],
  ['KHOU', 'William P Hobby', 'Houston', 'TX', 29.6454, -95.2789, 'America/Chicago'],
  ['KHUM', 'Houma-Terrebonne', 'Houma', 'LA', 29.5665, -90.6604, 'America/Chicago'],
  ['KIAD', 'Washington Dulles', 'Dulles', 'VA', 38.9531, -77.4565, 'America/New_York'],
  ['KIAH', 'George Bush Intercontinental', 'Houston', 'TX', 29.9902, -95.3368, 'America/Chicago'],
  ['KIND', 'Indianapolis Intl', 'Indianapolis', 'IN', 39.7173, -86.2944, 'America/Indiana/Indianapolis'],
  ['KILG', 'Wilmington / New Castle', 'Wilmington', 'DE', 39.6787, -75.6065, 'America/New_York'],
  ['KIOB', 'Mount Sterling-Montgomery', 'Mount Sterling', 'KY', 38.0581, -83.9796, 'America/New_York'],
  ['KJAX', 'Jacksonville Intl', 'Jacksonville', 'FL', 30.4941, -81.6879, 'America/New_York'],
  ['KJER', 'Jerome County', 'Jerome', 'ID', 42.7267, -114.456, 'America/Boise'],
  ['KJFK', 'John F Kennedy Intl', 'New York', 'NY', 40.6413, -73.7781, 'America/New_York'],
  ['KLAS', 'Harry Reid Intl', 'Las Vegas', 'NV', 36.084, -115.1537, 'America/Los_Angeles'],
  ['KLAX', 'Los Angeles Intl', 'Los Angeles', 'CA', 33.9416, -118.4085, 'America/Los_Angeles'],
  ['KLGA', 'LaGuardia', 'New York', 'NY', 40.7769, -73.874, 'America/New_York'],
  ['KMCI', 'Kansas City Intl', 'Kansas City', 'MO', 39.2976, -94.7139, 'America/Chicago'],
  ['KMCO', 'Orlando Intl', 'Orlando', 'FL', 28.4294, -81.309, 'America/New_York'],
  ['KMCN', 'Middle Georgia Regional', 'Macon', 'GA', 32.6928, -83.6492, 'America/New_York'],
  ['KMDW', 'Chicago Midway', 'Chicago', 'IL', 41.7868, -87.7524, 'America/Chicago'],
  ['KMEM', 'Memphis Intl', 'Memphis', 'TN', 35.0421, -89.9792, 'America/Chicago'],
  ['KMIA', 'Miami Intl', 'Miami', 'FL', 25.7959, -80.287, 'America/New_York'],
  ['KMKE', 'Milwaukee Mitchell', 'Milwaukee', 'WI', 42.9472, -87.8966, 'America/Chicago'],
  ['KMPO', 'Pocono Mountains Municipal', 'Mount Pocono', 'PA', 41.1375, -75.3789, 'America/New_York'],
  ['KMSP', 'Minneapolis-St Paul', 'Minneapolis', 'MN', 44.882, -93.2218, 'America/Chicago'],
  ['KMSY', 'Louis Armstrong New Orleans', 'New Orleans', 'LA', 29.9934, -90.258, 'America/Chicago'],
  ['KOAK', 'Oakland Intl', 'Oakland', 'CA', 37.7126, -122.2195, 'America/Los_Angeles'],
  ['KOGD', 'Ogden-Hinckley', 'Ogden', 'UT', 41.1956, -112.012, 'America/Denver'],
  ['KORD', "Chicago O'Hare", 'Chicago', 'IL', 41.9742, -87.9073, 'America/Chicago'],
  ['KPBI', 'Palm Beach Intl', 'West Palm Beach', 'FL', 26.6832, -80.0956, 'America/New_York'],
  ['KPDK', 'Dekalb-Peachtree', 'Atlanta', 'GA', 33.8756, -84.302, 'America/New_York'],
  ['KPDX', 'Portland Intl', 'Portland', 'OR', 45.5898, -122.5951, 'America/Los_Angeles'],
  ['KPHL', 'Philadelphia Intl', 'Philadelphia', 'PA', 39.8744, -75.2424, 'America/New_York'],
  ['KPHX', 'Phoenix Sky Harbor', 'Phoenix', 'AZ', 33.4342, -112.0116, 'America/Phoenix'],
  ['KPIE', 'St Pete-Clearwater', 'Clearwater', 'FL', 27.9102, -82.6874, 'America/New_York'],
  ['KPIH', 'Pocatello Regional', 'Pocatello', 'ID', 42.9098, -112.596, 'America/Boise'],
  ['KPIT', 'Pittsburgh Intl', 'Pittsburgh', 'PA', 40.4915, -80.2329, 'America/New_York'],
  ['KPLD', 'Portland Municipal', 'Portland', 'IN', 40.4505, -84.9885, 'America/Indiana/Indianapolis'],
  ['KPTK', 'Oakland County Intl', 'Waterford', 'MI', 42.6655, -83.4201, 'America/Detroit'],
  ['KPVD', 'T.F. Green', 'Providence', 'RI', 41.724, -71.4282, 'America/New_York'],
  ['KPVU', 'Provo Municipal', 'Provo', 'UT', 40.2192, -111.723, 'America/Denver'],
  ['KPWM', 'Portland Intl Jetport', 'Portland', 'ME', 43.6462, -70.3087, 'America/New_York'],
  ['KPWA', 'Wiley Post', 'Oklahoma City', 'OK', 35.5342, -97.6471, 'America/Chicago'],
  ['KRDU', 'Raleigh-Durham', 'Raleigh', 'NC', 35.8776, -78.7875, 'America/New_York'],
  ['KRIC', 'Richmond Intl', 'Richmond', 'VA', 37.5052, -77.3197, 'America/New_York'],
  ['KRYY', 'Cobb County / McCollum', 'Kennesaw', 'GA', 34.0132, -84.5972, 'America/New_York'],
  ['KSAN', 'San Diego Intl', 'San Diego', 'CA', 32.7336, -117.1897, 'America/Los_Angeles'],
  ['KSAT', 'San Antonio Intl', 'San Antonio', 'TX', 29.5337, -98.4698, 'America/Chicago'],
  ['KSDF', 'Louisville Muhammad Ali', 'Louisville', 'KY', 38.1741, -85.7365, 'America/New_York'],
  ['KSEA', 'Seattle-Tacoma Intl', 'Seattle', 'WA', 47.4502, -122.3088, 'America/Los_Angeles'],
  ['KSFO', 'San Francisco Intl', 'San Francisco', 'CA', 37.6213, -122.379, 'America/Los_Angeles'],
  ['KSJC', 'Norman Y. Mineta San Jose', 'San Jose', 'CA', 37.3626, -121.929, 'America/Los_Angeles'],
  ['KSLC', 'Salt Lake City Intl', 'Salt Lake City', 'UT', 40.7884, -111.978, 'America/Denver'],
  ['KSMF', 'Sacramento Intl', 'Sacramento', 'CA', 38.6954, -121.5908, 'America/Los_Angeles'],
  ['KSPA', 'Spartanburg Downtown', 'Spartanburg', 'SC', 34.9157, -81.9565, 'America/New_York'],
  ['KSTL', 'St Louis Lambert', 'St Louis', 'MO', 38.7487, -90.370, 'America/Chicago'],
  ['KTEB', 'Teterboro', 'Teterboro', 'NJ', 40.8501, -74.0608, 'America/New_York'],
  ['KTOL', 'Toledo Express', 'Toledo', 'OH', 41.5868, -83.8078, 'America/New_York'],
  ['KTPA', 'Tampa Intl', 'Tampa', 'FL', 27.9755, -82.5332, 'America/New_York'],
  ['KTWF', 'Magic Valley Regional', 'Twin Falls', 'ID', 42.4818, -114.488, 'America/Boise'],
  ['KTYS', 'McGhee Tyson', 'Knoxville', 'TN', 35.811, -83.994, 'America/New_York'],
  ['KVNY', 'Van Nuys', 'Van Nuys', 'CA', 34.2098, -118.49, 'America/Los_Angeles'],
  ['KXLL', 'Allentown Queen City', 'Allentown', 'PA', 40.5703, -75.4883, 'America/New_York'],
  ['KYIP', 'Willow Run', 'Ypsilanti', 'MI', 42.2373, -83.5304, 'America/Detroit'],
  ['KZZV', 'Zanesville Municipal', 'Zanesville', 'OH', 39.9444, -81.8921, 'America/New_York'],
  ['M19', 'Newport Municipal', 'Newport', 'TN', 35.9642, -83.199, 'America/New_York'],
]

function toInfo(r: Row): AirportInfo {
  return {
    icao: r[0],
    name: r[1],
    city: r[2],
    state: r[3],
    lat: r[4],
    lon: r[5],
    tz: r[6],
  }
}

export const AIRPORTS: Record<string, AirportInfo> = Object.fromEntries(
  ROWS.map((r) => [r[0], toInfo(r)]),
)

const SORTED: AirportInfo[] = ROWS.map(toInfo).sort((a, b) =>
  a.icao.localeCompare(b.icao),
)

export function listAirports(): AirportInfo[] {
  return SORTED
}

export function lookupAirport(icao: string): AirportInfo | null {
  if (!icao.trim()) return null
  return AIRPORTS[icao.trim().toUpperCase()] ?? null
}

export function lookupTz(icao: string): string | null {
  return lookupAirport(icao)?.tz ?? null
}

/** Search ICAO, city, state, or airport name. */
export function searchAirports(query: string, limit = 12): AirportInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return SORTED.slice(0, limit)
  const scored: Array<{ a: AirportInfo; score: number }> = []
  for (const a of SORTED) {
    const icao = a.icao.toLowerCase()
    const city = a.city.toLowerCase()
    const state = a.state.toLowerCase()
    const name = a.name.toLowerCase()
    let score = -1
    if (icao === q) score = 100
    else if (icao.startsWith(q)) score = 90
    else if (city === q || `${city}, ${state}` === q) score = 80
    else if (city.startsWith(q)) score = 70
    else if (state === q) score = 50
    else if (name.includes(q)) score = 40
    else if (city.includes(q) || `${city} ${state}`.includes(q)) score = 30
    else if (icao.includes(q)) score = 20
    if (score >= 0) scored.push({ a, score })
  }
  return scored
    .sort(
      (x, y) => y.score - x.score || x.a.icao.localeCompare(y.a.icao),
    )
    .slice(0, limit)
    .map((x) => x.a)
}
