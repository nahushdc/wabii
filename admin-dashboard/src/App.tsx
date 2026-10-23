import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configError, MOCK, supabase } from './api';
import SignIn from './SignIn';
import Prompts from './Prompts';
import Notifications from './Notifications';
import Voice from './Voice';

const TABS = [
  { id: 'prompts', label: 'Prompts' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'voice', label: 'Voice & Deepgram' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function readTab(): TabId {
  const hash = location.hash.slice(1);
  return (TABS.find((t) => t.id === hash)?.id ?? 'prompts') as TabId;
}

type AdminState = 'checking' | 'yes' | 'no' | { error: string };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(MOCK ? null : undefined);
  const [admin, setAdmin] = useState<AdminState>(MOCK ? 'yes' : 'checking');
  const [tab, setTab] = useState<TabId>(readTab);

  useEffect(() => {
    if (MOCK) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (MOCK || !session) return;
    setAdmin('checking');
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (error) setAdmin({ error: error.message });
      else setAdmin(data === true ? 'yes' : 'no');
    });
  }, [session?.user.id]);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (configError) return <Centered title="Not configured">{configError}</Centered>;
  if (session === undefined) return <Centered title="Loading…" />;
  if (!MOCK && !session) return <SignIn />;

  if (admin === 'checking') return <Centered title="Checking access…" />;
  if (admin !== 'yes') {
    const message = admin === 'no'
      ? `${session?.user.email} isn't an admin. Add the account to admin_users in Supabase.`
      : `Couldn't check admin access: ${admin.error}. Run supabase/sql/admin_foundation.sql first.`;
    return (
      <Centered title="No access">
        {message}
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </Centered>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Wabii <span>Control panel</span></div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="who">
          {MOCK ? <span className="pill warn">Sample data</span> : <span className="muted small">{session?.user.email}</span>}
          {!MOCK && <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Sign out</button>}
        </div>
      </header>
      {MOCK && (
        <div className="mock-banner" role="note">
          Sample data. Every number and piece of text here is made up for testing, not your real Wabii or Deepgram data.
          Nothing you save here is kept.
        </div>
      )}
      <main className="page">
        {tab === 'prompts' && <Prompts />}
        {tab === 'notifications' && <Notifications />}
        {tab === 'voice' && <Voice />}
      </main>
    </div>
  );
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="centered">
      <div className="card narrow">
        <h1>{title}</h1>
        {children && <div className="stack">{children}</div>}
      </div>
    </div>
  );
}
