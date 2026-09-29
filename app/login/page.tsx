'use client';

import { useState, type FormEvent } from 'react';

/** Seules les adresses internes : « next » ne doit pas pouvoir renvoyer ailleurs. */
function destination(): string {
  const next = new URLSearchParams(window.location.search).get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function Login() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setProblem(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.replace(destination());
      return;
    }
    const body = await res?.json().catch(() => ({}));
    setProblem(body?.error ?? 'Connexion impossible.');
    setPassword('');
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="panel w-full max-w-xs space-y-4 p-6">
        <h1 className="eyebrow">Tableau du jour</h1>
        <label className="block space-y-1.5">
          <span className="text-[13px] text-muted">Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            className="w-full border border-rule bg-transparent px-2 py-1.5 text-sm text-ink focus:border-amber focus:outline-none disabled:opacity-50"
          />
        </label>
        {problem && (
          <p role="alert" className="text-[13px] text-rose">
            {problem}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full border border-rule py-1.5 font-mono text-xs text-ink transition-colors hover:bg-panel-soft disabled:opacity-50"
        >
          {busy ? 'Connexion…' : 'Entrer'}
        </button>
      </form>
    </div>
  );
}
