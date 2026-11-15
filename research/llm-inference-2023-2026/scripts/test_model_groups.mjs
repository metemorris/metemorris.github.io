import fs from 'node:fs';
import assert from 'node:assert/strict';
import { modelGroups, renderModelGroups } from '../../../src/components/llm-evolution/model-groups.js';

const coverage = JSON.parse(fs.readFileSync(new URL('../data/article_metric_coverage.json', import.meta.url)));
const groups = modelGroups(coverage);
assert.deepEqual(groups.map(group => group.example.modelId), [
  'anthropic_claude_haiku_5_5',
  'anthropic_claude_sonnet_5_5',
  'anthropic_claude_opus_5_5',
  'anthropic_claude_fable_5_2',
]);
const ids = groups.flatMap(group => group.companies.flatMap(company => company.models.map(model => model.modelId)));
assert.equal(ids.length, new Set(ids).size, 'Each model identity appears once');
assert.deepEqual([...ids].sort(), coverage.models.map(model => model.modelId).sort(), 'All classified article models appear');
for (const group of groups) {
  const members = group.companies.flatMap(company => company.models);
  assert.equal(group.count, members.length);
  assert.ok(members.every(model => model.role === group.id));
  assert.ok(members.includes(group.example), 'Example belongs to the displayed class');
}

// Repeated source records cannot inflate lists, and outside companies stay out.
const repeated = modelGroups({ models: [...coverage.models, ...coverage.models, { modelId: 'outside', model: 'Outside', company: 'Other', role: 'economy' }] });
assert.deepEqual(repeated.map(group => group.count), groups.map(group => group.count));

// Classification changes move the record and replace an outdated example.
const original = groups[0].example;
const changed = modelGroups({ models: coverage.models.map(model => model.modelId === original.modelId ? { ...model, role: 'balanced' } : model) });
assert.equal(changed[0].count, groups[0].count - 1);
assert.equal(changed[1].count, groups[1].count + 1);
assert.notEqual(changed[0].example.modelId, original.modelId);
assert.ok(changed[1].companies.flatMap(company => company.models).some(model => model.modelId === original.modelId));

const html = renderModelGroups({ models: [{ ...original, modelId: 'fallback', model: '<script>unsafe</script>' }] });
assert.ok(!html.includes('<script>'));
assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
console.log(JSON.stringify({ status: 'passed', total: ids.length, groups: groups.map(({ id, count, example }) => ({ role: id, count, example: example.model })), checks: ['exact membership', 'unique model identities', 'scope', 'classification updates', 'valid examples', 'escaped model names'] }));
