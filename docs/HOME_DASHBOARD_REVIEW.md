# Home Dashboard review

This records the implementation across Sprints 1–5 on
`feature/home-dashboard-v2`. Changes remain unstaged. Automated checks use the
repository's Lua 5.1 client stubs and synthetic provider fixtures; they are not
a live WoW playtest.

Validation on this checkout: **656 tests passed across 27 focused test files**;
`git diff --check` passed and the changelog checker accepted all 88 fragments.
The focused run covered the five Home suites, text-fit/geometry, Theme, gamepad
and native gamepad restrictions, rail/Picker/Options/Lookup/guide-window UI,
Talents, dungeon runtime/journal, Engine routes/training, Gear and QoL/Rares.
It did not run the repository's unrelated full suite or a live gameplay session.

## Feature inventory

Home is the general hub landing page. Its character header, dominant active-guide
card, six optional cards, open guide tabs and existing guide recommendations share
the Theme/Widgets composition. Continue/Choose a Guide stays first. A selected
card opens one Home-owned inspector; closing details restores workspace width.
The inspector is beside the workspace when space permits and inline when narrow
or short. Its body, tabs and primary action have separate scroll regions.

Home, Guides, Lookup, Dungeons, Talents, Rares and Import retain the compact rail;
Options remains available through its existing action. Explicit destinations,
staged searches, guide selection/new tabs and the compact in-game guide window
retain their existing interfaces. Inspecting a card never loads a guide, chooses
a talent plan, buys training, equips an item or moves the navigation target.

| Card | Functional coverage | Inspector tabs, when supported | Explicit actions |
|---|---|---|---|
| Continue Leveling | Actual guide category/title, character context, Engine completed/applicable counts, live step/current objective, known continuation | Overview, Quests, Route, Rewards | Continue Guide; no-active-guide Browse alternative |
| Leveling Build | Current planned build/class/spec, next planned pick, granted or labelled estimated points, validity/off-plan/disabled state | Overview, Picks, Notes, Source | View Talents at the plan's tab; no allocation/respec |
| Dungeons for Your Level | Small set of shared journal level/faction matches, ranges, known quest counts | Overview, Quests, Rewards, Map | Inspect another match, Open Dungeon, Show on Map when supported, Navigate to entrance |
| Up Next | Engine continuation or explicitly optional existing recommendation, range and authored transition facts | Overview, Quests, Route, Rewards | View guide in Guides; existing guide loading/new-tab controls remain available |
| Class Training | Existing reminder/guide-training lookahead, real visit context and current class-trainer services, ranks, status, costs | Overview, Services, Trainer | Find trainer through Nearby; trainer Lookup |
| Gear Opportunities | Known live-step quest rewards, open completion choices and equipped items; current Gear comparisons, requirements and sources | Overview, Item, Comparison, Source, Equipment | Inspect another contextual item/equipped slot; item Lookup |
| Rares Nearby | Recent current-map detections or historical sightings; level/kind/source and supplied locations | Overview, Location | Inspect another encounter, Show rare, explicit sighting/spawn waypoint |

Unsupported tabs are omitted. Entity identities come from providers. Switching
contexts replaces pooled content while remembering each entity's tab and scroll
for the session. Removed/stale entities get an honest unavailable context and
lose entity-specific actions. Primary and row actions revalidate current data
at execution. Selection marks and a theme-selected wash connect cards to details.

## Customization and persistence

Customize Home opens a pooled inline editor below Continue. Six visibility
switches and move-up/move-down buttons save immediately; ordering includes hidden
cards. Restore defaults clears only `home.layout`. Continue and the guide lists
cannot be hidden by those settings. Hiding a selected optional card dismisses its
inspector; moving a card retains its identity and frame. Tab/Shift-Tab, Enter and
gamepad navigation operate the editor; Escape/B and Done return focus to Customize.

The scope is **account-wide**, matching ordinary UI settings:
`PolestarDB.settings.home.layout = { order = { cardKey, ... }, hidden = { [cardKey] = true } }`.
There are no character overrides; progress, talent/gear data and sightings retain
their owning modules' existing scope. Preferences use RegisterDefaults/Get/Set,
never mutate returned settings tables, ignore unknown/duplicate keys, and append
missing/new cards in default order. All six optional cards are visible by default.

## Architectural interfaces

- `UI.HomeSection` owns snapshots, visible-event coalescing, layout, selection and
  explicit action dispatch. `SelectContext(kind, id)` selects; `ActivateContext`
  revalidates; `RevealControl` uses Picker's existing gamepad `onFocus` hook to
  coordinate nested scrolling. `ToggleCustomization` controls the inline editor.
- `UI.HomeContent.Resolve(selection, snapshot)` produces a plain context with
  stable key, title, optional metadata/icon, tabs/rows and explicit actions.
  `UI.HomeOpportunities.Read(snapshot, wanted)` and `Resolve` adapt the last three
  cards without owning gameplay state.
- `UI.HomeInspector.Build` creates one pooled shell. SetContext, Layout, SelectTab,
  Controls and Reveal own presentation, session memory and focus visibility.
  Reveal returns a control offset after scrolling its inner viewport.
- `UI.HomeCustomize.Cards`, Read and Build provide the shared six-card catalogue,
  normalized preferences and pooled editor. The catalogue drives visual and
  keyboard order; it adds no skin engine or drag-and-drop framework.
- Engine GetGuide/GetProgress/GetLiveStep/GetStepView/NextGuide/RouteOffered and
  Guides metadata/Suggestions remain the guide authorities. `Engine.TrainingStatus`
  exposes existing reminder policy without firing reminders or writing progress.
