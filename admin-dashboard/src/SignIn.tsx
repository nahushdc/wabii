import { useState } from 'react';
import { supabase } from './api';

// Same accounts as the app. Google needs this page's address in Supabase's
// allowed redirect URLs (Authentication → URL Configuration).
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  async function withGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="centered">
      <div className="card narrow">
        <div className="brand">Wabii <span>Control panel</span></div>
        <h1>Sign in</h1>
        <p className="muted">Use your Wabii account. Only admins can get in.</p>
        <button className="btn wide" onClick={withGoogle}>Continue with Google</button>
        <div className="or"><span>or</span></div>
        <form className="stack" onSubmit={withPassword}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
