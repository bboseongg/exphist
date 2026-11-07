<script lang="ts">
  import { selection, MAX_MODELS } from '$lib/selection.svelte';
  import type { ResultData } from '$lib/models';
  import { MODEL_LABEL } from '$lib/models';

  let { drawable, showCustom = true }: { drawable: ResultData[]; showCustom?: boolean } = $props();

  const byKey = $derived(new Map(drawable.map((r) => [r.key, r])));
  const available = $derived(drawable.filter((r) => !selection.has(r.key)));
  let addValue = $state('');
  let customOpen = $state(false);

  function onAdd(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (v) selection.add(v);
    addValue = '';
  }

  function paramSummary(r: ResultData) {
    const p = r.params;
    const bits = [`H₀ ${p.H0!.value}`, `Ωₘ ${p.Om!.value}`];
    if (p.w0) bits.push(`w₀ ${p.w0.value}`);
    if (p.wa) bits.push(`wₐ ${p.wa.value}`);
    if (p.w) bits.push(`w ${p.w.value}`);
    return bits.join(' · ');
  }
</script>

<div class="picker" role="group" aria-label="Models shown in the figures">
  <ul class="chips">
    {#each selection.keys as key (key)}
      {@const r = byKey.get(key)}
      {#if r}
        <li class="chip" style:--c={selection.colorOf(key)}>
          <span class="swatch" aria-hidden="true"></span>
          <span class="chip-text">
            <span class="chip-name">{r.label}</span>
            <span class="chip-sub">{r.paperShort} · {r.year} · {MODEL_LABEL[r.model] ?? r.model} · {paramSummary(r)}</span>
          </span>
          <button class="x" type="button" onclick={() => selection.remove(key)} aria-label={`Remove ${r.label}`}>×</button>
        </li>
      {/if}
    {/each}
    {#if selection.custom.enabled}
      <li class="chip custom-chip">
        <span class="swatch dashed" aria-hidden="true"></span>
        <span class="chip-text">
          <span class="chip-name">Your model</span>
          <span class="chip-sub">H₀ {selection.custom.H0} · Ωₘ {selection.custom.Om.toFixed(3)} · w₀ {selection.custom.w0.toFixed(2)} · wₐ {selection.custom.wa.toFixed(2)}</span>
        </span>
        <button class="x" type="button" onclick={() => (selection.custom.enabled = false)} aria-label="Remove your model">×</button>
      </li>
    {/if}
    <li class="add">
      <label>
        <span class="visually-hidden">Add a published model</span>
        <select value={addValue} onchange={onAdd} disabled={selection.full}>
          <option value="">{selection.full ? `Up to ${MAX_MODELS} models` : '+ Add a published model'}</option>
          {#each available as r (r.key)}
            <option value={r.key}>{r.label} ({r.year})</option>
          {/each}
        </select>
      </label>
      {#if showCustom}
        <button type="button" class="ghost" aria-expanded={customOpen} onclick={() => (customOpen = !customOpen)}>
          {customOpen ? 'Hide sliders' : 'Set your own parameters'}
        </button>
      {/if}
    </li>
  </ul>

  {#if showCustom && customOpen}
    <div class="custom">
      <label class="toggle">
        <input type="checkbox" bind:checked={selection.custom.enabled} />
        Draw my model (dashed)
      </label>
      <label>
        <span>H₀ <output>{selection.custom.H0.toFixed(1)}</output> km/s/Mpc</span>
        <input type="range" min="55" max="80" step="0.1" bind:value={selection.custom.H0} oninput={() => (selection.custom.enabled = true)} />
      </label>
      <label>
        <span>Ωₘ <output>{selection.custom.Om.toFixed(3)}</output></span>
        <input type="range" min="0.05" max="0.6" step="0.001" bind:value={selection.custom.Om} oninput={() => (selection.custom.enabled = true)} />
      </label>
      <label>
        <span>w₀ <output>{selection.custom.w0.toFixed(2)}</output></span>
        <input type="range" min="-1.5" max="-0.3" step="0.01" bind:value={selection.custom.w0} oninput={() => (selection.custom.enabled = true)} />
      </label>
      <label>
        <span>wₐ <output>{selection.custom.wa.toFixed(2)}</output></span>
        <input type="range" min="-3" max="1" step="0.01" bind:value={selection.custom.wa} oninput={() => (selection.custom.enabled = true)} />
      </label>
      <button type="button" class="ghost" onclick={() => { selection.custom.H0 = 70; selection.custom.Om = 0.3; selection.custom.w0 = -1; selection.custom.wa = 0; }}>
        Reset to ΛCDM (70, 0.3)
      </button>
    </div>
  {/if}
</div>

<style>
  .picker { display: grid; gap: 0.75rem; }
  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: stretch; }
  .chip {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.4rem 0.5rem 0.4rem 0.7rem;
    border: 1px solid var(--line); border-radius: 0.6rem;
    background: var(--surface);
    max-width: 100%;
  }
  .swatch { width: 14px; height: 4px; border-radius: 2px; background: var(--c); flex: none; }
  .swatch.dashed { background: repeating-linear-gradient(90deg, var(--ink) 0 4px, transparent 4px 7px); }
  .chip-text { display: grid; line-height: 1.2; min-width: 0; }
  .chip-name { font-weight: 600; font-size: 0.95rem; }
  .chip-sub { color: var(--ink-2); font-size: 0.78rem; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48ch; }
  .x { background: none; border: 0; color: var(--ink-2); font-size: 1.1rem; line-height: 1; padding: 0.2rem 0.35rem; border-radius: 0.3rem; cursor: pointer; }
  .x:hover, .x:focus-visible { color: var(--ink); background: var(--line); }
  .add { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  select {
    appearance: none; -webkit-appearance: none;
    padding: 0.55rem 2rem 0.55rem 0.8rem; border-radius: 0.6rem;
    border: 1px dashed var(--line-strong); background: transparent; color: var(--ink);
    font: inherit; font-size: 0.92rem; max-width: 20rem;
    background-image: linear-gradient(45deg, transparent 50%, var(--ink-2) 50%), linear-gradient(135deg, var(--ink-2) 50%, transparent 50%);
    background-position: calc(100% - 15px) 55%, calc(100% - 10px) 55%;
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  }
  select:disabled { opacity: 0.6; }
  .ghost { background: transparent; border: 1px solid var(--line); color: var(--ink-2); border-radius: 0.6rem; padding: 0.5rem 0.8rem; font: inherit; font-size: 0.92rem; cursor: pointer; }
  .ghost:hover, .ghost:focus-visible { color: var(--ink); border-color: var(--line-strong); }
  .custom {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.6rem 1.25rem; align-items: end;
    padding: 0.9rem 1rem; border: 1px solid var(--line); border-radius: 0.8rem; background: var(--surface);
  }
  .custom label { display: grid; gap: 0.3rem; font-size: 0.9rem; color: var(--ink-2); }
  .custom label span { display: flex; justify-content: space-between; gap: 0.5rem; }
  .custom output { color: var(--ink); font-variant-numeric: tabular-nums; }
  .toggle { grid-column: 1 / -1; display: flex !important; align-items: center; gap: 0.5rem; color: var(--ink) !important; }
  input[type='range'] { width: 100%; accent-color: var(--ink); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
