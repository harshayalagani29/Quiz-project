import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deviceInfo, ensureStudentAuth, supabase } from '../lib/supabase';

export const friendly = (m: string) =>
  m.includes('INVALID_CODE') ? 'Invalid quiz code. Check it and try again.' :
  m.includes('QUIZ_ENDED') ? 'This quiz has ended.' :
  m.includes('QUIZ_FULL') ? 'Quiz capacity reached.' :
  m.includes('DUPLICATE_SESSION') ? 'This student is already participating in this quiz.' :
  m.includes('QUIZ_PAUSED') ? 'Quiz temporarily paused by faculty.' :
  m.includes('QUIZ_NOT_STARTED') ? 'The quiz has not started yet. Please wait for faculty.' :
  'Something went wrong. Check your connection and try again.';

export default function StudentLogin() {
  const nav = useNavigate(); const { code: urlCode } = useParams();
  const [name, setName] = useState(''); const [usn, setUsn] = useState(''); const [code, setCode] = useState(urlCode ?? '');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
           await ensureStudentAuth();
      const { data: u } = await supabase.auth.getUser();
      const { data: mine } = await supabase.from('quiz_sessions').select('student_id').eq('user_id', u.user?.id ?? '');
      if (mine && mine.length > 0 && !mine.some(m => m.student_id === usn.trim().toUpperCase())) {
        await supabase.auth.signOut(); await supabase.auth.signInAnonymously(); // a different student on this browser gets a fresh account
      }
      const { data, error } = await supabase.rpc('join_quiz', { p_code: code.trim(), p_name: name.trim(), p_student_id: usn.trim().toUpperCase(), p_device: deviceInfo() });
      if (error) throw error;
      const { data: s, error: e2 } = await supabase.from('quiz_sessions').select('quiz_id').eq('id', data).single();
      if (e2 || !s) throw e2;
      nav(`/student/quiz/${s.quiz_id}`);
      } catch (x: any) { setErr(friendly(x?.message ?? '') + ' [' + (x?.message ?? 'no message') + ']'); setBusy(false); }
  };
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="glass w-full max-w-md space-y-4 p-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">Examora</h1>
        <p className="text-zinc-400">Join your quiz</p>
        <label className="block text-sm">Student name<input className="input mt-1" required value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block text-sm">Student ID / USN<input className="input mt-1 uppercase" required value={usn} onChange={e => setUsn(e.target.value)} /></label>
        <label className="block text-sm">Quiz code<input className="input mt-1 uppercase" required placeholder="EXM-XXXX" value={code} onChange={e => setCode(e.target.value)} /></label>
        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Joining…' : 'Join Quiz'}</button>
        <Link to="/management/login" className="block text-center text-sm text-zinc-500 hover:text-white">Faculty login</Link>
      </form>
    </main>
  );
}
