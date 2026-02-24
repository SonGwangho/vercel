<script lang="ts">
  export let node;

  let open = false;

  function toggle() {
    open = !open;
  }
</script>

<li>
  <div class="menu-row">
    {#if node.children.length}
      <button
        type="button"
        class="menu-button"
        aria-expanded={open}
        on:click={toggle}
      >
        <span>{node.name}</span>
        <span class={open ? "toggle open" : "toggle"}>{open ? "▾" : "▸"}</span>
      </button>
    {:else}
      <a href={node.path} class="menu-link">
        {node.name}
      </a>
    {/if}
  </div>

  {#if node.children.length && open}
    <ul class="submenu">
      {#each node.children as child}
        <svelte:self node={child} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .menu-row {
    padding: 0;
  }

  .menu-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: -webkit-fill-available;

    padding: 8px 0;
    border-radius: 8px;

    border: none;
    background: transparent;
    cursor: pointer;

    font-size: 13px;
    font-weight: 500;
    color: #333;
  }

  .menu-button:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }

  .submenu {
    padding: 0 8px;
  }

  .submenu li {
    padding: 4px;
  }

  a {
    text-decoration: none;
    color: inherit;
  }

  a:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }
</style>
