<script lang="ts">
  import "$lib/styles/games.css";
  let { children } = $props();
</script>

<div class="game-zone">
  {@render children()}
</div>
