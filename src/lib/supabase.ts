import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export async function ensureStudentAuth() {
  const { data } = await supabase.auth.getSession();
  if (data.session && !data.session.user.is_anonymous) await supabase.auth.signOut(); // never join as faculty
  const again = await supabase.auth.getSession();
  if (!again.data.session) await supabase.auth.signInAnonymously();
}
export const deviceInfo = () => ({
  userAgent: navigator.userAgent, platform: navigator.platform,
  screen: `${screen.width}x${screen.height}`, touch: navigator.maxTouchPoints > 0,
});
