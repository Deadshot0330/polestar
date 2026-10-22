'use strict';
// The guide menu's levels chip (addon/Polestar/UI/Picker.lua, UI/LevelTip.lua):
// what a leveling guide's turn-ins are worth to this character
// (Levels.ForGuide), their XP from the Codex, and the panel its hover opens,
// which follows the theme: a new accent, font or skin repaints the chip and
// lays the open panel out again. The character: stub_ui.lua's level 4 Human
// Warrior, 1,200 of 2,100 XP into the level.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');
const { writeCodexPack, sampleCodex } = require('./helpers/codex');

const FILES = ['Core/Core.xml', 'Theme/Theme.xml', 'Gear/Gear.xml', 'Lookup/Lookup.xml', 'UI/UI.xml'];
const ELWYNN = 'forever/alliance/human/01-elwynn-forest';

// The sample Codex with the Elwynn guide's three turn-ins and its two kill
// goals' mobs (sample numbers).
let pack;
before(() => {
	const codex = sampleCodex();
	const quest = (id, title, level, xp) => ({ ...codex.quests[33], id, title, level, minLevel: 1, objectives: [], xp });
	codex.quests[783] = quest(783, 'A Threat Within', 1, 400);
	codex.quests[7] = quest(7, 'Kobold Camp Cleanup', 2, 450);
	const npc = (id, name, level) => ({ id, name, level, levelMax: null, faction: null, rare: false, elite: false, boss: false, instance: null, roles: [], loot: [], spawns: [] });
	codex.npcs[6] = npc(6, 'Kobold Vermin', 2);
	codex.npcs[257] = npc(257, 'Kobold Worker', 4);
	pack = writeCodexPack(codex);
});
after(() => pack && pack.cleanup());

function run(script, { withPack = true } = {}) {
	return runAddon({
		stubs: ['stub_ui.lua'],
		before: withPack ? pack.stubLua : '',
		addons: [{ name: 'Polestar', files: FILES }],
		script: `uistub.install()
stub.login()
uistub.player.xp, uistub.player.xpMax = 1200, 2100
local P, LT = Polestar.UI.Picker, Polestar.UI.LevelTip
local function rgb(r, g, b) return { math.floor(r * 255 + 0.5), math.floor(g * 255 + 0.5), math.floor(b * 255 + 0.5) } end
local function hover(c) c:GetScript("OnEnter")(c) end
${script}`,
	}).emitted;
}

test('a leveling guide: the chip after its levels says what its turn-ins are worth; hovering it opens the panel', () => {
	const [out] = run(`
		Polestar.UI.ShowPicker({ section = "Guides", view = "browse" })
		P.Select("${ELWYNN}")
		local d = P.details
		local chip = { d.XP:IsShown(), d.XP.Text:GetText() }
		local _, _, _, cx = d.XP:GetPoint(1)
		local _, _, _, lx = d.Chips[1]:GetPoint(1)
		hover(d.XP)
		local t = LT.Frame()
		local cells = 0
		for _, c in ipairs(t.Cells) do if c:IsShown() then cells = cells + 1 end end
		emit({ chip = chip, after = cx > lx, levels = d.Chips[1].Text:GetText(),
			tip = { t:IsShown(), t:GetParent() == PolestarPicker, t.Head:GetText(), t.Levels:GetText(), t.XP:GetText(), t.Now:GetText(), t.Then:GetText(), t.Notes:GetText(), cells } })`);
	// In route order from 1,200 into 4: A Threat Within 400, a level 2 Vermin 39,
	// Kobold Camp Cleanup 450, Wolves Across the Border 250 (over 2,100: level 5,
	// 239 in), a level 4 Worker at 5: 56. 1,195 XP, 295 into 5 of 2,800.
	assert.deepEqual(out.chip, [true, '+53% of a level']);
	assert.equal(out.after, true, 'the chip follows the Levels chip');
	assert.match(out.levels, /^Levels /);
	assert.deepEqual(out.tip, [true, true, 'If you finish this guide', '+53% of a level', '1,195 XP',
		'Now: 57% into level 4', 'After: 10% into level 5',
		'3 quests for you, not done yet.\n1,100 XP from quests, about 95 from 2 kills the guide asks for.', 2]);
});

