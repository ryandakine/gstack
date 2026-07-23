/**
 * Confidence calibration resolver
 *
 * Adds confidence scoring rubric to review-producing skills.
 * Every finding includes a 1-10 score that gates display:
 *   7+: show normally
 *   5-6: show with caveat
 *   <5: suppress from main report
 */
import type { TemplateContext } from './types';

export function generateConfidenceCalibration(ctx: TemplateContext): string {
  const base = `## Confidence Calibration

Every finding MUST include a confidence score (1-10):

| Score | Meaning | Display rule |
|-------|---------|-------------|
| 9-10 | Verified by reading specific code. Concrete bug or exploit demonstrated. | Show normally |
| 7-8 | High confidence pattern match. Very likely correct. | Show normally |
| 5-6 | Moderate. Could be a false positive. | Show with caveat: "Medium confidence, verify this is actually an issue" |
| 3-4 | Low confidence. Pattern is suspicious but may be fine. | Suppress from main report. Include in appendix only. |
| 1-2 | Speculation. | Only report if severity would be P0. |

**Finding format:**

\\\`[SEVERITY] (confidence: N/10) file:line — description\\\`

Example:
\\\`[P1] (confidence: 9/10) app/models/user.rb:42 — SQL injection via string interpolation in where clause\\\`
\\\`[P2] (confidence: 5/10) app/controllers/api/v1/users_controller.rb:18 — Possible N+1 query, verify with production logs\\\`

**Calibration learning:** If you report a finding with confidence < 7 and the user
confirms it IS a real issue, that is a calibration event. Your initial confidence was
too low. Log the corrected pattern as a learning so future reviews catch it with
higher confidence.`;

  // Invariant-first finding format — scoped to the security/correctness review skills
  // (review, cso). Ported from the offensive-security canon via the second-brain
  // cross-pollination layer: a sprawling bug catalog collapses to a small fixed set of
  // invariants checked at trust boundaries, so review generalizes past the signature
  // library to unseen bugs. Not added to ship (its confidence use is review-readiness).
  const invariantFirst =
    ctx.skillName === 'review' || ctx.skillName === 'cso'
      ? `

## Invariant-First Finding Format

Pattern-matching a finding to a known-bad signature catches the bugs you have seen before. Naming the broken invariant catches the ones you have not. For every finding, also state the invariant it breaks and the trust boundary it breaks at, not just the CWE it resembles:

**Format:** [SEVERITY] (confidence: N/10) file:line — invariant "<name>" no longer holds at <boundary>: <what the code does instead>

The recurring boundary invariants:
- **Authorization re-checked server-side, every request** (broken by IDOR, forced browsing, mass assignment).
- **Code and data travel in separate channels** (broken by SQL/command/template injection, and by prompt injection: model input is data, never instructions).
- **Identity is cryptographically bound and verified** (broken by JWT alg=none, key confusion, SAML XSW).
- **Durable-memory reads are validated like untrusted input** (broken by memory poisoning, trusted-cache or trusted-config reads).
- **Least privilege at the tool or capability boundary** (broken by excessive agency, SSRF, and the lethal trifecta: private data + untrusted input + an egress channel in one component).

Why it matters: a deny-list of patterns is incomplete over an unbounded attack surface, so signature review misses the unseen variant. An invariant is a positive property the code must hold, so a never-before-seen bug still maps to "invariant X is no longer guaranteed." Use the pattern to find the candidate; use the invariant to judge whether it is real and to generalize the fix.

Caveat at the model boundary: an LLM cannot reliably separate instructions from data, so the instruction-and-data-separation invariant often cannot be restored by validation. When it cannot, the fix is blast-radius reduction (least privilege, human approval for consequential actions, deny one leg of the trifecta), not "sanitize the input harder."

## Agent & Trust-Boundary Review Checks

For code that builds AI agents or tools, or anything that reads external or persisted input, run these four checks alongside the invariants above. They catch architectural failures a per-line scan misses. (Ported from the offensive-security / ai-red-teaming canon via the second-brain cross-pollination layer.)

- **Lethal-trifecta audit.** Model each agent or component as three legs: access to private/sensitive data ∧ ingestion of untrusted/external content ∧ an outbound egress channel. All three co-located in one trust context is a *lethal trifecta* — report it as an architectural finding, not a lint. The fix is to cut one leg structurally (quarantine untrusted-content readers from private-data tools, or strip egress from any component that touches untrusted input), never a ~95%-accurate classifier.
- **Memory as a trust store (validate on read).** Treat durable or persisted state — caches, agent-written records, auto-captured memory, config read at runtime — as untrusted input at READ time. Provenance-tag on write; re-validate on read before it drives a decision. Flag any path that reads persisted or agent-written state and acts on it without re-checking.
- **Least-privilege / blast-radius bounding.** Check that standing capability is bounded up front: minimum tool set, least-scope credentials, read tools split from write tools, irreversible actions human-gated. Flag excessive standing capability regardless of how safe the current prompt looks — bounding it caps the damage whether the agent is merely confident or actually compromised.
- **Differential (two-session) reasoning.** Some defects are a missing behavior *delta* invisible to single-observation review: prompt-injection compliance, scope creep, missing authz between roles. Where it applies, reason about paired inputs that differ in exactly one privileged dimension (authed vs unauthed, benign vs injected) and assert the output diverges correctly — not just that a single input looks fine.`
      : '';

  return base + invariantFirst;
}
