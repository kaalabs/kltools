import {Command, Flags} from "@oclif/core";
import {DEFAULT_API_URL, DEFAULT_TIMEOUT_MS, loadApiData} from "./lib/api.js";

export default class BaseCommand extends Command {
  static enableJsonFlag = true;

  static baseFlags = {
    "api-url": Flags.string({
      description: "API URL, file path, or '-' for stdin",
      env: "MODELSDEV_API_URL",
      default: DEFAULT_API_URL,
    }),
    format: Flags.string({
      description: "Output format",
      options: ["human", "json"],
      default: "human",
    }),
    pretty: Flags.boolean({
      description: "Pretty JSON output (only for --format json)",
      exclusive: ["compact"],
    }),
    compact: Flags.boolean({
      description: "Compact JSON output (only for --format json)",
      exclusive: ["pretty"],
    }),
    timeout: Flags.integer({
      description: "Fetch timeout in ms",
      default: DEFAULT_TIMEOUT_MS,
    }),
  };

  async loadApi(flags) {
    return loadApiData(flags["api-url"], {timeoutMs: flags.timeout});
  }

  isJsonMode(flags) {
    return flags.format === "json" || this.jsonEnabled();
  }

  jsonSpacing(flags) {
    if (flags.pretty) return 2;
    if (flags.compact) return 0;
    return this.stdout?.isTTY ? 2 : 0;
  }

  outputJson(flags, payload) {
    if (this.jsonEnabled()) return payload;
    this.log(JSON.stringify(payload, null, this.jsonSpacing(flags)));
    return null;
  }
}
