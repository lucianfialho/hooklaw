import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
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
