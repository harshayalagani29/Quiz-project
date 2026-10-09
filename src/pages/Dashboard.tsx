import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Play, Pause, Square, Plus, LogOut, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Quiz = { id: string; title: string; subject: string | null; code: string; status: string; max_students: number; duration_minutes: number; quiz_sessions: { count: number }[] };
const tone: Record<string, string> = { draft: 'text-zinc-400', live: 'text-emerald-400', paused: 'text-amber-400', ended: 'text-sky-400' };

export default function Dashboard() {
  const nav = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]); const [loading, setLoading] = useState(true); const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('quizzes').select('*, quiz_sessions(count)').order('created_at', { ascending: false });
    if (error) setMsg('Could not load quizzes. Check your connection and try again.'); else setQuizzes(data as Quiz[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); const ch = supabase.channel('quizzes-live').on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions' }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [load]);
  const setStatus = async (id: string, status: string) => { await supabase.from('quizzes').update({ status }).eq('id', id); load(); };
  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" with all its questions, students and activity? This cannot be undone.`)) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', id);
    setMsg(error ? 'Could not delete: ' + error.message : 'Quiz deleted.'); load();
  };
  const copy = (t: string, label: string) => { navigator.clipboard.writeText(t); setMsg(`${label} copied.`); };
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Examora <span className="text-zinc-500">/ Faculty</span></h1>
        <div className="flex gap-2">
          <Link to="/management/quizzes/create" className="btn"><Plus size={18} />Create quiz</Link>
          <button className="btn-ghost" onClick={async () => { await supabase.auth.signOut(); nav('/management/login'); }}><LogOut size={16} />Log out</button>
        </div>
      </header>
      {msg && <p role="status" className="mb-4 text-sm text-zinc-400">{msg}</p>}
      {loading ? <p className="text-zinc-400">Loading…</p> : quizzes.length === 0 ? (
        <div className="glass p-10 text-center"><p className="mb-4 text-zinc-300">No quizzes yet. Create your first quiz to get a join code.</p><Link to="/management/quizzes/create" className="btn">Create quiz</Link></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {quizzes.map(q => (
            <article key={q.id} className="glass space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-display text-xl font-semibold">{q.title}</h2><p className="text-sm text-zinc-400">{q.subject} · {q.duration_minutes} min</p></div>
                <span className={`text-sm font-medium capitalize ${tone[q.status]}`}>{q.status}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
                <span className="font-display text-2xl tracking-wider">{q.code}</span>
                <span className="text-sm text-zinc-400">{q.quiz_sessions[0]?.count ?? 0} / {q.max_students} joined</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => copy(q.code, 'Code')}><Copy size={14} />Copy code</button>
                <button className="btn-ghost" onClick={() => copy(`${location.origin}/join/${q.code}`, 'Link')}><Copy size={14} />Copy link</button>
                <button className="btn-ghost" disabled={q.status === 'ended'} onClick={() => setStatus(q.id, 'live')}><Play size={14} />{q.status === 'paused' ? 'Resume' : 'Start'}</button>
                <button className="btn-ghost" disabled={q.status !== 'live'} onClick={() => setStatus(q.id, 'paused')}><Pause size={14} />Pause</button>
                <button className="btn-ghost" disabled={q.status === 'ended' || q.status === 'draft'} onClick={() => setStatus(q.id, 'ended')}><Square size={14} />End</button>
                <Link to={`/management/monitor/${q.id}`} className="btn-ghost">Monitor live</Link>
                <button className="btn-ghost text-red-400" onClick={() => remove(q.id, q.title)}><Trash2 size={14} />Delete</button>
                <Link to={`/management/results/${q.id}`} className="btn-ghost">Results</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}