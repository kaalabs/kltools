#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigs } from './config';
import { createClient } from './client';

const program = new Command();

program
  .name('mcporter')
  .description('CLI for MCP servers discovered from OpenCode and Codex configs')
  .version('1.0.1')
  .option('-v, --verbose', 'Enable verbose/debug logging');

program
  .command('list-servers')
  .description('List all discovered MCP servers')
  .action((opts) => {
    const verbose = !!opts.verbose || program.opts().verbose;
    const servers = loadConfigs(verbose);
    console.log(chalk.bold('Discovered MCP Servers:\n'));
    servers.forEach(s => {
      console.log(`${chalk.green(s.name)} [${chalk.blue(s.source)}] - ${chalk.yellow(s.type)}`);
      if (s.type === 'stdio') {
        console.log(`  Command: ${s.command} ${s.args?.join(' ')}`);
      } else {
        console.log(`  URL: ${s.url}`);
      }
      console.log();
    });
  });

program
  .command('list-tools <serverName>')
  .description('List tools available on a specific server')
  .action(async (serverName, opts) => {
    const verbose = !!opts.verbose || program.opts().verbose;
    const servers = loadConfigs(verbose);
    const server = servers.find(s => s.name === serverName);
    if (!server) {
      console.error(chalk.red(`Server '${serverName}' not found.`));
      process.exit(1);
    }

    try {
      if (verbose) console.log(chalk.gray(`[verbose] Found server config for ${serverName}`));
      console.log(chalk.blue(`Connecting to ${serverName}...`));
      const client = await createClient(server!, verbose);
      const tools = await client.listTools();

      console.log(chalk.bold(`\nTools for ${serverName}:`));
      tools.tools.forEach(t => {
        console.log(`\n${chalk.green(t.name)}: ${t.description || 'No description'}`);
        if (t.inputSchema) {
          console.log(chalk.gray(`Schema: ${JSON.stringify(t.inputSchema, null, 2)}`));
        }
      });
    } catch (e: any) {
      console.error(chalk.red(`Error connecting or listing tools:`), e.message || e);
      process.exit(1);
    }
  });

program
  .command('call-tool <serverName> <toolName>')
  .description('Call a tool on a specific server')
  .option('-a, --args <jsonArgs>', 'Arguments for the tool as a JSON string', '{}')
  .action(async (serverName, toolName, options, cmd) => {
    const verbose = program.opts().verbose;
    const servers = loadConfigs(verbose);
    const server = servers.find(s => s.name === serverName);
    if (!server) {
      console.error(chalk.red(`Server '${serverName}' not found.`));
      process.exit(1);
    }

    let parsedArgs;
    try {
      parsedArgs = JSON.parse(options.args);
    } catch (e) {
      console.error(chalk.red(`Invalid JSON provided to --args`));
      process.exit(1);
    }

    try {
      if (verbose) console.log(chalk.gray(`[verbose] Found server config for ${serverName}`));
      console.log(chalk.blue(`Connecting to ${serverName}...`));
      const client = await createClient(server!, verbose);
      console.log(chalk.blue(`Calling ${toolName} with ${JSON.stringify(parsedArgs)}...`));

      const result = await client.callTool({
        name: toolName,
        arguments: parsedArgs
      });

      console.log(chalk.bold('\nResult:'));
      console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.error(chalk.red(`Error calling tool:`), e.message || e);
      process.exit(1);
    }
  });

// Top-level runner for better async error handling
async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    console.error(chalk.red('Unexpected error:'), err.message || err);
    process.exit(1);
  }
}

main();
