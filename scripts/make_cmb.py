"""Simulated CMB sky (one Gaussian realization of the Planck 2018 best-fit TT spectrum) + D_ell curve.

    python3 -I scripts/make_cmb.py OUTDIR      (needs camb, healpy, matplotlib, scipy, pillow)

Writes cmb_tt.json (D_ell for the story panel), cmb_equirect.webp (texture for the 3D sphere) and
cmb_mollweide.webp (the 2D sky map). The map is a simulation with Planck 2018 statistics, not the Planck map.
"""
import json, sys, os, numpy as np, camb, healpy as hp
from matplotlib import cm, colors
from PIL import Image

# Planck 2018 TT,TE,EE+lowE+lensing (Table 2) base parameters
pars = camb.set_params(H0=67.36, ombh2=0.02237, omch2=0.1200, tau=0.0544,
                       As=np.exp(3.044) * 1e-10, ns=0.9649, mnu=0.06, lmax=2600)
res = camb.get_results(pars)
cl = res.get_cmb_power_spectra(pars, CMB_unit='muK', raw_cl=False)['total'][:, 0]  # D_ell (muK^2)
ell = np.arange(cl.size)
# D_ell curve for the panel: ell 2..2500, log-spaced-ish sampling
sel = np.unique(np.concatenate([np.arange(2, 50), np.arange(50, 2501, 10)]))
out = {"source": "CAMB %s, Planck 2018 TT,TE,EE+lowE+lensing best-fit means" % camb.__version__,
       "ell": sel.tolist(), "Dl": [round(float(cl[l]), 2) for l in sel]}
# peak positions
from scipy.signal import find_peaks
pk, _ = find_peaks(cl[50:2000])
out["peaks"] = [int(p + 50) for p in pk[:4]]
OUT = sys.argv[1]
json.dump(out, open(os.path.join(OUT, 'cmb_tt.json'), 'w'))
print('peaks', out['peaks'], 'first peak Dl', cl[out['peaks'][0]])

# Gaussian realization
raw = res.get_cmb_power_spectra(pars, CMB_unit='muK', raw_cl=True)['total'][:, 0]
np.random.seed(1965)  # Penzias & Wilson
nside = 512
m = hp.synfast(raw[:1500], nside, lmax=1499, new=True)
m = hp.smoothing(m, fwhm=np.radians(0.25))
lim = 3.0 * np.std(m)
# Planck-like diverging colormap (blue - white - orange - red)
cmap = colors.LinearSegmentedColormap.from_list('cmb', ['#0b1d5c', '#1f5fb0', '#77b7e8', '#f2f2e4', '#f6c36a', '#e0662b', '#8f1d10'])
def colorize(img):
    x = np.clip((img + lim) / (2 * lim), 0, 1)
    rgba = (cmap(x) * 255).astype(np.uint8)
    return rgba
# equirectangular texture for the 3D sphere
W, H = 2048, 1024
theta = (np.arange(H) + 0.5) / H * np.pi
phi = (np.arange(W) + 0.5) / W * 2 * np.pi
P, T = np.meshgrid(phi, theta)
eq = hp.get_interp_val(m, T.ravel(), P.ravel()).reshape(H, W)
Image.fromarray(colorize(eq)[:, :, :3]).resize((1024, 512), Image.LANCZOS).save(os.path.join(OUT, 'cmb_equirect.webp'), quality=84, method=6)
# Mollweide image for the panel
moll = hp.mollview(m, return_projected_map=True, xsize=1200)
import matplotlib.pyplot as plt; plt.close('all')
mask = ~np.isfinite(np.asarray(moll.filled(np.nan) if hasattr(moll, 'filled') else moll))
arr = np.nan_to_num(np.asarray(moll.filled(0) if hasattr(moll, 'filled') else moll))
rgba = colorize(arr); rgba[mask] = [0, 0, 0, 0]
rgba = rgba[::-1]  # mollview origin
Image.fromarray(rgba, 'RGBA').resize((800, 400), Image.LANCZOS).save(os.path.join(OUT, 'cmb_mollweide.webp'), quality=84, method=6)
print('done', lim)
