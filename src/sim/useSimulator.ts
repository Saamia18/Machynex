import { useCallback, useEffect, useRef, useState } from 'react';
import { Simulator } from './engine';
import type { LogLine, Snapshot } from './engine';
import { AudioEngine } from './audio';

export function useSimulator() {
  const simRef = useRef<Simulator | null>(null);
  if (simRef.current === null) simRef.current = new Simulator();
  const sim = simRef.current;

  const audioRef = useRef<AudioEngine | null>(null);
  if (audioRef.current === null) audioRef.current = new AudioEngine();
  const audio = audioRef.current;

  const [snap, setSnap] = useState<Snapshot>(() => sim.getSnapshot());
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [alarms, setAlarmsState] = useState(true);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let publishAcc = 0;
    let beepAcc = 2.2;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) sim.step(dt);
      // hum follows the live plant every frame (pitch drops smoothly during spin-down)
      audio.setMotor(pausedRef.current ? 0 : sim.live.rpm, sim.live.vibMeas);
      publishAcc += dt;
      if (publishAcc >= 0.1) {
        const step = publishAcc;
        publishAcc = 0;
        const s = sim.getSnapshot();
        setSnap(s);
        const nl = sim.drainLogs();
        if (nl.length) setLogs((prev) => [...prev, ...nl].slice(-400));
        for (const ev of sim.drainEvents()) {
          audio.relay(ev);
          // haptic feedback on supporting devices (phones)
          if (ev === 'trip' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([90, 50, 140]); } catch { /* ignore */ }
          }
        }
        // intermittent alarm beeps while in Early Warning / Critical
        if (!pausedRef.current) {
          beepAcc += step;
          if (s.state === 'EARLY' && beepAcc >= 2.4) { audio.beep('warn'); beepAcc = 0; }
          else if (s.state === 'CRITICAL' && beepAcc >= 0.9) { audio.beep('crit'); beepAcc = 0; }
          else if (s.state === 'NORMAL') beepAcc = 2.2;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, audio]);

  const unlock = useCallback(() => audio.unlock(), [audio]);
  const setMuted = useCallback((m: boolean) => { audio.setMuted(m); setMutedState(m); }, [audio]);
  const setAlarms = useCallback((a: boolean) => { audio.alarms = a; setAlarmsState(a); }, [audio]);

  return { sim, snap, logs, paused, setPaused, muted, setMuted, alarms, setAlarms, unlock };
}
