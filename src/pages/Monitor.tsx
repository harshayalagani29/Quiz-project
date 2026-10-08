import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type S = { id: string; student_name: string; student_id: string; status: string; joined_at: string; last_active_at: string; score: number | null; total_marks: number | null };
type L = { id: string; session_id: string; event_type: string; event_timestamp: string; source: string };

const label: Record<string, string> = {
  QUIZ_JOINED: 'Quiz joined', QUIZ_STARTED: 'Quiz started',
  TAB_HIDDEN: 'Quiz page lost focus — external app/browser activity suspected', TAB_VISIBLE: 'Quiz page regained focus',
  WINDOW_BLUR: 'Quiz window lost focus — external app/browser activity suspected', WINDOW_FOCUS: 'Quiz window regained focus',
  FULLSCREEN_EXIT: 'Fullscreen exited',
  COPY: 'Copy attempt', PASTE: 'Paste attempt', CUT: 'Cut attempt', PRINT_SHORTCUT: 'Print shortcut', CONTEXT_MENU: 'Right-click attempt',
  SCREENSHOT_KEY: 'Screenshot key pressed (possible screenshot)',
  OFFLINE: 'Connection lost', ONLINE: 'Connection restored', SUBMITTED: 'Quiz submitted',
};
const benign = new Set(['QUIZ_JOINED', 'QUIZ_STARTED', 'TAB_VISIBLE', 'WINDOW_FOCUS', 'ONLINE', 'SUBMITTED']);
const look: Record<string, [string, string]> = {
  active: ['🟢 ACTIVE', 'border-emerald-500/40'], inactive: ['🟠 INACTIVE', 'border-amber-500/50'],
  flagged: ['🔴 SUSPICIOUS ACTIVITY', 'border-red-500 bg-red-500/15'], submitted: ['🔵 SUBMITTED', 'border-sky-500/40'], joined: ['⚪ JOINED', 'border-white/10'],
};
const t = (x: string) => new Date(x).toLocaleTimeString();

export default function Monitor() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<any>(null); const [ss, setSs] = useState<S[]>([]); const [logs, setLogs] = useState<L[]>([]);
  const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState(''); const [, tick] = useState(0);

  const load = useCallback(async () => {
    const [q, s, l] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', id).single(),
      supabase.from('quiz_sessions').select('*').eq('quiz_id', id).order('joined_at'),
      supabase.from('activity_logs').select('*').eq('quiz_id', id).order('event_timestamp', { ascending: false }).limit(300),
    ]);
    setQuiz(q.data); setSs(s.data ?? []); setLogs(l.data ?? []);
  }, [id]);

  useEffect(() => {
    load();
    const ch = supabase.channel('monitor-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions', filter: `quiz_id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `quiz_id=eq.${id}` }, load)
      .subscribe();
    const timer = setInterval(() => tick(n => n + 1), 5000);
    return () => { supabase.removeChannel(ch); clearInterval(timer); };
  }, [id, load]);

  const flagged = (sid: string) => logs.filter(l => l.session_id === sid && !benign.has(l.event_type)).length;
  const state = (s: S) => {
    if (s.status === 'submitted') return 'submitted';
    if (s.status === 'joined') return 'joined';
    if (flagged(s.id) >= 1) return 'flagged';
    const stale = Date.now() - new Date(s.last_active_at).getTime() > 40000; // no heartbeat
    return s.status === 'inactive' || stale ? 'inactive' : 'active';
  };
  const count = (k: string) => ss.filter(s => state(s) === k).length;
  const name = (sid: string) => ss.find(s => s.id === sid)?.student_name ?? 'Student';
  const totalEvents = logs.filter(l => !benign.has(l.event_type)).length;

  const removeStudent = async (s: S) => {
    if (!confirm(`Remove ${s.student_name} (${s.student_id}) with their answers and activity log?`)) return;
    const { error } = await supabase.from('quiz_sessions').delete().eq('id', s.id);
    setMsg(error ? 'Could not remove: ' + error.message : 'Student removed.'); load();
  };

  if (!quiz) return <p className="p-10 text-zinc-400">Loading…</p>;
  const kpi: [string, string | number][] = [['Joined', `${ss.length} / ${quiz.max_students}`], ['Active', count('active')], ['Inactive', count('inactive')], ['Suspicious', count('flagged')], ['Submitted', count('submitted')], ['Activity events', totalEvents]];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <Link to="/management/dashboard" className="text-sm text-zinc-400 hover:text-white">Back to dashboard</Link>
      <h1 className="font-display text-3xl font-bold">{quiz.title} <span className="text-base capitalize text-emerald-400">● {quiz.status}</span></h1>
      {msg && <p role="status" className="text-sm text-zinc-400">{msg}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{kpi.map(([k, v]) => (
        <div key={k} className="glass p-4"><p className="text-sm text-zinc-400">{k}</p><p className="font-display text-3xl">{v}</p></div>))}</div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ss.length === 0 && <p className="glass p-6 text-zinc-400 sm:col-span-3">No students have joined yet.</p>}
          {ss.map((s, i) => { const st = state(s); const mine = logs.filter(l => l.session_id === s.id).reverse(); return (
                        <article key={s.id} className={`glass border-2 p-4 ${flagged(s.id) >= 1 ? look.flagged[1] : look[st][1]}`}>
              <button className="w-full text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <p className="text-xs text-zinc-500">STUDENT {String(i + 1).padStart(2, '0')}</p>
                <p className="font-display text-lg">{s.student_name}</p>
                <p className="text-sm text-zinc-400">ID: {s.student_id}</p>
                                <p className="mt-2 text-sm font-medium">{st === 'submitted' && flagged(s.id) >= 1 ? '🔴 SUBMITTED · SUSPICIOUS ACTIVITY' : look[st][0]}</p>
                <p className="text-xs text-zinc-400">Joined {t(s.joined_at)} · Last active {t(s.last_active_at)}</p>
                <p className="text-xs text-zinc-400">Activity events: {flagged(s.id)}{st === 'submitted' && s.total_marks ? ` · Score ${s.score}/${s.total_marks}` : ''}</p>
              </button>
              <button className="btn-ghost mt-2 text-red-400" onClick={() => removeStudent(s)}>Remove student</button>
              {open === s.id && <ol className="mt-3 max-h-56 space-y-1 overflow-auto border-t border-white/10 pt-3 text-xs">
                {mine.map(l => <li key={l.id}><span className="text-zinc-500">{t(l.event_timestamp)}</span> {label[l.event_type] ?? l.event_type}</li>)}</ol>}
            </article>); })}
        </section>
        <aside className="glass max-h-[70vh] overflow-auto p-4">
          <h2 className="mb-3 font-display text-lg">Live activity</h2>
          <ul className="space-y-2 text-sm">{logs.slice(0, 40).map(l => (
            <li key={l.id}><span className="text-zinc-500">{t(l.event_timestamp)}</span> — <b>{name(l.session_id)}</b> {label[l.event_type] ?? l.event_type}</li>))}</ul>
        </aside>
      </div>
    </div>
  );
}