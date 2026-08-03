"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOffice } from "./store";
import { speedForDuration } from "./replay";

interface EventsResponse {
  events: Array<{ type: string; runId?: string; ts?: string; role?: string; stage?: string; [key: string]: unknown }>;
  runIds: string[];
  latestRunId?: string | null;
}

function eventKey(event: { runId?: string; ts?: string; type: string; role?: string; stage?: string }): string {
  return `${event.runId}|${event.ts}|${event.type}|${event.role ?? ""}|${event.stage ?? ""}`;
}

/** Live + replay feed. Live never replays completed events (dedup by event key). */
export function useRunFeed() {
  const applyEvent = useOffice((state) => state.applyEvent);
  const resetRun = useOffice((state) => state.resetRun);
  const setReplaying = useOffice((state) => state.setReplaying);
  const pushSubtitle = useOffice((state) => state.pushSubtitle);

  const [runIds, setRunIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [live, setLive] = useState(false);
  const [replaying, setReplayingState] = useState(false);
  const appliedKeys = useRef(new Set<string>());
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/events");
      const data = (await response.json()) as EventsResponse;
      setRunIds(data.runIds);
      if (!selected && data.latestRunId) setSelected(data.latestRunId);
    } catch { /* backend not running yet */ }
  }, [selected]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const stopLive = useCallback(() => {
    if (liveTimer.current) clearInterval(liveTimer.current);
    liveTimer.current = null;
    setLive(false);
  }, []);

  const startLive = useCallback(() => {
    if (liveTimer.current) clearInterval(liveTimer.current);
    setLive(true);
    const tick = async () => {
      if (useOffice.getState().paused) return;
      try {
        const response = await fetch("/api/events");
        const data = (await response.json()) as EventsResponse;
        for (const event of data.events) {
          const key = eventKey(event);
          if (appliedKeys.current.has(key)) continue; // never replay completed events
          appliedKeys.current.add(key);
          applyEvent(event);
        }
      } catch { /* transient */ }
    };
    void tick();
    liveTimer.current = setInterval(tick, 800);
  }, [applyEvent]);

  const playReplay = useCallback(
    async (speed: number) => {
      if (!selected) return;
      stopLive();
      resetRun();
      setReplayingState(true);
      setReplaying(true);
      if (replayTimer.current) clearInterval(replayTimer.current);
      try {
        const response = await fetch(`/api/replay?runId=${encodeURIComponent(selected)}&speed=${speed}`);
        const data = (await response.json()) as { schedule: Array<{ event: EventsResponse["events"][number]; atMs: number }> };
        const schedule = data.schedule;
        const start = Date.now();
        let index = 0;
        replayTimer.current = setInterval(() => {
          if (useOffice.getState().paused) return;
          const elapsed = Date.now() - start;
          while (index < schedule.length && schedule[index].atMs <= elapsed) {
            applyEvent(schedule[index].event);
            index += 1;
          }
          if (index >= schedule.length) {
            if (replayTimer.current) clearInterval(replayTimer.current);
            setReplayingState(false);
            setReplaying(false);
            pushSubtitle("Run finished — the final result is shown on screen.");
          }
        }, 60);
      } catch (error) {
        setReplayingState(false);
        setReplaying(false);
        pushSubtitle(`AI: Replay failed: ${String(error)}`);
      }
    },
    [selected, applyEvent, resetRun, setReplaying, stopLive, pushSubtitle]
  );

  const play15s = useCallback(async () => {
    if (!selected) return;
    try {
      const response = await fetch("/api/events");
      const data = (await response.json()) as EventsResponse;
      const speed = speedForDuration(data.events, selected, 15_000);
      await playReplay(speed);
    } catch {
      await playReplay(15);
    }
  }, [selected, playReplay]);

  useEffect(
    () => () => {
      stopLive();
      if (replayTimer.current) clearInterval(replayTimer.current);
    },
    [stopLive]
  );

  return { runIds, selected, setSelected, live, toggleLive: live ? stopLive : startLive, replaying, play15s, playReplay };
}
