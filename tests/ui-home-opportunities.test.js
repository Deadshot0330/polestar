'use strict';
// Real Engine, Gear, trainer reader, Nav, Lookup and Rares. Equipment/reward
// records below are synthetic fixtures, not additional production game data.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');
const { TEST_PACK } = require('./helpers/packs');
const { writeCodexPack, sampleCodex } = require('./helpers/codex');
const codex = sampleCodex();
let pack;
before(() => { pack = writeCodexPack(codex); });
after(() => pack && pack.cleanup());
const maps = Object.entries(codex.frames).map(([id, f]) => `w.addMap(${id}, { name = ${JSON.stringify(codex.zones[id].name)}, c = ${f.c}, left = ${f.left}, right = ${f.right}, top = ${f.top}, bottom = ${f.bottom} })`).join('\n');
function run(script, { data = true } = {}) {
	return runAddon({
		stubs: ['stub_world.lua', 'stub_gear.lua', 'stub_rares.lua'],
		before: `${data ? pack.stubLua : ''}
		local w = stub.world
		${maps}
		w.level = 20; w.moveTo(1429, 50, 50); w.setZone("Elwynn Forest")`,
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'Nav/Nav.xml', 'Gear/Gear.xml', 'QoL/QoL.lua', 'QoL/Trainer.lua', 'Lookup/Lookup.xml', 'UI/UI.xml', 'Rares/Rares.xml'] }],
		saved: { Polestar: 'PolestarDB = { schema = 1, welcomeSeen = 1, settings = { behavior = { autoSelectGuide = false } } }; PolestarCharDB = { schema = 1, classTrainLevel = 18 }' },
		login: true,
		script: `${TEST_PACK}
		local UI, E, G, R, H, w, g = Polestar.UI, Polestar.Engine, Polestar.Gear, Polestar.Rares, Polestar.UI.HomeSection, stub.world, stub.gear
		local function tab(key) for _, t in ipairs(H.Inspector.Context.tabs) do if t.key == key then return t end end end
		local function row(key) for _, b in pairs(H.Inspector.rowButtons) do if b:IsVisible() and b.psActionKey == key then return b end end end
		local function show() UI.ShowPicker({ section = "Home" }) end
		local function flush() stub.advance(0.05) end
		local services, bought = {}, 0
		GetNumTrainerServices = function() return #services end
		GetTrainerServiceInfo = function(i) local s = services[i]; return s.name, s.status, nil, nil, s.rank end
		GetTrainerServiceCost = function(i) return services[i].cost end
		IsTradeskillTrainer = function() return false end
		BuyTrainerService = function() bought = bought + 1 end
		Polestar.ItemDB.Register({ schema = 1, build = "home-fixture" }, {
			[9001] = "1 20 15 2 4 3 str5 sta3 armor150",
			[9002] = "1 25 20 2 4 3 str10 sta4 armor170",
			[9003] = "1 45 40 3 4 4 str15 sta10 armor400",
			[9004] = "1 20 15 2 4 1 int10 spi5 armor30 cls128",
		})
		Polestar.ItemDB.RegisterLeveling({ source = "synthetic" }, { names = { [9001] = "Worn helm", [9002] = "Reward helm", [9003] = "Future helm", [9004] = "Mage hat" },
			src = { [9001] = "q7" },
			quests = { [7] = "20 15 1 12 0 0 0|9002,9004|9003|Fixture quest" } })
		local function questGuide()
			w.accept(7, { 10 })
			Polestar.RegisterGuide({ id = "test/rewards", pack = "test", title = "Reward context", steps = {
				{ title = "Live quest", goals = { { t = "complete", quest = 7, title = "Fixture quest" } } },
			} })
			E.SetGuide("test/rewards"); flush()
		end
		${script}`,
	}).emitted;
}

