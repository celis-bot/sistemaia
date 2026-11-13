<script>
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';

  let files = $state([]);
  let team = $state(null);
  let error = $state('');
  let importing = $state('');
  let result = $state(null);

  onMount(async () => {
    try {
      [team, { files }] = await Promise.all([
        api('/teams/team').catch(() => null),
        api('/teams/attachments?top=50'),
      ]);
    } catch (e) {
      error = e.message;
    }
  });

  async function importFile(fileName) {
    importing = fileName;
    error = '';
    result = null;
    try {
      result = await api(`/teams/import/${encodeURIComponent(fileName)}`, { method: 'POST' });
    } catch (e) {
      error = e.message;
    } finally {
      importing = '';
    }
  }
</script>

<svelte:head><title>Teams / Excel - Sistema IA</title></svelte:head>

<h1>Reportes de Teams</h1>
<p class="muted">Archivos Excel de entregas de tareas encontrados en los canales.</p>
{#if team}<p>Equipo: <strong>{team.displayName ?? team.teamId}</strong></p>{/if}
{#if error}<p class="error">{error}</p>{/if}

<div class="card">
  <h2>Archivos Excel adjuntos</h2>
  {#if files.length === 0}
    <p class="muted">No se encontraron archivos. Verifica TEAMS_TEAM_ID y permisos de Graph.</p>
  {/if}
  <table>
    <thead><tr><th>Archivo</th><th>Canal</th><th>Fecha</th><th></th></tr></thead>
    <tbody>
      {#each files as f}
        <tr>
          <td>{f.fileName}</td>
          <td class="muted">{f.channelId?.slice(0, 8)}…</td>
          <td>{f.createdDateTime ? new Date(f.createdDateTime).toLocaleDateString() : '-'}</td>
          <td>
            <button disabled={importing === f.fileName} onclick={() => importFile(f.fileName)}>
              {importing === f.fileName ? 'Importando...' : 'Importar'}
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if result}
  <div class="card">
    <h2>Importacion completada</h2>
    <p>{result.students} estudiantes procesados ({result.rows} filas).</p>
  </div>
{/if}
