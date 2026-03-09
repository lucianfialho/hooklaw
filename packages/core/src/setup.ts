import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createServer, startServer, getLocalIP } from './server.js';
import { installMcpPackage, extractPackageName } from './mcp.js';
import { createLogger } from './logger.js';

const logger = createLogger('hooklaw:setup');

interface SetupData {
  provider: string;
  apiKey: string;
  model: string;
  slug: string;
  description: string;
  instructions: string;
  mode: 'async' | 'sync';
  port: number;
  mcp?: { name: string; config: { command: string; args: string[] } };
  tools: string[];
}

function generateConfig(data: SetupData): string {
  const envVars: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  const providerBlock = data.provider === 'ollama'
    ? `  ollama:\n    base_url: http://localhost:11434/v1`
    : `  ${data.provider}:\n    api_key: \${${envVars[data.provider] ?? 'API_KEY'}}`;

  // Build MCP servers block
  let mcpBlock = 'mcp_servers: {}';
  if (data.mcp) {
    const argsStr = data.mcp.config.args.map(a => `"${a}"`).join(', ');
    mcpBlock = `mcp_servers:\n  ${data.mcp.name}:\n    transport: stdio\n    command: ${data.mcp.config.command}\n    args: [${argsStr}]`;
  }

  // Build tools array
  const toolsStr = data.tools && data.tools.length > 0
    ? `[${data.tools.map(t => `"${t}"`).join(', ')}]`
    : '[]';

  const instructions = data.instructions
    || 'You process incoming webhook payloads.\nAnalyze the data and take appropriate action.\nBe concise and actionable in your responses.';

  return `# HookLaw Configuration
# Docs: https://github.com/lucianfialho/hooklaw

server:
  port: ${data.port}
  host: 0.0.0.0

providers:
${providerBlock}

# Shared MCP servers (referenced by recipes via "tools")
${mcpBlock}

# Recipes connect webhooks to AI agents with MCP tools
recipes:
  ${data.slug}:
    description: "${data.description}"
    slug: ${data.slug}
    mode: ${data.mode}
    agent:
      provider: ${data.provider}
      model: ${data.model}
      instructions: |
        ${instructions.split('\n').join('\n        ')}
    tools: ${toolsStr}

logs:
  retention_days: 30
`;
}

export interface SetupServerOptions {
  dashboardDir?: string;
  configPath: string;
  port: number;
  host: string;
  onConfigCreated: () => void;
}

export async function startSetupServer(opts: SetupServerOptions): Promise<void> {
  const server = createServer({
    getSlugConfig: () => undefined,
    processWebhook: async () => {},
    dashboardDir: opts.dashboardDir,
    setupMode: true,
    async onSetup(raw) {
      const data = raw as SetupData;

      // Validate
      if (!data.provider) throw new Error('Provider is required');
      if (!data.slug) throw new Error('Webhook slug is required');

      // Write config
      const config = generateConfig(data);
      writeFileSync(opts.configPath, config, 'utf-8');
      logger.info({ path: opts.configPath }, 'Config file created');

      // Write .env if API key provided
      const envVars: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        openrouter: 'OPENROUTER_API_KEY',
      };
      if (data.apiKey && data.provider !== 'ollama') {
        const envVar = envVars[data.provider] ?? 'API_KEY';
        const envLine = `${envVar}=${data.apiKey}\n`;

        if (existsSync('.env')) {
          const existing = readFileSync('.env', 'utf-8');
          if (!existing.includes(envVar)) {
            writeFileSync('.env', existing + envLine);
          }
        } else {
          writeFileSync('.env', envLine);
        }
        logger.info('API key saved to .env');
      }

      // Install MCP package if needed
      if (data.mcp) {
        const packageName = extractPackageName({
          transport: 'stdio',
          command: data.mcp.config.command,
          args: data.mcp.config.args,
        });
        if (packageName) {
          logger.info({ packageName }, 'Installing MCP package...');
          try {
            const result = await installMcpPackage(packageName);
            if (result.success) {
              logger.info({ packageName }, 'MCP package installed');
            } else {
              logger.warn({ packageName, output: result.output }, 'MCP package install failed — you may need to install it manually');
            }
          } catch (err) {
            logger.warn({ packageName, err }, 'MCP package install failed');
          }
        }
      }

      // Close setup server and signal to restart
      server.close();
      opts.onConfigCreated();
    },
  });

  const port = opts.port;
  const host = opts.host;
  await startServer(server, port, host);

  const localIP = getLocalIP();
  const url = localIP ? `http://${localIP}:${port}` : `http://localhost:${port}`;

  logger.info('');
  logger.info(`  Setup wizard running at: ${url}/dashboard/`);
  logger.info('  Open this URL in your browser to configure HookLaw.');
  logger.info('');
}
