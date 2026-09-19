export type CommandAction = "pause" | "resume" | "prioritize" | "stop" | "retry" | "status" | "unknown";

export interface CommandResult {
  action: CommandAction;
  response: string;
  subject?: string;
}

/**
 * Local voice-command parser for management decisions only (no code chat).
 * Turns spoken text into a control action and an English subtitle response.
 */
export function handleCommand(text: string): CommandResult {
  const normalized = text.trim();
  if (/^(stop deployment|halt deployment|stop|abort)\b/i.test(normalized)) {
    return {
      action: "stop",
      response: "Deployment stopped. Say \u201cretry\u201d to retry, \u201ccontinue\u201d to resume the run."
    };
  }
  if (/^(retry|redo|restart)\b/i.test(normalized)) {
    return { action: "retry", response: "Retrying the deployment." };
  }
  if (/^(pause|wait|hold|freeze)\b/i.test(normalized)) {
    return { action: "pause", response: "Run paused. Say \u201cresume\u201d or \u201ccontinue\u201d to resume." };
  }
  if (/^(resume|continue|go|start)\b/i.test(normalized)) {
    return { action: "resume", response: "Run resumed. Continuing the delivery loop." };
  }
  const prioritize = normalized.match(/^(prioritize|focus|work on|switch to)\s+(.+)/i);
  if (prioritize) {
    const subject = prioritize[2].trim();
    return {
      action: "prioritize",
      subject,
      response: `Reprioritizing to \u201c${subject}\u201d. The next iteration will target it first.`
    };
  }
  if (/^(status|progress|how is it going|how are you|report)\b/i.test(normalized)) {
    return {
      action: "status",
      response: "Current loop: Planner \u2192 Builder \u2192 Reviewer \u2192 Verifier. No run active right now."
    };
  }
  return {
    action: "unknown",
    response: `I heard: \u201c${normalized}\u201d. I can pause, resume, stop deployment, retry, or reprioritize a run.`
  };
}

