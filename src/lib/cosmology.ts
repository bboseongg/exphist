/**
 * cosmology.ts — background expansion history for a Friedmann–Lemaître universe
 * with radiation, matter, curvature and CPL dark energy  w(a) = w0 + wa (1 − a).
 *
 * Everything on the site is computed from a {@link CosmoParams} object; a paper
 * contributes nothing but its parameters. Units: H0 in km/s/Mpc, times in Gyr,
 * distances in Mpc, temperatures in K.
 *
 * Validated against astropy (see cosmology.test.ts).
 */

export interface CosmoParams {
  /** Hubble constant today, km/s/Mpc */
  H0: number;
  /** Total matter density today (baryons + CDM) */
  Om: number;
  /** Curvature density today (default 0, flat) */
  Ok?: number;
  /** Dark-energy equation of state today (default −1) */
  w0?: number;
  /** CPL evolution parameter (default 0) */
  wa?: number;
  /** CMB temperature today, K (default 2.7255) */
  Tcmb?: number;
  /** Effective number of relativistic neutrino species (default 3.044) */
  Neff?: number;
}

// ---------------------------------------------------------------------------
// Physical constants
// ---------------------------------------------------------------------------

export const C_KM_S = 299792.458; // speed of light, km/s
/** 1/H0 in Gyr for H0 = 1 km/s/Mpc  (Mpc / (km/s) expressed in Gyr) */
export const HUBBLE_TIME_GYR = 977.792221; // = 3.0856776e19 km / 3.15576e16 s
/** Ω_γ h² for T_CMB = 2.7255 K (from σ_SB, G, c) */
const OMEGA_GAMMA_H2_REF = (() => {
  const sigmaSB = 5.670374419e-8; // W m^-2 K^-4
  const c = 2.99792458e8; // m/s
  const G = 6.6743e-11; // m^3 kg^-1 s^-2
  const T = 2.7255;
  const rhoGamma = (4 * sigmaSB * T ** 4) / c ** 3; // kg m^-3
  const H100 = 100 / 3.0856775814913673e19; // s^-1
  const rhoCrit100 = (3 * H100 * H100) / (8 * Math.PI * G);
  return rhoGamma / rhoCrit100; // ≈ 2.473e-5
})();
/** Massless-neutrino to photon density ratio per unit Neff: (7/8)(4/11)^(4/3) */
const NU_PER_NEFF = (7 / 8) * Math.pow(4 / 11, 4 / 3); // 0.2271073...

// ---------------------------------------------------------------------------
// Derived parameter set
// ---------------------------------------------------------------------------

export interface Cosmology {
  H0: number;
  h: number;
  Om: number;
  Or: number; // photons + massless neutrinos
  Ok: number;
  Ode: number;
  w0: number;
  wa: number;
  Tcmb: number;
  Neff: number;
  /** Hubble time 1/H0 in Gyr */
  tH: number;
  /** Hubble distance c/H0 in Mpc */
  dH: number;
}

export function makeCosmology(p: CosmoParams): Cosmology {
  const H0 = p.H0;
  const h = H0 / 100;
  const Tcmb = p.Tcmb ?? 2.7255;
  const Neff = p.Neff ?? 3.044;
  const Og = (OMEGA_GAMMA_H2_REF * Math.pow(Tcmb / 2.7255, 4)) / (h * h);
  const Or = Og * (1 + NU_PER_NEFF * Neff);
  const Ok = p.Ok ?? 0;
  const Om = p.Om;
  const Ode = 1 - Om - Or - Ok;
  return {
    H0,
    h,
    Om,
    Or,
    Ok,
    Ode,
    w0: p.w0 ?? -1,
    wa: p.wa ?? 0,
    Tcmb,
    Neff,
    tH: HUBBLE_TIME_GYR / H0,
    dH: C_KM_S / H0,
  };
}

// ---------------------------------------------------------------------------
// Background quantities as functions of the scale factor a (a = 1 today)
// ---------------------------------------------------------------------------

/** Dark-energy equation of state w(a) = w0 + wa (1 − a) */
export function wDE(c: Cosmology, a: number): number {
  return c.w0 + c.wa * (1 - a);
}

/** ρ_DE(a)/ρ_DE(1) for CPL dark energy */
export function darkEnergyDensityFactor(c: Cosmology, a: number): number {
  return Math.pow(a, -3 * (1 + c.w0 + c.wa)) * Math.exp(3 * c.wa * (a - 1));
}

/** E²(a) = H²(a)/H0² */
export function E2(c: Cosmology, a: number): number {
  const a2 = a * a;
  return (
    c.Or / (a2 * a2) +
    c.Om / (a2 * a) +
    c.Ok / a2 +
    c.Ode * darkEnergyDensityFactor(c, a)
  );
}

/** E(a) = H(a)/H0 */
export function E(c: Cosmology, a: number): number {
  return Math.sqrt(E2(c, a));
}

