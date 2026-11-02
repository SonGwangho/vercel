<script lang="ts">
  import { page } from "$app/state";
  import type { TreeNode } from "$lib/types/TreeMenu";
  import ResponsiveMenuItem from "./ResponsiveMenuItem.svelte";

  let {
    node,
    level = 0,
    isMobile = false,
    expandedIds = new Set<string>(),
    onToggle,
    onNavigate,
  }: {
    node: TreeNode<any>;
    level?: number;
    isMobile?: boolean;
    expandedIds?: Set<string>;
    onToggle?: (id: string) => void;
    onNavigate?: () => void;
  } = $props();

  const hasChildren = $derived(node.children.length > 0);
  let isExpanded = $state(false);

  $effect(() => {
    if (node.defaultOpen) {
      isExpanded = true;
    }
  });
</script>

<li class={`menu-item level-${level}`}>
  <div class="menu-entry">
    {#if hasChildren}
      <a
        href={node.path}
        class="menu-link menu-link-parent"
        class:active={page.url.pathname === node.path}
        aria-current={page.url.pathname === node.path ? "page" : undefined}
        onclick={() => isMobile && onNavigate?.()}
      >
        {node.name}
      </a>
      <button
        type="button"
        class="submenu-toggle"
        aria-label={isExpanded ? `${node.name} 하위 메뉴 닫기` : `${node.name} 하위 메뉴 열기`}
        title={isExpanded ? "하위 메뉴 닫기" : "하위 메뉴 열기"}
        aria-expanded={isExpanded}
        onclick={() => {
          isExpanded = !isExpanded;
          onToggle?.(node.id);
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d={isExpanded ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} />
        </svg>
      </button>
    {:else}
      <a href={node.path} class="menu-link" class:active={page.url.pathname === node.path} aria-current={page.url.pathname === node.path ? "page" : undefined} onclick={() => isMobile && onNavigate?.()}>
        {node.name}
      </a>
    {/if}
  </div>

  {#if hasChildren}
    <ul class={`submenu ${isExpanded ? "open" : ""}`}>
      {#each node.children as child}
        <ResponsiveMenuItem
          node={child}
          level={level + 1}
          {isMobile}
          {expandedIds}
          {onToggle}
          {onNavigate}
        />
      {/each}
    </ul>
  {/if}
</li>
