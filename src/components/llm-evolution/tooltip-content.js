import {
  names,
  units,
  esc,
  cap,
  fmt,
  companyLabel as label,
} from './chart-format.js';

// The same evidence text serves pointer, touch, and keyboard inspection.
export function tooltipContent(p, methodsHref) {
  const recordId = p.modelId || p.memberIds?.[0];
  const link = recordId
    ? `<a href="${methodsHref('#model-' + encodeURIComponent(recordId))}">Details →</a>`
    : '';
  if (p.ongoing)
    return `<strong>${esc(label(p.company))} · ${esc(cap(p.productClass))}</strong><span>Ongoing wait: <b>at least ${fmt(p.value, 'release_gap')} days</b> as of ${esc(p.date)}</span><span>Last release: ${esc(p.previousDate)} · ${esc(p.model.replace(/^Since /, ''))}</span><span>Not a completed gap or a forecast.</span>${p.pricingBand ? `<span>${esc(p.pricingBand)}</span>` : ''}${p.servedRelation ? `<span>${esc(p.provider)} · hosted ${esc(p.quantization || '')} derivative</span>` : ''}${link}`;
  if (p.fit || p.typical) {
    const metric = p.metric || (p.typical ? 'release_gap' : null),
      value = p.typical ? p.statAt(p.date).value : p.value;
    const trend =
      p.observedEnd && p.date > p.observedEnd
        ? 'Extrapolated trend'
        : metric === 'input' && p.kind === 'shared'
          ? 'Shared-window trend'
          : 'Trend';
    const unit = (units[metric] || '').replace(/^USD /, '');
    const date = new Date(p.date + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    if (p.baseline)
      return `<strong>${esc(p.label)}</strong><span><b>${fmt(value, 'price_ratio')}</b> its starting value</span><span>${esc(date)} · fitted ${fmt(value * p.baseline, metric)}${unit ? ' ' + esc(unit) : ''}</span>`;
    const group = p.overall ? 'Overall' : label(p.company);
    const provider = metric === 'output' && p.provider ? ` · ${p.provider}` : '';
    return `<strong>${esc(group + provider)} · ${esc(names[metric])} · ${trend}</strong><span><b>${fmt(value, metric)}${unit ? ' ' + esc(unit) : ''}</b></span><span>${esc(date)}</span>`;
  }
  if (p.metric === 'price_ratio')
    return `<strong>${esc(p.model)}</strong><span>API launch: ${esc(p.date)} · ${esc(p.provider)}</span><span>${esc(p.serviceTier)} · ${esc(p.pricingBand || p.priceTier || 'base / short prompt')}</span><span>Output / input price: <b>${fmt(p.value, p.metric)}</b></span><span>Output ${fmt(p.outputPrice, 'output_price')} ÷ input ${fmt(p.inputPrice, 'input_price')} (USD per million tokens)</span><span><a href="${esc(p.outputSource)}" target="_blank" rel="noreferrer">Output source ↗</a> · <a href="${esc(p.inputSource)}" target="_blank" rel="noreferrer">Input source ↗</a> · ${link}</span>`;
  if (p.aggregate)
    return `<strong>${esc(label(p.company))} · ${esc(p.quarterLabel)}</strong><span>Median ${esc(names[p.metric].toLowerCase())}: <b>${fmt(p.value, p.metric)} ${esc(units[p.metric])}</b></span>`;
  const value =
    p.metric === 'releases'
      ? p.firstEvent
        ? 'First release; no prior interval'
        : p.interval
          ? `${fmt(p.interval, 'release_gap')} days since prior company/class release`
          : ''
      : p.metric === 'release_gap'
        ? `${fmt(p.value, p.metric)} days since prior company/class release`
        : `${p.sharedBudget ? 'Shared token-window ceiling' : names[p.metric]}: ${p.status === 'estimated' ? '≈ ' : ''}${fmt(p.value, p.metric)} ${units[p.metric]}`;
  return `<strong>${esc(p.model)}</strong><span>${p.mode === 'generation' ? 'Model release: ' : p.mode === 'launch' ? 'API launch: ' : ''}${esc(p.date)}${['releases', 'release_gap'].includes(p.metric) ? ' · ' + esc(cap(p.productClass)) : ''}</span>${p.mode === 'generation' ? `<span>Specification: ${esc(p.evidenceDate || 'undated')} · observed ${esc(p.evidenceObserved || 'unknown')}</span><span>${esc(p.sharedBudget ? 'Shared ceiling; output uses this budget · ' + p.provider : p.provider)}${p.servedRelation ? ' · ' + esc(p.quantization || 'hosted') + ' derivative' : ''}</span>${p.sharedRuleObserved ? `<span>Budget rule observed: ${esc(p.sharedRuleObserved)}</span>` : ''}` : ''}${p.mode === 'launch' && p.releaseDate !== p.date ? `<span>Model release: ${esc(p.releaseDate)}</span>` : ''}${value ? `<span>${esc(value)}${p.metric === 'output' && p.reasoningSharesOutput === 'yes' ? ' (reasoning + answer)' : ''}</span>` : ''}${p.reasoningMode ? `<span>${esc(p.pricingCondition)}</span>` : ''}${p.pricingBand ? `<span>${esc(p.pricingBand)} · ${esc(p.provider)}</span>` : ''}${p.metric === 'release_gap' && !p.ongoing ? `<span>Previous: ${esc(p.previousDate)} · ${esc(p.previousModel)}</span>` : ''}${p.status === 'estimated' ? `<span>Reported estimate · ${esc(p.estimateAttribution || 'third-party analysis')}</span>` : ''}<span>${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noreferrer">Source ↗</a> · ` : ''}${link}</span>`;
}
