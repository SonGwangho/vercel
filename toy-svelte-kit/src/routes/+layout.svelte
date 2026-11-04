<script lang="ts">
  import { buildTree } from "$lib";
  import favicon from "$lib/assets/favicon.ico";
  import ResponsiveMenuItem from "$lib/components/Tree/ResponsiveMenuItem.svelte";
  import GlobalLoadingModal from "$lib/components/Modal/GlobalLoadingModal.svelte";
  import AppVersion from "$lib/components/UI/AppVersion.svelte";
  import { Storage } from "$lib/utils/Storage";
  import "../app.css";
  import { onMount } from "svelte";

  let { data, children } = $props();

  const tree = $derived(buildTree(data.menus ?? []));
  const menuTabs = $derived(data.menuTabs ?? []);
  const activeMenu = $derived(data.activeMenu ?? "");
  const activeMenuLabel = $derived(menuTabs.find((menu) => menu.key === activeMenu)?.label ?? "메뉴");
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
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <header class="topbar">
    <div class="topbar-inner">
    <div class="topbar-left">
      <a class="brand-link" href="/" aria-label="장난감 웹 홈" onclick={closeDrawer}>
        <svg class="brand-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="9" height="9" rx="3" fill="currentColor" />
          <circle cx="20.5" cy="7.5" r="4.5" fill="currentColor" />
          <path d="M7.5 16 13 25H2l5.5-9Z" fill="currentColor" />
          <rect x="16" y="16" width="9" height="9" rx="3" fill="currentColor" />
        </svg>
        <span>장난감 웹</span>
        <AppVersion />
      </a>
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
          aria-label={drawerOpen ? "메뉴 닫기" : "메뉴 열기"}
          title={drawerOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={drawerOpen}
          aria-controls="sidebar-menu"
          onclick={toggleDrawer}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
            {#if drawerOpen}
              <path d="m6 6 12 12M6 18 18 6" />
            {:else}
              <path d="M4 6h16M4 12h16M4 18h16" />
            {/if}
          </svg>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if isDarkMode}
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
          {:else}
            <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />
          {/if}
        </svg>
      </button>
    </div>
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
      <aside id="sidebar-menu" aria-label={activeMenuLabel} class={`sidebar ${isMobile && drawerOpen ? "open" : ""} ${!isMobile && desktopSidebarCollapsed ? "desktop-collapsed" : ""}`}>
        <div class="sidebar-heading">{activeMenuLabel}</div>
        {#if !isMobile}
          <button
            type="button"
            class="sidebar-toggle-desktop"
            aria-label={desktopSidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={desktopSidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            aria-expanded={!desktopSidebarCollapsed}
            onclick={toggleDrawer}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d={desktopSidebarCollapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
            </svg>
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

    <main id="main-content" class="content" tabindex="-1">
      {@render children()}
    </main>
  </div>
{/if}

<GlobalLoadingModal />
