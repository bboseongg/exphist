/**
 * English / Korean for the home-page story.
 *
 * The language lives on <html data-lang>, set before first paint by the inline script in Base.astro
 * (stored choice, else the browser language). Static Astro text uses <T en ko> spans hidden by CSS;
 * Svelte islands read `lang.current`, which follows the `langchange` event the header toggle fires.
 */
export type Lang = 'en' | 'ko';

class LangState {
  current = $state<Lang>('en');
}
export const lang = new LangState();

/** call from onMount: adopt the page language (after hydration, so SSR markup matches) and follow changes */
export function syncLang(): () => void {
  if (typeof document === 'undefined') return () => {};
  const read = () => {
    lang.current = document.documentElement.dataset.lang === 'ko' ? 'ko' : 'en';
  };
  read();
  document.addEventListener('langchange', read);
  return () => document.removeEventListener('langchange', read);
}

const STR = {
  'rewind.title': { en: 'Rewind', ko: '되감기' },
  'rewind.line': { en: 'Run the clock back 13.8 billion years.', ko: '시계를 138억 년 전으로 되돌립니다.' },
  'fog.title': { en: 'A glowing fog', ko: '빛나는 안개' },
  'fog.line': { en: 'Hotter than the Sun’s surface. Light can’t get through.', ko: '태양 표면보다 뜨거운 플라스마. 빛이 뚫고 나가지 못합니다.' },
  'light.title': { en: 'First light', ko: '첫 빛' },
  'light.line': {
    en: 'About 370,000 years in, it cools and turns transparent. That light is the CMB.',
    ko: '약 37만 년, 우주가 식으며 투명해집니다. 이때 풀려난 빛이 우주배경복사입니다.',
  },
  'brakes.title': { en: 'Gravity brakes', ko: '중력의 브레이크' },
  'brakes.line': { en: 'Matter takes over, galaxies form, and the expansion slows.', ko: '물질이 우세해지고 은하가 생기면서 팽창이 느려집니다.' },
  'speeds.title': { en: 'Then it speeds up', ko: '그리고 다시 빨라지다' },
  'speeds.line': { en: 'About six billion years ago, dark energy took the lead.', ko: '약 60억 년 전부터 암흑에너지가 팽창을 이끕니다.' },
  'sne.title': { en: 'Exploding stars', ko: '폭발하는 별' },
  'sne.line': {
    en: 'Distant supernovae look fainter than they would in a universe without dark energy.',
    ko: '먼 초신성은 암흑에너지가 없는 우주에서보다 더 어둡게 보입니다.',
  },
  'futures.title': { en: 'Two futures', ko: '두 가지 미래' },
  'futures.line': { en: 'A constant dark energy, or one that is slowly fading?', ko: '변하지 않는 암흑에너지일까, 서서히 옅어지는 암흑에너지일까?' },
  'w0wa.title': { en: 'Is dark energy changing?', ko: '암흑에너지는 변하고 있을까?' },
  'w0wa.line': {
    en: 'Every point is a published fit. A true constant sits at the ring.',
    ko: '점 하나가 발표된 결과 하나입니다. 우주상수라면 고리 위에 있어야 합니다.',
  },
  'h0.title': { en: 'How fast, today?', ko: '지금은 얼마나 빠를까?' },
  'h0.line': { en: 'The early universe and the nearby one still disagree.', ko: '초기 우주로 잰 값과 가까운 우주로 잰 값이 아직 어긋납니다.' },

  'budget.note': { en: 'share of the energy budget', ko: '에너지 구성비' },
  radiation: { en: 'radiation', ko: '복사' },
  matter: { en: 'matter', ko: '물질' },
  'dark energy': { en: 'dark energy', ko: '암흑에너지' },
  'scale.note': { en: 'size of the universe (today = 1)', ko: '우주의 크기 (현재 = 1)' },
  today: { en: 'today', ko: '현재' },
  constant: { en: 'constant', ko: '상수' },
  fading: { en: 'fading', ko: '옅어짐' },
  'speed.note': { en: 'expansion speed (today = 1)', ko: '팽창 속도 (현재 = 1)' },
  slowing: { en: 'slowing', ko: '감속' },
  'speeding up': { en: 'speeding up', ko: '가속' },
  slowest: { en: 'slowest point', ko: '가장 느린 순간' },
  'bao.legend': { en: 'DESI DR2 BAO measurements', ko: 'DESI DR2 BAO 측정값' },
  'curve.planck': { en: 'Planck 2018 ΛCDM', ko: 'Planck 2018 ΛCDM' },
  'future.const': { en: 'constant dark energy', ko: '변하지 않는 암흑에너지' },
  'future.dyn': { en: 'evolving w(a)', ko: '변하는 w(a)' },
  'w0.note': { en: 'w₀ — today', ko: 'w₀ — 현재 값' },
  'wa.note': { en: 'wₐ — change over time', ko: 'wₐ — 시간에 따른 변화' },
  'w0wa.readout': { en: 'how far {year} fits sit from a constant · 5σ = discovery', ko: '{year}년 분석이 상수에서 벗어난 정도 · 5σ가 발견 기준' },
  recal: { en: 'SN recalibration', ko: '초신성 재보정' },
  early: { en: 'early universe', ko: '초기 우주' },
  nearby: { en: 'nearby universe', ko: '가까운 우주' },
  'cmb.sim': { en: 'simulated sky · Planck 2018 statistics', ko: '모의 하늘 · Planck 2018 통계' },
  'cmb.peak': { en: 'ℓ ≈ 220 · spots about 1° across', ko: 'ℓ ≈ 220 · 약 1° 크기의 얼룩' },
  'cmb.y': { en: 'ripple strength Dℓ (μK²)', ko: '요동 세기 Dℓ (μK²)' },
  'cmb.x': { en: 'angular scale ℓ', ko: '각도 규모 ℓ' },
  colder: { en: 'colder', ko: '차가움' },
  hotter: { en: 'hotter', ko: '뜨거움' },
  'sn.y': { en: '↑ farther, fainter · vs. an empty universe (Δμ, mag)', ko: '↑ 더 멀고 어두움 · 빈 우주 대비 (Δμ, 등급)' },
  'story.aria': { en: 'The expansion history of the universe, told by scrolling', ko: '스크롤로 보는 우주 팽창의 역사' },
  'sn.x': { en: 'redshift z', ko: '적색이동 z' },
  'sn.lcdm': { en: 'with dark energy', ko: '암흑에너지 있음' },
  'sn.empty': { en: 'empty universe', ko: '빈 우주' },
  'sn.eds': { en: 'matter only', ko: '물질만' },
  'sn.unit': { en: 'supernovae', ko: '개의 초신성' },
  'sn.small': { en: 'Pantheon+ · one dot per supernova, bars are averages', ko: 'Pantheon+ · 점 하나가 초신성 하나, 막대는 평균' },
  'ruler.today': { en: 'today: 1 billion light-years', ko: '현재 10억 광년' },
  'ruler.stretch': { en: 'stretches with space', ko: '공간과 함께 늘어납니다' },
  chapters: { en: 'Chapters', ko: '장' },
} satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof STR;

