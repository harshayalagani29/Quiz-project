import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../lib/supabase';

const benign = new Set(['QUIZ_JOINED', 'QUIZ_STARTED', 'TAB_VISIBLE', 'WINDOW_FOCUS', 'ONLINE', 'SUBMITTED']);
type Row = { id: string; name: string; usn: string; score: number | null; total: number | null; pct: number | null; secs: number | null; events: number; status: string };
const fmt = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
const tip = { contentStyle: { background: '#14161a', border: '1px solid #333', borderRadius: 8 } };

export default function Results() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<any>(null); const [rows, setRows] = useState<Row[]>([]);
  const [sort, setSort] = useState<{ k: keyof Row; asc: boolean }>({ k: 'pct', asc: false });
  const [q, setQ] = useState(''); const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      const [qz, ss, lg] = await Promise.all([
        supabase.from('quizzes').select('*').eq('id', id).single(),
        supabase.from('quiz_sessions').select('*').eq('quiz_id', id),
        supabase.from('activity_logs').select('session_id, event_type').eq('quiz_id', id).limit(5000),
      ]);
      const ev: Record<string, number> = {};
      (lg.data ?? []).forEach(l => { if (!benign.has(l.event_type)) ev[l.session_id] = (ev[l.session_id] ?? 0) + 1; });
      setQuiz(qz.data);
      setRows((ss.data ?? []).map(s => ({
        id: s.id, name: s.student_name, usn: s.student_id, score: s.score, total: s.total_marks,
        pct: s.status === 'submitted' && s.total_marks ? Math.round((s.score / s.total_marks) * 100) : null,
        secs: s.submitted_at && s.started_at ? (new Date(s.submitted_at).getTime() - new Date(s.started_at).getTime()) / 1000 : null,
        events: ev[s.id] ?? 0, status: s.status === 'submitted' ? 'Submitted' : s.status === 'joined' ? 'Joined' : 'In progress',
      })));
    })();
  }, [id]);

  const shown = useMemo(() => rows
    .filter(r => (filter === 'all' || r.status === filter) && (r.name + r.usn).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => { const x = a[sort.k] ?? -1, y = b[sort.k] ?? -1; return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1); }), [rows, q, filter, sort]);

  const done = rows.filter(r => r.status === 'Submitted');
  const pcts = done.map(r => r.pct ?? 0); const times = done.map(r => r.secs).filter((x): x is number => x !== null);
  const avg = (a: number[]) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : 0);
  const stats: [string, string][] = [
    ['Submissions', `${done.length} / ${rows.length}`], ['Average score', done.length ? `${Math.round(avg(pcts))}%` : '—'],
    ['Highest', done.length ? `${Math.max(...pcts)}%` : '—'], ['Lowest', done.length ? `${Math.min(...pcts)}%` : '—'],
    ['Avg time', times.length ? fmt(avg(times)) : '—'], ['Activity events', String(rows.reduce((p, r) => p + r.events, 0))],
    ['Participation', quiz ? `${rows.length} / ${quiz.max_students}` : '—'],
  ];
  const dist = ['0–20%', '21–40%', '41–60%', '61–80%', '81–100%'].map((n, i) => ({ n, count: pcts.filter(p => (i === 0 ? p <= 20 : p > i * 20 && p <= (i + 1) * 20)).length }));
  const status = ['Submitted', 'In progress', 'Joined'].map(n => ({ n, v: rows.filter(r => r.status === n).length })).filter(x => x.v > 0);
  const events = rows.filter(r => r.events > 0).sort((a, b) => b.events - a.events).slice(0, 10).map(r => ({ n: r.name, v: r.events }));
  const colors = ['#8f86ff', '#f59e0b', '#71717a'];

  const heads: [keyof Row, string][] = [['name', 'Student'], ['usn', 'Student ID'], ['score', 'Score'], ['pct', 'Percentage'], ['secs', 'Time taken'], ['events', 'Activity events'], ['status', 'Status']];
  if (!quiz) return <p className="p-10 text-zinc-400">Loading…</p>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <Link to="/management/dashboard" className="text-sm text-zinc-400 hover:text-white">Back to dashboard</Link>
      <h1 className="font-display text-3xl font-bold">{quiz.title} <span className="text-zinc-500">/ Results</span></h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{stats.map(([k, v]) => (
        <div key={k} className="glass p-4"><p className="text-sm text-zinc-400">{k}</p><p className="font-display text-2xl">{v}</p></div>))}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass p-4"><h2 className="mb-2 font-display">Score distribution</h2><div className="h-56"><ResponsiveContainer><BarChart data={dist}><CartesianGrid stroke="#ffffff15" /><XAxis dataKey="n" stroke="#a1a1aa" fontSize={11} /><YAxis allowDecimals={false} stroke="#a1a1aa" /><Tooltip {...tip} /><Bar dataKey="count" fill="#8f86ff" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
        <section className="glass p-4"><h2 className="mb-2 font-display">Submission status</h2><div className="h-56"><ResponsiveContainer><PieChart><Pie data={status} dataKey="v" nameKey="n" outerRadius={80} label>{status.map((_, i) => <Cell key={i} fill={colors[i % 3]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer></div></section>
        <section className="glass p-4"><h2 className="mb-2 font-display">Activity events (top 10)</h2><div className="h-56">{events.length === 0 ? <p className="pt-20 text-center text-sm text-zinc-500">No suspicious events.</p> : <ResponsiveContainer><BarChart data={events}><CartesianGrid stroke="#ffffff15" /><XAxis dataKey="n" stroke="#a1a1aa" fontSize={11} /><YAxis allowDecimals={false} stroke="#a1a1aa" /><Tooltip {...tip} /><Bar dataKey="v" fill="#f87171" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}</div></section>
      </div>
      <section className="glass overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Search name or ID" value={q} onChange={e => setQ(e.target.value)} />
          <select className="input w-auto" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'Submitted', 'In progress', 'Joined'].map(x => <option key={x} value={x}>{x === 'all' ? 'All statuses' : x}</option>)}</select>
        </div>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-white/10 text-zinc-400">{heads.map(([k, l]) => (
            <th key={k} className="cursor-pointer whitespace-nowrap p-2" onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : true })}>{l}{sort.k === k ? (sort.asc ? ' ▲' : ' ▼') : ''}</th>))}</tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id} className={`border-b border-white/5 ${r.events > 0 ? 'bg-red-500/10' : ''}`}>
              <td className="p-2">{r.name}</td><td className="p-2">{r.usn}</td><td className="p-2">{r.score === null ? '—' : `${r.score}/${r.total}`}</td>
              <td className="p-2">{r.pct === null ? '—' : `${r.pct}%`}</td><td className="p-2">{fmt(r.secs)}</td>
              <td className="p-2">{r.events}</td><td className="p-2">{r.status}</td></tr>))}
            {shown.length === 0 && <tr><td className="p-4 text-zinc-500" colSpan={7}>No students match.</td></tr>}</tbody>
        </table>
      </section>
    </div>
  );
}