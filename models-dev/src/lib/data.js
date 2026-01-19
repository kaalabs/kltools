function toLower(value) {
  return typeof value === "string" ? value.toLowerCase() : value;
}

function normalizeList(value) {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((entry) => String(entry).trim())
    .filter((entry) => entry !== "");
}

export function modelRef(providerId, modelId) {
  return `${providerId}/${modelId}`;
}

export function getContextLimit(model) {
  const limit = model?.limit;
  const value = limit?.context ?? limit?.input;
  return typeof value === "number" ? value : null;
}

export function getOutputLimit(model) {
  const limit = model?.limit;
  const value = limit?.output;
  return typeof value === "number" ? value : null;
}

export function getNumericCost(model, key) {
  const value = model?.cost?.[key];
  return typeof value === "number" ? value : null;
}

export function providerSummaries(apiData) {
  return Object.values(apiData).map((provider) => ({
    id: provider.id,
    name: provider.name,
    npm: provider.npm,
    api: provider.api,
    doc: provider.doc,
    env: provider.env,
    modelCount: Object.keys(provider.models ?? {}).length,
  }));
}

export function filterProviders(providers, {q}) {
  if (!q) return providers;
  const needle = q.toLowerCase();
  return providers.filter((provider) => {
    return String(provider.id).toLowerCase().includes(needle) || String(provider.name).toLowerCase().includes(needle);
  });
}

export function sortProviders(providers, {sort}) {
  const by = sort ?? "id";
  const sorted = [...providers];
  if (by === "name") sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  else if (by === "models") {
    sorted.sort((a, b) => (b.modelCount ?? 0) - (a.modelCount ?? 0) || String(a.id).localeCompare(String(b.id)));
  } else {
    sorted.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return sorted;
}

export function paginate(items, {offset, limit}) {
  const start = Math.max(0, offset ?? 0);
  const end = limit == null ? undefined : start + Math.max(0, limit);
  return items.slice(start, end);
}

export function allModels(apiData) {
  const out = [];
  for (const [providerId, provider] of Object.entries(apiData)) {
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      out.push({providerId, provider, modelId, model});
    }
  }
  return out;
}

export function filterModels(models, filters) {
  let out = models;

  const providers = normalizeList(filters.provider).map(toLower);
  if (providers.length) {
    const set = new Set(providers);
    out = out.filter((m) => set.has(String(m.providerId).toLowerCase()));
  }

  const families = normalizeList(filters.family).map(toLower);
  if (families.length) {
    const set = new Set(families);
    out = out.filter((m) => set.has(String(m.model?.family ?? "").toLowerCase()));
  }

  const statuses = normalizeList(filters.status).map(toLower);
  if (statuses.length) {
    const set = new Set(statuses);
    out = out.filter((m) => set.has(String(m.model?.status ?? "").toLowerCase()));
  }

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    out = out.filter((m) => {
      const ref = modelRef(m.providerId, m.modelId);
      return (
        ref.toLowerCase().includes(needle) ||
        String(m.modelId).toLowerCase().includes(needle) ||
        String(m.model?.name ?? "").toLowerCase().includes(needle) ||
        String(m.model?.family ?? "").toLowerCase().includes(needle)
      );
    });
  }

  const boolFilters = [
    ["reasoning", "reasoning"],
    ["toolCall", "tool_call"],
    ["attachment", "attachment"],
    ["structuredOutput", "structured_output"],
    ["temperature", "temperature"],
    ["openWeights", "open_weights"],
    ["interleaved", "interleaved"],
  ];
  for (const [filterKey, modelKey] of boolFilters) {
    if (filters[filterKey]) {
      out = out.filter((m) => Boolean(m.model?.[modelKey]));
    }
  }

  const requiredInputs = normalizeList(filters.input).map(toLower);
  if (requiredInputs.length) {
    out = out.filter((m) => {
      const inputs = Array.isArray(m.model?.modalities?.input) ? m.model.modalities.input.map(toLower) : [];
      return requiredInputs.every((req) => inputs.includes(req));
    });
  }

  const requiredOutputs = normalizeList(filters.output).map(toLower);
  if (requiredOutputs.length) {
    out = out.filter((m) => {
      const outputs = Array.isArray(m.model?.modalities?.output) ? m.model.modalities.output.map(toLower) : [];
      return requiredOutputs.every((req) => outputs.includes(req));
    });
  }

  if (typeof filters.minContext === "number") {
    out = out.filter((m) => {
      const ctx = getContextLimit(m.model);
      return ctx != null && ctx >= filters.minContext;
    });
  }

  if (typeof filters.minOutput === "number") {
    out = out.filter((m) => {
      const outLimit = getOutputLimit(m.model);
      return outLimit != null && outLimit >= filters.minOutput;
    });
  }

  return out;
}

export function sortModels(models, {sort, desc}) {
  const by = sort ?? "ref";
  const direction = desc ? -1 : 1;
  const sorted = [...models];

  const compareString = (a, b) => String(a).localeCompare(String(b));
  const compareNumber = (a, b) => (a ?? -Infinity) - (b ?? -Infinity);

  sorted.sort((a, b) => {
    let cmp = 0;
    if (by === "name") cmp = compareString(a.model?.name ?? "", b.model?.name ?? "");
    else if (by === "context") cmp = compareNumber(getContextLimit(a.model), getContextLimit(b.model));
    else if (by === "output") cmp = compareNumber(getOutputLimit(a.model), getOutputLimit(b.model));
    else cmp = compareString(modelRef(a.providerId, a.modelId), modelRef(b.providerId, b.modelId));
    if (cmp === 0) cmp = compareString(modelRef(a.providerId, a.modelId), modelRef(b.providerId, b.modelId));
    return cmp * direction;
  });

  return sorted;
}

export function toModelSummary({providerId, provider, modelId, model}) {
  return {
    providerId,
    providerName: provider?.name,
    ref: modelRef(providerId, modelId),
    modelId,
    name: model?.name,
    family: model?.family,
    status: model?.status ?? null,
    openWeights: model?.open_weights ?? null,
    reasoning: model?.reasoning ?? null,
    toolCall: model?.tool_call ?? null,
    attachment: model?.attachment ?? null,
    structuredOutput: model?.structured_output ?? null,
    temperature: model?.temperature ?? null,
    interleaved: model?.interleaved ?? null,
    modalities: model?.modalities ?? null,
    limit: model?.limit ?? null,
    cost: model?.cost ?? null,
    knowledge: model?.knowledge ?? null,
    releaseDate: model?.release_date ?? null,
    lastUpdated: model?.last_updated ?? null,
  };
}

export function toModelDetails({providerId, provider, modelId, model}) {
  return {
    provider: {
      id: providerId,
      name: provider?.name,
      npm: provider?.npm,
      api: provider?.api,
      doc: provider?.doc,
      env: provider?.env,
    },
    modelId,
    ref: modelRef(providerId, modelId),
    model,
  };
}

export function closestMatches(input, candidates, {limit = 5} = {}) {
  const q = input.toLowerCase();
  const scored = candidates
    .map((candidate) => {
      const s = candidate.toLowerCase();
      let score = 0;
      if (s === q) score += 100;
      if (s.startsWith(q)) score += 10;
      if (s.includes(q)) score += 3;
      score -= Math.abs(s.length - q.length) * 0.01;
      return {candidate, score};
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
  return scored.filter((value, index, arr) => arr.indexOf(value) === index);
}
