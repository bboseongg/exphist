<script lang="ts">
  import { scaleLinear, line as d3line } from 'd3';
  import { selection } from '$lib/selection.svelte';
  import type { ResultData } from '$lib/models';
  import { isDrawable, toCosmoParams } from '$lib/models';
  import { makeCosmology, Hz, aAccelerationOnset, zOf, type Cosmology } from '$lib/cosmology';

  let { results }: { results: ResultData[] } = $props();
  const drawable = results.filter(isDrawable);
  const byKey = new Map(drawable.map((r) => [r.key, r]));
  selection.init(drawable.filter((r) => r.featured).map((r) => r.key));

  type View = 'H' | 'adot';
  let view = $state<View>('adot');

  interface Curve { key: string; short: string; color: string; dashed: boolean; cosmo: Cosmology; zAcc: number | null }
  const curves = $derived.by<Curve[]>(() => {
    const out: Curve[] = [];
    for (const key of selection.keys) {
      const r = byKey.get(key);
      if (!r) continue;
      const cosmo = makeCosmology(toCosmoParams(r));
      const aAcc = aAccelerationOnset(cosmo);
      out.push({ key, short: r.label, color: selection.colorOf(key), dashed: false, cosmo, zAcc: aAcc === null ? null : zOf(aAcc) });
    }
    if (selection.custom.enabled) {
      const c = selection.custom;
      const cosmo = makeCosmology({ H0: c.H0, Om: c.Om, w0: c.w0, wa: c.wa });
      const aAcc = aAccelerationOnset(cosmo);
      out.push({ key: 'custom', short: 'Your model', color: 'var(--ink)', dashed: true, cosmo, zAcc: aAcc === null ? null : zOf(aAcc) });
    }
    return out;
  });

  const Z_MAX = 3;
  function value(c: Curve, z: number): number {
    const H = Hz(c.cosmo, z);
    return view === 'H' ? H : H / ((1 + z) * c.cosmo.H0);
  }

  let width = $state(720);
  const height = $derived(Math.max(240, Math.min(360, width * 0.45)));
  const m = { top: 16, right: 24, bottom: 42, left: 56 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);

  const x = $derived(scaleLinear().domain([0, Z_MAX]).range([0, iw]));
  const yDomain = $derived.by(() => {
    if (view === 'adot') {
      let lo = 1, hi = 1;
      for (const c of curves) for (let i = 0; i <= 60; i++) { const v = value(c, (Z_MAX * i) / 60); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      return [Math.min(0.6, lo * 0.95), Math.max(1.3, hi * 1.04)] as [number, number];
    }
    let hi = 100;
    for (const c of curves) hi = Math.max(hi, value(c, Z_MAX));
    return [0, hi * 1.05] as [number, number];
  });
  const y = $derived(scaleLinear().domain(yDomain).range([ih, 0]).nice());

  function path(c: Curve) {
    const N = 240;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) { const z = (Z_MAX * i) / N; pts.push([x(z), y(value(c, z))]); }
    return d3line()(pts) ?? '';
  }

  let hover = $state<{ z: number; px: number } | null>(null);
  function onMove(e: PointerEvent) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left - m.left;
    if (px < 0 || px > iw) { hover = null; return; }
    hover = { z: x.invert(px), px };
  }

  const tableZ = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];
</script>

