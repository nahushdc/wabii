import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, callAdmin, type PromptRow, type PromptVersion } from './api';
import { Banner, formatWhen, useUnsavedWarning } from './ui';

export default function Prompts() {
  const [prompts, setPrompts] = useState<PromptRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await callAdmin<PromptRow[]>('admin-prompts', { action: 'list' });
      setPrompts(rows);
      setSelectedKey((k) => k ?? rows[0]?.key ?? null);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function select(key: string) {
    if (key === selectedKey) return;
    if (dirty && !confirm('Discard your unsaved changes to this prompt?')) return;
    setSelectedKey(key);
  }

  if (loadError) return <Banner kind="error">{loadError}</Banner>;
  if (!prompts) return <p className="muted">Loading prompts…</p>;

  const selected = prompts.find((p) => p.key === selectedKey) ?? null;

  return (
    <div className="split">
      <aside className="list" aria-label="Prompts">
        <h2 className="eyebrow">AI prompts</h2>
        {prompts.map((p) => (
          <button key={p.key} className={`list-item ${p.key === selectedKey ? 'on' : ''}`} onClick={() => select(p.key)}>
            <span>{p.label}</span>
            {p.is_customised && <span className="pill">Edited</span>}
          </button>
        ))}
      </aside>
      {selected && <Editor key={selected.key} prompt={selected} onSaved={load} onDirtyChange={setDirty} />}
    </div>
  );
}

function Editor({ prompt, onSaved, onDirtyChange }: {
  prompt: PromptRow;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [text, setText] = useState(prompt.template);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<PromptVersion[] | null>(null);
  const [showDefault, setShowDefault] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const dirty = text !== prompt.template;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useUnsavedWarning(dirty);

  // Pick up the saved version after a save/reset reloads the list.
  useEffect(() => { setText(prompt.template); }, [prompt.template]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await callAdmin<PromptVersion[]>('admin-prompts', { action: 'history', key: prompt.key }));
    } catch {
      setHistory([]);
    }
  }, [prompt.key]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const missing = prompt.placeholders.filter((p) => !text.includes(`{{${p.name}}}`));

  function insert(name: string) {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setText((t) => t + token);
    const { selectionStart: s, selectionEnd: e } = el;
    setText(text.slice(0, s) + token + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  async function save(force = false) {
    setBusy(true);
    setMessage(null);
    try {
      await callAdmin('admin-prompts', { action: 'save', key: prompt.key, template: text, note, force });
      setNote('');
      await onSaved();
      await loadHistory();
      setMessage({ kind: 'ok', text: 'Saved. The app uses it from the next request.' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !force) {
        setBusy(false);
        if (confirm(`${e.message}.\n\nThe feature may break without them. Save anyway?`)) return save(true);
        return;
      }
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    setBusy(false);
  }

  async function reset() {
    if (!confirm(`Reset "${prompt.label}" to the default that ships with the app?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await callAdmin('admin-prompts', { action: 'reset', key: prompt.key });
      await onSaved();
      await loadHistory();
      setMessage({ kind: 'ok', text: 'Reset to default.' });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <section className="editor">
      <div className="editor-head">
        <div>
          <h1>{prompt.label}</h1>
          <p className="muted">{prompt.description}</p>
        </div>
        <div className="muted small right">
          {prompt.is_customised
            ? <>Edited {formatWhen(prompt.updated_at)}{prompt.note ? <> · “{prompt.note}”</> : null}</>
            : 'Using the default'}
        </div>
      </div>

      {prompt.placeholders.length > 0 && (
        <div className="placeholders">
          <span className="small muted">Placeholders (click to insert):</span>
          {prompt.placeholders.map((p) => (
            <button
              key={p.name}
              className={`chip ${missing.includes(p) ? 'missing' : ''}`}
              title={p.description}
              onClick={() => insert(p.name)}
            >
              {`{{${p.name}}}`}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={area}
        className="prompt-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label={`${prompt.label} prompt`}
      />

      {missing.length > 0 && (
        <Banner kind="warn">
          Missing {missing.map((m) => `{{${m.name}}}`).join(', ')}. The app fills these in. Without them the AI won't see that information.
        </Banner>
      )}

      <div className="actions">
        <input
          className="note"
          placeholder="What changed? (optional, shows in history)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn primary" disabled={!dirty || busy || !text.trim()} onClick={() => save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn ghost" disabled={!dirty || busy} onClick={() => setText(prompt.template)}>Discard</button>
        {prompt.is_customised && <button className="btn ghost danger" disabled={busy} onClick={reset}>Reset to default</button>}
      </div>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}

      <details className="fold" open={showDefault} onToggle={(e) => setShowDefault((e.target as HTMLDetailsElement).open)}>
        <summary>Default prompt</summary>
        <pre className="code">{prompt.default_template}</pre>
        <button className="btn ghost small" onClick={() => setText(prompt.default_template)}>Load default into editor</button>
      </details>

      <div className="history">
        <h2 className="eyebrow">History</h2>
        {history === null && <p className="muted small">Loading…</p>}
        {history?.length === 0 && <p className="muted small">No edits yet.</p>}
        {history?.map((v) => (
          <div key={v.id} className="history-row">
            <div>
              <div className="small">{formatWhen(v.created_at)}</div>
              <div className="muted small">{v.template === null ? 'Reset to default' : v.note || 'No note'}</div>
            </div>
            {v.template !== null && v.template !== text && (
              <button className="btn ghost small" onClick={() => setText(v.template!)}>Load into editor</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
