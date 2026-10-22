'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runAddon } = require('./helpers/lua');
const { writeCodexPack } = require('./helpers/codex');
const { buildJournal, emitJournal } = require('../tools/lib/codex/journal');
const { TEST_PACK } = require('./helpers/packs');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/codex/dungeons.json'), 'utf8'));
let pack;
before(() => { pack = writeCodexPack(fixture.codex, { extraFiles: emitJournal(buildJournal(fixture.inputs, fixture.codex)) }); });
after(() => pack && pack.cleanup());

function run(script, { dungeons = false, talents = false } = {}) {
	const files = ['Core/Core.xml', 'Theme/Theme.xml'];
	if (dungeons) files.push('Gear/Gear.xml', 'Lookup/Lookup.xml', 'Dungeons/Dungeons.xml');
	files.push('UI/UI.xml');
	if (talents) files.push('Talents/Talents.xml');
	return runAddon({
		stubs: talents ? ['stub_ui.lua', 'stub_talents.lua'] : ['stub_ui.lua'],
		before: dungeons ? pack.stubLua : '',
		addons: [{ name: 'Polestar', files }],
		script: `local nativeCanOpenWorldMap = Polestar.Compat.CanOpenWorldMap
		uistub.install()\nstub.login()
		local UI, P, H, E = Polestar.UI, Polestar.UI.Picker, Polestar.UI.HomeSection, Polestar.Engine
		local function plain(s) return (s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "") end
		local function tab(key)
			for _, t in ipairs(H.Inspector.Context.tabs) do if t.key == key then return t end end
		end
		local function rowButton(key)
			for _, b in pairs(H.Inspector.rowButtons) do if b:IsVisible() and b.psActionKey == key then return b end end
		end
		${script}`,
	}).emitted;
}

test('Continue shows authoritative live work and Engine progress, while inspecting a profession preserves its pinned step and target', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 4)
		Polestar.Compat.GetZoneText = function() return "Northshire" end
		Polestar.Nav.SetTarget(1429, 40, 50, "Manual target")
		UI.ShowPicker()
		local r = { objective = plain(H.Hero.Objective:GetText()), step = H.Hero.Step:GetText(),
			meta = H.Hero.GuideMeta:GetText(), progress = H.Hero.Progress:GetText() }
		-- A pinned browse step has no authoritative current goal for the live
		-- step. Home can still show its title without changing that pin.
		uistub.setGuide(uistub.elwynn, 3)
		uistub.live = 4
		Polestar.Fire("STEP_UPDATED"); stub.advance(0.01)
		r.pinnedSummary, r.pinnedIndex = H.Hero.Step:GetText(), E.GetStepIndex()
		uistub.live = nil
		uistub.setGuide(uistub.tailoring, 2)
		stub.advance(0.01)
		local done, total = E.GetProgress()
		r.heading, r.craft = H.Hero.Heading:GetText(), plain(H.Hero.Objective:GetText())
		r.detail, r.expected = H.Hero.Detail:GetText(), string.format("%d of %d steps complete", done, total)
		H.Hero.Details:Click()
		r.section, r.stepIndex, r.target, r.actual = P.Section(), E.GetStepIndex(), Polestar.Nav.GetTarget().label, H.Hero.Progress:GetText()
		emit(r)`);
	assert.match(out.objective, /Turn in Kobold Camp Cleanup/);
	assert.equal(out.step, 'Back to the Abbey');
	assert.equal(out.pinnedSummary, 'Back to the Abbey');
	assert.equal(out.pinnedIndex, 3);
	assert.match(out.meta, /Leveling.*Level 4.*Northshire/);
	assert.equal(out.progress, '3 of 7 steps complete');
	assert.match(out.heading, /Continue.*Professions/);
	assert.match(out.craft, /Craft Bolt of Linen Cloth.*38\/50/);
	assert.match(out.detail, /2 Linen Cloth each/);
	assert.equal(out.actual, out.expected);
	assert.equal(out.section, 'Home');
	assert.equal(out.stepIndex, 2);
	assert.equal(out.target, 'Manual target');
});

test('Continue inspector displays known live rewards and distinct guide/manual waypoints without querying XP estimates', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 4)
		uistub.goal(4, 1).rewards = { xp = 120, money = 80 }
		Polestar.Levels.ForGuide = function() error("Home must not simulate full-guide XP") end
		Polestar.Nav.SetTarget(1429, 40, 50, "Manual target")
		UI.ShowPicker()
		H.Hero.Inspect:Click()
		emit({ rewards = tab("rewards").rows, route = tab("route").rows, quests = tab("quests").rows,
			target = Polestar.Nav.GetTarget().label, step = E.GetStepIndex(), calls = uistub.calls })`);
	assert.ok(out.rewards.some((r) => r.includes('120 XP')));
	assert.ok(out.route.some((r) => r.includes('Guide waypoint:')));
	assert.ok(out.route.some((r) => r.includes('Navigation target: Manual target') && r.includes('40.0, 50.0')));
	assert.ok(out.quests.includes('Current step quests'));
	assert.equal(out.target, 'Manual target');
	assert.equal(out.step, 4);
	assert.ok(!out.calls.some((c) => ['SetGuide', 'OpenTab', 'SelectTab'].includes(c[0])));
});

