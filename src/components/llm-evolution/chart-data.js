// Figures and model disclosures share one validated payload per page load.
let pending;
export function loadChartData() {
  if (window.LLM_FROZEN_DATA) return Promise.resolve(window.LLM_FROZEN_DATA);
  pending ??= fetch('/__llm-research-data.json')
    .then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    })
    .catch((error) => {
      pending = undefined; // A transient error must not poison later attempts.
      throw error;
    });
  return pending;
}
