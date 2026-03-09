import type { LLMProvider, Message, ToolDefinition, ChatOptions } from './providers/base.js';

const MAX_TOOL_ITERATIONS = 10;

export interface AgentConfig {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  system_prompt: string;
  payload: unknown;
  tools?: ToolDefinition[];
  max_tokens?: number;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<string>;
}

export interface AgentResult {
  output: string;
  tools_called: string[];
  duration_ms: number;
}

export async function executeAgent(config: AgentConfig): Promise<AgentResult> {
  const start = performance.now();
  const toolsCalled: string[] = [];

  const messages: Message[] = [
    { role: 'system', content: config.system_prompt },
    { role: 'user', content: formatPayload(config.payload) },
  ];

  const chatOptions: ChatOptions = {
    model: config.model,
    temperature: config.temperature,
    tools: config.tools,
    max_tokens: config.max_tokens,
  };

  let lastContent = '';

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await config.provider.chat(messages, chatOptions);

    lastContent = result.content;

    if (!result.tool_calls?.length) {
      break;
    }

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.tool_calls,
    });

    // Execute each tool call
    for (const tc of result.tool_calls) {
      toolsCalled.push(tc.name);

      let toolResult: string;
      if (config.onToolCall) {
        try {
          toolResult = await config.onToolCall(tc.name, tc.arguments);
        } catch (err) {
          toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        toolResult = `Tool '${tc.name}' not connected`;
      }

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
      });
    }
  }

  return {
    output: lastContent,
    tools_called: toolsCalled,
    duration_ms: Math.round(performance.now() - start),
  };
}

function formatPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  return `Webhook payload:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}
