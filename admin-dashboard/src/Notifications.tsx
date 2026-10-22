import { useCallback, useEffect, useState } from 'react';
import { callAdmin, type NotificationMessage, type Zone } from './api';
import { Banner, hourLabel, useUnsavedWarning } from './ui';

type ListResponse = {
  zones: Zone[];
  zones_are_default: boolean;
  settings: Record<string, unknown>;
  messages: NotificationMessage[];
};

// Stable object so the new-zone form doesn't reset on every render.
const NEW_ZONE: Zone = { key: '', label: '', start_hour: 21, title: '', bodies: [''] };

export default function Notifications() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setData(await callAdmin<ListResponse>('admin-notifications', { action: 'list' }));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      if (prev.has(key) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  useUnsavedWarning(dirtyKeys.size > 0);

  const [restoring, setRestoring] = useState(false);
  async function restoreReminders() {
    if (!confirm('Put the morning, afternoon and evening reminders back to the original text? Any times of day you added will be removed.')) return;
    setRestoring(true);
    try {
      await callAdmin('admin-notifications', { action: 'restore_reminder_defaults' });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
    setRestoring(false);
  }

  if (loadError) return <Banner kind="error">{loadError}</Banner>;
  if (!data) return <p className="muted">Loading notification text…</p>;

  const zones = [...data.zones].sort((a, b) => a.start_hour - b.start_hour);

  return (
    <div className="stack-lg">
      <div>
        <h1>Notifications</h1>
        <p className="muted">The text every account receives. Each one starts with the text the app uses today.</p>
      </div>

      <section className="stack">
        <div className="row between wrap">
          <div>
            <h2>Reminders {data.zones_are_default && <span className="pill">Original text</span>}</h2>
            <p className="muted small">
              The title and message depend on the time of day a reminder is set for. If someone wrote their own
              message for a reminder, theirs is used instead and only the title comes from here.
            </p>
          </div>
          {!data.zones_are_default && (
            <button className="btn ghost" disabled={restoring} onClick={restoreReminders}>Restore original text</button>
          )}
        </div>

        <Banner kind="info">
          Phones schedule reminders in advance. A change reaches someone's phone the next time they open the app.
          Until then, reminders already scheduled keep the old text.
        </Banner>
      </section>

      <DayStrip zones={zones} />

      <div className="zones">
        {zones.map((z, i) => (
          <ZoneCard
            key={z.key}
            zone={z}
            endHour={zones[(i + 1) % zones.length].start_hour}
            canDelete={zones.length > 1}
            onSaved={load}
            onDirtyChange={setDirty}
          />
        ))}
        {adding ? (
          <ZoneCard
            zone={NEW_ZONE}
            isNew
            canDelete={false}
            onSaved={async () => { setAdding(false); await load(); }}
            onCancel={() => { setAdding(false); setDirty('__new', false); }}
            onDirtyChange={setDirty}
          />
        ) : (
          <button className="btn ghost add" onClick={() => setAdding(true)}>+ Add a time of day</button>
        )}
      </div>

      <DaysAhead value={Number(data.settings.days_ahead ?? 14)} onSaved={load} />

      <section className="stack">
        <div>
          <h2>Reflection ready</h2>
          <p className="muted small">Sent by the server when a weekly or monthly reflection is written. Changes apply to the next one sent.</p>
        </div>
        {data.messages.map((m) => (
          <MessageCard key={m.key} message={m} onSaved={load} onDirtyChange={setDirty} />
        ))}
      </section>
    </div>
  );
}

const ZONE_COLORS = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)', 'var(--z6)'];

// 24 hour cells coloured by which zone owns them.
function DayStrip({ zones }: { zones: Zone[] }) {
  const owner = (h: number) => {
    let idx = zones.length - 1;
    zones.forEach((z, i) => { if (z.start_hour <= h) idx = i; });
    return idx;
  };
  return (
    <div className="daystrip" aria-label="Which text is used at each hour">
      <div className="daystrip-cells">
        {Array.from({ length: 24 }, (_, h) => {
          const i = owner(h);
          return <div key={h} style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} title={`${hourLabel(h)}: ${zones[i].label}`} />;
        })}
      </div>
      <div className="daystrip-axis small muted">
        <span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>12 am</span>
      </div>
      <div className="legend small">
        {zones.map((z, i) => (
          <span key={z.key}><i style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />{z.label}</span>
        ))}
      </div>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
}

