<script>
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
  import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png?url';
  import markerIcon from 'leaflet/dist/images/marker-icon.png?url';
  import markerShadow from 'leaflet/dist/images/marker-shadow.png?url';
  import { esc, featureBounds, coordsBounds, kindFromFeature, KIND_LABELS } from './geofence.js';

  // Modulo independiente de geocercas sobre Leaflet + Leaflet-Geoman.
  // Leaflet/Geoman se importan de forma dinamica dentro de onMount para
  // no romper el SSR de SvelteKit (no hay `window` en el servidor).
  let {
    geofences = [],
    editable = true,
    height = '480px',
    center = [31.6907, -106.4307], // UACJ, Cd. Juarez
    zoom = 12,
    tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    onCreate = async () => {},
    onUpdate = async () => {},
    onDelete = async () => {},
  } = $props();

  let mapEl;
  /** @type {any} */
  let map = null;
  /** @type {any} */
  let L = null;
  /** @type {any} */
  let drawn = null;
  let mapReady = $state(false);
  let mapError = $state('');
  let didFit = false;
  let localSeq = 0;

  onMount(() => {
    let cancelled = false;

    (async () => {
      try {
        L = (await import('leaflet')).default;
        // leaflet-geoman (bundle UMD) espera un `L` global
        const g = /** @type {any} */ (globalThis);
        g.L = L;
        await import('@geoman-io/leaflet-geoman-free');
      } catch (err) {
        if (!cancelled) {
          mapError = 'No se pudo cargar el mapa (Leaflet).';
          console.error(err);
        }
        return;
      }
      if (cancelled) return;

      // Iconos por defecto de Marker: Vite no resuelve las rutas internas de Leaflet
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerIcon2x,
        iconUrl: markerIcon,
        shadowUrl: markerShadow,
      });

      map = /** @type {any} */ (L.map(mapEl));
      L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(map);
      map.setView(center, zoom);
      drawn = new L.FeatureGroup().addTo(map);

      if (editable && map.pm) {
        map.pm.addControls({
          position: 'topleft',
          drawMarker: true,
          drawCircle: true,
          drawPolygon: true,
          drawRectangle: true,
          drawPolyline: true,
          cutPolygon: false,
          rotateMode: false,
          removalMode: true,
        });
      }

      map.on('pm:create', (e) => {
        const layer = e.layer;
        if (!layer) return;
        layer._localId = `local-${++localSeq}`;
        drawn.addLayer(layer);
        showDraftPopup(layer);
      });

      mapReady = true; // dispara el $effect que sincroniza `geofences`
    })();

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
      drawn = null;
      mapReady = false;
    };
  });

  // ---- conversion GeoJSON <-> capas Leaflet ----

  function closeRing(coords) {
    if (coords.length > 1) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
    }
    return coords;
  }

  // LatLng(s) de Leaflet -> coordenadas GeoJSON [lng, lat]
  function latLngsToCoords(latlngs, closeRings = true) {
    if (!latlngs) return null;
    if (latlngs.lat != null && latlngs.lng != null) return [latlngs.lng, latlngs.lat];
    if (!Array.isArray(latlngs)) return null;
    const isRing = closeRings && latlngs.length > 0 && latlngs[0] && latlngs[0].lat != null;
    const coords = latlngs.map((x) => latLngsToCoords(x, closeRings)).filter(Boolean);
    if (isRing) closeRing(coords);
    return coords;
  }

  function polygonGeometry(latlngs) {
    const flat = latlngs?.length && latlngs[0] && latlngs[0].lat != null;
    const coords = latLngsToCoords(latlngs);
    if (!coords) return null;
    return { type: 'Polygon', coordinates: flat ? [coords] : coords };
  }

  // Capa Leaflet -> GeoJSON Feature (con properties.kind, name, radius_m, _localId)
  function layerToFeature(layer) {
    let geometry = null;
    let kind = 'polygon';
    const props = { name: layer._gfMeta?.name ?? '' };
    if (layer._localId) props._localId = layer._localId;

    if (layer instanceof L.Marker) {
      kind = 'marker';
      const ll = layer.getLatLng();
      geometry = { type: 'Point', coordinates: [ll.lng, ll.lat] };
    } else if (layer instanceof L.Circle) {
      kind = 'circle';
      const c = layer.getLatLng();
      props.radius_m = Math.round(layer.getRadius());
      props.center = [c.lat, c.lng];
      geometry = { type: 'Point', coordinates: [c.lng, c.lat] };
    } else if (layer instanceof L.Rectangle) {
      kind = 'rectangle';
      geometry = polygonGeometry(layer.getLatLngs());
    } else if (layer instanceof L.Polygon) {
      kind = 'polygon';
      geometry = polygonGeometry(layer.getLatLngs());
    } else if (layer instanceof L.Polyline) {
      kind = 'polyline';
      geometry = { type: 'LineString', coordinates: latLngsToCoords(layer.getLatLngs(), false) };
    } else if (typeof layer.toGeoJSON === 'function') {
      const gj = layer.toGeoJSON();
      if (gj?.type === 'Feature') return gj;
      if (gj?.type) geometry = gj;
      kind = kindFromFeature({ geometry, properties: props });
    }

    if (!geometry) return null;
    return { type: 'Feature', properties: { ...props, kind }, geometry };
  }

  // Fila de geocercas -> capa Leaflet (o null si no se puede renderizar)
  function featureToLayer(gf) {
    const feature = gf?.geojson;
    const geom = feature?.geometry;
    if (!geom) return null;
    const props = feature.properties || {};
    const kind = kindFromFeature(feature);
    const color = gf.color || '#38bdf8';
    let layer = null;

    if (kind === 'circle' && props.radius_m != null && props.center) {
      layer = L.circle(L.latLng(props.center[0], props.center[1]), {
        radius: props.radius_m,
        color,
        weight: 2,
        fillOpacity: 0.15,
      });
    } else if (kind === 'rectangle' && geom.type === 'Polygon') {
      const b = coordsBounds(geom.coordinates);
      if (b) {
        layer = L.rectangle(
          [
            [b.minLat, b.minLng],
            [b.maxLat, b.maxLng],
          ],
          { color, weight: 2, fillOpacity: 0.15 }
        );
      }
    }

    if (!layer) {
      const group = L.geoJSON(feature);
      group.eachLayer((l) => {
        if (!layer) layer = l;
      });
    }
    if (!layer) return null;

    if (layer.setStyle) layer.setStyle({ color, weight: 2, fillOpacity: 0.15 });
    if (layer.options) layer.options.color = color;
    return layer;
  }

  // ---- popups ----

  function applyStyle(layer, color) {
    const style = { color, weight: 2, opacity: 1, fillOpacity: 0.15 };
    if (layer.setStyle) layer.setStyle(style);
    if (layer.options) Object.assign(layer.options, style);
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function bindSavedPopup(layer, gf) {
    layer.bindPopup(() => {
      const el = L.DomUtil.create('div', 'geofence-popup');
      el.innerHTML = `<div class="gp-name">${esc(gf.name)}</div>
        <div class="gp-kind">${esc(KIND_LABELS[kindFromFeature(gf.geojson)] || gf.kind || '')}</div>`;
      if (editable) {
        const btn = L.DomUtil.create('button', 'gp-delete', el);
        btn.type = 'button';
        btn.textContent = 'Eliminar';
        btn.addEventListener('click', () => {
          if (confirm(`¿Eliminar la geocerca "${gf.name}"?`)) {
            layer.closePopup();
            onDelete(gf.id).catch(() => {});
          }
        });
      }
      return el;
    });
  }

  function attachLayerBehavior(layer, gf) {
    layer._gfMeta = { name: gf.name || gf.geojson?.properties?.name || '' };
    applyStyle(layer, gf.color || '#38bdf8');
    bindSavedPopup(layer, gf);

    const persist = debounce(() => {
      if (!layer._geofenceId) return;
      const feature = layerToFeature(layer);
      if (!feature) return;
      feature.properties.name = layer._gfMeta.name;
      onUpdate(layer._geofenceId, { geojson: feature }).catch(() => {});
    }, 800);
    layer.on('pm:edit', persist);
    layer.on('pm:dragend', persist);
    layer.on('pm:markerdragend', persist);
    layer.on('pm:remove', () => {
      if (layer._geofenceId) onDelete(layer._geofenceId).catch(() => {});
    });
  }

  function decorateSavedLayer(layer, gf) {
    layer._geofenceId = gf.id;
    layer._localId = gf.geojson?.properties?._localId ?? null;
    attachLayerBehavior(layer, gf);
  }

  function showDraftPopup(layer) {
    const kind = (() => {
      const f = layerToFeature(layer);
      return f ? f.properties.kind : 'polygon';
    })();
    const defaultName = `Geocerca ${localSeq}`;

    const el = L.DomUtil.create('div', 'geofence-popup geofence-draft');
    el.innerHTML = `
      <div class="gp-title">Nueva geocerca</div>
      <div class="gp-kind">${esc(KIND_LABELS[kind] || kind)}</div>
      <input class="gp-name" type="text" placeholder="Nombre" maxlength="200" value="${esc(defaultName)}" />
      <input class="gp-desc" type="text" placeholder="Descripción (opcional)" maxlength="2000" />
      <label class="gp-color-row">Color <input class="gp-color" type="color" value="#38bdf8" /></label>
      <div class="gp-actions">
        <button type="button" class="gp-save">Guardar</button>
        <button type="button" class="gp-cancel">Cancelar</button>
      </div>
      <div class="gp-error"></div>`;
    L.DomEvent.disableClickPropagation(el);

    const nameInput = el.querySelector('.gp-name');
    const descInput = el.querySelector('.gp-desc');
    const colorInput = el.querySelector('.gp-color');
    const errEl = el.querySelector('.gp-error');
    const saveBtn = el.querySelector('.gp-save');
    const cancelBtn = el.querySelector('.gp-cancel');
    nameInput.focus();

    cancelBtn.addEventListener('click', () => {
      drawn.removeLayer(layer);
      map.removeLayer(layer);
    });

    saveBtn.addEventListener('click', async () => {
      const feature = layerToFeature(layer);
      if (!feature) return;
      const name = nameInput.value.trim() || defaultName;
      feature.properties.name = name;
      feature.properties._localId = layer._localId;
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      errEl.textContent = '';
      try {
        await onCreate({
          name,
          description: descInput.value.trim() || null,
          kind,
          color: colorInput.value,
          geojson: feature,
        });
        layer.closePopup();
      } catch (err) {
        errEl.textContent = err?.message || 'Error al guardar';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });

    layer.bindPopup(el).openPopup();
  }

  // ---- sincronización con la lista del padre ----

  function syncLayers(list) {
    if (!drawn || !L) return;
    list = list || [];

    const byLocalId = new Map();
    for (const gf of list) {
      const lid = gf.geojson?.properties?._localId;
      if (lid) byLocalId.set(lid, gf);
    }

    // Adopta capas locales cuyo _localId ya fue persistido por el servidor
    const existing = new Map();
    const locals = [];
    drawn.eachLayer((layer) => {
      if (layer._geofenceId) existing.set(layer._geofenceId, layer);
      else locals.push(layer);
    });
    for (const layer of locals) {
      const gf = layer._localId ? byLocalId.get(layer._localId) : null;
      if (gf && !existing.has(gf.id)) {
        layer._geofenceId = gf.id;
        attachLayerBehavior(layer, gf);
        existing.set(gf.id, layer);
      }
    }

    // Elimina capas persistidas que ya no existen en la lista
    for (const [id, layer] of existing) {
      if (!list.some((gf) => gf.id === id)) drawn.removeLayer(layer);
    }

    // Agrega las nuevas
    for (const gf of list) {
      if (existing.has(gf.id)) continue;
      const layer = featureToLayer(gf);
      if (!layer) continue;
      decorateSavedLayer(layer, gf);
      drawn.addLayer(layer);
      existing.set(gf.id, layer);
    }

    // Encuadra todo en la primera carga con datos
    if (!didFit && list.length) {
      const bounds = L.latLngBounds([]);
      let any = false;
      for (const gf of list) {
        const fb = featureBounds(gf.geojson);
        if (fb) {
          bounds.extend(fb[0]);
          bounds.extend(fb[1]);
          any = true;
        }
      }
      if (any) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        didFit = true;
      }
    }
  }

  $effect(() => {
    if (!mapReady) return;
    syncLayers(geofences);
  });
</script>

<div class="geofence-map" bind:this={mapEl} style="height:{height}">
  {#if mapError}<p class="error geofence-map-error">{mapError}</p>{/if}
</div>

<style>
  .geofence-map {
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: #0b1220;
  }
  .geofence-map-error {
    position: absolute;
    margin: 0.5rem;
  }

  /* El popup de Leaflet se renderiza fuera del árbol de Svelte:
     estos estilos deben ser globales. */
  :global(.geofence-popup) {
    font-size: 0.85rem;
    min-width: 200px;
  }
  :global(.geofence-popup .gp-name) {
    font-weight: 700;
    margin-bottom: 0.15rem;
  }
  :global(.geofence-popup .gp-kind),
  :global(.geofence-popup .gp-title) {
    color: #64748b;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.4rem;
  }
  :global(.geofence-popup input[type='text']) {
    width: 100%;
    margin-bottom: 0.4rem;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    font-size: 0.85rem;
    box-sizing: border-box;
  }
  :global(.geofence-popup .gp-color-row) {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: #475569;
    margin-bottom: 0.5rem;
  }
  :global(.geofence-popup .gp-color) {
    width: 2rem;
    height: 1.6rem;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  :global(.geofence-popup .gp-actions) {
    display: flex;
    gap: 0.4rem;
  }
  :global(.geofence-popup .gp-actions button),
  :global(.geofence-popup .gp-delete) {
    border: 0;
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  :global(.geofence-popup .gp-save) {
    background: #0284c7;
    color: #fff;
  }
  :global(.geofence-popup .gp-cancel),
  :global(.geofence-popup .gp-delete) {
    background: #e2e8f0;
    color: #334155;
  }
  :global(.geofence-popup .gp-delete) {
    margin-top: 0.4rem;
    background: #fee2e2;
    color: #b91c1c;
  }
  :global(.geofence-popup .gp-error) {
    color: #b91c1c;
    font-size: 0.75rem;
    margin-top: 0.35rem;
    min-height: 0.9rem;
  }
</style>
