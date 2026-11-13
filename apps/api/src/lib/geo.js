// Utilidades geometricas para geocercas (punto en poligono / circulo).
// Trabaja sobre GeoJSON Feature tal como se guarda en public.geofences.geojson.

const EARTH_RADIUS_M = 6371000;

export function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Ray casting (regla par-impar) sobre un anillo GeoJSON [lng, lat]
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Polygon coordinates: [anillo exterior, hueco1, hueco2, ...]
function pointInPolygonCoords(lat, lng, coords) {
  if (!coords?.length || !pointInRing(lat, lng, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(lat, lng, coords[i])) return false; // cayo dentro de un hueco
  }
  return true;
}

/**
 * ¿El punto [lat, lng] esta dentro de la geocerca?
 * @param {object} feature GeoJSON Feature (geojson de la tabla geofences)
 * @param {number} lat
 * @param {number} lng
 * @param {number} [accuracyM]precision GPS opcional; en circulos amplifica el radio
 */
export function pointInGeofence(feature, lat, lng, accuracyM = 0) {
  const props = feature?.properties || {};
  const geom = feature?.geometry;

  // Circulo: se guarda como Point + properties.center/radius_m
  if (props.radius_m != null && props.center) {
    const radius = props.radius_m + (accuracyM || 0);
    return haversineM(lat, lng, props.center[0], props.center[1]) <= radius;
  }

  switch (geom?.type) {
    case 'Polygon':
      return pointInPolygonCoords(lat, lng, geom.coordinates);
    case 'MultiPolygon':
      return geom.coordinates.some((poly) => pointInPolygonCoords(lat, lng, poly));
    default:
      // Point / LineString no son areas: nunca "contienen"
      return false;
  }
}
