/**
 * Paper data schema. One JSON file per paper in data/papers/<id>.json.
 * The build fails with a precise message if a file does not match this schema,
 * so a typo in a new entry never reaches the live site.
 *
 * A paper carries one or more *results* (a data combination fitted with a
 * model). Figures draw whatever a result provides: H0 + Om (+ w0, wa, Ok) is
 * enough for an expansion-history curve; w0 + wa alone shows up in the
 * dark-energy plane; H0 alone shows up in the H0 ladder.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const PROBES = [
  'CMB', // primary CMB anisotropies
  'CMBlens', // CMB lensing
  'BAO', // baryon acoustic oscillations (galaxies / quasars)
  'Lya', // Lyman-α forest
  'SN', // Type Ia supernovae
  'WL', // weak lensing / 3×2pt
  'GC', // galaxy clustering full shape
  'Clusters',
  'CC', // cosmic chronometers
  'Ladder', // local distance ladder
  'TD', // strong-lensing time delays
  'GW', // gravitational-wave sirens
  'BBN', // nucleosynthesis prior
] as const;

export const MODELS = ['LCDM', 'wCDM', 'w0waCDM', 'oLCDM', 'ow0waCDM'] as const;

/** A measured quantity: value with symmetric (sigma) or asymmetric (plus/minus) 68% errors */
const measurement = z.object({
  value: z.number(),
  sigma: z.number().nonnegative().optional(),
  plus: z.number().nonnegative().optional(),
  minus: z.number().nonnegative().optional(),
  /** e.g. "derived from Ωb h², Ωc h², H0", "stat ⊕ sys" */
  note: z.string().optional(),
});

const params = z.object({
  H0: measurement.optional(),
  Om: measurement.optional(),
  Ok: measurement.optional(),
  w: measurement.optional(), // constant w (wCDM)
  w0: measurement.optional(),
  wa: measurement.optional(),
  S8: measurement.optional(),
  sigma8: measurement.optional(),
});

const result = z.object({
  /** short slug, unique within the paper, e.g. "lcdm", "w0wa-desi-cmb-desy5" */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** human label shown in legends, e.g. "DESI DR2 BAO + CMB + DESY5" */
  label: z.string(),
  model: z.enum(MODELS),
  /** datasets entering this fit, e.g. ["DESI DR2 BAO", "Planck PR4", "ACT DR6 lensing", "DESY5 SNe"] */
  datasets: z.array(z.string()).default([]),
  params,
  /** preference for this model over flat ΛCDM, in σ, as quoted by the paper */
  preferenceOverLCDM: z.number().optional(),
  /** show this result by default in the expansion-history figure */
  featured: z.boolean().default(false),
  /** where in the paper the numbers are, e.g. "abstract", "Table V", "eq. (28)" */
  source: z.string().optional(),
  notes: z.string().optional(),
});

const paper = z.object({
  title: z.string(),
  /** short name for legends and tables, e.g. "DESI DR2 BAO" */
  shortName: z.string(),
  /** first author or collaboration, e.g. "DESI Collaboration", "Riess et al." */
  authors: z.string(),
  year: z.number().int().min(1990).max(2100),
  /** arXiv submission date, YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  arxiv: z.string().regex(/^\d{4}\.\d{4,5}$/),
  doi: z.string().optional(),
  journal: z.string().optional(),
  probes: z.array(z.enum(PROBES)).min(1),
  /** one or two sentences: what the paper did and what it found */
  summary: z.string(),
  /**
   * "verified" = a maintainer checked every number below against the paper (see checkedOn, and each result's source).
   * "unverified" = drafted (e.g. by scripts/new_paper.py) but not yet checked number by number.
   */
  status: z.enum(['verified', 'unverified']).default('unverified'),
  /** date a maintainer last checked the numbers, YYYY-MM-DD */
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  results: z.array(result).min(1),
});

/** a "verified" paper must say when it was checked and where every result's numbers are */
const checkedPaper = paper.superRefine((p, ctx) => {
  if (p.status !== 'verified') return;
  if (!p.checkedOn) ctx.addIssue({ code: 'custom', path: ['checkedOn'], message: 'verified papers need checkedOn (YYYY-MM-DD)' });
  p.results.forEach((r, i) => {
    if (!r.source) ctx.addIssue({ code: 'custom', path: ['results', i, 'source'], message: `result "${r.id}" needs a source (e.g. "Table V")` });
  });
});

const papers = defineCollection({
  loader: glob({ pattern: '*.json', base: './data/papers' }),
  schema: checkedPaper,
});

export const collections = { papers };
export type Measurement = z.infer<typeof measurement>;
export type ResultEntry = z.infer<typeof result>;
export type PaperEntry = z.infer<typeof paper>;
