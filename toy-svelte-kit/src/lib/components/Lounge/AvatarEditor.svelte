<script lang="ts">
  import ColorPicker from "./ColorPicker.svelte";
  import { avatarOptions, isSkirt, randomAppearance } from "$lib/lounge/appearance";
  import type { LoungeAppearance, LoungeAppearanceSection, LoungeAvatarEditorProps } from "$lib/types/LoungeAppearance";
  let { value, disabled = false, onChange }: LoungeAvatarEditorProps = $props();
  let section = $state<LoungeAppearanceSection>("hair");
  const skirt = $derived(isSkirt(value));
  const selectedStyles = $derived(section === "hair" ? avatarOptions.hairStyles : section === "top" ? avatarOptions.topStyles : avatarOptions.bottomStyles);
  const style = $derived(section === "hair" ? value.hairStyle : section === "top" ? value.topStyle : value.bottomStyle);

  function update(change: Partial<LoungeAppearance>) { onChange({ ...value, ...change }); }
  function chooseStyle(id: string) {
    if (section === "hair") { const option = avatarOptions.hairStyles.find((item) => item.id === id); if (option) update({ hairStyle: option.id }); }
    else if (section === "top") { const option = avatarOptions.topStyles.find((item) => item.id === id); if (option) update({ topStyle: option.id }); }
    else { const option = avatarOptions.bottomStyles.find((item) => item.id === id); if (option) update({ bottomStyle: option.id }); }
  }
  function tabKeys(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = avatarOptions.sections;
    const index = options.findIndex((item) => item.id === section);
    section = options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length].id;
    document.getElementById(`avatar-tab-${section}`)?.focus();
  }
</script>

<fieldset class="avatar-editor" {disabled}>
  <legend>내 모습</legend>
  <div class="avatar-editor-heading"><p>마음에 드는 조합을 골라 보세요.</p><button class="avatar-random" type="button" onclick={() => onChange(randomAppearance())}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7h3c4 0 6 10 10 10h5m-4-4 4 4-4 4M3 17h3c1.5 0 3-1.5 4-3m4-4c1-1.5 1.5-3 3-3h4m-4-4 4 4-4 4" /></svg>무작위</button></div>
  <div class="avatar-tabs" role="tablist" aria-label="꾸밀 부위" onkeydown={tabKeys}>{#each avatarOptions.sections as tab}
    <button type="button" role="tab" id={`avatar-tab-${tab.id}`} aria-selected={section === tab.id} aria-controls="avatar-options" tabindex={section === tab.id ? 0 : -1} onclick={() => section = tab.id}>{tab.name}</button>
  {/each}</div>
  <div class="avatar-options" id="avatar-options" role="tabpanel" aria-labelledby={`avatar-tab-${section}`}>
    <div class="avatar-style-options" class:hair-styles={section === "hair"} class:top-styles={section === "top"} aria-label="모양">{#each selectedStyles as option (option.id)}<button type="button" class:chosen={style === option.id} aria-pressed={style === option.id} onclick={() => chooseStyle(option.id)}>{option.name}</button>{/each}</div>
    {#if section === "hair"}<ColorPicker label="머리색" name="hair-color" value={value.hairColor} options={avatarOptions.hairColors} onSelect={(hairColor) => update({ hairColor })} />
    {:else if section === "top"}<ColorPicker label="상의 색" name="top-color" value={value.topColor} options={avatarOptions.topColors} onSelect={(topColor) => update({ topColor })} />
    {:else}<ColorPicker label={skirt ? "치마 색" : "바지 색"} name="bottom-color" value={skirt ? value.skirtColor : value.pantsColor} options={avatarOptions.bottomColors} onSelect={(color) => update(skirt ? { skirtColor: color } : { pantsColor: color })} />{/if}
  </div>
</fieldset>
