<script>
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';

  let data = $state(null);
  let error = $state('');

  onMount(async () => {
    try {
      data = await api('/mobile/dashboard');
    } catch (e) {
      error = e.message;
    }
  });
</script>

<svelte:head><title>Dashboard - Sistema IA</title></svelte:head>

<h1>Dashboard</h1>
{#if error}<p class="error">{error}</p>{/if}

{#if data}
  <div class="grid">
    <div class="card"><div class="stat">{data.total_imports}</div><div class="muted">Importaciones</div></div>
    <div class="card"><div class="stat">{data.top_students?.length ?? 0}</div><div class="muted">Estudiantes</div></div>
  </div>

  <div class="card">
    <h2>Top desempeno</h2>
    <table>
      <thead><tr><th>Estudiante</th><th>Score</th><th>Grado</th></tr></thead>
      <tbody>
        {#each data.top_students ?? [] as s}
          <tr><td>{s.student_name}</td><td>{s.score}</td><td>{s.grade}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