/** translated string; `{name}` placeholders are filled from vars */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = STR[key][lang.current];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const sig = (x: number, d = 3) => Number(x.toPrecision(d));

/** a cosmic time as a big number and a unit, e.g. 13.8 + "billion years" / 138 + "억 년" */
export function timeParts(tGyr: number): { num: string; unit: string } {
  const years = tGyr * 1e9;
  if (lang.current === 'ko') {
    if (years >= 1e8) {
      const v = years / 1e8;
      return { num: v >= 10 ? n0(v) : v.toFixed(1), unit: '억 년' };
    }
    if (years >= 1e4) {
      const v = years / 1e4;
      return { num: v >= 10 ? n0(v) : v.toFixed(1), unit: '만 년' };
    }
    return { num: n0(years), unit: '년' };
  }
  if (tGyr >= 1) return { num: tGyr.toFixed(1), unit: 'billion years' };
  if (tGyr >= 1e-3) {
    const v = tGyr * 1e3;
    return { num: v >= 10 ? n0(v) : v.toFixed(1), unit: 'million years' };
  }
  return { num: n0(sig(years)), unit: 'years' };
}

/** short tick label for a time axis */
export function timeTick(tGyr: number): string {
  const years = tGyr * 1e9;
  if (lang.current === 'ko') {
    if (years >= 1e8) return `${n0(years / 1e8)}억 년`;
    if (years >= 1e4) return `${n0(years / 1e4)}만 년`;
    return `${n0(years)}년`;
  }
  if (tGyr >= 1) return `${sig(tGyr, 2)} Gyr`;
  if (tGyr >= 1e-3) return `${n0(tGyr * 1e3)} Myr`;
  if (tGyr >= 1e-6) return `${n0(tGyr * 1e6)} kyr`;
  return `${n0(years)} yr`;
}

/** tick for an axis in Gyr (0, 5, 10 …) */
export function gyrTick(g: number): string {
  if (g === 0) return '0';
  return lang.current === 'ko' ? `${n0(g * 10)}억 년` : `${g} Gyr`;
}

export function sizeText(a: number): string {
  const ko = lang.current === 'ko';
  if (Math.abs(a - 1) < 0.006) return ko ? '현재 크기' : 'today’s size';
  if (a > 1) return ko ? `현재의 ${a.toFixed(2)}배` : `${a.toFixed(2)}× today’s size`;
  const inv = 1 / a;
  const f = `1/${inv < 10 ? inv.toFixed(1) : n0(inv)}`;
  return ko ? `현재 크기의 ${f}` : `${f} of today’s size`;
}

export function tempText(TK: number): string {
  if (TK < 10) return `${TK.toFixed(2)} K`;
  if (TK < 1e6) return `${n0(sig(TK))} K`;
  return lang.current === 'ko' ? `${n0(sig(TK) / 1e4)}만 K` : `${sig(TK / 1e6, 2)} million K`;
}

/** proper length today of 1 Gly comoving, at scale factor a */
export function rulerText(a: number): string {
  // round to two significant figures first, so 0.9996 Gly reads "1 billion", not "1,000 million"
  const ly = sig(a * 1e9, 2);
  if (lang.current === 'ko') {
    if (ly >= 1e8) return `${sig(ly / 1e8, 2).toLocaleString('en-US')}억 광년`;
    if (ly >= 1e4) return `${n0(ly / 1e4)}만 광년`;
    return `${n0(ly)}광년`;
  }
  if (ly >= 1e9) return `${sig(ly / 1e9, 2)} billion light-years`;
  if (ly >= 1e6) return `${n0(ly / 1e6)} million light-years`;
  return `${n0(ly)} light-years`;
}
