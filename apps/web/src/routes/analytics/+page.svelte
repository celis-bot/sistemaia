<script>
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';

  let students = $state([]);
  let error = $state('');
  let recalculating = $state(false);
  let period = $state('default');

  async function load() {
    try {
      const res = await api('/analytics/performance');
      students = res.students ?? [];
    } catch (e) {
      error = e.message;
    }
  }

  async function recalculate() {
    recalculating = true;
    error = '';
    try {
      await api('/analytics/performance/recalculate', {
        method: 'POST',
        body: JSON.stringify({ period }),
      });
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      recalculating = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Ponderacion - Sistema IA</title></svelte:head>

<h1>Ponderacion de desempeno</h1>

<div class="card">
  <div class="grid" style="grid-template-columns: 1fr auto auto">
    <input bind:value={period} placeholder="Periodo" />
    <button onclick={recalculate} disabled={recalculating}>
      {recalculating ? 'Recalculando...' : 'Recalcular ponderaciones'}
    </button>
  </div>
  <p class="muted">Pesos: tareas 50% · asistencia 30% · puntualidad 20% (configurable en .env)</p>
  {#if error}<p class="error">{error}</p>{/if}
</div>

<div class="card">
  <h2>Resultados</h2>
  <table>
    <thead><tr><th>Estudiante</th><th>Score</th><th>Grado</th><th>Inasistencias</th></tr></thead>
    <tbody>
      {#each students as s}
        <tr>
          <td>{s.student_name}</td>
          <td>{s.score}</td>
          <td>{s.grade}</td>
          <td>{s.absences}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
