<script lang="ts">
  import { buildTree } from "$lib";
  import favicon from "$lib/assets/favicon.ico";
  import ResponsiveMenuItem from "$lib/components/Tree/ResponsiveMenuItem.svelte";
  import GlobalLoadingModal from "$lib/components/Modal/GlobalLoadingModal.svelte";
  import { Storage } from "$lib/utils/Storage";
  import "../app.css";
  import { onMount } from "svelte";

  let { data, children } = $props();

  const tree = $derived(buildTree(data.menus ?? []));
  const menuTabs = $derived(data.menuTabs ?? []);
  const activeMenu = $derived(data.activeMenu ?? "");
  const hideChrome = $derived(data.hideChrome ?? false);
  const showSidebar = $derived(activeMenu !== "home" && tree.length > 0);

  let isMobile = $state(false);
  let drawerOpen = $state(false);
  let desktopSidebarCollapsed = $state(false);
  let expandedIds = $state(new Set<string>());
  let isDarkMode = $state(false);

  const THEME_STORAGE_KEY = "app.theme.dark";

  function applyTheme(isDark: boolean) {
    isDarkMode = isDark;
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }

  function detectViewport() {
    isMobile = window.innerWidth < 1024;

    if (!isMobile) {
      drawerOpen = false;
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

  async function toggleTheme() {
    const next = !isDarkMode;
    applyTheme(next);

    try {
      await Storage.set(THEME_STORAGE_KEY, next);
    } catch (error) {
      console.error(error);
    }
  }

  onMount(() => {
    detectViewport();
    window.addEventListener("resize", detectViewport);

    (async () => {
      try {
        const stored = await Storage.get<boolean>(THEME_STORAGE_KEY);
        if (typeof stored === "boolean") {
          applyTheme(stored);
          return;
        }
      } catch (error) {
        console.error(error);
      }

      applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches);
    })();

    return () => window.removeEventListener("resize", detectViewport);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if hideChrome}
  <main class="standalone-content">
    {@render children()}
  </main>
{:else}
  <header class="topbar">
    <div class="topbar-left">
      <nav aria-label="주요 메뉴" class="top-menu">
        {#each menuTabs as menu}
          <a
            href={menu.path}
            class={`top-menu-link ${activeMenu === menu.key ? "active" : ""}`}
            aria-current={activeMenu === menu.key ? "page" : undefined}
            onclick={closeDrawer}
          >
            {menu.label}
          </a>
        {/each}
      </nav>
    </div>

    <div class="topbar-actions">
      {#if showSidebar}
        <button
          type="button"
          class="hamburger"
          aria-label="메뉴 열기"
          title="메뉴 열기"
          aria-expanded={drawerOpen}
          onclick={toggleDrawer}
        >
          <span aria-hidden="true">☰</span>
        </button>
      {/if}

      <button
        type="button"
        class="theme-toggle"
        aria-label={isDarkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
        title={isDarkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
        aria-pressed={isDarkMode}
        onclick={toggleTheme}
      >
        <span aria-hidden="true">{isDarkMode ? "☼" : "☾"}</span>
      </button>
    </div>
  </header>

  <div
    class={`wiki-shell ${showSidebar ? "has-sidebar" : "no-sidebar"} ${desktopSidebarCollapsed ? "sidebar-collapsed" : ""}`}
  >
    {#if showSidebar && isMobile && drawerOpen}
      <button
        type="button"
        class="drawer-backdrop"
        aria-label="메뉴 닫기"
        onclick={closeDrawer}
      ></button>
    {/if}

    {#if showSidebar}
      <aside class={`sidebar ${isMobile && drawerOpen ? "open" : ""} ${!isMobile && desktopSidebarCollapsed ? "desktop-collapsed" : ""}`}>
        {#if !isMobile}
          <button
            type="button"
            class="sidebar-toggle-desktop"
            aria-label={desktopSidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={desktopSidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            aria-expanded={!desktopSidebarCollapsed}
            onclick={toggleDrawer}
          >
            {desktopSidebarCollapsed ? "›" : "‹"}
          </button>
        {/if}

        <nav aria-label="세부 메뉴" class="menu-nav">
          {#if tree.length > 0}
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
          {/if}
        </nav>
      </aside>
    {/if}

    <main class="content">
      {@render children()}
    </main>
  </div>
{/if}

<GlobalLoadingModal />
