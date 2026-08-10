# Multiplayer rooms over Deno

Status: implemented experimental extension; Deno deployment work remains

This document specifies a server-authoritative multiplayer layer for the Hong Kong Mahjong
Coach. It is an addition to the local game product, not a replacement for the pure engine,
the existing HTTP game API, or the JSONL protocol.

The first target is a room in which two to four people can play one another. Empty seats may
be filled by the existing deterministic bots when the room owner selects that option. There
are no accounts, wagering, matchmaking, or social features in this design.

## 1. Decision summary

Use WebSockets, not peer-to-peer WebRTC, for live play.

The server owns the event log, revision, legal-action calculation, timers, and redacted
observations. Clients send action IDs and render the results. WebRTC would require a separate
signalling service, NAT traversal, peer discovery, and a trusted peer-authority protocol. It
would not improve this game's correctness because every move must still be checked by one
authoritative engine.

The target server runtime is Deno:

- `Deno.serve` handles HTTP and WebSocket upgrades.
- `Deno.upgradeWebSocket` creates each room connection.
- WebSocket text frames carry the existing protocol v1 JSON envelopes.
- A Deno-native persistence adapter implements the existing event/replay repository boundary.
  Deno KV is the target store for a Deno Deploy deployment; a local adapter may use an
  equivalent transactional store while preserving the same append and replay semantics.
- In-memory room state contains sockets and delivery bookkeeping only. It is never the source
  of game truth and may be discarded after a restart.

## 2. Authority and boundaries

The following ownership rules are mandatory:

| Concern                                                    | Owner                                         |
| ---------------------------------------------------------- | --------------------------------------------- |
| Tile inventory, rules, scoring, legal actions              | `@hk-mahjong/core` and `@hk-mahjong/hk-rules` |
| Event reduction and state hashes                           | `@hk-mahjong/core`                            |
| Durable events, snapshots, revisions, idempotency receipts | persistence adapter                           |
| Room membership, tickets, sockets, delivery sequence       | Deno server                                   |
| Player-specific redaction                                  | core observation projection                   |
| Client rendering and input selection                       | web client                                    |

The server must never mutate a `GameState` directly, infer a legal move, or calculate a score.
For every accepted action it loads the branch at the requested revision, calls the engine, and
persists the complete event range atomically.

The room registry may cache the latest branch revision to avoid unnecessary reads, but the cache
must be treated as a hint. A command is accepted only after a transactional revision check in
the durable store.

## 3. Room lifecycle

`roomId` is a public opaque identifier. A room has one main game branch (`branchId: "main"`)
and may expose practice branches only when sandbox mode explicitly permits them.

### 3.1 States

```text
waiting -> ready -> active -> hand_ended -> match_ended
    |                                |
    +------------> closed <----------+
```

- `waiting`: the room exists and seats can be claimed.
- `ready`: the owner has requested a start and all required seats are present or bot-filled.
- `active`: the game has been created and commands may be submitted.
- `hand_ended`: a terminal hand event was emitted; the next-hand action can continue the match.
- `match_ended`: the engine emitted `match_ended`; the room is read-only.
- `closed`: the owner cancelled before the match started, or the retention policy expired it.

A room cannot be started twice. Repeated start requests use the same request ID and return the
same game key when they are idempotent.

### 3.2 Seats and joining

There are four immutable seat slots: east, south, west, and north. The room creator joins one
slot immediately. Other players join an unclaimed slot before the room starts. A preferred seat
is a request, not a guarantee; the server assigns the first available legal seat unless the
requested seat is free.

After the game starts, a join operation is only a reconnect for the same `playerId` and ticket.
It cannot replace a player or change a seat. A disconnected player retains the seat until the
room's retention period expires. A closed room rejects even an old ticket; a `match_ended` room
may still accept an existing seat ticket for read-only replay or observation until that ticket
expires.

The room owner chooses one fill policy:

