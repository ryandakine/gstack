<!-- Phase file of the `ship` skill. Read via the step index in SKILL.md. -->
# Detect and verify

Covers **Steps 0-7**. Forward references to Step 8 or 8.1 are in `steps-08-11-review.md`; Step 12 onward is in `steps-12-20-release.md`.

---

## Step 0: Detect platform and base branch

First, detect the git hosting platform from the remote URL:

```bash
git remote get-url origin 2>/dev/null
```

- If the URL contains "github.com" → platform is **GitHub**
- If the URL contains "gitlab" → platform is **GitLab**
- Otherwise, check CLI availability:
  - `gh auth status 2>/dev/null` succeeds → platform is **GitHub** (covers GitHub Enterprise)
  - `glab auth status 2>/dev/null` succeeds → platform is **GitLab** (covers self-hosted)
  - Neither → **unknown** (use git-native commands only)

Determine which branch this PR/MR targets, or the repo's default branch if no
PR/MR exists. Use the result as "the base branch" in all subsequent steps.

**If GitHub:**
1. `gh pr view --json baseRefName -q .baseRefName` — if succeeds, use it
2. `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — if succeeds, use it

**If GitLab:**
1. `glab mr view -F json 2>/dev/null` and extract the `target_branch` field — if succeeds, use it
2. `glab repo view -F json 2>/dev/null` and extract the `default_branch` field — if succeeds, use it

**Git-native fallback (if unknown platform, or CLI commands fail):**
1. `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'`
2. If that fails: `git rev-parse --verify origin/main 2>/dev/null` → use `main`
3. If that fails: `git rev-parse --verify origin/master 2>/dev/null` → use `master`

If all fail, fall back to `main`.

Print the detected base branch name. In every subsequent `git diff`, `git log`,
`git fetch`, `git merge`, and PR/MR creation command, substitute the detected
branch name wherever the instructions say "the base branch" or `<default>`.

---



# Ship: Fully Automated Ship Workflow

You are running the `/ship` workflow. This is a **non-interactive, fully automated** workflow. Do NOT ask for confirmation at any step. The user said `/ship` which means DO IT. Run straight through and output the PR URL at the end.

**Only stop for:**
- On the base branch (abort)
- Merge conflicts that can't be auto-resolved (stop, show conflicts)
- In-branch test failures (pre-existing failures are triaged, not auto-blocking)
- Pre-landing review finds ASK items that need user judgment
- MINOR or MAJOR version bump needed (ask — see Step 12)
- Greptile review comments that need user decision (complex fixes, false positives)
- AI-assessed coverage below minimum threshold (hard gate with user override — see Step 7)
- Plan items NOT DONE with no user override (see Step 8)
- Plan verification failures (see Step 8.1)
- TODOS.md missing and user wants to create one (ask — see Step 14)
- TODOS.md disorganized and user wants to reorganize (ask — see Step 14)

**Never stop for:**
- Uncommitted changes (always include them)
- Version bump choice (auto-pick MICRO or PATCH — see Step 12)
- CHANGELOG content (auto-generate from diff)
- Commit message approval (auto-commit)
- Multi-file changesets (auto-split into bisectable commits)
- TODOS.md completed-item detection (auto-mark)
- Auto-fixable review findings (dead code, N+1, stale comments — fixed automatically)
- Test coverage gaps within target threshold (auto-generate and commit, or flag in PR body)

**Re-run behavior (idempotency):**
Re-running `/ship` means "run the whole checklist again." Every verification step
(tests, coverage audit, plan completion, pre-landing review, adversarial review,
VERSION/CHANGELOG check, TODOS, document-release) runs on every invocation.
Only *actions* are idempotent:
- Step 12: If VERSION already bumped, skip the bump but still read the version
- Step 17: If already pushed, skip the push command
- Step 19: If PR exists, update the body instead of creating a new PR
Never skip a verification step because a prior `/ship` run already performed it.

---

## Step 1: Pre-flight

1. Check the current branch. If on the base branch or the repo's default branch, **abort**: "You're on the base branch. Ship from a feature branch."

2. Run `git status` (never use `-uall`). Uncommitted changes are always included — no need to ask.

3. Run `git diff <base>...HEAD --stat` and `git log <base>..HEAD --oneline` to understand what's being shipped.

4. Check review readiness:

## Review Readiness Dashboard

After completing the review, read the review log and config to display the dashboard.

```bash
~/.claude/skills/gstack/bin/gstack-review-read
```

Parse the output. Find the most recent entry for each skill (plan-ceo-review, plan-eng-review, review, plan-design-review, design-review-lite, adversarial-review, codex-review, codex-plan-review). Ignore entries with timestamps older than 7 days. For the Eng Review row, show whichever is more recent between `review` (diff-scoped pre-landing review) and `plan-eng-review` (plan-stage architecture review). Append "(DIFF)" or "(PLAN)" to the status to distinguish. For the Adversarial row, show whichever is more recent between `adversarial-review` (new auto-scaled) and `codex-review` (legacy). For Design Review, show whichever is more recent between `plan-design-review` (full visual audit) and `design-review-lite` (code-level check). Append "(FULL)" or "(LITE)" to the status to distinguish. For the Outside Voice row, show the most recent `codex-plan-review` entry — this captures outside voices from both /plan-ceo-review and /plan-eng-review.

