<script lang="ts">
  import { globalLoadingMessage, isGlobalLoading } from "$lib/stores/loading";
</script>

{#if $isGlobalLoading}
  <div class="loading-overlay" role="status" aria-live="polite" aria-busy="true">
    <div class="loading-modal">
      <div class="spinner" aria-hidden="true"></div>
      <p>{$globalLoadingMessage}</p>
    </div>
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(12, 18, 30, 0.32);
    backdrop-filter: blur(10px);
  }

  .loading-modal {
    min-width: 260px;
    max-width: min(92vw, 420px);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    color: var(--text-strong);
    box-shadow:
      inset 0 0 0 1px var(--line),
      var(--shadow-float);
  }

  .spinner {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border: 3px solid color-mix(in srgb, var(--line-strong) 80%, transparent);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  p {
    margin: 0;
    color: var(--text-strong);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.5;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
