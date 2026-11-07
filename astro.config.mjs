// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// GitHub Pages serves project sites at https://<user>.github.io/<repo>/.
// The deploy workflow sets SITE and BASE_PATH from the repository name;
// locally both default to a root site. A user/organisation site
// (<user>.github.io) is served from the root, so its base is '/'.
const site = process.env.SITE ?? 'http://localhost:4321';
let base = process.env.BASE_PATH ?? '/';
if (/\.github\.io\/?$/i.test(base)) base = '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  integrations: [svelte()],
  build: { assets: 'assets' },
});