**Source attribution:** If the most recent entry for a skill has a \`"via"\` field, append it to the status label in parentheses. Examples: `plan-eng-review` with `via:"autoplan"` shows as "CLEAR (PLAN via /autoplan)". `review` with `via:"ship"` shows as "CLEAR (DIFF via /ship)". Entries without a `via` field show as "CLEAR (PLAN)" or "CLEAR (DIFF)" as before.

Note: `autoplan-voices` and `design-outside-voices` entries are audit-trail-only (forensic data for cross-model consensus analysis). They do not appear in the dashboard and are not checked by any consumer.

Display:

```
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  1   | 2026-03-16 15:00    | CLEAR     | YES      |
| CEO Review      |  0   | —                   | —         | no       |
| Design Review   |  0   | —                   | —         | no       |
| Adversarial     |  0   | —                   | —         | no       |
| Outside Voice   |  0   | —                   | —         | no       |
+--------------------------------------------------------------------+
| VERDICT: CLEARED — Eng Review passed                                |
+====================================================================+
```

**Review tiers:**
- **Eng Review (required by default):** The only review that gates shipping. Covers architecture, code quality, tests, performance. Can be disabled globally with \`gstack-config set skip_eng_review true\` (the "don't bother me" setting).
- **CEO Review (optional):** Use your judgment. Recommend it for big product/business changes, new user-facing features, or scope decisions. Skip for bug fixes, refactors, infra, and cleanup.
- **Design Review (optional):** Use your judgment. Recommend it for UI/UX changes. Skip for backend-only, infra, or prompt-only changes.
- **Adversarial Review (automatic):** Always-on for every review. Every diff gets both Claude adversarial subagent and Codex adversarial challenge. Large diffs (200+ lines) additionally get Codex structured review with P1 gate. No configuration needed.
- **Outside Voice (optional):** Independent plan review from a different AI model. Offered after all review sections complete in /plan-ceo-review and /plan-eng-review. Falls back to Claude subagent if Codex is unavailable. Never gates shipping.

**Verdict logic:**
- **CLEARED**: Eng Review has >= 1 entry within 7 days from either \`review\` or \`plan-eng-review\` with status "clean" (or \`skip_eng_review\` is \`true\`)
- **NOT CLEARED**: Eng Review missing, stale (>7 days), or has open issues
- CEO, Design, and Codex reviews are shown for context but never block shipping
- If \`skip_eng_review\` config is \`true\`, Eng Review shows "SKIPPED (global)" and verdict is CLEARED

**Staleness detection:** After displaying the dashboard, check if any existing reviews may be stale:
- Parse the \`---HEAD---\` section from the bash output to get the current HEAD commit hash
- For each review entry that has a \`commit\` field: compare it against the current HEAD. If different, count elapsed commits: \`git rev-list --count STORED_COMMIT..HEAD\`. Display: "Note: {skill} review from {date} may be stale — {N} commits since review"
- For entries without a \`commit\` field (legacy entries): display "Note: {skill} review from {date} has no commit tracking — consider re-running for accurate staleness detection"
- If all reviews match the current HEAD, do not display any staleness notes

If the Eng Review is NOT "CLEAR":

Print: "No prior eng review found — ship will run its own pre-landing review in Step 9."

Check diff size: `git diff <base>...HEAD --stat | tail -1`. If the diff is >200 lines, add: "Note: This is a large diff. Consider running `/plan-eng-review` or `/autoplan` for architecture-level review before shipping."

If CEO Review is missing, mention as informational ("CEO Review not run — recommended for product changes") but do NOT block.

For Design Review: run `source <(~/.claude/skills/gstack/bin/gstack-diff-scope <base> 2>/dev/null)`. If `SCOPE_FRONTEND=true` and no design review (plan-design-review or design-review-lite) exists in the dashboard, mention: "Design Review not run — this PR changes frontend code. The lite design check will run automatically in Step 9, but consider running /design-review for a full visual audit post-implementation." Still never block.

Continue to Step 2 — do NOT block or ask. Ship runs its own review in Step 9.

---

## Step 2: Distribution Pipeline Check

If the diff introduces a new standalone artifact (CLI binary, library package, tool) — not a web
service with existing deployment — verify that a distribution pipeline exists.

1. Check if the diff adds a new `cmd/` directory, `main.go`, or `bin/` entry point:
   ```bash
   git diff origin/<base> --name-only | grep -E '(cmd/.*/main\.go|bin/|Cargo\.toml|setup\.py|package\.json)' | head -5
   ```

2. If new artifact detected, check for a release workflow:
   ```bash
   ls .github/workflows/ 2>/dev/null | grep -iE 'release|publish|dist'
   grep -qE 'release|publish|deploy' .gitlab-ci.yml 2>/dev/null && echo "GITLAB_CI_RELEASE"
   ```

3. **If no release pipeline exists and a new artifact was added:** Use AskUserQuestion:
   - "This PR adds a new binary/tool but there's no CI/CD pipeline to build and publish it.
     Users won't be able to download the artifact after merge."
   - A) Add a release workflow now (CI/CD release pipeline — GitHub Actions or GitLab CI depending on platform)
   - B) Defer — add to TODOS.md
   - C) Not needed — this is internal/web-only, existing deployment covers it

4. **If release pipeline exists:** Continue silently.
5. **If no new artifact detected:** Skip silently.

---

## Step 3: Merge the base branch (BEFORE tests)

Fetch and merge the base branch into the feature branch so tests run against the merged state:

```bash
git fetch origin <base> && git merge origin/<base> --no-edit
```

**If there are merge conflicts:** Try to auto-resolve if they are simple (VERSION, schema.rb, CHANGELOG ordering). If conflicts are complex or ambiguous, **STOP** and show them.

**If already up to date:** Continue silently.

---

## Step 4: Test Framework Bootstrap

## Test Framework Bootstrap

**Detect existing test framework and project runtime:**

```bash
setopt +o nomatch 2>/dev/null || true  # zsh compat
# Detect project runtime
[ -f Gemfile ] && echo "RUNTIME:ruby"
[ -f package.json ] && echo "RUNTIME:node"
[ -f requirements.txt ] || [ -f pyproject.toml ] && echo "RUNTIME:python"
[ -f go.mod ] && echo "RUNTIME:go"
[ -f Cargo.toml ] && echo "RUNTIME:rust"
[ -f composer.json ] && echo "RUNTIME:php"
[ -f mix.exs ] && echo "RUNTIME:elixir"
# Detect sub-frameworks
[ -f Gemfile ] && grep -q "rails" Gemfile 2>/dev/null && echo "FRAMEWORK:rails"
[ -f package.json ] && grep -q '"next"' package.json 2>/dev/null && echo "FRAMEWORK:nextjs"
# Check for existing test infrastructure
ls jest.config.* vitest.config.* playwright.config.* .rspec pytest.ini pyproject.toml phpunit.xml 2>/dev/null
ls -d test/ tests/ spec/ __tests__/ cypress/ e2e/ 2>/dev/null
# Check opt-out marker
[ -f .gstack/no-test-bootstrap ] && echo "BOOTSTRAP_DECLINED"
```

**If test framework detected** (config files or test directories found):
Print "Test framework detected: {name} ({N} existing tests). Skipping bootstrap."
Read 2-3 existing test files to learn conventions (naming, imports, assertion style, setup patterns).
Store conventions as prose context for use in Phase 8e.5 or Step 7. **Skip the rest of bootstrap.**

**If BOOTSTRAP_DECLINED** appears: Print "Test bootstrap previously declined — skipping." **Skip the rest of bootstrap.**

**If NO runtime detected** (no config files found): Use AskUserQuestion:
"I couldn't detect your project's language. What runtime are you using?"
Options: A) Node.js/TypeScript B) Ruby/Rails C) Python D) Go E) Rust F) PHP G) Elixir H) This project doesn't need tests.
If user picks H → write `.gstack/no-test-bootstrap` and continue without tests.

**If runtime detected but no test framework — bootstrap:**

### B2. Research best practices

Use WebSearch to find current best practices for the detected runtime:
- `"[runtime] best test framework 2025 2026"`
- `"[framework A] vs [framework B] comparison"`

If WebSearch is unavailable, use this built-in knowledge table:

| Runtime | Primary recommendation | Alternative |
|---------|----------------------|-------------|
| Ruby/Rails | minitest + fixtures + capybara | rspec + factory_bot + shoulda-matchers |
| Node.js | vitest + @testing-library | jest + @testing-library |
| Next.js | vitest + @testing-library/react + playwright | jest + cypress |
| Python | pytest + pytest-cov | unittest |
| Go | stdlib testing + testify | stdlib only |
| Rust | cargo test (built-in) + mockall | — |
| PHP | phpunit + mockery | pest |
| Elixir | ExUnit (built-in) + ex_machina | — |

### B3. Framework selection

Use AskUserQuestion:
"I detected this is a [Runtime/Framework] project with no test framework. I researched current best practices. Here are the options:
A) [Primary] — [rationale]. Includes: [packages]. Supports: unit, integration, smoke, e2e
B) [Alternative] — [rationale]. Includes: [packages]
C) Skip — don't set up testing right now
RECOMMENDATION: Choose A because [reason based on project context]"

If user picks C → write `.gstack/no-test-bootstrap`. Tell user: "If you change your mind later, delete `.gstack/no-test-bootstrap` and re-run." Continue without tests.

If multiple runtimes detected (monorepo) → ask which runtime to set up first, with option to do both sequentially.

### B4. Install and configure

1. Install the chosen packages (npm/bun/gem/pip/etc.)
2. Create minimal config file
3. Create directory structure (test/, spec/, etc.)
4. Create one example test matching the project's code to verify setup works

If package installation fails → debug once. If still failing → revert with `git checkout -- package.json package-lock.json` (or equivalent for the runtime). Warn user and continue without tests.

### B4.5. First real tests

Generate 3-5 real tests for existing code:

1. **Find recently changed files:** `git log --since=30.days --name-only --format="" | sort | uniq -c | sort -rn | head -10`
2. **Prioritize by risk:** Error handlers > business logic with conditionals > API endpoints > pure functions
3. **For each file:** Write one test that tests real behavior with meaningful assertions. Never `expect(x).toBeDefined()` — test what the code DOES.
4. Run each test. Passes → keep. Fails → fix once. Still fails → delete silently.
5. Generate at least 1 test, cap at 5.

Never import secrets, API keys, or credentials in test files. Use environment variables or test fixtures.

### B5. Verify

```bash
# Run the full test suite to confirm everything works
{detected test command}
```

If tests fail → debug once. If still failing → revert all bootstrap changes and warn user.

### B5.5. CI/CD pipeline

```bash
# Check CI provider
ls -d .github/ 2>/dev/null && echo "CI:github"
ls .gitlab-ci.yml .circleci/ bitrise.yml 2>/dev/null
```

If `.github/` exists (or no CI detected — default to GitHub Actions):
Create `.github/workflows/test.yml` with:
- `runs-on: ubuntu-latest`
- Appropriate setup action for the runtime (setup-node, setup-ruby, setup-python, etc.)
- The same test command verified in B5
- Trigger: push + pull_request

If non-GitHub CI detected → skip CI generation with note: "Detected {provider} — CI pipeline generation supports GitHub Actions only. Add test step to your existing pipeline manually."

### B6. Create TESTING.md

First check: If TESTING.md already exists → read it and update/append rather than overwriting. Never destroy existing content.

Write TESTING.md with:
- Philosophy: "100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower."
- Framework name and version
- How to run tests (the verified command from B5)
- Test layers: Unit tests (what, where, when), Integration tests, Smoke tests, E2E tests
- Conventions: file naming, assertion style, setup/teardown patterns

### B7. Update CLAUDE.md

First check: If CLAUDE.md already has a `## Testing` section → skip. Don't duplicate.

