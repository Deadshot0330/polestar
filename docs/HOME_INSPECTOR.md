# Home contextual inspector

Home owns one inspector. Dashboard cards and guide suggestion buttons select
`{ kind, id }` records through `UI.HomeSection.SelectContext`; they never pass
frames as entity identities. Selection, active tabs and scroll positions live
only for the session. Selecting a card does not load a guide or move the arrow.
The workspace starts at full width. Selecting a card opens details; dismissal
returns that space and retains the session selection for Show details.

`UI/HomeCustomize.lua` owns the six optional card definitions, normalization of
`home.layout = { order = { cardKey, ... }, hidden = { [cardKey] = true } }`, and
the pooled inline editor. This uses the ordinary account-wide `PolestarDB.settings`
store through `RegisterDefaults`, `Get` and `Set`; there are no per-character
layout overrides. The UI states its scope. Continue/Choose a Guide stays first
and cannot be hidden or reordered. Visibility switches and move-up/down buttons
save immediately. Restore defaults clears only `home.layout`. Unknown/duplicate
keys are ignored on read, missing/new cards get their default positions, and
saved/default tables are never changed in place. Hidden cards leave navigation
and their owning features available. Hiding the selected card dismisses its
inspector; reordering retains its entity identity and frame.

The same catalogue drives layout and keyboard traversal. Build and Dungeons
span two cells on the four-column grid; other cards use one. Smaller workspaces
use two or one columns in saved order. Row actions share a bottom inset and
cards retain the shared Theme/Widgets ground, typography, selection and hover
primitives. The customizer sits below Continue in the workspace, with its own
bounded list and separate Reset/Done actions; Tab/Shift-Tab, Enter and gamepad
navigation operate its existing buttons. Escape/B return focus to Customize.

`UI/HomeContent.lua` adapts the card contexts: `continue`, `upcoming`, `build`,
`dungeon`, `training`, `gear`, `rares`, plus `guide` for individual suggestions.
Its `Resolve(selection, snapshot)` returns a plain table:

```lua
{
    key = "guide:<provider guide ID>",
    title = "...", meta = "...", icon = "guides", -- meta/icon optional
    tabs = { { key = "overview", label = L["Overview"], rows = {
        "...",
        { action = { key = "provider-action", label = L["Show on Map"], run = function(source) ... end } },
    } } },
    action = { label = L["View guide"], run = function() ... end }, -- optional
    empty = true, -- optional; unavailable entity, no stale action
}
```

IDs come from the authoritative provider. Gear identifies a reward by quest
and item ID, or an equipped item by slot and full item link (preserving suffixes).
Rares uses the provider's `rare:<id>` or name-only key. With no entity available,
`equipment` and `nearby` identify the honest section-level fallback contexts.
Adapters supply only available facts, omit unsupported tabs/actions, and do
not maintain progression, allocation, routing or scoring state.

Continue reads the active guide, completed/applicable counts and live step from
`Engine.GetGuide`, `GetProgress`, `GetLiveStep` and `GetStepView`. It uses the
existing goal text, detail, count/bar-label and reward presentation helpers.
When a pinned browse step leaves the live view without a current-goal pointer,
the live step title is the summary; Home does not guess an objective or move the
pin. Labels follow the actual guide category. Inspector quests include available
live step context and authored quests filtered by character restrictions. Route
facts distinguish the Engine waypoint from the actual Nav target. Rewards are
known live goal rewards and authored guide metadata, not a future quest total.

Up Next prefers `Engine.NextGuide`, which already resolves remembered branches
and the route-choice preference. With no resolved continuation, existing
`Guides.Suggestions` and eligible open-tab follow-ups remain optional suggestions.
The recommendation list itself keeps its existing ordering, cap and actions.
Upcoming guide facts use the same guide adapter, with distinct `upcoming` identity
and confirmed/optional transition labels. Viewing opens Guides; it does not load
the guide or choose a route.

Leveling Build reads `Talents.Current`, or the selected planned build when live
progress is unavailable. Picks use `Talents.PickText`; state/validity supplies the
next planned pick, off-plan, stale, disabled and progress information. Currency
from the game determines granted points. The Talents module's fallback is labelled
as an estimate; Home adds no level-based talent schedule. View Talents opens the
plan's existing tab without selecting a different plan or allocating points.

Dungeons shares the journal's filtering and known quest count policy through
`Dungeons.ForPlayer`, `MatchesLevel`, `QuestCount` and `QuestState`. The catalog
preview includes two levels below its minimum band, excludes raids and respects
the journal's faction policy. These matches are not entry eligibility or a ranking;
known quest counts are not currently available quest counts. Only the selected
dungeon's quest page is queried for its inspector. Quests, recorded rewards and
entrances come from existing dungeon records. Other candidate buttons select
another dungeon in the inspector; Open Dungeon, Show on Map and Navigate to
entrance use the existing detail/map/navigation entry points. Home does not use
the pickup planner or depend on the unmerged dungeon-advice work in PR #640.

`UI/HomeOpportunities.lua` adapts Class Training, Gear Opportunities and Rares
Nearby to the same snapshot and inspector contract. Selection is read-only;
navigation, Lookup and section opening remain explicit actions.

