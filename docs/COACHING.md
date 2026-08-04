# Coaching and narration

The analysis package emits structured facts first: distance, visible improving copies, faan paths,
relative risk, and legal-action comparisons. Template coaching turns only those facts into Nudge,
Compare, and Reveal responses. Learner patterns include sample size and decision IDs; unsupported
trend claims are suppressed.

`CoachNarrationService` keeps templates as the offline default. `OpenAICoachNarrator` is an optional
server-side Responses adapter. Its input is a public ruleset summary, redacted observation, legal
actions, deterministic analysis, and evidence-backed learner context. Its structured output is
validated for legal action IDs, supplied fact IDs, supported faan claims, and the deterministic
recommendation. Invalid output, provider errors, cancellation, rate limits, or timeout immediately
fall back to templates. API keys and raw persistence never enter the browser.

Hints, decisions, analysis facts, reviews, and narrator metadata are persisted with ownership and
request identity checks. Reset and export controls are available from the Profile screen and
metadata-only export excludes provider secrets.