Append a `## Testing` section:
- Run command and test directory
- Reference to TESTING.md
- Test expectations:
  - 100% test coverage is the goal — tests make vibe coding safe
  - When writing new functions, write a corresponding test
  - When fixing a bug, write a regression test
  - When adding error handling, write a test that triggers the error
  - When adding a conditional (if/else, switch), write tests for BOTH paths
  - Never commit code that makes existing tests fail

### B8. Commit

```bash
git status --porcelain
```

Only commit if there are changes. Stage all bootstrap files (config, test directory, TESTING.md, CLAUDE.md, .github/workflows/test.yml if created):
`git commit -m "chore: bootstrap test framework ({framework name})"`

---

---

## Step 5: Run tests (on merged code)

**Do NOT run `RAILS_ENV=test bin/rails db:migrate`** — `bin/test-lane` already calls
`db:test:prepare` internally, which loads the schema into the correct lane database.
Running bare test migrations without INSTANCE hits an orphan DB and corrupts structure.sql.

Run both test suites in parallel:

```bash
bin/test-lane 2>&1 | tee /tmp/ship_tests.txt &
npm run test 2>&1 | tee /tmp/ship_vitest.txt &
wait
```

After both complete, read the output files and check pass/fail.

**If any test fails:** Do NOT immediately stop. Apply the Test Failure Ownership Triage:

