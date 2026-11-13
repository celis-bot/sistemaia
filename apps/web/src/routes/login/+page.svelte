<script>
  import { goto } from '$app/navigation';
  import { session, signup } from '$lib/api.js';

  let email = $state('');
  let password = $state('');
  let fullName = $state('');
  let error = $state('');
  let loading = $state(false);

  $effect(() => {
    if ($session.user) goto('/dashboard');
  });

  async function submit(e) {
    e.preventDefault();
    error = '';
    loading = true;
    try {
      await signup(email, password, fullName);
      goto('/dashboard');
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Registro - Sistema IA</title></svelte:head>

<div class="card" style="max-width:400px;margin:4rem auto">
  <h1>Crear cuenta</h1>
  <form onsubmit={submit}>
    <input bind:value={fullName} placeholder="Nombre completo" />
    <input type="email" bind:value={email} placeholder="Correo" required />
    <input type="password" bind:value={password} placeholder="Contrasena (min. 8)" required minlength="8" />
    {#if error}<p class="error">{error}</p>{/if}
    <button type="submit" disabled={loading}>{loading ? 'Creando...' : 'Registrarse'}</button>
  </form>
  <p class="muted" style="margin-top:1rem"><a href="/">Volver al login</a></p>
</div>
