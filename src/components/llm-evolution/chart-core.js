import { cap } from './chart-format.js';

// Pure data selection, cohort calculations, and descriptive fits. No DOM or storage.
const classes = ['economy', 'balanced', 'flagship', 'premium'];
const roleOptions = [...classes, 'flagship-premium', 'all'];
const roleLabel = (role) =>
  role === 'flagship-premium'
    ? 'Flagship + Premium'
    : role === 'all'
      ? 'All four roles'
      : cap(role);
const matchesRole = (productClass, role) =>
  !role || role === 'all'
    ? classes.includes(productClass)
    : role === 'flagship-premium'
      ? ['flagship', 'premium'].includes(productClass)
      : productClass === role;
const chosen = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'SpaceX / xAI'];
const defaults = (key) =>
  key === 'size' ? ['Meta', 'DeepSeek'] : ['OpenAI', 'Anthropic', 'Google'];
const defaultRole = () => 'flagship';
const START = '2022-11-30',
  DAY = 86400000;
const day = (s) => Date.parse(s + 'T00:00:00Z');
const median = (values) => {
  const v = [...values].sort((a, b) => a - b),
    n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};
const quarter = (s) =>
  Number(s.slice(0, 4)) * 4 + Math.floor((Number(s.slice(5, 7)) - 1) / 3);
const qdate = (q) =>
  `${Math.floor(q / 4)}-${String((q % 4) * 3 + 1).padStart(2, '0')}-01`;
const qlabel = (q) => `Q${(q % 4) + 1} ${Math.floor(q / 4)}`;
const unique = (pp, key) => [...new Map(pp.map((p) => [key(p), p])).values()];
const isClass = (p) => classes.includes(p.productClass);
const within = (p, cutoff) => p.date >= START && p.date <= cutoff;
const selected = (data, state, metric, mode) =>
  data.points.filter(
    (p) =>
      p.metric === metric &&
      p.articleEligible !== false &&
      state.companies.includes(p.company) &&
      (!mode || p.mode === mode) &&
      (metric !== 'cost' || p.scenario === state.scenario),
  );