## Test Failure Ownership Triage

When tests fail, do NOT immediately stop. First, determine ownership:

### Step T1: Classify each failure

For each failing test:

1. **Get the files changed on this branch:**
   ```bash
   git diff origin/<base>...HEAD --name-only
   ```

2. **Classify the failure:**
   - **In-branch** if: the failing test file itself was modified on this branch, OR the test output references code that was changed on this branch, OR you can trace the failure to a change in the branch diff.
   - **Likely pre-existing** if: neither the test file nor the code it tests was modified on this branch, AND the failure is unrelated to any branch change you can identify.
   - **When ambiguous, default to in-branch.** It is safer to stop the developer than to let a broken test ship. Only classify as pre-existing when you are confident.

   This classification is heuristic — use your judgment reading the diff and the test output. You do not have a programmatic dependency graph.

### Step T2: Handle in-branch failures

**STOP.** These are your failures. Show them and do not proceed. The developer must fix their own broken tests before shipping.

### Step T3: Handle pre-existing failures

Check `REPO_MODE` from the preamble output.

**If REPO_MODE is `solo`:**

Use AskUserQuestion:

> These test failures appear pre-existing (not caused by your branch changes):
>
> [list each failure with file:line and brief error description]
>
> Since this is a solo repo, you're the only one who will fix these.
>
> RECOMMENDATION: Choose A — fix now while the context is fresh. Completeness: 9/10.
> A) Investigate and fix now (human: ~2-4h / CC: ~15min) — Completeness: 10/10
> B) Add as P0 TODO — fix after this branch lands — Completeness: 7/10
> C) Skip — I know about this, ship anyway — Completeness: 3/10

