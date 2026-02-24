<script lang="ts">
  import { buildTree } from "$lib";
  import favicon from "$lib/assets/favicon.ico";
  import ResponsiveMenuItem from "$lib/components/Tree/ResponsiveMenuItem.svelte";
  import "../app.css";
  import { onMount } from "svelte";

  let { data, children } = $props();

  const tree = $derived(buildTree(data.menus));

  let isMobile = $state(false);
  let drawerOpen = $state(false);
  let expandedIds = $state(new Set<string>());

  function detectViewport() {
    isMobile = window.innerWidth < 1024;

    if (!isMobile) {
      drawerOpen = true;
      expandedIds = new Set();
    }
  }

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }

  function closeDrawer() {
    if (isMobile) {
      drawerOpen = false;
    }
  }

  function toggleSubmenu(id: string) {
    const next = new Set(expandedIds);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    expandedIds = next;
  }

  onMount(() => {
    detectViewport();
    window.addEventListener("resize", detectViewport);

    return () => window.removeEventListener("resize", detectViewport);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<header class="topbar">
  <div class="brand">My Wiki</div>
  <button
    type="button"
    class="hamburger"
    aria-label="메뉴 열기"
    aria-expanded={drawerOpen}
    onclick={toggleDrawer}
  >
    ☰
  </button>
</header>

<div class="wiki-shell">
  {#if isMobile && drawerOpen}
    <button
      type="button"
      class="drawer-backdrop"
      aria-label="메뉴 닫기"
      onclick={closeDrawer}
    ></button>
  {/if}

  <aside class={`sidebar ${drawerOpen ? "open" : ""}`}>
    <nav aria-label="위키 메뉴" class="menu-nav">
      <ul class="menu-root">
        {#each tree as node}
          <ResponsiveMenuItem
            {node}
            {isMobile}
            {expandedIds}
            onToggle={toggleSubmenu}
            onNavigate={closeDrawer}
          />
        {/each}
      </ul>
    </nav>
  </aside>

  <main class="content">
    {@render children()}
  </main>
</div>
