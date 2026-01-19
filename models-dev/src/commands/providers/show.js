import {Args, Flags} from "@oclif/core";
import BaseCommand from "../../base-command.js";
import {closestMatches, filterModels, getContextLimit, getOutputLimit, paginate, sortModels} from "../../lib/data.js";
import {formatInteger, renderTable, truncate} from "../../lib/format.js";

export default class ProvidersShow extends BaseCommand {
  static summary = "Show details for a provider and its models";

  static args = [
    Args.string({
      name: "providerId",
      required: true,
      description: "Provider id",
    }),
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    q: Flags.string({
      summary: "Filter models by id, name, or family",
    }),
    limit: Flags.integer({
      summary: "Limit results",
    }),
    offset: Flags.integer({
      summary: "Skip first N results",
      default: 0,
    }),
    details: Flags.boolean({
      char: "d",
      summary: "Include full model details",
    }),
  };

  async run() {
    const {args, flags} = await this.parse(ProvidersShow);
    const apiData = await this.loadApi(flags);

    const provider = apiData[args.providerId];
    if (!provider) {
      const matches = closestMatches(args.providerId, Object.keys(apiData));
      this.error(`Unknown provider: ${args.providerId}`, matches.length ? {suggestions: matches} : undefined);
      return;
    }

    const models = Object.entries(provider.models ?? {}).map(([modelId, model]) => ({
      providerId: args.providerId,
      provider,
      modelId,
      model,
    }));
    const filtered = filterModels(models, {
      provider: [args.providerId],
      q: flags.q,
    });
    const paged = paginate(sortModels(filtered, {sort: "ref"}), {offset: flags.offset, limit: flags.limit});

    if (this.isJsonMode(flags)) {
      if (flags.details) {
        const providerMeta = {...provider};
        delete providerMeta.models;
        const payload = {
          provider: providerMeta,
          models: Object.fromEntries(paged.map((m) => [m.modelId, m.model])),
        };
        return this.outputJson(flags, payload);
      }

      const providerMeta = {...provider};
      delete providerMeta.models;
      const payload = {
        provider: providerMeta,
        models: paged.map((m) => ({id: m.modelId, name: m.model?.name, family: m.model?.family})),
      };
      return this.outputJson(flags, payload);
    }

    this.log(`${provider.name} (${provider.id})`);
    if (provider.npm) this.log(`npm: ${provider.npm}`);
    if (provider.api) this.log(`api: ${provider.api}`);
    if (provider.doc) this.log(`doc: ${provider.doc}`);
    if (Array.isArray(provider.env) && provider.env.length) this.log(`env: ${provider.env.join(", ")}`);
    this.log(`models: ${Object.keys(provider.models ?? {}).length}`);
    this.log("");

    const rows = paged.map((m) => [
      m.modelId,
      truncate(m.model?.name ?? "-", 44),
      truncate(m.model?.family ?? "-", 18),
      formatInteger(getContextLimit(m.model)),
      formatInteger(getOutputLimit(m.model)),
    ]);
    this.log(renderTable(["Model ID", "Name", "Family", "Ctx", "Out"], rows));
  }
}
