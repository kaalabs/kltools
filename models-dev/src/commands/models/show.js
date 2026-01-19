import {Args} from "@oclif/core";
import BaseCommand from "../../base-command.js";
import {
  closestMatches,
  getContextLimit,
  getNumericCost,
  getOutputLimit,
  modelRef,
  toModelDetails,
} from "../../lib/data.js";
import {formatCost, formatInteger, modelFeaturesShort, modalitiesShort} from "../../lib/format.js";

export default class ModelsShow extends BaseCommand {
  static summary = "Show details for a model";

  static args = [
    Args.string({
      name: "ref",
      required: true,
      description: "providerId/modelId or modelId",
    }),
  ];

  async run() {
    const {args, flags} = await this.parse(ModelsShow);
    const apiData = await this.loadApi(flags);

    const input = args.ref;
    const idx = input.indexOf("/");
    let providerId;
    let modelId;
    if (idx !== -1) {
      providerId = input.slice(0, idx);
      modelId = input.slice(idx + 1);
    } else {
      modelId = input;
    }

    let match;
    if (providerId) {
      const provider = apiData[providerId];
      if (!provider) {
        const matches = closestMatches(providerId, Object.keys(apiData));
        this.error(`Unknown provider: ${providerId}`, matches.length ? {suggestions: matches} : undefined);
        return;
      }

      const model = provider.models?.[modelId];
      if (!model) {
        const matches = closestMatches(modelId, Object.keys(provider.models ?? {}));
        const suggestions = matches.map((m) => modelRef(providerId, m));
        this.error(
          `Unknown model: ${modelRef(providerId, modelId)}`,
          suggestions.length ? {suggestions} : undefined,
        );
        return;
      }
      match = {providerId, provider, modelId, model};
    } else {
      const matches = [];
      for (const [pid, provider] of Object.entries(apiData)) {
        const model = provider.models?.[modelId];
        if (model) matches.push({providerId: pid, provider, modelId, model});
      }
      if (matches.length === 0) {
        this.error(`Unknown model id: ${modelId}`);
        return;
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
        this.error(message);
        return;
      }
      match = matches[0];
    }

    if (this.isJsonMode(flags)) {
      return this.outputJson(flags, toModelDetails(match));
    }

    this.log(modelRef(match.providerId, match.modelId));
    this.log(match.model?.name ?? "-");
    this.log(`provider: ${match.provider?.name ?? match.providerId}`);
    this.log(`family: ${match.model?.family ?? "-"}`);
    if (match.model?.status) this.log(`status: ${match.model.status}`);
    this.log(`modalities: ${modalitiesShort(match.model)}`);
    this.log(`limits: ctx=${formatInteger(getContextLimit(match.model))} out=${formatInteger(getOutputLimit(match.model))}`);
    this.log(`cost: in=${formatCost(getNumericCost(match.model, "input"))} out=${formatCost(getNumericCost(match.model, "output"))}`);
    this.log(`flags: ${modelFeaturesShort(match.model)}`);
    this.log("");
    this.log(JSON.stringify(match.model, null, 2));
  }
}