- `wait_for_four`: all four seats must be human participants before start.
- `fill_with_bots`: unclaimed seats become deterministic bot players at start.

The engine receives four concrete players in either case. A waiting room is not a partially
created game and has no game revision.

### 3.3 Join tickets

Room creation and joining return an opaque bearer ticket. Tickets are generated with at least
128 bits of entropy. Only a hash of a ticket is persisted. The raw value is returned once in the
HTTP response and is never written to logs, events, observations, or analytics.

The WebSocket endpoint accepts the ticket as a short-lived query parameter because browser
WebSocket clients cannot set an arbitrary `Authorization` header. The server must redact query
strings from access logs. A future native client may send the same ticket in a negotiated
subprotocol instead.

Tickets identify exactly one room and player. They do not grant access to another seat or to an
omniscient replay. Reconnect tickets expire only after the room retention period, not after one
socket disconnect. Expiry is checked against the authoritative service clock, and a ticket is
invalid when the current time is exactly its stored expiry instant or later.

## 4. HTTP API

All request and response bodies are validated with shared Zod schemas. Existing game endpoints
continue to use `gameId` and `branchId`; room endpoints only manage membership and lifecycle.

### 4.1 Create a room

```text
POST /api/rooms
```

Request:

```json
{
  "displayName": "Alice",
  "rulesetId": "hk_nyc_social_v1",
  "matchLength": "one_wind",
  "seed": "table-2026-08-06",
  "fillPolicy": "wait_for_four",
  "preferredSeat": "east"
}
```

The server resolves and freezes the historical ruleset definition before any game is created.
The response contains:

```json
{
  "roomId": "room_01",
  "status": "waiting",
  "playerId": "p_alice",
  "seat": "east",
  "ticket": "opaque-secret",
  "ruleset": {
    "id": "hk_nyc_social_v1",
    "version": "1",
    "hash": "sha256:..."
  }
}
```

The response must not include a game observation because the engine has not started the game.

### 4.2 Join a room

```text
POST /api/rooms/:roomId/join
```

Request:

```json
{
  "displayName": "Bob",
  "preferredSeat": "south"
}
```

The response returns `roomId`, `playerId`, assigned `seat`, and the player's ticket. Joining a
full or already-started room is rejected unless the request proves an existing seat ticket.

### 4.3 Inspect a room

```text
GET /api/rooms/:roomId
```

The public response contains status, ruleset summary, match length, fill policy, occupied seat
labels, and whether the room is accepting joins. It never contains tickets, private tile data,
or a player's concealed hand.

### 4.4 Start a room

```text
POST /api/rooms/:roomId/start
```

The owner authenticates with the owner ticket. The server builds one deterministic
`CreateGameCommand`, appends the resulting `game_started` and initial-deal events, and changes
the room to `active`. The response returns the game key and the owner's redacted observation.

The command request ID is retained as the creation idempotency key. The seed, resolved ruleset
definition, player controllers, seats, and display names are persisted with the game metadata.

### 4.5 Existing game endpoints

These endpoints remain the canonical command and history surfaces:

```text
GET  /api/games/:id/observation?playerId=...&branchId=...
POST /api/games/:id/actions
GET  /api/games/:id/replay?playerId=...&branchId=...
POST /api/games/:id/branches
POST /api/games/:id/hints
```

An active room does not receive a second gameplay implementation through room routes. HTTP
actions and WebSocket actions call the same command handler, idempotency code, and persistence
transaction. The action body remains:

```json
{
  "playerId": "p_alice",
  "branchId": "main",
  "expectedRevision": 37,
  "requestId": "req_alice_38",
  "actionId": "discard:p_alice:characters.9#2"
}
```

Competitive rooms keep the branch and hint URLs as explicit authenticated surfaces, but return a
structured `409` with `details.reason = "unsupported_room_action"`; they must not fall through to
the browser shell. The same restriction applies to `request_hint`, `request_analysis`, and
`resign` WebSocket messages. The server checks the payload player identity before returning that
disabled response, and rejects a message naming another player with `unknown_player` and
`details.reason = "cross_player_message"` without invoking the engine.

