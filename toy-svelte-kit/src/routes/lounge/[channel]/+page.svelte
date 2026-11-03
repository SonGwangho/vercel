<script lang="ts">
  import LoungeRoom from "$lib/components/Lounge/LoungeRoom.svelte";
  let { data } = $props();
</script>

{#key data.channel.id}<LoungeRoom channel={data.channel} />{/key}
