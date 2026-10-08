import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Browser-level events only. A web page cannot know WHICH app the student opened,
// so events say "page lost focus", never "ChatGPT opened". source='android' is reserved for a future native layer.
type Ev = 'TAB_HIDDEN'|'TAB_VISIBLE'|'WINDOW_BLUR'|'WINDOW_FOCUS'|'FULLSCREEN_EXIT'|'COPY'|'PASTE'|'CUT'|'PRINT_SHORTCUT'|'CONTEXT_MENU'|'OFFLINE'|'ONLINE'|'SCREENSHOT_KEY';

export function useExamMonitor(opts: { sessionId: string; quizId: string; studentId: string; enabled: boolean; onWarn?: (m: string) => void }) {
  const { sessionId, quizId, studentId, enabled, onWarn } = opts;
  const last = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;
    const log = (event_type: Ev, metadata: object = {}) => {
      const now = Date.now();
      if (now - (last.current[event_type] ?? 0) < 500) return; // de-dupe blur+hidden bursts
      last.current[event_type] = now;
      supabase.from('activity_logs').insert({ session_id: sessionId, quiz_id: quizId, student_id: studentId, source: 'web', event_type, metadata }).then(() => {});
    };
    const status = (s: 'active'|'inactive') => supabase.rpc('heartbeat', { p_session: sessionId, p_status: s }).then(() => {});
    const away = (t: Ev, m: string) => () => { log(t); status('inactive'); onWarn?.(m); };
    const back = (t: Ev) => () => { log(t); status('active'); };

    const onVis = () => document.visibilityState === 'hidden' ? away('TAB_HIDDEN', 'Quiz page lost focus. This is recorded.')() : back('TAB_VISIBLE')();
    const onFs = () => { if (!document.fullscreenElement) { log('FULLSCREEN_EXIT'); onWarn?.('Fullscreen exited. This is recorded.'); } };
    const block = (t: Ev) => (e: Event) => { e.preventDefault(); log(t); onWarn?.('That action is disabled during the quiz.'); };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Win+Shift+S (Windows) / Cmd+Shift+S: screenshot shortcut. Best-effort hint only, not proof.
      if (e.metaKey && e.shiftKey && k === 's') { log('SCREENSHOT_KEY', { key: 'meta+shift+s' }); onWarn?.('Screenshot shortcut detected. This is recorded.'); return; }
      if ((e.ctrlKey || e.metaKey) && ['c','v','x','p','s','u'].includes(k)) {
        e.preventDefault();
        log(k === 'p' ? 'PRINT_SHORTCUT' : k === 'v' ? 'PASTE' : k === 'x' ? 'CUT' : 'COPY', { key: k });
      }
    };
    // PrintScreen only fires on keyup in most browsers.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') { log('SCREENSHOT_KEY', { key: 'PrintScreen' }); onWarn?.('Screenshot key pressed. This is recorded.'); }
    };
    const hb = setInterval(() => document.visibilityState === 'visible' && status('active'), 15000);

    const L: [EventTarget, string, EventListener][] = [
      [document, 'visibilitychange', onVis], [window, 'blur', away('WINDOW_BLUR', 'Quiz window lost focus. This is recorded.')],
      [window, 'focus', back('WINDOW_FOCUS')], [document, 'fullscreenchange', onFs],
      [document, 'copy', block('COPY')], [document, 'paste', block('PASTE')], [document, 'cut', block('CUT')],
      [document, 'contextmenu', block('CONTEXT_MENU')],
      [document, 'keydown', onKey as EventListener], [document, 'keyup', onKeyUp as EventListener],
      [window, 'offline', () => log('OFFLINE')], [window, 'online', () => log('ONLINE')],
    ];
    L.forEach(([t, n, f]) => t.addEventListener(n, f));
    return () => { clearInterval(hb); L.forEach(([t, n, f]) => t.removeEventListener(n, f)); };
  }, [sessionId, quizId, studentId, enabled, onWarn]);
}