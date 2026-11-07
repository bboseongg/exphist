<script lang="ts">
  import type { ResultData } from '$lib/models';
  import { fmtMeasurement, arxivUrl, MODEL_LABEL, PROBE_LABEL } from '$lib/models';
  import { fmtSigma } from '$lib/format';

  let { results }: { results: ResultData[] } = $props();

  const probes = [...new Set(results.flatMap((r) => r.probes))];
  const models = [...new Set(results.map((r) => r.model))];
  let probeFilter = $state<string[]>([]);
  let modelFilter = $state('');
  let query = $state('');

  const filtered = $derived(
    results.filter((r) => {
      if (probeFilter.length && !probeFilter.every((p) => r.probes.includes(p))) return false;
      if (modelFilter && r.model !== modelFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${r.paperShort} ${r.paperTitle} ${r.authors} ${r.label} ${r.datasets.join(' ')} ${r.arxiv} ${r.journal ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }),
  );
  const paperCount = $derived(new Set(filtered.map((r) => r.paperId)).size);

  function toggleProbe(p: string) {
    probeFilter = probeFilter.includes(p) ? probeFilter.filter((x) => x !== p) : [...probeFilter, p];
  }

  function keyNumbers(r: ResultData) {
    const p = r.params;
    const out: string[] = [];
    if (p.H0) out.push(`H₀ ${fmtMeasurement(p.H0)}`);
    if (p.Om) out.push(`Ωₘ ${fmtMeasurement(p.Om)}`);
    if (p.w) out.push(`w ${fmtMeasurement(p.w)}`);
    if (p.w0) out.push(`w₀ ${fmtMeasurement(p.w0)}`);
    if (p.wa) out.push(`wₐ ${fmtMeasurement(p.wa)}`);
    if (p.S8) out.push(`S₈ ${fmtMeasurement(p.S8)}`);
    if (p.sigma8) out.push(`σ₈ ${fmtMeasurement(p.sigma8)}`);
    return out;
  }
</script>

<div class="ledger">
  <div class="filters">
    <ul class="chips" aria-label="Filter by probe">
      {#each probes as p}
        <li><button type="button" class:on={probeFilter.includes(p)} aria-pressed={probeFilter.includes(p)} onclick={() => toggleProbe(p)}>{PROBE_LABEL[p] ?? p}</button></li>
      {/each}
    </ul>
    <div class="right">
      <label>
        <span class="visually-hidden">Model</span>
        <select bind:value={modelFilter}>
          <option value="">All models</option>
          {#each models as mdl}<option value={mdl}>{MODEL_LABEL[mdl] ?? mdl}</option>{/each}
        </select>
      </label>
      <label>
        <span class="visually-hidden">Search</span>
        <input type="search" placeholder="Search papers, datasets, arXiv id" bind:value={query} />
      </label>
    </div>
  </div>
  <p class="count">{filtered.length} results from {paperCount} papers{probeFilter.length || modelFilter || query ? ' match' : ''}.</p>

  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Date</th><th>Paper</th><th>Fit</th><th>Model</th><th>Key numbers</th><th>vs ΛCDM</th><th>Status</th></tr>
      </thead>
      <tbody>
        {#each filtered as r (r.key)}
          <tr>
            <td class="date">{r.date ?? r.year}</td>
            <td class="paper">
              <a href={arxivUrl(r.arxiv)} target="_blank" rel="noopener">{r.paperShort}</a>
              <div class="sub">{r.authors} · arXiv:{r.arxiv}</div>
              {#if r.journal}<div class="sub">{r.journal}</div>{/if}
              <div class="sub probes">{r.probes.map((p) => PROBE_LABEL[p] ?? p).join(', ')}</div>
            </td>
            <td class="fit">
              {r.label}
              {#if r.datasets.length}<div class="sub">{r.datasets.join(' + ')}</div>{/if}
              {#if r.notes}<div class="sub note">{r.notes}</div>{/if}
            </td>
            <td>{MODEL_LABEL[r.model] ?? r.model}</td>
            <td class="nums">
              {#each keyNumbers(r) as k}<div>{k}</div>{/each}
              {#if !keyNumbers(r).length}<span class="sub">—</span>{/if}
              {#if r.source}<div class="sub src" title="Where these numbers are in the paper">{r.source}</div>{/if}
            </td>
            <td class="sig">{fmtSigma(r.preferenceOverLCDM)}</td>
            <td>
              <span class="status" class:ok={r.status === 'verified'} title={r.checkedOn ? `Checked against the paper on ${r.checkedOn}` : undefined}>{r.status}</span>
              {#if r.checkedOn}<div class="sub checked">{r.checkedOn}</div>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .ledger { display: grid; gap: 0.75rem; }
  .filters { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; justify-content: space-between; align-items: center; }
  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chips button { font: inherit; font-size: 0.85rem; background: transparent; color: var(--ink-2); border: 1px solid var(--line); border-radius: 999px; padding: 0.3rem 0.75rem; cursor: pointer; }
  .chips button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .right { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  select, input[type='search'] { font: inherit; font-size: 0.9rem; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 0.6rem; padding: 0.5rem 0.75rem; }
  input[type='search'] { min-width: 16rem; }
  .count { margin: 0; color: var(--muted); font-size: 0.85rem; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 0.9rem; background: var(--surface); }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 820px; }
  th, td { text-align: left; padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--ink-2); font-weight: 500; font-size: 0.8rem; position: sticky; top: 0; background: var(--surface); }
  tbody tr:last-child td { border-bottom: 0; }
  .date { white-space: nowrap; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .paper a { color: var(--ink); font-weight: 600; }
  .sub { color: var(--muted); font-size: 0.78rem; margin-top: 0.15rem; }
  .sub.note { color: var(--ink-2); font-style: italic; }
  .nums { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sub.src { white-space: normal; max-width: 15rem; }
  .sub.checked { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub.src::before { content: '↳ '; }
  .sig { font-variant-numeric: tabular-nums; }
  .status { font-size: 0.75rem; border: 1px solid var(--line-strong); color: var(--ink-2); border-radius: 999px; padding: 0.1rem 0.5rem; white-space: nowrap; }
  .status.ok { border-color: #199e70; color: #7fd3b0; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
