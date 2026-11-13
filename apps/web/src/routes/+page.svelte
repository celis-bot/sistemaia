<script>
  import { goto } from '$app/navigation';
  import { session, login } from '$lib/api.js';

  let email = $state('');
  let password = $state('');
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
      await login(email, password);
      goto('/dashboard');
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Sistema IA - Login</title></svelte:head>

<div class="card" style="max-width:400px;margin:4rem auto">
  <h1>Iniciar sesion</h1>
  <form onsubmit={submit}>
    <input type="email" bind:value={email} placeholder="Correo" required />
    <input type="password" bind:value={password} placeholder="Contrasena" required />
    {#if error}<p class="error">{error}</p>{/if}
    <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
  </form>
  <p class="muted" style="margin-top:1rem">
    <a href="/login">Crear cuenta</a>
  </p>
</div>