**If REPO_MODE is `collaborative` or `unknown`:**

Use AskUserQuestion:

> These test failures appear pre-existing (not caused by your branch changes):
>
> [list each failure with file:line and brief error description]
>
> This is a collaborative repo — these may be someone else's responsibility.
>
> RECOMMENDATION: Choose B — assign it to whoever broke it so the right person fixes it. Completeness: 9/10.
> A) Investigate and fix now anyway — Completeness: 10/10
> B) Blame + assign GitHub issue to the author — Completeness: 9/10
> C) Add as P0 TODO — Completeness: 7/10
> D) Skip — ship anyway — Completeness: 3/10

### Step T4: Execute the chosen action

**If "Investigate and fix now":**
- Switch to /investigate mindset: root cause first, then minimal fix.
- Fix the pre-existing failure.
- Commit the fix separately from the branch's changes: `git commit -m "fix: pre-existing test failure in <test-file>"`
- Continue with the workflow.

**If "Add as P0 TODO":**
- If `TODOS.md` exists, add the entry following the format in `review/TODOS-format.md` (or `.claude/skills/review/TODOS-format.md`).
- If `TODOS.md` does not exist, create it with the standard header and add the entry.
- Entry should include: title, the error output, which branch it was noticed on, and priority P0.
- Continue with the workflow — treat the pre-existing failure as non-blocking.

**If "Blame + assign GitHub issue" (collaborative only):**
- Find who likely broke it. Check BOTH the test file AND the production code it tests:
  ```bash
  # Who last touched the failing test?
  git log --format="%an (%ae)" -1 -- <failing-test-file>
  # Who last touched the production code the test covers? (often the actual breaker)
  git log --format="%an (%ae)" -1 -- <source-file-under-test>
  ```
  If these are different people, prefer the production code author — they likely introduced the regression.
- Create an issue assigned to that person (use the platform detected in Step 0):
  - **If GitHub:**
    ```bash
    gh issue create \
      --title "Pre-existing test failure: <test-name>" \
      --body "Found failing on branch <current-branch>. Failure is pre-existing.\n\n**Error:**\n```\n<first 10 lines>\n```\n\n**Last modified by:** <author>\n**Noticed by:** gstack /ship on <date>" \
      --assignee "<github-username>"
    ```
  - **If GitLab:**
    ```bash
    glab issue create \
      -t "Pre-existing test failure: <test-name>" \
      -d "Found failing on branch <current-branch>. Failure is pre-existing.\n\n**Error:**\n```\n<first 10 lines>\n```\n\n**Last modified by:** <author>\n**Noticed by:** gstack /ship on <date>" \
      -a "<gitlab-username>"
    ```
- If neither CLI is available or `--assignee`/`-a` fails (user not in org, etc.), create the issue without assignee and note who should look at it in the body.
- Continue with the workflow.

**If "Skip":**
- Continue with the workflow.
- Note in output: "Pre-existing test failure skipped: <test-name>"

**After triage:** If any in-branch failures remain unfixed, **STOP**. Do not proceed. If all failures were pre-existing and handled (fixed, TODOed, assigned, or skipped), continue to Step 6.

**If all pass:** Continue silently — just note the counts briefly.

---

## Step 6: Eval Suites (conditional)

Evals are mandatory when prompt-related files change. Skip this step entirely if no prompt files are in the diff.

**1. Check if the diff touches prompt-related files:**

```bash
git diff origin/<base> --name-only
```

Match against these patterns (from CLAUDE.md):
- `app/services/*_prompt_builder.rb`
- `app/services/*_generation_service.rb`, `*_writer_service.rb`, `*_designer_service.rb`
- `app/services/*_evaluator.rb`, `*_scorer.rb`, `*_classifier_service.rb`, `*_analyzer.rb`
- `app/services/concerns/*voice*.rb`, `*writing*.rb`, `*prompt*.rb`, `*token*.rb`
- `app/services/chat_tools/*.rb`, `app/services/x_thread_tools/*.rb`
- `config/system_prompts/*.txt`
- `test/evals/**/*` (eval infrastructure changes affect all suites)

**If no matches:** Print "No prompt-related files changed — skipping evals." and continue to Step 9.

**2. Identify affected eval suites:**

Each eval runner (`test/evals/*_eval_runner.rb`) declares `PROMPT_SOURCE_FILES` listing which source files affect it. Grep these to find which suites match the changed files:

```bash
grep -l "changed_file_basename" test/evals/*_eval_runner.rb
```

Map runner → test file: `post_generation_eval_runner.rb` → `post_generation_eval_test.rb`.

