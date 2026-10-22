'use strict';
// Text stays inside its window. Every scene of `node tools/polestar.js
// preview` that shows one of Polestar's windows (the guide window, the hub on
// each section, Options on every page and tab, the welcome, the route
// choice, the rare alert, the report window and the copy window) is laid out
// through the preview's frame dump, in the game font and in Inter, and every
// visible string is checked against its window's edges and the frames that
// clip it.
//
// In game the client's font sets text about 13% wider than the preview's
// Inter metrics predict, so every glyph is measured 15% wider than the
// preview draws it, by the Lua (GetStringWidth: what the UI sizes and fits
// by at runtime) and by the check alike. A string bound in width (two
// anchors or SetWidth) is cut or wrapped by the client, so only its box has
// to fit; a wrapping one may grow in height, and outside a scroll area that
// growth has to fit too.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');
const P = require('../tools/commands/preview');
const { audit, describe, fontsFor, PASSES } = require('../tools/preview/fit');
const { resolve } = require('../tools/preview/render');
const { fakeLocale } = require('./helpers/locale');

const SLACK = 1.15;
const WINDOWS = new Set(['PolestarGuideFrame', 'PolestarOptions', 'PolestarPicker', 'PolestarWelcome', 'PolestarRouteChoice', 'PolestarMenu', 'PolestarRareToast', 'PolestarReport', 'PolestarCopy']);

// The preview's fonts, every advance SLACK times wider.
const fonts = fontsFor(SLACK);
const prelude = P.metricsLua(fonts);

function auditPanels(label, panels) {
	const found = [];
	try {
		panels.forEach((p, i) => {
			for (const [font, prefix] of PASSES) {
				const dump = P.dumpPanel({ ...p, script: prefix + p.script }, prelude);
				for (const f of audit(dump, p.roots, fonts, ['window'])) found.push(`${label} #${i + 1} (${font}): ${describe(f)}`);
			}
		});
	} finally {
		P.cleanupPacks();
	}
	return found;
}

const windowed = P.SCENES.filter((s) => s.panels.every((p) => p.roots.every((r) => WINDOWS.has(r))));

