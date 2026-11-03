<script lang="ts">
  import type { LoungeColorPickerProps } from "$lib/types/LoungeAppearance";
  let { label, name, value, options, onSelect }: LoungeColorPickerProps = $props();
  const selectedName = $derived(options.find((option) => option.value === value)?.name ?? "");
</script>

<fieldset class="avatar-color-field"><legend>{label}<span>{selectedName}</span></legend>
  <div class="avatar-color-options">{#each options as option (option.value)}
    <label class:chosen={value === option.value} style={`--swatch:${option.value}`} title={option.name}>
      <input type="radio" {name} value={option.value} checked={value === option.value} onchange={() => onSelect(option.value)} aria-label={`${label} ${option.name}`} />
      <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 12 4 4 8-8" /></svg></span>
    </label>
  {/each}</div>
</fieldset>
