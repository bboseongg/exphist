<script lang="ts">
  import { onMount } from 'svelte';
  import { scaleLinear, scaleLog, line as d3line, format as d3format } from 'd3';
  import { selection } from '$lib/selection.svelte';
  import type { ResultData } from '$lib/models';
  import { isDrawable, toCosmoParams } from '$lib/models';
  import {
    makeCosmology,
    scaleFactorTable,
    scaleFactorAt,
    timeAt,
    densityFractions,
    deceleration,
    hubbleRate,
    temperature,
    age,
    aAccelerationOnset,
    aDarkEnergyDomination,
    type Cosmology,
    type ScaleFactorTable,
  } from '$lib/cosmology';
  import { fmtTime, fmtTimeAxis, fmtScaleFactor, fmtRedshift, fmtTemperature, fmtPercent } from '$lib/format';
  import ModelPicker from './ModelPicker.svelte';

  let { results }: { results: ResultData[] } = $props();

  const drawable = results.filter(isDrawable);
  const byKey = new Map(drawable.map((r) => [r.key, r]));
  selection.init(drawable.filter((r) => r.featured).map((r) => r.key));

  // ---- curves -------------------------------------------------------------
  interface Curve {
    key: string;
    label: string;
    short: string;
    color: string;
    dashed: boolean;
    cosmo: Cosmology;
    table: ScaleFactorTable;
    age: number;
    aAcc: number | null;
    aDE: number | null;
  }

  function buildCurve(key: string, label: string, short: string, color: string, dashed: boolean, cosmo: Cosmology): Curve {
    return {
      key, label, short, color, dashed, cosmo,
      table: scaleFactorTable(cosmo, 1e-8, 40, 2000),
      age: age(cosmo),
      aAcc: aAccelerationOnset(cosmo),
      aDE: aDarkEnergyDomination(cosmo),
    };
  }

  const curves = $derived.by<Curve[]>(() => {
    const out: Curve[] = [];
    for (const key of selection.keys) {
      const r = byKey.get(key);
      if (!r) continue;
      out.push(buildCurve(key, r.label, r.label, selection.colorOf(key), false, makeCosmology(toCosmoParams(r))));
    }
    if (selection.custom.enabled) {
      const c = selection.custom;
      out.push(buildCurve('custom', 'Your model', 'Your model', 'var(--ink)', true, makeCosmology({ H0: c.H0, Om: c.Om, w0: c.w0, wa: c.wa })));
    }
    return out;
  });

  const primary = $derived(curves[0]);

  // ---- time axis ----------------------------------------------------------
  const T_MAX = 26; // Gyr — a little past today, so the acceleration shows
  const T_MIN_LOG = 1e-6; // 1000 years
  let axis = $state<'linear' | 'log'>('linear');

  function posToTime(pos: number) {
    return axis === 'linear' ? pos * T_MAX : T_MIN_LOG * Math.pow(T_MAX / T_MIN_LOG, pos);
  }
  function timeToPos(t: number) {
    return axis === 'linear' ? t / T_MAX : Math.log(Math.max(t, T_MIN_LOG) / T_MIN_LOG) / Math.log(T_MAX / T_MIN_LOG);
  }

  // ---- playback -----------------------------------------------------------
  let tPlay = $state(13.8);
  let playing = $state(false);
  let speed = $state(1);
  const DURATION_S = 14;
  let raf: number | null = null;
  let last = 0;

  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    let pos = timeToPos(tPlay) + (dt * speed) / DURATION_S;
    if (pos >= 1) {
      pos = 1;
      playing = false;
    }
    tPlay = posToTime(pos);
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (timeToPos(tPlay) >= 0.999) tPlay = posToTime(0);
    playing = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
  }
  function restart() {
    tPlay = posToTime(0);
    if (!playing) play();
  }
  function jumpToToday() {
    pause();
    if (primary) tPlay = primary.age;
  }

  let reducedMotion = false;
  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (primary) tPlay = primary.age;
    if (!reducedMotion) {
      // one orchestrated moment: play the history once on arrival
      tPlay = posToTime(0);
      const id = setTimeout(play, 600);
      return () => { clearTimeout(id); pause(); };
    }
    return () => pause();
  });

  // ---- geometry -----------------------------------------------------------
  let plotWidth = $state(720);
  const H = $derived(Math.max(260, Math.min(400, plotWidth * 0.5)));
  const m = { top: 18, right: 22, bottom: 42, left: 56 };
  const iw = $derived(Math.max(10, plotWidth - m.left - m.right));
  const ih = $derived(H - m.top - m.bottom);

  const aTop = $derived.by(() => {
    let top = 1.3;
    for (const c of curves) top = Math.max(top, scaleFactorAt(c.table, T_MAX));
    return top * 1.06;
  });

  const x = $derived(
    axis === 'linear'
      ? scaleLinear().domain([0, T_MAX]).range([0, iw])
      : scaleLog().domain([T_MIN_LOG, T_MAX]).range([0, iw]),
  );
  const A_MIN_LOG = 1e-5;
  const y = $derived(
    axis === 'linear'
      ? scaleLinear().domain([0, aTop]).range([ih, 0]).nice()
      : scaleLog().domain([A_MIN_LOG, aTop]).range([ih, 0]),
  );

  const xTicks = $derived(axis === 'linear' ? x.ticks(7) : [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10]);
  const yTicks = $derived(axis === 'linear' ? y.ticks(6) : [1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10].filter((v) => v <= aTop));
  const fmtA = d3format('.2~r');
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function fmtLogTick(v: number): string {
    if (v >= 0.1) return fmtA(v);
    const e = Math.round(Math.log10(v));
    return '10⁻' + String(-e).split('').map((d) => SUP[+d]).join('');
  }
  const accMarker = $derived.by(() => {
    if (!primary || primary.aAcc === null) return null;
    const t = timeAt(primary.table, primary.aAcc);
    if (axis === 'log' && t < T_MIN_LOG) return null;
    return { px: x(t), py: y(primary.aAcc) };
  });

  function samplePath(c: Curve): string {
    const N = 360;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = posToTime(i / N);
      const a = scaleFactorAt(c.table, t);
      if (axis === 'log' && a < A_MIN_LOG) continue;
      if (axis === 'linear' && t === 0) { pts.push([x(0), y(0)]); continue; }
      pts.push([x(t), y(Math.min(a, aTop * 1.5))]);
    }
    return d3line()(pts) ?? '';
  }

  // ---- readouts -----------------------------------------------------------
  const aPlay = $derived(primary ? scaleFactorAt(primary.table, tPlay) : 1);
  const frac = $derived(primary ? densityFractions(primary.cosmo, aPlay) : null);
  const q = $derived(primary ? deceleration(primary.cosmo, aPlay) : 0);
  const Hnow = $derived(primary ? hubbleRate(primary.cosmo, aPlay) : 0);
  const Tnow = $derived(primary ? temperature(primary.cosmo, aPlay) : 0);
  const era = $derived.by(() => {
    if (!frac) return '';
    if (frac.radiation > frac.matter && frac.radiation > frac.darkEnergy) return 'radiation era';
    if (frac.matter > frac.darkEnergy) return 'matter era';
    return 'dark-energy era';
  });
  const relToToday = $derived(primary ? tPlay - primary.age : 0);

  // ---- hover --------------------------------------------------------------
  let hover = $state<{ t: number; px: number } | null>(null);
  function onMove(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left - m.left;
    if (px < 0 || px > iw) { hover = null; return; }
    hover = { t: x.invert(px), px };
  }
  function onClickPlot(e: PointerEvent) {
    if (!hover) return;
    pause();
    tPlay = hover.t;
  }

  // ---- galaxy patch (canvas) ---------------------------------------------
  let canvas: HTMLCanvasElement | undefined = $state();
  const PATCH = 230;
  // deterministic comoving positions in a disc
  const galaxies = (() => {
    let s = 20260101;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pts: { x: number; y: number; r: number }[] = [];
    while (pts.length < 170) {
      const u = rnd() * 2 - 1, v = rnd() * 2 - 1;
      if (u * u + v * v <= 1) pts.push({ x: u, y: v, r: 1 + rnd() * 1.6 });
    }
    return pts;
  })();

  $effect(() => {
    if (!canvas || !frac) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = PATCH;
    if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const a = aPlay;
    // plasma glow: opaque above ~3000 K, gone by ~ 400 K
    const T = Tnow;
    const glow = Math.max(0, Math.min(1, (Math.log10(T) - Math.log10(400)) / (Math.log10(3000) - Math.log10(400))));
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
      g.addColorStop(0, `rgba(255, 214, 160, ${0.95 * glow})`);
      g.addColorStop(0.6, `rgba(217, 89, 38, ${0.75 * glow})`);
      g.addColorStop(1, `rgba(217, 89, 38, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    // galaxies fade in after the dark ages (z ≈ 30 → 6)
    const vis = Math.max(0.12, Math.min(1, (a - 1 / 31) / (1 / 7 - 1 / 31)));
    const R = size * 0.44 * a; // disc radius ∝ a (fills the patch today)
    for (const g of galaxies) {
      const px = cx + g.x * R, py = cy + g.y * R;
      if (px < -4 || py < -4 || px > size + 4 || py > size + 4) continue;
      ctx.beginPath();
      ctx.arc(px, py, g.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232, 236, 247, ${vis})`;
      ctx.fill();
    }
  });

  const rulerMpc = $derived(100 * aPlay); // a patch 100 Mpc across today
  const rulerPx = $derived(Math.min(PATCH, PATCH * 0.9 * aPlay));

  // ---- milestone table ----------------------------------------------------
  const milestones = $derived(
    curves.map((c) => ({
      c,
      recomb: timeAt(c.table, 1 / 1091),
      z10: timeAt(c.table, 1 / 11),
      acc: c.aAcc === null ? null : timeAt(c.table, c.aAcc),
      de: c.aDE === null ? null : timeAt(c.table, c.aDE),
      zAcc: c.aAcc === null ? null : 1 / c.aAcc - 1,
      aFuture: scaleFactorAt(c.table, T_MAX),
    })),
  );
