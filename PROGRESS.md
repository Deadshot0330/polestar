# Home Dashboard — paused until after WoW: Forever launch

Pause checkpoint: 2026-10-22. Resume only when requested after launch. No new
features or refactoring are planned during the pause. This is an implementation
checkpoint, not a release approval.

## Git checkpoint and preservation

- Current branch: `feature/home-dashboard-v2`; HEAD `7d3d2358`
  (`fix(ui): adapt navigation rail to available height`).
- Local `next...HEAD` comparison: 0 commits unique to `next`, 2 unique to HEAD.
  No fetch was performed; this does not establish current upstream divergence.
- At review time: 21 modified tracked files and 14 untracked files, before adding
  this document. The index is empty. The dashboard Lua, five Home test suites,
  two review documents and two changelog fragments are untracked.
- Remotes: `origin` is Deadshot0330/polestar; `upstream` is fitzforge/polestar.
- The existing dedicated feature branch is appropriate, but a branch reference
  alone does **not** preserve uncommitted or untracked work.
- No commit, push, branch switch, reset, stash, merge or rebase was performed.
  Other local branches and unrelated working changes remain untouched.

Recommended preservation steps, requiring the user's approval before execution:

1. Make an external backup of the entire current worktree, including untracked
   files (a Git diff alone omits them). Keep credentials and ignored game/reference
   data out of any remote snapshot.
2. Review tracked diffs and untracked files individually. The modifications span
   shared runtime modules; do not assume every dirty hunk belongs to Home.
3. Stage only confirmed Home work, tests, documentation and fragments, using
   explicit paths and selective hunks for mixed files. Review the staged diff and
   save a checkpoint commit on the **current** feature branch. Preserve unrelated
   work unstaged and backed up; do not use `git add .` or a blanket stash.
4. If separately approved, push that feature branch to `origin` for backup. Do
   not push or merge to upstream `next`. Record the resulting checkpoint hash here.

## Completed implementation

- Home is the general hub landing page, with explicit guide destinations retained.
- Your Journey shows character/faction/location context. The shared shell wordmark
  and community subtitle are restored above it with measured vertical spacing.
- Continue/Choose a Guide plus six optional cards: Leveling Build, Dungeons,
  Up Next, Class Training, Gear Opportunities and Rares Nearby.
- Shared provider data supplies live guide progress/objectives, continuation,
  talent plans, journal matches, trainer services, contextual equipment/rewards
  and recent or historical rare sightings. Missing data has explicit fallbacks.
- Pooled inspector supports entity-specific tabs, explicit actions, session scroll
  memory, dismissal and side/inline responsive placement.
- Account-wide customization saves optional-card visibility/order; Continue stays
  first. Keyboard/gamepad traversal and nested scroll reveal are implemented.
- Hidden views/cards defer reads; refreshes coalesce, and layout/skin changes reuse
  snapshots. Existing guide loading remains owned by Picker/Engine.
- Legacy bottom selected-guide text and View/Load/New-tab buttons, layout space
  and focus references have been removed. Shared guide actions remain elsewhere.

Implementation details: [Home review](docs/HOME_DASHBOARD_REVIEW.md) and
[inspector contracts](docs/HOME_INSPECTOR.md). Those documents predate the latest
branding cleanup: references to a visible suggestion list or bottom guide actions
must be reconciled before release. Current Home hides suggestion rows; Up Next
still uses recommendations. No new recommendation feature is required to resume.

## Remaining work, bugs and uncertainty

- Two broader Picker tests fail: “Home: Continue cards for the open tabs and the
  suggested guides; a card selects, a double-click continues” and “the Next fact
  and the suggested follow-ups list only the options offered now”. They expect
  suggestion rows that current Home hides. Resolve intended presentation and
  update coverage without weakening route-offer checks. This is a known test/
  behavior mismatch, not evidence that the recommendation provider is broken.
- No live-client validation was performed in this session. Actual artwork/font
  rasterization, hardware gamepad focus, native gamepad restrictions, combat taint,
  event ordering, real provider data and performance remain unverified.
- Saved layout persistence needs real logout/reload and multiple-character checks.
  Validate guide pins/tabs/manual navigation, trainer/reward closure, rare expiry,
  and stale inspector action invalidation with real data.
- Locale synchronization and final maintainer packaging/release checks remain.
- Richer ability milestones, remaining-XP estimates, global reward recommendations
  and full-zone rare scans are intentionally absent because providers do not
  establish those facts. These are limitations, not required scope for shipping.
