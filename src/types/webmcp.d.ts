type WebMcpJsonSchema = Record<string, unknown>;

interface WebMcpToolExecutionContext {
  signal: AbortSignal;
}

interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: WebMcpJsonSchema;
  annotations?: Record<string, boolean>;
  execute: (
    input: unknown,
    context: WebMcpToolExecutionContext,
  ) => unknown | Promise<unknown>;
}

interface WebMcpModelContext {
  registerTool(
    tool: WebMcpToolDefinition,
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
}

interface Document {
  modelContext?: WebMcpModelContext;
}