test('training query shares reminder policy, distinguishes real visits and never fires a reminder or mutates its baseline', () => {
	const [out] = run(`
		local due = 0
		Polestar.On("TRAIN_DUE", function() due = due + 1 end)
		local before = Polestar.CharState().classTrainLevel
		local s = E.TrainingStatus()
		local count = due
		w.trainer(914); flush()
		local visit = E.TrainingStatus()
		w.setLevel(21); flush()
		local odd = E.TrainingStatus()
		Polestar.Set("behavior.trainReminder", "1")
		local daily = E.TrainingStatus()
		emit({ initial = s, before = before, count = count, visit = visit, odd = odd.reminderDue, every = daily.reminderDue })`);
	assert.equal(out.initial.reminderDue, true);
	assert.equal(out.initial.lastVisit, undefined);
	assert.equal(out.initial.baseline, out.before);
	assert.equal(out.count, 0);
	assert.equal(out.visit.lastVisit, 20);
	assert.equal(out.visit.reminderDue, false);
	assert.equal(out.odd, false);
	assert.equal(out.every, true);
});

test('trainer services use live class-trainer names, ranks and costs, then disappear on closing or visiting another class', () => {
	const [out] = run(`
		services = { { name = "Fixture skill", rank = "Rank 2", status = "available", cost = 100 },
			{ name = "Future skill", rank = "Rank 3", status = "unavailable", cost = 200 } }
		show()
		w.trainer(914); flush()
		H.Dashboard[5].Inspect:Click()
		local r = { summary = H.Dashboard[5].Summary:GetText(), services = tab("services").rows,
			trainer = tab("trainer").rows, bought = bought, visit = Polestar.CharState().classTrainVisit }
		stub.fire("TRAINER_CLOSED"); flush()
		r.closed = tab("services") == nil
		w.trainer(198); flush()
		r.wrongClass = Polestar.QoL.Trainer.Services() == nil
		emit(r)`);
	assert.equal(out.summary, '1 service listed as available');
	assert.ok(out.services.some((s) => s.includes('Fixture skill') && s.includes('Rank 2')));
	assert.ok(out.services.includes('Trainer lists as unavailable'));
	assert.ok(out.services.includes('Not enough money'));
	assert.ok(out.trainer.length > 0);
	assert.equal(out.bought, 0);
	assert.equal(out.visit, 20);
	assert.equal(out.closed, true);
	assert.equal(out.wrongClass, true);
});

test('training inspection and tab changes preserve navigation; Find trainer is the explicit existing action', () => {
	const [out] = run(`
		local trips = {}
		Polestar.Nav.nearby.Go = function(key) trips[#trips + 1] = key end
		Polestar.Nav.SetTarget(1429, 20, 30, "Manual")
		show(); H.Dashboard[5].Inspect:Click(); H.Inspector.SelectTab("trainer")
		local r = { calls = #trips, target = Polestar.Nav.GetTarget().label, summary = H.Dashboard[5].Summary:GetText() }
		H.Inspector.Action:Click()
		r.trips, r.bought = trips, bought
		emit(r)`);
	assert.equal(out.calls, 0);
	assert.equal(out.target, 'Manual');
	assert.match(out.summary, /reminder due/);
	assert.deepEqual(out.trips, ['class']);
	assert.equal(out.bought, 0);
});

test('training uses the Engine guide lookahead and does not manufacture an upcoming ability milestone', () => {
	const [out] = run(`
		Polestar.RegisterGuide({ id = "test/training", pack = "test", title = "Training soon", steps = {
			{ title = "Wait", goals = { { t = "level", level = 60 } } },
			{ title = "Trainer", goals = { { t = "train", class = true } } },
		} })
		E.SetGuide("test/training"); show(); H.Dashboard[5].Inspect:Click()
		emit({ summary = H.Dashboard[5].Summary:GetText(), status = E.TrainingStatus(), services = tab("services") == nil })`);
	assert.equal(out.summary, 'Your guide includes class training soon.');
	assert.equal(out.status.guideSoon, true);
	assert.equal(out.services, true);
});