/** Hubble rate H(a) in km/s/Mpc */
export function hubbleRate(c: Cosmology, a: number): number {
  return c.H0 * E(c, a);
}

/** Hubble rate as a function of redshift, km/s/Mpc */
export function Hz(c: Cosmology, z: number): number {
  return hubbleRate(c, 1 / (1 + z));
}

export interface DensityFractions {
  radiation: number;
  matter: number;
  curvature: number;
  darkEnergy: number;
}

/** Ω_i(a): fraction of the critical density in each component at scale factor a */
export function densityFractions(c: Cosmology, a: number): DensityFractions {
  const e2 = E2(c, a);
  const a2 = a * a;
  return {
    radiation: c.Or / (a2 * a2) / e2,
    matter: c.Om / (a2 * a) / e2,
    curvature: c.Ok / a2 / e2,
    darkEnergy: (c.Ode * darkEnergyDensityFactor(c, a)) / e2,
  };
}

/** Deceleration parameter q(a) = −ä a / ȧ² = ½ Σ_fluids (1 + 3 w_i) Ω_i(a) */
export function deceleration(c: Cosmology, a: number): number {
  const f = densityFractions(c, a);
  return f.radiation + 0.5 * f.matter + 0.5 * (1 + 3 * wDE(c, a)) * f.darkEnergy;
}

/** CMB temperature at scale factor a, K */
export function temperature(c: Cosmology, a: number): number {
  return c.Tcmb / a;
}

export const zOf = (a: number) => 1 / a - 1;
export const aOf = (z: number) => 1 / (1 + z);

// ---------------------------------------------------------------------------
// Numerical integration (composite Simpson on a smooth integrand)
// ---------------------------------------------------------------------------

export function simpson(f: (x: number) => number, a: number, b: number, n = 400): number {
  if (b === a) return 0;
  if (n % 2 === 1) n += 1;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    s += f(a + i * h) * (i % 2 === 0 ? 2 : 4);
  }
  return (s * h) / 3;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * Cosmic time since a = 0 at scale factor a, in Gyr:
 *   t(a) = (1/H0) ∫_0^a da' / (a' E(a'))
 * Integrated in u = ln a with an analytic radiation-era tail below u_min.
 */
export function ageAt(c: Cosmology, a: number): number {
  if (a <= 0) return 0;
  const uMin = Math.log(1e-10);
  const uMax = Math.log(a);
  // radiation-dominated tail: E ≈ √Or e^{-2u}  ⇒ ∫ e^{2u}/√Or du = e^{2u}/(2√Or)
  const tail = Math.exp(2 * uMin) / (2 * Math.sqrt(c.Or));
  if (uMax <= uMin) return c.tH * (Math.exp(2 * uMax) / (2 * Math.sqrt(c.Or)));
  // integrand 1/E(e^u) is smooth; use ~40 Simpson intervals per e-fold
  const n = Math.max(200, Math.ceil((uMax - uMin) * 40));
  const integral = simpson((u) => 1 / E(c, Math.exp(u)), uMin, uMax, n);
  return c.tH * (integral + tail);
}

/** Age of the universe today, Gyr */
export function age(c: Cosmology): number {
  return ageAt(c, 1);
}

/** Lookback time to redshift z, Gyr */
export function lookbackTime(c: Cosmology, z: number): number {
  return ageAt(c, 1) - ageAt(c, aOf(z));
}

/**
 * Tabulated a(t) for fast inversion (used by the animation).
 * Returns monotonically increasing arrays of ln a and t (Gyr).
 */
export interface ScaleFactorTable {
  lnA: Float64Array;
  t: Float64Array;
  aMin: number;
  aMax: number;
}

export function scaleFactorTable(c: Cosmology, aMin = 1e-8, aMax = 20, n = 2400): ScaleFactorTable {
  const uMin = Math.log(aMin);
  const uMax = Math.log(aMax);
  const du = (uMax - uMin) / n;
  const lnA = new Float64Array(n + 1);
  const t = new Float64Array(n + 1);
  // start value from the direct integral, then accumulate with Simpson on each cell
  lnA[0] = uMin;
  t[0] = ageAt(c, aMin);
  let acc = t[0] / c.tH;
  const f = (u: number) => 1 / E(c, Math.exp(u));
  let fPrev = f(uMin);
  for (let i = 1; i <= n; i++) {
    const u0 = uMin + (i - 1) * du;
    const u1 = u0 + du;
    const fMid = f(u0 + du / 2);
    const fNext = f(u1);
    acc += (du / 6) * (fPrev + 4 * fMid + fNext);
    lnA[i] = u1;
    t[i] = acc * c.tH;
    fPrev = fNext;
  }
  return { lnA, t, aMin, aMax };
}

/** Invert the table: scale factor at cosmic time t (Gyr), log-linear interpolation. */
export function scaleFactorAt(table: ScaleFactorTable, tGyr: number): number {
  const { lnA, t } = table;
  const n = t.length;
  if (tGyr <= t[0]) {
    // radiation era: a ∝ t^{1/2}
    return Math.exp(lnA[0]) * Math.sqrt(Math.max(tGyr, 0) / t[0]);
  }
  if (tGyr >= t[n - 1]) {
    // extrapolate with the final logarithmic slope
    const slope = (lnA[n - 1] - lnA[n - 2]) / (t[n - 1] - t[n - 2]);
    return Math.exp(lnA[n - 1] + slope * (tGyr - t[n - 1]));
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= tGyr) lo = mid;
    else hi = mid;
  }
  const frac = (tGyr - t[lo]) / (t[hi] - t[lo]);
  return Math.exp(lnA[lo] + frac * (lnA[hi] - lnA[lo]));
}

