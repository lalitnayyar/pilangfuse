import { Langfuse } from "langfuse";

function createNoopNode() {
  return {
    span: () => createNoopNode(),
    update: () => {},
    end: () => {},
  };
}

export function createWorkflowTrace(topic) {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) {
    return { langfuse: null, trace: createNoopNode(), tracingEnabled: false };
  }

  const langfuse = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
  });

  const trace = langfuse.trace({
    name: "topic-research-agents",
    input: { topic },
    metadata: {
      app: "pilangfuse",
      provider: process.env.PI_PROVIDER || null,
      model: process.env.PI_MODEL || null,
      sessionId: process.env.PI_SESSION_ID || null,
    },
  });

  return { langfuse, trace, tracingEnabled: true };
}

export async function flushLangfuse(langfuse) {
  if (langfuse) {
    await langfuse.flushAsync();
  }
}
