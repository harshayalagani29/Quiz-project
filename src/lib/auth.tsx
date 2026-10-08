import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
type Ctx = { session: Session | null; role: string | null; loading: boolean };
const C = createContext<Ctx>({ session: null, role: null, loading: true });
export const useAuth = () => useContext(C);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async (s: Session | null) => {
      setSession(s);
      if (s) { const { data } = await supabase.from('profiles').select('role').eq('id', s.user.id).maybeSingle(); setRole(data?.role ?? null); } else setRole(null);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => load(s), 0); });
    return () => sub.subscription.unsubscribe();
  }, []);
  return <C.Provider value={{ session, role, loading }}>{children}</C.Provider>;
}
