// Shared labels, numeric formatting, and safe HTML text.
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const names = {
  release_gap: 'Days between releases',
  total: 'Total parameters',
  active: 'Active parameters',
  input: 'Prompt capacity',
  context: 'Context window',
  output: 'Maximum output',
  input_price: 'Input price',
  output_price: 'Output price',
  price_ratio: 'Output / input price',
  cost: 'Cost per request',
};
export const units = {
  release_gap: 'days',
  total: 'billion parameters',
  active: 'billion parameters',
  input: 'tokens',
  context: 'tokens',
  output: 'tokens',
  input_price: 'USD / million input tokens',
  output_price: 'USD / million output tokens',
  price_ratio: '',
  cost: 'USD / request',
};
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export const fmt = (n, m) =>
  m === 'price_ratio'
    ? Number(n.toPrecision(3)).toLocaleString('en-US') + '×'
    : ['total', 'active'].includes(m)
      ? Number(n.toPrecision(3)).toLocaleString('en-US')
      : m.includes('price') || m === 'cost'
        ? '$' +
          Number(n.toPrecision(3)).toLocaleString('en-US', {
            maximumFractionDigits: 5,
          })
        : n >= 1e6
          ? Number((n / 1e6).toPrecision(3)) + 'M'
          : n >= 1000
            ? Number((n / 1000).toPrecision(3)) + 'K'
            : Number(n.toPrecision(3)).toLocaleString('en-US');
export const companyLabel = (c) => (c === 'Alibaba' ? 'Alibaba / Qwen' : c);
