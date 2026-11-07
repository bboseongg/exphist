#!/usr/bin/env python3
"""Generate astropy reference values used by src/lib/cosmology.test.ts.

Run:  python3 scripts/make_reference.py
Writes src/lib/__fixtures__/astropy_reference.json
"""
import json
from pathlib import Path

import astropy.units as u
from astropy.cosmology import FlatLambdaCDM, FlatwCDM, Flatw0waCDM, LambdaCDM

OUT = Path(__file__).resolve().parents[1] / "src/lib/__fixtures__/astropy_reference.json"

Z = [0.0, 0.1, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 100.0, 1000.0]
COMMON = dict(Tcmb0=2.7255, Neff=3.044, m_nu=0.0 * u.eV)

models = {
    "planck18_flat_lcdm": dict(
        params={"H0": 67.36, "Om": 0.3153},
        cosmo=FlatLambdaCDM(H0=67.36, Om0=0.3153, **COMMON),
    ),
    "desi_dr2_desy5_w0wa": dict(
        params={"H0": 66.74, "Om": 0.3191, "w0": -0.752, "wa": -0.86},
        cosmo=Flatw0waCDM(H0=66.74, Om0=0.3191, w0=-0.752, wa=-0.86, **COMMON),
    ),
    "flat_wcdm": dict(
        params={"H0": 70.0, "Om": 0.30, "w0": -0.9},
        cosmo=FlatwCDM(H0=70.0, Om0=0.30, w0=-0.9, **COMMON),
    ),
    "open_lcdm": dict(
        params=None,  # filled below once Ok is known
        cosmo=LambdaCDM(H0=70.0, Om0=0.30, Ode0=0.65, **COMMON),
    ),
}

out = {}
for name, m in models.items():
    c = m["cosmo"]
    params = m["params"]
    if params is None:
        params = {"H0": float(c.H0.value), "Om": float(c.Om0), "Ok": float(c.Ok0)}
    rows = []
    for z in Z:
        rows.append(
            {
                "z": z,
                "H": float(c.H(z).value),
                "age": float(c.age(z).value),
                "lookback": float(c.lookback_time(z).value),
                "dc": float(c.comoving_distance(z).value),
                "dl": float(c.luminosity_distance(z).value),
                "da": float(c.angular_diameter_distance(z).value),
                "Om": float(c.Om(z)),
                "Ode": float(c.Ode(z)),
                "Or": float(c.Ogamma(z) + c.Onu(z)),
            }
        )
    out[name] = {
        "params": params,
        "Or0": float(c.Ogamma0 + c.Onu0),
        "age0": float(c.age(0).value),
        "rows": rows,
    }

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out, indent=1))
print(f"wrote {OUT}")
for name, m in out.items():
    print(f"{name:26s} age0 = {m['age0']:.4f} Gyr  Or0 = {m['Or0']:.3e}")
