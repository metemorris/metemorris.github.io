# Tokenomics data

The article covers major releases from OpenAI, Anthropic, Google, Meta, and SpaceX/xAI through November 11, 2026. The data and methods page offers the full model table, evidence and launch price CSVs, and full records as JSON.

The curated inventory is `data/research_inputs.json`. Metric audit and launch review JSON files add evidence for chart eligibility. Release dates, API price dates, and documentation dates describe different events. Keep them separate when updating observations.

The first dev run or published build generates missing exports from the checked-in source data. The scripts use Python 3.9+ and its standard library. After editing the source data, run these commands from the site root to refresh the exports and check the charts.

```sh
python3 research/llm-inference-2023-2026/scripts/rebuild.py
python3 research/llm-inference-2023-2026/scripts/build_article_audit.py
python3 research/llm-inference-2023-2026/scripts/build_launch_price_audit.py
npm run build
node research/llm-inference-2023-2026/scripts/test_editorial_math.mjs
node research/llm-inference-2023-2026/scripts/test_shared_cadence.mjs
node research/llm-inference-2023-2026/scripts/test_model_groups.mjs
```

Commit updates to the curated inputs and evidence reviews. The site generates CSV downloads, the chart payload, and the full-records JSON from those sources.