## 5. WebSocket protocol

### 5.1 Endpoint and framing

```text
GET /ws/games/:gameId?playerId=...&branchId=main&ticket=...&fromRevision=37
```

The server validates the ticket, upgrades the request, and binds the socket to one player and
one branch. A text frame contains one complete UTF-8 JSON object using the existing
`HostProtocolEnvelope` or `AgentProtocolEnvelope` schema. A trailing newline is allowed and is
recommended for parity with the JSONL stdio client. Binary frames are rejected.

There are two independent sequence streams:

- host-to-client `seq`, starting at zero for each socket;
- client-to-host `seq`, starting at zero for each socket.

Each direction must be strictly monotonic. `seq` is a transport sequence, not a game revision.
Every envelope still includes `protocolVersion: 1`, an ISO UTC timestamp, and matching game,
branch, and request identities.

### 5.2 Server-to-client join sequence

After upgrade, the server sends messages in this order:

1. `hello`, containing the assigned seat, action timeout, and malformed-response limit.
2. `game_started` if the client has not already seen the start event.
3. Missed `public_event` messages with revisions greater than `fromRevision`, in ascending order.
4. One redacted `observation` for the authenticated player at the current revision.
5. `action_request` if that player currently has one or more legal actions.

The observation is always sent after replay, even when no event was missed. A reconnect therefore
does not depend on the client's previous in-memory state.

If the requested replay range is outside the configured delivery window, the server sends the
latest observation and an `error` envelope whose details contain `resyncRequired: true`. The
client then uses the HTTP replay endpoint for history and keeps the observation as its live base.

### 5.3 Live event fan-out

For one accepted command, the server sends:

1. `public_event` for every persisted public event, in revision order, to every connected room
   participant on the same branch.
2. `action_accepted` to the submitting player, containing the accepted action, final revision,
   and that player's redacted observation.
3. `observation` to every other connected player, each projected separately.
4. `hand_ended` or `match_ended` when the corresponding terminal public event is emitted.
5. The next `action_request` message or messages for the players whose legal-action set is now
   non-empty.

`public_event` payloads use the existing public allowlist. No client receives an internal event,
the event reducer state, another player's concealed tile instance IDs, wall order, or scoring
evidence derived from hidden tiles.

### 5.4 Client messages

The supported agent/client message types are the existing protocol v1 messages:

- `submit_action`: submits an emitted legal `actionId` with `expectedRevision`.
- `request_hint`: requests a permitted coaching level.
- `request_analysis`: requests observation-only analysis when the room mode permits it.
- `ping`: carries a client nonce and receives a host `observation` only when needed; ordinary
  heartbeats use the WebSocket ping/pong mechanism.
- `resign`: disabled for ordinary competitive rooms; available only in explicitly configured
  sandbox rooms.

The server ignores free-form text. Unknown message types, malformed JSON, invalid envelopes, and
messages for another player are rejected without invoking the engine.

## 6. Commands, revisions, and idempotency

### 6.1 Single command path

HTTP and WebSocket submissions both call this sequence:

1. Authenticate the ticket and verify that `playerId` owns the seat.
2. Validate the envelope/body and action ID schema.
3. Load the authoritative branch at `expectedRevision`.
4. Call `engine.decide` with a `SubmitActionCommand`.
5. If accepted, persist all emitted events and the resulting state in one transaction.
6. Publish the committed public events and player-specific observations.

No event is broadcast before the persistence transaction commits.

### 6.2 Revision conflicts

An action is stale when the branch revision is greater than `expectedRevision`. The server returns
`stale_revision` with the current revision and a fresh redacted observation. The client must stop
retrying the old action and select from the new legal-action list.

Claim windows can produce several simultaneous requests at one revision. The engine determines
claim priority and legality. The first transaction that wins the revision compare-and-set is
accepted; later submissions receive `claim_window_closed` or `stale_revision` as appropriate.

