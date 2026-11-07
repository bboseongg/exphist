<script lang="ts">
  import { scaleLinear, symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolCross, symbolStar, symbolWye } from 'd3';
  import type { ResultData } from '$lib/models';
  import { interval, fmtMeasurement, arxivUrl, MODEL_LABEL } from '$lib/models';
  import { fmtSigma } from '$lib/format';

  let { results }: { results: ResultData[] } = $props();

  const points = results.filter((r) => r.params.w0 && r.params.wa);
  const years = [...new Set(points.map((p) => p.year))].sort();
  let throughYear = $state(years[years.length - 1] ?? 2026);

  // ordinal colour by year (one hue, light → dark = older → newer), validated for the dark surface
  const YEAR_RAMP = ['#cde2fb', '#86b6ef', '#3987e5'];
  function yearColor(y: number) {
    const i = years.indexOf(y);
    if (years.length <= 1) return YEAR_RAMP[2];
    return YEAR_RAMP[Math.round((i / (years.length - 1)) * (YEAR_RAMP.length - 1))];
  }

  // shape by paper (secondary encoding so identity never rides on colour alone)
  const SHAPES = [symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolCross, symbolStar, symbolWye];
  const paperIds = [...new Set(points.map((p) => p.paperId))];
  const shapeOf = (paperId: string) => symbol(SHAPES[paperIds.indexOf(paperId) % SHAPES.length], 64)() ?? '';
  const paperShort = new Map(points.map((p) => [p.paperId, p.paperShort]));

  const W0 = [-1.45, -0.1] as [number, number];
  const WA = [-3.6, 1.1] as [number, number];
  const inRange = (r: ResultData) => {
    const [a, b] = interval(r.params.w0!);
    const [c, d] = interval(r.params.wa!);
    return a > W0[0] - 0.4 && b < W0[1] + 0.4 && c > WA[0] - 1 && d < WA[1] + 1;
  };
  const shown = $derived(points.filter((p) => p.year <= throughYear && inRange(p)));
  const offscale = points.filter((p) => !inRange(p));

  let width = $state(720);
  const height = $derived(Math.max(300, Math.min(440, width * 0.6)));
  const m = { top: 18, right: 22, bottom: 44, left: 56 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);
  const x = $derived(scaleLinear().domain(W0).range([0, iw]));
  const y = $derived(scaleLinear().domain(WA).range([ih, 0]));

  // nearest-point hover (hit radius 24 px), click to pin
  let hover = $state<ResultData | null>(null);
  let pinned = $state(false);
  function onMove(e: PointerEvent) {
    if (pinned) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left - m.left, py = e.clientY - rect.top - m.top;
    let best: ResultData | null = null, bd = 24 * 24;
    for (const p of shown) {
      const dx = x(p.params.w0!.value) - px, dy = y(p.params.wa!.value) - py;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    hover = best;
  }
  function onClick() { if (hover) pinned = !pinned; else pinned = false; }

  const ttPos = $derived.by(() => {
    if (!hover) return { left: 0, top: 0 };
    const px = x(hover.params.w0!.value) + m.left, py = y(hover.params.wa!.value) + m.top;
    return { left: px > width * 0.55 ? px - 290 : px + 16, top: Math.max(4, Math.min(py - 20, height - 150)) };
  });

  // phantom-divide line w0 + wa = −1  (w → −1 as a → 0)
  const pdX1 = W0[0], pdY1 = -1 - W0[0], pdX2 = -1 - WA[0], pdY2 = WA[0];
</script>

<figure class="fig">
  <div class="controls">
    <label class="year">
      <span>Results through <output>{throughYear}</output></span>
      <input type="range" min={years[0]} max={years[years.length - 1]} step="1" bind:value={throughYear} list="years" />
    </label>
    <ul class="legend" aria-label="Papers">
      {#each paperIds as pid}
        <li><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d={shapeOf(pid)} fill="var(--ink-2)" /></svg>{paperShort.get(pid)}</li>
      {/each}
      <li class="years">
        {#each years as yv}<span><i style:background={yearColor(yv)}></i>{yv}</span>{/each}
      </li>
    </ul>
  </div>

  <div class="plot" bind:clientWidth={width}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="Dark-energy equation-of-state plane: w0 against wa for published fits"
      onpointermove={onMove} onpointerleave={() => { if (!pinned) hover = null; }} onclick={onClick}>
      <g transform={`translate(${m.left},${m.top})`}>
        {#each x.ticks(6) as tk}
          <line class="grid" x1={x(tk)} x2={x(tk)} y1="0" y2={ih} />
          <text class="tick" x={x(tk)} y={ih + 18} text-anchor="middle">{tk}</text>
        {/each}
        {#each y.ticks(6) as tk}
          <line class="grid" x1="0" x2={iw} y1={y(tk)} y2={y(tk)} />
          <text class="tick" x="-8" y={y(tk)} dy="0.32em" text-anchor="end">{tk}</text>
        {/each}
        <line class="axis" x1="0" x2={iw} y1={ih} y2={ih} />
        <line class="axis" x1="0" x2="0" y1="0" y2={ih} />
        <text class="axis-title" x={iw} y={ih + 38} text-anchor="end">w₀ — equation of state today</text>
        <text class="axis-title" transform={`translate(${-m.left + 14},${ih / 2}) rotate(-90)`} text-anchor="middle">wₐ — how fast it changes</text>

        <!-- reference lines -->
        <line class="ref" x1={x(-1)} x2={x(-1)} y1="0" y2={ih} />
        <line class="ref" x1="0" x2={iw} y1={y(0)} y2={y(0)} />
        <line class="ref thin" x1={x(pdX1)} y1={y(pdY1)} x2={x(pdX2)} y2={y(pdY2)} />
        <text class="note" x={x(-1.42)} y={y(0.52) } >w₀ + wₐ = −1</text>
        <text class="note" x={x(-1.42)} y={y(0.52) + 13}>(phantom at early times below this line)</text>
        <circle class="lambda" cx={x(-1)} cy={y(0)} r="6" />
        <text class="note strong" x={x(-1) + 10} y={y(0) - 8}>Λ (−1, 0)</text>

        <!-- points -->
        {#each shown as p (p.key)}
          {@const cx = x(p.params.w0!.value)}
          {@const cy = y(p.params.wa!.value)}
          {@const [w0lo, w0hi] = interval(p.params.w0!)}
          {@const [walo, wahi] = interval(p.params.wa!)}
          {@const col = yearColor(p.year)}
          <g class="pt" class:dim={hover && hover.key !== p.key} class:hot={hover?.key === p.key}>
            <line x1={x(w0lo)} x2={x(w0hi)} y1={cy} y2={cy} stroke={col} />
            <line x1={cx} x2={cx} y1={y(walo)} y2={y(wahi)} stroke={col} />
            <path d={shapeOf(p.paperId)} transform={`translate(${cx},${cy})`} fill={col} class="mark" />
          </g>
        {/each}
      </g>
    </svg>
    {#if hover}
      <div class="tooltip" class:pinned style:left={`${ttPos.left}px`} style:top={`${ttPos.top}px`}>
        <div class="tt-head">{hover.label}</div>
        <div class="tt-sub">{hover.paperShort} · {hover.year} · {MODEL_LABEL[hover.model] ?? hover.model}</div>
        <div class="tt-vals">
          <span>w₀ = {fmtMeasurement(hover.params.w0)}</span>
          <span>wₐ = {fmtMeasurement(hover.params.wa)}</span>
          {#if hover.preferenceOverLCDM !== undefined}<span>vs ΛCDM: {fmtSigma(hover.preferenceOverLCDM)}</span>{/if}
        </div>
        {#if hover.datasets.length}<div class="tt-data">{hover.datasets.join(' + ')}</div>{/if}
        {#if pinned}
          <a href={arxivUrl(hover.arxiv)} target="_blank" rel="noopener">arXiv:{hover.arxiv} ↗</a>
          <div class="tt-hint">click the plot to unpin</div>
        {:else}
          <div class="tt-hint">click to pin</div>
        {/if}
      </div>
    {/if}
  </div>

  {#if offscale.length}
    <p class="offscale">Outside the plotted range: {#each offscale as p, i}{i ? '; ' : ''}{p.label} (w₀ = {fmtMeasurement(p.params.w0)}, wₐ = {fmtMeasurement(p.params.wa)}){/each}.</p>
  {/if}

  <details class="tableview">
    <summary>All w₀–wₐ results as a table</summary>
    <table>
      <thead><tr><th>Year</th><th>Result</th><th>w₀</th><th>wₐ</th><th>vs ΛCDM</th><th>Paper</th></tr></thead>
      <tbody>
        {#each points as p (p.key)}
          <tr>
            <td>{p.year}</td><td>{p.label}</td>
            <td>{fmtMeasurement(p.params.w0)}</td><td>{fmtMeasurement(p.params.wa)}</td>
            <td>{fmtSigma(p.preferenceOverLCDM)}</td>
            <td><a href={arxivUrl(p.arxiv)} target="_blank" rel="noopener">{p.arxiv}</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .fig { margin: 0; display: grid; gap: 0.75rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; justify-content: space-between; align-items: center; }
  .year { display: grid; gap: 0.3rem; min-width: 14rem; font-size: 0.9rem; color: var(--ink-2); }
  .year output { color: var(--ink); font-weight: 600; }
  .year input { accent-color: var(--ink); }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem 0.9rem; font-size: 0.82rem; color: var(--ink-2); align-items: center; }
  .legend svg { margin-right: 0.35rem; vertical-align: -2px; }
  .legend .years { display: inline-flex; gap: 0.6rem; padding-left: 0.6rem; border-left: 1px solid var(--line); }
  .legend .years i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 0.3rem; vertical-align: -1px; }
  .plot { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 0.9rem; }
  svg { display: block; }
  .grid { stroke: var(--grid); shape-rendering: crispEdges; }
  .axis { stroke: var(--line-strong); shape-rendering: crispEdges; }
  .ref { stroke: var(--line-strong); }
  .ref.thin { stroke-dasharray: 3 4; }
  .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis-title { fill: var(--ink-2); font-size: 12px; }
  .note { fill: var(--muted); font-size: 11px; }
  .note.strong { fill: var(--ink-2); font-weight: 600; }
  .lambda { fill: var(--surface); stroke: var(--ink); stroke-width: 2; }
  .pt line { stroke-width: 1.25; opacity: 0.9; }
  .pt .mark { stroke: var(--surface); stroke-width: 2; }
  .pt { transition: opacity 120ms; }
  .pt.dim { opacity: 0.35; }
  .tooltip { position: absolute; width: 276px; background: var(--bg); border: 1px solid var(--line-strong); border-radius: 0.6rem; padding: 0.6rem 0.75rem; font-size: 0.82rem; box-shadow: 0 8px 24px rgba(0,0,0,0.35); pointer-events: none; }
  .tooltip.pinned { pointer-events: auto; }
  .tt-head { font-weight: 600; }
  .tt-sub { color: var(--ink-2); margin-bottom: 0.35rem; }
  .tt-vals { display: grid; gap: 0.1rem; font-variant-numeric: tabular-nums; }
  .tt-data { color: var(--muted); margin-top: 0.35rem; font-size: 0.78rem; }
  .tt-hint { color: var(--muted); margin-top: 0.35rem; font-size: 0.75rem; }
  .tooltip a { color: var(--ink); display: inline-block; margin-top: 0.4rem; }
  .offscale { margin: 0; color: var(--muted); font-size: 0.85rem; }
  .tableview summary { cursor: pointer; color: var(--ink-2); font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.6rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--ink-2); font-weight: 500; }
  td a { color: var(--ink-2); }
</style>
