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
  const isExpanded = $derived(expandedIds.has(node.id));
</script>

<li class={`menu-item level-${level}`}>
  <div class="menu-entry">
    <a href={node.path} class="menu-link" onclick={() => isMobile && onNavigate?.()}>{node.name}</a>

    {#if hasChildren}
      <button
        type="button"
        class="submenu-toggle"
        aria-label={`${node.name} 하위 메뉴 열기`}
        aria-expanded={isExpanded}
        onclick={() => onToggle?.(node.id)}
      >
        {isExpanded ? "−" : "+"}
      </button>
    {/if}
  </div>

  {#if hasChildren}
    <ul class={`submenu ${isMobile && isExpanded ? "mobile-open" : ""}`}>
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
