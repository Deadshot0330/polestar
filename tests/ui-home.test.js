'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');
const { TEST_PACK } = require('./helpers/packs');
const { fakeLocale } = require('./helpers/locale');

function run(script, { gamepad = false, install = '', before = '' } = {}) {
	return runAddon({
		before,
		stubs: gamepad ? ['stub_ui.lua', 'stub_gamepad.lua'] : ['stub_ui.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		script: `uistub.install(${install})\nstub.login()\nlocal UI, P, H = Polestar.UI, Polestar.UI.Picker, Polestar.UI.HomeSection
local TABS = { { uistub.elwynn, 3 }, { uistub.tailoring, 2 }, { uistub.stormwindRep, 2 } }
local function names(pool)
	local out = {}
	for _, b in ipairs(pool) do if b:IsShown() then out[#out + 1] = b.psGuide.id end end
	return out
end
${script}`,
	}).emitted;
}

test('Home is first; general opening preserves branding/sidebar, hides Guides controls and loads nothing', () => {
	const [out] = run(`
		UI.ShowPicker()
		local sections = {}
		for i, s in ipairs(P.RailItems()) do sections[i] = s.key end
		emit({ sections = sections, section = P.Section(), search = P.search:IsShown(), sidebar = PolestarPicker.Sidebar:IsShown(),
			wordmark = (PolestarPicker.Wordmark:GetPoint(1)), tagline = PolestarPicker.Tagline:GetText(),
			action = H.Hero.Action.Label:GetText(), selected = P.Selected(), calls = uistub.calls })`);
	assert.deepEqual(out.sections.slice(0, 2), ['Home', 'Guides']);
	assert.equal(out.section, 'Home');
	assert.equal(out.search, false);
	assert.equal(out.sidebar, true);
	assert.equal(out.wordmark, 'TOPLEFT');
	assert.equal(out.tagline, 'A community project');
	assert.equal(out.action, 'Choose a Guide');
	assert.equal(out.selected, undefined);
	assert.deepEqual(out.calls, {});
});

test('Continue uses applicable progress and the live step, preserving browsed step, tabs and manual target', () => {
	const [out] = run(`
		uistub.openTabs(TABS, 1)
		uistub.live = 4
		Polestar.Nav.SetTarget(1429, 40, 50, "Manual")
		UI.ShowPicker()
		local before = { Polestar.Engine.GetTabs() }
		local r = { title = H.Hero.Title:GetText(), context = H.Hero.Context:GetText(), progress = H.Hero.Progress:GetText(),
			step = H.Hero.Step:GetText(), action = H.Hero.Action.Label:GetText() }
		H.Hero.Action:Click()
		r.after = { Polestar.Engine.GetTabs() }
		r.before = before
		r.browsed = Polestar.Engine.GetStepIndex()
		r.live = Polestar.Engine.GetLiveStep()
		r.target = Polestar.Nav.GetTarget().label
		r.shown = PolestarPicker:IsShown()
		emit(r)`);
	assert.equal(out.title, 'Elwynn Forest');
	assert.match(out.context, /Testchar.*Level 4.*Alliance/);
	assert.equal(out.progress, '2 of 7 steps complete');
	assert.equal(out.step, 'Back to the Abbey');
	assert.equal(out.action, 'Continue Guide');
	assert.deepEqual(out.after, out.before);
	assert.equal(out.browsed, 3);
	assert.equal(out.live, 4);
	assert.equal(out.target, 'Manual');
	assert.equal(out.shown, false);
});

test('Choose a Guide opens Browse with the last category; missing providers omit only unavailable details', () => {
	const [out] = run(`
		UI.ShowPicker({ section = "Guides", view = "browse" })
		P.SetCategory("Professions")
		P.ShowSection("Home")
		H.Hero.Action:Click()
		local r = { section = P.Section(), view = P.View(), category = P.Category(), internal = P.ActiveSection() == nil }
		uistub.setGuide(uistub.tailoring, 2)
		Polestar.Engine.GetProgress, Polestar.Engine.GetLiveStep = nil, nil
		Polestar.Fire("STEP_UPDATED")
		P.ShowSection("Home")
		r.progress = H.Hero.Progress:IsShown()
		r.step = H.Hero.Step:GetText()
		r.action = H.Hero.Action.Label:GetText()
		emit(r)`);
	assert.deepEqual(out, { section: 'Guides', view: 'browse', category: 'Professions', internal: true,
		progress: false, step: '', action: 'Continue Guide' });
});

test('no installed guides or a removed saved selection leaves a useful keyboard-accessible Choose action', () => {
	const [out] = run(`
		uistub.order, uistub.suggest = {}, nil
		P.Select("removed/guide")
		UI.ShowPicker()
		local r = { title = H.Hero.Title:GetText(), action = H.Hero.Action.Label:GetText(), progress = H.Hero.Progress:IsShown() }
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		r.section, r.view, r.calls = P.Section(), P.View(), uistub.calls
		emit(r)`);
	assert.deepEqual(out, { title: 'Choose a Guide', action: 'Choose a Guide', progress: false, section: 'Guides', view: 'browse', calls: {} });
});

test('open-guide choices select without loading, show details in Guides, and continue without duplicating tabs', () => {
	const [out] = run(`
		uistub.openTabs(TABS, 1)
		UI.ShowPicker()
		uistub.calls = {}
		H.Cards[1]:Click()
		local r = { selected = P.Selected(), section = P.Section(), calls = #uistub.calls, open = names(H.Cards) }
		H.Inspector.Action:Click()
		r.details = { P.Section(), P.details.Title:GetText() }
		P.ShowSection("Home")
		stub.RunScript(H.Cards[1], "OnDoubleClick", "LeftButton")
		r.tabs, r.active = Polestar.Engine.GetTabs()
		emit(r)`);
	assert.equal(out.selected, 'forever/professions/tailoring');
	assert.equal(out.section, 'Home');
	assert.equal(out.calls, 0);
	assert.equal(out.open.length, 2);
	assert.deepEqual(out.details, ['Guides', 'Tailoring 1-300']);
	assert.equal(out.tabs.length, 3);
	assert.equal(out.active, 2);
});




test('Continue has a separate inspector action without changing the active guide or tabs', () => {
	const [out] = run(`
		uistub.openTabs(TABS, 1)
		UI.ShowPicker()
		uistub.calls = {}
		H.Hero.Details:Click()
		emit({ section = P.Section(), selected = H.SelectedContext().id, title = H.Inspector.Title:GetText(), calls = uistub.calls })`);
	assert.deepEqual(out, { section: 'Home', selected: 'forever/alliance/human/01-elwynn-forest', title: 'Elwynn Forest', calls: {} });
});

test('long translations and six open tabs fit without dashboard scrolling', () => {
	const [out] = run(`
		local tabs = {}
		for i = 1, 6 do tabs[i] = { uistub.order[i], 1 } end
		uistub.openTabs(tabs, 1)
		uistub.suggestions = {}
		for i = 7, 12 do uistub.suggestions[#uistub.suggestions + 1] = uistub.order[i] end
		uistub.guides[uistub.order[1]].title = string.rep("Long guide context ", 35)
		UI.ShowPicker()
		local r = { content = H.Scroll.psContent, view = H.Scroll.psView, bar = H.Scroll.Bar:IsShown(), heroH = H.Hero:GetHeight(),
			buttonW = H.Hero.Action:GetWidth(), heroW = H.Hero:GetWidth(), buttonH = H.Hero.Action:GetHeight(),
			buttonTextH = H.Hero.Action.Label:GetStringHeight() }
		for i = 1, 11 do H.Step(1) end
		r.scrolled = H.Scroll:GetVerticalScroll()
		r.selected = P.Selected()
		Polestar.Widgets.ScrollTo(H.Scroll, 0)
		stub.RunScript(H.Scroll, "OnMouseWheel", -1)
		r.wheel = H.Scroll:GetVerticalScroll()
		uistub.guides[uistub.order[1]].title = "Short title"
		uistub.openTabs({ tabs[1] }, 1)
		P.Select(nil)
		stub.advance(0.01)
		r.resetScroll = H.Scroll:GetVerticalScroll()
		r.resetContent, r.resetView = H.Scroll.psContent, H.Scroll.psView
		emit(r)`, { before: fakeLocale('itIT', { 'Continue Guide': 'Continue the selected guide with its saved progress '.repeat(12) }) });
	assert.ok(out.content <= out.view, JSON.stringify(out));
	assert.equal(out.bar, false);
	assert.ok(out.heroH > 188);
	assert.ok(out.buttonW <= out.heroW - 32);
	assert.ok(out.buttonH >= out.buttonTextH + 12);
	assert.equal(out.scrolled, 0);
	assert.equal(out.wheel, 0);
	assert.ok(out.resetContent < out.content);
	assert.ok(out.resetScroll <= Math.max(0, out.resetContent - out.resetView));
});




test('Home keeps exact quest context until explicit Browse clears it; the menu still toggles closed', () => {
	const [out] = run(`
		P.ShowQuest(7)
		local query = P.Query()
		PolestarPicker:Hide()
		Polestar.Fire("TOGGLE_PICKER")
		local home = P.Section()
		P.ShowSection("Guides")
		local kept = { P.Query(), P.shown.guides }
		PolestarPicker:Hide()
		Polestar.Fire("TOGGLE_PICKER")
		Polestar.Fire("TOGGLE_PICKER")
		local closed = not PolestarPicker:IsShown()
		SlashCmdList.POLESTAR("guides")
		emit({ home = home, query = query, kept = kept, closed = closed, browse = { P.Section(), P.View(), P.Query() } })`);
	assert.equal(out.home, 'Home');
	assert.deepEqual(out.kept, [out.query, 1]);
	assert.equal(out.closed, true);
	assert.deepEqual(out.browse, ['Guides', 'browse', '']);
});

test('a constructed Home switches through all skins and restores each current sidebar skin', () => {
	const [out] = run(`
		uistub.openTabs(TABS, 1)
		UI.ShowPicker()
		local hero, f, ok = H.Hero, PolestarPicker, true
		for _, skin in ipairs({ "halo", "hearth", "forever", "blizzard", "classic", "polestar" }) do
			Polestar.Set("ui.skin", skin)
			stub.advance(0.01)
			ok = ok and not f.SidebarBackground:IsShown() and not f.NavScroll:IsShown() and H.Hero == hero
			P.ShowSection("Guides")
			ok = ok and f.SidebarBackground:IsShown() and f.SidebarBackground.psSkin.skin == skin and f.NavScroll:IsShown()
			P.ShowSection("Home")
		end
		emit({ ok = ok, tabs = #Polestar.Engine.GetTabs(), guide = Polestar.Engine.GetGuide().id })`);
	assert.deepEqual(out, { ok: true, tabs: 3, guide: 'forever/alliance/human/01-elwynn-forest' });
});

test('visible updates coalesce; hidden Home performs no suggestion queries and deferred work checks visibility', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		UI.ShowPicker()
		local get, count = Polestar.Guides.Suggestions, 0
		Polestar.Guides.Suggestions = function() count = count + 1; return get() end
		Polestar.Fire("GUIDE_CHANGED", uistub.elwynn)
		Polestar.Fire("TABS_CHANGED")
		Polestar.Fire("STEP_UPDATED")
		local before = count
		stub.advance(0.01)
		local coalesced = count
		Polestar.Fire("STEP_UPDATED")
		P.ShowSection("Lookup")
		stub.advance(0.01)
		Polestar.Fire("TABS_CHANGED")
		Polestar.Fire("STEP_UPDATED")
		stub.advance(0.01)
		local hidden = count
		P.ShowSection("Home")
		emit({ before = before, coalesced = coalesced, hidden = hidden, reopened = count })`);
	assert.deepEqual(out, { before: 0, coalesced: 1, hidden: 1, reopened: 2 });
});

test('Home keyboard selection retains loading behavior without legacy guide controls', () => {
	const [out] = run(`
		uistub.openTabs({ { uistub.elwynn, 3 } }, 1)
		uistub.suggestions = { uistub.tailoring }
		UI.ShowPicker()
		P.Select(uistub.tailoring)
		H.Render()
		local selected = P.Selected()
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		local tabs = Polestar.Engine.GetTabs()
		emit({ selected = selected, tabs = #tabs, id = Polestar.Engine.GetGuide().id, legacy = H.Actions ~= nil })`);
	assert.deepEqual(out, { selected: 'forever/professions/tailoring', tabs: 1, id: 'forever/professions/tailoring', legacy: false });
});

test('gamepad starts on Continue Guide, navigates to Guides and returns without loading a guide', () => {
	const [out] = run(`
		uistub.openTabs(TABS, 1)
		Polestar.Set("gamepad.withMouse", true)
		UI.ShowPicker()
		stub.advance(0.3)
		local primary = Polestar.Gamepad.Focused(PolestarPicker) == H.Hero.Action
		uistub.calls = {}
		stub.press("PADRSHOULDER")
		local guides = P.Section()
		stub.press("PADLSHOULDER")
		local home = P.Section()
		stub.advance(0.3)
		stub.press("PAD1")
		emit({ primary = primary, guides = guides, home = home, calls = uistub.calls, tabs = #Polestar.Engine.GetTabs(), shown = PolestarPicker:IsShown() })`, { gamepad: true });
	assert.equal(out.primary, true);
	assert.equal(out.guides, 'Guides');
	assert.equal(out.home, 'Home');
	assert.deepEqual(out.calls, [['SetGuide', 'forever/alliance/human/01-elwynn-forest'], ['SelectTab', 1]]);
	assert.equal(out.tabs, 3);
	assert.equal(out.shown, false);
});


test('real Engine continuation preserves its pinned step, applicable progress and saved navigation state', () => {
	const [out] = runAddon({
		stubs: ['stub_world.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		saved: { Polestar: 'PolestarDB = { schema = 1, welcomeSeen = 1, settings = { behavior = { autoSelectGuide = false } } }; PolestarCharDB = { schema = 1, welcomeSeen = 1 }' },
		login: true,
		script: `${TEST_PACK}
		Polestar.RegisterGuide({ id = "test/home", pack = "test", title = "Home continuation test", steps = {
			{ title = "Live objective", goals = { { t = "level", level = 60 } } },
			{ title = "Browsed objective", goals = { { t = "level", level = 60 } } },
		} })
		local E, UI = Polestar.Engine, Polestar.UI
		E.SetGuide("test/home")
		E.Goto(2)
		local target = { map = 1429, x = 40, y = 50, label = "Manual target" }
		Polestar.Nav = { GetTarget = function() return target end, GetDistance = function() return nil end }
		local function state()
			local tabs, active = E.GetTabs()
			return { tabs = tabs, active = active, current = E.GetStepIndex(), live = E.GetLiveStep(),
				progress = { E.GetProgress() }, saved = Polestar.CharState().guides, target = Polestar.Nav.GetTarget() }
		end
		local before = state()
		UI.ShowPicker({ section = "Home" })
		local liveTitle = UI.HomeSection.Hero.Step:GetText()
		UI.HomeSection.Hero.Action:Click()
		emit({ before = before, after = state(), liveTitle = liveTitle })`,
	}).emitted;
	assert.equal(out.before.current, 2);
	assert.equal(out.before.live, 1);
	assert.equal(out.liveTitle, 'Live objective');
	assert.deepEqual(out.after, out.before);
});

function realHome(script) {
	return runAddon({
		stubs: ['stub_world.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		saved: { Polestar: 'PolestarDB = { schema = 1, welcomeSeen = 1, settings = { behavior = { autoSelectGuide = false } } }; PolestarCharDB = { schema = 1, welcomeSeen = 1 }' },
		login: true,
		script: `${TEST_PACK}
		for _, entry in ipairs({ { "a", "Elwynn Forest" }, { "b", "Westfall" } }) do
			Polestar.RegisterGuide({ id = "test/" .. entry[1], pack = "test", title = entry[2], zoneName = entry[2], minLevel = 1, maxLevel = 60,
				steps = { { title = "Wait", goals = { { t = "level", level = 60 } } } } })
		end
		local UI, H = Polestar.UI, Polestar.UI.HomeSection
		local function first() for _, b in ipairs(H.Rows) do if b:IsShown() then return b.psGuide.id end end end
		${script}`,
	}).emitted;
}




test('contextual header refreshes identity, faction and zone through Compat; customization is actionable', () => {
	const [out] = run(`
		local zone = "Northshire"
		Polestar.Compat.GetZoneText = function() return zone end
		UI.ShowPicker()
		local r = { heading = H.Header.Title:GetText(), first = H.Header.Context:GetText(),
			customize = H.Header.Customize:GetObjectType(), texture = H.Header.Emblem:GetTexture() }
		uistub.player.name, uistub.player.class, uistub.player.level, uistub.player.faction = "Changed", "MAGE", 16, "Horde"
		zone = "Orgrimmar"
		stub.fire("PLAYER_LEVEL_UP", 16)
		stub.fire("UNIT_NAME_UPDATE", "player")
		stub.fire("ZONE_CHANGED_NEW_AREA")
		stub.advance(0.01)
		r.changed, r.changedTexture = H.Header.Context:GetText(), H.Header.Emblem:GetTexture()
		Polestar.Compat.GetPlayerInfo, Polestar.Compat.GetZoneText = nil, nil
		stub.fire("PLAYER_ENTERING_WORLD")
		stub.advance(0.01)
		r.missing, r.fallback = H.Header.Context:GetText(), H.Header.Emblem:GetTexture()
		emit(r)`);
	assert.equal(out.heading, 'Your Journey');
	assert.match(out.first, /Testchar.*Warrior.*Level 4.*Alliance.*Northshire/);
	assert.equal(out.customize, 'Button');
	assert.match(out.texture, /UI-PVP-Alliance$/);
	assert.match(out.changed, /Changed.*Mage.*Level 16.*Horde.*Orgrimmar/);
	assert.match(out.changedTexture, /UI-PVP-Horde$/);
	assert.equal(out.missing, '');
	assert.match(out.fallback, /emblem$/);
});

test('card summaries use current providers and actions retain their existing destinations', () => {
	const [out] = run(`
		local plan, rares, lists, training = "Fixture plan", { "Fixture sighting" }, 0, nil
		Polestar.Talents = { Current = function() return { build = { specName = plan }, valid = { ok = true }, state = { unspent = 2 } } end }
		Polestar.Rares = { NearbyRecords = function()
			local records = {}
			for _, name in ipairs(rares) do records[#records + 1] = { key = "name:" .. name, name = name } end
			return records
		end }
		Polestar.Dungeons = { ForPlayer = function()
			lists = lists + 1
			return { { key = "fixture", name = "Fixture dungeon", kind = "dungeon", minLevel = 1, maxLevel = 10 } }
		end }
		Polestar.Nav.nearby = { Go = function(kind) training = kind end }
		for _, key in ipairs({ "Talents", "Rares", "Dungeons" }) do
			UI.RegisterSection({ key = key, build = function() end, render = function() end })
		end
		uistub.suggestions = { uistub.tailoring }
		UI.ShowPicker()
		local r = { build = H.Dashboard[2].Summary:GetText(), points = H.Dashboard[2].Meta:GetText(),
			dungeon = H.Dashboard[3].Summary:GetText(), rare = H.Dashboard[7].Summary:GetText() }
		H.Dashboard[5].Action:Click()
		r.training = training
		local destinations = {}
		for _, i in ipairs({ 2, 3, 6, 7, 4 }) do
			H.Dashboard[i].Action:Click()
			destinations[#destinations + 1] = P.Section()
			P.ShowSection("Home")
		end
		r.destinations, r.selected, r.calls = destinations, P.Selected(), uistub.calls
		plan, rares = "Updated fixture", {}
		Polestar.Fire("TALENTS_UPDATED")
		Polestar.Fire("RARE_NEARBY")
		stub.advance(0.01)
		r.updated, r.empty = H.Dashboard[2].Summary:GetText(), H.Dashboard[7].Summary:GetText()
		P.ShowSection("Guides")
		local before = lists
		Polestar.Fire("TALENTS_UPDATED")
		Polestar.Fire("RARE_NEARBY")
		stub.advance(0.01)
		r.hidden = lists == before
		emit(r)`);
	assert.equal(out.build, 'Fixture plan');
	assert.match(out.points, /2 unspent talent points/);
	assert.match(out.dungeon, /Fixture dungeon.*1–10/);
	assert.equal(out.rare, 'Fixture sighting');
	assert.equal(out.training, 'class');
	assert.deepEqual(out.destinations, ['Talents', 'Dungeons', 'Lookup', 'Rares', 'Guides']);
	assert.equal(out.selected, 'forever/professions/tailoring');
	assert.deepEqual(out.calls, {});
	assert.equal(out.updated, 'Updated fixture');
	assert.equal(out.empty, 'No recent rare detections here.');
	assert.equal(out.hidden, true);
});

test('inspector selection and dismissal reclaim space without changing guide or saved state', () => {
	const [out] = run(`
		uistub.openTabs(TABS, 1)
		UI.ShowPicker()
		H.Hero.Inspect:Click()
		local saved, tabs = Polestar.CharState(), { Polestar.Engine.GetTabs() }
		local narrow = H.Hero:GetWidth()
		H.Dashboard[5].Inspect:Click()
		local r = { title = H.Inspector.Title:GetText(), selected = H.Dashboard[5].Mark:IsShown(),
			other = H.Hero.Mark:IsShown(), body = H.Inspector.Body:GetObjectType(),
			tabsRegion = H.Inspector.Tabs:IsShown(), primaryRegion = H.Inspector.Primary:IsShown() }
		H.Inspector.Close:Click()
		r.dismissed, r.wider = not H.Inspector:IsShown(), H.Hero:GetWidth() > narrow
		H.Header.Toggle:Click()
		r.restored = H.Inspector:IsShown() and H.Hero:GetWidth() == narrow
		r.sameState, r.tabs, r.before, r.calls = saved == Polestar.CharState(), { Polestar.Engine.GetTabs() }, tabs, uistub.calls
		emit(r)`);
	assert.equal(out.title, 'Class Training');
	assert.equal(out.selected, true);
	assert.equal(out.other, false);
	assert.equal(out.body, 'ScrollFrame');
	assert.equal(out.tabsRegion, false);
	assert.equal(out.primaryRegion, true);
	assert.equal(out.dismissed, true);
	assert.equal(out.wider, true);
	assert.equal(out.restored, true);
	assert.equal(out.sameState, true);
	assert.deepEqual(out.tabs, out.before);
	assert.deepEqual(out.calls, {});
});

test('dashboard tiers reflow to four, two and one columns; narrow Home hides the inspector', () => {
	const samples = run(`
		UI.ShowPicker()
		H.Inspector.Close:Click()
		for _, width in ipairs({ 1000, 700, 480, 320 }) do
			PolestarPicker:SetWidth(width + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side)
			H.Render()
			local points = {}
			for i, c in ipairs(H.Dashboard) do
				local _, _, _, x, y = c:GetPoint(1)
				points[i] = { x = x, y = y, width = c:GetWidth(), height = c:GetHeight() }
			end
			emit({ width = width, points = points, toggle = H.Header.Toggle:IsShown(), inspector = H.Inspector:IsShown() })
		end`);
	for (const sample of samples) {
		assert.equal(sample.points.length, 7);
		assert.equal(sample.inspector, false);
		for (const p of sample.points) assert.ok(p.width >= 170);
		assert.ok(sample.points[1].y < sample.points[0].y);
		assert.ok(sample.points[3].y < sample.points[1].y);
	}
	assert.equal(samples[0].points[3].y, samples[0].points[6].y);
	assert.equal(samples[2].toggle, false);
});

test('new card actions and inspector controls are reachable by keyboard and gamepad', () => {
	const [out] = run(`
		Polestar.Set("gamepad.withMouse", true)
		UI.ShowPicker()
		H.Hero.Inspect:Click()
		local collected, wanted, count = {}, { H.Header.Toggle, H.Inspector.Close }, 0
		for _, c in ipairs(H.Dashboard) do wanted[#wanted + 1] = c.Inspect end
		for _, b in ipairs(Polestar.Gamepad.Collect(PolestarPicker)) do collected[b] = true end
		for _, b in ipairs(wanted) do if collected[b] then count = count + 1 end end
		for i = 1, 40 do
			stub.RunScript(H.Frame, "OnKeyDown", "TAB")
			local b = H.Dashboard[7].Inspect
			if b.psHomeKeyboard and b.psHomeKeyboard:IsShown() then break end
		end
		local offset = H.Scroll:GetVerticalScroll()
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		emit({ count = count, title = H.Inspector.Title:GetText(), offset = offset, calls = uistub.calls })`, { gamepad: true });
	assert.equal(out.count, 9);
	assert.equal(out.title, 'Rares Nearby');
	assert.equal(out.offset, 0);
	assert.deepEqual(out.calls, {});
});

test('missing providers retain all seven cards and omit actions with unavailable destinations', () => {
	const [out] = run(`
		Polestar.Talents, Polestar.Rares, Polestar.Dungeons, Polestar.Nav = nil, nil, nil, nil
		Polestar.Compat.GetPlayerInfo, Polestar.Compat.GetZoneText = nil, nil
		uistub.order, uistub.suggest = {}, nil
		UI.ShowPicker()
		local summaries = {}
		for i, c in ipairs(H.Dashboard) do summaries[i] = c.Summary:GetText() end
		emit({ summaries = summaries, build = H.Dashboard[2].Action:IsShown(), trainer = H.Dashboard[5].Action:IsShown(),
			rare = H.Dashboard[7].Action:IsShown(), upcoming = H.Dashboard[4].Action:IsShown(),
			action = H.Hero.Action.Label:GetText(), context = H.Header.Context:GetText() })`);
	assert.equal(out.summaries.length, 7);
	for (const summary of out.summaries) assert.ok(summary.length > 0);
	assert.equal(out.build, false);
	assert.equal(out.trainer, false);
	assert.equal(out.rare, false);
	assert.equal(out.upcoming, false);
	assert.equal(out.action, 'Choose a Guide');
	assert.equal(out.context, '');
});

test('inspector context stays scrollable in short windows and failed faction art uses the identity fallback', () => {
	const [out] = run(`
		uistub.suggestions = { uistub.tailoring }
		uistub.guides[uistub.tailoring].title = string.rep("A long guide title ", 60)
		UI.ShowPicker()
		PolestarPicker:SetHeight(360)
		H.Dashboard[4].Inspect:Click()
		local r = { content = H.Inspector.Body.psContent, view = H.Inspector.Body.psView, bar = H.Inspector.Body.Bar:IsShown() }
		stub.RunScript(H.Inspector.Body, "OnMouseWheel", -1)
		r.offset = H.Inspector.Body:GetVerticalScroll()
		local set = H.Header.Emblem.SetTexture
		H.Header.Emblem.SetTexture = function(self, texture)
			if texture:find("UI-PVP-", 1, true) then return false end
			return set(self, texture)
		end
		H.Render()
		r.texture = H.Header.Emblem:GetTexture()
		emit(r)`);
	assert.ok(out.content > out.view);
	assert.ok(out.view > 0);
	assert.equal(out.bar, true);
	assert.ok(out.offset > 0);
	assert.match(out.texture, /emblem$/);
});

for (const skin of ['polestar', 'halo', 'hearth', 'forever', 'blizzard', 'classic']) {
	test(`Home restores the sidebar through sections, Options and repainting in ${skin}`, () => {
		const [out] = run(`
			Polestar.Set("ui.skin", "${skin}")
			UI.ShowPicker({ section = "Guides", view = "browse" })
			local f, W = PolestarPicker, Polestar.Widgets
			local chrome = { f.Emblem, f.Status, f.Stage, f.Discord, f.Wordmark, f.Tagline }
			local saved = {}
			for i, w in ipairs(chrome) do saved[i] = { parent = w:GetParent(), point = { w:GetPoint(1) } } end
			local main = { f.Main:GetPoint(1) }
			local title = { f.Title:GetPoint(1) }
			local bodyWidth, kept, restores, homes = f.BodyWidth, true, true, true
			for _, destination in ipairs({ "Guides", "Lookup", "Dungeons", "Guides" }) do
				P.ShowSection("Home")
				Polestar.Theme.Refresh()
				stub.advance(0.01)
				local _, anchor, _, _, top = H.Frame:GetPoint(1)
				local _, _, _, _, bottom = H.Frame:GetPoint(2)
				homes = homes and f.Sidebar:IsShown() and not f.SidebarBackground:IsShown()
					and not f.SidebarDivider:IsShown() and not f.NavScroll:IsShown() and not f.Sidebar:IsMouseEnabled()
					and not f.Band:IsShown() and anchor == f.Sidebar and top == -44 and bottom == W.SHELL.footer
				homes = homes and f.Wordmark:IsVisible() and f.Tagline:IsVisible() and not f.Title:IsShown()
				for i, w in ipairs(chrome) do
					kept = kept and w:GetParent() == saved[i].parent and w:IsVisible()
					local point = { w:GetPoint(1) }
					for j = 1, 5 do kept = kept and point[j] == saved[i].point[j] end
				end
				P.ShowSection(destination)
				restores = restores and f.SidebarBackground:IsVisible() and f.SidebarDivider:IsVisible()
					and f.NavScroll:IsVisible() and f.Sidebar:IsMouseEnabled() and f.Band:IsShown() and f.BodyWidth == bodyWidth
					and f.Wordmark:IsVisible() and f.Tagline:IsVisible() and f.Title:IsVisible()
				local point = { f.Main:GetPoint(1) }
				local tp = { f.Title:GetPoint(1) }
				for j = 1, 5 do restores = restores and point[j] == main[j] and tp[j] == title[j] end
			end
			P.ShowSection("Home")
			UI.ShowOptions()
			local options = PolestarOptions.SidebarBackground:IsVisible() and PolestarOptions.Sidebar:IsShown()
			UI.ShowPicker({ section = "Home" })
			local clicked = false
			UI.ShowDiscord = function() clicked = true end
			f.Discord:Click()
			emit({ kept = kept, restores = restores, homes = homes, options = options, clicked = clicked,
				groundParent = f.SidebarBackground:GetParent() == f.Sidebar,
				groundMouse = f.SidebarBackground:IsMouseEnabled(), section = P.Section() })`);
		assert.deepEqual(out, { kept: true, restores: true, homes: true, options: true, clicked: true,
			groundParent: true, groundMouse: false, section: 'Home' });
	});

	test(`Home branding and Journey fit scales and window sizes without reserving legacy space in ${skin}`, () => {
		const samples = run(`
			Polestar.Set("ui.skin", "${skin}")
			UI.ShowPicker()
			local f = PolestarPicker
			for _, scale in ipairs({ 0.75, 1, 1.4 }) do
				Polestar.Set("ui.menuScale", scale)
				for _, size in ipairs({ { 700, 360 }, { 1100, 540 } }) do
					f:SetSize(size[1], size[2])
					P.Select(nil); H.Render()
					local content, workspaceScale = H.Scroll.psContent, H.Scroll.Child:GetScale()
					P.Select(uistub.tailoring); H.Render()
					local _, _, _, _, frameY = H.Frame:GetPoint(1)
					local _, _, _, _, headerY = H.Header:GetPoint(1)
					local _, _, _, _, taglineY = f.Tagline:GetPoint(1)
					local _, _, _, _, scrollY = H.Scroll:GetPoint(1)
					emit({ branding = f.Wordmark:IsVisible() and f.Tagline:IsVisible(),
						gap = taglineY - f.Tagline:GetStringHeight() - (frameY + headerY),
						workspaceGap = headerY - H.Header:GetHeight() - scrollY,
						sameContent = content == H.Scroll.psContent and workspaceScale == H.Scroll.Child:GetScale(),
						fits = H.Scroll.psContent <= H.Scroll.psView + 1,
						title = H.Header.Title:GetText(), scale = f:GetScale() })
				end
			end`);
		assert.equal(samples.length, 6);
		for (const sample of samples) {
			assert.equal(sample.branding, true);
			assert.equal(sample.gap, 12);
			assert.equal(sample.workspaceGap, 0);
			assert.equal(sample.sameContent, true);
			assert.equal(sample.fits, true);
			assert.equal(sample.title, 'Your Journey');
		}
		assert.deepEqual(samples.map(s => s.scale), [0.75, 0.75, 1, 1, 1.4, 1.4]);
	});

	test(`Home fits all seven cards without a dashboard scrollbar in ${skin}`, () => {
 const [out] = run(`
 Polestar.Set("ui.skin", "${skin}")
 uistub.openTabs(TABS, 1); UI.ShowPicker()
 local function fits() return H.Scroll.psContent <= H.Scroll.psView + 1 and not H.Scroll.Bar:IsShown() end
 local initial = fits()
 H.Hero.Inspect:Click(); local details = fits()
 H.Inspector.Close:Click(); PolestarPicker:SetHeight(540); H.Render()
 local shown = 0; for _, c in ipairs(H.Dashboard) do if c:IsShown() then shown = shown + 1 end end
 emit({ initial = initial, details = details, resized = fits(), shown = shown, rows = #names(H.Rows), scale = H.Scroll.Child:GetScale() })`);
 assert.equal(out.initial, true); assert.equal(out.details, true); assert.equal(out.resized, true);
 assert.equal(out.shown, 7); assert.equal(out.rows, 0); assert.ok(out.scale > 0 && out.scale <= 1);
 });
}
