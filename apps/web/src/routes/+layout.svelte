<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { session, signOut } from '$lib/api.js';

  let { children } = $props();
  const publicPaths = ['/', '/login'];

  const authed = $derived(!!$session.user);
  const isPublic = $derived(publicPaths.includes($page.url.pathname));
</script>

{#if isPublic}
  {@render children()}
{:else if authed}
  <nav>
    <span class="brand">Sistema IA</span>
    <a href="/dashboard">Dashboard</a>
    <a href="/teams">Teams / Excel</a>
    <a href="/attendance">Asistencias</a>
    <a href="/analytics">Ponderacion</a>
    <a href="/geocercas">Geocercas</a>
    <button style="background:#334155;color:#e2e8f0" onclick={signOut}>Salir</button>
  </nav>
  <main>{@render children()}</main>
{:else}
  <main style="display:grid;place-items:center;min-height:80vh">
    <p class="muted">Redirigiendo al login...</p>
  </main>
{/if}
