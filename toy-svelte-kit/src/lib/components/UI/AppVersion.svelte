<script lang="ts">
  import release from "$lib/assets/data/app/version.json";
</script>

<span class="app-version" aria-label={`버전 ${release.version}`}>v{release.version}</span>

<style>
  .app-version {
    display: inline-block;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
</style>
