import { renderCadence, renderTimeline } from './cadence-renderer.js';
import * as core from './chart-core.js';
import {
  classes,
  roleOptions,
  roleLabel,
  matchesRole,
  chosen,
  DAY,
  day,
  isClass,
  cadenceData,
  cadenceRange,
  observationRange,
  cadenceTypical,
  capacityObservations,
  observations,
  currentQuotes,
  metricFits,
  overviewFits,
  initialState,
} from './chart-core.js';
import {
  names,
  units,
  esc,
  cap,
  fmt,
  companyLabel as label,
} from './chart-format.js';
import { tooltipContent } from './tooltip-content.js';
import { loadChartData } from './chart-data.js';

const overviewSeries = {
  release_gap: { label: 'Days between releases', color: 'var(--llm-overview-amber)', dash: '7 3 2 3' },
  input: { label: 'Input cap', color: 'var(--llm-overview-violet)', dash: '6 4' },
  shared: { label: 'Shared window', color: 'var(--llm-overview-violet)', dash: '2 3' },
  output: { label: 'Output cap', color: 'var(--llm-overview-blue)' },
  context: { label: names.context, color: 'var(--llm-overview-teal)' },
  input_price: { label: 'Input price', color: 'var(--llm-overview-rose)', dash: '7 4' },
  output_price: { label: 'Output price', color: 'var(--llm-overview-rose)' },
  price_ratio: { label: 'Output / input price ratio', color: 'var(--page-foreground)', dash: '2 3' },
};

