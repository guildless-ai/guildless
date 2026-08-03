import { create } from "zustand";
import {
  currentTask, eventToAction, findingsCount, latestProgress, testStatus, verdictOf,
  type GuildlessEvent, type ProgressState
} from "./mapping";
import {
  CHARACTERS, CHARACTER_ORDER, ZONE_NAV, type CameraMode, type CharacterId, type ZoneId
} from "./zones";
import { debugState } from "./debugState";
import type { CommandAction } from "./control";

export interface AgentState {
  targetZone: ZoneId | null;
  celebrationAt: number;
  warningAt: number;
}

/** Mutable live positions, updated per-frame without re-rendering subscribers. */
export const agentPositions: Record<CharacterId, { x: number; y: number; z: number }> = Object.fromEntries(
  CHARACTER_ORDER.map((id) => {
    const chair = ZONE_NAV[CHARACTERS[id].homeZone].chairPosition;
    return [id, { x: chair[0], y: 0, z: chair[2] }];
  })
) as Record<CharacterId, { x: number; y: number; z: number }>;

const HOME_ZONE: Record<CharacterId, ZoneId> = { director: "planning", engineer: "engineering", reviewer: "review" };

function initialAgents(): Record<CharacterId, AgentState> {
  const map = {} as Record<CharacterId, AgentState>;
  for (const id of CHARACTER_ORDER) map[id] = { targetZone: HOME_ZONE[id], celebrationAt: 0, warningAt: 0 };
  return map;
}

export interface OfficeState {
  agents: Record<CharacterId, AgentState>;
  activeCharacter: CharacterId;
  cameraMode: CameraMode;
  viewTarget: CharacterId | null;
  role: string | null;
  task: string;
  progress: ProgressState | null;
  findings: number;
  tests: { passed: number; total: number };
  verdict: string | null;
  subtitles: string[];
  listening: boolean;
  replaying: boolean;
  eventsApplied: number;
  _memo?: GuildlessEvent[];
  lastCelebratedRunId: string | null;
  lastWarnedRunId: string | null;
  paused: boolean;
  priority: string | null;
  stopDeployment: boolean;
  debug: boolean;
  reviewFlag: { at: number; count: number };
  issueDelivery: { active: boolean; startedAt: number; runId: string | null };
  postman: { seq: number; target: CharacterId | null; from: CharacterId | null; stamp: "accepted" | "rejected" | null };
  applyEvent: (event: GuildlessEvent) => void;
  resetRun: () => void;
  setCameraMode: (mode: CameraMode) => void;
  selectEmployee: (id: CharacterId) => void;
  setDebug: (debug: boolean) => void;
  pushSubtitle: (text: string) => void;
  setListening: (listening: boolean) => void;
  setReplaying: (replaying: boolean) => void;
  applyControl: (action: CommandAction, subject?: string) => void;
}

