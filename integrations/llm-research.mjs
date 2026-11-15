import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const research = path.join(root, 'research/llm-inference-2023-2026');
const downloadPath = '/__llm-research-download/';
const chartPath = '/__llm-research-data.json';
const recordsPath = '/__llm-research-records.json';
const publicDownloads = [
  'master_view.csv',
  'article_metric_coverage.csv',
  'article_launch_price_audit.csv',
];
const researchDownload = (name) => path.join(research, 'data', name);
const generateData = (...args) => execFileSync(
  'python3',
  [path.join(research, 'scripts/build_plot_data.py'), ...args],
  { cwd: root, maxBuffer: 15 * 1024 * 1024, encoding: 'utf8' },
);

function prepareResearchData() {
  const steps = [
    ['rebuild.py', [
      'models.csv', 'spec_history.csv', 'provider_offers.csv',
      'published_inference_performance.csv', 'master_view.csv',
    ]],
    ['build_article_audit.py', ['article_metric_coverage.csv', 'article_metric_coverage.json']],
    ['build_launch_price_audit.py', ['article_launch_price_audit.csv', 'article_launch_price_audit.json']],
  ];
  for (const [script, outputs] of steps) {
    if (outputs.every((name) => fs.existsSync(researchDownload(name)))) continue;
    execFileSync('python3', [path.join(research, 'scripts', script)], { cwd: root });
  }
}

// Use one dependency list for cache invalidation and live preview refreshes.
export function researchInputFiles(directory = research) {
  const audits = fs
    .readdirSync(path.join(directory, 'data'))
    .filter((name) =>
      /^article_(?:.*_metric_audit|launch_.*_review)\.json$/.test(name),
    )
    .sort()
    .map((name) => 'data/' + name);
  return [
    'scripts/build_plot_data.py',
    'scripts/build_article_audit.py',
    'scripts/build_launch_price_audit.py',
    'scripts/launch_policy.py',
    'scripts/rebuild.py',
    'data/company_regions.json',
    'data/models.csv',
    'data/spec_history.csv',
    'data/provider_offers.csv',
    'data/published_inference_performance.csv',
    'data/research_inputs.json',
    ...audits,
  ];
}

export default function llmResearch({ publish = false } = {}) {
  let cache = null,
    cacheKey = null,
    timer = null,
    jsonDirty = false;
  const load = () => {
    const key = researchInputFiles()
      .map((f) => f + ':' + fs.statSync(path.join(research, f)).mtimeMs)
      .join(':');
    if (cache && cacheKey === key) return cache;
    cache = generateData();
    cacheKey = key;
    return cache;
  };
  return {
    name: 'llm-research',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, updateConfig, addWatchFile }) => {
        prepareResearchData();
        if (command === 'dev') {
          addWatchFile(new URL(import.meta.url));
          updateConfig({
            vite: {
              optimizeDeps: {
                include: ['d3-axis', 'd3-scale', 'd3-selection', 'd3-time', 'd3-time-format'],
              },
            },
          });
          injectRoute({
            pattern: '/__drafts/tokenomics',
            entrypoint: path.join(root, 'src/drafts/tokenomics-preview.astro'),
          });
          injectRoute({
            pattern: '/__drafts/tokenomics-data',
            entrypoint: path.join(root, 'src/drafts/tokenomics-data.astro'),
          });
        }
      },
      'astro:build:done': ({ dir }) => {
        if (!publish) return;
        const output = fileURLToPath(dir);
        const downloads = path.join(output, downloadPath.slice(1));
        fs.mkdirSync(downloads, { recursive: true });
        fs.writeFileSync(path.join(output, chartPath.slice(1)), load());
        fs.writeFileSync(path.join(output, recordsPath.slice(1)), generateData('--records'));
        for (const name of publicDownloads) {
          fs.copyFileSync(researchDownload(name), path.join(downloads, name));
        }
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const route = req.url?.split('?')[0];
          if (route?.startsWith(downloadPath)) {
            const name = route.slice(downloadPath.length);
            const file = publicDownloads.includes(name) && researchDownload(name);
            if (!file) {
              res.statusCode = 404;
              return res.end('Unknown research download');
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(fs.readFileSync(file));
          }
          if (route === recordsPath) {
            try {
              load();
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              return res.end(generateData('--records'));
            } catch (e) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: String(e.message) }));
            }
          }
          if (route !== chartPath) return next();
          try {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(load());
          } catch (e) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: 'Research validation failed',
                detail: String(e.message),
              }),
            );
          }
        });
        server.watcher.add([
          path.join(research, 'data'),
          path.join(research, 'scripts'),
        ]);
        server.watcher.on('all', (event, file) => {
          if (!['add', 'change', 'unlink'].includes(event)) return;
          const relative = path
            .relative(research, file)
            .split(path.sep)
            .join('/');
          const isAudit =
            /^data\/article_(?:.*_metric_audit|launch_.*_review)\.json$/.test(
              relative,
            );
          if (!isAudit && !researchInputFiles().includes(relative)) return;
          jsonDirty ||= file.endsWith('research_inputs.json');
          clearTimeout(timer);
          timer = setTimeout(() => {
            try {
              if (jsonDirty) {
                jsonDirty = false;
                execFileSync(
                  'python3',
                  [path.join(research, 'scripts/rebuild.py')],
                  { cwd: root },
                );
              }
              cache = null;
              load();
              server.ws.send({ type: 'full-reload' });
            } catch (e) {
              console.error('[llm-research]', e.message);
              cache = null;
              server.ws.send({ type: 'full-reload' });
            }
          }, 180);
        });
      },
    },
  };
}
