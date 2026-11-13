<script>
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';

  let studentId = $state('');
  let period = $state('');
  let result = $state(null);
  let error = $state('');
  let loading = $state(false);

  async function consult() {
    loading = true;
    error = '';
    try {
      const qs = new URLSearchParams();
      if (studentId) qs.set('student_id', studentId);
      if (period) qs.set('period', period);
      qs.set('persist', 'true');
      result = await api(`/attendance?${qs}`);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => { /* consulta inicial opcional */ });
</script>

<svelte:head><title>Asistencias - Sistema IA</title></svelte:head>

<h1>Inasistencias (Conecta UACJ)</h1>

<div class="card">
  <div class="grid">
    <input bind:value={studentId} placeholder="ID de estudiante (opcional)" />
    <input bind:value={period} placeholder="Periodo (opcional)" />
  </div>
  <button onclick={consult} disabled={loading}>{loading ? 'Consultando...' : 'Consultar'}</button>
  {#if error}<p class="error">{error}</p>{/if}
</div>

{#if result}
  <div class="card">
    <h2>{result.count} registros encontrados</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Materia</th><th>Estado</th><th>Justificacion</th></tr></thead>
      <tbody>
        {#each result.records as r}
          <tr>
            <td>{r.fecha}</td>
            <td>{r.materia ?? '-'}</td>
            <td>{r.estado ?? '-'}</td>
            <td class="muted">{r.justificacion ?? '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
