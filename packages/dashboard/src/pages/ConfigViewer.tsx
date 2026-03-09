import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import { YamlEditor } from '@visual-yaml/react';

export function ConfigViewer() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getConfig()
      .then((c) => setConfig(c as Record<string, unknown>))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Config</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Current server configuration (API keys redacted) — powered by{' '}
          <a href="https://github.com/lucianfialho/visual-yaml" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
            visual-yaml
          </a>
        </p>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : config ? (
        <div
          className="rounded-lg border border-zinc-800 overflow-hidden"
          style={{ height: 'calc(100vh - 160px)' }}
          onDragStartCapture={(e) => e.preventDefault()}
        >
          <YamlEditor
            value={config}
            readOnly
            treeShowValues
            editorShowDescriptions
            style={{
              '--vy-bg': '#09090b',
              '--vy-bg-panel': '#0a0a0c',
              '--vy-bg-hover': '#18181b',
              '--vy-bg-selected': '#065f46',
              '--vy-bg-selected-muted': '#18181b',
              '--vy-text-selected': '#d1fae5',
              '--vy-border': '#27272a',
              '--vy-border-subtle': '#1f1f23',
              '--vy-text': '#d4d4d8',
              '--vy-text-muted': '#71717a',
              '--vy-text-dim': '#52525b',
              '--vy-text-dimmer': '#3f3f46',
              '--vy-input-bg': '#09090b',
              '--vy-input-border': '#27272a',
              '--vy-accent': '#10b981',
              '--vy-accent-muted': '#064e3b',
              '--vy-font': 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            } as React.CSSProperties}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-500 text-sm">Could not load config.</p>
        </div>
      )}
    </div>
  );
}
