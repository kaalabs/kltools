import fs from "node:fs/promises";
import path from "node:path";
import {Args, Flags} from "@oclif/core";
import BaseCommand from "../../base-command.js";
import {closestMatches, modelRef} from "../../lib/data.js";

const DEFAULT_CONFIG_PATH = "config.toml";

const PROVIDER_DEFAULTS = {
  vercel: {
    name: "Vercel AI Gateway",
    api_key_env: "VERCEL_AI_GATEWAY_API_KEY",
    base_url: "https://ai-gateway.vercel.sh/v3/ai",
  },
  opencode: {
    name: "OpenCode Zen",
    api_key_env: "OPENCODE_API_KEY",
    base_url: "https://opencode.ai/zen/v1",
  },
  openai: {
    name: "OpenAI",
    api_key_env: "OPENAI_API_KEY",
    base_url: "https://api.openai.com/v1",
  },
  anthropic: {
    name: "Anthropic",
    api_key_env: "ANTHROPIC_API_KEY",
    base_url: "https://api.anthropic.com",
  },
};

function parseRef(input) {
  const idx = input.indexOf("/");
  if (idx === -1) return {modelId: input};
  return {providerId: input.slice(0, idx), modelId: input.slice(idx + 1)};
}

function resolveModel(apiData, input, command) {
  const {providerId, modelId} = parseRef(input);
  if (!modelId) {
    command.error(`Missing model id in ref: ${input}`);
    return null;
  }

  if (providerId) {
    const provider = apiData[providerId];
    if (!provider) {
      const matches = closestMatches(providerId, Object.keys(apiData));
      command.error(`Unknown provider: ${providerId}`, matches.length ? {suggestions: matches} : undefined);
      return null;
    }

    const model = provider.models?.[modelId];
    if (!model) {
      const matches = closestMatches(modelId, Object.keys(provider.models ?? {}));
      const suggestions = matches.map((m) => modelRef(providerId, m));
      command.error(
        `Unknown model: ${modelRef(providerId, modelId)}`,
        suggestions.length ? {suggestions} : undefined,
      );
      return null;
    }

    return {providerId, provider, modelId, model};
  }

  const matches = [];
  for (const [pid, provider] of Object.entries(apiData)) {
    const model = provider.models?.[modelId];
    if (model) matches.push({providerId: pid, provider, modelId, model});
  }

  if (matches.length === 0) {
    command.error(`Unknown model id: ${modelId}`);
    return null;
  }

  if (matches.length > 1) {
    const refs = matches.slice(0, 20).map((m) => modelRef(m.providerId, m.modelId));
    const message = [
      "Model id is ambiguous; specify provider:",
      ...refs,
      matches.length > 20 ? `...and ${matches.length - 20} more` : null,
    ]
      .filter(Boolean)
      .join("\n");
    command.error(message);
    return null;
  }

  return matches[0];
}

function tomlString(value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\"/g, '\\"');
  return `"${escaped}"`;
}

function listProviderSections(text) {
  const sections = [];
  const regex = /^\[providers\.([^\.\]]+)\]/gm;
  let match;
  while ((match = regex.exec(text))) {
    sections.push({id: match[1], start: match.index});
  }
  for (let i = 0; i < sections.length; i += 1) {
    sections[i].end = i + 1 < sections.length ? sections[i + 1].start : text.length;
  }
  return sections;
}

function extractProviderName(sectionText) {
  const match = sectionText.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function extractModelIds(sectionText) {
  const ids = new Set();
  const regex = /^\s*id\s*=\s*"([^"]+)"/gm;
  let match;
  while ((match = regex.exec(sectionText))) {
    ids.add(match[1]);
  }
  return ids;
}

function extractUniformType(sectionText) {
  const types = new Set();
  const regex = /^\s*type\s*=\s*"([^"]+)"/gm;
  let match;
  while ((match = regex.exec(sectionText))) {
    types.add(match[1]);
  }
  if (types.size === 1) return [...types][0];
  return null;
}

function extractCapabilityDefaults(sectionText) {
  const keys = ["tools", "temperature", "attachments", "structured_output"];
  const defaults = {};
  for (const key of keys) {
    const values = new Set();
    const regex = new RegExp(`^\\s*${key}\\s*=\\s*(true|false)`, "gm");
    let match;
    while ((match = regex.exec(sectionText))) {
      values.add(match[1] === "true");
    }
    if (values.size === 1) defaults[key] = [...values][0];
  }
  return defaults;
}