// Compute complete cohort histories BEFORE applying the article time window.
function cadenceData(data, state) {
  const grouped = new Map(),
    seenIdentities = new Set();
  data.points
    .filter(
      (p) =>
        p.metric === 'releases' &&
        isClass(p) &&
        state.companies.includes(p.company) &&
        p.date <= data.cutoff,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((p) => {
      const ids = p.memberIds || [p.modelId || p.id],
        keep = ids
          .map((id, i) => ({ id, i }))
          .filter(({ id }) => !seenIdentities.has(p.company + '|' + id));
      if (!keep.length) return;
      keep.forEach(({ id }) => seenIdentities.add(p.company + '|' + id));
      const key = [p.company, p.productClass, p.date].join('|');
      if (!grouped.has(key))
        grouped.set(key, {
          ...p,
          members: [],
          memberIds: [],
          memberSources: [],
          releaseEvidence: [],
          accesses: [],
        });
      const q = grouped.get(key);
      q.members.push(
        ...keep.map(({ i }) => (p.members || [p.model])[i] || p.model),
      );
      q.memberIds.push(...keep.map(({ id }) => id));
      q.memberSources.push(...(p.memberSources || [p.source]));
      q.releaseEvidence.push(...(p.releaseEvidence || []));
      q.accesses.push(p.weightAccess);
    });
  const cohorts = new Map(),
    events = [...grouped.values()].map((p) => ({
      ...p,
      model: [...new Set(p.members)].join(' + '),
      weightAccess: new Set(p.accesses).size === 1 ? p.accesses[0] : 'mixed',
    }));
  events.forEach((p) => {
    const k = [p.company, p.productClass].join(' / ');
    if (!cohorts.has(k)) cohorts.set(k, []);
    cohorts.get(k).push(p);
  });
  const gaps = [];
  for (const [cohort, pp] of cohorts) {
    pp.sort((a, b) => a.date.localeCompare(b.date));
    pp.forEach((p, i) => {
      p.firstEvent = i === 0;
      p.cohort = cohort;
      p.metric = 'releases';
      p.value = null;
    });
    for (let i = 1; i < pp.length; i++) {
      const p = pp[i],
        prev = pp[i - 1],
        value = (day(p.date) - day(prev.date)) / DAY;
      if (value <= 0) continue;
      gaps.push({
        ...p,
        id: 'gap_' + cohort + '_' + p.date,
        metric: 'release_gap',
        value,
        previousDate: prev.date,
        previousModel: prev.model,
        previousModelIds: prev.memberIds,
        previousSource: prev.source,
        previousAccesses: prev.accesses,
        cohort,
        status: 'derived',
        notes:
          'Calendar-day interval between consecutive recorded company/class events, including different families. Same-day siblings collapsed. Missing releases may lengthen this interval.',
      });
    }
  }
  const roleMatch = (p) => matchesRole(p.productClass, state.role);
  const accessMatch = (p) =>
    !state.access ||
    state.access === 'all' ||
    p.accesses.includes(state.access);
  const visibleEvents = events.filter(
    (p) =>
      p.date >= (data.windowStart || START) &&
      p.date <= data.cutoff &&
      roleMatch(p) &&
      accessMatch(p),
  );
  const visibleGaps = gaps.filter(
    (p) =>
      p.date >= (data.windowStart || START) &&
      p.date <= data.cutoff &&
      roleMatch(p) &&
      accessMatch(p) &&
      (!state.access ||
        state.access === 'all' ||
        p.previousAccesses.includes(state.access)),
  );
  const ongoing = [...cohorts.values()]
    .map((pp) => pp.at(-1))
    .filter((p) => p.date <= data.cutoff && roleMatch(p) && accessMatch(p))
    .map((p) => ({
      ...p,
      id: 'ongoing_' + p.cohort,
      metric: 'release_gap',
      ongoing: true,
      date: data.cutoff,
      previousDate: p.date,
      value: (day(data.cutoff) - day(p.date)) / DAY,
      model: 'Since ' + p.model,
    }));
  return {
    events: visibleEvents,
    gaps: visibleGaps,
    ongoing,
    allGaps: gaps,
    excludedAccessIntervals:
      gaps.filter(
        (p) =>
          p.date >= (data.windowStart || START) &&
          p.date <= data.cutoff &&
          roleMatch(p),
      ).length - visibleGaps.length,
  };
}
// Preserve metric, class, company, family, provider and definition boundaries.
// Cadence pools completed company/role intervals only after computing them.
const fitKind = (p) =>
  p.mode === 'launch' &&
  ['input_price', 'output_price', 'price_ratio'].includes(p.metric)
    ? [
        p.serviceTier || 'standard',
        'base / short prompt',
        p.reasoningMode || 'default',
      ].join(' / ')
    : ['input_price', 'output_price', 'cost'].includes(p.metric)
      ? [p.serviceTier || 'standard', p.priceTier || 'standard'].join(' / ')
      : p.kind;
function seriesKey(p) {
  return [
    p.company,
    p.productClass,
    p.metric,
    p.metric === 'release_gap' ? '' : p.family,
    p.metric === 'release_gap' ? '' : fitKind(p),
    p.provider || '',
  ].join('|');
}
function quarterly(pp, cutoff) {
  const bins = new Map();
  pp.forEach((p) => {
    const q = quarter(p.date),
      key = seriesKey(p) + '|' + q;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(p);
  });
  return [...bins]
    .map(([key, items]) => {
      const p = items[0],
        q = quarter(p.date),
        start = Math.max(day(qdate(q)), day(START)),
        end = Math.min(day(qdate(q + 1)), day(cutoff));
      return {
        ...p,
        id: 'median_' + key,
        aggregate: true,
        quarter: q,
        quarterLabel: qlabel(q),
        date: new Date((start + end) / 2).toISOString().slice(0, 10),
        value: median(items.map((x) => x.value)),
        n: items.length,
        contributions: items,
        model: 'Quarterly median · ' + qlabel(q),
        series: seriesKey(p),
      };
    })
    .sort((a, b) => a.quarter - b.quarter);
}
// Equal weight for every reporting company, regardless of its release count.
function cadenceSummaries(pp, cutoff, mode = 'overall', role = 'flagship') {
  const roleMedians = quarterly(pp, cutoff).map((p) => ({
    ...p,
    roleMedians: [{ productClass: p.productClass, value: p.value, n: p.n }],
    companyCount: 1,
    intervalCount: p.n,
  }));
  let company = roleMedians;
  if (role === 'all') {
    const bins = new Map();
    roleMedians.forEach((p) => {
      const key = p.company + '|' + p.quarter;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(p);
    });
    company = [...bins].map(([key, items]) => ({
      ...items[0],
      id: 'all_roles_' + key,
      series: items[0].company + '|all',
      productClass: 'all',
      family: 'within each original role / family',
      value: median(items.map((p) => p.value)),
      n: items.reduce((n, p) => n + p.n, 0),
      intervalCount: items.reduce((n, p) => n + p.n, 0),
      contributions: items.flatMap((p) => p.contributions),
      roleMedians: items.flatMap((p) => p.roleMedians),
    }));
  }
  company = company.map((p) => ({
    ...p,
    companyMedians: [
      { company: p.company, value: p.value, n: p.n, roles: p.roleMedians },
    ],
  }));
  if (mode === 'company') return company;
  const bins = new Map();
  company.forEach((p) => {
    const key = p.productClass + '|' + p.quarter;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(p);
  });
  return [...bins]
    .map(([key, items]) => ({
      ...items[0],
      id: 'overall_' + key,
      company: 'Selected companies',
      family: 'within-company comparable families',
      overall: true,
      series: 'overall|' + items[0].productClass,
      value: median(items.map((p) => p.value)),
      companyCount: items.length,
      n: items.reduce((n, p) => n + p.n, 0),
      intervalCount: items.reduce((n, p) => n + p.n, 0),
      contributions: items.flatMap((p) => p.contributions),
      companyMedians: items.flatMap((p) => p.companyMedians),
    }))
    .sort((a, b) => a.quarter - b.quarter);
}
function presetCompanies(data, preset) {
  if (preset === 'default') return defaults('cadence');
  if (preset === 'all') return [...data.companies];
  const map = new Map(
    (data.geography?.companies || []).map((c) => [c.company, c.region]),
  );
  return data.companies.filter((c) =>
    preset === 'Other'
      ? ['Other', 'Unknown'].includes(map.get(c) || 'Unknown')
      : map.get(c) === preset,
  );
}
function cadenceRange(events, cutoff) {
  const earliest = events.length ? events.map((p) => p.date).sort()[0] : cutoff;
  return {
    start: events.length ? earliest : qdate(quarter(cutoff)),
    end: cutoff,
    empty: !events.length,
  };
}
function observationRange(points, cutoff) {
  const dates = points.map((p) => p.date).sort();
  return dates.length
    ? { start: dates[0], end: dates.at(-1), empty: false }
    : cadenceRange([], cutoff);
}
function trendSegments(summaries) {
  const series = new Map(),
    segments = [];
  summaries.forEach((p) => {
    if (!series.has(p.series)) series.set(p.series, []);
    series.get(p.series).push(p);
  });
  for (const pp of series.values()) {
    if (pp.length < 2 || pp.reduce((n, p) => n + p.n, 0) < 3) continue;
    pp.sort((a, b) => a.quarter - b.quarter);
    for (let i = 1; i < pp.length; i++)
      if (pp[i].quarter === pp[i - 1].quarter + 1)
        segments.push([pp[i - 1], pp[i]]);
  }
  return segments;
}
// Fit only WITHIN comparable histories; staggered company/role entry must
// never create a slope from level differences between populations.
function weightedMedian(values) {
  const sorted = [...values].sort((a, b) => a.value - b.value),
    total = sorted.reduce((n, p) => n + p.weight, 0);
  let mass = 0;
  for (let i = 0; i < sorted.length; i++) {
    mass += sorted[i].weight;
    if (mass >= total / 2 - 1e-12)
      return Math.abs(mass - total / 2) < 1e-12 && i + 1 < sorted.length
        ? (sorted[i].value + sorted[i + 1].value) / 2
        : sorted[i].value;
  }
  return NaN;
}
// Robust descriptive log-linear fit. Repeated same-company/date observations
// receive one median log value; pooled views retain one row per company/date.
// These are selected-release comparisons, not causal or fixed-quality trends.
function descriptiveFit(items, meta = {}) {
  const bins = new Map();
  items
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .forEach((p) => {
      const key = p.company + '|' + p.date;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(p);
    });
  const rows = [...bins.values()]
    .map((pp) => ({
      company: pp[0].company,
      date: pp[0].date,
      y: median(pp.map((p) => Math.log(p.value))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(rows.map((p) => p.date))];
  if (dates.length < 3 || day(dates.at(-1)) - day(dates[0]) < 90 * DAY)
    return null;
  const start = dates[0],
    end = dates.at(-1),
    slopes = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const dx = (day(rows[j].date) - day(rows[i].date)) / DAY;
      if (dx) slopes.push((rows[j].y - rows[i].y) / dx);
    }
  const slope = median(slopes),
    level = median(
      rows.map((p) => p.y - (slope * (day(p.date) - day(start))) / DAY),
    ),
    valueAt = (date) =>
      Math.exp(level + (slope * (day(date) - day(start))) / DAY);
  return {
    ...meta,
    start,
    end,
    reference: new Date((day(start) + day(end)) / 2).toISOString().slice(0, 10),
    slope,
    level,
    n: items.length,
    dateCount: dates.length,
    companyDateCount: rows.length,
    companyCount: new Set(rows.map((p) => p.company)).size,
    cohortCount: 1,
    valueAt,
    cohorts: [{ key: meta.series, n: items.length, start, end }],
    samples: Array.from({ length: 61 }, (_, i) => {
      const date = new Date(day(start) + ((day(end) - day(start)) * i) / 60)
        .toISOString()
        .slice(0, 10);
      return { date, value: valueAt(date) };
    }),
  };
}
function cadenceTypical(events, gaps, cutoff, mode = 'company', role) {
  const groups = new Map();
  gaps.forEach((p) => {
    const key = [
      mode === 'company' ? p.company : 'overall',
      ['all', 'flagship-premium'].includes(role) ? role : p.productClass,
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return [...groups]
    .map(([series, pp]) =>
      descriptiveFit(pp, {
        series,
        company: mode === 'company' ? pp[0].company : 'Selected companies',
        overall: mode !== 'company',
        role: ['all', 'flagship-premium'].includes(role)
          ? role
          : pp[0].productClass,
        roles: [...new Set(pp.map((p) => p.productClass))],
        pooledRoles: ['all', 'flagship-premium'].includes(role),
        metric: 'release_gap',
        descriptive: true,
        method: 'Robust completed-gap trend',
      }),
    )
    .filter(Boolean)
    .map((f) => ({
      ...f,
      observedEnd: f.end,
      end: cutoff,
      samples: Array.from({ length: 61 }, (_, i) => {
        const date = new Date(
          day(f.start) + ((day(cutoff) - day(f.start)) * i) / 60,
        )
          .toISOString()
          .slice(0, 10);
        return { date, value: f.valueAt(date) };
      }),
    }));
}
// A generation comparison deliberately uses release dates on x while retaining
// each specification's own evidence date. This is never called a launch cap.
function capacityObservations(data, state, metric) {
  return (data.articleCoverage?.models || [])
    .filter(
      (r) =>
        state.companies.includes(r.company) &&
        matchesRole(r.role, state.role) &&
        (!state.access ||
          state.access === 'all' ||
          r.weightAccess === state.access),
    )
    .flatMap((r) => {
      let cell = r.metrics[metric],
        shared = false;
      if (
        metric === 'input' &&
        cell.value === null &&
        cell.status === 'shared_context_budget' &&
        r.metrics.context.value !== null
      ) {
        const rule = cell;
        cell = r.metrics.context;
        shared = true;
        const expected = servingGroup({
          company: r.company,
          provider: rule.provider,
        });
        if (
          servingGroup({ company: r.company, provider: cell.provider }) !==
          expected
        ) {
          const matching = cell.evidence
            .filter(
              (e) =>
                e.value > 0 &&
                !e.beta &&
                servingGroup({ company: r.company, provider: e.provider }) ===
                  expected,
            )
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          if (matching.length) cell = { ...cell, ...matching[0] };
          else return [];
        }
      }
      if (!(cell.value > 0) || !r.releaseDate) return [];
      const sources = [
        ...new Set([
          ...(cell.sourceUrls || []),
          ...(shared ? r.metrics.input.sourceUrls : []),
        ]),
      ];
      return [
        {
          id: 'capacity_' + r.modelId + '_' + metric,
          modelId: r.modelId,
          model: r.model,
          company: r.company,
          productClass: r.role,
          weightAccess: r.weightAccess,
          metric,
          value: cell.value,
          date: r.releaseDate,
          releaseDate: r.releaseDate,
          evidenceDate: cell.date,
          evidenceObserved: cell.observed,
          evidenceBasis: cell.basis,
          mode: 'generation',
          status: 'disclosed',
          kind: shared
            ? 'shared'
            : metric === 'input'
              ? 'input'
              : metric === 'context'
                ? 'served'
                : 'standard',
          sharedBudget: shared,
          sharedRuleObserved: shared ? r.metrics.input.observed : null,
          provider: cell.provider || r.company,
          definition: shared
            ? 'Shared input + output token-window ceiling'
            : cell.definition,
          source: sources[0],
          sources,
          notes: cell.notes,
          reason: cell.reason,
          availability: cell.availability,
          endpoint: cell.endpoint,
          servedRelation: cell.servedRelation,
          quantization: cell.quantization,
          documentationOnly: cell.documentationOnly,
        },
      ];
    });
}
// Repeated providers are retained for prices; identical capacity claims count
// once per model/date/definition/provider so duplicated rows don't weight bins.
function observations(data, state, metric, mode) {
  if (metric === 'price_ratio')
    return mode === 'launch' ? launchPriceRatios(data, state).points : [];
  const pp = selected(data, state, metric, mode).filter(
    (p) =>
      (mode === 'current'
        ? !['retired', 'unavailable', 'alias_routed'].includes(p.availability)
        : within(p, data.cutoff)) &&
      matchesRole(p.productClass, state.role) &&
      (!state.access ||
        state.access === 'all' ||
        p.weightAccess === state.access) &&
      (!['total', 'active'].includes(metric) ||
        state.estimates !== false ||
        p.status !== 'estimated'),
  );
  return mode === 'launch'
    ? unique(pp, (p) =>
        [
          p.modelId,
          p.date,
          p.metric,
          p.value,
          p.provider,
          p.serviceTier,
          p.priceTier,
          p.reasoningMode,
          p.pricingCondition,
          p.scenario,
        ].join('|'),
      )
    : ['input', 'context', 'output'].includes(metric)
      ? unique(pp, (p) =>
          [p.modelId, p.date, p.value, p.kind, p.provider, p.mode].join('|'),
        )
      : pp;
}
// Pair exact offer identities BEFORE deduplication: never mix providers,
// conditions, dates, or a launch input with a later output quote.
function launchPriceRatios(data, state) {
  const groups = new Map(),
    excluded = [];
  for (const p of data.points) {
    if (
      !['input_price', 'output_price'].includes(p.metric) ||
      p.mode !== 'launch' ||
      !(p.launchEligible === true || p.launchVerified === true) ||
      p.serviceTier !== 'standard' ||
      !within(p, data.cutoff) ||
      !state.companies.includes(p.company) ||
      !matchesRole(p.productClass, state.role) ||
      (state.access &&
        state.access !== 'all' &&
        p.weightAccess !== state.access)
    )
      continue;
    const offerId = p.id.replace(/__(input_price|output_price)$/, ''),
      key = JSON.stringify([
        offerId,
        p.modelId,
        p.company,
        p.date,
        p.releaseDate,
        p.provider,
        p.serviceTier,
        p.priceTier,
        p.pricingCondition,
        p.pricingBand,
        p.region,
        p.endpoint,
        p.scenario,
      ]);
    if (!groups.has(key)) groups.set(key, { offerId });
    groups.get(key)[p.metric] = p;
  }
  const points = [];
  for (const pair of groups.values()) {
    const input = pair.input_price,
      output = pair.output_price,
      p = input || output;
    const reason =
      !input || !output
        ? 'Missing matched launch price'
        : !Number.isFinite(input.value)
          ? 'Unknown input price'
          : input.value === 0
            ? 'Zero input price; ratio undefined'
            : input.value < 0
              ? 'Invalid negative input price'
              : !Number.isFinite(output.value)
                ? 'Unknown output price'
                : output.value < 0
                  ? 'Invalid negative output price'
                  : p.date !== (p.apiLaunchDate || p.releaseDate)
                    ? 'Not the paid API launch date'
                    : null;
    if (reason) {
      excluded.push({ offerId: pair.offerId, modelId: p.modelId, reason });
      continue;
    }
    points.push({
      ...p,
      id: pair.offerId + '__price_ratio',
      metric: 'price_ratio',
      value: output.value / input.value,
      inputPrice: input.value,
      outputPrice: output.value,
      inputSource: input.source,
      outputSource: output.source,
      inputPointId: input.id,
      outputPointId: output.id,
      launchSources: [
        ...new Set([
          ...(input.launchSources || []),
          ...(output.launchSources || []),
        ]),
      ],
    });
  }
  return {
    points: unique(points, (p) =>
      JSON.stringify([
        p.modelId,
        p.date,
        p.provider,
        p.serviceTier,
        p.priceTier,
        p.pricingCondition,
        p.pricingBand,
        p.region,
        p.endpoint,
        p.inputPrice,
        p.outputPrice,
      ]),
    ),
    excluded,
  };
}
const quoteKey = (p) =>
  [
    p.modelId,
    p.metric,
    p.provider,
    p.serviceTier,
    p.kind,
    p.priceTier || 'base',
    p.pricingCondition || '',
    p.region || '',
  ].join('|');
function currentQuotes(data, state, metric) {
  const groups = new Map();
  selected(data, state, metric, 'current')
    .filter(
      (p) =>
        p.date <= (data.collectionDate || data.cutoff) &&
        (!p.releaseDate || p.releaseDate <= data.cutoff) &&
        matchesRole(p.productClass, state.role) &&
        (!state.access ||
          state.access === 'all' ||
          p.weightAccess === state.access),
    )
    .forEach((p) => {
      const k = quoteKey(p),
        old = groups.get(k);
      if (!old || p.date > old.date) groups.set(k, p);
    });
  return [...groups.values()].filter(
    (p) => !['retired', 'unavailable', 'alias_routed'].includes(p.availability),
  );
}
function sizeFits(pp) {
  const groups = new Map();
  pp.forEach((p) => {
    const k = seriesKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  });
  const fits = [];
  for (const [series, items] of groups) {
    if (
      items.length < 3 ||
      new Set(items.map((p) => p.date)).size < 3 ||
      new Set(items.map((p) => quarter(p.date))).size < 2
    )
      continue;
    const slopes = [];
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const delta = (day(items[j].date) - day(items[i].date)) / DAY;
        if (delta)
          slopes.push(
            (Math.log10(items[j].value) - Math.log10(items[i].value)) / delta,
          );
      }
    const slope = median(slopes),
      intercept = median(
        items.map((p) => Math.log10(p.value) - (slope * day(p.date)) / DAY),
      ),
      dates = items.map((p) => p.date).sort();
    fits.push({
      series,
      company: items[0].company,
      n: items.length,
      slope,
      intercept,
      start: dates[0],
      end: dates.at(-1),
      valueAt: (date) => 10 ** (intercept + (slope * day(date)) / DAY),
    });
  }
  return fits;
}
// Pool only the user's selected releases, within metric/definition/serving
// provider/tariff conditions. Role and family history cannot clip a company.
const servingGroup = (p) => {
  const provider = p.provider || p.company;
  return provider === p.company ||
    {
      Google: ['Google Gemini API', 'Google AI Studio'],
      Anthropic: ['Anthropic API'],
      'SpaceX / xAI': ['xAI', 'xAI API / SpaceXSI', 'xAI API'],
      Meta: ['Meta API'],
    }[p.company]?.includes(provider)
    ? 'Publisher API'
    : provider;
};
function metricFits(points, mode = 'overall') {
  const groups = new Map();
  points
    .filter(
      (p) =>
        p.mode !== 'current' &&
        p.status !== 'estimated' &&
        Number.isFinite(p.value) &&
        p.value > 0,
    )
    .forEach((p) => {
      const key = [
        mode === 'company' ? p.company : 'overall',
        p.metric,
        fitKind(p),
        servingGroup(p),
        p.scenario || '',
      ].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
  return [...groups]
    .map(([series, pp]) =>
      descriptiveFit(pp, {
        series,
        company: mode === 'company' ? pp[0].company : 'Selected companies',
        overall: mode !== 'company',
        metric: pp[0].metric,
        kind: fitKind(pp[0]),
        provider: servingGroup(pp[0]),
        roles: [...new Set(pp.map((p) => p.productClass))],
        descriptive: true,
        method: 'Robust selected-release trend',
      }),
    )
    .filter(Boolean);
}

function overviewFits(data, state) {
  const { events, gaps } = cadenceData(data, state);
  const capacities = ['input', 'output', 'context'].flatMap((metric) =>
    capacityObservations(data, state, metric),
  );
  const prices = ['input_price', 'output_price', 'price_ratio'].flatMap((metric) =>
    observations(data, state, metric, 'launch'),
  );
  const publisherPoints = [...capacities, ...prices].filter(
    (p) => servingGroup(p) === 'Publisher API' && !p.reasoningMode,
  );
  const fits = [
    ...cadenceTypical(events, gaps, data.cutoff, 'overall', state.role),
    ...metricFits(publisherPoints),
  ];
  return fits.map((fit) => {
    const end = fit.observedEnd || fit.end;
    const baseline = fit.valueAt(fit.start);
    const valueAt = (date) => fit.valueAt(date) / baseline;
    const samples = [
      ...fit.samples
        .filter(({ date }) => date < end)
        .map(({ date }) => ({ date, value: valueAt(date) })),
      { date: end, value: valueAt(end) },
    ];
    return { ...fit, end, baseline, valueAt, samples };
  });
}

function initialState(key, data, old) {
  if (key === 'overview') {
    const role = old?.overview?.role;
    return {
      companies: chosen.filter((company) => data.companies.includes(company)),
      role: roleOptions.includes(role) ? role : 'all',
      access: 'all',
      cadenceMode: 'overall',
    };
  }
  const saved =
      key === 'size' && old?.size?.defaultsVersion !== 2 ? null : old?.[key],
    allowed = (c) =>
      data.companies.includes(c) && (key === 'size' || chosen.includes(c));
  const article = ['cadence', 'input', 'output', 'context', 'pricing'].includes(
      key,
    ),
    migrate = article && saved?.articleDefaultsVersion !== 1;
  // Pricing gets its own one-time migration; other figures and later choices stay intact.
  const migratePricing =
    key === 'pricing' && saved?.pricingDefaultsVersion !== 1;
  const defaultMode = key === 'pricing' || !article ? 'company' : 'overall';
  let companies = (saved?.companies || defaults(key)).filter(allowed);
  if (saved?.companies?.length && !companies.length)
    companies = defaults(key).filter(allowed);
  return {
    companies,
    scenario: saved?.scenario || '8k_in_2k_out',
    role:
      !migrate && roleOptions.includes(saved?.role)
        ? saved.role
        : defaultRole(key),
    access: article
      ? 'all'
      : ['all', 'open', 'closed', 'unknown'].includes(saved?.access)
        ? saved.access
        : 'all',
    cadenceMode:
      migratePricing || migrate
        ? defaultMode
        : ['company', 'overall'].includes(saved?.cadenceMode)
          ? saved.cadenceMode
          : defaultMode,
    pricingDefaultsVersion: key === 'pricing' ? 1 : undefined,
    articleDefaultsVersion: article ? 1 : undefined,
    estimates: saved?.estimates ?? key !== 'size',
    defaultsVersion: key === 'size' ? 2 : undefined,
  };
}

export {
  classes,
  roleOptions,
  roleLabel,
  matchesRole,
  chosen,
  defaults,
  DAY,
  day,
  median,
  quarter,
  isClass,
  cadenceData,
  quarterly,
  cadenceSummaries,
  presetCompanies,
  cadenceRange,
  observationRange,
  trendSegments,
  weightedMedian,
  descriptiveFit,
  cadenceTypical,
  capacityObservations,
  observations,
  launchPriceRatios,
  currentQuotes,
  sizeFits,
  servingGroup,
  metricFits,
  overviewFits,
  initialState,
};