**Special cases:**
- Changes to `test/evals/judges/*.rb`, `test/evals/support/*.rb`, or `test/evals/fixtures/` affect ALL suites that use those judges/support files. Check imports in the eval test files to determine which.
- Changes to `config/system_prompts/*.txt` — grep eval runners for the prompt filename to find affected suites.
- If unsure which suites are affected, run ALL suites that could plausibly be impacted. Over-testing is better than missing a regression.

**3. Run affected suites at `EVAL_JUDGE_TIER=full`:**

`/ship` is a pre-merge gate, so always use full tier (Sonnet structural + Opus persona judges).

```bash
EVAL_JUDGE_TIER=full EVAL_VERBOSE=1 bin/test-lane --eval test/evals/<suite>_eval_test.rb 2>&1 | tee /tmp/ship_evals.txt
```

If multiple suites need to run, run them sequentially (each needs a test lane). If the first suite fails, stop immediately — don't burn API cost on remaining suites.

**4. Check results:**

- **If any eval fails:** Show the failures, the cost dashboard, and **STOP**. Do not proceed.
- **If all pass:** Note pass counts and cost. Continue to Step 9.

**5. Save eval output** — include eval results and cost dashboard in the PR body (Step 19).

**Tier reference (for context — /ship always uses `full`):**
| Tier | When | Speed (cached) | Cost |
|------|------|----------------|------|
| `fast` (Haiku) | Dev iteration, smoke tests | ~5s (14x faster) | ~$0.07/run |
| `standard` (Sonnet) | Default dev, `bin/test-lane --eval` | ~17s (4x faster) | ~$0.37/run |
| `full` (Opus persona) | **`/ship` and pre-merge** | ~72s (baseline) | ~$1.27/run |

---

## Step 7: Test Coverage Audit

**Dispatch this step as a subagent** using the Agent tool with `subagent_type: "general-purpose"`. The subagent runs the coverage audit in a fresh context window — the parent only sees the conclusion, not intermediate file reads. This is context-rot defense.

**Subagent prompt:** Pass the following instructions to the subagent, with `<base>` substituted with the base branch:

> You are running a ship-workflow test coverage audit. Run `git diff <base>...HEAD` as needed. Do not commit or push — report only.
>
> 100% coverage is the goal — every untested path is a path where bugs hide and vibe coding becomes yolo coding. Evaluate what was ACTUALLY coded (from the diff), not what was planned.

### Test Framework Detection

Before analyzing coverage, detect the project's test framework:

1. **Read CLAUDE.md** — look for a `## Testing` section with test command and framework name. If found, use that as the authoritative source.
2. **If CLAUDE.md has no testing section, auto-detect:**

```bash
setopt +o nomatch 2>/dev/null || true  # zsh compat
# Detect project runtime
[ -f Gemfile ] && echo "RUNTIME:ruby"
[ -f package.json ] && echo "RUNTIME:node"
[ -f requirements.txt ] || [ -f pyproject.toml ] && echo "RUNTIME:python"
[ -f go.mod ] && echo "RUNTIME:go"
[ -f Cargo.toml ] && echo "RUNTIME:rust"
# Check for existing test infrastructure
ls jest.config.* vitest.config.* playwright.config.* cypress.config.* .rspec pytest.ini phpunit.xml 2>/dev/null
ls -d test/ tests/ spec/ __tests__/ cypress/ e2e/ 2>/dev/null
```

3. **If no framework detected:** falls through to the Test Framework Bootstrap step (Step 4) which handles full setup.

**0. Before/after test count:**

```bash
# Count test files before any generation
find . -name '*.test.*' -o -name '*.spec.*' -o -name '*_test.*' -o -name '*_spec.*' | grep -v node_modules | wc -l
```

Store this number for the PR body.

**1. Trace every codepath changed** using `git diff origin/<base>...HEAD`:

Read every changed file. For each one, trace how data flows through the code — don't just list functions, actually follow the execution:

1. **Read the diff.** For each changed file, read the full file (not just the diff hunk) to understand context.
2. **Trace data flow.** Starting from each entry point (route handler, exported function, event listener, component render), follow the data through every branch:
   - Where does input come from? (request params, props, database, API call)
   - What transforms it? (validation, mapping, computation)
   - Where does it go? (database write, API response, rendered output, side effect)
   - What can go wrong at each step? (null/undefined, invalid input, network failure, empty collection)
3. **Diagram the execution.** For each changed file, draw an ASCII diagram showing:
   - Every function/method that was added or modified
   - Every conditional branch (if/else, switch, ternary, guard clause, early return)
   - Every error path (try/catch, rescue, error boundary, fallback)
   - Every call to another function (trace into it — does IT have untested branches?)
   - Every edge: what happens with null input? Empty array? Invalid type?

This is the critical step — you're building a map of every line of code that can execute differently based on input. Every branch in this diagram needs a test.

**2. Map user flows, interactions, and error states:**

Code coverage isn't enough — you need to cover how real users interact with the changed code. For each changed feature, think through:

