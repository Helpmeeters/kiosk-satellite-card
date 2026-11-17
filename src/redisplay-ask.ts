export interface AskPipelineInfo {
  id: string;
  name: string;
  conversation_engine?: string | null;
  language?: string | null;
}

export interface AskContext {
  kioskName: string;
  areaName?: string;
  playerId?: string;
  assistEntityId?: string;
  conversationEngine?: string | null;
}

const NON_TRIGGER_VALUES = new Set(["", "unknown", "unavailable", "none", "null"]);

/** Resolve the full pipeline object for the Kiosk's configured Assistant select value. */
export function resolveAskPipeline(
  assistantName: string | undefined,
  pipelines: readonly AskPipelineInfo[],
  preferredPipeline?: string | null,
): AskPipelineInfo | undefined {
  const trimmed = assistantName?.trim() ?? "";
  if (!trimmed || NON_TRIGGER_VALUES.has(trimmed.toLowerCase())) {
    if (typeof preferredPipeline === "string" && preferredPipeline.length > 0) {
      return pipelines.find((pipeline) => pipeline.id === preferredPipeline);
    }
    return undefined;
  }
  if (trimmed.toLowerCase() === "preferred") {
    if (typeof preferredPipeline === "string" && preferredPipeline.length > 0) {
      return pipelines.find((pipeline) => pipeline.id === preferredPipeline);
    }
    return undefined;
  }
  const exact = pipelines.find((pipeline) => pipeline.name.trim() === trimmed);
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  return pipelines.find((pipeline) => pipeline.name.trim().toLowerCase() === lower);
}

/** Attach Kiosk and area context for LLM conversation agents. */
export function buildAskPrompt(text: string, context: AskContext): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (context.conversationEngine === "conversation.home_assistant") return trimmed;

  const origin = context.areaName
    ? `This request comes from Kiosk Satellite "${context.kioskName}" in area "${context.areaName}".`
    : `This request comes from Kiosk Satellite "${context.kioskName}".`;
  return `[${origin}]\n\n${trimmed}`;
}

/** Extract the plain speech reply from a Home Assistant conversation.process response. */
export function extractConversationSpeech(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const outer = asRecord(root.response) ?? root;
  const inner = asRecord(outer.response) ?? outer;
  const speech = asRecord(inner.speech);
  const plain = asRecord(speech?.plain);
  const text = plain?.speech;
  if (typeof text !== "string") return undefined;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Extract conversation_id from a conversation.process response for follow-up turns. */
export function extractConversationId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const outer = asRecord(root.response);
  const id = outer?.conversation_id ?? root.conversation_id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
