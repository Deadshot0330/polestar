'use strict';
// Shared hub/Options rail: seven top entries plus Import and Options, using
// stand-ins for future sections without adding them to the shipped addon.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');
const { fakeLocale } = require('./helpers/locale');

const SKINS = ['polestar', 'halo', 'hearth', 'forever', 'blizzard', 'classic'];
const HELPERS = `
local UI, W = Polestar.UI, Polestar.Widgets
local P = UI.Picker
local function fillRail(count)
	while #P.RailItems() < count do
		local i = #P.RailItems() + 1
		UI.RegisterSection({ key = "Extra" .. i, label = "Additional destination " .. i, icon = "compact", order = 100 + i,
			build = function() end, render = function() end })
	end
end
local function button(f, key)
	for _, b in ipairs(f.railButtons) do if b:IsShown() and b.psKey == key then return b end end
end
local function measure(f)
	local top, foot = {}, {}
	local feet = {}
	for _, item in ipairs(P.FootItems()) do feet[item.key] = true end
	for _, b in ipairs(f.railButtons) do
		if b:IsShown() then
			local _, _, _, _, y = b:GetPoint(1)
			local _, _, _, _, iconY = b.Icon:GetPoint(1)
			local _, _, _, _, labelY = b.Label:GetPoint(1)
			local h = b:GetHeight()
			local item = { key = b.psKey, h = h, top = feet[b.psKey] and f:GetHeight() - 2 - y - h or -y,
				labelBottom = -iconY + b.Icon:GetHeight() - labelY + b.Label:GetStringHeight(),
				labelWidth = b.Label:GetUnboundedStringWidth(), width = b.Label:GetWidth(),
				selected = b.Selected:IsShown(), bar = b.Bar:IsShown(), icon = b.Icon:GetTexture() }
			local list = feet[b.psKey] and foot or top
			list[#list + 1] = item
		end
	end
	local keys = {}
	for i, item in ipairs(P.RailItems()) do keys[i] = item.key end
	return { top = top, foot = foot, keys = keys, height = f:GetHeight(), navTop = f.psNavTop, scale = f:GetScale() }
end
`;

function run(script, { before = '', gamepad = false } = {}) {
	return runAddon({
		stubs: gamepad ? ['stub_ui.lua', 'stub_gamepad.lua'] : ['stub_ui.lua'],
		before,
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		script: `uistub.install()\nstub.login()\n${HELPERS}\n${script}`,
	}).emitted;
}

function assertFit(rail, count, active) {
	assert.equal(rail.top.length, count, 'every top destination is visible');
	assert.deepEqual(rail.top.map((b) => b.key), rail.keys.slice(0, count), 'navigation order is retained');
	assert.deepEqual(rail.foot.map((b) => b.key), ['Options', 'Import']);
	const footTop = Math.min(...rail.foot.map((b) => b.top));
	let end = rail.navTop;
	for (const b of rail.top) {
		assert.equal(b.top, end, `${b.key}: rows are contiguous`);
		end = b.top + b.h;
		assert.ok(b.labelBottom <= b.h, `${b.key}: icon and label fit the hit area`);
		assert.ok(b.labelWidth <= b.width, `${b.key}: label fits the rail width`);
		assert.equal(b.selected, b.key === active);
		assert.equal(b.bar, b.key === active);
		assert.ok(b.icon, `${b.key}: icon retained`);
	}
	assert.ok(end <= footTop, `top rows end at ${end}, footer begins at ${footTop}`);
	for (const b of rail.foot) {
		assert.equal(b.h, 56, 'footer hit areas keep their original size');
		assert.equal(b.selected, b.key === active);
	}
}

for (const skin of SKINS) {
	test(`${skin}: seven destinations fit the hub and Options; five keep their existing layout`, () => {
		const [out] = run(`
			Polestar.Set("ui.skin", "${skin}")
			fillRail(5)
			UI.ShowPicker()
			local five = measure(PolestarPicker)
			UI.ShowOptions("appearance")
			local fiveOptions = measure(PolestarOptions)
			UI.ShowPicker()
			fillRail(7)
			local seven = measure(PolestarPicker)
			local last = P.RailItems()[7].key
			button(PolestarPicker, last):Click()
			local picked = P.Section()
			button(PolestarPicker, "Options"):Click()
			local options = measure(PolestarOptions)
			button(PolestarOptions, last):Click()
			local back = P.Section() == last and PolestarPicker:IsShown() and not PolestarOptions:IsShown()
			button(PolestarPicker, "Import"):Click()
			emit({ five = five, fiveOptions = fiveOptions, seven = seven, options = options,
				picked = picked, last = last, back = back, import = P.Section() })`);
		assert.equal(out.seven.height, skin === 'polestar' ? 680 : 640);
		assert.equal(out.options.height, skin === 'polestar' ? 680 : 690);
		assertFit(out.five, 5, 'Guides');
		assertFit(out.fiveOptions, 5, 'Options');
		assertFit(out.seven, 7, 'Guides');
		assertFit(out.options, 7, 'Options');
		assert.ok(out.five.top.every((b) => b.h === 56));
		assert.ok(out.seven.top.every((b) => b.h === (skin === 'polestar' ? 56 : 55)));
		assert.ok(out.options.top.every((b) => b.h === 56));
		assert.equal(out.picked, out.last);
		assert.equal(out.back, true);
		assert.equal(out.import, 'Import');
	});
}

