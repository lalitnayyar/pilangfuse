function stamp(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatProgressEvent(event) {
  const area = `${event.emoji} ${event.agent}`.padEnd(18, " ");
  const status = event.status.toUpperCase().padEnd(9, " ");
  return `${stamp(new Date(event.timestamp))} | ${area} | ${status} | ${event.title}${event.detail ? ` — ${event.detail}` : ""}`;
}

export function createProgressReporter({ consoleOutput = false, onEvent } = {}) {
  function emit(event) {
    const enriched = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    if (consoleOutput) {
      console.log(formatProgressEvent(enriched));
    }

    onEvent?.(enriched);
    return enriched;
  }

  return {
    startWorkflow(topic) {
      return emit({
        agent: "Orchestrator",
        emoji: "🚀",
        status: "start",
        title: "Research workflow started",
        detail: `Topic: ${topic}`,
      });
    },
    step(agent, emoji, title, detail = "") {
      return emit({ agent, emoji, status: "running", title, detail });
    },
    success(agent, emoji, title, detail = "") {
      return emit({ agent, emoji, status: "success", title, detail });
    },
    warn(agent, emoji, title, detail = "") {
      return emit({ agent, emoji, status: "warning", title, detail });
    },
    error(agent, emoji, title, detail = "") {
      return emit({ agent, emoji, status: "error", title, detail });
    },
  };
}
