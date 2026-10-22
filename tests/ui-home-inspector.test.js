'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');
const { TEST_PACK } = require('./helpers/packs');

function run(script, { gamepad = false } = {}) {
	return runAddon({
		stubs: gamepad ? ['stub_ui.lua', 'stub_gamepad.lua'] : ['stub_ui.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		script: `uistub.install()\nstub.login()
		local UI, P, H = Polestar.UI, Polestar.UI.Picker, Polestar.UI.HomeSection
		local function tabs()
			local out = {}
			for _, t in ipairs(H.Inspector.Context.tabs) do out[#out + 1] = t.key end
			return out
		end
		${script}`,
	}).emitted;
}

test('Continue selection exposes actual guide progress, quests, route and authored rewards without acting', () => {
	const [out] = run(`
		uistub.openTabs({ { uistub.elwynn, 3 } }, 1)
		uistub.live = 4
		uistub.guides[uistub.elwynn].reward = { { text = "Fixture reward" } }
		Polestar.Nav.SetTarget(1429, 40, 50, "Manual")
		UI.ShowPicker()
		uistub.calls = {}
		stub.RunScript(H.Hero, "OnMouseUp", "LeftButton")
		local c = H.Inspector.Context
		emit({ key = c.key, tabs = tabs(), rows = c.tabs[1].rows, title = c.title, action = c.action.label,
			rewards = c.tabs[#c.tabs].rows, section = P.Section(), selected = H.Hero.Mark:IsShown(),
			calls = uistub.calls, step = Polestar.Engine.GetStepIndex(), live = Polestar.Engine.GetLiveStep(), target = Polestar.Nav.GetTarget().label })`);
	assert.equal(out.key, 'continue:forever/alliance/human/01-elwynn-forest');
	assert.deepEqual(out.tabs, ['overview', 'quests', 'route', 'rewards']);
	assert.ok(out.rows.includes('2 of 7 steps complete'));
	assert.ok(out.rows.includes('Back to the Abbey'));
	assert.deepEqual(out.rewards, ['Reward: Fixture reward']);
	assert.equal(out.title, 'Elwynn Forest');
	assert.equal(out.action, 'Continue Guide');
	assert.equal(out.section, 'Home');
	assert.equal(out.selected, true);
	assert.deepEqual(out.calls, {});
	assert.equal(out.step, 3);
	assert.equal(out.live, 4);
	assert.equal(out.target, 'Manual');
});

test('inspector Continue is explicit and never continues a different guide after a queued change', () => {
	const out = run(`
		uistub.openTabs({ { uistub.elwynn, 3 } }, 1)
		UI.ShowPicker()
		H.Hero.Inspect:Click()
		H.Inspector.Action:Click()
		emit({ shown = PolestarPicker:IsShown(), guide = Polestar.Engine.GetGuide().id, step = Polestar.Engine.GetStepIndex() })
		UI.ShowPicker({ section = "Home" })
		H.Hero.Inspect:Click()
		uistub.setGuide(uistub.tailoring, 2)
		uistub.calls = {}
		H.Inspector.Action:Click()
		emit({ shown = PolestarPicker:IsShown(), empty = H.Inspector.Context.empty, action = H.Inspector.Primary:IsShown(),
			selection = H.SelectedContext(), calls = uistub.calls, guide = Polestar.Engine.GetGuide().id })`);
	assert.deepEqual(out[0], { shown: false, guide: 'forever/alliance/human/01-elwynn-forest', step: 3 });
	assert.equal(out[1].shown, true);
	assert.equal(out[1].empty, true);
	assert.equal(out[1].action, false);
	assert.equal(out[1].selection.id, 'forever/alliance/human/01-elwynn-forest');
	assert.equal(out[1].guide, 'forever/professions/tailoring');
	assert.deepEqual(out[1].calls, {});
});

test('guide selection inspects metadata in Home; its explicit action opens Guides without loading', () => {
	const [out] = run(`
		uistub.suggestions = { uistub.tailoring }
		UI.ShowPicker()
		uistub.calls = {}
		H.SelectContext("guide", uistub.tailoring)
		local r = { title = H.Inspector.Title:GetText(), section = P.Section(), key = H.SelectedContext(), tabs = tabs(), calls = uistub.calls }
		H.Inspector.Action:Click()
		r.destination, r.guide = P.Section(), Polestar.Engine.GetGuide()
		emit(r)`);
	assert.equal(out.title, 'Tailoring 1-300');
	assert.equal(out.section, 'Home');
	assert.equal(out.key.kind, 'guide');
	assert.equal(out.key.id, 'forever/professions/tailoring');
	assert.equal(out.destination, 'Guides');
	assert.equal(out.guide, undefined);
	assert.deepEqual(out.calls, {});
});

test('tab changes reuse the shell, preserve selection and do not query or render the dashboard', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		UI.ShowPicker()
		H.Hero.Inspect:Click()
		local shell, hero, frames, selection = H.Inspector, H.Hero, #stub.frames, H.SelectedContext()
		local old = H.Render
		H.Render = function() error("tab rerendered Home") end
		Polestar.Guides.Get = function() error("tab queried guide") end
		Polestar.Guides.Suggestions = function() error("tab queried recommendations") end
		H.Inspector.SelectTab("quests")
		local quests = H.Inspector.ActiveTab
		H.Inspector.SelectTab("route")
		H.Inspector.SelectTab("overview")
		H.Render = old
		emit({ same = shell == H.Inspector and hero == H.Hero, frames = #stub.frames == frames,
			selected = H.SelectedContext(), before = selection, quests = quests, current = H.Inspector.ActiveTab, calls = uistub.calls })`);
	assert.equal(out.same, true);
	assert.equal(out.frames, true);
	assert.deepEqual(out.selected, out.before);
	assert.equal(out.quests, 'quests');
	assert.equal(out.current, 'overview');
	assert.deepEqual(out.calls, {});
});

test('per-entity tab and scroll memory survives refresh, switching contexts and leaving Home', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		UI.ShowPicker()
		PolestarPicker:SetHeight(360)
		H.Hero.Inspect:Click()
		H.Inspector.SelectTab("quests")
		Polestar.Widgets.ScrollTo(H.Inspector.Body, 40)
		local offset = H.Inspector.Body:GetVerticalScroll()
		H.Dashboard[6].Inspect:Click()
		H.Hero.Inspect:Click()
		local restored = H.Inspector.ActiveTab == "quests" and H.Inspector.Body:GetVerticalScroll() == offset
		P.ShowSection("Guides")
		P.ShowSection("Home")
		Polestar.Fire("STEP_UPDATED")
		stub.advance(0.01)
		emit({ offset = offset, restored = restored, tab = H.Inspector.ActiveTab, scroll = H.Inspector.Body:GetVerticalScroll(), selection = H.SelectedContext() })`);
	assert.ok(out.offset > 0);
	assert.equal(out.restored, true);
	assert.equal(out.tab, 'quests');
	assert.equal(out.scroll, out.offset);
	assert.equal(out.selection.kind, 'continue');
});


test('all seven cards share one inspector; narrow selections open it inside the workspace scroll', () => {
	const [out] = run(`
		UI.ShowPicker()
		local shell, keys = H.Inspector, {}
		for _, c in ipairs(H.Dashboard) do
			stub.RunScript(c, "OnMouseUp", "LeftButton")
			keys[#keys + 1] = H.SelectedContext().kind
			assert(H.Inspector == shell)
		end
		PolestarPicker:SetWidth(480 + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side)
		H.Hero.Inspect:Click()
		local offset = H.Scroll:GetVerticalScroll()
		local inline = H.Inspector:GetParent() == H.Scroll.Child
		H.Inspector.Close:Click()
		emit({ keys = keys, inline = inline, offset = offset, closed = not H.Inspector:IsVisible(),
			workspace = H.Scroll:IsVisible(), width = H.Hero:GetWidth(), calls = uistub.calls })`);
	assert.deepEqual(out.keys, ['continue', 'build', 'dungeon', 'upcoming', 'training', 'gear', 'rares']);
	assert.equal(out.inline, true);
	assert.ok(out.offset > 0);
	assert.equal(out.closed, true);
	assert.equal(out.workspace, true);
	assert.ok(out.width >= 480);
	assert.deepEqual(out.calls, {});
});

test('keyboard and gamepad opening focus inspector controls and dismissal returns to the source', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		Polestar.Set("gamepad.withMouse", true)
		UI.ShowPicker()
		local G, b = Polestar.Gamepad, H.Hero.Inspect
		stub.press("PADDDOWN")
		G.SetFocus(PolestarPicker, b)
		stub.press("PAD1")
		local opened = G.Within(G.Focused(PolestarPicker), H.Inspector)
		G.SetFocus(PolestarPicker, H.Inspector.Close)
		stub.press("PAD1")
		local returned = G.Focused(PolestarPicker) == b
		stub.press("PAD1")
		stub.press("PAD2")
		local back = PolestarPicker:IsShown() and not H.Inspector:IsShown() and G.Focused(PolestarPicker) == b
		for i = 1, 3 do stub.RunScript(H.Frame, "OnKeyDown", "TAB") end
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		local first = H.Inspector.Controls()[1]
		local keyboard = first.psHomeKeyboard and first.psHomeKeyboard:IsShown()
		stub.RunScript(H.Frame, "OnKeyDown", "ESCAPE")
		emit({ opened = opened, returned = returned, back = back, keyboard = keyboard, source = b.psHomeKeyboard and b.psHomeKeyboard:IsShown(), calls = uistub.calls })`, { gamepad: true });
	assert.equal(out.opened, true);
	assert.equal(out.returned, true);
	assert.equal(out.back, true);
	assert.equal(out.keyboard, true);
	assert.equal(out.source, true);
	assert.deepEqual(out.calls, {});
});

test('real talent plan inspector uses authoritative picks and opens that build without allocating points', () => {
	const [out] = runAddon({
		stubs: ['stub_world.lua', 'stub_talents.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml', 'Talents/Talents.xml'] }],
		script: `local T, UI = Polestar.Talents, Polestar.UI
		local tree = T.Data("PALADIN")
		stub.talents.useSnapshot(tree)
		stub.login()
		T.Refresh()
		UI.ShowPicker({ section = "Home" })
		local H = UI.HomeSection
		H.Dashboard[2].Inspect:Click()
		local context, current = H.Inspector.Context, T.Current()
		local choice = T.Choice()
		local picks
		for _, tab in ipairs(context.tabs) do if tab.key == "picks" then picks = tab.rows end end
		local title, selected = H.Inspector.Title:GetText(), H.SelectedContext()
		H.Inspector.Action:Click()
		emit({ title = title, expected = current.build.specName, key = selected.id, expectedKey = current.build.key,
			picks = #picks, expectedPicks = #current.build.picks, first = picks[1], expectedFirst = "1. " .. T.PickText(tree, current.build.picks[1], current.valid),
			choice = T.Choice() == choice, destination = UI.Picker.Section(), shown = UI.TalentsSection.Nav() })`,
	}).emitted;
	assert.equal(out.title, out.expected);
	assert.equal(out.key, out.expectedKey);
	assert.equal(out.picks, out.expectedPicks);
	assert.equal(out.first, out.expectedFirst);
	assert.equal(out.choice, true);
	assert.equal(out.destination, 'Talents');
});

