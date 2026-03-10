import { randomUUID } from 'node:crypto';
import type { LLMProvider, Message, ToolDefinition, ChatOptions } from './providers/base.js';
import type { AgentTrace } from './types.js';

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
  executionId?: string;
  priorMessages?: Message[];
}

export interface AgentResult {
  output: string;
  tools_called: string[];
  duration_ms: number;
  traces: AgentTrace[];
}

export async function executeAgent(config: AgentConfig): Promise<AgentResult> {
  const start = performance.now();
  const toolsCalled: string[] = [];
  const traces: AgentTrace[] = [];
  const execId = config.executionId ?? '';

  const messages: Message[] = [
    { role: 'system', content: config.system_prompt },
    ...(config.priorMessages ?? []),
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

    // Trace: LLM response
    traces.push({
      id: randomUUID(),
      execution_id: execId,
      event_type: 'llm_call',
      step_number: i,
      model_response: result.content,
      tokens_used: result.usage?.output_tokens,
      timestamp: new Date().toISOString(),
    });

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

      // Trace: tool call
      traces.push({
        id: randomUUID(),
        execution_id: execId,
        event_type: 'tool_call',
        step_number: i,
        tool_name: tc.name,
        tool_input: JSON.stringify(tc.arguments),
        timestamp: new Date().toISOString(),
      });

      let toolResult: string;
      if (config.onToolCall) {
        try {
          toolResult = await config.onToolCall(tc.name, tc.arguments);
        } catch (err) {
          toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
          traces.push({
            id: randomUUID(),
            execution_id: execId,
            event_type: 'error',
            step_number: i,
            tool_name: tc.name,
            error: toolResult,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        toolResult = `Tool '${tc.name}' not connected`;
      }

      // Trace: tool result
      traces.push({
        id: randomUUID(),
        execution_id: execId,
        event_type: 'tool_result',
        step_number: i,
        tool_name: tc.name,
        tool_output: toolResult.slice(0, 5000),
        timestamp: new Date().toISOString(),
      });

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
    traces,
  };
}

function formatPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  return `Webhook payload:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}