- **User flows:** What sequence of actions does a user take that touches this code? Map the full journey (e.g., "user clicks 'Pay' → form validates → API call → success/failure screen"). Each step in the journey needs a test.
- **Interaction edge cases:** What happens when the user does something unexpected?
  - Double-click/rapid resubmit
  - Navigate away mid-operation (back button, close tab, click another link)
  - Submit with stale data (page sat open for 30 minutes, session expired)
  - Slow connection (API takes 10 seconds — what does the user see?)
  - Concurrent actions (two tabs, same form)
- **Error states the user can see:** For every error the code handles, what does the user actually experience?
  - Is there a clear error message or a silent failure?
  - Can the user recover (retry, go back, fix input) or are they stuck?
  - What happens with no network? With a 500 from the API? With invalid data from the server?
- **Empty/zero/boundary states:** What does the UI show with zero results? With 10,000 results? With a single character input? With maximum-length input?

Add these to your diagram alongside the code branches. A user flow with no test is just as much a gap as an untested if/else.

**3. Check each branch against existing tests:**

Go through your diagram branch by branch — both code paths AND user flows. For each one, search for a test that exercises it:
- Function `processPayment()` → look for `billing.test.ts`, `billing.spec.ts`, `test/billing_test.rb`
- An if/else → look for tests covering BOTH the true AND false path
- An error handler → look for a test that triggers that specific error condition
- A call to `helperFn()` that has its own branches → those branches need tests too
- A user flow → look for an integration or E2E test that walks through the journey
- An interaction edge case → look for a test that simulates the unexpected action

Quality scoring rubric:
- ★★★  Tests behavior with edge cases AND error paths
- ★★   Tests correct behavior, happy path only
- ★    Smoke test / existence check / trivial assertion (e.g., "it renders", "it doesn't throw")

### E2E Test Decision Matrix

When checking each branch, also determine whether a unit test or E2E/integration test is the right tool:

**RECOMMEND E2E (mark as [→E2E] in the diagram):**
- Common user flow spanning 3+ components/services (e.g., signup → verify email → first login)
- Integration point where mocking hides real failures (e.g., API → queue → worker → DB)
- Auth/payment/data-destruction flows — too important to trust unit tests alone

**RECOMMEND EVAL (mark as [→EVAL] in the diagram):**
- Critical LLM call that needs a quality eval (e.g., prompt change → test output still meets quality bar)
- Changes to prompt templates, system instructions, or tool definitions

**STICK WITH UNIT TESTS:**
- Pure function with clear inputs/outputs
- Internal helper with no side effects
- Edge case of a single function (null input, empty array)
- Obscure/rare flow that isn't customer-facing

### REGRESSION RULE (mandatory)

**IRON RULE:** When the coverage audit identifies a REGRESSION — code that previously worked but the diff broke — a regression test is written immediately. No AskUserQuestion. No skipping. Regressions are the highest-priority test because they prove something broke.

A regression is when:
- The diff modifies existing behavior (not new code)
- The existing test suite (if any) doesn't cover the changed path
- The change introduces a new failure mode for existing callers

When uncertain whether a change is a regression, err on the side of writing the test.

Format: commit as `test: regression test for {what broke}`

**4. Output ASCII coverage diagram:**

Include BOTH code paths and user flows in the same diagram. Mark E2E-worthy and eval-worthy paths:

```
CODE PATHS                                            USER FLOWS
[+] src/services/billing.ts                           [+] Payment checkout
  ├── processPayment()                                  ├── [★★★ TESTED] Complete purchase — checkout.e2e.ts:15
  │   ├── [★★★ TESTED] happy + declined + timeout      ├── [GAP] [→E2E] Double-click submit
  │   ├── [GAP]         Network timeout                 └── [GAP]        Navigate away mid-payment
  │   └── [GAP]         Invalid currency
  └── refundPayment()                                 [+] Error states
      ├── [★★  TESTED] Full refund — :89                ├── [★★  TESTED] Card declined message
      └── [★   TESTED] Partial (non-throw only) — :101  └── [GAP]        Network timeout UX

LLM integration: [GAP] [→EVAL] Prompt template change — needs eval test

COVERAGE: 5/13 paths tested (38%)  |  Code paths: 3/5 (60%)  |  User flows: 2/8 (25%)
QUALITY: ★★★:2 ★★:2 ★:1  |  GAPS: 8 (2 E2E, 1 eval)
```

Legend: ★★★ behavior + edge + error  |  ★★ happy path  |  ★ smoke check
[→E2E] = needs integration test  |  [→EVAL] = needs LLM eval

**Fast path:** All paths covered → "Step 7: All new code paths have test coverage ✓" Continue.

**5. Generate tests for uncovered paths:**

