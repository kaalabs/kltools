import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';
import chalk from 'chalk';

export interface McpServerConfig {
  name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  source: 'opencode' | 'codex';
}

function resolveEnv(value: string): string {
  const match = value.match(/^{env:(.+)}$/);
  if (match && match[1]) {
    return process.env[match[1]] || '';
  }
  return value;
}

export function loadConfigs(verbose = false): McpServerConfig[] {
  const servers: McpServerConfig[] = [];

  // Load opencode configs
  const opencodePath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  if (fs.existsSync(opencodePath)) {
    try {
      const opencodeContent = fs.readFileSync(opencodePath, 'utf-8');
      const opencodeData = JSON.parse(opencodeContent);
      if (opencodeData.mcp) {
        for (const [name, config] of Object.entries<any>(opencodeData.mcp)) {
          if (config.enabled === false) continue;

          if (config.type === 'local') {
            const cmdArray = config.command || [];
            if (!cmdArray[0]) {
              if (verbose) console.warn(chalk.yellow(`Skipping opencode server '${name}': missing command`));
              continue;
            }
            const env: Record<string, string> = {};
            if (config.environment) {
              for (const [k, v] of Object.entries<string>(config.environment)) {
                env[k] = resolveEnv(v);
              }
            }
            servers.push({
              name,
              type: 'stdio',
              command: cmdArray[0],
              args: cmdArray.slice(1),
              env: Object.keys(env).length > 0 ? env : undefined,
              source: 'opencode'
            });
          } else if (config.type === 'remote') {
            if (!config.url) {
              if (verbose) console.warn(chalk.yellow(`Skipping opencode server '${name}': missing url`));
              continue;
            }
            servers.push({
              name,
              type: 'sse',
              url: config.url,
              headers: config.headers,
              source: 'opencode'
            });
          }
        }
      }
    } catch (e: any) {
      console.error(chalk.red('Error parsing opencode config:'), e.message);
    }
  }

  // Load codex configs
  const codexPath = path.join(os.homedir(), '.codex', 'config.toml');
  if (fs.existsSync(codexPath)) {
    try {
      const codexContent = fs.readFileSync(codexPath, 'utf-8');
      const codexData = toml.parse(codexContent);
      if (codexData.mcp_servers) {
        for (const [name, config] of Object.entries<any>(codexData.mcp_servers)) {
          if (config.command) {
            servers.push({
              name,
              type: 'stdio',
              command: config.command,
              args: config.args || [],
              env: config.env,
              source: 'codex'
            });
          } else if (config.url) {
            servers.push({
              name,
              type: 'sse',
              url: config.url,
              headers: config.http_headers,
              source: 'codex'
            });
          } else if (verbose) {
            console.warn(chalk.yellow(`Skipping codex server '${name}': no command or url`));
          }
        }
      }
    } catch (e: any) {
      console.error(chalk.red('Error parsing codex config:'), e.message);
    }
  }

  return servers;
}
