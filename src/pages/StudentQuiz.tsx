import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ensureStudentAuth, supabase } from '../lib/supabase';
import { useExamMonitor } from '../hooks/useExamMonitor';
import { friendly } from './StudentLogin';

type Qn = { id: string; question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; marks: number };
const seeded = <T,>(arr: T[], seed: string) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0; const r = () => ((h = (h * 1664525 + 1013904223) | 0) >>> 0) / 4294967296; const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');

export default function StudentQuiz() {
  const { id } = useParams(); const nav = useNavigate();
  const [quiz, setQuiz] = useState<any>(null); const [sess, setSess] = useState<any>(null);
  const [qs, setQs] = useState<Qn[]>([]); const [ans, setAns] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0); const [review, setReview] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState<number | null>(null); const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState(''); const [warn, setWarn] = useState(''); const [sync, setSync] = useState<'saved' | 'saving' | 'offline'>('saved');
  const pending = useRef<Record<string, string>>({}); const submitting = useRef(false);
  const running = deadline !== null;

  const load = useCallback(async () => {
    await ensureStudentAuth();
        const { data: auth } = await supabase.auth.getUser();
    const { data: s } = await supabase.from('quiz_sessions').select('*').eq('quiz_id', id).eq('user_id', auth.user?.id ?? '').maybeSingle();
        if (!s) { setMsg('No quiz session found for this login. Account: ' + (auth.user?.id ?? 'none') + (auth.user?.is_anonymous ? ' (student)' : ' (NOT a student account)')); return; }
    if (s.status === 'submitted') { nav(`/student/result/${id}`); return; }
    const { data: q } = await supabase.from('quizzes').select('*').eq('id', id).single();
    setSess(s); setQuiz(q);
  }, [id, nav]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (running) return; const t = setInterval(load, 4000); return () => clearInterval(t); }, [running, load]);

  const begin = async () => {
    if (quiz.enable_fullscreen) document.documentElement.requestFullscreen?.().catch(() => {}); // must run inside the click
    const { data: dl, error } = await supabase.rpc('start_attempt', { p_session: sess.id });
    if (error) { setMsg(friendly(error.message)); return; }
    const { data: rows } = await supabase.from('questions').select('*').eq('quiz_id', id).order('order_number');
    const { data: old } = await supabase.from('answers').select('question_id, selected_answer').eq('session_id', sess.id);
    setQs(quiz.randomize_questions ? seeded(rows ?? [], sess.id) : rows ?? []);
    setAns(Object.fromEntries((old ?? []).map(a => [a.question_id, a.selected_answer])));
        supabase.from('activity_logs').insert({ session_id: sess.id, quiz_id: id, student_id: sess.student_id, source: 'web', event_type: 'QUIZ_STARTED' }).then(() => {});
    setDeadline(new Date(dl).getTime()); setMsg('');
  };

  const flush = useCallback(async () => {
    const entries = Object.entries(pending.current); if (!entries.length || !sess) return;
    setSync('saving');
    const { error } = await supabase.from('answers').upsert(entries.map(([question_id, selected_answer]) => ({ session_id: sess.id, question_id, selected_answer })), { onConflict: 'session_id,question_id' });
    if (error) { setSync('offline'); return; }
    entries.forEach(([k, v]) => { if (pending.current[k] === v) delete pending.current[k]; });
    setSync('saved');
  }, [sess]);
  useEffect(() => { const t = setInterval(flush, 5000); window.addEventListener('online', flush); return () => { clearInterval(t); window.removeEventListener('online', flush); }; }, [flush]);
  const pick = (qid: string, a: string) => { setAns(p => ({ ...p, [qid]: a })); pending.current[qid] = a; flush(); };

  const submit = useCallback(async () => {
    if (submitting.current) return; submitting.current = true;
    await flush();
    const { error } = await supabase.rpc('submit_quiz', { p_session: sess.id });
    if (error) { setMsg('Connection lost — attempting to reconnect.'); submitting.current = false; return; }
    if (document.fullscreenElement) document.exitFullscreen();
    nav(`/student/result/${id}`);
  }, [flush, sess, id, nav]);

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => { const s = Math.max(0, Math.round((deadline - Date.now()) / 1000)); setLeft(s); if (s === 0) submit(); }, 500);
    return () => clearInterval(t);
  }, [deadline, submit]);

  const onWarn = useCallback((m: string) => { setWarn(m); setTimeout(() => setWarn(''), 4000); }, []);
  useExamMonitor({ sessionId: sess?.id ?? '', quizId: id ?? '', studentId: sess?.student_id ?? '', enabled: running && !!quiz?.enable_monitoring, onWarn });

   if (!quiz || !sess) return <p className="p-10 text-zinc-400">{msg || 'Loading…'}</p>;
  if (!running) {
    const state = quiz.status === 'live' ? null : quiz.status === 'paused' ? 'Quiz temporarily paused by faculty.' : quiz.status === 'ended' ? 'This quiz has ended.' : 'Waiting for faculty to start the quiz…';
    return (
      <main className="grid min-h-screen place-items-center p-4"><div className="glass w-full max-w-lg space-y-4 p-8">
        <h1 className="font-display text-3xl font-bold">{quiz.title}</h1>
        <p className="text-zinc-400">{quiz.subject} · {quiz.duration_minutes} minutes · {sess.student_name} ({sess.student_id})</p>
        {quiz.enable_monitoring && <p className="rounded-xl bg-black/30 p-3 text-sm text-zinc-300">Quiz activity monitoring is enabled. The system records quiz-session events such as focus changes, fullscreen exits, and submission activity.</p>}
        {(state || msg) && <p role="status" className="text-amber-400">{state ?? msg}</p>}
        <button className="btn w-full" disabled={quiz.status !== 'live'} onClick={begin}>{sess.started_at ? 'Resume quiz' : 'Start quiz'}</button>
      </div></main>
    );
  }

  const q = qs[idx]; const opts: [string, string][] = q ? [['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]] : [];
  return (
    <main className="mx-auto min-h-screen max-w-3xl select-none space-y-4 p-4 sm:p-8">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl font-bold">Examora</span>
        <span className={`font-display text-3xl tabular-nums ${left <= 300 ? 'text-red-400' : ''}`} aria-live="off">{fmt(left)}</span>
      </header>
      {(warn || sync === 'offline' || msg) && <p role="alert" className="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-300">{warn || (sync === 'offline' ? 'Connection lost — attempting to reconnect. Answers will sync when back online.' : msg)}</p>}
      {q && <section className="glass space-y-5 p-6">
        <p className="text-sm text-zinc-400">QUESTION {idx + 1} OF {qs.length} · {q.marks} mark{q.marks > 1 ? 's' : ''}</p>
        <h2 className="font-display text-xl">{q.question_text}</h2>
        <div className="space-y-2">{opts.map(([k, t]) => (
          <button key={k} onClick={() => pick(q.id, k)} className={`w-full rounded-xl border px-4 py-3 text-left transition ${ans[q.id] === k ? 'border-accent bg-accent/15' : 'border-white/10 hover:bg-white/5'}`}><b className="mr-2">{k}.</b>{t}</button>))}</div>
        <div className="flex flex-wrap items-center gap-2">
          {quiz.allow_navigation && <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>}
          <button className="btn-ghost" disabled={idx === qs.length - 1} onClick={() => setIdx(idx + 1)}>Next</button>
          <button className="btn-ghost" onClick={() => setReview(p => { const n = new Set(p); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}>{review.has(q.id) ? 'Unmark review' : 'Mark for review'}</button>
          <span className="ml-auto text-xs text-zinc-500">{sync === 'saved' ? 'All answers saved' : sync === 'saving' ? 'Saving…' : 'Not synced'}</span>
        </div>
      </section>}
      {quiz.allow_navigation && <nav className="flex flex-wrap gap-2" aria-label="Question navigator">{qs.map((x, i) => (
        <button key={x.id} onClick={() => setIdx(i)} className={`h-9 w-9 rounded-lg border text-sm ${i === idx ? 'border-accent' : 'border-white/10'} ${review.has(x.id) ? 'bg-amber-500/30' : ans[x.id] ? 'bg-accent/30' : ''}`}>{i + 1}</button>))}</nav>}
      <button className="btn w-full" onClick={() => { if (confirm(`Submit now? ${qs.length - Object.keys(ans).length} unanswered.`)) submit(); }}>Submit</button>
    </main>
  );
}
