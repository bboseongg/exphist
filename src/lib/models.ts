/**
 * Plain-data view of the paper collection for the interactive islands.
 * Everything here must be JSON-serialisable (it crosses the Astro → Svelte boundary).
 */
import type { CosmoParams } from './cosmology';

export interface Measurement {
  value: number;
  sigma?: number;
  plus?: number;
  minus?: number;
  note?: string;
}

export type ParamName = 'H0' | 'Om' | 'Ok' | 'w' | 'w0' | 'wa' | 'S8' | 'sigma8';
export type Params = Partial<Record<ParamName, Measurement>>;

export interface ResultData {
  /** `${paperId}/${resultId}` — globally unique */
  key: string;
  paperId: string;
  paperShort: string;
  paperTitle: string;
  authors: string;
  arxiv: string;
  year: number;
  date?: string;
  probes: string[];
  status: 'verified' | 'unverified';
  checkedOn?: string;
  journal?: string;
  label: string;
  model: string;
  datasets: string[];
  params: Params;
  preferenceOverLCDM?: number;
  featured: boolean;
  /** where in the paper the numbers are */
  source?: string;
  notes?: string;
}

export interface PaperLike {
  id: string;
  data: {
    title: string;
    shortName: string;
    authors: string;
    year: number;
    date?: string;
    arxiv: string;
    probes: string[];
    status: 'verified' | 'unverified';
    checkedOn?: string;
    journal?: string;
    results: Array<{
      id: string;
      label: string;
      model: string;
      datasets: string[];
      params: Params;
      preferenceOverLCDM?: number;
      featured: boolean;
      source?: string;
      notes?: string;
    }>;
  };
}

export function flattenPapers(papers: PaperLike[]): ResultData[] {
  const out: ResultData[] = [];
  for (const p of papers) {
    for (const r of p.data.results) {
      out.push({
        key: `${p.id}/${r.id}`,
        paperId: p.id,
        paperShort: p.data.shortName,
        paperTitle: p.data.title,
        authors: p.data.authors,
        arxiv: p.data.arxiv,
        year: p.data.year,
        date: p.data.date,
        probes: p.data.probes,
        status: p.data.status,
        checkedOn: p.data.checkedOn,
        journal: p.data.journal,
        label: r.label,
        model: r.model,
        datasets: r.datasets ?? [],
        params: r.params ?? {},
        preferenceOverLCDM: r.preferenceOverLCDM,
        featured: r.featured ?? false,
        source: r.source,
        notes: r.notes,
      });
    }
  }
  // newest first, stable
  return out.sort((a, b) => (b.date ?? `${b.year}`).localeCompare(a.date ?? `${a.year}`));
}

/** A result can be drawn as an expansion history when it pins down H0 and Om. */
export function isDrawable(r: ResultData): boolean {
  return r.params.H0 !== undefined && r.params.Om !== undefined;
}

export function toCosmoParams(r: ResultData): CosmoParams {
  const p = r.params;
  return {
    H0: p.H0!.value,
    Om: p.Om!.value,
    Ok: p.Ok?.value ?? 0,
    w0: p.w0?.value ?? p.w?.value ?? -1,
    wa: p.wa?.value ?? 0,
  };
}

/** 68% interval of a measurement as [low, high] */
export function interval(m: Measurement): [number, number] {
  const minus = m.minus ?? m.sigma ?? 0;
  const plus = m.plus ?? m.sigma ?? 0;
  return [m.value - minus, m.value + plus];
}

export function arxivUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

/** Compact "value ± σ" or "value +a −b" string */
export function fmtMeasurement(m: Measurement | undefined, digits?: number): string {
  if (!m) return '—';
  const d = digits ?? inferDigits(m);
  const v = m.value.toFixed(d);
  if (m.sigma !== undefined) return `${v} ± ${m.sigma.toFixed(d)}`;
  if (m.plus !== undefined && m.minus !== undefined) return `${v} +${m.plus.toFixed(d)} −${m.minus.toFixed(d)}`;
  return v;
}

/** Keep the precision the paper quoted: the most decimals used by the value or its errors. */
function inferDigits(m: Measurement): number {
  const decimals = (n: number | undefined) => {
    if (n === undefined) return 0;
    const s = String(n);
    if (s.includes('e')) return 4;
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  };
  return Math.min(4, Math.max(decimals(m.value), decimals(m.sigma), decimals(m.plus), decimals(m.minus)));
}

/** Short row label for a result: the paper name, plus the fit label when a paper has several rows. */
export function rowLabel(r: ResultData, siblings: number, maxLen = 36): string {
  if (siblings <= 1) return r.paperShort;
  const l = r.label.replace(/\s*\((ΛCDM|wCDM|w0waCDM)\)$/i, '');
  return l.length > maxLen ? l.slice(0, maxLen - 1) + '…' : l;
}

export const MODEL_LABEL: Record<string, string> = {
  LCDM: 'ΛCDM',
  wCDM: 'wCDM',
  w0waCDM: 'w₀wₐCDM',
  oLCDM: 'oΛCDM',
  ow0waCDM: 'ow₀wₐCDM',
};

export const PROBE_LABEL: Record<string, string> = {
  CMB: 'CMB',
  CMBlens: 'CMB lensing',
  BAO: 'BAO',
  Lya: 'Lyα forest',
  SN: 'SNe Ia',
  WL: 'weak lensing',
  GC: 'galaxy clustering',
  Clusters: 'clusters',
  CC: 'cosmic chronometers',
  Ladder: 'distance ladder',
  TD: 'time delays',
  GW: 'gravitational waves',
  BBN: 'BBN prior',
};

/** Early-universe inference vs late-universe (direct) measurement, for the H0 ladder */
export function h0Category(r: ResultData): 'early' | 'late' {
  const late = new Set(['Ladder', 'TD', 'GW']);
  return r.probes.some((p) => late.has(p)) ? 'late' : 'early';
}
