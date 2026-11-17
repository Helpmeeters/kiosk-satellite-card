import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAskPrompt,
  extractConversationId,
  extractConversationSpeech,
  resolveAskPipeline,
  type AskPipelineInfo,
} from "../src/redisplay-ask";

const PIPELINES: AskPipelineInfo[] = [
  { id: "pipe-qwen", name: "Qwen", conversation_engine: "conversation.qwen", language: "en" },
  { id: "pipe-local", name: "Full local assistant", conversation_engine: "conversation.home_assistant", language: "en" },
  { id: "pipe-jev", name: "Jev", conversation_engine: "conversation.jev", language: "en" },
];

describe("resolveAskPipeline", () => {
  it("resolves a named assistant to its pipeline and conversation engine", () => {
    const pipeline = resolveAskPipeline("Jev", PIPELINES, "pipe-qwen");
    assert.equal(pipeline?.id, "pipe-jev");
    assert.equal(pipeline?.conversation_engine, "conversation.jev");
  });

  it("resolves case-insensitively and falls back to preferred_pipeline for preferred or unset", () => {
    assert.equal(resolveAskPipeline("jev", PIPELINES, "pipe-qwen")?.id, "pipe-jev");
    assert.equal(resolveAskPipeline("preferred", PIPELINES, "pipe-qwen")?.id, "pipe-qwen");
    assert.equal(resolveAskPipeline(undefined, PIPELINES, "pipe-qwen")?.id, "pipe-qwen");
    assert.equal(resolveAskPipeline("Other", PIPELINES, "pipe-qwen"), undefined);
  });
});

describe("buildAskPrompt", () => {
  it("prepends kiosk and area context for LLM agents", () => {
    const prompt = buildAskPrompt("  play jazz  ", {
      kioskName: "Updoot2",
      areaName: "Master Bedroom",
      playerId: "media_player.updoot2",
      assistEntityId: "assist_satellite.updoot2_assist_satellite",
      conversationEngine: "conversation.jev",
    });
    assert.equal(
      prompt,
      '[This request comes from Kiosk Satellite "Updoot2" in area "Master Bedroom".]\n\nplay jazz',
    );
  });

  it("leaves the raw text untouched for conversation.home_assistant", () => {
    const prompt = buildAskPrompt("  turn on bedroom light  ", {
      kioskName: "Updoot2",
      areaName: "Master Bedroom",
      playerId: "media_player.updoot2",
      conversationEngine: "conversation.home_assistant",
    });
    assert.equal(prompt, "turn on bedroom light");
  });
});

describe("conversation response extractors", () => {
  it("extracts plain speech and conversation_id from HA service response payloads", () => {
    const payload = {
      response: {
        conversation_id: "conv-123",
        response: {
          speech: {
            plain: {
              speech: "Playing jazz on Updoot2.",
            },
          },
        },
      },
    };
    assert.equal(extractConversationSpeech(payload), "Playing jazz on Updoot2.");
    assert.equal(extractConversationId(payload), "conv-123");
    assert.equal(extractConversationSpeech({}), undefined);
    assert.equal(extractConversationId(null), undefined);
  });
});