- `QoL.Trainer.Services` is a read-only current class-trainer-window query.
  `Gear.CurrentRewards` exposes the open completion dialogue's offered choices.
  Existing ItemDB and Gear ranking/comparison helpers provide item facts and scores;
  `UI.GearStatName` reuses existing localized stat labels.
- Dungeons ForPlayer/MatchesLevel/QuestCount/QuestState narrowly share the existing
  journal policy. Detailed quests are queried only for the selected dungeon.
- `Rares.NearbyRecords` returns copied records from the existing recent-detection
  tracker; Nearby's name-list interface remains. History and Info provide bounded
  historical/selected-record context without a full rare-catalogue scan.

Hidden Home performs no dashboard provider reads. Hidden optional cards skip their
targeted providers. Dismissed details defer content resolution. Reordering,
customizer visibility, tab changes, resizing and skin changes reuse snapshots;
showing omitted data or relevant game state obtains a new snapshot. Frames and
row controls are pooled. Existing recommendation order/capping is preserved, and
the recommendation adapter reuses the character level already in the snapshot.

## Six-skin findings

Polestar, Halo, Hearth, Forever, Blizzard and Classic use their existing fonts,
button metrics, textures and Theme/Widgets painting. The four/two/one-column grid
keeps Build and Dungeons substantial; optional card actions share the row's bottom
inset. Missing custom card/inspector artwork falls back to the native question-mark
icon. Existing sidebar restoration through other pages and Options remains covered.

The renderer audits both game-font and Inter metrics with 15% width slack, long
names/actions/translations, narrow and short windows, customization, inspector
tabs/actions, and live skin switches. The short-window review found and corrected
the nearly zero-height side-inspector body: details now become inline below 300
pixels of content height. Nested keyboard/gamepad focus reveals both scroll layers.
Dungeon map actions use the current map-opening capability query and retain the
existing guarded map entry point for native gamepad/combat restrictions.

These checks establish geometry under the stub renderer. Native client atlas
appearance, exact font rasterization, hover/event ordering, combat taint, hardware
gamepad behavior and real gameplay data still require a live WoW Forever client.

## Data limitations and recommended work

- Levels.ForGuide simulates whole-guide quest/kill work, not dependable live
  remaining work. Home omits XP/remaining-work estimates.
- Training reminders and visits do not prove unlearned abilities. Services are
  known only while the correct trainer is open; a verified class spell/rank and
  requirement catalogue is needed for richer upcoming milestones.
- Dungeon bands include the journal's two-level preview. Matches are not entry
  eligibility or optimal-run advice; known quest counts are not available counts.
  Home is independent of the unmerged dungeon-advice work examined in Sprint 3.
- Gear coverage is contextual: up to eight live-step quests, 32 candidates and
  17 scored equipped slots. Only open completion choices are labelled available;
  weighted gains remain potential upgrades and honor Gear's upgrade threshold.
  A broader reward feed with acquisition/quest eligibility is needed for richer
  recommendations. ItemDB can load on the first item read; existing paired-weapon
  comparisons can use the Gear module's bag cache.
- Known rare spawns and past/recent sightings do not confirm life. No history-free
  full-zone rare recommendation scan is added. A cheap zone-to-rare index and
  stronger current-presence signals would support broader encounters.

Before a potential PR: playtest all six skins with real data, saved preferences,
reloads, short/narrow windows, keyboard and both gamepad UI modes; inspect actual
textures, clipping, focus/scroll behavior and taint/error logs. Verify real guide
pins/tabs/navigation, trainer closure, reward dialogue closure and rare expiry.
The maintainer should sync new English locale strings. Check overlapping open work
again, target `next`, and complete the repository's AI-agent declaration if a PR
is later authorized. No PR or remote write was performed here.

## Changed files across the five sprints

The existing working tree already contained Sprints 1–4. This inventory includes
those changes and Sprint 5; generated assets, guides and locale files are untouched.

| Area | Files |
|---|---|
| Core/providers | `addon/Polestar/Core/Commands.lua`, `addon/Polestar/Core/Engine.lua`, `addon/Polestar/Dungeons/Dungeons.lua`, `addon/Polestar/Gear/Picks.lua`, `addon/Polestar/QoL/Trainer.lua`, `addon/Polestar/Rares/Rares.lua` |
| Theme/shell | `addon/Polestar/Theme/Widgets.lua` |
| Home | `addon/Polestar/UI/Home.lua`, `HomeContent.lua`, `HomeCustomize.lua`, `HomeInspector.lua`, `HomeOpportunities.lua` (all under `addon/Polestar/UI/`) |
| UI integration | `addon/Polestar/UI/Dungeons.lua`, `Gamepad.lua`, `GearScales.lua`, `Picker.lua`, `UI.lua`, `UI.xml` (all under `addon/Polestar/UI/`) |
| Home checks | `tests/ui-home.test.js`, `tests/ui-home-inspector.test.js`, `tests/ui-home-leveling.test.js`, `tests/ui-home-opportunities.test.js`, `tests/ui-home-customize.test.js` |
| Shared UI checks | `tests/gamepad.test.js`, `tests/text-fit.test.js`, `tests/theme.test.js`, `tests/ui-picker-levels.test.js`, `tests/ui-picker-packs.test.js`, `tests/ui-picker.test.js`, `tests/ui-rail.test.js`, `tests/ui.test.js` |
| Documentation | `docs/HOME_INSPECTOR.md`, `docs/HOME_DASHBOARD_REVIEW.md`, `changes/home-guide-overview.md` |

Sprint 5 specifically adds HomeCustomize and its tests; refines Home, HomeContent,
HomeInspector, HomeOpportunities and Picker; extends Home/leveling/text-fit checks;
and updates the two Home documents and existing changelog fragment.
