import { chosen as companies } from './chart-core.js';
import { esc as escape } from './chart-format.js';
const roles = [
  {
    id: 'economy',
    name: 'Economy',
    description:
      'Models built for low cost and fast responses, especially when an application needs to make a lot of calls.',
    exampleId: 'anthropic_claude_haiku_5_5',
    exampleLabel: 'Claude Haiku 5.5',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description:
      'Everyday models that aim for a practical mix of capability, speed, and cost.',
    exampleId: 'anthropic_claude_sonnet_5_5',
    exampleLabel: 'Claude Sonnet 5.5',
  },
  {
    id: 'flagship',
    name: 'Flagship',
    description:
      'A company’s main high-capability models, intended for more demanding workloads.',
    exampleId: 'anthropic_claude_opus_5_5',
    exampleLabel: 'Claude Opus 5.5',
  },
  {
    id: 'premium',
    name: 'Premium',
    description:
      'Models positioned above the regular flagship, with an emphasis on pushing capability further.',
    exampleId: 'anthropic_claude_fable_5_2',
    exampleLabel: 'Claude Fable 5.2',
  },
];

export function modelGroups(coverage) {
  const models = [
    ...new Map(
      (coverage?.models || [])
        .filter((model) => model.modelId && companies.includes(model.company))
        .map((model) => [model.modelId, model]),
    ).values(),
  ];
  return roles.map((role) => {
    const members = models.filter((model) => model.role === role.id);
    return {
      ...role,
      count: members.length,
      example:
        members.find((model) => model.modelId === role.exampleId) || members[0],
      companies: companies
        .map((company) => ({
          name: company,
          models: members
            .filter((model) => model.company === company)
            .sort((a, b) => a.model.localeCompare(b.model)),
        }))
        .filter((company) => company.models.length),
    };
  });
}

export function renderModelGroups(coverage) {
  return modelGroups(coverage)
    .map((role) => {
      const exampleName = role.example?.modelId === role.exampleId
        ? role.exampleLabel
        : role.example?.model || 'None currently classified';
      return `<li data-model-role="${role.id}">
    <p><strong>${role.name}:</strong> ${role.description}</p>
    <p class="model-role-example">Example: ${escape(exampleName)}</p>
    <details>
      <summary>View all ${role.count} models</summary>
      <div class="model-role-scroll" tabindex="0" role="region" aria-label="${role.name} models">
        ${role.companies.map((company) => `<section><h3>${escape(company.name)}</h3><ul>${company.models.map((model) => `<li data-model-id="${escape(model.modelId)}">${escape(model.model)}</li>`).join('')}</ul></section>`).join('')}
      </div>
    </details>
  </li>`;
    })
    .join('');
}