### 6.3 Request IDs

Every action request has a stable request ID. The durable receipt stores the request ID and a
canonical command hash. A retry with the same request ID and identical command returns the prior
result without appending events. Reusing the ID with a different player, branch, revision, or
action returns `duplicate_request`.

The request ID used in an `action_request` is the ID the client must echo in `submit_action`.
Separate eligible players in one claim window receive separate request IDs.

## 7. Timeouts and disconnects

The host advertises `actionTimeoutMs` in `hello` and includes an absolute `deadline` in each
`action_request`. The deadline is advisory for display; the durable revision and engine decision
remain authoritative.

The initial prototype uses these rules:

- the default timeout is 30 seconds;
- a socket disconnect does not erase the seat or its request;
- reconnecting with the same ticket resumes from the requested revision;
- after timeout, the configured deterministic bot policy may submit a server-owned action using
  only the player's public observation;
- fallback actions are recorded as metadata and are never presented as human decisions;
- a room may choose `pause_on_disconnect` instead, in which case the timer pauses while the
  acting seat is disconnected and resumes on reconnect.

Malformed messages are counted per socket. After the advertised malformed-response limit, the
server closes the connection with a policy-violation close code. A reconnect is allowed if its
ticket remains valid.

## 8. Persistence and restart behavior

The Deno persistence adapter must provide the existing repository semantics:

- append accepted commands atomically;
- load a game at an exact revision;
- replay to terminal state;
- preserve ruleset definition and hash;
- preserve event, state, and event-chain hashes;
- preserve idempotency receipts;
- fork practice branches only through the core-produced branch marker.

For Deno KV, recommended key families are:

```text
room/<roomId>
room/<roomId>/session/<tokenHash>
game/<gameId>/branch/<branchId>/metadata
game/<gameId>/branch/<branchId>/event/<revision>
game/<gameId>/branch/<branchId>/snapshot/<revision>
game/<gameId>/branch/<branchId>/request/<requestId>
```

The branch metadata key is the compare-and-set point. An append transaction checks the expected
revision and state hash, writes the event range and receipt, then advances branch metadata. A
retry after a process crash reads the receipt before attempting another append.

On restart, no room memory is restored from an in-memory cache. The next HTTP request or
WebSocket join loads room metadata and the game branch from durable storage, reconstructs the
observation, and starts a fresh delivery sequence for that socket.

For a multi-instance Deno Deploy deployment, the commit notification must be at-least-once. A
duplicate notification is harmless because each socket drops a public event whose revision was
already delivered. The durable revision, not the notification order, is authoritative.

## 9. Errors and close behavior

Action errors use the existing structured protocol error envelope and stable codes, including:

`invalid_request`, `unknown_game`, `unknown_player`, `stale_revision`, `duplicate_request`,
`not_players_turn`, `action_not_legal`, `claim_window_closed`, `win_shape_incomplete`,
`win_below_minimum_faan`, `passed_win_restriction`, and `persistence_failure`.

Room-management failures use `invalid_request` with a stable `details.reason` value such as
`room_not_found`, `room_full`, `seat_taken`, `invalid_ticket`, `room_not_ready`, or
`room_already_started`. This keeps protocol v1 clients able to display a structured error while
room-specific error codes are evaluated for a future protocol version.

HTTP status guidance:

| Condition                    |    Status |
| ---------------------------- | --------: |
| invalid body or ticket       | 400 / 401 |
| unknown room or game         |       404 |
| room full or seat conflict   |       409 |
| stale action or closed claim |       409 |
| persistence failure          |       503 |

The server closes a WebSocket with code 1008 for policy violations, 1009 for an oversized frame,
and 1011 for an unrecoverable server error. Before closing, it should send a protocol `error`
when a valid envelope can still be delivered.

## 10. Security and privacy requirements

