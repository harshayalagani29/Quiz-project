import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function StudentResult() {
  const { id } = useParams(); const [s, setS] = useState<any>(null); const [missing, setMissing] = useState(false);
    useEffect(() => { supabase.auth.getUser().then(({ data: a }) => supabase.from('quiz_sessions').select('*').eq('quiz_id', id).eq('user_id', a.user?.id ?? '').maybeSingle().then(({ data }) => (data ? setS(data) : setMissing(true)))); }, [id]);
  if (missing) return <p className="p-10">Result not found. <Link className="underline" to="/student/login">Back</Link></p>;
  if (!s) return <p className="p-10 text-zinc-400">Loading…</p>;
  const pct = s.total_marks ? Math.round((s.score / s.total_marks) * 100) : 0;
  const row = (l: string, v: number) => <div className="flex justify-between border-b border-white/10 py-2"><span className="text-zinc-400">{l}</span><b>{v}</b></div>;
  return (
    <main className="grid min-h-screen place-items-center p-4"><div className="glass w-full max-w-md space-y-4 p-8 text-center">
      <p className="text-zinc-400">{s.student_name} · {s.student_id}</p>
      <p className="font-display text-6xl font-bold">{s.score ?? 0} / {s.total_marks ?? 0}</p>
      <p className="font-display text-2xl text-accent">{pct}%</p>
      <div className="text-left">{row('Correct', s.correct_count ?? 0)}{row('Incorrect', s.incorrect_count ?? 0)}{row('Unanswered', s.unanswered_count ?? 0)}</div>
      <Link to="/student/login" className="btn-ghost">Done</Link>
    </div></main>
  );
}