If test framework detected (or bootstrapped in Step 4):
- Prioritize error handlers and edge cases first (happy paths are more likely already tested)
- Read 2-3 existing test files to match conventions exactly
- Generate unit tests. Mock all external dependencies (DB, API, Redis).
- For paths marked [→E2E]: generate integration/E2E tests using the project's E2E framework (Playwright, Cypress, Capybara, etc.)
- For paths marked [→EVAL]: generate eval tests using the project's eval framework, or flag for manual eval if none exists
- Write tests that exercise the specific uncovered path with real assertions
- Run each test. Passes → commit as `test: coverage for {feature}`
- Fails → fix once. Still fails → revert, note gap in diagram.

Caps: 30 code paths max, 20 tests generated max (code + user flow combined), 2-min per-test exploration cap.

If no test framework AND user declined bootstrap → diagram only, no generation. Note: "Test generation skipped — no test framework configured."

**Diff is test-only changes:** Skip Step 7 entirely: "No new application code paths to audit."

**6. After-count and coverage summary:**

```bash
# Count test files after generation
find . -name '*.test.*' -o -name '*.spec.*' -o -name '*_test.*' -o -name '*_spec.*' | grep -v node_modules | wc -l
```

For PR body: `Tests: {before} → {after} (+{delta} new)`
Coverage line: `Test Coverage Audit: N new code paths. M covered (X%). K tests generated, J committed.`

**7. Coverage gate:**

Before proceeding, check CLAUDE.md for a `## Test Coverage` section with `Minimum:` and `Target:` fields. If found, use those percentages. Otherwise use defaults: Minimum = 60%, Target = 80%.

Using the coverage percentage from the diagram in substep 4 (the `COVERAGE: X/Y (Z%)` line):

- **>= target:** Pass. "Coverage gate: PASS ({X}%)." Continue.
- **>= minimum, < target:** Use AskUserQuestion:
  - "AI-assessed coverage is {X}%. {N} code paths are untested. Target is {target}%."
  - RECOMMENDATION: Choose A because untested code paths are where production bugs hide.
  - Options:
    A) Generate more tests for remaining gaps (recommended)
    B) Ship anyway — I accept the coverage risk
    C) These paths don't need tests — mark as intentionally uncovered
  - If A: Loop back to substep 5 (generate tests) targeting the remaining gaps. After second pass, if still below target, present AskUserQuestion again with updated numbers. Maximum 2 generation passes total.
  - If B: Continue. Include in PR body: "Coverage gate: {X}% — user accepted risk."
  - If C: Continue. Include in PR body: "Coverage gate: {X}% — {N} paths intentionally uncovered."

- **< minimum:** Use AskUserQuestion:
  - "AI-assessed coverage is critically low ({X}%). {N} of {M} code paths have no tests. Minimum threshold is {minimum}%."
  - RECOMMENDATION: Choose A because less than {minimum}% means more code is untested than tested.
  - Options:
    A) Generate tests for remaining gaps (recommended)
    B) Override — ship with low coverage (I understand the risk)
  - If A: Loop back to substep 5. Maximum 2 passes. If still below minimum after 2 passes, present the override choice again.
  - If B: Continue. Include in PR body: "Coverage gate: OVERRIDDEN at {X}%."

**Coverage percentage undetermined:** If the coverage diagram doesn't produce a clear numeric percentage (ambiguous output, parse error), **skip the gate** with: "Coverage gate: could not determine percentage — skipping." Do not default to 0% or block.

**Test-only diffs:** Skip the gate (same as the existing fast-path).

**100% coverage:** "Coverage gate: PASS (100%)." Continue.

### Test Plan Artifact

After producing the coverage diagram, write a test plan artifact so `/qa` and `/qa-only` can consume it:

```bash
eval "$(~/.claude/skills/gstack/bin/gstack-slug 2>/dev/null)" && mkdir -p ~/.gstack/projects/$SLUG
USER=$(whoami)
DATETIME=$(date +%Y%m%d-%H%M%S)
```

Write to `~/.gstack/projects/{slug}/{user}-{branch}-ship-test-plan-{datetime}.md`:

```markdown
# Test Plan
Generated by /ship on {date}
Branch: {branch}
Repo: {owner/repo}

## Affected Pages/Routes
- {URL path} — {what to test and why}

## Key Interactions to Verify
- {interaction description} on {page}

## Edge Cases
- {edge case} on {page}

## Critical Paths
- {end-to-end flow that must work}
```
>
> After your analysis, output a single JSON object on the LAST LINE of your response (no other text after it):
> `{"coverage_pct":N,"gaps":N,"diagram":"<full markdown coverage diagram for PR body>","tests_added":["path",...]}`

**Parent processing:**

1. Read the subagent's final output. Parse the LAST line as JSON.
2. Store `coverage_pct` (for Step 20 metrics), `gaps` (user summary), `tests_added` (for the commit).
3. Embed `diagram` verbatim in the PR body's `## Test Coverage` section (Step 19).
4. Print a one-line summary: `Coverage: {coverage_pct}%, {gaps} gaps. {tests_added.length} tests added.`

**If the subagent fails, times out, or returns invalid JSON:** Fall back to running the audit inline in the parent. Do not block /ship on subagent failure — partial results are better than none.

---