function ZoneCard({ zone, endHour, isNew, canDelete, onSaved, onCancel, onDirtyChange }: {
  zone: Zone;
  endHour?: number;
  isNew?: boolean;
  canDelete: boolean;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
  onDirtyChange: (key: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Zone>(zone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => { setDraft(zone); }, [zone]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(zone);
  const dirtyKey = isNew ? '__new' : zone.key;
  useEffect(() => onDirtyChange(dirtyKey, dirty), [dirtyKey, dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(dirtyKey, false), [dirtyKey, onDirtyChange]);

  const set = (patch: Partial<Zone>) => setDraft((d) => ({ ...d, ...patch }));
  const setBody = (i: number, value: string) => set({ bodies: draft.bodies.map((b, j) => (j === i ? value : b)) });
  const filledBodies = draft.bodies.filter((b) => b.trim());
  const preview = filledBodies[previewIndex % Math.max(filledBodies.length, 1)] ?? '';

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const key = isNew ? slug(draft.label) : zone.key;
      if (!key) throw new Error('Give it a name first');
      await callAdmin('admin-notifications', { action: 'save_zone', ...draft, key, bodies: filledBodies });
      await onSaved();
      if (!isNew) setMessage({ kind: 'ok', text: 'Saved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`Delete "${zone.label}"? Its hours will use the previous time of day's text.`)) return;
    setBusy(true);
    try {
      await callAdmin('admin-notifications', { action: 'delete_zone', key: zone.key });
      await onSaved();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
      setBusy(false);
    }
  }

  return (
    <div className="card zone">
      <div className="zone-grid">
        <div className="stack">
          <div className="row">
            <label className="field grow">
              <span>Name</span>
              <input value={draft.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Late night" />
            </label>
            <label className="field">
              <span>Starts at</span>
              <select value={draft.start_hour} onChange={(e) => set({ start_hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
          </div>
          {!isNew && endHour !== undefined && (
            <div className="small muted">Used for reminders from {hourLabel(zone.start_hour)} until {hourLabel(endHour)}</div>
          )}
          <label className="field">
            <span>Title</span>
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} />
          </label>
          <div className="field">
            <span>Messages <em className="muted">(a different one each day)</em></span>
            {draft.bodies.map((b, i) => (
              <div className="row" key={i}>
                <textarea
                  className="grow body-input"
                  rows={2}
                  value={b}
                  onChange={(e) => setBody(i, e.target.value)}
                  onFocus={() => b.trim() && setPreviewIndex(filledBodies.indexOf(b))}
                  maxLength={200}
                  aria-label={`Message ${i + 1}`}
                />
                {draft.bodies.length > 1 && (
                  <button className="btn ghost small" aria-label={`Remove message ${i + 1}`} onClick={() => set({ bodies: draft.bodies.filter((_, j) => j !== i) })}>✕</button>
                )}
              </div>
            ))}
            <button className="btn ghost small self-start" onClick={() => set({ bodies: [...draft.bodies, ''] })}>+ Add a message</button>
          </div>
        </div>

        <div className="preview-col">
          <div className="small muted">Preview</div>
          <NotifPreview title={draft.title} body={preview} />
          {filledBodies.length > 1 && (
            <button className="btn ghost small" onClick={() => setPreviewIndex((i) => i + 1)}>Next message ({(previewIndex % filledBodies.length) + 1}/{filledBodies.length})</button>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={busy || (!dirty && !isNew) || !draft.title.trim() || !draft.label.trim() || filledBodies.length === 0} onClick={save}>
          {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
        </button>
        {isNew
          ? <button className="btn ghost" onClick={onCancel}>Cancel</button>
          : <button className="btn ghost" disabled={!dirty || busy} onClick={() => setDraft(zone)}>Discard</button>}
        {!isNew && canDelete && <button className="btn ghost danger push" disabled={busy} onClick={remove}>Delete</button>}
      </div>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}
    </div>
  );
}

function DaysAhead({ value, onSaved }: { value: number; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => setDraft(String(value)), [value]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await callAdmin('admin-notifications', { action: 'save_setting', key: 'days_ahead', value: Number(draft) });
      await onSaved();
      setMessage({ kind: 'ok', text: 'Saved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <h2>How far ahead phones schedule</h2>
      <p className="muted small">
        Each phone schedules this many days of reminders at a time. More days means reminders keep coming for longer
        if someone stops opening the app. Fewer days means text changes reach phones sooner. Between 1 and 30.
      </p>
      <div className="row">
        <input className="num-input" type="number" min={1} max={30} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Days ahead" />
        <span className="muted">days</span>
        <button className="btn primary" disabled={busy || draft === String(value)} onClick={save}>Save</button>
      </div>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}
    </div>
  );
}

function NotifPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="phone-notif">
      <div className="phone-notif-head"><span className="app-dot" />WABII<span className="muted">now</span></div>
      <div className="phone-notif-title">{title || 'Title'}</div>
      <div className="phone-notif-body">{body || 'Message'}</div>
    </div>
  );
}

function MessageCard({ message, onSaved, onDirtyChange }: {
  message: NotificationMessage;
  onSaved: () => Promise<void>;
  onDirtyChange: (key: string, dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(message.title);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => { setTitle(message.title); setBody(message.body); }, [message.title, message.body]);

  const dirty = title !== message.title || body !== message.body;
  useEffect(() => onDirtyChange(message.key, dirty), [message.key, dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(message.key, false), [message.key, onDirtyChange]);

  async function run(action: 'save_message' | 'reset_message') {
    if (action === 'reset_message' && !confirm(`Put "${message.label}" back to the original text?`)) return;
    setBusy(true);
    setStatus(null);
    try {
      await callAdmin('admin-notifications', { action, key: message.key, title, body });
      await onSaved();
      setStatus({ kind: 'ok', text: action === 'save_message' ? 'Saved.' : 'Restored the original text.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <div className="card zone">
      <div className="zone-grid">
        <div className="stack">
          <div>
            <h2>{message.label} {message.is_default && <span className="pill">Original text</span>}</h2>
            <p className="muted small">{message.description}</p>
          </div>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea className="body-input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={200} />
          </label>
        </div>
        <div className="preview-col">
          <div className="small muted">Preview</div>
          <NotifPreview title={title} body={body} />
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" disabled={busy || !dirty || !title.trim() || !body.trim()} onClick={() => run('save_message')}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn ghost" disabled={busy || !dirty} onClick={() => { setTitle(message.title); setBody(message.body); }}>Discard</button>
        {!message.is_default && (
          <button className="btn ghost push" disabled={busy} onClick={() => run('reset_message')}>Restore original text</button>
        )}
      </div>
      {status && <Banner kind={status.kind}>{status.text}</Banner>}
    </div>
  );
}