test('gear uses current-step reward records and the real equipped comparison; potential is separate from availability', () => {
	const [out] = run(`
		g.equip(1, "item:9001"); questGuide(); show()
		H.Dashboard[6].Inspect:Click()
		local r = { summary = H.Dashboard[6].Summary:GetText(), meta = H.Dashboard[6].Meta:GetText(),
			selection = H.SelectedContext(), stats = tab("item").rows, compare = tab("comparison").rows, source = tab("source").rows,
			expected = G.CompareToEquipped("item:9002").delta, before = E.GetGuide().id }
		H.Inspector.Action:Click()
		r.section, r.after = UI.Picker.Section(), E.GetGuide().id
		emit(r)`);
	assert.equal(out.summary, 'Reward helm');
	assert.equal(out.meta, 'Potential upgrade; known quest reward');
	assert.equal(out.selection.id, 'reward:7:9002');
	assert.ok(out.stats.includes('Strength: 10'));
	assert.ok(out.compare.includes(`Score change: +${out.expected.toFixed(1)}`));
	assert.ok(out.source.some((s) => s.includes('Known quest reward: Fixture quest')));
	assert.ok(!out.source.some((s) => s.includes('Offered in the current')));
	assert.equal(out.section, 'Lookup');
	assert.equal(out.after, out.before);
});

test('open completion choices are available rewards, not a persistent opportunity once the dialogue closes', () => {
	const [out] = run(`
		g.equip(1, "item:9001"); g.choices = { "item:9002" }
		show(); w.questComplete(914, 7, { choices = 1 }); flush()
		H.Dashboard[6].Inspect:Click()
		local r = { meta = H.Dashboard[6].Meta:GetText(), source = tab("source").rows,
			current = G.CurrentRewards(), calls = #w.calls }
		stub.fire("QUEST_FINISHED"); flush()
		r.closed, r.empty = G.CurrentRewards() == nil, H.Inspector.Context.empty
		emit(r)`);
	assert.equal(out.meta, 'Available reward; potential upgrade');
	assert.ok(out.source.some((s) => s.startsWith('Offered in the current completion dialogue')));
	assert.equal(out.current.choices[0].id, 9002);
	assert.equal(out.calls, 0);
	assert.equal(out.closed, true);
	assert.equal(out.empty, true);
});

test('future and incompatible rewards retain requirements and comparison warnings rather than an obtainable-upgrade claim', () => {
	const [out] = run(`
		g.equip(1, "item:9001"); questGuide(); show(); H.Dashboard[6].Inspect:Click()
		row("inspect:reward:7:9003"):Click()
		local r = { future = tab("item").rows, compare = tab("comparison").rows, futureMeta = H.Dashboard[6].Meta:GetText() }
		row("inspect:reward:7:9004"):Click()
		r.incompatible, r.meta = tab("comparison").rows, H.Dashboard[6].Meta:GetText()
		emit(r)`);
	assert.ok(out.future.includes('Requires level 40'));
	assert.ok(out.compare.some((s) => s.includes('at level 40')));
	assert.equal(out.futureMeta, 'Known quest reward');
	assert.equal(out.meta, 'Known quest reward');
	assert.ok(out.incompatible.some((s) => /class/i.test(s)));
});

test('gear card respects the owning comparison provider upgrade threshold', () => {
	const [out] = run(`
		g.equip(1, "item:9001"); questGuide()
		Polestar.Set("gear.minUpgrade", 1000)
		show(); H.Dashboard[6].Inspect:Click()
		if H.SelectedContext().id ~= "reward:7:9002" then row("inspect:reward:7:9002"):Click() end
		emit({ label = H.Dashboard[6].Meta:GetText(), upgrade = G.IsUpgrade("item:9002") })`);
	assert.equal(out.upgrade, false);
	assert.equal(out.label, 'Known quest reward');
});

test('equipped items remain useful without quest records and stale item actions cannot look up a replacement', () => {
	const [out] = run(`
		g.equip(1, "item:9001"); show(); H.Dashboard[6].Inspect:Click()
		local r = { summary = H.Dashboard[6].Summary:GetText(), meta = H.Dashboard[6].Meta:GetText(), equipment = tab("equipment").rows, source = tab("source").rows }
		local lookups = 0
		Polestar.Lookup.Show = function() lookups = lookups + 1 end
		g.equip(1, "item:9002")
		H.Inspector.Action:Click()
		r.lookups, r.empty = lookups, H.Inspector.Context.empty
		emit(r)`);
	assert.equal(out.summary, 'Worn helm');
	assert.equal(out.meta, 'Equipped item');
	assert.ok(out.equipment.some((r) => r.action));
	assert.ok(out.source.includes('Known quest reward: Fixture quest'));
	assert.equal(out.lookups, 0);
	assert.equal(out.empty, true);
});

