<script lang="ts">
  import { Table } from "$lib";
  import type { Column, User } from "$lib";
  import type { PageData } from "./$types";

  export let data: PageData;

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
    },
    {
      key: "age",
      header: "Age",
    },
  ];
</script>

<!-- <h1>h1</h1> -->

<!-- <Table data={data.data} {columns} /> -->

<!-- <a href="/about">About 가기</a> -->
