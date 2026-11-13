<script>
  import { onMount } from 'svelte';
  import { api, supabase } from '$lib/api.js';
  import GeofenceMap from '$lib/GeofenceMap.svelte';
  import { KIND_LABELS, kindFromFeature } from '$lib/geofence.js';

  let geofences = $state([]);
  let events = $state([]);
  let presence = $state([]);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let role = $state(null);

  // Simulador de ping (para probar sin la app movil)
  let pingSubject = $state('');
  let pingLat = $state('31.6907');
  let pingLng = $state('-106.4307');
  let pinging = $state(false);
  let pingResult = $state(null);

  const editable = $derived(role === 'admin' || role === 'docente');

  onMount(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .single();
        role = prof?.role || 'viewer';
      } else {
        role = 'viewer';
      }
    } catch {
      role = 'viewer';
    }
    await load();
  });

  async function load() {
    loading = true;
    error = '';
    try {
      const [g, ev, pr] = await Promise.all([
        api('/geofences'),
        // eventos/presencia piden rol admin|docente; para viewer se omite
        // (un 403 del API se traduciria en cierre de sesion por api())
        editable
          ? api('/geofence-events?limit=30').catch(() => ({ events: [] }))
          : Promise.resolve({ events: [] }),
        editable
          ? api('/geofence-events/presence').catch(() => ({ presence: [] }))
          : Promise.resolve({ presence: [] }),
      ]);
      geofences = g.geofences || [];
      events = ev.events || [];
      presence = pr.presence || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  const geoName = (id) => geofences.find((g) => g.id === id)?.name ?? id?.slice(0, 8) ?? '-';

  async function sendPing() {
    pinging = true;
    error = '';
    notice = '';
    try {
      pingResult = await api('/geofences/ping', {
        method: 'POST',
        body: JSON.stringify({
          subject_id: pingSubject.trim() || 'prueba',
          lat: Number(pingLat),
          lng: Number(pingLng),
          source: 'web',
        }),
      });
      notice = pingResult.new_events?.length
        ? `${pingResult.new_events.length} evento(s) registrado(s)`
        : 'Sin cambios de presencia';
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      pinging = false;
    }
  }

  async function handleCreate(payload) {
    await api('/geofences', { method: 'POST', body: JSON.stringify(payload) });
    notice = 'Geocerca guardada';
    await load();
  }

  // Las ediciones de geometria se persisten con debounce desde el mapa
  async function handleUpdate(id, payload) {
    await api(`/geofences/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }

  async function handleDelete(id) {
    const gf = geofences.find((g) => g.id === id);
    if (!confirm(`¿Eliminar la geocerca "${gf?.name ?? id}"?`)) return;
    await api(`/geofences/${id}`, { method: 'DELETE' });
    notice = 'Geocerca eliminada';
    await load();
  }
</script>

<svelte:head><title>Geocercas - Sistema IA</title></svelte:head>

<h1>Geocercas</h1>
<p class="muted">
  Dibuja poligonos, rectangulos, circulos, lineas y marcadores sobre el mapa.
  {#if editable}Usa la barra de herramientas (arriba a la izquierda) para crear o editar.{:else}Solo lectura.{/if}
</p>

{#if error}<p class="error">{error}</p>{/if}
{#if notice}<p class="notice">{notice}</p>{/if}

{#if role !== null}
  <GeofenceMap {geofences} {editable} height="60vh" onCreate={handleCreate} onUpdate={handleUpdate} onDelete={handleDelete} />
{:else}
  <div class="card"><p class="muted">Cargando mapa...</p></div>
{/if}

<div class="card">
  <h2>Guardadas ({geofences.length})</h2>
  {#if loading}
    <p class="muted">Cargando...</p>
  {:else if geofences.length === 0}
    <p class="muted">No hay geocercas todavia. Dibuja una en el mapa.</p>
  {:else}
    <table>
      <thead>
        <tr><th>Nombre</th><th>Tipo</th><th>Color</th><th>Creada</th>{#if editable}<th></th>{/if}</tr>
      </thead>
      <tbody>
        {#each geofences as gf}
          {@const kind = kindFromFeature(gf.geojson)}
          <tr>
            <td>{gf.name}</td>
            <td>{KIND_LABELS[kind] || kind}</td>
            <td><span class="swatch" style="background:{gf.color || '#38bdf8'}"></span></td>
            <td class="muted">{gf.created_at ? new Date(gf.created_at).toLocaleString() : '-'}</td>
            {#if editable}
              <td><button class="btn-danger" onclick={() => handleDelete(gf.id)}>Eliminar</button></td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="grid">
  <div class="card">
    <h2>Simular ping</h2>
    <p class="muted">Reporta una ubicacion para probar la deteccion de entrada/salida (lo usara la app movil).</p>
    <div class="grid">
      <input bind:value={pingSubject} placeholder="ID de sujeto (ej. estudiante o dispositivo)" />
      <input bind:value={pingLat} placeholder="Latitud" inputmode="decimal" />
      <input bind:value={pingLng} placeholder="Longitud" inputmode="decimal" />
    </div>
    <button onclick={sendPing} disabled={pinging}>{pinging ? 'Enviando...' : 'Enviar ping'}</button>
    {#if pingResult}
      <p class="muted" style="margin-top:.5rem">
        Dentro de: {pingResult.inside_ids?.length ? pingResult.inside_ids.map((id) => geoName(id)).join(', ') : 'ninguna geocerca'}
      </p>
    {/if}
  </div>

  <div class="card">
    <h2>Dentro ahora ({presence.length})</h2>
    {#if presence.length === 0}
      <p class="muted">Nadie reportado dentro de alguna geocerca.</p>
    {:else}
      <table>
        <thead><tr><th>Sujeto</th><th>Geocerca</th><th>Ultima vez</th></tr></thead>
        <tbody>
          {#each presence as p}
            <tr>
              <td>{p.subject_id}</td>
              <td>{geoName(p.geofence_id)}</td>
              <td class="muted">{p.last_seen_at ? new Date(p.last_seen_at).toLocaleString() : '-'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<div class="card">
  <h2>Eventos recientes</h2>
  {#if events.length === 0}
    <p class="muted">Aun no hay eventos de entrada/salida.</p>
  {:else}
    <table>
      <thead><tr><th>Fecha</th><th>Sujeto</th><th>Geocerca</th><th>Evento</th><th>Fuente</th></tr></thead>
      <tbody>
        {#each events as ev}
          <tr>
            <td class="muted">{new Date(ev.created_at).toLocaleString()}</td>
            <td>{ev.subject_id}</td>
            <td>{geoName(ev.geofence_id)}</td>
            <td><span class="badge {ev.event === 'enter' ? 'badge-enter' : 'badge-exit'}">{ev.event === 'enter' ? 'Entrada' : 'Salida'}</span></td>
            <td class="muted">{ev.source ?? '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .swatch {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 4px;
    vertical-align: middle;
  }
  .notice {
    color: #4ade80;
  }
  .btn-danger {
    background: #fee2e2;
    color: #b91c1c;
  }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
  }
  .badge-enter {
    background: #dcfce7;
    color: #15803d;
  }
  .badge-exit {
    background: #fee2e2;
    color: #b91c1c;
  }
</style>