- Enforce an origin allowlist for browser connections; do not enable wildcard CORS by default.
- Limit WebSocket frames to 64 KiB and action submissions to a small per-socket rate limit.
- Do not log tickets, query strings, concealed tiles, raw observations, or complete prompts.
- Treat display names as untrusted text and escape them in the web client.
- Never send `GameState`, internal events, wall order, or opponent concealed tile IDs over HTTP or
  WebSocket.
- Generate public events through the core public projection, not by deleting fields from an
  internal event with an ad hoc server filter.
- Do not expose omniscient replay views during an active room. They are available only after the
  match or in an explicitly labeled sandbox/debug flow.
- A ticket grants one seat in one room only. It is not a general API key.

## 11. Acceptance criteria

The first vertical slice is complete when all of the following work against a running Deno
server:

1. Alice creates a room and receives a seat and ticket.
2. Bob joins with a separate ticket; both sockets connect to `/ws/games/:gameId`.
3. The owner starts with `wait_for_four` after four people join, or with `fill_with_bots` after
   fewer people join.
4. Each socket receives the same ordered public events but a different redacted observation.
5. A legal action submitted by one player reaches the engine once and is visible to the other
   players without exposing hidden tiles.
6. A duplicate request is idempotent and a stale request is rejected with a fresh observation.
7. A disconnected player can reconnect with the same ticket and catch up from `fromRevision`.
8. A process restart reconstructs the room and game from durable storage.
9. A seeded match can be replayed to the same terminal state and state hash.
10. Malformed, oversized, unauthorized, and cross-player messages are rejected without changing
    game state.

The implementation is still experimental after these checks. Deployment hardening, abuse
prevention, matchmaking, accounts, and global presence are separate work.

## 12. Implementation order

1. Add shared room/session schemas and the Deno entry point.
2. Implement room creation, join tickets, seat assignment, and start.
3. Connect the existing engine and persistence command path to HTTP actions.
4. Add WebSocket upgrade, handshake, replay, observations, and public-event fan-out.
5. Add revision CAS, request receipts, reconnect, and timeout policy.
6. Add Deno KV persistence and at-least-once cross-instance notifications.
7. Run the two-client smoke flow and redaction/replay checks before visual polish.

## 13. Current implementation boundary — 2026-08-06

The first vertical slice is exercised against the Node/Fastify server with SQLite: room creation,
joining, bot filling, start idempotency, redacted observations, action idempotency and stale
revision errors, reconnect catch-up, timeout fallback provenance, pause-on-disconnect, and the
two-client browser smoke flow pass. The pure engine remains the only source of legal actions and
scoring. A rendered browser check also shows the room observation driving the Three.js table and a
legal action advancing the visible revision. The same create/join/start/two-socket/action,
duplicate, stale, redaction, and reconnect flow was run against a live `deno task serve` process
on port 8000; the Deno process was stopped and restarted between room and observation checks to
verify durable KV reconstruction.

`apps/server/deno.ts` opens Deno KV and serves the async `DenoMultiplayerService` through
`createDenoKvHandler`; `packages/persistence/src/deno-kv.ts` preserves the game journal, replay,
idempotency receipts, branch hashes, restart reconstruction, and core-marker-only practice branch
creation. The adapter intentionally does not implement learner/coach records, snapshot recovery
policy, or full persistence import/export; it persists only the minimal decision identity required
to reject a marker with mismatched branch, revision, player, or learner provenance. Durable commit
notifications are polled by the Deno socket hub for at-least-once fan-out. They also retain the
accepted action identity and fallback provenance, allowing a remote instance to emit the submitting
player's `action_accepted` envelope exactly once; every socket still projects a player-specific
observation. Deno KV snapshots are opportunistic under the store's 64 KiB value limit; oversized
snapshots are omitted and replay reconstructs state from the validated event journal.
The KV handler installs its socket listener before returning the upgrade response and defers only the
join sequence until the native socket is open, covering immediate malformed and oversized frames.
