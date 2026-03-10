# @lucianfialho/hooklaw-core

## 3.0.0

### Minor Changes

- feat: add 5 differentiating features — multi-agent chains, human-in-the-loop approvals, agent memory, conditional routing, and agent observability traces

## 2.0.1

## 2.0.0

### Minor Changes

- Add interactive dashboard with React Flow canvas, setup wizard, and recipe management API

  - **Dashboard**: Full React Flow canvas visualizing the webhook → recipe → agent → tools pipeline with interactive nodes, edit panels, and provider/tool favicons
  - **Setup wizard**: Guided onboarding with MCP integration selection (Stripe, GitHub, Slack, Linear, Notion, PostgreSQL) and auto-generated config
  - **Recipe management**: PATCH /api/recipes/:id endpoint for editing recipes live from the dashboard
  - **Doctor command**: `hooklaw doctor` for diagnosing configuration issues
  - **Execution stats**: Log retention cleanup and aggregated stats API

## 1.0.0

### Minor Changes

- Migrate to pnpm workspaces monorepo with dynamic provider registry