test('real rare detections expose stable IDs without loading Codex; inspection uses last-seen coordinates honestly', () => {
	const [out] = run(`
		Polestar.Codex.Load = function() error("Home must not load the rare catalogue") end
		stub.rares.unit("nameplate1", { npc = 61, name = "Thuros Lightfingers", level = 11, class = "rare" })
		stub.fire("NAME_PLATE_UNIT_ADDED", "nameplate1"); flush()
		show(); H.Dashboard[7].Inspect:Click()
		local before = Polestar.Nav.GetTarget()
		local r = { summary = H.Dashboard[7].Summary:GetText(), meta = H.Dashboard[7].Meta:GetText(), selection = H.SelectedContext(),
			rows = tab("overview").rows, places = tab("location").rows, pure = Polestar.Nav.GetTarget() == before }
		H.Inspector.SelectTab("location"); row("sighting"):Click()
		r.point = Polestar.Nav.GetTarget()
		emit(r)`, { data: false });
	assert.equal(out.summary, 'Thuros Lightfingers');
	assert.match(out.meta, /Recently detected.*Elwynn Forest/);
	assert.equal(out.selection.id, 'rare:61');
	assert.ok(out.rows.some((s) => s.includes('does not confirm') && s.includes('alive')));
	assert.ok(out.places.some((s) => typeof s === 'string' && s.includes('Last seen near:') && s.includes('50.0, 50.0')));
	assert.equal(out.pure, true);
	assert.equal(out.point.x, 50);
	assert.equal(out.point.y, 50);
});

test('zone history is historical and known spawns remain separate; Show rare uses the existing detail entry point', () => {
	const [out] = run(`
		Polestar.Codex.Load()
		R.Record({ source = "target", kind = "rare", id = 61, name = "Thuros Lightfingers", level = 11 }, { map = 1429, x = 20, y = 30 }, Polestar.Compat.Now() - 1000)
		show(); H.Dashboard[7].Inspect:Click()
		local r = { meta = H.Dashboard[7].Meta:GetText(), places = tab("location").rows }
		H.Inspector.SelectTab("location"); row("spawn:1"):Click()
		r.point = Polestar.Nav.GetTarget()
		H.Inspector.Action:Click()
		r.section, r.tab = UI.Picker.Section(), UI.RaresSection.Tab()
		emit(r)`);
	assert.match(out.meta, /^Previously seen here/);
	assert.ok(out.places.some((s) => typeof s === 'string' && s.startsWith('Known spawn:')));
	assert.ok(out.places.some((s) => typeof s === 'string' && s.startsWith('Last seen near:')));
	assert.equal(out.section, 'Rares');
	assert.equal(out.tab, 'rare');
	assert.equal(out.point.label, 'Thuros Lightfingers');
});

test('rare expiry, death, ignore and disabled settings never leave a live claim or stale waypoint', () => {
	const [out] = run(`
		local s = { source = "target", kind = "rare", id = 61, name = "Thuros Lightfingers", classification = "rare" }
		R.Sighting(s, { map = 1429, x = 20, y = 30 })
		show(); H.Dashboard[7].Inspect:Click(); H.Inspector.SelectTab("location")
		local action = row("sighting")
		local copies = R.NearbyRecords(); copies[1].name = "changed"
		local r = { copy = R.NearbyRecords()[1].name }
		stub.advance(46); flush()
		r.expired = H.Dashboard[7].Meta:GetText()
		s.dead = true; R.Sighting(s, { map = 1429, x = 20, y = 30 }); flush()
		r.dead = tab("overview").rows
		R.Ignore("rare:61", true)
		action:Click()
		r.empty, r.target = H.Inspector.Context.empty, Polestar.Nav.GetTarget()
		Polestar.Set("rares.enabled", false); flush()
		r.off = H.Dashboard[7].Summary:GetText()
		emit(r)`);
	assert.equal(out.copy, 'Thuros Lightfingers');
	assert.match(out.expired, /^Previously seen here/);
	assert.ok(out.dead.includes('Recorded dead at that sighting.'));
	assert.equal(out.empty, true);
	assert.equal(out.target, undefined);
	assert.equal(out.off, 'Rare detection is turned off.');
});

