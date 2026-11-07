<script lang="ts">
  import { scaleLinear } from 'd3';
  import type { ResultData } from '$lib/models';
  import { interval, fmtMeasurement, arxivUrl, h0Category, rowLabel } from '$lib/models';

  let { results }: { results: ResultData[] } = $props();

  // ΛCDM-only so the rows are comparable (model-dependent H0 from w0wa fits is kept out)
  const h0Results = results.filter((r) => r.params.H0 && r.model === 'LCDM');
  const perPaper = new Map<string, number>();
  for (const r of h0Results) perPaper.set(r.paperId, (perPaper.get(r.paperId) ?? 0) + 1);
  const rows = h0Results.map((r) => ({
    r, cat: h0Category(r), v: r.params.H0!.value, iv: interval(r.params.H0!),
    name: rowLabel(r, perPaper.get(r.paperId) ?? 1),
  }));
  const early = rows.filter((d) => d.cat === 'early').sort((a, b) => a.v - b.v);
  const late = rows.filter((d) => d.cat === 'late').sort((a, b) => a.v - b.v);
  const groups = [
    { id: 'early', title: 'Inferred from the early universe (CMB, BAO + BBN) assuming ΛCDM', color: '#3987e5', rows: early },
    { id: 'late', title: 'Measured in the late universe (distance ladder, lensing time delays)', color: '#d95926', rows: late },
  ];

  const ROW = 26, HEAD = 30, GAP = 18;
  let width = $state(720);
  const labelW = $derived(width < 640 ? 160 : 290);
  const m = $derived({ top: 8, right: 70, bottom: 36, left: labelW });
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const height = $derived(m.top + groups.reduce((s, g) => s + HEAD + g.rows.length * ROW + GAP, 0) + m.bottom);
  const lo = Math.min(62, ...rows.map((d) => d.iv[0] - 1));
  const hi = Math.max(78, ...rows.map((d) => d.iv[1] + 1));
  const x = $derived(scaleLinear().domain([Math.floor(lo), Math.ceil(hi)]).range([0, iw]));

  const ticks = $derived(x.ticks(8));
  let hover = $state<ResultData | null>(null);

  // vertical layout
  const layout = $derived.by(() => {
    let yCur = m.top;
    return groups.map((g) => {
      const head = yCur;
      yCur += HEAD;
      const items = g.rows.map((d, i) => ({ ...d, y: yCur + i * ROW + ROW / 2 }));
      yCur += g.rows.length * ROW + GAP;
      return { ...g, head, items };
    });
  });
  const plotBottom = $derived(height - m.bottom);
</script>

<figure class="fig">
  <ul class="legend">
    {#each groups as g}<li><span class="sw" style:background={g.color}></span>{g.id === 'early' ? 'early-universe inference' : 'late-universe measurement'}</li>{/each}
    <li class="hint">bars are 68% intervals · labels link to arXiv</li>
  </ul>
  <div class="plot" bind:clientWidth={width}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hubble constant measurements with 68% intervals, grouped by method">
      <g transform={`translate(${m.left},0)`}>
        {#each ticks as tk}
          <line class="grid" x1={x(tk)} x2={x(tk)} y1={m.top} y2={plotBottom} />
          <text class="tick" x={x(tk)} y={plotBottom + 16} text-anchor="middle">{tk}</text>
        {/each}
        <text class="axis-title" x={iw} y={plotBottom + 32} text-anchor="end">H₀  km/s/Mpc</text>
        {#each layout as g (g.id)}
          <text class="group" x={-m.left + 4} y={g.head + 18}>{g.title}</text>
          {#each g.items as d (d.r.key)}
            <g class="row" class:hot={hover?.key === d.r.key} onpointerenter={() => (hover = d.r)} onpointerleave={() => (hover = null)}>
              <rect x={-m.left} y={d.y - ROW / 2} width={width} height={ROW} fill="transparent" />
              <a href={arxivUrl(d.r.arxiv)} target="_blank" rel="noopener">
                <text class="label" x="-10" y={d.y} dy="0.32em" text-anchor="end">{width < 640 && d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name}</text>
              </a>
              <line class="whisker" x1={x(d.iv[0])} x2={x(d.iv[1])} y1={d.y} y2={d.y} stroke={g.color} />
              <circle class="dot" cx={x(d.v)} cy={d.y} r="4.5" fill={g.color} />
              <text class="value" x={iw + 8} y={d.y} dy="0.32em">{fmtMeasurement(d.r.params.H0)}</text>
            </g>
          {/each}
        {/each}
      </g>
    </svg>
    {#if hover}
      <div class="tooltip">
        <div class="tt-head">{hover.label}</div>
        <div class="tt-sub">{hover.authors} · {hover.year} · arXiv:{hover.arxiv}</div>
        <div>H₀ = {fmtMeasurement(hover.params.H0)} km/s/Mpc{hover.params.H0?.note ? ` — ${hover.params.H0.note}` : ''}</div>
        {#if hover.datasets.length}<div class="tt-data">{hover.datasets.join(' + ')}</div>{/if}
      </div>
    {/if}
  </div>
</figure>

<style>
  .fig { margin: 0; display: grid; gap: 0.6rem; }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; font-size: 0.85rem; color: var(--ink-2); }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 0.4rem; vertical-align: -1px; }
  .hint { color: var(--muted); margin-left: auto; }
  .plot { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 0.9rem; }
  svg { display: block; }
  .grid { stroke: var(--grid); shape-rendering: crispEdges; }
  .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis-title { fill: var(--ink-2); font-size: 12px; }
  .group { fill: var(--ink-2); font-size: 12px; font-weight: 600; }
  .label { fill: var(--ink-2); font-size: 12px; }
  .row a { cursor: pointer; }
  .row a:hover .label, .row.hot .label { fill: var(--ink); text-decoration: underline; }
  .whisker { stroke-width: 2; stroke-linecap: round; }
  .dot { stroke: var(--surface); stroke-width: 2; }
  .value { fill: var(--ink-2); font-size: 11px; font-variant-numeric: tabular-nums; }
  .tooltip { position: absolute; right: 12px; top: 8px; max-width: 320px; background: var(--bg); border: 1px solid var(--line-strong); border-radius: 0.6rem; padding: 0.6rem 0.75rem; font-size: 0.82rem; box-shadow: 0 8px 24px rgba(0,0,0,0.35); pointer-events: none; }
  .tt-head { font-weight: 600; }
  .tt-sub { color: var(--ink-2); margin-bottom: 0.3rem; }
  .tt-data { color: var(--muted); margin-top: 0.3rem; font-size: 0.78rem; }
</style>