for (const skin of ['polestar', 'halo', 'hearth', 'forever', 'blizzard', 'classic']) {
	test(`text fits: Home in ${skin}, including overflow and live skin switching`, () => {
		const script = `
			Polestar.Set("ui.skin", "${skin}")
			uistub.openTabs({ { uistub.elwynn, 3 }, { uistub.tailoring, 2 }, { uistub.stormwindRep, 2 } }, 1)
			Polestar.UI.ShowPicker({ section = "Home" })`;
		const panels = [
			{ roots: ['PolestarPicker'], script },
			{ roots: ['PolestarPicker'], script: script + '\nPolestar.Set("ui.skin", "halo")\nstub.advance(0.01)' },
			{ roots: ['PolestarPicker'], script: `Polestar.Set("ui.skin", "${skin}"); Polestar.UI.ShowPicker({ section = "Home" })` },
			{ roots: ['PolestarPicker'], script: script + `
				Polestar.Set("ui.menuScale", 1.4)
				uistub.guides[uistub.elwynn].title = string.rep("A long translated guide title ", 24)
				Polestar.Fire("STEP_UPDATED")
				stub.advance(0.01)` },
			{ roots: ['PolestarPicker'], script: script + `
				uistub.suggestions = { uistub.order[4] }
				uistub.guides[uistub.order[4]].title = string.rep("A long suggested guide title ", 30)
				Polestar.Fire("PACKS_CHANGED")
				stub.advance(0.01)
				local h = Polestar.UI.HomeSection
				PolestarPicker:SetWidth(800 + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side)
				PolestarPicker:SetHeight(360)
				h.Dashboard[4].Inspect:Click()` },
			{ roots: ['PolestarPicker'], script: script + `
				PolestarPicker:SetWidth(320 + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side)
				PolestarPicker:SetHeight(360)
				Polestar.UI.HomeSection.Render()` },
		];
		const inspect = script + `
			uistub.guides[uistub.elwynn].reward = { { text = "Fixture reward" } }
			Polestar.UI.HomeSection.Hero.Inspect:Click()`;
		const dungeon = script + `
			local D = Polestar.Dungeons
			D.ForPlayer = function() return {
				{ key = "fixture/one", name = "A long dungeon catalog name", minLevel = 15, maxLevel = 25, quests = { A = 8 },
					entrance = { map = 1429, x = 40, y = 50 } },
				{ key = "fixture/two", name = string.rep("An expanded translated dungeon name ", 5), minLevel = 17, maxLevel = 27, quests = { A = 3 } },
				{ key = "fixture/three", name = "Another dungeon", minLevel = 18, maxLevel = 28, quests = { A = 12 } },
			} end
			D.Quests = function() return { { id = 7, title = "A known dungeon quest", rewards = { xp = 120, items = {} } } } end
			Polestar.Fire("CODEX_LOADED"); stub.advance(0.01)
			Polestar.UI.HomeSection.Dashboard[3].Inspect:Click()`;
		const opportunities = script + `
			local E, G = Polestar.Engine, Polestar.Gear
			Polestar.ItemDB.Register({ schema = 1 }, { [9001] = "1 20 1 2 4 1 sta5", [9002] = "1 25 1 2 4 1 sta10" })
			Polestar.ItemDB.RegisterLeveling({ source = "fixture" }, {
				names = { [9001] = "A worn fixture helm", [9002] = string.rep("An expanded translated reward name ", 4) },
				quests = { [7] = "4 1 1 12 0 0 0|9002||A known fixture quest" },
			})
			G.Client.InventoryLink = function(slot) return slot == 1 and "item:9001" or nil end
			E.TrainingStatus = function() return { reminderDue = true, interval = 2, lastVisit = 2 } end
			Polestar.QoL = { Client = { Money = function() return 100 end }, Trainer = { Services = function() return {
				{ name = string.rep("An expanded translated ability name ", 4), rank = "Rank 2", status = "available", cost = 100 },
			} end } }
			Polestar.Rares = {
				NearbyRecords = function() return { { key = "rare:61", id = 61, name = string.rep("A long rare name ", 4), level = 11, source = "nameplate", map = 1429, x = 40, y = 50 } } end,
				Info = function() return { spawns = { { map = 1429, x = 45, y = 55 } } } end,
				KindText = function() return "Rare" end, LevelText = function() return "11" end,
			}
			Polestar.Fire("GEAR_UPDATED"); stub.advance(0.01)
			PolestarPicker:SetHeight(360)`;
		panels.push(
			{ roots: ['PolestarPicker'], script: inspect },
			{ roots: ['PolestarPicker'], script: inspect + '\nPolestarPicker:SetHeight(360)\nPolestar.UI.HomeSection.Render()' },
			{ roots: ['PolestarPicker'], script: script + `
				PolestarPicker:SetWidth(480 + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side)
				PolestarPicker:SetHeight(360)
				Polestar.UI.HomeSection.Hero.Inspect:Click()` },
			{ roots: ['PolestarPicker'], before: fakeLocale('itIT', {
				Overview: 'An expanded translated overview '.repeat(5),
				Quests: 'Quests for this character '.repeat(5),
				Route: 'The guide route '.repeat(5),
				Rewards: 'Rewards from this guide '.repeat(5),
				'Continue Guide': 'Continue the current guide with its saved progress '.repeat(8),
			}), script: inspect + '\nPolestarPicker:SetHeight(360)\nPolestar.UI.HomeSection.Render()' },
			{ roots: ['PolestarPicker'], script: dungeon },
			{ roots: ['PolestarPicker'], before: fakeLocale('itIT', {
				'Show on Map': 'Show the known dungeon entrance on the world map '.repeat(7),
				'Navigate to entrance': 'Navigate to the recorded dungeon entrance '.repeat(7),
			}), script: dungeon + '\nPolestarPicker:SetHeight(360)\nPolestar.UI.HomeSection.Render()\nPolestar.UI.HomeSection.Inspector.SelectTab("map")' },
			{ roots: ['PolestarPicker'], script: opportunities + '\nPolestar.UI.HomeSection.Dashboard[5].Inspect:Click()\nPolestar.UI.HomeSection.Inspector.SelectTab("services")' },
			{ roots: ['PolestarPicker'], script: opportunities + '\nPolestar.UI.HomeSection.Dashboard[6].Inspect:Click()\nPolestar.UI.HomeSection.Inspector.SelectTab("equipment")' },
			{ roots: ['PolestarPicker'], before: fakeLocale('itIT', {
				'Set waypoint': 'Set a navigation waypoint at this recorded location '.repeat(7),
			}), script: opportunities + '\nPolestar.UI.HomeSection.Dashboard[7].Inspect:Click()\nPolestar.UI.HomeSection.Inspector.SelectTab("location")' },
		);
		assert.deepEqual(auditPanels(`Home ${skin}`, panels), []);
	});

	test(`text fits: Home customization in ${skin}, including narrow controls and skin restoration`, () => {
		const base = `Polestar.Set("ui.skin", "${skin}")
			uistub.openTabs({ { uistub.elwynn, 3 } }, 1)
			Polestar.UI.ShowPicker({ section = "Home" })
			local H = Polestar.UI.HomeSection
			H.Header.Customize:Click()`;
		const panels = [
			{ roots: ['PolestarPicker'], script: base },
			{ roots: ['PolestarPicker'], before: fakeLocale('itIT', {
				'Move up': 'Move this dashboard card up '.repeat(6),
				'Move down': 'Move this dashboard card down '.repeat(6),
				'Restore defaults': 'Restore the original dashboard arrangement '.repeat(6),
			}), script: base + `
				PolestarPicker:SetWidth(320 + PolestarPicker.psRail + 2 + 2 * Polestar.Widgets.SHELL.side)
				PolestarPicker:SetHeight(360); H.Render()` },
			{ roots: ['PolestarPicker'], script: base + '\nH.Hero.Inspect:Click()\nPolestarPicker:SetHeight(360)\nH.Render()' },
			{ roots: ['PolestarPicker'], script: base + `
				H.Customizer.rows.gear.Up:Click(); H.Customizer.rows.dungeon.Visible:Click()
				Polestar.Set("ui.skin", "halo"); stub.advance(0.01)
				Polestar.Set("ui.skin", "${skin}"); stub.advance(0.01)` },
		];
		assert.deepEqual(auditPanels(`Home customization ${skin}`, panels), []);
	});

	test(`Home resolved geometry preserves chrome and separates cards in ${skin}`, () => {
		const dump = P.dumpPanel({ roots: ['PolestarPicker'], script: `
			Polestar.Set("ui.skin", "${skin}")
			uistub.openTabs({ { uistub.elwynn, 3 }, { uistub.tailoring, 2 }, { uistub.stormwindRep, 2 } }, 1)
			Polestar.UI.ShowPicker({ section = "Home" })
			local f, h = PolestarPicker, Polestar.UI.HomeSection
			h.Hero.Inspect:Click()
			local tagged = { [f.Sidebar] = "side", [f.SidebarBackground] = "ground", [h.Header.Title] = "title",
				[h.Frame] = "body", [h.Hero] = "hero", [h.Cards[1]] = "other", [h.Hero.Action] = "continue",
				[h.Hero.Details] = "details", [f.Wordmark] = "wordmark", [f.Tagline] = "tagline",
				[f.Status] = "version", [f.Stage] = "stage", [f.Discord] = "discord",
				[h.Header] = "header", [h.Scroll] = "workspace", [h.Inspector] = "inspector" }
			for i = 2, #h.Dashboard do tagged[h.Dashboard[i]] = "card" .. i end
			preview.entryExtra = function(o, e) e.homePart = tagged[o] end
		` }, prelude);
		const { rects } = resolve(dump.objects, fonts);
		const part = Object.fromEntries(dump.objects.filter((o) => o.homePart).map((o) => [o.homePart, o]));
		const rect = (name) => rects.get(part[name].id);
		const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
		assert.equal(rect('body').x, rect('side').x);
		assert.equal(rect('title').x, rect('hero').x + 52);
		assert.ok(!overlap(rect('header'), rect('workspace')));
		assert.ok(!overlap(rect('workspace'), rect('inspector')));
		assert.ok(!overlap(rect('hero'), rect('other')));
		assert.ok(!overlap(rect('continue'), rect('details')));
		const cards = ['hero', ...Array.from({ length: 6 }, (_, i) => 'card' + (i + 2))];
		for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
			assert.ok(!overlap(rect(cards[i]), rect(cards[j])), `${cards[i]} and ${cards[j]} stay separate`);
		}
		for (const name of ['wordmark', 'tagline']) assert.equal(part[name].shown, false);
		for (const name of ['version', 'stage', 'discord']) {
			assert.ok(!overlap(rect('body'), rect(name)), `${name} stays outside Home's body`);
			assert.equal(part[name].shown, true);
		}
		assert.equal(part.ground.shown, false);
		assert.ok(part.side.level > part.ground.level + 1, 'skin inset artwork stays below sidebar chrome');
	});
}

