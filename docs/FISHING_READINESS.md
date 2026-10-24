# Fishing 1-300: first local improvement

Evidence reviewed October 23, 2026 (America/New_York). This is a local,
limited contribution, not an in-game verification of the complete guide.

## Revision and supported tools

- Clean starting checkout: `fix/fishing-guide-forever`,
  `0d7588c8551c0fb8eb7cff2a732a03822e19ee61`. GitHub's comparison with
  upstream `next` returned identical. The existing task branch was retained.
- Remotes: `origin` is Deadshot0330/polestar; `upstream` is
  fitzforge/polestar. Eventual implementation base and PR target: `next`.
- Node v24.22.1 and LuaJIT (Lua 5.1) are available. GitHub CLI is absent;
  the connected GitHub tools supplied read-only issue/PR inspection.
- [#671](https://github.com/fitzforge/polestar/pull/671) remains open and
  unmerged. The [maintainer's acceptance](https://github.com/fitzforge/polestar/pull/671#issuecomment-6378295902)
  is not a merge or release. It explicitly requires the Forge port before
  shipped guides use `when knows`.
- [#715](https://github.com/fitzforge/polestar/pull/715) is an open draft,
  titled a preview not for merge. Its `forge` head was
  `bf00b3d5242bff80267014bcf0309b6ba3f7a315`. The preview's
  [Forge documentation](https://github.com/fitzforge/polestar/blob/bf00b3d5242bff80267014bcf0309b6ba3f7a315/docs/FORGE.md)
  describes the future pipeline, correction layout and release installation;
  this is not proof that a compatible release is available. Release
  availability for `when knows` was not established. The current Node
  predicate parser also lacks it. This contribution uses existing `skill`,
  profession `train`, `level`, and `when onquest` contracts, and makes no
  Forge changes.

## Coordination

Open Fishing work and searches for 719, 579, 681 and 6607 were checked before
editing. No other open PR covered this casting-instruction/breadcrumb slice.

- [#719](https://github.com/fitzforge/polestar/pull/719), closing #718,
  anchors the Undead Silverpine waypoint on Fenwick Thatros. Its waypoint
  correction remains owned by that PR. No spot definitions or coordinates
  changed here; the shared skill-goal wording will need normal integration.
- [#579](https://github.com/fitzforge/polestar/pull/579), closing #568,
  fixes Teldrassil-to-Darnassus travel in the planner. The maintainer has it
  on hold pending the walking-map/pathing replacement. No travel workaround
  or duplicate planner fix was added here.
- [#681](https://github.com/fitzforge/polestar/issues/681) is the profession
  roadmap, including adaptive Fishing. This slice does not implement its
  location selection or persistent activity/planner proposals.

## Inputs and provenance

`data/forever/meta.json` records a build on 2026-10-21, including:

- pfQuest `104f35678ca39ab1fb78b655f815cc7016f5e0c8`;
- QuestieDB Forever 1.0.6, `36ca1ca86f6c1838de479c7c7452eb0a57d5c135`;
- Forever client `1.60.1.70450` and Era `1.15.9.70003` map/client tables.

Quest, NPC, item, object, race and map-frame files were already present.
`professions.json` was missing. The offline build failed because cached
`SkillLine.csv` was missing. After fetching the missing client tables,
`profession build --build 1.60.1.70450` succeeded, with Era 1.15.9.70003
gap fills. Before edits, gathering check reported all six guides current,
and all seven gathering tests passed. The reference files and downloads
remain ignored development inputs.

The guide's existing provenance note applies: inherited spawn observations
are not verified Forever casting locations. Era coordinates use `f: e`;
Forever observations use `f: l`. The projector converts through world space.
No coordinate, rank default, race group or reference correction changed.
The Fishing entry in the shared trainer registry now includes two neutral
Zephras trainers, using their existing names, IDs and live spawns from
Questie-Forever: Fenn Fairweather (251992) and Baelann Swiftcurrent (257008).
THIRD_PARTY.md and corrections.json require independent, attributable
evidence for new facts. The trainer identities, roles, factions and spawns
are independently supported by the local Forever data. The references for
[Baelann](https://www.wow-professions.com/forever/npc/baelann-swiftcurrent) and
[Fenn](https://www.wow-professions.com/forever/npc/fenn-fairweather) report
Apprentice/Journeyman offerings; current server offerings still need an
in-game check.

No editorial prose or routes were copied. Public Forever entity pages
were inaccessible behind a JavaScript challenge during this review.

## Findings and scope

| Candidate | Evidence and disposition |
|---|---|
| Apprentice eligibility | Fishing is classified as secondary in extract.js; trainers.js applies the level-one override only to gathering. Both the shared default and the guide currently say level 5. Client rank spell extraction does not prove server trainer eligibility. Editorial sources suggest level one, but an independent Forever trainer/server observation is still needed. Retained current values. |
| Local trainers | The Fishing registry now includes Baelann Swiftcurrent and Fenn Fairweather for both factions and both trainer-taught ranks. Questie-Forever identifies them as neutral Fishing trainers on Zephras Isle; the existing pole-vendor data also includes both. Their exact server offerings remain an in-game check. Androl Oakhand 3607, Lau'Tiki 5941 and Uthan Stillwater 5938 remain separate candidates for later verification. |
| Skyborne | races.json supports Skyborne on both factions. Both can now select the two neutral Zephras trainers through existing profession training goals. This is trainer access only: RACE_GROUPS and REGIONS still omit Skyborne, so ordinary race-filtered Fishing bands and their beginner instructions do not cover them. No fishing route or water location was added. The earlier audit missed these two named NPC entries; the follow-up search corrected that evidence gap. |
| Riverglades | Krix (260558) is marked Alliance in the local Questie-Forever data, conflicting with the supplied neutral listing. Krix was not added. |
| Casting instructions | The first fishing activity explains equipping the pole, putting the Fishing action on an action bar, casting, the bobber, looting and an optional lure directly on the tracked skill goal. Later activities use the short instruction "Fish until skill N", where N is the actual target (125, 225 or 300). It avoids assuming a spellbook or Professions tab location. The same skill/event tracking remains responsible for completion. Finding the action in the current client and the instructions' usability still need an in-game check. |
| Ordinary progression travel | Existing code states skill gains depend on successful catches, not a new zone at each threshold; it nevertheless selects fixed race/region bands. Bands and coordinates remain unchanged to avoid mixing unverified water changes and #719's correction into this slice. No automatic nearest-water logic was added. |
| Expert book | The original "Buy and read" instruction is retained. The existing `train Fishing Expert` goal completes from learned cap 225, rather than possession of item 16083 or opening a vendor. No separate buy goal is added. Regression coverage protects the existing unread-book, vendor-visit and already-learned-cap behavior. No `when knows` dependency. |
| Artisan fish | Quest 6607 names all four fish and their required areas. The current generator derives three locations from shore-NPC clusters and gives Feralas Ahi 16967 no explicit coordinate. Neither those cluster centroids nor a generic river point proves a castable spot or the right subzone. All four require recorded casting evidence; no waypoint was invented here. |
| Introduction quests | Questie-Forever-derived fields mark 6608/6609 `breadcrumbFor: 6607`; quest 6607 lists them as breadcrumbs. resolve.js already removes them from blocking prerequisites. The capital detour is removed. Conditional `when onquest` turn-ins preserve a breadcrumb already carried; the separate Nat accept retains blocking skill 225/level 35 goals so eligibility cannot be permanently skipped. |

## Validation and next work

The implementation is the Fishing generator plus its regenerated guide,
the Fishing trainer registry entry, focused compiler/Engine and trainer
resolution tests, and a player changelog fragment. All six
gathering outputs were rebuilt; only Fishing differs from upstream. The
trainer follow-up changes no guide source text because profession training
goals resolve candidates from professions.json. Rebuilding that file offline
changed only profession 356 (Fishing), with no warnings; all six gathering
sources stayed identical to the earlier Fishing commit. Maintainer
regeneration must rebuild professions.json before compiling the guides to
include the new candidates. Compiled Guides.lua and translations are left
for that normal regeneration.

The new regression tests were run against the original generator first:
three failed, while the existing Expert-cap behavior passed. The changed
generator passes all four. They simulate skill/quest state and waypoint
arrival, not real casts or server quest offers.

The activity test also checks a later band: after waypoint arrival it shows
"Fish until skill 125.", retains live progress, and waits until skill 125.

Two additional trainer regressions failed before the registry addition and
pass afterward: a data-independent resolver test covers both factions and
rank boundaries; a compiler/Engine test exercises eight combinations (two
trainers, two early ranks, two Skyborne factions), preserving live frames,
choosing the local trainer and completing from the learned cap. These are
trainer-state simulations, not full Skyborne guide playthroughs.

Results:

- **Passed:** `node --test tests/profession.test.js tests/profession-fishing.test.js
  tests/profession-gathering.test.js tests/dsl-smart.test.js
  tests/engine-smart.test.js tests/nameguard.test.js`: 70 passed, no failures
  or skips, including the four source naming-policy checks.
- **Passed:** `profession gathering check`: all six files current.
  Each generated file was compared with HEAD; the other five are unchanged.
- **Passed:** `lint`: 0 errors, 307 warnings, no Fishing source diagnostics.
  The baseline had 280 warnings; the 27 added warnings are stale locale text
  for the edited guide strings. Restoring the original Expert instruction
  removed nine stale translations. Synchronization is maintainer work.
- **Passed:** `playtest --filter forever/professions/fishing`: 8 plays,
  0 stuck, 0 failed. These cover the eight original races, not Skyborne.
- **Passed:** `changelog check`: 99 fragments valid; `git diff --check`.
- **Failed outside this slice:** `node --test tests/guides-reported.test.js`:
  135 passed, 1 failed, 3 skipped. The failure is the unchanged Dun Morogh
  Kharanos test's assertion that the bind leads to the innkeeper
  (`tests/guides-reported.test.js:494`). Restoring the original Fishing
  guide temporarily and running `--test-name-pattern=thmastin` reproduced
  the same failure (11 passed, 1 failed). The edited guide was restored
  afterward and its generated match verified.
- **Skipped by that suite:** Scrawny Ursera needs the private corrections
  overlay; deck/pier placement needs `data/forever/travel.json`; #246
  needs the Forever entity-list cache. Those inputs were not fabricated.
- **Not run locally:** in-game checks, the full repository suite, Forge compilation
  or a Forge port. Supported Node compilation is exercised by gathering
  tests and lint. No compiled addon output was written into the checkout.

CI for commit 8173ba99 passed the full repository tests, translation checks,
changelog validation, texture generation and previews on a clean runner.
That runner lacks the local reference data, so data-dependent tests may
skip; it does not invalidate the separate local-data failure recorded above.

Recommended next slice: collect Forever recordings of the four Artisan
quest fish, especially Verdantis River/Feralas Ahi, then replace approximate
or missing destinations with evidenced map/frame positions. In parallel
with that evidence collection, check Apprentice availability below level 5,
the three local trainers' offered ranks, both Skyborne starts, and ordinary
skill gains in easy water. Those observations can support a later change
that lets ordinary progression stay in convenient water without a new planner.

In-game checks still required: Baelann and Fenn's current Apprentice and
Journeyman offerings and access for both factions; the beginner action text
and lure interaction; Expert book learning; Nat's direct quest offer at level 35/Fishing 225 with
neither introduction completed, carried introductions on both factions,
and all actual casting locations. No addon installation, publishing, push,
PR or comments were performed.