</script>

<figure class="fig">
  <div class="controls">
    <div class="transport" role="group" aria-label="Playback">
      <button class="play" type="button" onclick={() => (playing ? pause() : play())} aria-pressed={playing}>
        {#if playing}
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/></svg> Pause
        {:else}
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z" fill="currentColor"/></svg> Play
        {/if}
      </button>
      <button class="ghost" type="button" onclick={restart}>Replay</button>
      <button class="ghost" type="button" onclick={jumpToToday}>Today</button>
      <label class="speed">
        <span class="visually-hidden">Speed</span>
        <select bind:value={speed}>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={3}>3×</option>
        </select>
      </label>
    </div>
    <div class="axis-toggle" role="radiogroup" aria-label="Time axis">
      <button type="button" role="radio" aria-checked={axis === 'linear'} class:on={axis === 'linear'} onclick={() => (axis = 'linear')}>Linear time</button>
      <button type="button" role="radio" aria-checked={axis === 'log'} class:on={axis === 'log'} onclick={() => (axis = 'log')}>Log time</button>
    </div>
  </div>

  <div class="scrub">
    <label>
      <span class="visually-hidden">Cosmic time</span>
      <input
        type="range" min="0" max="1" step="0.0005"
        value={timeToPos(tPlay)}
        oninput={(e) => { pause(); tPlay = posToTime(+(e.currentTarget as HTMLInputElement).value); }}
        aria-valuetext={fmtTime(tPlay) + ' after the Big Bang'}
      />
    </label>
  </div>

  <div class="stage">
    <div class="left">
    <div class="plot" bind:clientWidth={plotWidth}>
      <svg
        width={plotWidth} height={H} viewBox={`0 0 ${plotWidth} ${H}`}
        role="img" aria-label="Scale factor of the universe against cosmic time for the selected models"
        onpointermove={onMove} onpointerleave={() => (hover = null)} onclick={onClickPlot}
      >
        <g transform={`translate(${m.left},${m.top})`}>
          <!-- grid -->
          {#each yTicks as tk}
            <line class="grid" x1="0" x2={iw} y1={y(tk)} y2={y(tk)} />
          {/each}
          {#each xTicks as tk}
            <line class="grid" y1="0" y2={ih} x1={x(tk)} x2={x(tk)} />
          {/each}
          <!-- axes -->
          <line class="axis" x1="0" x2={iw} y1={ih} y2={ih} />
          <line class="axis" x1="0" x2="0" y1="0" y2={ih} />
          {#each xTicks as tk}
            <text class="tick" x={x(tk)} y={ih + 18} text-anchor="middle">{fmtTimeAxis(tk)}</text>
          {/each}
          {#each yTicks as tk}
            <text class="tick" x="-8" y={y(tk)} dy="0.32em" text-anchor="end">{axis === 'linear' ? fmtA(tk) : fmtLogTick(tk)}</text>
          {/each}
          <text class="axis-title" x={iw} y={ih + 36} text-anchor="end">time since the Big Bang</text>
          <text class="axis-title" transform={`translate(${-m.left + 14},${ih / 2}) rotate(-90)`} text-anchor="middle">scale factor a</text>

          <!-- today (primary model) -->
          {#if primary}
            {@const tx = x(primary.age)}
            {@const todayRight = tx > iw - 120}
            <line class="today" x1={tx} x2={tx} y1="0" y2={ih} />
            <text class="note" x={todayRight ? tx - 5 : tx + 5} y="12" text-anchor={todayRight ? 'end' : 'start'}>today · {primary.age.toFixed(2)} Gyr</text>
            {#if accMarker}
              {@const left = accMarker.px < 150}
              <circle class="marker" cx={accMarker.px} cy={accMarker.py} r="4.5" />
              <text class="note" x={left ? accMarker.px + 8 : accMarker.px - 8} y={accMarker.py + 4} text-anchor={left ? 'start' : 'end'}>acceleration begins</text>
            {/if}
          {/if}

          <!-- curves -->
          {#each curves as c (c.key)}
            <path d={samplePath(c)} class="curve" class:dashed={c.dashed} style:stroke={c.color} />
          {/each}

          <!-- playhead -->
          {#if primary}
            <line class="playhead" x1={x(Math.max(tPlay, axis === 'log' ? T_MIN_LOG : 0))} x2={x(Math.max(tPlay, axis === 'log' ? T_MIN_LOG : 0))} y1="0" y2={ih} />
            {#each curves as c (c.key)}
              {@const a = scaleFactorAt(c.table, tPlay)}
              {#if axis === 'linear' || a >= A_MIN_LOG}
                <circle class="dot" cx={x(Math.max(tPlay, axis === 'log' ? T_MIN_LOG : 0))} cy={y(Math.min(a, aTop))} r="5" style:fill={c.color} />
              {/if}
            {/each}
          {/if}

          <!-- hover crosshair -->
          {#if hover}
            <line class="crosshair" x1={hover.px} x2={hover.px} y1="0" y2={ih} />
          {/if}
        </g>
      </svg>
      {#if hover}
        {@const left = hover.px + m.left > plotWidth * 0.6 ? hover.px + m.left - 230 : hover.px + m.left + 14}
        <div class="tooltip" style:left={`${left}px`} style:top={`${m.top + 8}px`}>
          <div class="tt-head">{fmtTime(hover.t)} after the Big Bang</div>
          {#each curves as c (c.key)}
            {@const a = scaleFactorAt(c.table, hover.t)}
            <div class="tt-row">
              <span class="tt-swatch" class:dashed={c.dashed} style:--c={c.color}></span>
              <span class="tt-name">{c.short}</span>
              <span class="tt-val">a = {fmtScaleFactor(a)} · z = {fmtRedshift(a)}</span>
            </div>
          {/each}
          <div class="tt-hint">click to move the playhead</div>
        </div>
      {/if}
    </div>

    <div class="picker-wrap">
      <ModelPicker drawable={drawable} />
    </div>

    <details class="tableview">
      <summary>Milestones as a table</summary>
      <table>
        <thead>
          <tr><th>Model</th><th>Recombination<br/><small>a = 1/1091</small></th><th>z = 10</th><th>Acceleration begins</th><th>Dark energy overtakes matter</th><th>Today</th><th>a at {T_MAX} Gyr</th></tr>
        </thead>
        <tbody>
          {#each milestones as ms (ms.c.key)}
            <tr>
              <td><span class="sw" style:background={ms.c.color}></span>{ms.c.label}</td>
              <td>{fmtTime(ms.recomb)}</td>
              <td>{fmtTime(ms.z10)}</td>
              <td>{ms.acc === null ? 'never' : `${fmtTime(ms.acc)} (z ≈ ${ms.zAcc!.toFixed(2)})`}</td>
              <td>{ms.de === null ? 'never' : fmtTime(ms.de)}</td>
              <td>{ms.c.age.toFixed(2)} Gyr</td>
              <td>{ms.aFuture.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
    </div>

    <aside class="panel" aria-live="off">
      <canvas bind:this={canvas} width={PATCH} height={PATCH} style:width={`${PATCH}px`} style:height={`${PATCH}px`} aria-hidden="true"></canvas>
      <div class="ruler" aria-hidden="true">
        <span class="ruler-bar" style:width={`${rulerPx}px`}></span>
        <span class="ruler-label">a patch 100 Mpc across today spans {rulerMpc < 1 ? rulerMpc.toPrecision(2) : rulerMpc.toFixed(rulerMpc < 10 ? 1 : 0)} Mpc</span>
      </div>
      {#if primary && frac}
        <dl class="readout">
          <div class="big">
            <dt>time since the Big Bang</dt>
            <dd>{fmtTime(tPlay)}</dd>
          </div>
          <div><dt>relative to today</dt><dd>{relToToday < 0 ? `${fmtTime(-relToToday)} ago` : relToToday < 0.005 ? 'now' : `${fmtTime(relToToday)} ahead`}</dd></div>
          <div><dt>scale factor a</dt><dd>{fmtScaleFactor(aPlay)}</dd></div>
          <div><dt>redshift z</dt><dd>{fmtRedshift(aPlay)}</dd></div>
          <div><dt>CMB temperature</dt><dd>{fmtTemperature(Tnow)}</dd></div>
          <div><dt>expansion rate H</dt><dd>{Hnow >= 1e5 ? Hnow.toExponential(2) : Hnow.toFixed(Hnow < 1000 ? 1 : 0)} <small>km/s/Mpc</small></dd></div>
          <div><dt>expansion is</dt><dd class:accel={q < 0}>{q < 0 ? 'accelerating' : 'decelerating'} <small>q = {q.toFixed(2)}</small></dd></div>
        </dl>
        <div class="fractions" role="img" aria-label={`Energy budget: radiation ${fmtPercent(frac.radiation)}, matter ${fmtPercent(frac.matter)}, dark energy ${fmtPercent(frac.darkEnergy)}`}>
          <div class="bar">
            <span class="seg r" style:flex={`${Math.max(frac.radiation, 0)} 0 0`}></span>
            <span class="seg mt" style:flex={`${Math.max(frac.matter, 0)} 0 0`}></span>
            <span class="seg de" style:flex={`${Math.max(frac.darkEnergy, 0)} 0 0`}></span>
          </div>
          <ul class="legend">
            <li><span class="sw r"></span>radiation <b>{fmtPercent(frac.radiation)}</b></li>
            <li><span class="sw mt"></span>matter <b>{fmtPercent(frac.matter)}</b></li>
            <li><span class="sw de"></span>dark energy <b>{fmtPercent(frac.darkEnergy)}</b></li>
          </ul>
          <div class="era">{era} · readouts follow <b>{primary.short}</b></div>
        </div>
      {/if}
    </aside>
  </div>

</figure>

<style>
  .fig { margin: 0; display: grid; gap: 0.9rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; justify-content: space-between; align-items: center; }
  .transport { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  button { font: inherit; cursor: pointer; }
  .play {
    display: inline-flex; align-items: center; gap: 0.45rem;
    background: var(--ink); color: var(--bg); border: 0; border-radius: 0.6rem;
    padding: 0.55rem 0.95rem; font-weight: 600;
  }
  .ghost, .speed select {
    background: transparent; color: var(--ink-2); border: 1px solid var(--line);
    border-radius: 0.6rem; padding: 0.5rem 0.8rem; font: inherit;
  }
  .ghost:hover, .ghost:focus-visible { color: var(--ink); border-color: var(--line-strong); }
  .speed select { appearance: none; -webkit-appearance: none; padding-right: 1.6rem;
    background-image: linear-gradient(45deg, transparent 50%, var(--ink-2) 50%), linear-gradient(135deg, var(--ink-2) 50%, transparent 50%);
    background-position: calc(100% - 13px) 55%, calc(100% - 8px) 55%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
  .axis-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 0.6rem; overflow: hidden; }
  .axis-toggle button { background: transparent; border: 0; color: var(--ink-2); padding: 0.5rem 0.85rem; }
  .axis-toggle button.on { background: var(--surface-2); color: var(--ink); }
  .scrub input[type='range'] { width: 100%; accent-color: var(--ink); }
  .stage { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 1rem 1.25rem; align-items: start; }
  .left { display: grid; gap: 0.9rem; min-width: 0; }
  @media (max-width: 860px) { .stage { grid-template-columns: 1fr; } }
  .plot { position: relative; background: var(--surface); border-radius: 0.9rem; border: 1px solid var(--line); min-width: 0; }
  svg { display: block; cursor: crosshair; }
  .grid { stroke: var(--grid); stroke-width: 1; shape-rendering: crispEdges; }
  .axis { stroke: var(--line-strong); stroke-width: 1; shape-rendering: crispEdges; }
  .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis-title { fill: var(--ink-2); font-size: 12px; }
  .curve { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .curve.dashed { stroke-dasharray: 6 5; }
  .today { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 2 4; }
  .note { fill: var(--ink-2); font-size: 11px; }
  .marker { fill: var(--surface); stroke: var(--ink-2); stroke-width: 1.5; }
  .playhead { stroke: var(--ink); stroke-width: 1; opacity: 0.8; }
  .dot { stroke: var(--surface); stroke-width: 2; }
  .crosshair { stroke: var(--muted); stroke-width: 1; }
  .tooltip {
    position: absolute; pointer-events: none; width: 216px;
    background: var(--bg); border: 1px solid var(--line-strong); border-radius: 0.6rem;
    padding: 0.55rem 0.7rem; font-size: 0.82rem; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .tt-head { color: var(--ink); font-weight: 600; margin-bottom: 0.35rem; }
  .tt-row { display: grid; grid-template-columns: 14px 1fr; gap: 0.1rem 0.5rem; align-items: center; margin: 0.15rem 0; }
  .tt-swatch { width: 14px; height: 3px; background: var(--c); border-radius: 2px; }
  .tt-swatch.dashed { background: repeating-linear-gradient(90deg, var(--ink) 0 4px, transparent 4px 6px); }
  .tt-name { color: var(--ink-2); }
  .tt-val { grid-column: 2; color: var(--ink); font-variant-numeric: tabular-nums; }
  .tt-hint { color: var(--muted); margin-top: 0.4rem; font-size: 0.75rem; }
  .panel { display: grid; gap: 0.75rem; justify-items: start; }
  canvas { border-radius: 50%; background: radial-gradient(circle at 50% 50%, #0d1428 0%, var(--bg) 100%); border: 1px solid var(--line); }
  .ruler { display: grid; gap: 0.25rem; width: 230px; }
  .ruler-bar { display: block; height: 2px; background: var(--ink-2); border-radius: 1px; transition: width 80ms linear; }
  .ruler-label { font-size: 0.75rem; color: var(--muted); }
  .readout { margin: 0; display: grid; grid-template-columns: 1fr; gap: 0.3rem; width: 100%; }
  .readout div { display: flex; justify-content: space-between; gap: 0.75rem; border-bottom: 1px solid var(--line); padding: 0.25rem 0; }
  .readout dt { color: var(--ink-2); font-size: 0.82rem; }
  .readout dd { margin: 0; font-variant-numeric: tabular-nums; font-size: 0.92rem; text-align: right; }
  .readout dd small { color: var(--muted); font-size: 0.75rem; }
  .readout .big { display: grid; gap: 0.1rem; border-bottom: 0; padding-bottom: 0.2rem; }
  .readout .big dd { font-size: 1.6rem; text-align: left; font-weight: 600; letter-spacing: -0.01em; }
  .accel { color: #b9a6ff; }
  .fractions { width: 100%; display: grid; gap: 0.4rem; }
  .bar { display: flex; height: 10px; gap: 2px; border-radius: 5px; overflow: hidden; background: var(--line); }
  .seg { display: block; min-width: 0; }
  .seg.r, .sw.r { background: #d95926; }
  .seg.mt, .sw.mt { background: #199e70; }
  .seg.de, .sw.de { background: #9085e9; }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; font-size: 0.8rem; color: var(--ink-2); }
  .legend b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; margin-left: 0.25rem; }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 0.4rem; vertical-align: -1px; }
  .era { font-size: 0.8rem; color: var(--muted); }
  .era b { color: var(--ink-2); font-weight: 500; }
  .picker-wrap { margin-top: 0.25rem; }
  .tableview summary { cursor: pointer; color: var(--ink-2); font-size: 0.9rem; }
  .tableview table { width: 100%; border-collapse: collapse; margin-top: 0.6rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .tableview th, .tableview td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  .tableview th { color: var(--ink-2); font-weight: 500; }
  .tableview small { color: var(--muted); font-weight: 400; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