test('the audit covers the hub, Options, the guide window and the welcome', () => {
	const roots = new Set(windowed.flatMap((s) => s.panels.flatMap((p) => p.roots)));
	for (const r of ['PolestarGuideFrame', 'PolestarOptions', 'PolestarPicker', 'PolestarWelcome']) assert.ok(roots.has(r), r);
	const scripts = windowed.flatMap((s) => s.panels.map((p) => p.script)).join('\n');
	for (const section of ['Polestar.Lookup.Show', 'Polestar.Dungeons.Open', 'Polestar.Rares.Show', 'Polestar.UI.ShowPicker', '"guidepacks"']) {
		assert.ok(scripts.includes(section), section);
	}
});

for (const scene of windowed) {
	test(`text fits: ${scene.file}`, () => {
		const found = auditPanels(scene.file, scene.panels);
		assert.deepEqual(found, [], `text outside its window:\n${found.join('\n')}`);
	});
}

// Options on every page and tab, with every module's pages and the Recorder.
test('text fits: every Options page and tab', () => {
	const recorder = P.SCENES.find((s) => s.file === 'options-more.svg').panels[0].before;
	const pages = runAddon({
		stubs: ['stub_ui.lua'],
		before: recorder,
		addons: [{ name: 'Polestar', files: P.MODULE_FILES }],
		script: 'uistub.install()\nstub.login()\nemit(Polestar.UI.Options.Pages())',
	}).emitted[0];
	assert.ok(pages.length >= 8, `${pages.length} pages`);
	const panels = [];
	for (const p of pages) {
		const tabs = Array.isArray(p.tabs) && p.tabs.length ? p.tabs : [null];
		for (const t of tabs) {
			const select = t ? `; Polestar.UI.Options.Select(${JSON.stringify(p.key)}, ${JSON.stringify(t)})` : '';
			panels.push({ files: P.MODULE_FILES, before: recorder, roots: ['PolestarOptions'], name: `${p.key}${t ? ' > ' + t : ''}`, script: `Polestar.UI.ShowOptions(${JSON.stringify(p.key)})${select}` });
		}
	}
	const found = [];
	for (const panel of panels) found.push(...auditPanels(`Options ${panel.name}`, [panel]).map((l) => l.replace(/ #1 /, ' ')));
	assert.deepEqual(found, [], `text outside its window:\n${found.join('\n')}`);
});
