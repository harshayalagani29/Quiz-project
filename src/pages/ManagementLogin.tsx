import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ManagementLogin() {
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const checkRole = async (userId: string) => {
    const { data: p } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (p?.role !== 'management') { await supabase.auth.signOut(); return false; }
    return true;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    if (mode === 'signup') {
      if (password.length < 8) { setErr('Password must be at least 8 characters.'); setBusy(false); return; }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, faculty_code: code.trim() } } });
      if (error || !data.user) { setErr(error?.message ?? 'Could not create the account.'); setBusy(false); return; }
      if (!data.session) { setErr('Account created. Check your email to confirm it, then sign in.'); setMode('login'); setBusy(false); return; }
      if (!(await checkRole(data.user.id))) { setErr('Faculty access code is incorrect. Ask the administrator for the code.'); setBusy(false); return; }
      nav('/management/dashboard'); return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) { setErr('Email or password is incorrect.'); setBusy(false); return; }
    if (!(await checkRole(data.user.id))) { setErr('This account does not have faculty access.'); setBusy(false); return; }
    nav('/management/dashboard');
  };

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="glass w-full max-w-md space-y-4 p-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">Examora</h1>
        <p className="text-zinc-400">{mode === 'login' ? 'Faculty sign in' : 'Faculty sign up'}</p>
        {mode === 'signup' && <label className="block text-sm">Full name<input className="input mt-1" required value={name} onChange={e => setName(e.target.value)} /></label>}
        <label className="block text-sm">Email<input className="input mt-1" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block text-sm">Password<input className="input mt-1" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {mode === 'signup' && <label className="block text-sm">Faculty access code<input className="input mt-1" required value={code} onChange={e => setCode(e.target.value)} /></label>}
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create faculty account'}</button>
        <button type="button" className="block w-full text-center text-sm text-zinc-400 hover:text-white" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }}>
          {mode === 'login' ? 'New faculty? Sign up' : 'Already registered? Sign in'}
        </button>
      </form>
    </main>
  );
}