test('below the guide\'s level: the chip says the recommended level, the panel says so first and sums from there', () => {
	const [out] = run(`
		uistub.guides["${ELWYNN}"].minLevel = 6
		Polestar.UI.ShowPicker({ section = "Guides", view = "browse" })
		P.Select("${ELWYNN}")
		local d = P.details
		hover(d.XP)
		local t = LT.Frame()
		emit({ chip = d.XP.Text:GetText(), chipColor = rgb(d.XP.Text:GetTextColor()), warning = rgb(Polestar.Theme.Color("warning")),
			need = t.Need:IsShown() and t.Need:GetText(), needColor = rgb(t.Need:GetTextColor()), now = t.Now:GetText(), first = t.Marks[1]:GetText() })`);
	assert.equal(out.chip, 'Recommended: level 6');
	assert.deepEqual(out.chipColor, out.warning, 'in the warning colour');
	assert.equal(out.need, 'You are level 4. Level 6 is recommended for this guide; from there:');
	assert.deepEqual(out.needColor, out.warning);
	assert.equal(out.now, 'Start: level 6');
	assert.equal(out.first, '6', 'the bar starts at the guide\'s level');
});

test('no chip without the Codex, for a guide that is not leveling, or with nothing selected', () => {
	const [none] = run(`
		Polestar.UI.ShowPicker({ section = "Guides", view = "browse" })
		P.Select("${ELWYNN}")
		emit(P.details.XP:IsShown())`, { withPack: false });
	assert.equal(none, false, 'no Codex: nothing to count');
	const [other] = run(`
		Polestar.UI.ShowPicker({ section = "Guides", view = "browse" })
		P.Select("forever/professions/tailoring")
		emit(P.details.XP:IsShown())`);
	assert.equal(other, false, 'a profession guide has no levels chip');
	const [off] = run(`
		Polestar.Set("lookup.enabled", false)
		local loads, load = 0, Polestar.Codex.Load
		Polestar.Codex.Load = function(...) loads = loads + 1; return load(...) end
		Polestar.UI.ShowPicker({ section = "Guides", view = "browse" })
		P.Select("${ELWYNN}")
		emit({ shown = P.details.XP:IsShown(), loads = loads })`);
	assert.deepEqual(off, { shown: false, loads: 0 }, 'Lookup turned off: the Codex is Lookup\'s, nothing loads it');
});

test('the theme is followed: a new accent, font and skin repaint the chip and lay the open panel out again', () => {
	const [before, after] = run(`
		Polestar.UI.ShowPicker({ section = "Guides", view = "browse" })
		P.Select("${ELWYNN}")
		local d = P.details
		hover(d.XP)
		local t = LT.Frame()
		local function look()
			local font, size = t.Levels:GetFont()
			return { accent = rgb(Polestar.Theme.Accent()), chipText = rgb(d.XP.Text:GetTextColor()), levels = rgb(t.Levels:GetTextColor()),
				gain = rgb(t.Cells[1].Gain:GetVertexColor()), ground = rgb(t.Ground:GetVertexColor()), panel = rgb(Polestar.Theme.Color("panel")),
				font = font, size = size, width = t:GetWidth(), height = t:GetHeight(), shown = t:IsShown() }
		end
		emit(look())
		Polestar.Set("ui.accent", { 0.2, 0.8, 0.4 })
		Polestar.Set("ui.scheme", "graphite")
		Polestar.Set("ui.font", "inter")
		Polestar.Set("ui.skin", "halo")
		emit(look())`);
	for (const look of [before, after]) {
		assert.deepEqual(look.chipText, look.accent, 'the chip is in the accent');
		assert.deepEqual(look.levels, look.accent, 'the levels line is in the accent');
		assert.deepEqual(look.gain, look.accent, 'the bar\'s gain is in the accent');
		assert.deepEqual(look.ground, look.panel, 'the ground is the scheme\'s panel');
	}
	assert.deepEqual(after.accent, [51, 204, 102], 'your own accent');
	assert.notDeepEqual(after.ground, before.ground, 'the scheme\'s ground');
	assert.notEqual(after.font, before.font, 'the chosen font');
	assert.equal(after.shown, true, 'the open panel stays open, laid out again');
});