<figure class="fig">
  <div class="controls">
    <div class="toggle" role="radiogroup" aria-label="Quantity">
      <button type="button" role="radio" aria-checked={view === 'adot'} class:on={view === 'adot'} onclick={() => (view = 'adot')}>Expansion speed ȧ / ȧ₀</button>
      <button type="button" role="radio" aria-checked={view === 'H'} class:on={view === 'H'} onclick={() => (view = 'H')}>Hubble rate H(z)</button>
    </div>
    <ul class="legend" aria-label="Models">
      {#each curves as c (c.key)}
        <li><span class="sw" class:dashed={c.dashed} style:--c={c.color}></span>{c.short}</li>
      {/each}
    </ul>
  </div>

  <div class="plot" bind:clientWidth={width}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={view === 'H' ? 'Hubble rate against redshift' : 'Expansion speed relative to today against redshift'}
      onpointermove={onMove} onpointerleave={() => (hover = null)}>
      <g transform={`translate(${m.left},${m.top})`}>
        {#each y.ticks(6) as tk}
          <line class="grid" x1="0" x2={iw} y1={y(tk)} y2={y(tk)} />
          <text class="tick" x="-8" y={y(tk)} dy="0.32em" text-anchor="end">{view === 'H' ? tk : tk.toFixed(2)}</text>
        {/each}
        {#each x.ticks(6) as tk}
          <text class="tick" x={x(tk)} y={ih + 18} text-anchor="middle">{tk}</text>
        {/each}
        <line class="axis" x1="0" x2={iw} y1={ih} y2={ih} />
        <line class="axis" x1="0" x2="0" y1="0" y2={ih} />
        <text class="axis-title" x={iw} y={ih + 36} text-anchor="end">redshift z</text>
        <text class="axis-title" transform={`translate(${-m.left + 14},${ih / 2}) rotate(-90)`} text-anchor="middle">{view === 'H' ? 'H(z)  km/s/Mpc' : 'ȧ(z) / ȧ(today)'}</text>
        {#if view === 'adot'}
          <line class="ref" x1="0" x2={iw} y1={y(1)} y2={y(1)} />
        {/if}
        {#each curves as c (c.key)}
          <path d={path(c)} class="curve" class:dashed={c.dashed} style:stroke={c.color} />
          {#if view === 'adot' && c.zAcc !== null && c.zAcc <= Z_MAX}
            <circle class="dot" cx={x(c.zAcc)} cy={y(value(c, c.zAcc))} r="4.5" style:fill={c.color} />
          {/if}
        {/each}
        {#if view === 'adot' && curves[0]?.zAcc !== null && curves[0]}
          <text class="note" x={x(curves[0].zAcc!) + 7} y={y(value(curves[0], curves[0].zAcc!)) + 14}>slowest point: acceleration begins (z ≈ {curves[0].zAcc!.toFixed(2)})</text>
        {/if}
        {#if hover}
          <line class="crosshair" x1={hover.px} x2={hover.px} y1="0" y2={ih} />
          {#each curves as c (c.key)}
            <circle class="dot" cx={hover.px} cy={y(value(c, hover.z))} r="4" style:fill={c.color} />
          {/each}
        {/if}
      </g>
    </svg>
    {#if hover}
      {@const left = hover.px + m.left > width * 0.6 ? hover.px + m.left - 230 : hover.px + m.left + 14}
      <div class="tooltip" style:left={`${left}px`} style:top={`${m.top + 8}px`}>
        <div class="tt-head">z = {hover.z.toFixed(2)}</div>
        {#each curves as c (c.key)}
          <div class="tt-row">
            <span class="sw" class:dashed={c.dashed} style:--c={c.color}></span>
            <span class="tt-name">{c.short}</span>
            <span class="tt-val">{view === 'H' ? `${Hz(c.cosmo, hover.z).toFixed(1)} km/s/Mpc` : `${value(c, hover.z).toFixed(3)} × today`}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <details class="tableview">
    <summary>Values as a table</summary>
    <table>
      <thead><tr><th>z</th>{#each curves as c (c.key)}<th>{c.short}<br/><small>{view === 'H' ? 'H, km/s/Mpc' : 'ȧ/ȧ₀'}</small></th>{/each}</tr></thead>
      <tbody>
        {#each tableZ as z}
          <tr><td>{z}</td>{#each curves as c (c.key)}<td>{view === 'H' ? Hz(c.cosmo, z).toFixed(1) : value(c, z).toFixed(3)}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .fig { margin: 0; display: grid; gap: 0.75rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.6rem 1.25rem; justify-content: space-between; align-items: center; }
  .toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 0.6rem; overflow: hidden; }
  .toggle button { background: transparent; border: 0; color: var(--ink-2); padding: 0.5rem 0.85rem; font: inherit; cursor: pointer; }
  .toggle button.on { background: var(--surface-2); color: var(--ink); }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; font-size: 0.85rem; color: var(--ink-2); }
  .sw { display: inline-block; width: 14px; height: 3px; background: var(--c); border-radius: 2px; margin-right: 0.45rem; vertical-align: 3px; }
  .sw.dashed { background: repeating-linear-gradient(90deg, var(--ink) 0 4px, transparent 4px 6px); }
  .plot { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 0.9rem; }
  svg { display: block; }
  .grid { stroke: var(--grid); shape-rendering: crispEdges; }
  .axis { stroke: var(--line-strong); shape-rendering: crispEdges; }
  .ref { stroke: var(--line-strong); stroke-dasharray: 2 4; }
  .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis-title { fill: var(--ink-2); font-size: 12px; }
  .note { fill: var(--ink-2); font-size: 11px; }
  .curve { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .curve.dashed { stroke-dasharray: 6 5; }
  .dot { stroke: var(--surface); stroke-width: 2; }
  .crosshair { stroke: var(--muted); }
  .tooltip { position: absolute; pointer-events: none; width: 216px; background: var(--bg); border: 1px solid var(--line-strong); border-radius: 0.6rem; padding: 0.55rem 0.7rem; font-size: 0.82rem; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
  .tt-head { font-weight: 600; margin-bottom: 0.3rem; }
  .tt-row { display: grid; grid-template-columns: 20px 1fr; align-items: center; margin: 0.15rem 0; }
  .tt-name { color: var(--ink-2); }
  .tt-val { grid-column: 2; font-variant-numeric: tabular-nums; }
  .tableview summary { cursor: pointer; color: var(--ink-2); font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.6rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); }
  th { color: var(--ink-2); font-weight: 500; }
  small { color: var(--muted); font-weight: 400; }
</style>
