import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { execSync, spawn } from 'node:child_process';
import { createLogger } from './logger.js';
import type { McpServerConfig } from './types.js';
import type { ToolDefinition } from './providers/base.js';

const logger = createLogger('hooklaw:mcp');

export interface McpConnection {
  name: string;
  client: Client;
  tools: ToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  close: () => Promise<void>;
}

export async function connectMcpServer(name: string, config: McpServerConfig): Promise<McpConnection> {
  const client = new Client({ name: 'hooklaw', version: '0.1.0' }, { capabilities: {} });

  let transport: StdioClientTransport | SSEClientTransport;

  if (config.transport === 'stdio') {
    if (!config.command) throw new Error(`MCP server '${name}' requires 'command' for stdio transport`);
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...config.env } as Record<string, string>,
    });
  } else {
    if (!config.url) throw new Error(`MCP server '${name}' requires 'url' for sse transport`);
    transport = new SSEClientTransport(new URL(config.url));
  }

  await client.connect(transport);
  logger.info({ name, transport: config.transport }, 'MCP server connected');

  const toolsResult = await client.listTools();
  const tools: ToolDefinition[] = (toolsResult.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: (t.inputSchema ?? {}) as Record<string, unknown>,
  }));

  logger.info({ name, toolCount: tools.length }, 'MCP tools discovered');

  async function callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const result = await client.callTool({ name: toolName, arguments: args });
    const contents = result.content as Array<{ type: string; text?: string }>;
    return contents
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join('\n') || JSON.stringify(result.content);
  }

  async function close() {
    try {
      await client.close();
      logger.info({ name }, 'MCP server disconnected');
    } catch {
      // ignore close errors
    }
  }

  return { name, client, tools, callTool, close };
}

// ── Health Check ─────────────────────────────────────────

export type McpHealthStatus = 'connected' | 'error' | 'not_installed' | 'checking';

export interface McpToolInfo {
  name: string;
  description: string;
}

export interface McpHealthResult {
  name: string;
  status: McpHealthStatus;
  tools?: McpToolInfo[];
  error?: string;
  packageName?: string;
}

/**
 * Extract npm package name from an MCP server config.
 * Handles commands like "npx @stripe/mcp", "npx -y @modelcontextprotocol/server-github", etc.
 */
export function extractPackageName(config: McpServerConfig): string | undefined {
  if (config.transport !== 'stdio') return undefined;

  // Check args for npx patterns
  if (config.command === 'npx' || config.command === 'npx.cmd') {
    const args = config.args ?? [];
    for (const arg of args) {
      // Skip flags like -y, --yes, -p, etc.
      if (arg.startsWith('-')) continue;
      // First non-flag arg is the package
      return arg;
    }
  }

  // Check if command itself is a known npm package pattern
  if (config.command?.startsWith('@') || config.command?.includes('/')) {
    return config.command;
  }

  return undefined;
}

/**
 * Check if an npm package is installed (globally or locally).
 */
function isPackageInstalled(packageName: string): boolean {
  try {
    // Check local node_modules
    execSync(`npm ls ${packageName} --depth=0 2>/dev/null`, { stdio: 'pipe' });
    return true;
  } catch {
    // Not local, check global
    try {
      execSync(`npm ls -g ${packageName} --depth=0 2>/dev/null`, { stdio: 'pipe' });
      return true;
    } catch {
      // Check npx cache
      try {
        execSync(`npx --no-install ${packageName} --version 2>/dev/null`, { stdio: 'pipe', timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Try to connect to an MCP server and verify it responds.
 * Disconnects immediately after health check.
 */
export async function checkMcpHealth(name: string, config: McpServerConfig, timeoutMs = 15000): Promise<McpHealthResult> {
  const packageName = extractPackageName(config);

  // For stdio servers, first check if command is available
  if (config.transport === 'stdio' && packageName) {
    if (!isPackageInstalled(packageName)) {
      return { name, status: 'not_installed', packageName, error: `Package ${packageName} not found` };
    }
  }

  try {
    const client = new Client({ name: 'hooklaw-health', version: '0.1.0' }, { capabilities: {} });
    let transport: StdioClientTransport | SSEClientTransport;

    if (config.transport === 'stdio') {
      if (!config.command) return { name, status: 'error', error: 'No command configured' };
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...config.env } as Record<string, string>,
      });
    } else {
      if (!config.url) return { name, status: 'error', error: 'No URL configured' };
      transport = new SSEClientTransport(new URL(config.url));
    }

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs),
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // List tools to verify full functionality
    const toolsResult = await client.listTools();
    const toolInfos: McpToolInfo[] = (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
    }));

    // Disconnect immediately
    try { await client.close(); } catch { /* ignore */ }

    logger.info({ name, toolCount: toolInfos.length }, 'MCP health check passed');
    return { name, status: 'connected', tools: toolInfos, packageName };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ name, err: message }, 'MCP health check failed');
    return { name, status: 'error', error: message, packageName };
  }
}

/**
 * Install an npm package for an MCP server.
 */
export async function installMcpPackage(packageName: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    logger.info({ packageName }, 'Installing MCP package');
    const child = spawn('npm', ['install', '-g', packageName], {
      stdio: 'pipe',
      shell: true,
    });

    let output = '';
    child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        logger.info({ packageName }, 'MCP package installed successfully');
        resolve({ success: true, output });
      } else {
        logger.error({ packageName, code, output }, 'MCP package install failed');
        resolve({ success: false, output });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

export class McpPool {
  private connections = new Map<string, McpConnection>();

  async connect(servers: Record<string, McpServerConfig>, toolNames?: string[]): Promise<void> {
    // If toolNames specified, only connect those servers
    const names = toolNames ?? Object.keys(servers);

    for (const name of names) {
      if (this.connections.has(name)) continue;
      const config = servers[name];
      if (!config) {
        logger.warn({ name }, 'MCP server referenced but not defined');
        continue;
      }
      const conn = await connectMcpServer(name, config);
      this.connections.set(name, conn);
    }
  }

  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const conn of this.connections.values()) {
      tools.push(...conn.tools);
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    for (const conn of this.connections.values()) {
      const hasTool = conn.tools.some((t) => t.name === name);
      if (hasTool) {
        return conn.callTool(name, args);
      }
    }
    throw new Error(`Tool '${name}' not found in any connected MCP server`);
  }

  async closeAll(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.close();
    }
    this.connections.clear();
  }
}
