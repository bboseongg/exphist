"""Measurement data drawn directly by the home-page story.

    python3 -I scripts/make_story_data.py PANTHEON.dat BAO_MEAN.txt BAO_COV.txt src/data

PANTHEON.dat  Pantheon+SH0ES distance table (Scolnic et al. 2022; Brout et al. 2022),
              github.com/PantheonPlusSH0ES/DataRelease, Pantheon+_Data/4_DISTANCES_AND_COVAR/
BAO_MEAN.txt  DESI DR2 BAO means and covariance as distributed with Cobaya
BAO_COV.txt   (bao_data: desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_{mean,cov}.txt)

Writes pantheon_hubble.json (Hubble-diagram residuals) and desi_dr2_bao.json.
"""
import json
import sys

import numpy as np

C = 299792.458  # km/s
# Planck 2018 TT,TE,EE+lowE+lensing, Table 2 (arXiv:1807.06209)
H0, OM, RDRAG = 67.36, 0.3153, 147.09


def dl_flat(z, om):
    """luminosity distance (Mpc) of flat ΛCDM, radiation neglected (< 0.1% below z = 2.3)"""
    zz = np.linspace(0.0, float(np.max(z)) * 1.001, 40001)
    inv = 1.0 / np.sqrt(om * (1 + zz) ** 3 + (1 - om))
    dc = np.concatenate([[0.0], np.cumsum(0.5 * (inv[1:] + inv[:-1]) * np.diff(zz))])
    return (1 + z) * np.interp(z, zz, dc) * C / H0


def dl_milne(z):
    """empty universe (Ωm = ΩΛ = 0, Ωk = 1): d_L = (c/H0) z (1 + z/2)"""
    return C / H0 * z * (1 + z / 2)


def mu(dl):
    return 5 * np.log10(dl) + 25


def pantheon(path):
    t = np.genfromtxt(path, names=True, dtype=None, encoding=None)
    keep = (t["zHD"] > 0.01) & (t["IS_CALIBRATOR"] == 0)
    t = t[keep]
    # one point per supernova: inverse-variance mean over the surveys that observed it
    sne = {}
    for row in t:
        sne.setdefault(row["CID"], []).append((row["zHD"], row["MU_SH0ES"], row["MU_SH0ES_ERR_DIAG"]))
    z, m, e = [], [], []
    for rows in sne.values():
        r = np.array(rows)
        w = 1 / r[:, 2] ** 2
        z.append(np.average(r[:, 0], weights=w))
        m.append(np.average(r[:, 1], weights=w))
        e.append(1 / np.sqrt(w.sum()))
    z, m, e = map(np.array, (z, m, e))
    o = np.argsort(z)
    z, m, e = z[o], m[o], e[o]

    ref = mu(dl_milne(z))
    lcdm = mu(dl_flat(z, OM)) - ref
    raw = m - ref
    # the SN absolute magnitude is degenerate with H0: fit that one offset against Planck ΛCDM
    w = 1 / e**2
    off = np.sum(w * (raw - lcdm)) / np.sum(w)
    d = raw - off

    edges = np.logspace(np.log10(0.01), np.log10(2.3), 19)
    bins = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        s = (z >= lo) & (z < hi)
        if s.sum() < 3:
            continue
        ww = w[s]
        bins.append({
            "z": round(float(np.exp(np.average(np.log(z[s]), weights=ww))), 4),
            "dmu": round(float(np.average(d[s], weights=ww)), 4),
            "err": round(float(1 / np.sqrt(ww.sum())), 4),
            "n": int(s.sum()),
        })

    def chi2(model):
        bz = np.array([b["z"] for b in bins])
        bd = np.array([b["dmu"] for b in bins])
        be = np.array([b["err"] for b in bins])
        return float(np.sum(((bd - model(bz)) / be) ** 2))

    eds = lambda zz: mu(2 * C / H0 * (1 + zz) * (1 - 1 / np.sqrt(1 + zz))) - mu(dl_milne(zz))
    report = {
        "supernovae": int(z.size),
        "light_curves": int(keep.sum()),
        "offset_mag": round(float(off), 4),
        "implied_H0_for_this_offset": round(float(H0 * 10 ** (-off / 5)), 2),
        "chi2_binned": {
            "Planck LCDM": round(chi2(lambda zz: mu(dl_flat(zz, OM)) - mu(dl_milne(zz))), 1),
            "matter only (EdS)": round(chi2(eds), 1),
            "empty (Milne)": round(chi2(lambda zz: 0 * zz), 1),
        },
        "bins": len(bins),
    }
    out = {
        "source": "Pantheon+SH0ES distance moduli (MU_SH0ES, diagonal errors); Scolnic et al. 2022, Brout et al. 2022",
        "definition": "dmu = mu - mu_empty(z), the distance modulus relative to an empty (Milne) universe. "
        "The SN magnitude offset is fitted to Planck 2018 LCDM; z > 0.01, Cepheid calibrators excluded, "
        "duplicate light curves of one supernova averaged.",
        "count": int(z.size),
        "sn": [[round(float(a), 5), round(float(b), 3), round(float(c), 3)] for a, b, c in zip(z, d, e)],
        "bins": bins,
    }
    return out, report


