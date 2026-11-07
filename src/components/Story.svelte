<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { scaleLinear, scaleLog, line as d3line, area as d3area, curveMonotoneX, interpolateRgb } from 'd3';
  import {
    makeCosmology,
    scaleFactorTable,
    scaleFactorAt,
    timeAt,
    densityFractions,
    aAccelerationOnset,
    distanceModulus,
    E,
    age,
  } from '$lib/cosmology';
  import type { ResultData } from '$lib/models';
  import { interval, toCosmoParams, isDrawable, h0Category } from '$lib/models';
  import { fmtRedshift } from '$lib/format';
  import { lang, syncLang, t as tr, timeParts, timeTick, gyrTick, sizeText, tempText, rulerText, type Key } from '$lib/i18n.svelte';
  import pantheon from '../data/pantheon_hubble.json';
  import bao from '../data/desi_dr2_bao.json';
  import cmbTT from '../data/cmb_tt.json';
  import cmbSkyUrl from '../assets/cmb_equirect.webp?url';
  import mollUrl from '../assets/cmb_mollweide.webp?url';

  let { results }: { results: ResultData[] } = $props();

  // ---------------------------------------------------------------- models
  const find = (k: string) => results.find((r) => r.key === k && isDrawable(r));
  const lcdmR = find('planck-2018/lcdm');
  const dynR = find('desi-dr2-bao-2025/w0wa-desi-cmb-desy5');
  const lcdm = makeCosmology(lcdmR ? toCosmoParams(lcdmR) : { H0: 67.36, Om: 0.3153 });
  const dyn = makeCosmology(dynR ? toCosmoParams(dynR) : { H0: 66.74, Om: 0.3191, w0: -0.752, wa: -0.86 });
  const tabL = scaleFactorTable(lcdm, 1e-8, 30, 2400);
  const tabD = scaleFactorTable(dyn, 1e-8, 30, 2400);
  const T0 = age(lcdm);
  const aAcc = aAccelerationOnset(lcdm) ?? 0.6;
  const tAcc = timeAt(tabL, aAcc);
  const tRec = timeAt(tabL, 1 / 1091);

  const C_L = '#3987e5'; // Λ — validated slot 1
  const C_D = '#c98500'; // w0wa — validated slot 2
  const C_R = '#d95926', C_M = '#199e70', C_X = '#9085e9';

  // ---------------------------------------------------------------- the script of the scroll
  const L = Math.log10;
  // [scroll progress, log10(time / Gyr)] — eased between keys so milestones "settle"
  const KEYS: [number, number][] = [
    [0, L(T0)], [0.05, L(T0)],
    [0.125, -5],
    [0.215, L(tRec)], [0.27, L(tRec)],
    [0.36, L(0.6)],
    [0.455, L(tAcc)],
    [0.525, L(T0)], [0.635, L(T0)],
    [0.73, L(40)],
    [0.78, L(T0)], [1, L(T0)],
  ];
  function logTimeAt(p: number) {
    for (let i = 1; i < KEYS.length; i++) {
      const [p1, v1] = KEYS[i];
      const [p0, v0] = KEYS[i - 1];
      if (p <= p1) {
        const s = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
        const e = s * s * (3 - 2 * s);
        return v0 + (v1 - v0) * e;
      }
    }
    return KEYS[KEYS.length - 1][1];
  }

  type Mode = 'none' | 'budget' | 'cmb' | 'scale' | 'speed' | 'hubble' | 'future' | 'w0wa' | 'h0';
  interface Chapter { at: number; mode: Mode; key: string }
  const CHAPTERS: Chapter[] = [
    { at: 0, mode: 'none', key: '' },
    { at: 0.05, mode: 'budget', key: 'rewind' },
    { at: 0.125, mode: 'budget', key: 'fog' },
    { at: 0.205, mode: 'cmb', key: 'light' },
    { at: 0.3, mode: 'scale', key: 'brakes' },
    { at: 0.4, mode: 'speed', key: 'speeds' },
    { at: 0.52, mode: 'hubble', key: 'sne' },
    { at: 0.635, mode: 'future', key: 'futures' },
    { at: 0.77, mode: 'w0wa', key: 'w0wa' },
    { at: 0.885, mode: 'h0', key: 'h0' },
  ];
  const titleOf = (c: Chapter) => (c.key ? tr(`${c.key}.title` as Key) : '');
  const lineOf = (c: Chapter) => (c.key ? tr(`${c.key}.line` as Key) : '');

  // ---------------------------------------------------------------- live state
  let section: HTMLElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let rulerEl: HTMLDivElement | undefined = $state();
  let p = $state(0); // smoothed scroll progress
  let narrow = $state(false);
  let webgl = $state(true);

  const logt = $derived(logTimeAt(p));
  const t = $derived(Math.pow(10, logt));
  const a = $derived(scaleFactorAt(tabL, t));
  const T = $derived(2.7255 / a);
  const chapterIndex = $derived.by(() => {
    let i = 0;
    for (let k = 0; k < CHAPTERS.length; k++) if (p >= CHAPTERS[k].at) i = k;
    return i;
  });
  const chapter = $derived(CHAPTERS[chapterIndex]);
  const local = $derived.by(() => {
    const next = CHAPTERS[chapterIndex + 1]?.at ?? 1;
    return Math.min(1, Math.max(0, (p - chapter.at) / (next - chapter.at)));
  });
  const aside = $derived(p > 0.035 ? 1 : 0);
  // hero: the universe sits right of the title; then slides left for the chart
  const sceneShift = $derived(p > 0.035 ? 1 : -0.95);
  const ko = $derived(lang.current === 'ko');

  onMount(() => {
    const unsync = syncLang();
    narrow = window.innerWidth < 860;
    let uni: import('$lib/universe3d').Universe | null = null;
    let disposed = false;
    import('$lib/universe3d').then(({ Universe }) => {
      if (disposed || !canvas) return;
      try {
        uni = new Universe(canvas, { cmbUrl: cmbSkyUrl });
        uni.onFrame = (f) => {
          if (!rulerEl) return;
          rulerEl.style.transform = `translate3d(${f.x1.toFixed(1)}px, ${f.y.toFixed(1)}px, 0)`;
          rulerEl.style.width = `${Math.max(0, f.x2 - f.x1).toFixed(1)}px`;
          // fade out before the labels would run under the header
          rulerEl.style.opacity = (f.opacity * clamp01((f.y - 96) / 36)).toFixed(3);
        };
      } catch {
        webgl = false;
      }
    });

    let target = 0;
    let raf = 0;
    const read = () => {
      if (!section) return;
      const r = section.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      target = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      read();
      const d = target - p;
      if (Math.abs(d) > 1e-5) p += d * 0.14;
      const g = xGoal();
      if (Math.abs(g - xMax) > 1e-3) xMax += (g - xMax) * 0.22;
      if (uni) {
        const hot = Math.min(1, Math.max(0, (L(T) - L(2200)) / (L(4500) - L(2200))));
        const stars = Math.min(1, Math.max(0, (logt - L(0.15)) / (L(1.2) - L(0.15))));
        uni.set({
          scale: Math.pow(a, 0.4),
          hot,
          stars,
          aside: narrow ? 1 : sceneShift,
          vertical: narrow,
          cmb: chapter.mode === 'cmb' ? 1 : 0,
          ruler: p > 0.04 ? 1 : 0,
        });
      }
    };
    const onResize = () => (narrow = window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    tick();
    return () => {
      disposed = true;
      unsync();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      uni?.dispose();
    };
  });

  function jump(i: number) {
    if (!section) return;
    const span = section.offsetHeight - window.innerHeight;
    const top = section.offsetTop + span * (CHAPTERS[i].at + 0.012);
    window.scrollTo({ top, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- chart geometry
  let cw = $state(480);
  const ch = $derived(Math.round(Math.min(340, Math.max(230, cw * 0.66))));
  const M = { top: 14, right: 16, bottom: 30, left: 40 };
  const iw = $derived(Math.max(10, cw - M.left - M.right));
  const ih = $derived(ch - M.top - M.bottom);
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

  // budget: composition vs size of the universe (log a), labelled in time
  const A_MIN = 1e-6, A_MAX = 3;
  const budgetData = (() => {
    const out: { a: number; r: number; m: number; x: number }[] = [];
    for (let i = 0; i <= 220; i++) {
      const aa = A_MIN * Math.pow(A_MAX / A_MIN, i / 220);
      const f = densityFractions(lcdm, aa);
      out.push({ a: aa, r: f.radiation, m: f.matter, x: f.darkEnergy });
    }
    return out;
  })();
  const bx = $derived(scaleLog().domain([A_MIN, A_MAX]).range([0, iw]));
  const by = $derived(scaleLinear().domain([0, 1]).range([ih, 0]));
  const budgetAreas = $derived.by(() => {
    const mk = (lo: (d: (typeof budgetData)[number]) => number, hi: (d: (typeof budgetData)[number]) => number) =>
      d3area<(typeof budgetData)[number]>()
        .x((d) => bx(d.a))
        .y0((d) => by(lo(d)))
        .y1((d) => by(hi(d)))
        .curve(curveMonotoneX)(budgetData) ?? '';
    return {
      r: mk(() => 0, (d) => d.r),
      m: mk((d) => d.r, (d) => d.r + d.m),
      x: mk((d) => d.r + d.m, () => 1),
    };
  });
  const budgetTicks = [1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1];
  const now = $derived(densityFractions(lcdm, a));

  // first light: the (simulated) CMB sky and its angular power spectrum
  const TT = cmbTT as { ell: number[]; Dl: number[]; peaks: number[] };
  const ELL_MAX = 2000;
  const ttPts = TT.ell.map((l, i) => [l, TT.Dl[i]] as [number, number]).filter(([l]) => l <= ELL_MAX);
  const peak1 = TT.peaks[0] ?? 220;
  const peakD = ttPts.reduce((b, d) => (Math.abs(d[0] - peak1) < Math.abs(b[0] - peak1) ? d : b), ttPts[0])[1];
  const cmbLayout = $derived.by(() => {
    const mw = Math.min(iw, Math.max(160, (ih - 96) * 2));
    const mh = mw / 2;
    const y0 = mh + 34;
    return { mw, mh, mx: (iw - mw) / 2, y0, sh: Math.max(30, ih - y0) };
  });
  const lx = $derived(scaleLinear().domain([2, ELL_MAX]).range([0, iw]));
  const ly = $derived(scaleLinear().domain([0, 6400]).range([cmbLayout.y0 + cmbLayout.sh, cmbLayout.y0]));
  const reveal = $derived(clamp01(local * 2.6));
  const specDraw = $derived(clamp01(local * 2.6 - 0.55));
  const ttPath = $derived.by(() => {
    const lmax = 2 + specDraw * (ELL_MAX - 2);
    return d3line()(ttPts.filter(([l]) => l <= lmax).map(([l, d]) => [lx(l), ly(d)])) ?? '';
  });
  const CMB_STOPS = ['#0b1d5c', '#1f5fb0', '#77b7e8', '#f2f2e4', '#f6c36a', '#e0662b', '#8f1d10'];

  // scale factor / expansion speed vs time
  let xMax = $state(2);
  const xGoal = () => (chapter.mode === 'future' ? 40 : chapter.mode === 'speed' ? 16 : Math.max(1.5, t * 1.35));
  const sx = $derived(scaleLinear().domain([0, xMax]).range([0, iw]));
  const aTopFor = (x: number) => Math.max(scaleFactorAt(tabL, x), scaleFactorAt(tabD, x)) * 1.08;
  const sy = $derived(scaleLinear().domain([0, aTopFor(xMax)]).range([ih, 0]));

  function pathA(tab: typeof tabL, tEnd: number, tStart = 0) {
    const N = 260;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const tt = tStart + ((tEnd - tStart) * i) / N;
      pts.push([sx(tt), sy(scaleFactorAt(tab, Math.max(tt, 1e-6)))]);
    }
    return d3line()(pts) ?? '';
  }
  const adot = (c: typeof lcdm, tab: typeof tabL, tt: number) => {
    const aa = scaleFactorAt(tab, tt);
    return aa * E(c, aa);
  };
  const vy = $derived(scaleLinear().domain([0.6, 2.1]).range([ih, 0]));
  function pathV(tEnd: number) {
    const N = 240, t0 = 0.45;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const tt = t0 + ((tEnd - t0) * i) / N;
      pts.push([sx(tt), vy(adot(lcdm, tabL, tt))]);
    }
    return d3line()(pts) ?? '';
  }
  // DESI DR2: a·H(z)/H0 from D_H/r_d (Planck r_d, H0), placed at the cosmic time of its redshift
  const baoPts = (bao.points as { z: number; tracer: string; adot?: number; adot_err?: number }[])
    .filter((d) => d.adot !== undefined && d.adot_err !== undefined)
    .map((d) => ({ ...d, v: d.adot!, e: d.adot_err!, t: timeAt(tabL, 1 / (1 + d.z)) }));

  // supernova Hubble diagram: distance modulus relative to an empty universe
  const SN = pantheon.sn as [number, number, number][];
  const SNB = pantheon.bins as { z: number; dmu: number; err: number; n: number }[];
  const eds = makeCosmology({ H0: lcdm.H0, Om: 1 });
  const muEmpty = (z: number) => 5 * Math.log10(lcdm.dH * z * (1 + z / 2)) + 25;
  const Z_MIN = 0.01, Z_MAX = 2.3;
  const zGrid = Array.from({ length: 121 }, (_, i) => Z_MIN * Math.pow(Z_MAX / Z_MIN, i / 120));
  const dmuL = zGrid.map((z) => [z, distanceModulus(lcdm, z) - muEmpty(z)] as [number, number]);
  const dmuE = zGrid.map((z) => [z, distanceModulus(eds, z) - muEmpty(z)] as [number, number]);
  const at = (curve: [number, number][], z: number) => curve.reduce((b, d) => (Math.abs(L(d[0] / z)) < Math.abs(L(b[0] / z)) ? d : b), curve[0])[1];
  const zx = $derived(scaleLog().domain([Z_MIN, Z_MAX]).range([0, iw]));
  const my = $derived(scaleLinear().domain([-0.7, 0.5]).range([ih, 0]));
  const curvePath = (c: [number, number][]) => d3line()(c.map(([z, d]) => [zx(z), my(d)])) ?? '';
  const snShown = $derived(Math.round(SN.length * clamp01(local * 1.9)));
  const binAlpha = $derived(clamp01(local * 3 - 1.2));

  // w0–wa
  const wpts = results
    .filter((r) => r.params.w0 && r.params.wa)
    .filter((r) => {
      const [a0, a1] = interval(r.params.w0!);
      return a0 > -1.8 && a1 < 0.2 && r.params.wa!.value > -4;
    })
    .sort((x, y) => (x.date ?? `${x.year}`).localeCompare(y.date ?? `${y.year}`));
  const years = [...new Set(wpts.map((r) => r.year))].sort();
  const ramp = interpolateRgb('#3d5b94', '#e6efff');
  const yearColor = (y: number) => ramp(years.indexOf(y) / Math.max(1, years.length - 1));
  const recFrom = wpts.find((r) => r.key === 'desi-dr2-bao-2025/w0wa-desi-cmb-desy5');
  const recTo = wpts.find((r) => r.key === 'des-dovekie-2025/w0wa-desi-cmb');
  // evidence against a constant: the spread of what the newest year's analyses quote
  const sigRes = results.filter((r) => r.preferenceOverLCDM !== undefined);
  const sigYear = Math.max(...sigRes.map((r) => r.year));
  const sigLatest = sigRes.filter((r) => r.year === sigYear).map((r) => r.preferenceOverLCDM!);
  const sigLo = Math.min(...sigLatest), sigHi = Math.max(...sigLatest);
  const wx = $derived(scaleLinear().domain([-1.25, -0.25]).range([0, iw]));
  const wy = $derived(scaleLinear().domain([-2.6, 0.6]).range([ih, 0]));
  const wShown = $derived(Math.ceil(Math.min(1, local * 1.6) * wpts.length));
  // once every fit is in, point at the supernova recalibration that moved the strongest one
  const showRecal = $derived(wShown >= wpts.length && local > 0.7);

  // H0: one row per paper (its first ΛCDM H0), early-universe inferences then direct measurements
  const h0rows = (() => {
    const seen = new Set<string>();
    return results
      .filter((r) => r.params.H0 && r.model === 'LCDM')
      .filter((r) => (seen.has(r.paperId) ? false : (seen.add(r.paperId), true)))
      .map((r) => ({ r, cat: h0Category(r), v: r.params.H0!.value, iv: interval(r.params.H0!) }))
      .sort((x, y) => (x.cat === y.cat ? x.v - y.v : x.cat === 'early' ? -1 : 1));
  })();
  const hx = $derived(scaleLinear().domain([64, 76.5]).range([0, iw]));
  const rowH = $derived(ih / Math.max(1, h0rows.length));
  const early = results.find((r) => r.key === 'spt3g-d1-2025/lcdm-cmb-spa') ?? h0rows.find((d) => d.cat === 'early')?.r;
  const late = results.find((r) => r.key === 'h0dn-2026/h0') ?? h0rows.filter((d) => d.cat === 'late').at(-1)?.r;

  // ---------------------------------------------------------------- timeline rail
  const RAIL_MIN = -5, RAIL_MAX = L(40);
  const railPos = (lt: number) => ((lt - RAIL_MIN) / (RAIL_MAX - RAIL_MIN)) * 100;
  const railMarks = $derived([
    { lt: -5, label: ko ? '1만 년' : '10 kyr' },
    { lt: L(tRec), label: ko ? `${Math.round(tRec * 1e5)}만 년` : `${Math.round(tRec * 1e6)} kyr` },
    { lt: 0, label: ko ? '10억 년' : '1 Gyr' },
    { lt: L(T0), label: tr('today') },
  ]);
  const tp = $derived(timeParts(t));
</script>

<section class="story" bind:this={section} aria-label={tr('story.aria')}>
  <div class="stage" class:aside={aside === 1} class:narrow class:ko>
    <canvas bind:this={canvas} class="universe" aria-hidden="true"></canvas>
    {#if !webgl}<div class="nogl" aria-hidden="true"></div>{/if}
    <div class="vignette" aria-hidden="true"></div>

    <!-- comoving ruler: positioned every frame by the 3D scene -->
    <div class="ruler" bind:this={rulerEl} aria-hidden="true">
      <div class="labels">
        <span class="len">{rulerText(a)}</span>
        <span class="sub">{Math.abs(a - 1) < 0.01 ? tr('ruler.stretch') : tr('ruler.today')}</span>
      </div>
      <i></i>
    </div>

    <!-- hero -->
    <div class="hero" class:gone={p > 0.03}>
      <!-- both languages in the markup so the first paint is already right (CSS picks one) -->
      <h1><span class="t-en">The expanding<br />universe</span><span class="t-ko" lang="ko">팽창하는<br />우주</span></h1>
      <p><span class="t-en">13.8 billion years, one scroll.</span><span class="t-ko" lang="ko">138억 년을 스크롤 한 번에.</span></p>
      <div class="cue" aria-hidden="true"><span></span></div>
    </div>

    <!-- caption -->
    {#key chapterIndex}
      {#if chapter.key}
        <div class="caption" in:fly={{ y: 18, duration: 520, delay: 80 }} out:fade={{ duration: 160 }}>
          <h2>{titleOf(chapter)}</h2>
          <p>{lineOf(chapter)}</p>
        </div>
      {/if}
    {/key}

    <!-- chart panel -->
    <div class="panel" class:show={aside === 1}>
      <div class="readout">
        {#if chapter.mode === 'w0wa' && sigRes.length}
          <div class="big">{sigLo.toFixed(1)}–{sigHi.toFixed(1)}<span class="unit sig">σ</span></div>
          <div class="small">{tr('w0wa.readout', { year: sigYear })}</div>
        {:else if chapter.mode === 'h0' && early && late}
          <div class="big">{early.params.H0!.value.toFixed(1)} <span class="vs">vs</span> {late.params.H0!.value.toFixed(1)}</div>
          <div class="small">km/s/Mpc · {early.paperShort} vs {late.paperShort}</div>
        {:else if chapter.mode === 'hubble'}
          <div class="big">{SN.length.toLocaleString('en-US')}<span class="unit">{tr('sn.unit')}</span></div>
          <div class="small">{tr('sn.small')}</div>
        {:else}
          <div class="big">{tp.num}<span class="unit">{tp.unit}</span></div>
          <div class="small">
            <span>{sizeText(a)}</span>
            <span>{tempText(T)}</span>
            <span>z {fmtRedshift(a)}</span>
          </div>
        {/if}
      </div>

      <div class="chart" bind:clientWidth={cw}>
        <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} role="img" aria-label={titleOf(chapter) || 'chart'}>
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
            <linearGradient id="fadeR" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={C_R} stop-opacity="0.95" /><stop offset="1" stop-color={C_R} stop-opacity="0.55" /></linearGradient>
            <linearGradient id="fadeM" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={C_M} stop-opacity="0.95" /><stop offset="1" stop-color={C_M} stop-opacity="0.55" /></linearGradient>
            <linearGradient id="fadeX" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={C_X} stop-opacity="0.95" /><stop offset="1" stop-color={C_X} stop-opacity="0.55" /></linearGradient>
            <linearGradient id="cmbbar" x1="0" x2="1" y1="0" y2="0">
              {#each CMB_STOPS as c, i}<stop offset={i / (CMB_STOPS.length - 1)} stop-color={c} />{/each}
            </linearGradient>
            <clipPath id="plotclip"><rect x="0" y="-6" width={iw} height={ih + 12} /></clipPath>
            <clipPath id="mapclip"><rect x={cmbLayout.mx} y="0" width={cmbLayout.mw * reveal} height={cmbLayout.mh} /></clipPath>
            <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" />
            </marker>
          </defs>
          <g transform={`translate(${M.left},${M.top})`}>
            {#if chapter.mode === 'budget'}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                <path d={budgetAreas.r} fill="url(#fadeR)" />
                <path d={budgetAreas.m} fill="url(#fadeM)" />
                <path d={budgetAreas.x} fill="url(#fadeX)" />
                <text class="in-label" x={bx(3e-6)} y={by(0.5)}>{tr('radiation')}</text>
                <text class="in-label" x={bx(3e-3)} y={by(0.5)} text-anchor="middle">{tr('matter')}</text>
                <text class="in-label" x={bx(2.6)} y={by(0.86)} text-anchor="end">{tr('dark energy')}</text>
                {#each budgetTicks as tk}
                  <text class="tick" x={bx(tk)} y={ih + 18} text-anchor="middle">{timeTick(timeAt(tabL, tk))}</text>
                {/each}
                <line class="playhead" x1={bx(Math.max(a, A_MIN))} x2={bx(Math.max(a, A_MIN))} y1={-6} y2={ih} />
                <circle class="ph-dot" cx={bx(Math.max(a, A_MIN))} cy={-6} r="4" />
                <text class="axis-note" x={iw} y={-2} text-anchor="end">{tr('budget.note')}</text>
              </g>
            {:else if chapter.mode === 'cmb'}
              {@const g = cmbLayout}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                <ellipse cx={g.mx + g.mw / 2} cy={g.mh / 2} rx={g.mw / 2 + 6} ry={g.mh / 2 + 6} class="map-halo" />
                <image href={mollUrl} x={g.mx} y="0" width={g.mw} height={g.mh} preserveAspectRatio="none" clip-path="url(#mapclip)" />
                {#if reveal < 1}
                  <line class="sweep" x1={g.mx + g.mw * reveal} x2={g.mx + g.mw * reveal} y1="-4" y2={g.mh + 4} />
                {/if}
                <text class="axis-note" x="0" y="-2">{tr('cmb.sim')}</text>
                <g transform={`translate(${g.mx + g.mw - 150}, ${g.mh + 9})`} opacity={reveal}>
                  <rect width="150" height="5" rx="2.5" fill="url(#cmbbar)" />
                  <text class="tick" x="0" y="17">{tr('colder')}</text>
                  <text class="tick" x="75" y="17" text-anchor="middle">±300 μK</text>
                  <text class="tick" x="150" y="17" text-anchor="end">{tr('hotter')}</text>
                </g>
                <line class="grid" x1="0" x2={iw} y1={g.y0 + g.sh} y2={g.y0 + g.sh} />
                <path d={ttPath} class="glow" stroke={C_R} />
                <path d={ttPath} class="curve" stroke="#ffb27a" />
                {#if specDraw > 0.14}
                  <g in:fade={{ duration: 300 }}>
                    <circle cx={lx(peak1)} cy={ly(peakD)} r="7" class="ring" />
                    <text class="end-label" x={lx(peak1) + 12} y={ly(peakD) + 4}>{tr('cmb.peak')}</text>
                  </g>
                {/if}
                {#each [2, 500, 1000, 1500, 2000] as tk}
                  <text class="tick" x={lx(tk)} y={g.y0 + g.sh + 16} text-anchor="middle">{tk}</text>
                {/each}
                <text class="tick" x={iw} y={g.y0 + 4} text-anchor="end">{tr('cmb.x')}</text>
              </g>
            {:else if chapter.mode === 'scale' || chapter.mode === 'future'}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                {#each sy.ticks(4) as tk}
                  <line class="grid" x1="0" x2={iw} y1={sy(tk)} y2={sy(tk)} />
                  <text class="tick" x="-8" y={sy(tk)} dy="0.32em" text-anchor="end">{tk}</text>
                {/each}
                {#each sx.ticks(5) as tk}
                  <text class="tick" x={sx(tk)} y={ih + 18} text-anchor="middle">{gyrTick(tk)}</text>
                {/each}
                {#if chapter.mode === 'future'}
                  <line class="today" x1={sx(T0)} x2={sx(T0)} y1="0" y2={ih} />
                  <text class="axis-note" x={sx(T0) + 6} y="10">{tr('today')}</text>
                  <path d={pathA(tabD, Math.max(t, T0))} class="glow" stroke={C_D} />
                  <path d={pathA(tabD, Math.max(t, T0))} class="curve" stroke={C_D} />
                {/if}
                <path d={pathA(tabL, t)} class="glow" stroke={C_L} />
                <path d={pathA(tabL, t)} class="curve" stroke={C_L} />
                <circle class="ph-dot big" cx={sx(t)} cy={sy(scaleFactorAt(tabL, t))} r="5" fill={C_L} />
                {#if chapter.mode === 'future'}
                  {@const tl = Math.max(t, T0)}
                  {@const gap = sy(scaleFactorAt(tabD, tl)) - sy(scaleFactorAt(tabL, tl))}
                  <circle class="ph-dot big" cx={sx(tl)} cy={sy(scaleFactorAt(tabD, tl))} r="5" fill={C_D} />
                  {#if gap > 26}
                    <text class="end-label" x={sx(tl) - 10} y={sy(scaleFactorAt(tabL, tl)) - 12} text-anchor="end" in:fade>{tr('constant')}</text>
                    <text class="end-label" x={sx(tl) + 4} y={sy(scaleFactorAt(tabD, tl)) + 22} text-anchor="end" in:fade>{tr('fading')}</text>
                  {/if}
                {/if}
                <text class="axis-note" x="0" y="-2">{tr('scale.note')}</text>
              </g>
            {:else if chapter.mode === 'speed'}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                {#each vy.ticks(4) as tk}
                  <line class="grid" x1="0" x2={iw} y1={vy(tk)} y2={vy(tk)} />
                  <text class="tick" x="-8" y={vy(tk)} dy="0.32em" text-anchor="end">{tk}</text>
                {/each}
                {#each sx.ticks(5) as tk}
                  <text class="tick" x={sx(tk)} y={ih + 18} text-anchor="middle">{gyrTick(tk)}</text>
                {/each}
                <path d={pathV(t)} class="glow" stroke={C_L} />
                <path d={pathV(t)} class="curve" stroke={C_L} />
                {#each baoPts as d (d.z)}
                  {#if t >= d.t}
                    <g class="bao" in:fly={{ y: -10, duration: 420 }}>
                      <line x1={sx(d.t)} x2={sx(d.t)} y1={vy(d.v - d.e)} y2={vy(d.v + d.e)} />
                      <circle cx={sx(d.t)} cy={vy(d.v)} r="4.2" />
                    </g>
                  {/if}
                {/each}
                {#if t >= tAcc * 0.98}
                  <g in:fade={{ duration: 300 }}>
                    <circle cx={sx(tAcc)} cy={vy(adot(lcdm, tabL, tAcc))} r="9" class="ring" />
                    <text class="end-label" x={sx(tAcc)} y={vy(adot(lcdm, tabL, tAcc)) + 28} text-anchor="middle">{tr('slowest')} · {ko ? `${Math.round(tAcc * 10)}억 년` : `${tAcc.toFixed(1)} Gyr`}</text>
                  </g>
                {/if}
                <text class="zone" x={sx(3)} y={vy(1.75)}>{tr('slowing')}</text>
                {#if t > tAcc + 1}<text class="zone" x={Math.min(iw, sx(14.4))} y={vy(1.18)} text-anchor="end" in:fade>{tr('speeding up')}</text>{/if}
                <circle class="ph-dot big" cx={sx(t)} cy={vy(adot(lcdm, tabL, t))} r="5" fill={C_L} />
                <text class="axis-note" x="0" y="-2">{tr('speed.note')}</text>
              </g>
            {:else if chapter.mode === 'hubble'}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                {#each [-0.6, -0.4, -0.2, 0.2, 0.4] as tk}
                  <line class="grid" x1="0" x2={iw} y1={my(tk)} y2={my(tk)} />
                  <text class="tick" x="-8" y={my(tk)} dy="0.32em" text-anchor="end">{tk > 0 ? `+${tk}` : tk}</text>
                {/each}
                {#each [0.01, 0.03, 0.1, 0.3, 1, 2] as tk}
                  <text class="tick" x={zx(tk)} y={ih + 18} text-anchor="middle">{tk}</text>
                {/each}
                <g clip-path="url(#plotclip)">
                  <line class="empty-line" x1="0" x2={iw} y1={my(0)} y2={my(0)} />
                  <path d={curvePath(dmuE)} class="curve eds" stroke={C_M} />
                  {#each SN.slice(0, snShown) as s}
                    <circle class="sn" cx={zx(s[0])} cy={my(s[1])} r="1.5" />
                  {/each}
                  <path d={curvePath(dmuL)} class="glow" stroke={C_L} />
                  <path d={curvePath(dmuL)} class="curve" stroke={C_L} />
                  <g opacity={binAlpha}>
                    {#each SNB as b}
                      <line class="bin-err" x1={zx(b.z)} x2={zx(b.z)} y1={my(b.dmu - b.err)} y2={my(b.dmu + b.err)} />
                      <circle class="bin" cx={zx(b.z)} cy={my(b.dmu)} r="3.6" />
                    {/each}
                  </g>
                </g>
                <text class="end-label" x={zx(0.16)} y={my(at(dmuL, 0.16)) - 14} fill={C_L}>{tr('sn.lcdm')}</text>
                <text class="end-label" x={zx(0.62)} y={my(at(dmuE, 0.62)) + 20}>{tr('sn.eds')}</text>
                <text class="axis-note" x="0" y="-2">{tr('sn.y')}</text>
                <text class="axis-note" x={iw} y={ih - 6} text-anchor="end">{tr('sn.x')}</text>
              </g>
            {:else if chapter.mode === 'w0wa'}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                {#each wx.ticks(5) as tk}
                  <line class="grid" x1={wx(tk)} x2={wx(tk)} y1="0" y2={ih} />
                  <text class="tick" x={wx(tk)} y={ih + 18} text-anchor="middle">{tk}</text>
                {/each}
                {#each wy.ticks(4) as tk}
                  <line class="grid" x1="0" x2={iw} y1={wy(tk)} y2={wy(tk)} />
                  <text class="tick" x="-8" y={wy(tk)} dy="0.32em" text-anchor="end">{tk}</text>
                {/each}
                <circle cx={wx(-1)} cy={wy(0)} r="16" class="lambda-pulse" />
                <circle cx={wx(-1)} cy={wy(0)} r="7" class="lambda" />
                <text class="end-label" x={wx(-1) + 14} y={wy(0) - 12}>Λ</text>
                {#each wpts.slice(0, wShown) as r (r.key)}
                  {@const cx = wx(r.params.w0!.value)}
                  {@const cy = wy(r.params.wa!.value)}
                  {@const [x0, x1] = interval(r.params.w0!)}
                  {@const [y0, y1] = interval(r.params.wa!)}
                  {@const col = yearColor(r.year)}
                  <g class="wpt" in:fly={{ y: -12, duration: 450 }} opacity={showRecal && r !== recFrom && r !== recTo ? 0.38 : 1}>
                    <line x1={wx(Math.max(x0, -1.25))} x2={wx(Math.min(x1, -0.25))} y1={cy} y2={cy} stroke={col} />
                    <line x1={cx} x2={cx} y1={wy(Math.min(y1, 0.6))} y2={wy(Math.max(y0, -2.6))} stroke={col} />
                    <circle {cx} {cy} r="9" fill={col} opacity="0.16" />
                    <circle {cx} {cy} r="4.5" fill={col} class="dot" />
                  </g>
                {/each}
                {#if recFrom && recTo && showRecal}
                  {@const fx = wx(recFrom.params.w0!.value)}
                  {@const fy = wy(recFrom.params.wa!.value)}
                  {@const tx2 = wx(recTo.params.w0!.value)}
                  {@const ty2 = wy(recTo.params.wa!.value)}
                  {@const lx2 = wx(-0.6)}
                  {@const ly2 = wy(-0.12)}
                  <g in:fade={{ duration: 500 }}>
                    <circle cx={fx} cy={fy} r="8" class="was" />
                    <path class="recal" d={`M ${fx} ${fy} Q ${(fx + tx2) / 2 + 14} ${(fy + ty2) / 2 + 10} ${tx2} ${ty2}`} marker-end="url(#arrowhead)" />
                    <line class="leader" x1={(fx + tx2) / 2 + 6} y1={(fy + ty2) / 2} x2={lx2 - 4} y2={ly2 + 6} />
                    <text class="end-label" x={lx2} y={ly2}>{tr('recal')}</text>
                    <text class="end-label strong" x={lx2} y={ly2 + 16}>{recFrom.preferenceOverLCDM?.toFixed(1)}σ → {recTo.preferenceOverLCDM?.toFixed(1)}σ</text>
                  </g>
                {/if}
                <text class="axis-note" x={iw} y={ih - 6} text-anchor="end">{tr('w0.note')}</text>
                <text class="axis-note" x="0" y="-2">{tr('wa.note')}</text>
                <g class="years" transform={`translate(${iw - years.length * 46 + 6}, 4)`}>
                  {#each years as yv, i}
                    <circle cx={i * 46} cy="0" r="4" fill={yearColor(yv)} />
                    <text class="tick" x={i * 46 + 8} y="0" dy="0.32em">{yv}</text>
                  {/each}
                </g>
              </g>
            {:else if chapter.mode === 'h0'}
              <g in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
                {#if early && late}
                  <rect class="band" x={hx(interval(early.params.H0!)[0])} width={hx(interval(early.params.H0!)[1]) - hx(interval(early.params.H0!)[0])} y="0" height={ih} fill={C_L} />
                  <rect class="band" x={hx(interval(late.params.H0!)[0])} width={hx(interval(late.params.H0!)[1]) - hx(interval(late.params.H0!)[0])} y="0" height={ih} fill={C_R} />
                {/if}
                {#each hx.ticks(6) as tk}
                  <text class="tick" x={hx(tk)} y={ih + 18} text-anchor="middle">{tk}</text>
                {/each}
                {#each h0rows as d, i (d.r.key)}
                  {@const k = Math.min(1, Math.max(0, local * 2.2 - i * 0.07))}
                  {@const col = d.cat === 'early' ? C_L : C_R}
                  {@const y = (i + 0.5) * rowH}
                  <g opacity={k > 0 ? 1 : 0}>
                    <line x1={hx(d.v - (d.v - d.iv[0]) * k)} x2={hx(d.v + (d.iv[1] - d.v) * k)} y1={y} y2={y} stroke={col} class="whisker" />
                    <circle cx={hx(d.v)} cy={y} r={3.5 + k} fill={col} class="dot" />
                    {#if cw > 380}<text class="row-label" x={d.cat === 'early' ? hx(d.iv[1]) + 8 : hx(d.iv[0]) - 8} y={y} dy="0.32em" text-anchor={d.cat === 'early' ? 'start' : 'end'} opacity={k}>{d.r.paperShort}</text>{/if}
                  </g>
                {/each}
                <text class="zone" x="0" y="-2" fill={C_L}>{tr('early')}</text>
                <text class="zone" x={iw} y="-2" text-anchor="end" fill={C_R}>{tr('nearby')}</text>
              </g>
            {/if}
          </g>
        </svg>
        {#if chapter.mode === 'future'}
          <div class="legend-row" transition:fade={{ duration: 200 }}>
            <span><i class="line" style:background={C_L}></i>{tr('future.const')} · {tr('curve.planck')}</span>
            <span><i class="line" style:background={C_D}></i>{tr('future.dyn')} · {dynR?.label ?? 'DESI DR2'}</span>
          </div>
        {/if}
        {#if chapter.mode === 'speed'}
          <div class="legend-row" transition:fade={{ duration: 200 }}>
            <span><i class="line" style:background={C_L}></i>{tr('curve.planck')}</span>
            <span><i class="pt"></i>{tr('bao.legend')}</span>
          </div>
        {/if}
        {#if chapter.mode === 'hubble'}
          <div class="legend-row" transition:fade={{ duration: 200 }}>
            <span><i class="line" style:background={C_L}></i>{tr('sn.lcdm')} · {tr('curve.planck')}</span>
            <span><i class="line dash" style:border-color={C_M}></i>{tr('sn.eds')}</span>
            <span><i class="line dot"></i>{tr('sn.empty')}</span>
          </div>
        {/if}
        {#if chapter.mode === 'budget'}
          <div class="legend-row" transition:fade={{ duration: 200 }}>
            <span><i style:background={C_R}></i>{tr('radiation')} <b>{(now.radiation * 100).toFixed(now.radiation < 0.1 ? 1 : 0)}%</b></span>
            <span><i style:background={C_M}></i>{tr('matter')} <b>{(now.matter * 100).toFixed(0)}%</b></span>
            <span><i style:background={C_X}></i>{tr('dark energy')} <b>{(now.darkEnergy * 100).toFixed(now.darkEnergy < 0.1 ? 1 : 0)}%</b></span>
          </div>
        {/if}
      </div>
    </div>

    <!-- timeline rail -->
    <nav class="rail" class:show={aside === 1} aria-label={tr('chapters')}>
      <div class="track">
        <div class="fill" style:width={`${Math.min(100, Math.max(0, railPos(logt)))}%`}></div>
        {#each railMarks as mk}
          <span class="mark" style:left={`${railPos(mk.lt)}%`}><i></i><em>{mk.label}</em></span>
        {/each}
        <span class="head" style:left={`${Math.min(100, Math.max(0, railPos(logt)))}%`}></span>
      </div>
      <div class="dots">
        {#each CHAPTERS.slice(1) as c, i}
          <button type="button" class:on={chapterIndex === i + 1} onclick={() => jump(i + 1)} aria-label={titleOf(c)} title={titleOf(c)}></button>
        {/each}
      </div>
    </nav>
  </div>
</section>

<style>
  .story { position: relative; height: 1250vh; }
  .stage {
    position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden;
    background: radial-gradient(120% 90% at 30% 50%, #0d1530 0%, #070b18 55%, #04060e 100%);
  }
  .universe { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .nogl { position: absolute; inset: 0; background: radial-gradient(circle at 28% 50%, rgba(160,190,255,0.25), transparent 40%); }
  .vignette { position: absolute; inset: 0; pointer-events: none;
    background:
      linear-gradient(180deg, transparent 55%, rgba(3, 5, 12, 0.7) 100%),
      radial-gradient(130% 100% at 30% 50%, transparent 55%, rgba(2, 4, 10, 0.75) 100%); }

  /* ruler */
  /* anchored at its bottom edge: the bracket sits on the projected line, the labels above it */
  .ruler { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; pointer-events: none; will-change: transform, width, opacity; }
  .ruler i { position: absolute; left: 0; right: 0; bottom: 0; height: 7px; border: 1.5px solid rgba(220, 230, 255, 0.85); border-bottom: 0; border-radius: 2px 2px 0 0; }
  .ruler .labels { position: absolute; left: 50%; bottom: 0.7rem; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
  .ruler .len { white-space: nowrap; font-size: 0.82rem; font-weight: 600; color: var(--ink); text-shadow: 0 1px 8px rgba(0,0,0,0.9); font-variant-numeric: tabular-nums; }
  .ruler .sub { order: -1; white-space: nowrap; font-size: 0.72rem; color: var(--ink-2); text-shadow: 0 1px 8px rgba(0,0,0,0.9); }

  /* hero */
  .hero {
    position: absolute; left: clamp(1.5rem, 6vw, 6rem); bottom: clamp(3rem, 12vh, 8rem);
    transition: opacity 600ms ease, transform 800ms cubic-bezier(.2,.7,.2,1);
  }
  .hero.gone { opacity: 0; transform: translateY(-24px); pointer-events: none; }
  .hero h1 {
    font-size: clamp(3.2rem, 1.5rem + 7.5vw, 8.5rem); line-height: 0.92; letter-spacing: -0.035em;
    font-variation-settings: 'opsz' 144, 'SOFT' 50; font-weight: 400;
  }
  .hero h1 { max-width: 9ch; }
  .hero h1 .t-ko { display: inline-block; letter-spacing: -0.02em; line-height: 1.04; font-weight: 600; }
  .hero p { margin-top: 1.2rem; font-size: clamp(1.05rem, 0.9rem + 0.6vw, 1.4rem); color: var(--ink-2); }
  .cue { margin-top: 2.4rem; width: 26px; height: 42px; border: 1.5px solid var(--line-strong); border-radius: 14px; position: relative; }
  .cue span { position: absolute; left: 50%; top: 8px; width: 4px; height: 8px; margin-left: -2px; border-radius: 2px; background: var(--ink); animation: cue 1.8s ease-in-out infinite; }
  @keyframes cue { 0% { transform: translateY(0); opacity: 1 } 70% { transform: translateY(14px); opacity: 0 } 100% { opacity: 0 } }

  /* caption */
  .caption { position: absolute; left: clamp(1.5rem, 5vw, 5rem); bottom: clamp(5.5rem, 14vh, 9rem); max-width: 26rem; pointer-events: none; }
  .caption h2 { font-size: clamp(2rem, 1.2rem + 2.6vw, 3.6rem); line-height: 1; letter-spacing: -0.025em; font-weight: 400; font-variation-settings: 'opsz' 144; }
  .ko .caption h2 { letter-spacing: -0.015em; line-height: 1.12; font-weight: 600; }
  .caption p { margin-top: 0.8rem; font-size: 1.08rem; color: var(--ink-2); line-height: 1.45; text-shadow: 0 1px 12px rgba(0,0,0,0.9); }
  .caption h2 { text-shadow: 0 2px 24px rgba(0,0,0,0.7); }

  /* panel */
  .panel {
    position: absolute; right: clamp(1.25rem, 4vw, 4.5rem); top: 50%;
    width: min(42vw, 560px);
    transform: translate(40px, -50%); opacity: 0;
    transition: opacity 700ms ease, transform 900ms cubic-bezier(.2,.7,.2,1);
    padding: 1.4rem 1.5rem 1.1rem;
    border-radius: 22px;
    background: linear-gradient(160deg, rgba(24, 34, 67, 0.62), rgba(12, 18, 38, 0.5));
    border: 1px solid rgba(140, 165, 230, 0.16);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(18px) saturate(1.2); -webkit-backdrop-filter: blur(18px) saturate(1.2);
  }
  .panel.show { opacity: 1; transform: translate(0, -50%); }
  .readout { margin-bottom: 0.9rem; min-height: 5.4rem; }
  .big { font-family: var(--font-display); font-size: clamp(2.6rem, 1.6rem + 2.6vw, 4.2rem); line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; font-variation-settings: 'opsz' 144; white-space: nowrap; }
  .big .unit { font-family: var(--font-body); font-size: 0.34em; letter-spacing: 0; margin-left: 0.4em; color: var(--ink-2); vertical-align: 0.15em; }
  .big .unit.sig { font-family: var(--font-display); font-size: 0.7em; margin-left: 0.05em; color: var(--ink); vertical-align: 0; }
  .ko .big .unit { margin-left: 0.2em; }
  .big .vs { font-size: 0.45em; color: var(--muted); letter-spacing: 0; vertical-align: 0.35em; }
  .small { margin-top: 0.55rem; color: var(--ink-2); font-size: 0.92rem; display: flex; flex-wrap: wrap; gap: 0.2rem 1.1rem; font-variant-numeric: tabular-nums; }
  .chart { position: relative; }
  svg { display: block; overflow: visible; }
  .grid { stroke: rgba(140, 165, 230, 0.1); }
  .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis-note { fill: var(--ink-2); font-size: 11.5px; }
  .in-label { fill: #fff; font-size: 12.5px; font-weight: 600; paint-order: stroke; stroke: rgba(0,0,0,0.25); stroke-width: 3px; }
  .playhead { stroke: #fff; stroke-width: 1.5; }
  .ph-dot { fill: #fff; }
  .ph-dot.big { stroke: #0a0f1f; stroke-width: 2; filter: drop-shadow(0 0 6px rgba(255,255,255,0.7)); }
  .curve { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .curve.eds { stroke-width: 2; stroke-dasharray: 5 5; opacity: 0.9; }
  .glow { fill: none; stroke-width: 7; opacity: 0.55; filter: url(#glow); }
  .today { stroke: var(--ink-2); stroke-dasharray: 2 4; }
  .end-label { fill: var(--ink); font-size: 12px; font-weight: 600; paint-order: stroke; stroke: rgba(8, 12, 28, 0.85); stroke-width: 4px; }
  .end-label.strong { font-size: 13px; font-variant-numeric: tabular-nums; }
  .zone { fill: var(--ink-2); font-size: 12px; }
  .leader { stroke: var(--ink-2); stroke-width: 1; }
  .ring { fill: none; stroke: #fff; stroke-width: 1.5; }
  .lambda { fill: none; stroke: #fff; stroke-width: 2; }
  .lambda-pulse { fill: none; stroke: #fff; stroke-width: 1; opacity: 0.4; transform-box: fill-box; transform-origin: center; animation: pulse 2.4s ease-out infinite; }
  @keyframes pulse { 0% { transform: scale(0.5); opacity: 0.6 } 100% { transform: scale(1.8); opacity: 0 } }
  .wpt line { stroke-width: 1.3; opacity: 0.75; }
  .dot { stroke: #0a0f1f; stroke-width: 1.5; }
  .was { fill: none; stroke: rgba(255,255,255,0.55); stroke-width: 1.2; stroke-dasharray: 2 2.5; }
  .recal { fill: none; stroke: #fff; stroke-width: 1.6; }
  .band { opacity: 0.13; }
  .whisker { stroke-width: 2.2; stroke-linecap: round; }
  .row-label { fill: var(--ink-2); font-size: 11px; }
  .map-halo { fill: none; stroke: rgba(255, 190, 140, 0.18); stroke-width: 10; filter: url(#glow); }
  .sweep { stroke: #fff; stroke-width: 1.5; filter: drop-shadow(0 0 6px rgba(255, 220, 180, 0.9)); }
  .bao line { stroke: #fff; stroke-width: 1.6; }
  .bao circle { fill: #fff; stroke: #0a0f1f; stroke-width: 1.5; }
  .sn { fill: #b9c6ec; opacity: 0.32; }
  .bin { fill: #fff; stroke: #0a0f1f; stroke-width: 1.4; }
  .bin-err { stroke: #fff; stroke-width: 1.5; }
  .empty-line { stroke: rgba(230, 236, 255, 0.45); stroke-dasharray: 2 4; }
  .legend-row { display: flex; flex-wrap: wrap; gap: 0.3rem 1.1rem; margin-top: 0.55rem; font-size: 0.85rem; color: var(--ink-2); }
  .legend-row i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 0.4rem; }
  .legend-row i.line { width: 16px; height: 3px; border-radius: 2px; vertical-align: 3px; }
  .legend-row i.line.dash { background: none !important; height: 0; border-top: 2px dashed; border-radius: 0; vertical-align: 4px; }
  .legend-row i.line.dot { background: none; height: 0; border-top: 2px dotted rgba(230, 236, 255, 0.7); border-radius: 0; vertical-align: 4px; }
  .legend-row i.pt { width: 8px; height: 8px; border-radius: 50%; background: #fff; vertical-align: 0; }
  .legend-row b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; margin-left: 0.2rem; }
  @media (prefers-reduced-motion: reduce) { .lambda-pulse, .cue span { animation: none; } }

  /* rail */
  .rail { position: absolute; left: clamp(1.5rem, 5vw, 5rem); right: calc(min(42vw, 560px) + clamp(1.25rem, 4vw, 4.5rem) + 3rem); bottom: clamp(1.6rem, 4vh, 2.6rem);
    opacity: 0; transition: opacity 600ms ease; display: grid; gap: 0.9rem; }
  .rail.show { opacity: 1; }
  .track { position: relative; height: 2px; background: rgba(140, 165, 230, 0.18); border-radius: 1px; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #ffb36b, #b8ccff); border-radius: 1px; }
  .mark { position: absolute; top: -3px; transform: translateX(-50%); }
  .mark i { display: block; width: 8px; height: 8px; border-radius: 50%; background: #0a0f1f; border: 1.5px solid rgba(180, 195, 240, 0.6); }
  .mark em { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 0.74rem; color: var(--muted); white-space: nowrap; }
  .head { position: absolute; top: -5px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: #fff; box-shadow: 0 0 14px rgba(255, 255, 255, 0.8); }
  .dots { display: flex; gap: 0.5rem; margin-top: 1.2rem; pointer-events: auto; }
  .dots button { width: 22px; height: 22px; padding: 0; border: 0; background: transparent; cursor: pointer; position: relative; }
  .dots button::after { content: ''; position: absolute; left: 7px; top: 7px; width: 8px; height: 8px; border-radius: 50%; background: rgba(180, 195, 240, 0.3); transition: background 200ms, transform 200ms; }
  .dots button.on::after { background: #fff; transform: scale(1.25); }
  .dots button:hover::after { background: rgba(255, 255, 255, 0.7); }

  /* narrow screens: universe on top, panel at the bottom */
  .narrow .panel { left: 0.75rem; right: 0.75rem; width: auto; top: auto; bottom: 0.75rem; transform: translateY(40px); padding: 1rem 1rem 0.8rem; }
  .narrow .panel.show { transform: translateY(0); }
  .narrow .readout { min-height: 0; margin-bottom: 0.5rem; }
  .narrow .big { font-size: 2.3rem; }
  .narrow .small { font-size: 0.82rem; }
  .narrow .caption { top: 4.6rem; bottom: auto; left: 1.25rem; right: 1.25rem; }
  .narrow .caption h2 { font-size: 1.9rem; }
  .narrow .caption p { font-size: 0.98rem; }
  .narrow .rail { display: none; }
  .narrow .ruler .len { font-size: 0.74rem; }
  .narrow .ruler .sub { display: none; }
  .narrow .vignette { background:
      linear-gradient(180deg, rgba(3, 5, 12, 0.85) 0%, rgba(3, 5, 12, 0.35) 22%, transparent 36%),
      radial-gradient(130% 100% at 50% 40%, transparent 55%, rgba(2, 4, 10, 0.75) 100%); }
  .narrow .hero { bottom: 18vh; }
</style>
