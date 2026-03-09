export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  tools?: ToolDefinition[];
  max_tokens?: number;
}

export interface ChatResult {
  content: string;
  tool_calls?: ToolCall[];
  usage?: { input_tokens: number; output_tokens: number };
}

export interface LLMProvider {
  chat(messages: Message[], options: ChatOptions): Promise<ChatResult>;
}