/** Cosmic time at scale factor a from the table (interpolated), Gyr */
export function timeAt(table: ScaleFactorTable, a: number): number {
  const { lnA, t } = table;
  const u = Math.log(a);
  const n = t.length;
  if (u <= lnA[0]) return t[0] * Math.exp(2 * (u - lnA[0]));
  if (u >= lnA[n - 1]) {
    const slope = (t[n - 1] - t[n - 2]) / (lnA[n - 1] - lnA[n - 2]);
    return t[n - 1] + slope * (u - lnA[n - 1]);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lnA[mid] <= u) lo = mid;
    else hi = mid;
  }
  const frac = (u - lnA[lo]) / (lnA[hi] - lnA[lo]);
  return t[lo] + frac * (t[hi] - t[lo]);
}

// ---------------------------------------------------------------------------
// Distances
// ---------------------------------------------------------------------------

/** Line-of-sight comoving distance D_C(z), Mpc */
export function comovingDistance(c: Cosmology, z: number): number {
  if (z <= 0) return 0;
  const n = Math.max(200, Math.ceil(z * 200));
  return c.dH * simpson((zz) => 1 / E(c, aOf(zz)), 0, z, n);
}

/** Transverse comoving distance D_M(z), Mpc (handles curvature) */
export function transverseComovingDistance(c: Cosmology, z: number): number {
  const dc = comovingDistance(c, z);
  const Ok = c.Ok;
  if (Math.abs(Ok) < 1e-12) return dc;
  const sqrtK = Math.sqrt(Math.abs(Ok));
  const x = (sqrtK * dc) / c.dH;
  return (c.dH / sqrtK) * (Ok > 0 ? Math.sinh(x) : Math.sin(x));
}

/** Luminosity distance D_L(z), Mpc */
export function luminosityDistance(c: Cosmology, z: number): number {
  return (1 + z) * transverseComovingDistance(c, z);
}

/** Angular-diameter distance D_A(z), Mpc */
export function angularDiameterDistance(c: Cosmology, z: number): number {
  return transverseComovingDistance(c, z) / (1 + z);
}

/** Distance modulus μ(z) = 5 log10(D_L / 10 pc) */
export function distanceModulus(c: Cosmology, z: number): number {
  return 5 * Math.log10(luminosityDistance(c, z)) + 25;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/** Scale factor of matter–radiation equality */
export function aEquality(c: Cosmology): number {
  return c.Or / c.Om;
}

/** Scale factor at which the expansion switches from deceleration to acceleration (q = 0), or null */
export function aAccelerationOnset(c: Cosmology): number | null {
  // search in ln a over [1e-3, 1]
  let lo = Math.log(1e-3);
  let hi = 0;
  const qLo = deceleration(c, Math.exp(lo));
  const qHi = deceleration(c, Math.exp(hi));
  if (qLo > 0 && qHi > 0) return null; // never accelerates by today
  if (qLo < 0) return Math.exp(lo);
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (deceleration(c, Math.exp(mid)) > 0) lo = mid;
    else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}

/** Scale factor at which dark energy overtakes matter (Ω_de = Ω_m), or null */
export function aDarkEnergyDomination(c: Cosmology): number | null {
  let lo = Math.log(1e-2);
  let hi = Math.log(5);
  const g = (u: number) => {
    const f = densityFractions(c, Math.exp(u));
    return f.darkEnergy - f.matter;
  };
  if (g(lo) > 0) return Math.exp(lo);
  if (g(hi) < 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}

/** Convenience: build everything a figure needs from a parameter set */
export function describe(p: CosmoParams) {
  const c = makeCosmology(p);
  const t0 = age(c);
  const aAcc = aAccelerationOnset(c);
  const aDE = aDarkEnergyDomination(c);
  const aEq = aEquality(c);
  return {
    c,
    age: t0,
    zEquality: zOf(aEq),
    tEquality: ageAt(c, aEq),
    zAcceleration: aAcc === null ? null : zOf(aAcc),
    tAcceleration: aAcc === null ? null : ageAt(c, aAcc),
    zDarkEnergyDomination: aDE === null ? null : zOf(aDE),
    tDarkEnergyDomination: aDE === null ? null : ageAt(c, aDE),
    q0: deceleration(c, 1),
    fractionsToday: densityFractions(c, 1),
  };
}
