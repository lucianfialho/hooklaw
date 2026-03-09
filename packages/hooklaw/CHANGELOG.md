# hooklaw

## 1.0.0

### Minor Changes

- c9d9ccb: Initial release: webhook orchestrator with AI agents and native MCP tools.

  - Recipes connect webhooks to MCP servers via AI agents
  - Native MCP client with persistent connections (stdio + SSE)
  - Multiple recipes per webhook slug
  - Sync and async processing modes
  - BYOK: Anthropic, OpenAI, OpenRouter, Ollama
  - REST API for recipes and execution history
  - SQLite execution logging with retention cleanup
  - CLI with `init` and `start` commands

- Migrate to pnpm workspaces monorepo with dynamic provider registry

### Patch Changes

- Updated dependencies
  - @hooklaw/core@1.0.0
  - @hooklaw/provider-openai@1.0.0
  - @hooklaw/provider-anthropic@1.0.0
  - @hooklaw/cli@1.0.0
