<script lang="ts">
  import "$lib/styles/lounge.css";
  let { children } = $props();
</script>

<div class="lounge-shell">{@render children()}</div>
