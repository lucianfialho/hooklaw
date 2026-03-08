<p align="center">
  <img src="logo.png" alt="HookLaw" width="200" />
</p>
<h1 align="center">HookLaw</h1>
<p align="center"><strong>Webhook orchestrator with AI agents and native MCP tools.</strong></p>
<p align="center">Webhooks in. MCP tools out. AI agent in the middle.</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/tests-60%20passing-brightgreen?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/MCP-native%20client-purple?style=for-the-badge" alt="MCP Native" />
</p>

---

```
  Stripe webhook  ──→  Recipe  ──→  Conta Azul MCP (create invoice)
  GitHub webhook  ──→  Recipe  ──→  Slack MCP (post message)
  Any webhook     ──→  Recipe  ──→  Any MCP server
```

HookLaw connects **any webhook** to **any MCP server** through AI agents. Define recipes in YAML, bring your own API keys, self-host it.

## Why HookLaw

Other platforms treat webhooks as just another input channel for their AI assistant. HookLaw is **webhook-first**: every webhook gets its own AI agent and MCP tool connections.

### MCP done right

| | HookLaw | OpenClaw (MCPorter) |
|---|---|---|
| **MCP client** | Native, via `@modelcontextprotocol/sdk` | Shells out to CLI tool |
| **Connection** | Persistent pool, reusable | Cold-start per call |
| **Latency** | Sub-second tool calls | ~2.4s overhead per invocation |
| **Transport** | stdio + SSE | stdio only (HTTP/SSE disabled) |
| **Config** | Works. Servers connect and run. | [Silently ignored](https://github.com/openclaw/openclaw/issues/29053) at runtime |

### Recipes

A recipe connects a webhook to MCP tools through an AI agent. Multiple recipes can share the same webhook — one Stripe payment triggers invoice creation AND sends a notification.

```
┌─────────────┐     ┌───────────────────────────────────────┐     ┌──────────────┐
│  Webhooks   │     │            HookLaw                    │     │  MCP Servers  │
│             │     │                                       │     │              │
│  Stripe   ──┼────▶│  Recipe: payment-to-invoice          │────▶│  Stripe MCP  │
│             │     │    AI agent orchestrates the flow     │────▶│  Conta Azul  │
│             │     │                                       │     │              │
│  GitHub   ──┼────▶│  Recipe: pr-review                   │────▶│  GitHub MCP  │
│             │     │    AI agent reviews code              │     │              │
│             │     │                                       │     │              │
│  Any URL  ──┼────▶│  Recipe: your-automation             │────▶│  Any MCP     │
└─────────────┘     └───────────────────────────────────────┘     └──────────────┘
```

## Quick Start

```bash
npx hooklaw init
# Edit hooklaw.config.yaml with your API keys
npx hooklaw start
```

Or install globally:

```bash
npm install -g hooklaw
hooklaw init
hooklaw start
```

## Configuration

```yaml
server:
  port: 3007

providers:
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}

# Shared MCP servers — define once, use in any recipe
mcp_servers:
  stripe:
    transport: stdio
    command: npx
    args: ["-y", "@stripe/agent-toolkit", "--tools=all"]
    env:
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
  contaazul:
    transport: stdio
    command: npx
    args: ["-y", "contaazul-mcp"]

# Recipes connect webhooks → AI agents → MCP tools
recipes:
  payment-to-invoice:
    description: "Auto-create invoice on Stripe payment"
    slug: stripe-payment              # POST /h/stripe-payment
    mode: async
    agent:
      provider: anthropic
      model: claude-sonnet-4-20250514
      temperature: 0.1
      instructions: |
        When a Stripe payment succeeds, extract customer details
        and create an invoice in Conta Azul.
    tools: [stripe, contaazul]        # MCP servers this recipe uses

  payment-log:
    description: "Log payment summary"
    slug: stripe-payment              # same webhook, different recipe
    mode: async
    agent:
      provider: anthropic
      model: claude-sonnet-4-20250514
      temperature: 0.1
      instructions: |
        Summarize: "[amount] from [customer] via [method]"
    tools: []                         # no MCP tools needed
```

Environment variables (`${VAR}`) are substituted from `.env` or the environment.

## How It Works

1. A webhook hits `POST /h/stripe-payment`
2. HookLaw finds all recipes with `slug: stripe-payment`
3. Each recipe runs its AI agent with the webhook payload
4. Agents use MCP tools to take action (create invoices, send messages, etc.)
5. Everything is logged with full execution history

**Sync mode** — waits for the agent and returns the response in the HTTP reply.
**Async mode** — returns `200 Accepted` immediately, processes in background.

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/h/:slug` | Receive webhook |
| `GET` | `/health` | Health check |
| `GET` | `/api/recipes` | List all recipes |
| `GET` | `/api/recipes/:id/executions` | Recipe execution history |
| `GET` | `/api/webhooks/:slug/executions` | Webhook execution history |

## Providers

Bring your own API keys. Supports:

| Provider | Config key | Notes |
|----------|-----------|-------|
| **Anthropic** | `anthropic` | Claude models |
| **OpenAI** | `openai` | GPT models |
| **OpenRouter** | `openrouter` | Multi-model gateway |
| **Ollama** | `ollama` | Local models, set `base_url` |

## MCP Servers

HookLaw works with any MCP server. Popular options:

| Server | Transport | Package |
|--------|-----------|---------|
| Stripe | stdio | `@stripe/agent-toolkit` |
| GitHub | stdio | `@modelcontextprotocol/server-github` |
| Filesystem | stdio | `@modelcontextprotocol/server-filesystem` |
| Slack | stdio | `@anthropic/mcp-server-slack` |
| PostgreSQL | stdio | `@modelcontextprotocol/server-postgres` |
| Any SSE server | sse | Your URL |

## Examples

| Example | What it does |
|---------|-------------|
| [`stripe-to-contaazul`](examples/stripe-to-contaazul) | Stripe payment → Conta Azul invoice via MCP |
| [`github-summary`](examples/github-summary) | GitHub push/PR → AI-generated summary |

## Architecture

```
hooklaw.config.yaml
        │
        ▼
┌──────────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  HTTP Server │────▶│  Router  │────▶│   Agent   │────▶│ MCP Pool │
│  /h/:slug    │     │  Recipe  │     │  Tool Loop│     │  stdio   │
│  /api/*      │     │  Matcher │     │  (max 10) │     │  sse     │
└──────────────┘     └──────────┘     └───────────┘     └──────────┘
                           │                                   │
                           ▼                                   ▼
                     ┌──────────┐                        ┌──────────┐
                     │  SQLite  │                        │ External │
                     │  (WAL)   │                        │ MCP Svrs │
                     └──────────┘                        └──────────┘
```

**Stack**: TypeScript, Node.js, SQLite (better-sqlite3), Zod, Pino

## Development

```bash
git clone https://github.com/hooklaw/hooklaw.git
cd hooklaw
npm install
npm test              # 60 tests, 8 test files
npm run typecheck     # strict TypeScript
npm run dev           # start with tsx (hot reload)
```

### Project Structure

```
src/
├── types.ts          # Zod schemas (recipes, MCP servers, providers)
├── config.ts         # YAML loader with ${ENV_VAR} substitution
├── db.ts             # SQLite (executions CRUD)
├── mcp.ts            # MCP client pool (stdio + SSE, persistent connections)
├── agent.ts          # Agentic tool loop (max 10 iterations)
├── queue.ts          # Per-recipe async queue with concurrency control
├── router.ts         # Recipe matcher + orchestrator
├── server.ts         # HTTP server (webhook receiver + REST API)
├── index.ts          # Bootstrap + wiring
├── cli.ts            # CLI (init, start)
└── providers/
    ├── base.ts       # LLM provider interface
    ├── anthropic.ts  # Anthropic provider
    ├── openai.ts     # OpenAI/OpenRouter/Ollama provider
    └── index.ts      # Provider factory + cache
```

## License

MIT — self-host it, modify it, do whatever you want.