test('Up Next prioritizes Engine continuation over unrelated recommendations and labels optional choices honestly', () => {
	const [confirmed, optional, unrelated] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		uistub.suggestions = { uistub.tailoring }
		local g = uistub.guides[uistub.elwynn]
		E.NextGuide = function() return g.next end
		E.RouteOffered = function(from, to) return from == g.id and (to == g.next or to == uistub.tailoring) end
		UI.ShowPicker()
		H.Dashboard[4].Inspect:Click()
		emit({ title = H.Dashboard[4].Summary:GetText(), meta = H.Dashboard[4].Meta:GetText(),
			selection = H.SelectedContext(), overview = tab("overview").rows, next = H.Hero.Next:GetText(), guide = E.GetGuide().id })
		g.nextChoices = { g.next, uistub.tailoring }
		E.NextGuide = function() return nil end
		Polestar.Fire("ROUTE_CHOSEN")
		stub.advance(0.01)
		emit({ title = H.Dashboard[4].Summary:GetText(), meta = H.Dashboard[4].Meta:GetText() })
		E.RouteOffered = function() return false end
		Polestar.Fire("STEP_UPDATED")
		stub.advance(0.01)
		emit({ meta = H.Dashboard[4].Meta:GetText(), next = H.Hero.Next:GetText() })`);
	assert.equal(confirmed.title, 'Westfall');
	assert.match(confirmed.meta, /^Guide continuation/);
	assert.equal(confirmed.selection.kind, 'upcoming');
	assert.ok(confirmed.overview.includes('Guide continuation'));
	assert.match(confirmed.next, /Westfall/);
	assert.equal(confirmed.guide, 'forever/alliance/human/01-elwynn-forest');
	assert.equal(optional.title, 'Tailoring 1-300');
	assert.match(optional.meta, /^Optional follow-up/);
	assert.match(unrelated.meta, /^Optional suggestion/);
	assert.equal(unrelated.next, '');
});

test('Up Next uses the selected guide interface without changing routes or loading on inspection', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		E.NextGuide = function() return "forever/alliance/02-westfall" end
		UI.ShowPicker()
		uistub.calls = {}
		H.Dashboard[4].Inspect:Click()
		local r = { section = P.Section(), calls = uistub.calls, active = E.GetGuide().id }
		H.Inspector.Action:Click()
		r.destination, r.viewed, r.after = P.Section(), P.Selected(), E.GetGuide().id
		emit(r)`);
	assert.equal(out.section, 'Home');
	assert.deepEqual(out.calls, {});
	assert.equal(out.destination, 'Guides');
	assert.equal(out.viewed, 'forever/alliance/02-westfall');
	assert.equal(out.after, out.active);
});

