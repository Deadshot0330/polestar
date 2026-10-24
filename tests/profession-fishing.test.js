'use strict';
// Fishing's generated activities in the real compiler and Engine. Client
// state is simulated here; this does not verify that a waypoint is castable.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { needs } = require('./helpers/data');
const { context } = require('../tools/lib/professions/gathering/common');
const fishing = require('../tools/lib/professions/gathering/fishing');
const { compile, writeTestPack } = require('./helpers/dsl');
const { runAddon } = require('./helpers/lua');

const skip = needs('professions.json', 'quests.json', 'npcs.json', 'objects.json', 'map-frames.json');
let cached;
function compiled() {
	if (!cached) {
		const ctx = context();
		const result = compile(fishing.render(ctx), ctx.data);
		assert.deepEqual(result.errors, []);
		cached = { guide: result.guides[0], data: ctx.data };
	}
	return cached;
}

function play(steps, before, script) {
	const { guide, data } = compiled();
	const pack = writeTestPack([{ ...guide, steps: [...steps, { goals: [{ t: 'level', level: 60 }] }] }], data);
	const loads = pack.scripts.map((f) => `assert(loadfile(${JSON.stringify(f)}))("Polestar_Guides", ns)`).join('\n');
	return runAddon({
		stubs: ['stub_world.lua'],
		before,
		addons: [{ name: 'Polestar', files: ['Core/Core.xml'] }],
		script: `do local ns = {}; ${loads} end
			stub.login()
			local E, w = Polestar.Engine, stub.world
			local function flush() stub.advance(0.5) end
			E.SetGuide(${JSON.stringify(guide.id)}); flush()
			${script}`,
	}).emitted[0];
}

test('Fishing instructions remain on the tracked activity after reaching its waypoint', { skip }, () => {
	const step = compiled().guide.steps.find((s) => s.goals.some((g) => g.t === 'skill' && g.level === 50));
	const waypoint = step.goals.find((g) => g.t === 'goto');
	const frame = compiled().data.eraFrame(waypoint.map);
	const out = play([step], 'stub.world.level = 10; stub.world.learnSkill(356, "Fishing", 1, 75)', `
		w.addMap(${waypoint.map}, { name = "Water", c = ${frame.c}, left = ${frame.left}, right = ${frame.right}, top = ${frame.top}, bottom = ${frame.bottom} })
		w.moveTo(${waypoint.map}, ${waypoint.x}, ${waypoint.y}); flush()
		local v = E.GetStepView(1).goals[2]
		local r = { atWater = E.GetStepIndex(), arrived = E.GetStepView(1).goals[1].status, text = v.text, progress = v.progress, manual = v.manual }
		w.skillUp(356, 49); flush(); r.belowTarget = E.GetStepIndex()
		w.skillUp(356, 50); flush(); r.atTarget = E.GetStepIndex()
		emit(r)`);
	assert.equal(out.atWater, 1);
	assert.equal(out.arrived, 'done');
	assert.equal(out.belowTarget, 1);
	assert.equal(out.atTarget, 2);
	assert.equal(out.manual, false);
	assert.deepEqual([out.progress.cur, out.progress.max], [1, 50]);
	assert.match(out.text, /[Ee]quip/);
	assert.match(out.text, /spellbook/);
	assert.match(out.text, /[Cc]ast/);
	assert.match(out.text, /bobber/);
});

test('Fishing Artisan goes directly to Nat without requiring either capital breadcrumb', { skip }, () => {
	const { guide } = compiled();
	assert.equal(guide.steps.flatMap((s) => s.goals).some((g) => g.t === 'accept' && [6608, 6609].includes(g.quest)), false);
	const step = guide.steps.find((s) => s.goals.some((g) => g.t === 'accept' && g.quest === 6607));
	const accept = step.goals.find((g) => g.t === 'accept');
	assert.ok(!accept.pre?.length && !accept.preAll?.length, 'breadcrumbs are not blocking prerequisites');
	assert.equal(accept.npc, 12919);
	for (const [race, faction, breadcrumb] of [['Human', 'Alliance', 6609], ['Orc', 'Horde', 6608]]) {
		const before = `stub.world.race = "${race}"; stub.world.faction = "${faction}"; stub.world.level = 35; stub.world.learnSkill(356, "Fishing", 225, 225)`;
		const fresh = play([step], before, `emit({ at = E.GetStepIndex(), status = E.GetStepView(1).goals[${step.goals.indexOf(accept) + 1}].status })`);
		assert.deepEqual(fresh, { at: 1, status: 'active' });
		const introduction = guide.steps.find((s) => s.goals.some((g) => g.t === 'turnin' && g.quest === breadcrumb));
		const carrying = play([introduction, step], `${before}; stub.world.accept(${breadcrumb}, {})`, `
			local r = { at = E.GetStepIndex() }
			w.turnIn(${breadcrumb}); w.accept(6607, {1, 1, 1, 1}); flush()
			r.accepted = E.GetStepIndex(); emit(r)`);
		assert.deepEqual(carrying, { at: 1, accepted: 3 });
	}
});

test('Artisan waits for character level and skill without permanently skipping eligibility', { skip }, () => {
	const step = compiled().guide.steps.find((s) => s.goals.some((g) => g.t === 'accept' && g.quest === 6607));
	const out = play([step], 'stub.world.level = 34; stub.world.learnSkill(356, "Fishing", 224, 225)', `
		local r = { low = E.GetStepIndex() }
		w.setLevel(35); flush(); r.levelReady = E.GetStepIndex()
		w.skillUp(356, 225); flush(); r.skillReady = E.GetStepIndex()
		w.accept(6607, {1, 1, 1, 1}); flush(); r.accepted = E.GetStepIndex()
		emit(r)`);
	assert.deepEqual(out, { low: 1, levelReady: 1, skillReady: 1, accepted: 2 });
	assert.ok(step.goals.some((g) => g.t === 'level' && g.level === 35));
	assert.ok(step.goals.some((g) => g.t === 'skill' && g.level === 225));
});

test('Expert uses the learned cap: an owned unread book still needs learning, a learned rank needs no purchase', { skip }, () => {
	const step = compiled().guide.steps.find((s) => s.goals.some((g) => g.t === 'train' && g.rank === 3));
	assert.equal(step.goals.some((g) => g.t === 'buy'), false);
	const out = play([step], 'stub.world.level = 35; stub.world.learnSkill(356, "Fishing", 125, 150); stub.world.addItem(16083, 1)', `
		local r = { unread = E.GetStepIndex() }
		w.trainer(2626); w.close(); flush(); r.visited = E.GetStepIndex()
		w.skillUp(356, 125, 225); flush(); r.learned = E.GetStepIndex(); emit(r)`);
	assert.deepEqual(out, { unread: 1, visited: 1, learned: 2 });
	const learned = play([step], 'stub.world.level = 35; stub.world.learnSkill(356, "Fishing", 125, 225)', 'emit(E.GetStepIndex())');
	assert.equal(learned, 2);
});
