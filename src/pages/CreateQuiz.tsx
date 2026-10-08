import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Q = { text: string; a: string; b: string; c: string; d: string; correct: 'A' | 'B' | 'C' | 'D'; marks: number };
const blank = (): Q => ({ text: '', a: '', b: '', c: '', d: '', correct: 'A', marks: 1 });

export default function CreateQuiz() {
  const nav = useNavigate(); const { session } = useAuth();
  const [f, setF] = useState({ title: '', subject: '', description: '', duration: 30, max: 60, randQ: true, randO: true, nav: true, fs: true, mon: true });
  const [qs, setQs] = useState<Q[]>([blank()]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const upd = (i: number, p: Partial<Q>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const move = (i: number, d: number) => { const n = [...qs]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setQs(n); };

  const save = async () => {
    setErr('');
    if (!f.title.trim()) return setErr('Add a quiz title.');
    if (qs.some(q => !q.text.trim() || !q.a.trim() || !q.b.trim() || !q.c.trim() || !q.d.trim())) return setErr('Fill in every question and all four options.');
    setBusy(true);
    const { data: quiz, error } = await supabase.from('quizzes').insert({ title: f.title, subject: f.subject, description: f.description, duration_minutes: f.duration, max_students: f.max,
      randomize_questions: f.randQ, randomize_options: f.randO, allow_navigation: f.nav, enable_fullscreen: f.fs, enable_monitoring: f.mon, created_by: session!.user.id }).select().single();
    if (error || !quiz) { setErr('Could not save the quiz: ' + (error?.message ?? 'unknown error')); setBusy(false); return; }
    const { data: rows, error: e2 } = await supabase.from('questions').insert(qs.map((q, i) => ({ quiz_id: quiz.id, question_text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, marks: q.marks, order_number: i }))).select('id, order_number');
    if (e2 || !rows) { setErr('Quiz saved but questions failed. Delete it from the dashboard and retry.'); setBusy(false); return; }
    const { error: e3 } = await supabase.from('question_keys').insert(rows.map(r => ({ question_id: r.id, correct_answer: qs[r.order_number].correct })));
    if (e3) { setErr('Answer keys failed to save. Try again.'); setBusy(false); return; }
    nav('/management/dashboard');
  };
  const T = (k: 'randQ' | 'randO' | 'nav' | 'fs' | 'mon', label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[k]} onChange={e => setF({ ...f, [k]: e.target.checked })} />{label}</label>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <Link to="/management/dashboard" className="text-sm text-zinc-400 hover:text-white">Back to dashboard</Link>
      <h1 className="font-display text-3xl font-bold">Create quiz</h1>
      <section className="glass grid gap-4 p-6 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Title<input className="input mt-1" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="text-sm">Subject<input className="input mt-1" value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></label>
        <label className="text-sm">Duration (minutes)<input className="input mt-1" type="number" min={1} value={f.duration} onChange={e => setF({ ...f, duration: +e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Description<textarea className="input mt-1" rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
        <label className="text-sm">Maximum students<input className="input mt-1" type="number" min={1} max={60} value={f.max} onChange={e => setF({ ...f, max: Math.min(60, +e.target.value) })} /></label>
        <div className="grid grid-cols-2 gap-2 self-end">{T('randQ', 'Randomize questions')}{T('randO', 'Randomize options')}{T('nav', 'Allow navigation')}{T('fs', 'Require fullscreen')}{T('mon', 'Activity monitoring')}</div>
      </section>
      {qs.map((q, i) => (
        <section key={i} className="glass space-y-3 p-6">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg">Question {i + 1}</h2>
            <div className="flex gap-1">
              <button aria-label="Move up" className="btn-ghost" onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
              <button aria-label="Move down" className="btn-ghost" onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
              <button aria-label="Duplicate" className="btn-ghost" onClick={() => setQs([...qs.slice(0, i + 1), { ...q }, ...qs.slice(i + 1)])}><Copy size={14} /></button>
              <button aria-label="Delete" className="btn-ghost" disabled={qs.length === 1} onClick={() => setQs(qs.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div></div>
          <textarea className="input" rows={2} placeholder="Question text" value={q.text} onChange={e => upd(i, { text: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {(['a', 'b', 'c', 'd'] as const).map(k => <input key={k} className="input" placeholder={`Option ${k.toUpperCase()}`} value={q[k]} onChange={e => upd(i, { [k]: e.target.value })} />)}
          </div>
          <div className="flex gap-4 text-sm">
            <label>Correct answer <select className="input ml-2 w-auto" value={q.correct} onChange={e => upd(i, { correct: e.target.value as Q['correct'] })}>{['A', 'B', 'C', 'D'].map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Marks <input className="input ml-2 w-20" type="number" min={1} value={q.marks} onChange={e => upd(i, { marks: +e.target.value })} /></label>
          </div>
        </section>
      ))}
      {err && <p role="alert" className="text-red-400">{err}</p>}
      <div className="flex gap-3"><button className="btn-ghost" onClick={() => setQs([...qs, blank()])}><Plus size={16} />Add question</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save quiz (${qs.length} questions)`}</button></div>
    </div>
  );
}
