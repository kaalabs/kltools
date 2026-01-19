import {Flags} from "@oclif/core";
import BaseCommand from "../../base-command.js";
import {filterProviders, paginate, providerSummaries, sortProviders} from "../../lib/data.js";
import {renderTable, truncate} from "../../lib/format.js";

export default class ProvidersList extends BaseCommand {
  static summary = "List providers from models.dev";

  static flags = {
    ...BaseCommand.baseFlags,
    q: Flags.string({
      summary: "Filter by provider id or name",
    }),
    sort: Flags.string({
      summary: "Sort by id, name, or models",
      options: ["id", "name", "models"],
      default: "id",
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
      summary: "Show more columns",
    }),
  };

  async run() {
    const {flags} = await this.parse(ProvidersList);
    const apiData = await this.loadApi(flags);

    let providers = providerSummaries(apiData);
    providers = filterProviders(providers, {q: flags.q});
    providers = sortProviders(providers, {sort: flags.sort});
    providers = paginate(providers, {offset: flags.offset, limit: flags.limit});

    if (this.isJsonMode(flags)) {
      return this.outputJson(flags, providers);
    }

    const rows = providers.map((provider) => [
      provider.id,
      String(provider.modelCount),
      truncate(provider.name, 34),
      flags.details ? truncate(provider.npm ?? "-", 28) : undefined,
    ]);
    const headers = flags.details ? ["ID", "Models", "Name", "NPM"] : ["ID", "Models", "Name"];
    const finalRows = flags.details ? rows : rows.map((row) => row.slice(0, 3));

    this.log(renderTable(headers, finalRows));
  }
}
