import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ManagementLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) { setErr('Email or password is incorrect.'); setBusy(false); return; }
    const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    if (p?.role !== 'management') { await supabase.auth.signOut(); setErr('This account does not have faculty access.'); setBusy(false); return; }
    nav('/management/dashboard');
  };
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="glass w-full max-w-md space-y-4 p-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">Examora</h1>
        <p className="text-zinc-400">Faculty sign in</p>
        <label className="block text-sm">Email<input className="input mt-1" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block text-sm">Password<input className="input mt-1" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
