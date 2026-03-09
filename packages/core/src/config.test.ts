import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';

const TEST_DIR = join(import.meta.dirname, '../.test-config');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig(join(TEST_DIR, 'nonexistent.yaml'));
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.recipes).toEqual({});
    expect(config.mcp_servers).toEqual({});
  });

  it('loads and parses a valid YAML config with recipes', () => {
    const yaml = `
server:
  port: 8080
recipes:
  my-recipe:
    slug: test-hook
    agent:
      provider: anthropic
      model: claude-sonnet-4
      instructions: "Hello"
`;
    const configPath = join(TEST_DIR, 'hooklaw.config.yaml');
    writeFileSync(configPath, yaml);

    const config = loadConfig(configPath);
    expect(config.server.port).toBe(8080);
    expect(config.recipes['my-recipe'].agent.provider).toBe('anthropic');
    expect(config.recipes['my-recipe'].slug).toBe('test-hook');
    expect(config.recipes['my-recipe'].mode).toBe('async'); // default
  });

  it('substitutes environment variables', () => {
    process.env.TEST_API_KEY = 'my-secret-key';

    const yaml = `
providers:
  anthropic:
    api_key: \${TEST_API_KEY}
`;
    const configPath = join(TEST_DIR, 'hooklaw.config.yaml');
    writeFileSync(configPath, yaml);

    const config = loadConfig(configPath);
    expect(config.providers.anthropic.api_key).toBe('my-secret-key');

    delete process.env.TEST_API_KEY;
  });

  it('replaces missing env vars with empty string', () => {
    delete process.env.NONEXISTENT_VAR_XYZ;

    const yaml = `
providers:
  test:
    api_key: \${NONEXISTENT_VAR_XYZ}
`;
    const configPath = join(TEST_DIR, 'hooklaw.config.yaml');
    writeFileSync(configPath, yaml);

    const config = loadConfig(configPath);
    expect(config.providers.test.api_key).toBe('');
  });

  it('throws on invalid config structure', () => {
    const yaml = `
recipes:
  bad:
    slug: test
    mode: invalid_mode
    agent:
      provider: test
      model: test
      instructions: test
`;
    const configPath = join(TEST_DIR, 'hooklaw.config.yaml');
    writeFileSync(configPath, yaml);

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('loads .env file from config directory', () => {
    const dotenv = 'DOTENV_TEST_KEY=from-dotenv\n';
    writeFileSync(join(TEST_DIR, '.env'), dotenv);

    const yaml = `
providers:
  test:
    api_key: \${DOTENV_TEST_KEY}
`;
    const configPath = join(TEST_DIR, 'hooklaw.config.yaml');
    writeFileSync(configPath, yaml);

    const config = loadConfig(configPath);
    expect(config.providers.test.api_key).toBe('from-dotenv');

    delete process.env.DOTENV_TEST_KEY;
  });
});
