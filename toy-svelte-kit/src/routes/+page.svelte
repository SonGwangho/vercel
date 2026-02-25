<script lang="ts">
  import type { TreeMenu } from "$lib/types/TreeMenu";

  let { data } = $props();

  const menus = $derived((data.menus ?? []) as TreeMenu[]);
  const activeMenu = $derived((data.activeMenu ?? "") as string);
  const parents = $derived(menus.filter((menu) => !menu.parent));
  const children = $derived(menus.filter((menu) => menu.parent));
</script>

<section class="home-dashboard">
  <h1>HOME</h1>
  <p class="home-subtitle">{activeMenu ? `${activeMenu} dashboard` : "Dashboard"}</p>

  <div class="home-stats">
    <article class="home-card">
      <h2>Parent menus</h2>
      <p>{parents.length}</p>
    </article>
    <article class="home-card">
      <h2>Child menus</h2>
      <p>{children.length}</p>
    </article>
  </div>

  <div class="home-links">
    <h2>Quick links</h2>
    {#if parents.length > 0}
      <ul>
        {#each parents as parent}
          <li>
            <a href={parent.path}>{parent.name}</a>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="home-subtitle">No menu items available.</p>
    {/if}
  </div>
</section>
