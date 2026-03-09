import OpenAI from 'openai';
import type { LLMProvider, Message, ChatOptions, ChatResult, ToolDefinition, ToolCall } from '@hooklaw/core';
import type { ResponseInputItem, FunctionTool, Response as OAIResponse } from 'openai/resources/responses/responses.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    const { instructions, input } = toResponsesInput(messages);
    const tools = options.tools?.map(toResponsesTool);

    const response = await this.client.responses.create({
      model: options.model,
      input,
      ...(instructions ? { instructions } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.max_tokens !== undefined ? { max_output_tokens: options.max_tokens } : {}),
      ...(tools?.length ? { tools } : {}),
    });

    return fromResponsesOutput(response);
  }
}

function toResponsesInput(messages: Message[]): { instructions?: string; input: ResponseInputItem[] } {
  let instructions: string | undefined;
  const input: ResponseInputItem[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      instructions = msg.content;
      continue;
    }

    if (msg.role === 'user') {
      input.push({ role: 'user', content: msg.content, type: 'message' });
      continue;
    }

    if (msg.role === 'assistant') {
      // If assistant has tool calls, emit them as function_call items
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          });
        }
      }
      // If assistant has text content, emit as message
      if (msg.content) {
        input.push({ role: 'assistant', content: msg.content, type: 'message' });
      }
      continue;
    }

    if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id ?? '',
        output: msg.content,
      });
      continue;
    }
  }

  return { instructions, input };
}

function toResponsesTool(tool: ToolDefinition): FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    strict: false,
  };
}

function fromResponsesOutput(response: OAIResponse): ChatResult {
  let content = '';
  const toolCalls: ToolCall[] = [];

  for (const item of response.output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        if (part.type === 'output_text') {
          content += part.text;
        }
      }
    }
    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id,
        name: item.name,
        arguments: JSON.parse(item.arguments || '{}'),
      });
    }
  }

  return {
    content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: response.usage ? {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    } : undefined,
  };
}
