import { describe, expect, it } from 'vitest';
import ref from './__fixtures__/astropy_reference.json';
import {
  age,
  ageAt,
  angularDiameterDistance,
  aOf,
  comovingDistance,
  deceleration,
  densityFractions,
  describe as describeModel,
  Hz,
  lookbackTime,
  luminosityDistance,
  makeCosmology,
  scaleFactorAt,
  scaleFactorTable,
  timeAt,
  type CosmoParams,
} from './cosmology';

type Row = {
  z: number;
  H: number;
  age: number;
  lookback: number;
  dc: number;
  dl: number;
  da: number;
  Om: number;
  Ode: number;
  Or: number;
};
type Model = { params: CosmoParams; Or0: number; age0: number; rows: Row[] };

const models = ref as unknown as Record<string, Model>;

function closeRel(actual: number, expected: number, rtol: number, atol = 0) {
  const tol = atol + rtol * Math.abs(expected);
  expect(Math.abs(actual - expected), `got ${actual}, want ${expected}`).toBeLessThanOrEqual(tol);
}

describe('cosmology vs astropy', () => {
  for (const [name, m] of Object.entries(models)) {
    describe(name, () => {
      const c = makeCosmology(m.params);

      it('radiation density today', () => closeRel(c.Or, m.Or0, 2e-3));
      it('age today', () => closeRel(age(c), m.age0, 2e-4));

      for (const row of m.rows) {
        it(`z = ${row.z}`, () => {
          const a = aOf(row.z);
          closeRel(Hz(c, row.z), row.H, 1e-5);
          closeRel(ageAt(c, a), row.age, 3e-4, 1e-4);
          closeRel(lookbackTime(c, row.z), row.lookback, 3e-4, 1e-4);
          closeRel(comovingDistance(c, row.z), row.dc, 2e-4, 1e-3);
          closeRel(luminosityDistance(c, row.z), row.dl, 2e-4, 1e-3);
          closeRel(angularDiameterDistance(c, row.z), row.da, 2e-4, 1e-3);
          const f = densityFractions(c, a);
          closeRel(f.matter, row.Om, 1e-4);
          closeRel(f.darkEnergy, row.Ode, 1e-4, 1e-6);
          closeRel(f.radiation, row.Or, 2e-3, 1e-9);
        });
      }
    });
  }
});

describe('scale-factor table', () => {
  const c = makeCosmology({ H0: 67.36, Om: 0.3153 });
  const table = scaleFactorTable(c);

  it('inverts time to scale factor consistently', () => {
    for (const a of [1e-6, 1e-3, 0.1, 0.5, 1, 2, 5]) {
      const t = timeAt(table, a);
      closeRel(scaleFactorAt(table, t), a, 1e-5);
      closeRel(t, ageAt(c, a), 2e-4, 1e-6);
    }
  });

  it('matches the direct integral at today', () => {
    closeRel(timeAt(table, 1), age(c), 1e-4);
  });

  it('is monotonic', () => {
    for (let i = 1; i < table.t.length; i++) expect(table.t[i]).toBeGreaterThan(table.t[i - 1]);
  });
});

describe('milestones (Planck 2018 ΛCDM)', () => {
  const d = describeModel({ H0: 67.36, Om: 0.3153 });
  it('age ≈ 13.8 Gyr', () => closeRel(d.age, 13.79, 3e-3));
  it('matter–radiation equality near z ≈ 3400', () => {
    expect(d.zEquality).toBeGreaterThan(3200);
    expect(d.zEquality).toBeLessThan(3600);
  });
  it('acceleration began near z ≈ 0.6', () => {
    expect(d.zAcceleration).not.toBeNull();
    expect(d.zAcceleration!).toBeGreaterThan(0.55);
    expect(d.zAcceleration!).toBeLessThan(0.70);
  });
  it('dark energy dominates near z ≈ 0.3', () => {
    expect(d.zDarkEnergyDomination).not.toBeNull();
    expect(d.zDarkEnergyDomination!).toBeGreaterThan(0.25);
    expect(d.zDarkEnergyDomination!).toBeLessThan(0.35);
  });
  it('q0 ≈ −0.53', () => closeRel(d.q0, 0.5 * 0.3153 - (1 - 0.3153), 2e-3, 1e-3));
  it('deceleration positive in the matter era', () => {
    expect(deceleration(d.c, 0.1)).toBeGreaterThan(0.4);
  });
});
