// Utilidades puras para geocercas (sin Leaflet: el mapa vive en
// GeofenceMap.svelte, que importa Leaflet solo en el cliente).

export const KIND_LABELS = {
  polygon: 'Polígono',
  circle: 'Círculo',
  rectangle: 'Rectángulo',
  marker: 'Marcador',
  polyline: 'Línea',
};

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Recorre recursivamente las coordenadas [lng, lat(, alt)] de un GeoJSON
function* walkCoords(node) {
  if (!Array.isArray(node)) return;
  if (typeof node[0] === 'number') {
    yield node;
    return;
  }
  for (const child of node) yield* walkCoords(child);
}

// Devuelve { minLng, minLat, maxLng, maxLat } o null
export function coordsBounds(coords) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let found = false;
  for (const [lng, lat] of walkCoords(coords)) {
    found = true;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return found ? { minLng, minLat, maxLng, maxLat } : null;
}

function mergeBounds(a, b) {
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

// Bounds en formato Leaflet [[south, west], [north, east]] o null
export function featureBounds(feature) {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates;
  let b = coords ? coordsBounds(coords) : null;

  // Las geocercas circulares se guardan como Point + radius_m en properties
  if (props.radius_m != null && props.center) {
    const [lat, lng] = props.center;
    const dLat = props.radius_m / 111320;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dLng = props.radius_m / (111320 * (Math.abs(cosLat) > 1e-6 ? cosLat : 1e-6));
    const cb = { minLng: lng - dLng, minLat: lat - dLat, maxLng: lng + dLng, maxLat: lat + dLat };
    b = b ? mergeBounds(b, cb) : cb;
  }

  if (!b) return null;
  return [
    [b.minLat, b.minLng],
    [b.maxLat, b.maxLng],
  ];
}

// Centro aproximado [lat, lng] de una feature (promedio de vértices)
export function featureCenter(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!coords) return null;
  let sumLng = 0, sumLat = 0, n = 0;
  for (const [lng, lat] of walkCoords(coords)) {
    sumLng += lng; sumLat += lat; n++;
  }
  return n ? [sumLat / n, sumLng / n] : null;
}

// kind efectivo de una feature persistida
export function kindFromFeature(feature) {
  const props = feature?.properties || {};
  if (props.kind && KIND_LABELS[props.kind]) return props.kind;
  if (props.radius_m != null) return 'circle';
  switch (feature?.geometry?.type) {
    case 'Polygon':
    case 'MultiPolygon':
      return 'polygon';
    case 'LineString':
    case 'MultiLineString':
      return 'polyline';
    case 'Point':
      return 'marker';
    default:
      return 'polygon';
  }
}
