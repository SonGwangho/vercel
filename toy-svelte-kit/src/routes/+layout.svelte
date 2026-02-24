<script lang="ts">
  import { buildTree } from "$lib";
  import favicon from "$lib/assets/favicon.ico";
  import TreeItem from "$lib/components/Tree/TreeItem.svelte";

  let { data, children } = $props();

  const tree = buildTree(data.menus);
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<header>
  <nav>
    <ul class="menu-root">
      {#each tree as node}
        <TreeItem {node} />
      {/each}
    </ul>
  </nav>
</header>
<main>
  {@render children()}
</main>
<footer></footer>

<style>
  header {
    margin: 0;
    padding: 8px;
    min-height: 50px;
    font-size: 12px;
    background-color: aliceblue;
  }
  main {
    margin: 0;
    padding: 0;
    font-size: 12px;
  }
  footer {
    font-size: 12px;
  }

  nav * {
    background-color: inherit;
    color: inherit;
  }
  .menu-root {
    padding: 0;
  }
</style>
