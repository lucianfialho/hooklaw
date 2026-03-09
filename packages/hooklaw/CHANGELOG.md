# hooklaw

## 2.0.1

### Patch Changes

- Fix bin path to use compiled cli.js instead of node_modules reference
  - @lucianfialho/hooklaw-core@2.0.1
  - @lucianfialho/hooklaw-provider-openai@2.0.1
  - @lucianfialho/hooklaw-provider-anthropic@2.0.1
  - @lucianfialho/hooklaw-cli@2.0.1

## 2.0.0

### Minor Changes

- Add interactive dashboard with React Flow canvas, setup wizard, and recipe management API

  - **Dashboard**: Full React Flow canvas visualizing the webhook → recipe → agent → tools pipeline with interactive nodes, edit panels, and provider/tool favicons
  - **Setup wizard**: Guided onboarding with MCP integration selection (Stripe, GitHub, Slack, Linear, Notion, PostgreSQL) and auto-generated config
  - **Recipe management**: PATCH /api/recipes/:id endpoint for editing recipes live from the dashboard
  - **Doctor command**: `hooklaw doctor` for diagnosing configuration issues
  - **Execution stats**: Log retention cleanup and aggregated stats API

### Patch Changes

- Updated dependencies
  - @lucianfialho/hooklaw-core@2.0.0
  - @lucianfialho/hooklaw-cli@2.0.0
  - @lucianfialho/hooklaw-provider-anthropic@2.0.0
  - @lucianfialho/hooklaw-provider-openai@2.0.0

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
  - @lucianfialho/hooklaw-core@1.0.0
  - @lucianfialho/hooklaw-provider-openai@1.0.0
  - @lucianfialho/hooklaw-provider-anthropic@1.0.0
  - @lucianfialho/hooklaw-cli@1.0.0