test('rare records in another zone are not presented as current nearby encounters, and name-only sightings get no fabricated creature ID', () => {
	const [out] = run(`
		R.Sighting({ source = "target", kind = "rare", name = "Nameless fixture", classification = "rare" }, { map = 1429, x = 20, y = 30 })
		show(); H.Dashboard[7].Inspect:Click()
		local r = { key = H.SelectedContext().id, action = H.Inspector.Context.action.label }
		w.moveTo(1438, 50, 50); w.setZone("Teldrassil"); flush()
		r.summary, r.empty = H.Dashboard[7].Summary:GetText(), H.Inspector.Context.empty
		emit(r)`);
	assert.equal(out.key, 'name:Nameless fixture');
	assert.equal(out.action, 'Open Rares');
	assert.equal(out.summary, 'No recent rare detections here.');
	assert.equal(out.empty, true);
});

test('missing reward records remain an explicit coverage gap even when equipped items are available', () => {
	const [out] = run(`
		questGuide(); g.equip(1, "item:9001")
		Polestar.ItemDB.Quest = function() return nil end
		Polestar.ItemDB.LevelingMeta = function() return nil end
		show(); H.Dashboard[6].Inspect:Click()
		emit({ meta = H.Dashboard[6].Meta:GetText(), rows = tab("overview").rows })`);
	assert.equal(out.meta, 'Equipped item');
	assert.ok(out.rows.includes('Quest reward data is unavailable; showing equipment context.'));
});

test('missing providers and disabled gear describe missing coverage rather than an absence of upgrades', () => {
	const [out] = run(`
		show(); Polestar.Set("gear.enabled", false); flush()
		local r = { off = H.Dashboard[6].Summary:GetText() }
		Polestar.Gear, Polestar.Rares, E.TrainingStatus = nil, nil, nil
		Polestar.Fire("STEP_UPDATED"); flush()
		r.gear, r.rares, r.training = H.Dashboard[6].Summary:GetText(), H.Dashboard[7].Summary:GetText(), H.Dashboard[5].Summary:GetText()
		emit(r)`);
	assert.equal(out.off, 'Gear advice is turned off.');
	assert.equal(out.gear, 'Gear comparison is unavailable.');
	assert.equal(out.rares, 'Rare detection information is unavailable.');
	assert.equal(out.training, 'Training reminder information is unavailable.');
});

test('opportunity reads coalesce visibly and stop while hidden; tabs and resizing do not rescan providers', () => {
	const [out] = run(`
		questGuide(); g.equip(1, "item:9001"); show(); H.Dashboard[6].Inspect:Click()
		local reads = 0
		local read = UI.HomeOpportunities.Read
		UI.HomeOpportunities.Read = function(d) reads = reads + 1; return read(d) end
		Polestar.Codex.Each = function() error("no full rare scan") end
		for i = 1, 10 do Polestar.Fire("GEAR_UPDATED"); Polestar.Fire("RARE_NEARBY"); stub.fire("TRAINER_UPDATE") end
		flush()
		local r = { visible = reads }
		H.Inspector.SelectTab("item"); H.Inspector.SelectTab("comparison")
		PolestarPicker:SetWidth(900); H.Render()
		r.cached = reads
		PolestarPicker:Hide()
		for i = 1, 10 do Polestar.Fire("CLASS_TRAINED"); Polestar.Fire("GEAR_UPDATED"); Polestar.Fire("RARES_HISTORY") end
		flush(); r.hidden = reads
		emit(r)`);
	assert.equal(out.visible, 1);
	assert.equal(out.cached, 1);
	assert.equal(out.hidden, 1);
});
