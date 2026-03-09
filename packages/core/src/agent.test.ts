import { describe, it, expect } from 'vitest';
import { executeAgent } from './agent.js';
import type { LLMProvider, Message, ChatOptions, ChatResult } from './providers/base.js';

function mockProvider(responses: ChatResult[]): LLMProvider {
  let callIndex = 0;
  return {
    async chat(_messages: Message[], _options: ChatOptions): Promise<ChatResult> {
      return responses[callIndex++] ?? { content: 'fallback' };
    },
  };
}

describe('executeAgent', () => {
  it('returns direct response when no tool calls', async () => {
    const provider = mockProvider([{ content: 'Hello!' }]);

    const result = await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'You are helpful.',
      payload: { event: 'push' },
    });

    expect(result.output).toBe('Hello!');
    expect(result.tools_called).toEqual([]);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('executes tool calls and returns final response', async () => {
    const provider = mockProvider([
      {
        content: '',
        tool_calls: [
          { id: 'tc1', name: 'create_issue', arguments: { title: 'Bug' } },
        ],
      },
      { content: 'Issue created successfully!' },
    ]);

    const toolResults: Array<{ name: string; args: Record<string, unknown> }> = [];

    const result = await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'You create issues.',
      payload: { event: 'bug_report' },
      tools: [
        { name: 'create_issue', description: 'Create an issue', input_schema: { type: 'object' } },
      ],
      onToolCall: async (name, args) => {
        toolResults.push({ name, args });
        return 'Issue #42 created';
      },
    });

    expect(result.output).toBe('Issue created successfully!');
    expect(result.tools_called).toEqual(['create_issue']);
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].name).toBe('create_issue');
  });

  it('handles multiple tool calls in one response', async () => {
    const provider = mockProvider([
      {
        content: '',
        tool_calls: [
          { id: 'tc1', name: 'notify_slack', arguments: { msg: 'hi' } },
          { id: 'tc2', name: 'create_record', arguments: { data: 'x' } },
        ],
      },
      { content: 'Both done.' },
    ]);

    const result = await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'test',
      payload: {},
      tools: [
        { name: 'notify_slack', description: 'Notify', input_schema: {} },
        { name: 'create_record', description: 'Record', input_schema: {} },
      ],
      onToolCall: async () => 'ok',
    });

    expect(result.tools_called).toEqual(['notify_slack', 'create_record']);
    expect(result.output).toBe('Both done.');
  });

  it('handles tool call errors gracefully', async () => {
    const provider = mockProvider([
      {
        content: '',
        tool_calls: [{ id: 'tc1', name: 'failing_tool', arguments: {} }],
      },
      { content: 'Handled the error.' },
    ]);

    const result = await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'test',
      payload: {},
      tools: [{ name: 'failing_tool', description: 'Fails', input_schema: {} }],
      onToolCall: async () => {
        throw new Error('Connection refused');
      },
    });

    expect(result.tools_called).toEqual(['failing_tool']);
    expect(result.output).toBe('Handled the error.');
  });

  it('stops after max iterations', async () => {
    // Provider always returns tool calls — should stop at 10
    const provider = mockProvider(
      Array.from({ length: 15 }, () => ({
        content: '',
        tool_calls: [{ id: 'tc', name: 'loop_tool', arguments: {} }],
      }))
    );

    const result = await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'test',
      payload: {},
      tools: [{ name: 'loop_tool', description: 'Loops', input_schema: {} }],
      onToolCall: async () => 'ok',
    });

    expect(result.tools_called).toHaveLength(10);
  });

  it('returns tool not connected message when no onToolCall', async () => {
    let toolResultSent = '';
    const provider: LLMProvider = {
      async chat(messages: Message[]): Promise<ChatResult> {
        // Check if any tool result message exists
        const toolMsg = messages.find((m) => m.role === 'tool');
        if (toolMsg) {
          toolResultSent = toolMsg.content;
          return { content: 'ok' };
        }
        return {
          content: '',
          tool_calls: [{ id: 'tc1', name: 'missing', arguments: {} }],
        };
      },
    };

    await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'test',
      payload: {},
      tools: [{ name: 'missing', description: 'Missing', input_schema: {} }],
    });

    expect(toolResultSent).toContain('not connected');
  });

  it('formats object payload as JSON', async () => {
    let receivedMessage = '';
    const provider: LLMProvider = {
      async chat(messages: Message[]): Promise<ChatResult> {
        const userMsg = messages.find((m) => m.role === 'user');
        receivedMessage = userMsg?.content ?? '';
        return { content: 'ok' };
      },
    };

    await executeAgent({
      provider,
      model: 'test',
      system_prompt: 'test',
      payload: { action: 'opened', number: 42 },
    });

    expect(receivedMessage).toContain('```json');
    expect(receivedMessage).toContain('"action": "opened"');
  });
});
