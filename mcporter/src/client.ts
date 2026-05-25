import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { McpServerConfig } from "./config";
import chalk from 'chalk';

// Polyfill EventSource for SSEClientTransport
// @ts-ignore
global.EventSource = require('eventsource');

export async function createClient(config: McpServerConfig, verbose = false): Promise<Client> {
  const client = new Client(
    {
      name: "mcporter",
      version: "1.0.1",
    },
    {
      capabilities: {},
    }
  );

  let transport;

  if (config.type === 'stdio') {
    if (!config.command) {
      throw new Error(`Missing command for stdio server: ${config.name}`);
    }
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ...(config.env || {}) })) {
      if (v !== undefined) env[k] = v;
    }
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env
    });
    if (verbose) console.log(chalk.gray(`[verbose] Starting stdio: ${config.command} ${(config.args || []).join(' ')}`));
  } else if (config.type === 'sse') {
    if (!config.url) {
      throw new Error(`Missing url for sse server: ${config.name}`);
    }
    const url = new URL(config.url);
    const headers = {
      "Accept": "application/json, text/event-stream",
      ...(config.headers || {})
    };
    transport = new SSEClientTransport(url, {
      eventSourceInit: { headers } as any,
      requestInit: { headers: headers as HeadersInit }
    });
    if (verbose) console.log(chalk.gray(`[verbose] Connecting to SSE: ${config.url}`));
  } else {
    throw new Error(`Unsupported transport type: ${config.type}`);
  }

  try {
    await client.connect(transport);
  } catch (err: any) {
    throw new Error(`Failed to connect to ${config.name} (${config.type}): ${err.message || err}`);
  }
  return client;
}