test('real Engine state remains identical through inspector selection, tabs and dismissal', () => {
	const [before, after] = runAddon({
		stubs: ['stub_world.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		saved: { Polestar: 'PolestarDB = { schema = 1, welcomeSeen = 1, settings = { behavior = { autoSelectGuide = false } } }; PolestarCharDB = { schema = 1, welcomeSeen = 1 }' },
		login: true,
		script: `${TEST_PACK}
		Polestar.RegisterGuide({ id = "test/inspector", pack = "test", title = "Fixture guide", steps = {
			{ title = "Live", goals = { { t = "level", level = 60 } } },
			{ title = "Browsed", goals = { { t = "level", level = 60 } } },
		} })
		local E, UI = Polestar.Engine, Polestar.UI
		E.SetGuide("test/inspector"); E.Goto(2)
		local target = { map = 1429, x = 40, y = 50, label = "Manual" }
		Polestar.Nav = { GetTarget = function() return target end, GetDistance = function() return nil end }
		UI.ShowPicker({ section = "Home" })
		local function state()
			return { tabs = { E.GetTabs() }, current = E.GetStepIndex(), live = E.GetLiveStep(), progress = { E.GetProgress() },
				saved = Polestar.CharState().guides, target = Polestar.Nav.GetTarget() }
		end
		emit(state())
		UI.HomeSection.Hero.Inspect:Click()
		UI.HomeSection.Inspector.SelectTab("overview")
		UI.HomeSection.Inspector.Close:Click()
		emit(state())`,
	}).emitted;
	assert.equal(before.current, 2);
	assert.equal(before.live, 1);
	assert.deepEqual(after, before);
});

test('guide tabs filter character restrictions and omit unavailable rewards, quests and route facts', () => {
	const [out] = run(`
		local g = uistub.guides[uistub.tailoring]
		g.steps = { { title = "Fixture", only = { class = "MAGE" }, goals = { { quest = 7, map = 1429 } } } }
		Polestar.Guides.Matches = function(only, player) return not only.class or only.class == player.class end
		uistub.suggestions = { uistub.tailoring }
		UI.ShowPicker()
		H.SelectContext("guide", uistub.tailoring)
		local denied = tabs()
		g.steps[1].only = nil
		g.steps[1].goals[1].only = { class = "MAGE" }
		Polestar.Fire("GUIDES_REGISTERED")
		stub.advance(0.01)
		local goalDenied = tabs()
		g.steps[1].goals[1].only = nil
		Polestar.Fire("GUIDES_REGISTERED")
		stub.advance(0.01)
		emit({ denied = denied, goalDenied = goalDenied, available = tabs(), calls = uistub.calls })`);
	assert.deepEqual(out.denied, ['overview']);
	assert.deepEqual(out.goalDenied, ['overview']);
	assert.deepEqual(out.available, ['overview', 'quests', 'route']);
	assert.deepEqual(out.calls, {});
});

test('hidden inspector content reads coalesce on return; changed talent identity is unavailable', () => {
	const [out] = run(`
		local key, reads = "fixture/one", 0
		Polestar.Talents = { Current = function() return { build = { key = key, specName = "Fixture" } } end }
		UI.ShowPicker()
		H.Dashboard[2].Inspect:Click()
		local get = Polestar.Guides.Get
		Polestar.Guides.Get = function(id) reads = reads + 1; return get(id) end
		P.ShowSection("Guides")
		local before = reads
		key = "fixture/two"
		for i = 1, 5 do Polestar.Fire("TALENTS_UPDATED") end
		stub.advance(0.01)
		local hidden = reads == before
		P.ShowSection("Home")
		emit({ hidden = hidden, empty = H.Inspector.Context.empty, key = H.SelectedContext().id, action = H.Inspector.Primary:IsShown() })`);
	assert.equal(out.hidden, true);
	assert.equal(out.empty, true);
	assert.equal(out.key, 'fixture/one');
	assert.equal(out.action, false);
});

test('planned build remains inspectable without live progress, and disabled talents stay unavailable', () => {
	const [out] = run(`
		local reason = "loading"
		Polestar.Talents = {
			Current = function() return nil, reason end,
			Data = function() return { summary = "Fixture plan description" } end,
			ActiveBuild = function() return { key = "fixture", specName = "Fixture spec" } end,
		}
		UI.ShowPicker()
		H.Dashboard[2].Inspect:Click()
		local rows = H.Inspector.Context.tabs[1].rows
		local r = { title = H.Inspector.Title:GetText(), rows = rows }
		reason = "off"
		Polestar.Fire("TALENTS_UPDATED")
		stub.advance(0.01)
		r.empty = H.Inspector.Context.empty
		emit(r)`);
	assert.equal(out.title, 'Fixture spec');
	assert.ok(out.rows.includes('Fixture plan description'));
	assert.ok(out.rows.includes('Live talent progress is unavailable.'));
	assert.equal(out.empty, true);
});