test('real Engine pending branches stay optional until the saved route selects a continuation', () => {
	const [out] = runAddon({
		stubs: ['stub_world.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		saved: { Polestar: 'PolestarDB = { schema = 1, welcomeSeen = 1, settings = { behavior = { autoSelectGuide = false } } }; PolestarCharDB = { schema = 1, welcomeSeen = 1 }' },
		login: true,
		script: `${TEST_PACK}
		for _, id in ipairs({ "start", "east", "west" }) do
			Polestar.RegisterGuide({ id = "test/" .. id, pack = "test", title = id, minLevel = 1, maxLevel = 60,
				next = id == "start" and "test/east" or nil,
				nextChoices = id == "start" and { "test/east", "test/west" } or nil,
				steps = { { title = "Wait", goals = { { t = "level", level = 60 } } } } })
		end
		local E, UI = Polestar.Engine, Polestar.UI
		Polestar.Set("behavior.suggestFrom", "test")
		E.SetGuide("test/start")
		UI.ShowPicker({ section = "Home" })
		local H = UI.HomeSection
		local r = { asks = E.NextGuide("test/start") == nil, optional = H.Dashboard[4].Meta:GetText() }
		Polestar.CharState().routes = { ["test/start"] = "test/west" }
		Polestar.Fire("ROUTE_CHOSEN", "test/start", "test/west"); stub.advance(0.01)
		r.next, r.meta, r.active = H.Dashboard[4].Summary:GetText(), H.Dashboard[4].Meta:GetText(), E.GetGuide().id
		H.Dashboard[4].Inspect:Click()
		r.selected = H.SelectedContext().id
		emit(r)`,
	}).emitted;
	assert.equal(out.asks, true);
	assert.match(out.optional, /^Optional follow-up/);
	assert.equal(out.next, 'west');
	assert.match(out.meta, /^Guide continuation/);
	assert.equal(out.active, 'test/start');
	assert.equal(out.selected, 'test/west');
});

test('talent card uses granted currency below level 10 and exposes next pick, off-plan and stale states', () => {
	const [out] = run(`
		local T, TS = Polestar.Talents, stub.talents
		uistub.player.class, uistub.player.level = "PALADIN", 4
		TS.level, TS.currency = 4, { quantity = 3, spent = 0 }
		local tree = T.Data("PALADIN")
		TS.useSnapshot(tree)
		T.Refresh()
		UI.ShowPicker()
		H.Dashboard[2].Inspect:Click()
		local current = T.Current()
		local r = { meta = H.Dashboard[2].Meta:GetText(), rows = tab("overview").rows,
			expected = T.PickText(tree, current.state.next, current.valid), action = H.Inspector.Context.action.label }
		current.state.status = "offplan"
		Polestar.Fire("TALENTS_UPDATED"); stub.advance(0.01)
		r.offplan = H.Dashboard[2].Meta:GetText()
		current.valid.ok = false
		Polestar.Fire("TALENTS_UPDATED"); stub.advance(0.01)
		r.stale = H.Dashboard[2].Meta:GetText()
		Polestar.Set("talents.enabled", false)
		stub.advance(0.01)
		r.disabled = H.Dashboard[2].Meta:GetText()
		emit(r)`, { talents: true });
	assert.match(out.meta, /Paladin/);
	assert.match(out.meta, /3 unspent talent points/);
	assert.ok(out.meta.includes('Next planned pick: ' + out.expected));
	assert.ok(out.rows.includes('3 talent points granted'));
	assert.equal(out.action, 'View Talents');
	assert.match(out.offplan, /outside this plan/);
	assert.match(out.stale, /needs an update/);
	assert.ok(!out.stale.includes('Next planned pick'));
	assert.match(out.disabled, /turned off/);
});

test('estimated talent points are identified as estimates; early plans never invent an unlock level', () => {
	const [out] = run(`
		local c = { build = { key = "fixture", specName = "Fixture" }, state = { status = "early", unspent = 0, source = "level" } }
		Polestar.Talents = { Current = function() return c end }
		UI.ShowPicker()
		H.Dashboard[2].Inspect:Click()
		emit({ card = H.Dashboard[2].Meta:GetText(), rows = tab("overview").rows })`);
	assert.match(out.card, /Estimated unspent talent points: 0/);
	assert.match(out.card, /once the game gives you one/);
	assert.ok(out.rows.includes('Talent point availability is estimated by the Talents module.'));
	assert.ok(!out.card.includes('level 10'));
});

test('shared dungeon filter retains the journal preview window, faction policy and raid exclusion', () => {
	const [out] = run(`
		local D = Polestar.Dungeons
		local record = { kind = "dungeon", minLevel = 18, maxLevel = 26, quests = { A = 2, H = 0 } }
		local r = { preview = D.MatchesLevel(record, 16, "Alliance"), other = D.MatchesLevel(record, 20, "Horde"),
			high = D.MatchesLevel(record, 27, "All"), low = D.MatchesLevel(record, 15, "All"), count = D.QuestCount(record, "Alliance") }
		record.kind = "raid"
		r.raid = D.MatchesLevel(record, 20, "Alliance")
		record.kind, record.quests = "dungeon", { A = 0, H = 0 }
		r.unknown = D.MatchesLevel(record, 20, "Horde")
		emit(r)`, { dungeons: true });
	assert.deepEqual(out, { preview: true, other: false, high: false, low: false, count: 2, raid: false, unknown: true });
});

test('dungeon cards match the journal and only the selected inspector page queries quests', () => {
	const [out] = run(`
		uistub.player.level, uistub.player.faction, uistub.player.race, uistub.player.class = 20, "Horde", "Tauren", "DRUID"
		Polestar.Compat.IsQuestCompleted = function(id) return id == 914 end
		local D, queries = Polestar.Dungeons, 0
		local quests, pickupPlan = D.Quests, D.PickupPlan
		D.Quests = function(...) queries = queries + 1; return quests(...) end
		D.PickupPlan = function() error("catalog must not plan pickup routes") end
		UI.ShowPicker()
		local r = { summary = H.Dashboard[3].Summary:GetText(), before = queries }
		H.Dashboard[3].Inspect:Click()
		r.after, r.title = queries, H.Inspector.Title:GetText()
		r.quests, r.rewards, r.map = tab("quests").rows, tab("rewards").rows, tab("map") ~= nil
		H.Inspector.SelectTab("quests")
		r.tabsRead = queries
		D.PickupPlan = pickupPlan -- The full journal deliberately uses its planner.
		H.Inspector.Action:Click()
		r.section, r.page = P.Section(), UI.DungeonsSection.Page()
		emit(r)`, { dungeons: true });
	assert.match(out.summary, /Wailing Caverns.*17–24.*4 known quests/);
	assert.ok(!out.summary.includes('Deadmines'));
	assert.equal(out.before, 0);
	assert.equal(out.after, 1);
	assert.equal(out.tabsRead, 1);
	assert.equal(out.title, 'Wailing Caverns');
	assert.ok(out.quests.includes('Completed'));
	assert.ok(out.rewards.some((r) => r.includes('Crescent Staff')));
	assert.ok(out.rewards.some((r) => r.startsWith('Base quest XP:')));
	assert.equal(out.map, true);
	assert.equal(out.section, 'Dungeons');
	assert.equal(out.page, 'wailing-caverns');
});

test('dungeon inspector can choose another catalog match and execute map/navigation actions explicitly', () => {
	const [out] = run(`
		uistub.player.level, uistub.player.faction = 20, "Alliance"
		local D, maps, routes = Polestar.Dungeons, {}, {}
		D.ShowOnMap = function(key) maps[#maps + 1] = key; return true end
		D.GuideTo = function(key) routes[#routes + 1] = key; return true end
		Polestar.Compat.OpenWorldMap = function() return true end
		Polestar.Compat.CanOpenWorldMap = function() return true end
		UI.ShowPicker()
		H.Dashboard[3].Inspect:Click()
		local initial = H.SelectedContext().id
		rowButton("inspect:wailing-caverns"):Click()
		local r = { initial = initial, selected = H.SelectedContext(), section = P.Section(), mark = H.Dashboard[3].Mark:IsShown(),
			beforeMap = #maps, beforeRoute = #routes }
		H.Inspector.SelectTab("map")
		rowButton("map"):Click()
		rowButton("entrance"):Click()
		r.maps, r.routes = maps, routes
		emit(r)`, { dungeons: true });
	assert.equal(out.initial, 'deadmines');
	assert.equal(out.selected.id, 'wailing-caverns');
	assert.equal(out.section, 'Home');
	assert.equal(out.mark, true);
	assert.equal(out.beforeMap, 0);
	assert.equal(out.beforeRoute, 0);
	assert.deepEqual(out.maps, ['wailing-caverns']);
	assert.deepEqual(out.routes, ['wailing-caverns']);
});

test('stale dungeon map actions are revalidated after a pending level change', () => {
	const [out] = run(`
		uistub.player.level, uistub.player.faction = 20, "Horde"
		local maps = 0
		Polestar.Dungeons.ShowOnMap = function() maps = maps + 1 end
		Polestar.Compat.OpenWorldMap = function() return true end
		Polestar.Compat.CanOpenWorldMap = function() return true end
		UI.ShowPicker()
		H.Dashboard[3].Inspect:Click()
		H.Inspector.SelectTab("map")
		local button = rowButton("map")
		uistub.player.level = 60
		stub.fire("PLAYER_LEVEL_UP", 60)
		button:Click()
		emit({ maps = maps, empty = H.Inspector.Context.empty, selected = H.SelectedContext().id })`, { dungeons: true });
	assert.equal(out.maps, 0);
	assert.equal(out.empty, true);
	assert.equal(out.selected, 'wailing-caverns');
});

test('dungeon row actions participate in keyboard traversal and disabled catalogs lose their actions', () => {
	const [out] = run(`
		uistub.player.level, uistub.player.faction = 20, "Alliance"
		UI.ShowPicker()
		H.Dashboard[3].Inspect:Click()
		local button = rowButton("inspect:wailing-caverns")
		for i = 1, 60 do
			stub.RunScript(H.Frame, "OnKeyDown", "TAB")
			if button.psHomeKeyboard and button.psHomeKeyboard:IsShown() then break end
		end
		local r = { focused = button.psHomeKeyboard and button.psHomeKeyboard:IsShown(), before = H.SelectedContext().id }
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		r.after = H.SelectedContext().id
		Polestar.Set("dungeons.enabled", false); stub.advance(0.01)
		r.summary, r.empty, r.action = H.Dashboard[3].Summary:GetText(), H.Inspector.Context.empty, H.Inspector.Primary:IsShown()
		emit(r)`, { dungeons: true });
	assert.equal(out.focused, true);
	assert.equal(out.before, 'deadmines');
	assert.equal(out.after, 'wailing-caverns');
	assert.equal(out.summary, 'Dungeons are turned off.');
	assert.equal(out.empty, true);
	assert.equal(out.action, false);
});

test('hidden Home does not query catalogs, succession, quests or full-guide XP; visible refreshes coalesce', () => {
	const [out] = run(`
		uistub.player.level, uistub.player.faction = 20, "Horde"
		uistub.setGuide(uistub.elwynn, 3)
		local catalog, nextRead, pages = 0, 0, 0
		local D, forPlayer, quests = Polestar.Dungeons, Polestar.Dungeons.ForPlayer, Polestar.Dungeons.Quests
		D.ForPlayer = function(...) catalog = catalog + 1; return forPlayer(...) end
		D.Quests = function(...) pages = pages + 1; return quests(...) end
		E.NextGuide = function() nextRead = nextRead + 1; return nil end
		Polestar.Levels.ForGuide = function() error("must not simulate XP") end
		UI.ShowPicker()
		H.Dashboard[3].Inspect:Click()
		local before = { catalog, nextRead, pages }
		for i = 1, 10 do Polestar.Fire("STEP_UPDATED"); stub.fire("QUEST_LOG_UPDATE") end
		stub.advance(0.01)
		local visible = { catalog - before[1], nextRead - before[2], pages - before[3] }
		PolestarPicker:Hide()
		local hidden = { catalog, nextRead, pages }
		for i = 1, 10 do Polestar.Fire("ROUTE_CHOSEN"); stub.fire("QUEST_LOG_UPDATE"); Polestar.Fire("CODEX_LOADED") end
		stub.advance(0.01)
		emit({ visible = visible, hidden = hidden, after = { catalog, nextRead, pages } })`, { dungeons: true });
	assert.deepEqual(out.visible, [1, 1, 1]);
	assert.deepEqual(out.after, out.hidden);
});

test('dungeon map actions respect the native gamepad interface and revalidate map capability at execution', () => {
	const [out] = run(`
		uistub.player.level, uistub.player.faction = 20, "Horde"
		local blocked, maps = false, 0
		OpenWorldMap = function() return true end
		Polestar.Compat.CanOpenWorldMap = nativeCanOpenWorldMap
		Polestar.GamepadUI = function() return blocked end
		Polestar.Dungeons.ShowOnMap = function() maps = maps + 1 end
		UI.ShowPicker(); H.Dashboard[3].Inspect:Click(); H.Inspector.SelectTab("map")
		local button = rowButton("map")
		local r = { available = button ~= nil }
		blocked = true
		button:Click()
		r.maps, r.hidden = maps, rowButton("map") == nil
		emit(r)`, { dungeons: true });
	assert.equal(out.available, true);
	assert.equal(out.maps, 0);
	assert.equal(out.hidden, true);
});
