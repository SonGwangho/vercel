<script lang="ts">
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
</script>

<li class={`menu-item level-${level}`}>
  <div class="menu-entry">
    {#if hasChildren}
      <button
        type="button"
        class="menu-parent"
        aria-expanded={isExpanded}
        onclick={() => {
          isExpanded = !isExpanded;
          onToggle?.(node.id);
        }}
      >
        <span>{node.name}</span>
        <span class="submenu-indicator">{isExpanded ? "-" : "+"}</span>
      </button>
    {:else}
      <a href={node.path} class="menu-link" onclick={() => isMobile && onNavigate?.()}>
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
