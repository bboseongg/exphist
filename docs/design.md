# Design notes

## Palette

Dark deep-field surface. Every chart colour below was run through a categorical-palette validator
(OKLab ΔE under protan/deutan/tritan simulation, normal-vision floor, 3:1 contrast against the chart surface `#111830`).

| Role | Hex | Where |
|---|---|---|
| page | `#0a0f1f` | background |
| chart surface | `#111830` | figure panels |
| ink / ink-2 / muted | `#e8ecf7` / `#a7b1cf` / `#6f7a9b` | text, labels, axes |
| model slot 1–3 | `#3987e5` `#c98500` `#d55181` | published fits (max three at once; colour sticks to the model while selected) |
| your model | ink, dashed | custom sliders |
| radiation / matter / dark energy | `#d95926` `#199e70` `#9085e9` | energy-budget bar |
| year ramp (older → newer) | `#cde2fb` `#86b6ef` `#3987e5` | w₀–wₐ plane, with marker shape per paper as the second encoding |
| early / late universe | `#3987e5` `#d95926` | H₀ ladder |

Three model slots, not more: a fourth colour that still passes all-pairs CVD checks against the first three did not exist
in this hue family, and the figure stays readable with three lines plus one dashed line.

## Type

Fraunces (variable, optical size) for headings; Source Sans 3 (variable) for everything else, including every number.
Tabular figures only in tables and axis ticks.

## Motion

One orchestrated moment: the a(t) figure plays once on arrival (skipped under `prefers-reduced-motion`). Every other
transition answers a user action.

## Interaction rules

- Every figure has a hover layer (crosshair + tooltip or nearest-point tooltip), a legend when more than one series is shown,
  and a table view with the same numbers.
- One model selection drives the a(t) and ȧ(z) figures; colour follows the model, not its position in the list.
- Every value links back to its arXiv record.
