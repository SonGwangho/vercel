<script lang="ts">
  export let data: any[] = []
  export let columns: any[] = []
</script>

<table border="1" cellpadding="6">
  <thead>
    <tr>
      {#each columns as col}
        <th>{col.header}</th>
      {/each}
    </tr>
  </thead>

  <tbody>
    {#each data as row}
      <tr>
        {#each columns as col}
          <td>
            {#if col.cell}
              {col.cell(row)}
            {:else}
              {row[col.key] ?? '-'}
            {/if}
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    border-collapse: collapse;
  }
  thead {
    background-color: antiquewhite;
  }
</style>
