import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, Message, ChatOptions, ChatResult, ToolDefinition, ToolCall } from '@hooklaw/core';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    // Separate system message from the rest
    let system: string | undefined;
    const filtered: Message[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        filtered.push(msg);
      }
    }

    // Convert messages to Anthropic format
    const anthropicMessages = filtered.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: msg.tool_call_id ?? '',
            content: msg.content,
          }],
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: msg.tool_calls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })),
        };
      }
      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      };
    });

    // Convert tools to Anthropic format
    const tools = options.tools?.map(toAnthropicTool);

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature,
      system,
      messages: anthropicMessages,
      ...(tools?.length ? { tools } : {}),
    });

    return fromAnthropicResponse(response);
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
  };
}

function fromAnthropicResponse(response: Anthropic.Message): ChatResult {
  let content = '';
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
    }
  }

  return {
    content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
