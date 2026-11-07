/** Number formatting shared by the figures. */

export function fmtTime(tGyr: number): string {
  if (!isFinite(tGyr)) return '—';
  if (tGyr >= 1) return `${tGyr.toFixed(tGyr < 10 ? 2 : 1)} Gyr`;
  if (tGyr >= 1e-3) return `${(tGyr * 1e3).toFixed(tGyr * 1e3 < 10 ? 1 : 0)} Myr`;
  if (tGyr >= 1e-6) return `${(tGyr * 1e6).toFixed(tGyr * 1e6 < 10 ? 1 : 0)} kyr`;
  if (tGyr >= 1e-9) return `${(tGyr * 1e9).toFixed(1)} yr`;
  const s = tGyr * 1e9 * 3.15576e7;
  if (s >= 1) return `${s.toFixed(0)} s`;
  return `${s.toExponential(1)} s`;
}

export function fmtTimeAxis(tGyr: number): string {
  if (tGyr === 0) return '0';
  if (tGyr >= 1) return `${+tGyr.toPrecision(3)} Gyr`;
  if (tGyr >= 1e-3) return `${+(tGyr * 1e3).toPrecision(3)} Myr`;
  if (tGyr >= 1e-6) return `${+(tGyr * 1e6).toPrecision(3)} kyr`;
  return `${+(tGyr * 1e9).toPrecision(3)} yr`;
}

export function fmtScaleFactor(a: number): string {
  if (a >= 0.01) return a.toFixed(a < 0.1 ? 3 : 2);
  return a.toExponential(2);
}

export function fmtRedshift(a: number): string {
  if (a >= 1) return a === 1 ? '0' : `−${(1 - 1 / a).toFixed(2)}`;
  const z = 1 / a - 1;
  if (z < 10) return z.toFixed(2);
  if (z < 1e5) return Math.round(z).toLocaleString('en-US');
  return z.toExponential(1);
}

export function fmtTemperature(TK: number): string {
  if (TK < 1e3) return `${TK.toFixed(TK < 10 ? 2 : 0)} K`;
  if (TK < 1e6) return `${(TK / 1e3).toFixed(TK < 1e4 ? 2 : 0)} kK`;
  if (TK < 1e9) return `${(TK / 1e6).toFixed(2)} MK`;
  return `${TK.toExponential(1)} K`;
}

export function fmtH(H: number): string {
  if (H < 1e3) return `${H.toFixed(1)}`;
  if (H < 1e6) return `${(H / 1e3).toFixed(1)}k`;
  return H.toExponential(1);
}

export function fmtPercent(x: number): string {
  if (x < 0.0005) return '<0.1%';
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}

export function fmtSigma(s: number | undefined): string {
  return s === undefined ? '—' : `${s.toFixed(1)}σ`;
}