function ensureBlankLine(text) {
  if (text.endsWith("\n\n")) return text;
  if (text.endsWith("\n")) return `${text}\n`;
  return `${text}\n\n`;
}

function buildModelBlock({providerId, modelType, modelId, label, description, providerModelId, capabilities}) {
  const lines = [];
  lines.push(`[[providers.${providerId}.models]]`);
  lines.push(`type = ${tomlString(modelType)}`);
  lines.push(`id = ${tomlString(modelId)}`);
  lines.push(`label = ${tomlString(label)}`);
  lines.push(`description = ${tomlString(description)}`);
  if (providerModelId) {
    lines.push(`provider_model_id = ${tomlString(providerModelId)}`);
  }
  lines.push(`[providers.${providerId}.models.capabilities]`);
  lines.push(`tools = ${capabilities.tools}`);
  lines.push(`temperature = ${capabilities.temperature}`);
  lines.push(`attachments = ${capabilities.attachments}`);
  lines.push(`structured_output = ${capabilities.structured_output}`);
  return lines.join("\n");
}

function buildProviderBlock({providerId, providerConfig, modelBlock}) {
  const lines = [];
  lines.push(`[providers.${providerId}]`);
  lines.push(`name = ${tomlString(providerConfig.name)}`);
  lines.push(`api_key_env = ${tomlString(providerConfig.api_key_env)}`);
  lines.push(`base_url = ${tomlString(providerConfig.base_url)}`);
  lines.push(`default_model_id = ${tomlString(providerConfig.default_model_id)}`);
  lines.push("");
  lines.push(modelBlock);
  return lines.join("\n");
}

function inferDescription({modelId, providerId, providerName, apiData}) {
  if (modelId.includes("/")) {
    const prefix = modelId.split("/")[0];
    const provider = apiData[prefix];
    return provider?.name ?? prefix;
  }
  return providerName ?? providerId;
}

function inferModelType({providerId, model, modelId, provider, providerSectionText}) {
  const uniform = providerSectionText ? extractUniformType(providerSectionText) : null;
  if (uniform) return uniform;

  if (providerId === "vercel") return "vercel_ai_gateway";
  if (providerId === "openai") return "openai_responses";
  if (providerId === "anthropic") return "anthropic_messages";

  const modelProviderNpm = model?.provider?.npm ?? null;
  if (modelProviderNpm?.includes("anthropic")) return "anthropic_messages";
  if (modelProviderNpm?.includes("openai")) return "openai_responses";

  const providerNpm = provider?.npm ?? null;
  if (providerNpm?.includes("anthropic")) return "anthropic_messages";
  if (providerNpm?.includes("openai")) return "openai_responses";

  const family = String(model?.family ?? "").toLowerCase();
  const lowerId = String(modelId ?? "").toLowerCase();
  if (family.startsWith("claude") || lowerId.startsWith("claude")) return "anthropic_messages";
  if (family.startsWith("gpt") || lowerId.startsWith("gpt") || family.startsWith("o")) return "openai_responses";

  return null;
}

export default class ModelsAdd extends BaseCommand {
  static summary = "Add a model to config.toml";

  static args = [
    Args.string({
      name: "ref",
      required: true,
      description: "providerId/modelId or modelId",
    }),
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    config: Flags.string({
      summary: "Path to config.toml",
      default: DEFAULT_CONFIG_PATH,
    }),
    type: Flags.string({
      summary: "Model type override (e.g. vercel_ai_gateway, openai_responses, anthropic_messages)",
    }),
    label: Flags.string({
      summary: "Model label override",
    }),
    description: Flags.string({
      summary: "Model description override",
    }),
    "provider-name": Flags.string({
      summary: "Provider name override when creating a new provider entry",
    }),
    "provider-base-url": Flags.string({
      summary: "Provider base URL when creating a new provider entry",
    }),
    "provider-api-key-env": Flags.string({
      summary: "Provider API key env var when creating a new provider entry",
    }),
  };