Class Training reads `Engine.TrainingStatus()`, a narrow read-only view of the
existing reminder policy and four-applicable-step class-training lookahead.
`baseline` may be first-install initialization; only `lastVisit` means an actual
trainer visit. The query neither writes those fields nor fires a reminder.
`QoL.Trainer.Services()` reads names, ranks, availability status and costs from
the currently open trainer of this character's class, even with auto-training off.
It returns nil after closing or at another class/profession trainer. It never
buys services or retains a catalogue. Home labels these as listed services and
shows insufficient money where known. The inspector defers trainer ranking to
`Engine.NearestClassTrainer`, displays that registered location and uses
`Nav.nearby.Go("class")` or the trainer's existing Lookup entry point explicitly.
No comprehensive spell-rank, requirement or upcoming ability-milestone provider
exists here; a reminder or a visit cannot establish spells learned or available.

Gear Opportunities reads `ItemDB.Quest` only for the current live step's relevant
quests (up to eight), plus `Gear.CurrentRewards()` for choices offered by a
currently open completion dialogue. That new read-only query is scoped by
QUEST_COMPLETE/QUEST_FINISHED and does not request rewards or select a quest-log
entry. Home reuses `Gear.RankChoices`, `CompareToEquipped`, `GetItemInfo`,
`TooltipLine`, `GetSpec` and the existing stat labels. There is no new scoring
algorithm. Reward reads are bounded; at most 32 contextual candidates and the
fixed 17 scored equipment slots are retained. The selected item's inspector
shows stats, requirements, weighted comparisons, quest state, and known source
records (`ItemDB.Sources`, up to eight) for equipped items. Equipment browsing
and item Lookup use actual item IDs. Full links keep random-suffix comparisons
intact. Weighted gains are potential upgrades. Only an open completion choice
is called an available reward; database presence or quest-log membership is not
proof of acquisition eligibility. Missing reward data remains a coverage warning
even when equipment can be shown. No all-quest-log, bag-upgrade or global item
recommendation feed is claimed. The existing comparison provider may read its
cached bag context for paired weapons; the first item read can load ItemDB.

Rares Nearby reads `Rares.NearbyRecords()`, a narrow copied-record view over the
same detection/expiry logic as the retained `Rares.Nearby()` name list. Records
carry stable keys, creature IDs when known, source and observed location. Unit
sightings retain the player's location at detection, labelled "Last seen near";
an explicitly positioned vignette is labelled "Detected location". The expiry
notification now follows remaining sighting lifetime rather than extending it
by a full interval on a late query. Home shows up to three current-map recent
detections. With none, it can show same-map past sightings from the existing
realm history (bounded at 400); these are labelled "Previously seen here".
Ignored records and disabled detection are respected. `Rares.Info` reads only
the selected creature from an already loaded Codex. Known current-map spawns
are separate from sightings and never prove life. The inspector offers explicit
waypoints to supplied locations and opens `Rares.Show` for the selected ID;
name-only detections get no invented creature ID. Home never loads or enumerates
the entire rare Codex for this card. With no detection/history it directs the
player to the existing Rares catalogue rather than claiming there are no rares.

`UI/HomeInspector.lua` owns the pooled shell, tab buttons and paragraphs. Tab
changes render only that shell and remember body scroll by context and tab.
Provider refreshes retain available tabs and clamp scroll to the new content.
Unavailable entities show an empty Overview and lose their primary action.
Primary and row actions are revalidated against a fresh snapshot at execution
time. Row buttons share the shell's pooling, keyboard/gamepad traversal, and
scroll-to-focus behavior.

Relevant addon/game events mark the snapshot dirty and coalesce into one refresh
while Home is visible. Hidden Home does no catalog, succession, inspector-page
or XP work. Tab changes and resizing use the snapshot without querying providers.
The first visible dungeon read can load the Codex catalog through its existing
loader. A selected guide inspector scans authored steps on data refresh; selected
dungeon pages reuse the Dungeons module's one-page cache. No separate cache of
gameplay state is introduced.
Hidden optional cards skip their targeted provider reads. Reordering and opening
the customizer reuse the data snapshot; showing a card whose data was omitted
obtains a fresh snapshot. A dismissed inspector defers resolution until reopened.
Skin changes remeasure the shell without rereading gameplay providers. The Home
recommendation adapter reuses its snapshot's character level instead of querying
the same player context a second time.

`Levels.ForGuide` was evaluated and deliberately omitted: it simulates full-guide
quest and per-kill work, can load Codex, and does not reliably account for already
earned live kill XP as remaining work. Repeating that simulation for Home would
add cost without a dependable remaining-XP estimate. Ability milestones, aggregate
future rewards, optimized routes, travel times and guaranteed quest availability
are omitted where the current providers do not establish them.

The inspector stays beside the workspace at sufficient width and height, using
30% of the available width bounded at 240–340 pixels. It moves into the workspace
scroll on narrow or short windows (below 300 pixels of content height), where it
has a usable minimum height. Tabs and long actions have bounded
scroll regions so translations cannot overlap the body. Keyboard Tab reaches
tabs/actions; Escape dismisses. Gamepad B dismisses when focus is inside the
inspector. Dismissal returns focus to the matching source when it still exists.
`HomeInspector.Reveal` and the customizer's Reveal return a control's offset after
scrolling their inner viewport. `HomeSection.RevealControl` uses Picker's existing
gamepad `onFocus` callback to reveal the same control in the outer workspace too.
This keeps the fixed inspector action reachable in short windows. Card and
inspector icons fall back to the native question-mark icon when custom artwork
fails. Dungeon map actions use `Compat.CanOpenWorldMap`, respecting combat and
the native gamepad interface's existing restrictions.
