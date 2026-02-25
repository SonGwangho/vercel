<script lang="ts">
  import { buildTree } from "$lib";
  import favicon from "$lib/assets/favicon.ico";
  import ResponsiveMenuItem from "$lib/components/Tree/ResponsiveMenuItem.svelte";
  import "../app.css";
  import { onMount } from "svelte";

  let { data, children } = $props();

  const tree = $derived(buildTree(data.menus ?? []));
  const menuTabs = $derived(data.menuTabs ?? []);
  const activeMenu = $derived(data.activeMenu ?? "");
  const showSidebar = $derived(activeMenu !== "home");

  let isMobile = $state(false);
  let drawerOpen = $state(false);
  let desktopSidebarCollapsed = $state(false);
  let expandedIds = $state(new Set<string>());

  function detectViewport() {
    isMobile = window.innerWidth < 1024;

    if (!isMobile) {
      expandedIds = new Set();
    }
  }

  function toggleDrawer() {
    if (isMobile) {
      drawerOpen = !drawerOpen;
      return;
    }

    desktopSidebarCollapsed = !desktopSidebarCollapsed;
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
  <div class="topbar-left">
    <nav aria-label="Top menus" class="top-menu">
      {#each menuTabs as menu}
        <a
          href={menu.path}
          class={`top-menu-link ${activeMenu === menu.key ? "active" : ""}`}
          onclick={closeDrawer}
        >
          {menu.label}
        </a>
      {/each}
    </nav>
  </div>

  {#if showSidebar}
  <button
    type="button"
    class="hamburger"
    aria-label="Open menu"
    aria-expanded={drawerOpen}
    onclick={toggleDrawer}
  >
    &#9776;
  </button>
  {/if}
</header>

<div
  class={`wiki-shell ${showSidebar ? "has-sidebar" : "no-sidebar"} ${desktopSidebarCollapsed ? "sidebar-collapsed" : ""}`}
>
  {#if showSidebar && isMobile && drawerOpen}
    <button
      type="button"
      class="drawer-backdrop"
      aria-label="Close menu"
      onclick={closeDrawer}
    ></button>
  {/if}

  {#if showSidebar}
    <aside class={`sidebar ${isMobile && drawerOpen ? "open" : ""} ${!isMobile && desktopSidebarCollapsed ? "desktop-collapsed" : ""}`}>
      {#if !isMobile}
        <button
          type="button"
          class="sidebar-toggle-desktop"
          aria-label={desktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!desktopSidebarCollapsed}
          onclick={toggleDrawer}
        >
          {desktopSidebarCollapsed ? "›" : "‹"}
        </button>
      {/if}

      <nav aria-label="Side menu" class="menu-nav">
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
  {/if}

  <main class="content">
    {@render children()}
  </main>
</div>