  async run() {
    const {args, flags} = await this.parse(ModelsAdd);
    const apiData = await this.loadApi(flags);

    const match = resolveModel(apiData, args.ref, this);
    if (!match) return;

    const {providerId, provider, modelId, model} = match;
    const configPath = path.resolve(flags.config);

    let configText;
    try {
      configText = await fs.readFile(configPath, "utf8");
    } catch (error) {
      this.error(`Failed to read config: ${configPath} (${error?.message ?? error})`);
      return;
    }

    const sections = listProviderSections(configText);
    const providerSection = sections.find((section) => section.id === providerId) ?? null;
    const providerSectionText = providerSection
      ? configText.slice(providerSection.start, providerSection.end)
      : null;

    const configModelId = modelId.includes("/") ? modelId : `${providerId}/${modelId}`;
    const providerModelId = configModelId === modelId ? null : modelId;

    const existingIds = providerSectionText ? extractModelIds(providerSectionText) : new Set();
    if (existingIds.has(configModelId)) {
      const payload = {
        status: "exists",
        configPath,
        providerId,
        modelId: configModelId,
      };
      if (this.isJsonMode(flags)) return this.outputJson(flags, payload);
      this.log(`Model already exists: ${configModelId}`);
      return;
    }

    const providerName = providerSectionText
      ? extractProviderName(providerSectionText)
      : flags["provider-name"] ?? PROVIDER_DEFAULTS[providerId]?.name ?? provider?.name ?? providerId;

    const modelType =
      flags.type ??
      inferModelType({providerId, model, modelId, provider, providerSectionText}) ??
      null;
    if (!modelType) {
      this.error(`Unable to infer model type for ${modelRef(providerId, modelId)}; pass --type.`);
      return;
    }

    const capabilityDefaults = providerSectionText ? extractCapabilityDefaults(providerSectionText) : {};
    const capabilities = {
      tools: capabilityDefaults.tools ?? Boolean(model?.tool_call),
      temperature: capabilityDefaults.temperature ?? Boolean(model?.temperature),
      attachments: capabilityDefaults.attachments ?? Boolean(model?.attachment),
      structured_output: capabilityDefaults.structured_output ?? Boolean(model?.structured_output),
    };

    const label = flags.label ?? model?.name ?? modelId;
    const description = flags.description ??
      inferDescription({modelId, providerId, providerName, apiData});

    const modelBlock = buildModelBlock({
      providerId,
      modelType,
      modelId: configModelId,
      label,
      description,
      providerModelId,
      capabilities,
    });

    let updatedText = configText;
    let providerAdded = false;

    if (providerSection) {
      const before = updatedText.slice(0, providerSection.end);
      const after = updatedText.slice(providerSection.end);
      const separator = after.length ? "\n\n" : "\n";
      updatedText = `${ensureBlankLine(before)}${modelBlock}${separator}${after}`;
    } else {
      const providerDefaults = PROVIDER_DEFAULTS[providerId] ?? {};
      const providerConfig = {
        name: flags["provider-name"] ?? providerDefaults.name ?? provider?.name ?? providerId,
        api_key_env: flags["provider-api-key-env"] ?? providerDefaults.api_key_env ?? provider?.env?.[0] ?? null,
        base_url: flags["provider-base-url"] ?? providerDefaults.base_url ?? provider?.api ?? null,
        default_model_id: configModelId,
      };

      const missing = [];
      if (!providerConfig.api_key_env) missing.push("--provider-api-key-env");
      if (!providerConfig.base_url) missing.push("--provider-base-url");
      if (missing.length) {
        this.error(
          `Missing provider details for ${providerId}; provide ${missing.join(" and ")}.`,
        );
        return;
      }

      const providerBlock = buildProviderBlock({
        providerId,
        providerConfig,
        modelBlock,
      });
      updatedText = `${ensureBlankLine(updatedText)}${providerBlock}\n`;
      providerAdded = true;
    }

    await fs.writeFile(configPath, updatedText, "utf8");

    const result = {
      status: "added",
      configPath,
      providerId,
      providerAdded,
      modelId: configModelId,
      providerModelId: providerModelId ?? null,
      type: modelType,
    };

    if (this.isJsonMode(flags)) return this.outputJson(flags, result);
    this.log(`Added ${configModelId} to ${configPath}`);
    if (providerAdded) this.log(`Added provider ${providerId}`);
  }
}