export const useOffice = create<OfficeState>((set) => ({
  agents: initialAgents(),
  activeCharacter: "director",
  cameraMode: "god",
  viewTarget: null,
  role: null,
  task: "Standing by",
  progress: null,
  findings: 0,
  tests: { passed: 0, total: 0 },
  verdict: null,
  subtitles: [],
  listening: false,
  replaying: false,
  eventsApplied: 0,
  lastCelebratedRunId: null,
  lastWarnedRunId: null,
  paused: false,
  priority: null,
  stopDeployment: false,
  debug: false,
  reviewFlag: { at: 0, count: 0 },
  issueDelivery: { active: false, startedAt: 0, runId: null },
  postman: { seq: -1, target: null, from: null, stamp: null },

  applyEvent: (event) =>
    set((state) => {
      const action = eventToAction(event);
      const now = Date.now();
      const agents = { ...state.agents };
      let active = state.activeCharacter;
      for (const target of action.targets) {
        active = target.character;
        agents[target.character] = { ...agents[target.character], targetZone: target.zone };
      }
      if (action.breakroom) {
        agents[active] = { ...agents[active], targetZone: "breakroom" };
      }
      const runId = event.runId ?? "";
      let lastCelebratedRunId = state.lastCelebratedRunId;
      let lastWarnedRunId = state.lastWarnedRunId;
      if (event.type === "run_start") {
        // The verdict-animation counter measures one run at a time.
        debugState.verdictAnimationCount = 0;
      }
      if (action.celebration && runId !== lastCelebratedRunId) {
        for (const id of CHARACTER_ORDER) agents[id] = { ...agents[id], celebrationAt: now };
        lastCelebratedRunId = runId;
        debugState.verdictAnimationCount += 1;
      }
      if (action.warning && runId !== lastWarnedRunId) {
        for (const id of CHARACTER_ORDER) agents[id] = { ...agents[id], warningAt: now };
        lastWarnedRunId = runId;
        debugState.verdictAnimationCount += 1;
      }
      debugState.activeEvent = event.type;

      const memo = [...(state._memo ?? []), event].slice(-200);
      const task = currentTask(memo);

      let reviewFlag = state.reviewFlag;
      if (event.type === "agent_end" && event.role === "reviewer" && event.ok === true) {
        const count = findingsCount(memo);
        if (count > 0) reviewFlag = { at: now, count };
      }
      let issueDelivery = state.issueDelivery;
      if (event.type === "run_start" && runId !== state.issueDelivery.runId) {
        issueDelivery = { active: true, startedAt: now, runId };
      }

      // Postman: the GitHub issue travels Director → Engineer → Reviewer → Verifier.
      let postman = state.postman;
      if (event.type === "run_start") {
        postman = { seq: state.postman.seq + 1, target: "director", from: null, stamp: null };
      } else if (event.type === "agent_start" && event.role === "builder") {
        postman = { seq: state.postman.seq + 1, target: "engineer", from: "director", stamp: null };
      } else if (event.type === "agent_start" && event.role === "reviewer") {
        postman = { seq: state.postman.seq + 1, target: "reviewer", from: "engineer", stamp: null };
      } else if (event.type === "stage" && event.stage === "verify") {
        postman = { seq: state.postman.seq + 1, target: "engineer", from: "reviewer", stamp: null };
      } else if (event.type === "verdict" && (event.verdict === "ACCEPTED" || event.verdict === "REJECTED")) {
        postman = { ...state.postman, stamp: event.verdict === "ACCEPTED" ? "accepted" : "rejected" };
      }

      return {
        agents,
        activeCharacter: active,
        lastCelebratedRunId,
        lastWarnedRunId,
        reviewFlag,
        issueDelivery,
        postman,
        _memo: memo,
        role: task.role,
        task: task.task,
        progress: latestProgress(memo),
        findings: findingsCount(memo),
        tests: testStatus(memo),
        verdict: verdictOf(memo) ?? state.verdict,
        eventsApplied: state.eventsApplied + 1
      };
    }),

  resetRun: () =>
    set(() => ({
      agents: initialAgents(),
      _memo: [],
      eventsApplied: 0,
      lastCelebratedRunId: null,
      lastWarnedRunId: null,
      reviewFlag: { at: 0, count: 0 },
      issueDelivery: { active: false, startedAt: 0, runId: null },
      postman: { seq: -1, target: null, from: null, stamp: null },
      role: null,
      task: "Standing by",
      progress: null,
      findings: 0,
      tests: { passed: 0, total: 0 },
      verdict: null
    })),

  setCameraMode: (mode) =>
    set((state) => {
      if (mode === "god") return { cameraMode: "god", viewTarget: null };
      if (mode === "desk") return { cameraMode: "desk", viewTarget: state.viewTarget ?? state.activeCharacter };
      return { cameraMode: "orbit" };
    }),

  selectEmployee: (id) => set({ viewTarget: id, cameraMode: "desk" }),
  setDebug: (debug) => set((state) => {
    debugState.debugOn = debug;
    return { debug };
  }),
  pushSubtitle: (text) =>
    set((state) => ({ subtitles: [...state.subtitles.slice(-2), text] })),
  setListening: (listening) => set({ listening }),
  setReplaying: (replaying) => set({ replaying }),
  applyControl: (action, subject) =>
    set((state) => {
      const push = (text: string) => [...state.subtitles.slice(-2), text];
      switch (action) {
        case "pause": return { paused: true, subtitles: push("⏸ Run paused") };
        case "resume": return { paused: false, subtitles: push("▶ Run resumed") };
        case "prioritize": return { priority: subject ?? null, subtitles: push(`🎯 Prioritizing: ${subject ?? "next issue"}`) };
        case "stop": return { stopDeployment: true, paused: true, subtitles: push("🛑 Deployment stopped") };
        case "retry": return { stopDeployment: false, paused: false, subtitles: push("🔁 Retrying deployment") };
        default: return { subtitles: push(`Command: ${subject ?? action}`) };
      }
    })
}));
