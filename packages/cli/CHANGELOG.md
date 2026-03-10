# @lucianfialho/hooklaw-cli

## 3.0.0

### Patch Changes

- Updated dependencies
  - @lucianfialho/hooklaw-core@3.0.0
  - @lucianfialho/hooklaw-provider-anthropic@3.0.0
  - @lucianfialho/hooklaw-provider-openai@3.0.0

## 2.0.1

### Patch Changes

- @lucianfialho/hooklaw-core@2.0.1
- @lucianfialho/hooklaw-provider-openai@2.0.1
- @lucianfialho/hooklaw-provider-anthropic@2.0.1

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
  - @lucianfialho/hooklaw-provider-anthropic@2.0.0
  - @lucianfialho/hooklaw-provider-openai@2.0.0

## 1.0.0

### Minor Changes

- Migrate to pnpm workspaces monorepo with dynamic provider registry

### Patch Changes

- Updated dependencies
  - @lucianfialho/hooklaw-core@1.0.0
  - @lucianfialho/hooklaw-provider-openai@1.0.0
  - @lucianfialho/hooklaw-provider-anthropic@1.0.0
