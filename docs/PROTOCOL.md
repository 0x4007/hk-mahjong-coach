# Protocol guide

JSONL is one UTF-8 JSON object per line. Stdout is machine-clean. Every envelope has
`protocolVersion: 1`, a monotonic `seq`, an ISO UTC timestamp, a type, and a validated payload.
The host emits `hello`, `game_started`, `action_request`, `action_accepted`, `action_rejected`,
`public_event`, `hand_ended`, `match_ended`, `error`, and `goodbye` as applicable.

An agent may submit only an emitted `actionId` with the matching player, branch, request, and
revision. Free-form moves are rejected. Invalid, stale, malformed, or timed-out messages produce a
stable error code. The stdio host advertises a 1000 ms deadline and retries three failures before
submitting the first legal action as a deterministic fallback.

Stable errors include `invalid_request`, `stale_revision`, `action_not_legal`,
`external_agent_timeout`, `llm_provider_unavailable`, and `llm_output_invalid`. Error payloads are
safe for clients and never contain database paths, keys, stack traces, hidden tiles, or wall order.

HTTP and WebSocket use the same schemas. `GET /api/games/:id/replay` returns public events plus
learner decision summaries. `POST /api/games/:id/branches` reconstructs the persisted decision
revision before creating a nondestructive practice branch.

`GET /api/games/:id/replay?omniscient=true` is a separate post-hand/sandbox review projection. The
session controller rejects live non-sandbox reveals and ordinary replay responses return
`omniscient: null`. The reveal contains a schema-validated completed player/wall view rather than
the authoritative `GameState` object.

`GET /api/demos` lists the ten deterministic teaching-room seeds. `GET
/api/rulesets/:id/details` returns the resolved scoring-rule names and visible turn/kong assumptions
used by the Rules and glossary screen.