/* Editorial figures. Raw observations stay separate from descriptive fitted estimates. */
(() => {
  function mount(data) {
    const figures = [...document.querySelectorAll('[data-llm-figure]')];
    if (!figures.length) return;
    const state = {},
      stats = {},
      storageKey = 'tokenomics-local-cadence-v3';
    let old;
    try {
      old = JSON.parse(sessionStorage.getItem(storageKey));
    } catch {}
    figures.forEach((fig) => {
      const key = fig.dataset.llmFigure;
      state[key] = initialState(key, data, old);
    });
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
    const methodsUrl = location.pathname.startsWith('/__drafts/')
      ? '/__drafts/tokenomics-data'
      : '/posts/tokenomics/data/';
    const methodsHref = (suffix = '') =>
      (window.LLM_FROZEN_DATA ? 'http://127.0.0.1:4322' : '') + methodsUrl + suffix;
    function companyControls(local) {
      const chip = (c) =>
        `<label class="llm-company-chip"><input type="checkbox" data-company="${esc(c)}" ${local.companies.includes(c) ? 'checked' : ''}><i style="--company-color:${data.colors[c]}"></i>${esc(label(c))}</label>`;
      return `<div class="llm-local-companies"><div class="llm-company-heading"><span>Companies in this figure</span><button type="button" data-reset>Reset</button></div><div class="llm-company-chips">${chosen.map(chip).join('')}</div></div>`;
    }
    function change(fig) {
      const focused = document.activeElement,
        focusKey = focused?.name ? [focused.name, focused.value] : null,
        focusData = ['company', 'scenario', 'reset', 'estimates'].find(
          (k) => focused?.dataset && k in focused.dataset,
        ),
        focusValue = focusData ? focused.dataset[focusData] : null;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
      hide();
      figure(fig);
      const next = [...fig.querySelectorAll('input,select,button')].find(
        (el) =>
          focusKey
            ? el.name === focusKey[0] && el.value === focusKey[1]
            : focusData &&
              focusData in el.dataset &&
              el.dataset[focusData] === focusValue,
      );
      next?.focus({ preventScroll: true });
    }
    document.getElementById('llm-tooltip')?.remove();
    const tip = document.createElement('div');
    tip.id = 'llm-tooltip';
    tip.className = 'llm-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.append(tip);
    let tipTimer,
      pinned = false,
      activeMark;
    function hide() {
      tip.hidden = true;
      pinned = false;
      activeMark?.removeAttribute('aria-describedby');
      activeMark = null;
    }

    function show(mark, p, overlap, anchor) {
      clearTimeout(tipTimer);
      activeMark?.removeAttribute('aria-describedby');
      activeMark = mark;
      mark.setAttribute('aria-describedby', tip.id);
      const nearby = [p, ...overlap];
      tip.innerHTML =
        tooltipContent(p, methodsHref) +
        (overlap.length
          ? `<label class="llm-nearby">Nearby points (${nearby.length})<select aria-label="Choose nearby model">${nearby.map((q, i) => `<option value="${i}">${esc(q.model)} · ${esc(q.date)}${['releases', 'release_gap'].includes(q.metric) ? ' · ' + esc(cap(q.productClass)) : ''}</option>`).join('')}</select></label>`
          : '') +
        '<button type="button" class="llm-tip-close" aria-label="Close observation">Close</button>';
      tip
        .querySelector('.llm-nearby select')
        ?.addEventListener('change', (e) => {
          const chosen = nearby[Number(e.target.value)];
          pinned = true;
          show(
            mark,
            chosen,
            nearby.filter((q) => q.id !== chosen.id),
            anchor,
          );
        });
      tip.hidden = false;
      tip.querySelector('.llm-tip-close').onclick = hide;
      const viewportWidth = document.documentElement.clientWidth;
      tip.style.maxWidth = Math.min(340, viewportWidth - 20) + 'px';
      const b = anchor || mark.getBoundingClientRect(),
        t = tip.getBoundingClientRect();
      let x = Math.min(
          viewportWidth - t.width - 10,
          Math.max(10, b.left + b.width / 2 - t.width / 2),
        ),
        y = b.bottom + 10;
      if (y + t.height > innerHeight - 10)
        y = Math.max(10, b.top - t.height - 10);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    tip.onpointerenter = () => clearTimeout(tipTimer);
    tip.onpointerleave = () => {
      if (!pinned) tipTimer = setTimeout(hide, 180);
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!tip.contains(e.target) && !e.target.closest?.('[data-point]'))
        hide();
    });
    function bindMarks(host, coords) {
      host.querySelectorAll('[data-point]').forEach((mark) => {
        const p = coords.find((x) => x.id === mark.dataset.point);
        if (!p) return;
        const overlap = () =>
          coords.filter(
            (q) =>
              q.id !== p.id &&
              !q.aggregate &&
              !p.aggregate &&
              !q.fit &&
              !p.fit &&
              Math.hypot(q.cx - p.cx, q.cy - p.cy) < 8,
          );
        let probeDate = p.fit ? p.reference : null;
        const inspect = (event) => {
          if (!p.fit) {
            show(mark, p, overlap());
            return;
          }
          const svg = mark.ownerSVGElement,
            b = svg.getBoundingClientRect(),
            scale = b.width / svg.viewBox.baseVal.width;
          if (event && Number.isFinite(event.clientX))
            probeDate = p.dateAtX((event.clientX - b.left) / scale);
          const value = p.valueAt(probeDate),
            point = p.pointAtDate(probeDate),
            cx = b.left + point.cx * scale,
            cy = b.top + point.cy * scale;
          mark.setAttribute('aria-valuenow', Math.round(day(probeDate) / DAY));
          const readout = p.baseline
            ? `${fmt(value, 'price_ratio')} starting value; fitted value ${fmt(value * p.baseline, p.metric)} ${units[p.metric]}`
            : `${p.typical ? 'typical recent interval' : 'estimated ' + names[p.metric].toLowerCase()} ${fmt(value, p.metric)} ${units[p.metric]}`;
          mark.setAttribute('aria-valuetext', `${probeDate}; ${readout}`);
          show(mark, { ...p, date: probeDate, value }, [], {
            left: cx,
            top: cy,
            bottom: cy,
            width: 0,
          });
        };
        mark.onpointerenter = (e) => {
          if (!pinned) inspect(e);
        };
        mark.onfocus = () => {
          pinned = true;
          inspect();
        };
        mark.onpointermove = (e) => {
          if (p.fit && !pinned) inspect(e);
        };
        mark.onpointerleave = () => {
          if (!pinned) tipTimer = setTimeout(hide, 180);
        };
        mark.onclick = (e) => {
          e.stopPropagation();
          pinned = true;
          inspect(e);
        };
        mark.onkeydown = (e) => {
          if (
            p.fit &&
            ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
          ) {
            e.preventDefault();
            pinned = true;
            const step =
              Math.max(1, Math.round((day(p.end) - day(p.start)) / DAY / 60)) *
              DAY;
            const next =
              e.key === 'Home'
                ? day(p.start)
                : e.key === 'End'
                  ? day(p.end)
                  : day(probeDate) + (e.key === 'ArrowLeft' ? -step : step);
            probeDate = new Date(
              Math.max(day(p.start), Math.min(day(p.end), next)),
            )
              .toISOString()
              .slice(0, 10);
            inspect();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pinned = true;
            inspect();
          }
        };
      });
    }
    function shape(p) {
      const estimated =
        p.status === 'estimated' && ['total', 'active'].includes(p.metric);
      const color = p.overall
          ? 'var(--page-foreground)'
          : data.colors[p.company],
        fill = p.weightAccess === 'open' ? 'var(--page-bg)' : color,
        attrs = `data-point="${esc(p.id)}" data-role="${esc(p.productClass)}" data-company="${esc(p.company)}" data-date="${esc(p.date)}" data-evidence="${estimated ? 'estimated' : 'disclosed'}" tabindex="0" role="button" aria-label="${esc(p.ongoing ? 'Ongoing wait ' + p.model : p.aggregate ? 'Quarterly median, ' + p.quarterLabel + ', ' + p.n + ' observations' : p.model)}; ${esc(p.company)}; ${p.metric === 'release_gap' ? esc(cap(p.productClass)) + '; ' : ''}${esc(p.date)}; ${estimated ? 'reported estimate, ' : ''}${fmt(p.value, p.metric)} ${units[p.metric]}"`;
      if (
        p.metric === 'release_gap' &&
        p.multiRole &&
        p.productClass !== 'economy'
      ) {
        const d =
          p.productClass === 'balanced'
            ? `M${p.cx - 3.5},${p.cy - 3.5}h7v7h-7Z`
            : p.productClass === 'flagship'
              ? `M${p.cx},${p.cy - 4.5}l4.5,4.5l-4.5,4.5l-4.5,-4.5Z`
              : `M${p.cx - 4.5},${p.cy - 1.5}h3v-3h3v3h3v3h-3v3h-3v-3h-3Z`;
        return `<path ${attrs} d="${d}" fill="${fill}" stroke="${color}" stroke-width="1.3" opacity=".7"><title>${esc(p.model)}</title></path>`;
      }
      if (p.sharedBudget)
        return `<path ${attrs} data-shared-budget="true" d="M${p.cx},${p.cy - 5}l5,5l-5,5l-5,-5Z" fill="var(--page-bg)" stroke="${color}" stroke-width="1.8"/>`;
      if (p.ongoing)
        return `<path ${attrs} data-ongoing="true" d="M${p.cx},${p.cy - 5}l5,9h-10Z" fill="var(--page-bg)" stroke="${color}" stroke-width="1.8"/>`;
      if (estimated)
        return `<path ${attrs} d="M${p.cx},${p.cy - 5}l5,5l-5,5l-5,-5Z" fill="var(--page-bg)" stroke="${color}" stroke-width="1.8"/>`;
      return p.aggregate
        ? `<rect ${attrs} x="${p.cx - 3.5}" y="${p.cy - 3.5}" width="7" height="7" fill="${color}" stroke="var(--page-bg)" stroke-width="1.2"/>`
        : `<circle ${attrs} cx="${p.cx}" cy="${p.cy}" r="3.6" fill="${fill}" stroke="${color}" stroke-width="1.3" opacity=".7"><title>${esc(p.model)}</title></circle>`;
    }
    function plot(host, pp, metric, state, range) {
      const fits = metricFits(pp, state.cadenceMode);
      const result = renderTimeline(host, {
        points: pp,
        fits,
        range,
        colors: data.colors,
        shape,
        bindMarks,
        role: roleLabel(state.role),
        metric,
        metricName: names[metric],
        unit: metric === 'price_ratio' ? 'Output / input · ×' : units[metric],
        format: (n) => fmt(n, metric),
        compact:
          ['total', 'active'].includes(metric) && pp.length < 3 && !fits.length,
      });
      if (metric === 'cost' && state.cadenceMode === 'company') {
        const missing = state.companies.filter(
          (company) => !fits.some((f) => f.company === company),
        );
        if (missing.length)
          host.insertAdjacentHTML(
            'beforeend',
            `<p class="llm-fit-note">${missing.map(esc).join(', ')}: too little comparable launch-cost history for a curve at this workload. Available points remain visible.</p>`,
          );
      }
      return result;
    }
    function cadencePlot(host, pp, events, state) {
      const fits = cadenceTypical(
          events,
          pp,
          data.cutoff,
          state.cadenceMode,
          state.role,
        ),
        range = cadenceRange(events, data.cutoff);
      const multiRole = ['all', 'flagship-premium'].includes(state.role);
      const result = renderCadence(host, {
        points: pp.map((p) => ({ ...p, multiRole })),
        events,
        fits,
        range,
        multiRole,
        colors: data.colors,
        shape,
        bindMarks,
        esc,
        role: roleLabel(state.role),
      });
      return result;
    }
    function roleControls(state, key) {
      return `<fieldset class="llm-role-tabs"><legend>Product role</legend>${roleOptions.map((c) => `<label><input type="radio" name="${key}-role" value="${c}" ${state.role === c ? 'checked' : ''}>${roleLabel(c)}</label>`).join('')}</fieldset>`;
    }
    function figureControls(state, key) {
      return `<div class="llm-cadence-primary">${roleControls(state, key)}<fieldset class="llm-summary-mode"><legend>${key === 'cadence' ? 'Completed-gap trend' : 'Descriptive trend'}</legend>${[
        ['overall', 'Overall'],
        ['company', 'By company'],
      ]
        .map(
          ([value, text]) =>
            `<label><input type="radio" name="${key}-summary" value="${value}" ${state.cadenceMode === value ? 'checked' : ''}>${text}</label>`,
        )
        .join('')}</fieldset></div>`;
    }
    function inspector(fig) {
      const p = document.createElement('p');
      const key = fig.dataset.llmFigure;
      const section = { cost: 'pricing', size: 'methods' }[key] || key;
      p.className = 'llm-methods-link';
      p.innerHTML =
        '<a href="' +
        methodsHref('#' + section) +
        '">Data and methods →</a>';
      fig.append(p);
    }
    const windowState = state;
    function figure(fig) {
      const key = fig.dataset.llmFigure,
        state = windowState[key];
      if (key === 'overview') {
        renderOverview(fig, state);
        return;
      }
      let pp = [],
        panels = [],
        current = 0,
        events = [];
      if (key === 'cadence') {
        ({ gaps: pp, events } = cadenceData(data, state));
        panels = [
          {
            title: '',
            metric: 'release_gap',
            points: pp,
            events,
            className: state.role,
          },
        ];
      } else if (key === 'size') {
        pp = ['total', 'active']
          .flatMap((m) => observations(data, state, m, 'release'))
          .filter(isClass);
        panels = ['total', 'active'].map((m) => ({
          title: names[m],
          metric: m,
          points: pp.filter((p) => p.metric === m),
        }));
      } else if (['input', 'context', 'output'].includes(key)) {
        pp = capacityObservations(data, state, key);
        const groups =
          key === 'input'
            ? [
                ['input', 'Published input caps · ●'],
                ['shared', 'Shared token-window ceilings · ◇'],
              ]
            : key === 'context'
              ? [['served', 'API / provider-supported context']]
              : [['standard', 'Published output caps']];
        groups.forEach(([kind, title]) => {
          const points = pp.filter((p) => p.kind === kind);
          if (points.length || kind === groups[0][0])
            panels.push({ title, metric: key, points });
        });
      } else {
        const metrics =
          key === 'pricing'
            ? ['input_price', 'output_price', 'price_ratio']
            : ['cost'];
        pp = metrics.flatMap((m) => observations(data, state, m, 'launch'));
        metrics.forEach((m) => {
          const points = pp.filter((p) => p.metric === m);
          panels.push({ title: names[m], metric: m, points });
        });
      }
      fig.classList.toggle('llm-cadence', key === 'cadence');
      fig.classList.add('llm-timeline');
      fig.classList.remove('is-expanded');
      const legend = state.companies
        .map(
          (c) =>
            `<span><i style="--company-color:${data.colors[c]}"></i>${esc(label(c))}${key === 'size' && !pp.some((p) => p.company === c) ? ' · unknown' : ''}</span>`,
        )
        .join('');
      const roleLegend =
        key === 'cadence' && ['all', 'flagship-premium'].includes(state.role)
          ? `<div class="llm-legend llm-role-legend">${classes
              .filter((c) => matchesRole(c, state.role))
              .map(
                (c) =>
                  `<span>${{ economy: '●', balanced: '■', flagship: '◆', premium: '✚' }[c]} ${cap(c)}</span>`,
              )
              .join('')}</div>`
          : '';
      const title = {
        input: 'Prompt capacity',
        output: 'Output capacity',
        context: names.context,
        pricing: 'Launch prices',
      }[key];
      fig.innerHTML = `${title ? `<h3>${title}</h3>` : ''}${companyControls(state)}${figureControls(state, key)}${key === 'size' ? `<div class="llm-size-evidence"><label><input type="checkbox" data-estimates ${state.estimates ? 'checked' : ''}>Include reported estimates</label><span>○ Disclosed · ◇ Estimated (excluded from fits)</span></div>` : ''}<div class="llm-legend">${legend}${key === 'cadence' ? '<span class="llm-line-key"><i class="llm-fit-key"></i>Fitted trend</span><span class="llm-line-key"><i class="llm-extension-key"></i>Extrapolation</span>' : ''}</div>${roleLegend}${key === 'cost' ? `<label class="llm-scenario">Token budget <select data-scenario>${data.scenarios.map((s) => `<option value="${s.id}" ${state.scenario === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>` : ''}<div class="llm-panels">${panels.map((p, i) => `<section class="llm-panel" data-panel="${i}" data-metric="${p.metric}" data-class-panel="${p.className || ''}" data-title="${esc(p.title)}">${p.title ? `<h4>${p.title}</h4>` : ''}</section>`).join('')}</div>`;
      const summaries = [],
        counts = [];
      panels.forEach((p, i) => {
        const host = fig.querySelector(`[data-panel="${i}"]`);
        const result =
          key === 'cadence'
            ? cadencePlot(host, p.points, p.events, {
                ...state,
                role: p.className,
              })
            : plot(
                host,
                p.points,
                p.metric,
                state,
                observationRange(pp, data.cutoff),
              );
        summaries.push(...result.summaries);
        counts.push(result);
      });
      if (key === 'cost') {
        const all = currentQuotes(data, state, 'cost');
        current = all.length;
        const allRoles = currentQuotes(data, { ...state, role: 'all' }, 'cost');
        const hiddenModels = new Set(
          allRoles
            .filter((p) => !matchesRole(p.productClass, state.role))
            .map((p) => p.modelId),
        ).size;
        const detail = document.createElement('details');
        detail.className = 'llm-snapshot';
        detail.open = false;
        detail.innerHTML = `<summary>Current quotes (${new Set(all.map((p) => p.modelId)).size} models)</summary>${hiddenModels ? '<p><button type="button" data-all-roles>Show all four roles</button></p>' : ''}<label class="llm-quote-search">Find a current model <input type="search" placeholder="Model or provider" aria-label="Find a current cost"></label><div class="llm-current-prices"></div>`;
        fig.append(detail);
        const host = detail.querySelector('.llm-current-prices');
        const rows = [...all].sort(
          (a, b) =>
            a.company.localeCompare(b.company) ||
            (b.releaseDate || '').localeCompare(a.releaseDate || '') ||
            a.model.localeCompare(b.model) ||
            a.metric.localeCompare(b.metric) ||
            a.provider.localeCompare(b.provider),
        );
        const showRows = () => {
          const query = detail
              .querySelector('input')
              .value.trim()
              .toLowerCase(),
            matched = rows.filter((p) =>
              (
                p.model +
                ' ' +
                p.company +
                ' ' +
                p.provider +
                ' ' +
                p.productClass
              )
                .toLowerCase()
                .includes(query),
            );
          host.innerHTML = matched.length
            ? ''
            : '<p>No matching current quotes. Check the role/company selection or the coverage audit.</p>';
          matched.forEach((p) => {
            const b = document.createElement('button');
            b.className = 'llm-snapshot-row';
            b.type = 'button';
            b.dataset.point = p.id;
            b.innerHTML = `<span><i style="--company-color:${data.colors[p.company]}"></i><strong>${esc(p.model)}</strong><small>${esc(names[p.metric])} · ${esc(p.provider)} · ${esc(p.productClass)} · ${esc(p.serviceTier || 'standard')} · ${esc(p.date)}${p.region ? ' · ' + esc(p.region) : ''}${p.availability ? ' · ' + esc(p.availability) : ''}${p.pricingBand ? ' · ' + esc(p.pricingBand) : ''}${p.pricingCondition ? ' · ' + esc(p.pricingCondition) : ''}${p.servedRelation ? ' · hosted derivative: ' + esc(p.endpoint) : ''}${p.documentationOnly ? ' · documentation only; callability unverified' : ''}</small></span><b>${fmt(p.value, p.metric)}</b>`;
            host.append(b);
            b.onpointerenter = () => show(b, p, []);
            b.onfocus = () => show(b, p, []);
            b.onclick = () => {
              pinned = true;
              show(b, p, []);
            };
            b.onpointerleave = () => {
              if (!pinned) tipTimer = setTimeout(hide, 180);
            };
          });
        };
        showRows();
        detail.querySelector('input').oninput = showRows;
        detail
          .querySelector('[data-all-roles]')
          ?.addEventListener('click', () => {
            state.role = 'all';
            change(fig);
          });
        const audit = document.createElement('p');
        audit.innerHTML = `<a href="${methodsHref('#pricing')}">Pricing data and methods →</a>`;
        detail.append(audit);
        const download = document.createElement('button');
        download.type = 'button';
        download.textContent = 'Download all matching current quotes';
        download.onclick = () => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(all, null, 2)], {
              type: 'application/json',
            }),
          );
          const a = document.createElement('a');
          a.href = url;
          a.download = 'tokenomics-current-' + key + '.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        detail.append(download);
      }
      inspector(fig);
      fig.querySelector('[data-scenario]')?.addEventListener('change', (e) => {
        state.scenario = e.target.value;
        change(fig);
      });
      fig.querySelectorAll('[data-company]').forEach(
        (input) =>
          (input.onchange = () => {
            state.companies = [
              ...fig.querySelectorAll('[data-company]:checked'),
            ].map((x) => x.dataset.company);
            change(fig);
          }),
      );
      fig.querySelector('[data-reset]').onclick = () => {
        Object.assign(state, initialState(key, data));
        change(fig);
      };
      fig.querySelectorAll(`[name="${key}-summary"]`).forEach(
        (input) =>
          (input.onchange = () => {
            state.cadenceMode = input.value;
            change(fig);
          }),
      );
      bindRoleControls(fig, state);
      fig.querySelector('[data-estimates]')?.addEventListener('change', (e) => {
        state.estimates = e.target.checked;
        change(fig);
      });
      stats[key] = {
        events: events.length,
        ranges: counts.filter((c) => c.range).map((c) => c.range),
        mode: state.cadenceMode,
        role: state.role,
        access: state.access,
        plotted: pp.length,
        panels: panels.length,
        current,
        quarterly: summaries.length,
        fits: counts.flatMap((c) =>
          (c.fits || []).map(({ valueAt, ...f }) => f),
        ),
        trendSegments: counts.reduce((n, c) => n + c.segments, 0),
        byMetric: Object.fromEntries(
          [...new Set(pp.map((p) => p.metric))].map((m) => [
            m,
            pp.filter((p) => p.metric === m).length,
          ]),
        ),
      };
    }
    function bindRoleControls(fig, state) {
      fig.querySelectorAll('.llm-role-tabs input').forEach((input) => {
        input.onchange = () => {
          state.role = input.value;
          change(fig);
        };
      });
    }
    function renderOverview(fig, state) {
      const fits = overviewFits(data, state).map((fit) => ({
        ...fit,
        ...overviewSeries[fit.kind === 'shared' ? 'shared' : fit.metric],
      }));
      const legend = fits
        .map(({ label, color, dash }) =>
          `<button type="button" data-overview-line><svg viewBox="0 0 22 8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke="${color}" stroke-width="2.5" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>${label}</button>`,
        )
        .join('');
      fig.classList.add('llm-timeline', 'llm-overview');
      fig.innerHTML = `<h3>Trends at a glance</h3><p>Each line is a fitted trend that starts at 1× and shows how far that metric moved across the labs.</p><div class="llm-cadence-primary">${roleControls(state, 'overview')}</div><div class="llm-legend">${legend}</div><div class="llm-panel"></div>`;
      const host = fig.querySelector('.llm-panel');
      const range = { start: data.windowStart, end: data.cutoff };
      renderTimeline(host, {
        points: [],
        fits,
        range,
        bindMarks,
        role: roleLabel(state.role),
        metric: 'overview',
        metricName: 'indexed trends',
        unit: 'Change from starting value · log scale',
        format: (value) => fmt(value, 'price_ratio'),
        indexed: true,
      });
      const targets = host.querySelectorAll('[data-fit-target]');
      fig.querySelectorAll('[data-overview-line]').forEach((button, i) => {
        button.onclick = () => targets[i].focus({ preventScroll: true });
      });
      bindRoleControls(fig, state);
      inspector(fig);
      stats.overview = {
        role: state.role,
        ranges: [range],
        fits: fits.map(({ valueAt, ...fit }) => fit),
      };
    }
    function render() {
      hide();
      figures.forEach(figure);
    }
    render();
    let resize,
      lastWidth = innerWidth;
    window.addEventListener('resize', () => {
      if (innerWidth === lastWidth) return;
      lastWidth = innerWidth;
      clearTimeout(resize);
      resize = setTimeout(render, 120);
    });
    const api = {
      data,
      state,
      stats,
      render,
      select: (metric, mode, key) =>
        observations(
          data,
          state[
            key ||
              {
                total: 'size',
                active: 'size',
                input_price: 'pricing',
                output_price: 'pricing',
                release_gap: 'cadence',
              }[metric] ||
              metric
          ],
          metric,
          mode,
        ),
    };
    window.llmEvolution = api;
    return api;
  }
  window.LLMPlotCore = { ...core, mount };
  async function boot() {
    const controls = document.querySelector('[data-llm-figure]');
    if (!controls || controls.dataset.mounted) return;
    controls.dataset.mounted = 'true';
    try {
      mount(await loadChartData());
    } catch (e) {
      controls.innerHTML = `<p role="alert">Chart data could not load: ${esc(e.message)}</p>`;
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('astro:page-load', boot);
})();
