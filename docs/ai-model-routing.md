# Per-Task AI Model Routing

How the trading pipeline assigns models to tasks, designed as a tiered
stack per task: **primary → fallbacks → anchor**. Anchors are deterministic
safety nets (rule-based parser / reject / neutral) that never depend on AI.

## Target Architecture

```
Telegram parse ──► telegramParse stack ──► rule-based anchor
Vision parse  ──► visionParse stack  ──► OCR + rule anchor
Quality gate  ──► qualityGate stack  ──► reject anchor
News / sentiment ──► global jsonModel pin (shared default)
Chat          ──► global model pin (shared default)
Consensus     ──► separate orchestrator (Phase 4)
```

## Model Stack Definitions

| Task | Primary | Fallbacks | Anchor |
|------|---------|-----------|--------|
| `telegramParse` | `mistral/mistral-medium-3-5` | `groq/openai/gpt-oss-120b`, `groq/llama-3.3-70b-versatile` | rules |
| `visionParse` | `gemini/gemini-3.5-flash` | `openrouter/nvidia/nemotron-nano-12b-v2-vl:free` | OCR + rules |
| `qualityGate` | `groq/openai/gpt-oss-120b` | `mistral/mistral-medium-3-5`, `groq/llama-3.3-70b-versatile` | reject |

Notes:
- **Gemini is vision-only.** `json_object` mode through OmniRoute is broken
  for Gemini, so it is never used for structured-JSON tasks.
- The primary for `telegramParse` / `qualityGate` all honor `json_object`
  (verified live): mistral, gpt-oss-120b, llama-3.3-70b.
- Anchors are always deterministic and can never be disabled by model
  failures.

## Phase 1: Global pins (done)

- `omniRouteModel` (chat) = `groq/llama-3.3-70b-versatile`
- `omniRouteJsonModel` (structured JSON default) = `mistral/mistral-medium-3-5`
- `omniRouteVisionModel` (vision) = `gemini/gemini-3.5-flash`

## Phase 2: Critical task stacks (done)

`TASK_MODEL_STACKS` in `src/lib/ai-engine.ts` + `callConfiguredChatCompletionWithTask`
runner. Wired into:
- `batchParseTelegramSignals` / `parseTelegramSignal` → `telegramParse` stack
- `callConfiguredVisionParser` → `visionParse` stack
- `qualityGateTelegramParseResult` → `aiQualityGateRecheck` (`qualityGate` stack)
  escalation when rule-based enrichment rejects a parse

## Phase 3: Full task stacks (news, sentiment, chat)

Leave on shared global pins for now. Swap to per-task stacks by adding a
`TASK_MODEL_STACKS` entry + switching the call site from
`callConfiguredChatCompletion` to `callConfiguredChatCompletionWithTask`.

## Phase 4: Consensus orchestrator

A separate endpoint that runs a panel of models (gemini-3.5-flash, gpt-oss-120b,
llama-3.3-70b, mistral, qwen) over the same input and combines their outputs
(majority vote / weighted agreement) before emitting a signal.

## How a Task Stack Runs

1. Try `primary`.
2. On error (HTTP 4xx/5xx, timeout, empty, invalid JSON in jsonMode), try each
   `fallback` in order.
3. If all AI models fail, the caller applies the task `anchor`
   (rule parser, OCR+rules, or reject).
4. `callConfiguredChatCompletion` still retries each model up to 2× with
   backoff for transient/429 errors before the next model is tried.
