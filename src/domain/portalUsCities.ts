/**
 * Major US metro pins for the client trips overview map.
 * Gold “twinkles” — city atmosphere only, not trip data.
 */

export type PortalUsCity = {
  id: string
  label: string
  lat: number
  lon: number
}

/** Curated CONUS metros + Anchorage / Honolulu for a continental feel. */
export const PORTAL_US_CITY_TWINKLES: PortalUsCity[] = [
  { id: 'sea', label: 'SEA', lat: 47.4502, lon: -122.3088 },
  { id: 'pdx', label: 'PDX', lat: 45.5898, lon: -122.5951 },
  { id: 'sfo', label: 'SFO', lat: 37.6213, lon: -122.379 },
  { id: 'lax', label: 'LAX', lat: 33.9425, lon: -118.4081 },
  { id: 'san', label: 'SAN', lat: 32.7338, lon: -117.1933 },
  { id: 'phx', label: 'PHX', lat: 33.4373, lon: -112.0078 },
  { id: 'las', label: 'LAS', lat: 36.084, lon: -115.1537 },
  { id: 'den', label: 'DEN', lat: 39.8561, lon: -104.6737 },
  { id: 'slc', label: 'SLC', lat: 40.7899, lon: -111.9791 },
  { id: 'dfw', label: 'DFW', lat: 32.8998, lon: -97.0403 },
  { id: 'iah', label: 'IAH', lat: 29.9902, lon: -95.3368 },
  { id: 'aus', label: 'AUS', lat: 30.1945, lon: -97.6699 },
  { id: 'msp', label: 'MSP', lat: 44.8848, lon: -93.2223 },
  { id: 'ord', label: 'ORD', lat: 41.9742, lon: -87.9073 },
  { id: 'dtw', label: 'DTW', lat: 42.2162, lon: -83.3554 },
  { id: 'cle', label: 'CLE', lat: 41.4117, lon: -81.8498 },
  { id: 'pit', label: 'PIT', lat: 40.4915, lon: -80.2329 },
  { id: 'atl', label: 'ATL', lat: 33.6407, lon: -84.4277 },
  { id: 'clt', label: 'CLT', lat: 35.214, lon: -80.9431 },
  { id: 'bna', label: 'BNA', lat: 36.1263, lon: -86.6774 },
  { id: 'mem', label: 'MEM', lat: 35.0424, lon: -89.9767 },
  { id: 'mia', label: 'MIA', lat: 25.7959, lon: -80.287 },
  { id: 'mco', label: 'MCO', lat: 28.4312, lon: -81.3081 },
  { id: 'tpa', label: 'TPA', lat: 27.9755, lon: -82.5332 },
  { id: 'iad', label: 'IAD', lat: 38.9531, lon: -77.4565 },
  { id: 'bwi', label: 'BWI', lat: 39.1754, lon: -76.6683 },
  { id: 'phl', label: 'PHL', lat: 39.8744, lon: -75.2424 },
  { id: 'ewr', label: 'EWR', lat: 40.6895, lon: -74.1745 },
  { id: 'jfk', label: 'JFK', lat: 40.6413, lon: -73.7781 },
  { id: 'bos', label: 'BOS', lat: 42.3656, lon: -71.0096 },
  { id: 'ind', label: 'IND', lat: 39.7173, lon: -86.2944 },
  { id: 'stl', label: 'STL', lat: 38.7487, lon: -90.37 },
  { id: 'mci', label: 'MCI', lat: 39.2976, lon: -94.7139 },
  { id: 'okc', label: 'OKC', lat: 35.3931, lon: -97.6007 },
  { id: 'abq', label: 'ABQ', lat: 35.0402, lon: -106.6091 },
]
