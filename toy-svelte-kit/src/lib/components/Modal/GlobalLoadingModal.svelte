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
    background: rgba(15, 23, 42, 0.42);
    z-index: 9999;
    display: grid;
    place-items: center;
    padding: 16px;
  }

  .loading-modal {
    min-width: 240px;
    max-width: 92vw;
    border: 1px solid rgba(203, 213, 225, 0.9);
    border-radius: 12px;
    background: #fff;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.22);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 3px solid #cbd5e1;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  p {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
