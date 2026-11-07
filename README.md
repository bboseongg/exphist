# Expansion history

An interactive, data-driven page on the expansion history of the universe, built to stay current: **every curve is
computed in the browser from the parameters in `data/papers/*.json`**. Adding the next DESI, Euclid or Rubin paper means
adding one JSON file — the figures, the H₀ ladder and the paper table update themselves.

The home page is a scroll story in English or Korean (toggle in the header; the browser language picks the default).
A 3D patch of cosmic web (three.js) stretches with the scale factor as you scroll from the Big Bang to 40 Gyr, with a
comoving ruler (1 billion light-years today) stretching along and a CMB-sky sphere at recombination. A glass panel on
the right morphs through the energy budget, the CMB sky and its spectrum, a(t), the expansion speed with DESI DR2 BAO
points, the Pantheon+ supernova Hubble diagram, two futures (ΛCDM vs DESI w₀wₐ), the w₀–wₐ plane with the 2025
supernova recalibration, and the H₀ tension. `/explore/` keeps the full interactive figures:

1. **Scale factor a(t)** — animated playback from the Big Bang into the future, linear or log time, up to three published
   fits plus your own parameters; readouts for z, temperature, H, energy budget and deceleration; a galaxy patch that
   dilutes as space expands.
2. **Expansion speed ȧ(z) / Hubble rate H(z)** — where the deceleration turned into acceleration.
3. **w₀–wₐ plane** — every published dynamical-dark-energy fit with 68% intervals and a year slider.
4. **H₀ ladder** — early-universe inferences vs late-universe measurements.
5. **Paper ledger** — filterable table of every result, each linked to arXiv.

Stack: [Astro](https://astro.build) (static site, schema-validated content collection), [Svelte 5](https://svelte.dev)
islands, [D3](https://d3js.org) scales/shapes, self-hosted fonts. No server, no tracking, deploys to GitHub Pages.

## Quick start

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # cosmology.ts against astropy reference values
npm run build      # validates every data/papers/*.json, writes dist/
```

Python 3 is only needed for the helper scripts (`scripts/`); `astropy` only to regenerate the test fixtures.

## Adding a paper

1. `python3 scripts/new_paper.py <arxiv-id>` drafts `data/papers/<slug>.json` from the arXiv metadata, or copy an
   existing file.
2. Fill in `probes`, `shortName`, `summary` and the `results` — one result per data combination × model:

```json
{
  "id": "w0wa-desi-cmb-desy5",
  "label": "DESI DR2 + CMB + DES-SN5YR",
  "model": "w0waCDM",
  "datasets": ["DESI DR2 BAO", "Planck PR4 (CamSpec)", "Planck + ACT DR6 lensing", "DES-SN5YR"],
  "params": {
    "w0": { "value": -0.752, "sigma": 0.057 },
    "wa": { "value": -0.86, "plus": 0.23, "minus": 0.20 },
    "Om": { "value": 0.3191, "sigma": 0.0056 },
    "H0": { "value": 66.74, "sigma": 0.56 }
  },
  "preferenceOverLCDM": 4.2,
  "featured": true,
  "source": "Table V"
}
```

   - A result with `H0` and `Om` (plus optional `w0`, `wa`, `w`, `Ok`) is drawable as an expansion history.
   - `w0` + `wa` puts it in the dark-energy plane; `H0` alone puts it in the H₀ ladder (ΛCDM results only).
   - `featured: true` (up to three) selects what the first figure shows by default.
   - Write in `source` where each number is in the paper (`"abstract"`, `"Table V"`, `"eq. (28)"`).
   - Keep `"status": "unverified"` until a person has compared every number with the paper itself; then set
     `"status": "verified"` and `"checkedOn": "YYYY-MM-DD"`.
3. `npm run build` — the schema in `src/content.config.ts` rejects malformed entries with a precise message.
4. Open a pull request; merging to `main` redeploys.

Allowed `probes`: `CMB, CMBlens, BAO, Lya, SN, WL, GC, Clusters, CC, Ladder, TD, GW, BBN`.
Allowed `model`: `LCDM, wCDM, w0waCDM, oLCDM, ow0waCDM`.

### Keeping up with arXiv

`.github/workflows/arxiv-watch.yml` runs `scripts/arxiv_watch.py` every Monday: it searches astro-ph.CO for the last
week's expansion-history / dark-energy / H₀ papers, drops the ones already in `data/papers/`, and opens an issue with a
ranked checklist. Nothing is added automatically — numbers are typed in by a person and marked verified by a person.

## Deploying to GitHub Pages

1. Create a repository and push this folder to its `main` branch.
2. In the repository **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds the site and publishes it at
   `https://<user>.github.io/<repo>/`. (For a user site named `<user>.github.io` the base path is handled
   automatically.)

The same build runs with `npm run build` locally; `dist/` is a plain static site you can host anywhere.

## How the physics is done

`src/lib/cosmology.ts` integrates the Friedmann equation for radiation (T_CMB = 2.7255 K, N_eff = 3.044), matter,
curvature and CPL dark energy w(a) = w₀ + wₐ(1 − a): E(z), H(z), cosmic/lookback time, a(t) by table inversion,
comoving / luminosity / angular-diameter distances, density fractions, deceleration parameter and the milestones
(equality, acceleration onset, dark-energy domination). `npm test` checks it against astropy
(`scripts/make_reference.py` regenerates the fixtures) for ΛCDM, wCDM, w₀wₐCDM and open models at z = 0–1000.

## Layout

```
data/papers/*.json          ← the only thing that changes when a paper comes out
src/content.config.ts       ← schema (Zod) that validates those files at build time
src/lib/cosmology.ts        ← physics; cosmology.test.ts checks it against astropy
src/lib/models.ts           ← paper → plain data helpers used by the figures
src/lib/selection.svelte.ts ← shared "which models are shown" state
src/components/*.svelte     ← the five figures + model picker
src/pages/index.astro       ← the page; about.astro documents the schema
src/styles/global.css       ← design tokens
scripts/                    ← arXiv watch, new-paper drafting, astropy fixtures
.github/workflows/          ← Pages deploy, weekly arXiv watch
docs/design.md              ← palette decisions and validation
```

## Data

The 17 papers shipped here (Planck 2018 … DESI DR2 Lyα full shape, July 2026) were checked number by number on
2026-11-08 against the papers' abstracts, equations and tables; every result's `source` field says where its numbers
are. The DESI DR2 Lyα full-shape paper quotes its w₀wₐ preference (2.7σ, 3.2σ) without central values, so those two
results carry the significance only.

The story also draws measurements directly. They are generated by scripts and committed:

| File | What | Made by |
| --- | --- | --- |
| `src/data/pantheon_hubble.json` | 1466 Pantheon+ supernovae (z > 0.01) and 18 redshift bins, as distance modulus relative to an empty universe | `scripts/make_story_data.py` from the Pantheon+SH0ES distance table |
| `src/data/desi_dr2_bao.json` | DESI DR2 BAO D_M/r_d, D_H/r_d, D_V/r_d with errors, and a·H(z)/H₀ using the Planck 2018 r_d and H₀ | `scripts/make_story_data.py` from the DESI DR2 likelihood files (Cobaya `bao_data`) |
| `src/data/cmb_tt.json`, `src/assets/cmb_*.webp` | Planck 2018 best-fit TT spectrum and one simulated sky drawn from it | `scripts/make_cmb.py` (CAMB + healpy) |

The CMB map is a simulation with Planck 2018 statistics, not the Planck map itself.

## License

Code MIT. Figures and text CC BY 4.0. The numbers belong to the papers they cite.
