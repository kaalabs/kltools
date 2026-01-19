import {Flags} from "@oclif/core";
import BaseCommand from "../../base-command.js";
import {
  allModels,
  filterModels,
  getContextLimit,
  getNumericCost,
  getOutputLimit,
  modelRef,
  paginate,
  sortModels,
  toModelDetails,
  toModelSummary,
} from "../../lib/data.js";
import {formatCost, formatInteger, modelFeaturesShort, modalitiesShort, renderTable, truncate} from "../../lib/format.js";

export default class ModelsList extends BaseCommand {
  static summary = "List models from models.dev";
  static args = [];

  static flags = {
    ...BaseCommand.baseFlags,
    provider: Flags.string({
      char: "p",
      summary: "Provider id (repeatable, comma-separated)",
      multiple: true,
      delimiter: ",",
    }),
    q: Flags.string({
      summary: "Search in model id, name, family, or ref",
    }),
    family: Flags.string({
      summary: "Model family (repeatable, comma-separated)",
      multiple: true,
      delimiter: ",",
    }),
    status: Flags.string({
      summary: "Model status (repeatable, comma-separated)",
      multiple: true,
      delimiter: ",",
    }),
    reasoning: Flags.boolean({
      summary: "Only models with reasoning",
    }),
    "tool-call": Flags.boolean({
      summary: "Only models with tool calls",
    }),
    attachment: Flags.boolean({
      summary: "Only models with attachments",
    }),
    "structured-output": Flags.boolean({
      summary: "Only models with structured output",
    }),
    temperature: Flags.boolean({
      summary: "Only models with temperature",
    }),
    "open-weights": Flags.boolean({
      summary: "Only models with open weights",
    }),
    interleaved: Flags.boolean({
      summary: "Only models with interleaved inputs",
    }),
    input: Flags.string({
      summary: "Require input modality (repeatable, comma-separated)",
      multiple: true,
      delimiter: ",",
    }),
    output: Flags.string({
      summary: "Require output modality (repeatable, comma-separated)",
      multiple: true,
      delimiter: ",",
    }),
    "min-context": Flags.integer({
      summary: "Minimum context window",
    }),
    "min-output": Flags.integer({
      summary: "Minimum output limit",
    }),
    sort: Flags.string({
      summary: "Sort by ref, name, context, or output",
      options: ["ref", "name", "context", "output"],
      default: "ref",
    }),
    desc: Flags.boolean({
      summary: "Sort descending",
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
    const {flags} = await this.parse(ModelsList);
    const apiData = await this.loadApi(flags);

    let models = allModels(apiData);
    models = filterModels(models, {
      provider: flags.provider,
      q: flags.q,
      family: flags.family,
      status: flags.status,
      reasoning: flags.reasoning,
      toolCall: flags["tool-call"],
      attachment: flags.attachment,
      structuredOutput: flags["structured-output"],
      temperature: flags.temperature,
      openWeights: flags["open-weights"],
      interleaved: flags.interleaved,
      input: flags.input,
      output: flags.output,
      minContext: flags["min-context"],
      minOutput: flags["min-output"],
    });
    models = sortModels(models, {sort: flags.sort, desc: flags.desc});
    models = paginate(models, {offset: flags.offset, limit: flags.limit});

    if (this.isJsonMode(flags)) {
      const payload = flags.details ? models.map(toModelDetails) : models.map(toModelSummary);
      return this.outputJson(flags, payload);
    }

    if (flags.details) {
      for (const modelEntry of models) {
        this.log(modelRef(modelEntry.providerId, modelEntry.modelId));
        this.log(modelEntry.model?.name ?? "-");
        this.log(JSON.stringify(modelEntry.model, null, 2));
        this.log("");
      }
      return;
    }

    const rows = models.map((m) => [
      truncate(modelRef(m.providerId, m.modelId), 42),
      truncate(m.model?.name ?? "-", 34),
      truncate(m.model?.family ?? "-", 14),
      formatInteger(getContextLimit(m.model)),
      formatInteger(getOutputLimit(m.model)),
      formatCost(getNumericCost(m.model, "input")),
      formatCost(getNumericCost(m.model, "output")),
      modelFeaturesShort(m.model),
      m.model?.status ?? "-",
      truncate(modalitiesShort(m.model), 24),
    ]);

    this.log(
      renderTable(["Ref", "Name", "Family", "Ctx", "Out", "$In", "$Out", "Flags", "Status", "Modalities"], rows),
    );
  }
}