- No claim is made that this review exhaustively rules out runtime bugs.

## Dependencies to inspect when upstream changes

| Integration | Rebase/merge risk and required invariant |
|---|---|
| `UI.xml`, UI/Commands landing behavior | Keep Home modules in dependency order and preserve explicit destinations. |
| Picker section registry, selection, loading, rail and gamepad hooks | Preserve section callbacks, guide IDs/load semantics, RevealControl and inspector Back handling. |
| Theme/Widgets shell | Home uses Sidebar/Main geometry, shell rail/footer/side metrics and existing Wordmark/Tagline. Header calculations assume Home starts 44px below the shell top; update both integration points together if anchors change. Preserve branding fonts, parents and painting. |
| Engine/Guides | GetGuide, applicable GetProgress, GetLiveStep/GetStepView, NextGuide, RouteOffered, Suggestions, tabs and TrainingStatus must remain authoritative; never move a pinned step during inspection. |
| Dungeons runtime/UI | Shared ForPlayer, MatchesLevel, QuestCount/QuestState policy and map/open entry points; preserve preview/faction semantics and native combat/gamepad guards. |
| Trainer/Gear/UI stat names | Services and CurrentRewards are narrow live-window queries; maintain closure invalidation, existing scoring thresholds, paired-weapon behavior and localized labels. |
| Rares/Nav/Compat | NearbyRecords expiry/copy semantics, History/Info, supplied coordinates and explicit navigation; do not equate sightings with a living rare. |
| Settings, lifecycle and event bus | Preserve account-wide home.layout normalization, hidden-provider deferral, coalescing and stale-action revalidation. |

Shared changed files include Engine, Commands, Dungeons, Gear/Picks, QoL/Trainer,
Rares, Theme/Widgets, UI/Dungeons, Gamepad, GearScales, Picker and UI. Inspect their
hunks before rebasing; restoring only Home.lua would lose required integrations.
Do not replace upstream files wholesale. Follow `docs/ARCHITECTURE.md` contracts.

## Minimum shipping gate

Latest checks from the implementation session (not rerun for this documentation
checkpoint): 93 Home tests passed; 12 Home text/layout tests passed across all
six configured skins; Lua 5.1 syntax, global/manifest checks, whitespace and
changelog validation passed. Broader UI run: 261/263 passed, with the two failures
above. The older review's 656-test result is historical, not current validation.

Before shipping:

1. Resolve both known failures and rerun `node --test tests/ui-home*.test.js
   tests/ui-picker*.test.js tests/ui-rail.test.js tests/gamepad.test.js
   tests/ui.test.js tests/theme.test.js tests/syntax.test.js` (as one command).
2. Run `node --test --test-name-pattern="text fits: Home" tests/text-fit.test.js`;
   include all six skins, supported menu scales, narrow/short windows, long
   translations, customization and side/inline inspector transitions.
3. Run affected provider suites for Engine/routes/training, Dungeons, Gear,
   Trainer, Rares, Talents and native gamepad restrictions after reconciling their
   upstream changes. Discover exact suite names from the current checkout.
4. Run `git diff --check` and `node tools/polestar.js changelog check`; Lua static
   checks are in syntax.test.js. Guide lint is not a substitute for Lua checks.
5. Perform a real Forever-client smoke test covering the unverified items above,
   all card actions, keyboard/gamepad return focus, missing providers, combat,
   cold login/reload, and hidden-view performance. Inspect errors/taint logs.
6. Require current CI and maintainer review before release. Sync locales through
   the maintainer workflow; do not regenerate unrelated assets or bump versions.

## Resume after launch

- [ ] Confirm approval to resume and locate the reviewed checkpoint/backup.
- [ ] Inventory dirty/untracked work again before any checkout or rebase.
- [ ] Fetch upstream when authorized; compare current `upstream/next` with the
      saved feature branch and inspect overlapping PRs before starting fixes.
- [ ] Reconcile shared dependencies in small reviewed commits; preserve upstream
      fixes and keep unrelated changes isolated. Rebase only with approval.
- [ ] Reconcile stale docs and the two suggestion-row tests with intended scope.
- [ ] Complete the minimum automated and live-client shipping gate.
- [ ] If a PR is authorized, target `next`, link any issues actually fixed, and
      complete the AI-agent declaration. Do not merge automatically.
