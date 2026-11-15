# Tokenomics figures

Use `<LlmFigure figure="pricing" />` in the article. The component loads its own CSS and shared controller; no separate controls component is needed. Supported article figures are `cadence`, `input`, `output`, `context`, `pricing`, and `overview`. Input has separate published-cap and shared-window panels; pricing has input-price, output-price, and output/input-ratio panels. The overview pools the five study labs and indexes each trend to its first fitted value.

## Responsibilities

- `chart-core.js`: pure scope selection, completed company/role intervals, matched launch offers, capacity evidence, robust fits, and saved-state migration. These exports work in Node without a browser. Older research comparison helpers remain exported for historical audits.
- `cadence-renderer.js`: shared SVG geometry, axes, raw marks, fit paths, and accessible inspection targets. It receives calculated observations and fits; it does not decide membership or calculate intervals.
- `charts.js`: figure controls, DOM rendering, keyboard/pointer interaction, current-quote lists, and per-figure session state.
- `tooltip-content.js` and `chart-format.js`: shared evidence text, compact three-line fitted-value tooltips, escaped HTML, labels, and units.
- `chart-data.js`: one live payload request shared by figures and model-group disclosures, with retry after failure and frozen-export support.
- `model-groups.js` and `ModelGroups.astro`: category descriptions and exact classified membership from the same `articleCoverage` payload. Server-rendered membership provides a fallback without JavaScript.

## Defaults and persistence

Cadence, capacity, and pricing start with OpenAI, Anthropic, Google, and Flagship. Pricing starts By company; cadence and capacity start Overall. Pricing's `pricingDefaultsVersion: 1` migrates its old grouping once without resetting company or role selections. After that, an intentional Overall choice persists. Reset restores the current defaults. `articleDefaultsVersion` governs the earlier shared role migration; do not increment it to change one figure. The overview starts with all four roles and persists its role selection.

Session state uses `tokenomics-local-cadence-v3`. All article figures display timelines, with source details available through point tooltips and the data and methods links. The article has no geography or weight-access controls. Research-only size and workload calculations remain available outside the article.

## Updating evidence

See the [research README](../../../research/llm-inference-2023-2026/README.md) for the data sources, rebuild commands, and checks.