for (const initial of ['polestar', 'halo']) {
	test(`rail fit follows retained window dimensions across live skin switches (built in ${initial})`, () => {
		const samples = run(`
			Polestar.Set("ui.skin", "${initial}")
			fillRail(7)
			UI.ShowPicker()
			UI.ShowOptions("appearance")
			for _, skin in ipairs({ "polestar", "halo", "hearth", "forever", "blizzard", "classic", "polestar" }) do
				Polestar.Set("ui.skin", skin)
				UI.ShowPicker()
				local hub = measure(PolestarPicker)
				UI.ShowOptions("appearance")
				emit({ hub = hub, options = measure(PolestarOptions) })
			end`);
		for (const { hub, options } of samples) {
			assert.equal(hub.height, initial === 'polestar' ? 680 : 640);
			assertFit(hub, 7, 'Guides');
			assertFit(options, 7, 'Options');
		}
	});
}

test('short-hub rail fits long translated labels at supported menu scales and restores pooled row heights', () => {
	const samples = run(`
		Polestar.Set("ui.skin", "halo")
		fillRail(7)
		UI.ShowPicker()
		for _, scale in ipairs({ 0.7, 1, 1.4 }) do
			Polestar.Set("ui.menuScale", scale)
			P.Render()
			emit(measure(PolestarPicker))
		end
		local items = P.RailItems()
		while #items > 5 do table.remove(items) end
		W.ShellRail(PolestarPicker, items, P.FootItems(), "Guides")
		emit(measure(PolestarPicker))
		P.Render()
		emit(measure(PolestarPicker))`, {
		before: fakeLocale('itIT', { Guides: 'Ausführliche Anleitungen', Lookup: 'Nachschlagen', Dungeons: 'Verliesübersicht', Import: 'Anleitungen importieren', Options: 'Einstellungen' }),
	});
	for (const [i, scale] of [0.7, 1, 1.4].entries()) {
		assertFit(samples[i], 7, 'Guides');
		assert.equal(samples[i].scale, scale);
	}
	assertFit(samples[3], 5, 'Guides');
	assert.ok(samples[3].top.every((b) => b.h === 56), 'pooled top buttons grow back');
	assertFit(samples[4], 7, 'Guides');
});

test('gamepad shoulders reach all seven sections and the final rail button remains actionable', () => {
	const [out] = run(`
		Polestar.Set("ui.skin", "halo")
		Polestar.Set("gamepad.withMouse", true)
		fillRail(7)
		UI.ShowPicker()
		stub.advance(0.3)
		local visited = { P.Section() }
		for i = 2, #P.Sections() do
			stub.press("PADRSHOULDER")
			stub.advance(0.1)
			visited[#visited + 1] = P.Section()
		end
		local last = button(PolestarPicker, P.RailItems()[7].key)
		-- A D-pad input settles player focus after the section's initial focus.
		stub.press("PADDDOWN")
		Polestar.Gamepad.SetFocus(PolestarPicker, last)
		local focused = Polestar.Gamepad.Focused(PolestarPicker) == last
		stub.press("PAD1")
		local selected = P.Section()
		for i = 2, #P.Sections() do
			stub.press("PADLSHOULDER")
			stub.advance(0.1)
		end
		emit({ rail = measure(PolestarPicker), visited = visited, focused = focused, selected = selected, back = P.Section() })`, { gamepad: true });
	assert.equal(out.back, 'Guides');
	assertFit(out.rail, 7, 'Guides');
	assert.deepEqual(out.visited.filter((key) => key !== 'Import'), out.rail.keys);
	assert.equal(out.focused, true);
	assert.equal(out.selected, out.rail.keys[6]);
});