TRACER = {0.295: "BGS", 0.51: "LRG1", 0.706: "LRG2", 0.934: "LRG3+ELG1", 1.321: "ELG2", 1.484: "QSO", 2.33: "Lyα"}


def bao(mean_path, cov_path):
    rows = []
    for line in open(mean_path, encoding="utf-8"):
        if line.strip() and not line.startswith("#"):
            zs, vs, q = line.split()
            rows.append((float(zs), float(vs), q))
    cov = np.loadtxt(cov_path)
    assert cov.shape == (len(rows), len(rows))
    sig = np.sqrt(np.diag(cov))
    pts = {}
    for i, (z, v, q) in enumerate(rows):
        p = pts.setdefault(z, {"z": z, "tracer": TRACER.get(round(z, 3), "")})
        key = {"DM_over_rs": "DM", "DH_over_rs": "DH", "DV_over_rs": "DV"}[q]
        p[key] = round(v, 4)
        p[key + "_err"] = round(float(sig[i]), 4)
        p.setdefault("_idx", {})[key] = i
    out = []
    for p in pts.values():
        idx = p.pop("_idx")
        if "DM" in idx and "DH" in idx:
            i, j = idx["DM"], idx["DH"]
            p["rho_DM_DH"] = round(float(cov[i, j] / (sig[i] * sig[j])), 3)
        if "DH" in p:
            # expansion speed relative to today, a·H(z)/H0, using the Planck sound horizon and H0
            hz = C / (p["DH"] * RDRAG)
            p["adot"] = round(hz / ((1 + p["z"]) * H0), 4)
            p["adot_err"] = round(p["adot"] * p["DH_err"] / p["DH"], 4)
        out.append(p)
    out.sort(key=lambda p: p["z"])
    return {
        "source": "DESI DR2 BAO (arXiv:2503.14738, Table IV), Cobaya bao_data desi_bao_dr2 ALL_GCcomb",
        "conversion": f"adot = c / (DH/rd * rd) / ((1+z) H0) with rd = {RDRAG} Mpc and H0 = {H0} (Planck 2018, Table 2)",
        "rd": RDRAG,
        "H0": H0,
        "points": out,
    }


if __name__ == "__main__":
    pan_path, mean_path, cov_path, outdir = sys.argv[1:5]
    sn, report = pantheon(pan_path)
    b = bao(mean_path, cov_path)
    with open(f"{outdir}/pantheon_hubble.json", "w", encoding="utf-8") as f:
        json.dump(sn, f, ensure_ascii=False, separators=(",", ":"))
    with open(f"{outdir}/desi_dr2_bao.json", "w", encoding="utf-8") as f:
        json.dump(b, f, ensure_ascii=False, indent=1)
    print(json.dumps(report, indent=1, ensure_ascii=False))
    for p in b["points"]:
        print(p)
