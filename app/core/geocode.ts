// Location helpers for Espresso (split out of EspressoAI.ts so they can be tested alone)

export type Coords = { lat: number; lon: number; name: string };

// Appended to place names that have no region, ONLY when GPS position is unknown.
// Change this to your own area, or set it to '' to disable.
const DEFAULT_REGION_HINT = 'Thailand';

const SELF_TRIGGERS = new Set([
  'am i', 'where am i', 'where am i now', 'me', 'i', 'my location', 'here', 'current location',
]);

// Airports only match on the IATA code or an explicit "airport" phrase,
// so "cafe in Phuket" or "court" no longer resolves to an airport.
const AIRPORTS: { re: RegExp; lat: number; lon: number; name: string }[] = [
  { re: /\b(?:urt|surat\s*thani\s+(?:international\s+)?airport)\b/i, lat: 9.1336, lon: 99.1336, name: 'Surat Thani International Airport (URT)' },
  { re: /\b(?:hkt|phuket\s+(?:international\s+)?airport)\b/i, lat: 8.1132, lon: 98.3169, name: 'Phuket International Airport (HKT)' },
  { re: /\b(?:bkk|suvarnabhumi)\b/i, lat: 13.69, lon: 100.7501, name: 'Suvarnabhumi Airport (BKK)' },
  { re: /\b(?:dmk|don\s*mueang\s+(?:international\s+)?airport)\b/i, lat: 13.9126, lon: 100.6068, name: 'Don Mueang International Airport (DMK)' },
];

let lastGps: Coords | null = null;
const cache = new Map<string, Coords>();

// Nominatim usage policy: max 1 request per second.
let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export function getRealLocation(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastGps = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Current GPS Location' };
        resolve(lastGps);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export async function findLocation(query: string): Promise<Coords | null> {
  const q = query.trim();
  const n = q.toLowerCase();

  if (!n || SELF_TRIGGERS.has(n)) return getRealLocation();

  for (const a of AIRPORTS) {
    if (a.re.test(q)) return { lat: a.lat, lon: a.lon, name: a.name };
  }

  const cached = cache.get(n);
  if (cached) return cached;

  const hint = DEFAULT_REGION_HINT.toLowerCase();
  const hasRegion = q.includes(',') || (hint !== '' && n.includes(hint));
  const searchQuery = !lastGps && DEFAULT_REGION_HINT && !hasRegion ? `${q}, ${DEFAULT_REGION_HINT}` : q;

  const params = new URLSearchParams({ format: 'json', limit: '5', q: searchQuery });
  if (lastGps) {
    // Prefer results near the user's last known position (soft bias, not a hard filter)
    const d = 0.5;
    params.set('viewbox', `${lastGps.lon - d},${lastGps.lat + d},${lastGps.lon + d},${lastGps.lat - d}`);
    params.set('bounded', '0');
  }

  try {
    await throttle();
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // Never pin a food/cafe search onto an airport. Nominatim reports this as
    // class === 'aeroway' (the old check looked at `type`, which never matched).
    const wantsFood = /\b(cafe|coffee|food|breakfast|restaurant)\b/i.test(q);
    const result = data.find((r) => !(wantsFood && r.class === 'aeroway'));
    if (!result) return null;

    const found: Coords = {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      name: result.name || String(result.display_name).split(',')[0],
    };
    cache.set(n, found);
    return found;
  } catch {
    return null;
  }
}