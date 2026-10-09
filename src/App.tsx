import { Navigate, Route, Routes } from 'react-router-dom';
import { ReactElement } from 'react';
import { useAuth } from './lib/auth';
import ManagementLogin from './pages/ManagementLogin';
import Dashboard from './pages/Dashboard';
import CreateQuiz from './pages/CreateQuiz';
import StudentLogin from './pages/StudentLogin';
import StudentQuiz from './pages/StudentQuiz';
import StudentResult from './pages/StudentResult';
import Monitor from './pages/Monitor';
import Results from './pages/StudentResult';


function RequireMgmt({ children }: { children: ReactElement }) {
  const { session, role, loading } = useAuth();
  if (loading) return <p className="p-10 text-zinc-400">Loading…</p>;
  if (!session || role !== 'management') return <Navigate to="/management/login" replace />;
  return children; // real protection is Supabase RLS; this only hides screens
}
const Soon = ({ t }: { t: string }) => <p className="p-10 text-zinc-400">{t} is built in the next phase.</p>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/student/login" replace />} />
      <Route path="/login" element={<Navigate to="/management/login" replace />} />
      <Route path="/management/login" element={<ManagementLogin />} />
      <Route path="/management/dashboard" element={<RequireMgmt><Dashboard /></RequireMgmt>} />
      <Route path="/management/quizzes" element={<Navigate to="/management/dashboard" replace />} />
      <Route path="/management/quizzes/create" element={<RequireMgmt><CreateQuiz /></RequireMgmt>} />
      <Route path="/student/login" element={<StudentLogin />} />
      <Route path="/join/:code" element={<StudentLogin />} />
      <Route path="/student/quiz/:id" element={<StudentQuiz />} />
      <Route path="/student/result/:id" element={<StudentResult />} />
      <Route path="*" element={<p className="p-10">404 — page not found.</p>} />
      <Route path="/management/monitor/:id" element={<RequireMgmt><Monitor /></RequireMgmt>} />
      <Route path="/management/results/:id" element={<RequireMgmt><Results /></RequireMgmt>} />
    </Routes>
  );
}
