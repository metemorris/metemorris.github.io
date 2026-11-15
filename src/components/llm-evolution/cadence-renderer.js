// Rendering only: all interval and summary arithmetic lives in chart-core.js.
import { scaleUtc, scaleLinear, scaleLog } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { select } from 'd3-selection';
import { utcMonth, utcYear } from 'd3-time';
import { utcFormat } from 'd3-time-format';

// Shared timeline geometry, axes and accessible fit inspection. Cadence retains
// its linear day scale and release strip; measured quantities use log scales.
export function renderCadence(host, options) {
  return renderTimeline(host, { ...options, cadence: true });
}
export function renderTimeline(
  host,
  {
    points,
    events = [],
    ongoing = [],
    fits,
    range,
    colors,
    shape,
    bindMarks,
    role,
    metric = 'release_gap',
    metricName = 'interval',
    unit = 'days',
    format = String,
    cadence = false,
    compact = false,
    multiRole = false,
    indexed = false,
  },
) {
  const width = Math.max(
      280,
      host.clientWidth || host.closest('.llm-figure').clientWidth,
    ),
    mobile = width < 500,
    endLabels = indexed && !mobile,
    L = indexed ? 44 : mobile ? 72 : 84,
    R = endLabels ? 142 : 14,
    T = 28,
    H = compact ? 110 : Math.max(190, Math.min(280, (width - L - R) * 0.55));
  const companies = [...new Set(events.map((p) => p.company))].sort(),
    stripTop = T + H + 88,
    height = cadence
      ? stripTop + Math.max(1, companies.length) * 22 + 18
      : T + H + 78;
  const start = new Date(range.start + 'T00:00:00Z'),
    end = new Date(range.end + 'T00:00:00Z'),
    padding = Math.min(
      7 * 86400000,
      Math.max(3 * 86400000, (+end - +start) * 0.005),
    );
  const x = scaleUtc()
    .domain([new Date(+start - padding), new Date(+end + padding)])
    .range([L, width - R]);
  const values = [
    ...points.map((p) => p.value),
    ...fits.flatMap((f) => f.samples.map((p) => p.value)),
  ];
  const positive = values.filter((v) => v > 0),
    low = Math.min(...positive),
    high = Math.max(...positive);
  const ratio = metric === 'price_ratio';
  // Cadence only: a gap beyond Q3 + 3 × IQR is drawn at the top edge with its
  // value written beside it, so one long wait cannot flatten every other gap.
  let clipAt = Infinity;
  if (cadence && points.length >= 8) {
    const sorted = points.map((p) => p.value).sort((a, b) => a - b),
      q = (f) => sorted[Math.floor((sorted.length - 1) * f)],
      fence = q(0.75) + 3 * (q(0.75) - q(0.25)),
      inside = Math.max(
        ...sorted.filter((v) => v <= fence),
        ...fits.flatMap((f) => f.samples.map((p) => p.value)),
      );
    if (sorted.at(-1) > fence && sorted.at(-1) > inside * 1.5) clipAt = inside;
  }
  const y = indexed
    ? scaleLog()
        .base(2)
        .domain([Math.min(1, low) / 1.06, Math.max(1, high) * 1.06])
        .nice()
        .range([T + H, T])
    : cadence
    ? scaleLinear()
        .domain([
          0,
          Math.max(30, ...values.filter((v) => v <= clipAt)) *
            (clipAt < Infinity ? 1.15 : 1.06),
        ])
        .nice(5)
        .range([T + H, T])
    : ratio
      ? scaleLinear()
          .domain([0, Math.max(1, ...values) * 1.08])
          .nice(5)
          .range([T + H, T])
      : scaleLog()
          .domain(positive.length ? [low / 1.2, high * 1.2] : [1, 10])
          .nice()
          .range([T + H, T]);
  const svg = select(host)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'group')
    .attr('data-domain-start', range.start)
    .attr('data-domain-end', range.end)
    .attr(
      'aria-label',
      `${role} ${cadence ? 'recorded release intervals' : metricName}, ${range.start} to ${range.end}. ${indexed ? 'Focus a line for fitted values.' : 'Focus a point for model details.'}`,
    );
  svg
    .append('text')
    .attr('x', L)
    .attr('y', 14)
    .attr('class', 'llm-axis-label')
    .text(
      indexed
        ? unit
        : cadence
        ? 'Days between releases' +
          (clipAt < Infinity ? ' · longer gaps marked at the top' : '')
        : unit + (ratio ? ' · linear scale' : ' · log scale'),
    );
  svg
    .append('g')
    .attr('transform', `translate(${L},0)`)
    .attr('class', 'llm-d3-y')
    .call(
      cadence || ratio
        ? axisLeft(y)
            .tickValues(
              ratio
                ? [...new Set([...y.ticks(5), 1])].sort((a, b) => a - b)
                : y.ticks(5),
            )
            .tickFormat(ratio ? format : null)
            .tickSize(-(width - L - R))
            .tickPadding(8)
        : axisLeft(y)
            .tickValues(
              y
                .ticks()
                .filter(
                  (v) =>
                    indexed ||
                    Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-8,
                ),
            )
            .tickFormat(format)
            .tickSize(-(width - L - R))
            .tickPadding(8),
    );
  if (ratio || indexed)
    svg
      .append('line')
      .attr('class', 'llm-ratio-baseline')
      .attr('x1', L)
      .attr('x2', width - R)
      .attr('y1', y(1))
      .attr('y2', y(1))
      .attr('stroke', 'var(--page-muted)')
      .attr('stroke-dasharray', '2 3')
      .append('title')
      .text(indexed ? '1×: starting value of each trend' : '1×: output and input prices are equal');
  const quarters = utcMonth
    .every(3)
    .range(utcMonth.every(3).floor(start), new Date(+end + 86400000))
    .map(
      (d) =>
        new Date(
          (Math.max(+d, +start) + Math.min(+utcMonth.offset(d, 3), +end)) / 2,
        ),
    );
  svg
    .append('g')
    .attr('transform', `translate(0,${T + H})`)
    .attr('class', 'llm-d3-x')
    .call(
      axisBottom(x)
        .tickValues(quarters)
        .tickFormat((d, i) =>
          mobile && quarters.length > 10 && i % 2
            ? ''
            : 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1),
        )
        .tickSize(5)
        .tickPadding(8),
    );
  const years = utcYear.range(utcYear.floor(start), new Date(+end + 86400000));
  years.forEach((d) => {
    const a = Math.max(+d, +start),
      b = Math.min(+utcYear.offset(d, 1), +end);
    svg
      .append('text')
      .attr('x', x(new Date((a + b) / 2)))
      .attr('y', T + H + 39)
      .attr('text-anchor', 'middle')
      .attr('class', 'llm-year-label')
      .text(d.getUTCFullYear());
  });
  svg
    .append('text')
    .attr('x', L)
    .attr('y', T + H + 60)
    .attr('class', 'llm-axis-label')
    .text(
      `${utcFormat('%b %-d, %Y')(start)} – ${utcFormat('%b %-d, %Y')(end)}`,
    );
  const fitCoords = [];
  fits.forEach((f) => {
    const id = (cadence ? 'cadence' : metric) + '-fit-' + f.series,
      pathFor = (ss) =>
        ss
          .map((p, i) => `${i ? 'L' : 'M'}${x(new Date(p.date))},${y(p.value)}`)
          .join(' '),
      d = pathFor(f.samples),
      visibleD = pathFor(
        f.observedEnd
          ? [
              ...f.samples.filter((p) => p.date < f.observedEnd),
              { date: f.observedEnd, value: f.valueAt(f.observedEnd) },
            ]
          : f.typical
            ? f.samples.filter((p) => p.date >= f.firstKnown)
            : f.samples,
      );
    if (f.typical && f.start < f.firstKnown)
      svg
        .append('path')
        .attr('class', 'llm-retrospective')
        .attr(
          'd',
          `M${x(new Date(f.start))},${y(f.valueAt(f.start))}L${x(new Date(f.firstKnown))},${y(f.valueAt(f.start))}`,
        )
        .attr('fill', 'none')
        .attr('stroke', colors[f.company])
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.55);
    // A narrow continuous stroke makes dashed gaps touchable; raw marks are
    // drawn later, above it, so the hit target never steals point inspection.
    svg
      .append('path')
      .attr(
        'class',
        'llm-trend ' + (cadence ? 'llm-cadence-fit' : 'llm-metric-fit'),
      )
      .attr('data-series', f.series)
      .attr('data-role', f.role || '')
      .attr('data-fit-n', f.n)
      .attr('data-start', f.start)
      .attr('data-end', f.observedEnd || f.end)
      .attr('data-display-end', f.end)
      .attr('d', visibleD)
      .attr('fill', 'none')
      .attr('stroke', f.color || (f.overall ? 'var(--page-foreground)' : colors[f.company]))
      .attr('stroke-width', 2.5)
      .attr(
        'stroke-dasharray',
        indexed
          ? f.dash
          : f.typical
          ? null
          : cadence && multiRole && !f.pooledRoles
            ? {
                economy: '3 3',
                balanced: '9 4',
                flagship: '7 3 2 3',
                premium: '12 3 2 3 2 3',
              }[f.role]
            : '7 4',
      )
      .attr('opacity', 0.8)
      .attr('pointer-events', 'none');
    if (f.observedEnd && f.observedEnd < f.end)
      svg
        .append('path')
        .attr('class', 'llm-trend-extension')
        .attr('data-start', f.observedEnd)
        .attr('data-end', f.end)
        .attr(
          'd',
          pathFor([
            { date: f.observedEnd, value: f.valueAt(f.observedEnd) },
            ...f.samples.filter((p) => p.date > f.observedEnd),
          ]),
        )
        .attr('fill', 'none')
        .attr(
          'stroke',
          f.overall ? 'var(--page-foreground)' : colors[f.company],
        )
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.65)
        .attr('pointer-events', 'none');
    const targetD = cadence
      ? d
      : f.samples
          .map(
            (p, i) =>
              `${i ? 'L' : 'M'}${x(new Date(p.date))},${y(p.value) - 6}`,
          )
          .join(' ') +
        ' ' +
        [...f.samples]
          .reverse()
          .map((p) => `L${x(new Date(p.date))},${y(p.value) + 6}`)
          .join(' ') +
        ' Z';
    svg
      .append('path')
      .attr('class', 'llm-fit-target')
      .attr('d', targetD)
      .attr('fill', cadence ? 'none' : 'transparent')
      .attr('stroke', 'transparent')
      .attr('stroke-width', cadence ? 12 : 0)
      .attr('pointer-events', cadence ? 'stroke' : 'fill')
      .attr('data-point', id)
      .attr('data-fit-target', 'true')
      .attr('data-role', f.role || '')
      .attr('tabindex', 0)
      .attr('role', 'slider')
      .attr('aria-orientation', 'horizontal')
      .attr('aria-valuemin', Date.parse(f.start) / 86400000)
      .attr('aria-valuemax', Date.parse(f.end) / 86400000)
      .attr('aria-valuenow', Date.parse(f.reference) / 86400000)
      .attr(
        'aria-label',
        (indexed
          ? `${f.label} relative to its starting value`
          : `${f.overall ? 'Overall' : f.company}${f.provider ? ' · ' + f.provider : ''}${cadence && f.role ? ' · ' + f.role : ''} ${f.typical ? 'typical recent interval' : 'estimated ' + metricName.toLowerCase()}`) +
          '. Arrow keys change date; Home and End reach endpoints.',
      );
    fitCoords.push({
      ...f,
      id,
      metric: indexed ? f.metric : metric,
      fit: true,
      dateAtX: (px) =>
        new Date(
          Math.max(
            Date.parse(f.start),
            Math.min(Date.parse(f.end), +x.invert(px)),
          ),
        )
          .toISOString()
          .slice(0, 10),
      pointAtDate: (date) => ({
        cx: x(new Date(date)),
        cy: y(f.valueAt(date)),
      }),
    });
  });
  const coords = points.map((p) => ({
    ...p,
    cx: x(new Date(p.date)),
    cy: p.value > clipAt ? y.range()[1] : y(p.value),
    clipped: p.value > clipAt,
  }));
  coords.forEach((p) => svg.node().insertAdjacentHTML('beforeend', shape(p)));
  // Off-scale gaps: value under the marker, on a second row when two are close.
  let lastX = -Infinity,
    lastRow = 0;
  coords
    .filter((p) => p.clipped)
    .sort((a, b) => a.cx - b.cx)
    .forEach((p) => {
      const row = p.cx - lastX < 64 ? 1 - lastRow : 0;
      lastX = p.cx;
      lastRow = row;
      svg
        .append('text')
        .attr('x', Math.max(L + 30, Math.min(width - R - 30, p.cx)))
        .attr('y', p.cy + 17 + row * 12)
        .attr('text-anchor', 'middle')
        .attr('class', 'llm-axis-label llm-clipped-label')
        .text(`${format(p.value)} days`);
    });
  if (endLabels) {
    // Label each line at its right end; nudge apart labels that would collide.
    const gap = 13,
      labels = fits
        .map((f) => ({ f, value: f.valueAt(f.end), y: y(f.valueAt(f.end)) }))
        .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++)
      labels[i].y = Math.max(labels[i].y, labels[i - 1].y + gap);
    const overflow = labels.length ? labels.at(-1).y - (T + H) : 0;
    if (overflow > 0) {
      labels.at(-1).y -= overflow;
      for (let i = labels.length - 2; i >= 0; i--)
        labels[i].y = Math.min(labels[i].y, labels[i + 1].y - gap);
    }
    labels.forEach(({ f, value, y: ly }) => {
      svg
        .append('text')
        .attr('x', width - R + 8)
        .attr('y', ly + 3.5)
        .attr('class', 'llm-end-label')
        .attr('fill', f.color || 'var(--page-foreground)')
        .text(`${f.short || f.label} ${format(value)}`);
    });
  }
  if (cadence) {
    // Separate rows prevent first releases from being mistaken for zero-day gaps.
    svg
      .append('text')
      .attr('x', L)
      .attr('y', stripTop - 11)
      .attr('class', 'llm-axis-label')
      .text('Releases · ◇ first in history');
    companies.forEach((c, i) => {
      const cy = stripTop + 10 + i * 22;
      svg
        .append('line')
        .attr('x1', L)
        .attr('x2', width - R)
        .attr('y1', cy)
        .attr('y2', cy)
        .attr('class', 'llm-grid');
      const name = c === 'Alibaba' ? 'Qwen' : c,
        limit = mobile ? 10 : 12;
      svg
        .append('text')
        .attr('x', L - 12)
        .attr('y', cy + 3)
        .attr('text-anchor', 'end')
        .attr('class', 'llm-rug-company')
        .text(name.length > limit ? name.slice(0, limit - 1) + '…' : name)
        .append('title')
        .text(c);
    });
    // Same-day mixed-class events remain individually focusable and disclosed as overlaps.
    events.forEach((p) => {
      const cx = x(new Date(p.date)),
        cy = stripTop + 10 + companies.indexOf(p.company) * 22,
        q = {
          ...p,
          cx,
          cy,
          interval: points.find(
            (g) => g.cohort === p.cohort && g.date === p.date,
          )?.value,
        };
      coords.push(q);
      const mark = svg
        .append('path')
        .attr(
          'd',
          p.firstEvent
            ? `M${cx},${cy - 5}l5,5l-5,5l-5,-5Z`
            : `M${cx - 0.5},${cy - 5}h1v10h-1Z`,
        )
        .attr('fill', p.firstEvent ? 'var(--page-bg)' : 'none')
        .attr('stroke', colors[p.company])
        .attr('stroke-width', 2)
        .attr('data-point', p.id)
        .attr('data-release-event', 'true')
        .attr('data-role', p.productClass)
        .attr('data-company', p.company)
        .attr('data-date', p.date)
        .attr('data-first-event', String(p.firstEvent))
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr(
          'aria-label',
          `${p.model}; ${p.company}; ${p.productClass}; ${p.date}; ${p.firstEvent ? 'first recorded event, no preceding interval' : 'release event'}`,
        );
      mark.append('title').text(p.model);
    });
  }
  if (!points.length && !fits.length) {
    svg
      .append('text')
      .attr('x', (L + width - R) / 2)
      .attr('y', T + H / 2)
      .attr('text-anchor', 'middle')
      .attr('class', 'llm-empty')
      .text(
        cadence
          ? events.length
            ? 'No completed interval yet; releases shown below'
            : 'No supported releases for this selection'
          : indexed
            ? 'Too few observations to fit trends'
            : 'No supported observations',
      );
    if (!cadence)
      svg
        .append('text')
        .attr('x', (L + width - R) / 2)
        .attr('y', T + H / 2 + 16)
        .attr('text-anchor', 'middle')
        .attr('class', 'llm-empty')
        .text('for this selection');
  }
  bindMarks(host, [...fitCoords, ...coords]);
  return {
    points: points.length,
    summaries: [],
    segments: fits.length,
    fits,
    range,
  };
}
