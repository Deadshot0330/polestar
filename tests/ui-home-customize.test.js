'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');

const defaults = ['build', 'dungeon', 'upcoming', 'training', 'gear', 'rares'];
function run(script, { saved, gamepad = false } = {}) {
	return runAddon({
		stubs: gamepad ? ['stub_ui.lua', 'stub_gamepad.lua'] : ['stub_ui.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		saved,
		script: `uistub.install(); stub.login()
		local UI, H, C, P = Polestar.UI, Polestar.UI.HomeSection, Polestar.UI.HomeCustomize, Polestar.UI.Picker
		local function flush() stub.advance(0.01) end
		local function order()
			local list = {}; for _, spec in ipairs(C.Read()) do list[#list + 1] = spec.key end; return list
		end
		local function position(f) local anchor, _, _, x, y = f:GetPoint(1); return { anchor = anchor, x = x, y = y, w = f:GetWidth(), h = f:GetHeight() } end
		local function open() UI.ShowPicker({ section = "Home" }); H.Header.Customize:Click() end
		${script}`,
	}).emitted;
}

test('Customize Home opens a pooled conventional editor below the always-visible Continue card without changing gameplay', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		Polestar.Nav.SetTarget(1429, 20, 30, "Manual")
		uistub.calls = {}
		open()
		local r = { order = order(), shown = H.Customizer:IsShown(), hero = position(H.Hero), editor = position(H.Customizer),
			rows = #H.Customizer.Controls(), target = Polestar.Nav.GetTarget().label, calls = uistub.calls }
		local first = H.Customizer.rows.build
		H.Customizer.Done:Click(); H.Header.Customize:Click()
		r.pooled, r.heroVisible = H.Customizer.rows.build == first, H.Hero.Action:IsVisible()
		emit(r)`);
	assert.deepEqual(out.order, defaults);
	assert.equal(out.shown, true);
	assert.ok(out.editor.y < out.hero.y - out.hero.h);
	assert.equal(out.rows, 18); // six visibility controls, ten valid moves, reset/done
	assert.equal(out.target, 'Manual');
	assert.deepEqual(out.calls, {});
	assert.equal(out.pooled, true);
	assert.equal(out.heroVisible, true);
});

test('visibility changes reclaim card space and hiding the selected card dismisses its inspector', () => {
	const [out] = run(`
		open(); H.Dashboard[2].Inspect:Click()
		local before = H.Dashboard[4]:GetTop()
		H.Customizer.rows.build.Visible:Click()
		local r = { hidden = not H.Dashboard[2]:IsShown(), inspector = H.Inspector:IsShown(), selection = H.SelectedContext(),
			shown = Polestar.Get("home.layout").hidden.build, hero = H.Hero.Action:IsVisible() }
		H.Customizer.rows.build.Visible:Click()
		r.restored = H.Dashboard[2]:IsShown()
		emit(r)`);
	assert.equal(out.hidden, true);
	assert.equal(out.inspector, false);
	assert.equal(out.selection, undefined);
	assert.equal(out.shown, true);
	assert.equal(out.hero, true);
	assert.equal(out.restored, true);
});

test('optional cards reorder across supporting and compact cards, retain frame identity and keep exact visual order', () => {
	const [out] = run(`
		open(); local build = H.Dashboard[2]
		for i = 1, 5 do H.Customizer.rows.rares.Up:Click() end
		H.Customizer.rows.build.Down:Click()
		H.Customizer.Done:Click()
		PolestarPicker:SetWidth(1100 + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side); H.Render()
		local visual = {}
		for i = 2, 7 do local p = position(H.Dashboard[i]); p.key = H.Dashboard[i].psSpec.key; visual[#visual + 1] = p end
		table.sort(visual, function(a, b) return a.y > b.y or a.y == b.y and a.x < b.x end)
		local actual = {}; for _, p in ipairs(visual) do actual[#actual + 1] = p.key end
		emit({ order = order(), visual = actual, same = build == H.Dashboard[2], upper = H.Customizer.rows.rares.Up:IsEnabled() })`);
	assert.deepEqual(out.order, ['rares', 'dungeon', 'build', 'upcoming', 'training', 'gear']);
	assert.deepEqual(out.visual, out.order);
	assert.equal(out.same, true);
	assert.equal(out.upper, false);
});

test('restore defaults resets only the Home arrangement and keeps character progress and other settings', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		Polestar.Set("ui.menuScale", 1.2)
		open(); H.Customizer.rows.gear.Visible:Click(); H.Customizer.rows.dungeon.Up:Click()
		H.Customizer.Reset:Click()
		local visible = {}; for i = 2, 7 do visible[#visible + 1] = H.Dashboard[i]:IsShown() end
		emit({ order = order(), visible = visible, saved = Polestar.DB().settings.home.layout,
			scale = Polestar.Get("ui.menuScale"), current = Polestar.Engine.GetStepIndex(), calls = uistub.calls })`);
	assert.deepEqual(out.order, defaults);
	assert.ok(out.visible.every(Boolean));
	assert.equal(out.saved, undefined);
	assert.equal(out.scale, 1.2);
	assert.equal(out.current, 3);
	assert.deepEqual(out.calls, {});
});

test('malformed and old settings normalize without writing or mutating defaults; Continue cannot be hidden', () => {
	const [out] = run(`
		local raw = { order = { "rares", "bad-key", "rares", false, "gear" }, hidden = { continue = true, build = true, bogus = true } }
		Polestar.Set("home.layout", raw)
		UI.ShowPicker()
		emit({ order = order(), same = raw == Polestar.Get("home.layout"), rawCount = #raw.order,
			default = Polestar.GetDefault("home.layout").order, hero = H.Hero.Action:IsVisible(), build = H.Dashboard[2]:IsVisible() })`);
	assert.deepEqual(out.order, ['rares', 'gear', 'build', 'dungeon', 'upcoming', 'training']);
	assert.equal(out.same, true);
	assert.equal(out.rawCount, 5);
	assert.deepEqual(out.default, defaults);
	assert.equal(out.hero, true);
	assert.equal(out.build, false);
});

test('saved arrangement is account-wide and survives loading for a different character', () => {
	const saved = { Polestar: 'PolestarDB = { schema = 1, settings = { home = { layout = { order = { "gear", "build" }, hidden = { dungeon = true } } } } }; PolestarCharDB = { schema = 1, home = { hidden = { gear = true } } }' };
	const [out] = run(`UI.ShowPicker(); emit({ order = order(), gear = H.Dashboard[6]:IsShown(), dungeon = H.Dashboard[3]:IsShown() })`, { saved });
	assert.equal(out.order[0], 'gear');
	assert.equal(out.gear, true);
	assert.equal(out.dungeon, false);
});

test('all optional cards can be hidden while Choose a Guide and Customize remain reachable', () => {
	const [out] = run(`
		open(); for _, row in pairs(H.Customizer.rows) do row.Visible:Click() end
		H.Customizer.Done:Click()
		local hidden = true; for i = 2, 7 do hidden = hidden and not H.Dashboard[i]:IsShown() end
		local r = { hidden = hidden, hero = H.Hero.Action:IsVisible(), label = H.Hero.Action.Label:GetText(), customize = H.Header.Customize:IsVisible() }
		H.Hero.Inspect:Click(); r.emptyTitle = H.Inspector.Title:GetText()
		H.Hero.Action:Click(); r.section = P.Section()
		emit(r)`);
	assert.equal(out.hidden, true);
	assert.equal(out.hero, true);
	assert.equal(out.label, 'Choose a Guide');
	assert.equal(out.customize, true);
	assert.equal(out.emptyTitle, 'Choose a Guide');
	assert.equal(out.section, 'Guides');
});

test('keyboard can customize, move a card and Escape back to the header without loading a guide', () => {
	const [out] = run(`
		UI.ShowPicker()
		for i = 1, 80 do
			stub.RunScript(H.Frame, "OnKeyDown", "TAB")
			if H.Header.Customize.psHomeKeyboard and H.Header.Customize.psHomeKeyboard:IsShown() then break end
		end
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		local r = { open = H.Customizer:IsShown(), first = H.Customizer.rows.build.Visible.psHomeKeyboard:IsShown() }
		stub.RunScript(H.Frame, "OnKeyDown", "TAB") -- first row's enabled move-down
		stub.RunScript(H.Frame, "OnKeyDown", "ENTER")
		r.order = order()
		stub.RunScript(H.Frame, "OnKeyDown", "ESCAPE")
		r.closed, r.focused, r.calls = not H.Customizer:IsShown(), H.Header.Customize.psHomeKeyboard:IsShown(), uistub.calls
		emit(r)`);
	assert.equal(out.open, true);
	assert.equal(out.first, true);
	assert.equal(out.order[0], 'dungeon');
	assert.equal(out.closed, true);
	assert.equal(out.focused, true);
	assert.deepEqual(out.calls, {});
});

test('gamepad can show/hide and move cards; B closes customization and retains Home', () => {
	const [out] = run(`
		Polestar.Set("gamepad.withMouse", true); UI.ShowPicker(); stub.press("PADDDOWN")
		local G = Polestar.Gamepad
		G.SetFocus(PolestarPicker, H.Header.Customize); stub.press("PAD1")
		local r = { first = G.Focused(PolestarPicker) == H.Customizer.rows.build.Visible }
		stub.press("PAD1"); r.hidden = not H.Dashboard[2]:IsShown()
		G.SetFocus(PolestarPicker, H.Customizer.rows.build.Down); stub.press("PAD1")
		r.order = order()
		stub.press("PAD2")
		r.closed, r.hub, r.focus = not H.Customizer:IsShown(), PolestarPicker:IsShown(), G.Focused(PolestarPicker) == H.Header.Customize
		emit(r)`, { gamepad: true });
	assert.equal(out.first, true);
	assert.equal(out.hidden, true);
	assert.equal(out.order[0], 'dungeon');
	assert.equal(out.closed, true);
	assert.equal(out.hub, true);
	assert.equal(out.focus, true);
});

test('hidden optional providers are not read and arrangement-only changes reuse the snapshot', () => {
	const [out] = run(`
		UI.ShowPicker()
		local reads = 0
		local original = UI.HomeOpportunities.Read
		UI.HomeOpportunities.Read = function(...) reads = reads + 1; return original(...) end
		H.Header.Customize:Click(); H.Customizer.rows.build.Down:Click(); H.Customizer.Done:Click()
		local r = { arrangement = reads }
		local hidden = {}; for _, spec in ipairs(C.Cards) do hidden[spec.key] = true end
		Polestar.Set("home.layout", { hidden = hidden })
		Polestar.Dungeons = { ForPlayer = function() error("hidden dungeon read") end }
		Polestar.Talents = { Current = function() error("hidden talents read") end }
		Polestar.Engine.TrainingStatus = function() error("hidden training read") end
		Polestar.Gear = { RankChoices = function() error("hidden gear read") end }
		Polestar.Rares = { NearbyRecords = function() error("hidden rare read") end }
		Polestar.Fire("STEP_UPDATED"); flush()
		r.visible = reads
		PolestarPicker:Hide(); Polestar.Fire("GEAR_UPDATED"); flush()
		r.hidden = reads; emit(r)`);
	assert.equal(out.arrangement, 0);
	assert.equal(out.visible, 1);
	assert.equal(out.hidden, 1);
});

test('dismissed inspector defers content resolution until reopened; skin changes reuse provider snapshots', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3); UI.ShowPicker(); H.Hero.Inspect:Click(); H.Inspector.Close:Click()
		local resolved, reads = 0, 0
		local resolve, read = UI.HomeContent.Resolve, UI.HomeOpportunities.Read
		UI.HomeContent.Resolve = function(...) resolved = resolved + 1; return resolve(...) end
		UI.HomeOpportunities.Read = function(...) reads = reads + 1; return read(...) end
		Polestar.Fire("STEP_UPDATED"); flush()
		local r = { dismissed = resolved, data = reads }
		Polestar.Set("ui.skin", "halo"); flush(); r.themed = reads
		H.Header.Toggle:Click(); r.reopened = resolved
		emit(r)`);
	assert.equal(out.dismissed, 0);
	assert.equal(out.data, 1);
	assert.equal(out.themed, 1);
	assert.equal(out.reopened, 1);
});

test('supporting-card actions align at their row foot and card/inspector artwork has native fallbacks', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		Polestar.Talents = { Current = function() return { build = { key = "fixture", title = string.rep("Long plan ", 15) } } end }
		UI.RegisterSection({ key = "Talents", build = function() end, render = function() end })
		UI.ShowPicker()
		local function failCustom(texture)
			local original = texture.SetTexture
			texture.SetTexture = function(self, path) if path:find("AddOns", 1, true) then return false end; return original(self, path) end
		end
		failCustom(H.Hero.Icon); failCustom(H.Inspector.Emblem)
		H.Hero.Inspect:Click()
		emit({ a = position(H.Dashboard[2].Action), b = position(H.Dashboard[3].Action),
			aHeight = H.Dashboard[2]:GetHeight(), bHeight = H.Dashboard[3]:GetHeight(),
			card = H.Hero.Icon:GetTexture(), inspector = H.Inspector.Emblem:GetTexture() })`);
	assert.equal(out.aHeight, out.bHeight);
	assert.equal(out.a.anchor, 'BOTTOMLEFT');
	assert.equal(out.b.anchor, 'BOTTOMLEFT');
	assert.equal(out.a.y, out.b.y);
	assert.match(out.card, /INV_Misc_QuestionMark$/);
	assert.match(out.inspector, /INV_Misc_QuestionMark$/);
});

test('short wide windows use a usable inline inspector and gamepad focus reveals its fixed primary action', () => {
	const [out] = run(`
		uistub.setGuide(uistub.elwynn, 3)
		Polestar.Set("gamepad.withMouse", true); UI.ShowPicker(); stub.press("PADDDOWN")
		PolestarPicker:SetHeight(360); H.Hero.Inspect:Click()
		local G, I = Polestar.Gamepad, H.Inspector
		G.SetFocus(PolestarPicker, I.Action)
		local localY, height = I.Reveal(I.Action)
		local r = { inline = I:GetParent() == H.Scroll.Child, body = I.Body.psView,
			at = H.Scroll:GetVerticalScroll(), top = I.psHomeY + localY, height = height, view = H.Scroll.psView,
			selected = H.SelectedContext().id, shown = PolestarPicker:IsShown() }
		emit(r)`, { gamepad: true });
	assert.equal(out.inline, true);
	assert.ok(out.body >= 60);
	assert.ok(out.top >= out.at);
	assert.ok(out.top + out.height <= out.at + out.view);
	assert.equal(out.shown, true);
	assert.equal(out.selected, 'forever/alliance/human/01-elwynn-forest');
});
