-- Character opportunities for Home. Bounded, contextual reads over existing
-- providers; no global item/rare scans, new scoring model or spell catalogue.
local ADDON, ns = ...
local UI, L = ns.UI, ns.L
local O = {}
UI.HomeOpportunities = O
local DOT = "  \194\183  "
local SLOTS = { 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 }
local function add(rows, text) if type(text) == "string" and text ~= "" then rows[#rows + 1] = text end end
local function tab(key, label, rows) return { key = key, label = label, rows = rows } end
local function context(s, title, rows)
	return { key = UI.HomeContent.Key(s), title = title, tabs = { tab("overview", L["Overview"], rows) } }
end
local function section(key, label)
	for _, spec in ipairs(UI.Picker.Sections()) do
		if spec.key == key then return { label = label, run = function() UI.Picker.ShowSection(key) end } end
	end
end
local function lookup(kind, id)
	if ns.Lookup and ns.Lookup.Show and ns.Get("lookup.enabled") ~= false then
		return { label = L["Look up"], run = function() ns.Lookup.Show(nil, kind, id) end }
	end
end
local function location(p)
	if not p then return nil end
	local rows = {}
	add(rows, p.name or p.npcName)
	if p.map then add(rows, UI.MapName(p.map)) end
	if type(p.x) == "number" and type(p.y) == "number" then add(rows, string.format("%.1f, %.1f", p.x, p.y)) end
	return table.concat(rows, DOT)
end
local function itemName(id, link)
	return (link and link:match("|h%[(.-)%]|h")) or (ns.Names and ns.Names.Item(id))
		or (ns.ItemDB and ns.ItemDB.ItemName(id)) or (L["Item"] .. " " .. id)
end

local function readGear(d)
	local G, DB = ns.Gear, ns.ItemDB
	local out = { entries = {}, equipped = {} }
	if not (G and G.CompareToEquipped and G.RankChoices) then out.reason = "unavailable"; return out end
	if G.IsEnabled and not G.IsEnabled() then out.reason = "off"; return out end
	if G.GetSpec then local _, label = G.GetSpec(); out.spec = label end
	local seen = {}
	local function rewards(quest, records, available, q)
		if #out.entries >= 32 then return end
		local links = {}
		for i, r in ipairs(records) do links[i] = r.link or ("item:" .. r.id) end
		local ranked, pick = G.RankChoices(links)
		-- Keep the owning provider's preferred reward first, without inventing
		-- a ranking across quests or independently calculating any gear score.
		local order = {}
		if pick then order[1] = pick end
		for i = 1, #records do if i ~= pick then order[#order + 1] = i end end
		for _, i in ipairs(order) do
			local r, rank = records[i], ranked[i]
			local id = r.id or G.ItemID(links[i])
			local key = "reward:" .. quest .. ":" .. id
			if not seen[key] and #out.entries < 32 then
				seen[key] = true
				out.entries[#out.entries + 1] = { key = key, id = id, link = links[i], name = r.name or itemName(id, links[i]),
					quest = quest, questName = q and q.name or UI.QuestTitle(quest), available = available,
					upgrade = rank and rank.upgrade, comparison = G.CompareToEquipped(links[i]), record = q }
			end
		end
	end
	local live = G.CurrentRewards and G.CurrentRewards()
	if live then rewards(live.quest, live.choices, true) end
	local quests, checked = {}, 0
	for _, goal in ipairs(d.step and d.step.goals or {}) do
		if goal.quest and goal.status ~= "na" and not goal.folded and not quests[goal.quest] and checked < 8 and #out.entries < 32 then
			quests[goal.quest], checked = true, checked + 1
			local q = DB and DB.Quest and DB.Quest(goal.quest)
			local records = {}
			for _, id in ipairs(q and q.choices or {}) do if #records < 32 then records[#records + 1] = { id = id } end end
			for _, id in ipairs(q and q.items or {}) do if #records < 32 then records[#records + 1] = { id = id } end end
			if #records > 0 then rewards(goal.quest, records, false, q) end
		end
	end
	-- A fixed set of equipped slots is useful when no reward data is known.
	if G.Client and G.Client.InventoryLink then
		out.inventory = true
		for _, slot in ipairs(SLOTS) do
			local link = G.Client.InventoryLink(slot)
			local id = link and G.ItemID(link)
			if id then out.equipped[#out.equipped + 1] = { key = "equipped:" .. slot .. ":" .. link,
				id = id, link = link, slot = slot, name = itemName(id, link), equipped = true } end
		end
	end
	if checked > 0 and DB and DB.LevelingMeta and not DB.LevelingMeta() then out.missingRewards = true end
	return out
end

local function readRares(d)
	local R, out = ns.Rares, { entries = {} }
	if not (R and R.NearbyRecords) then out.reason = "unavailable"; return out end
	local point = ns.PlayerPoint and ns.PlayerPoint()
	out.map = point and point.map or (ns.Compat.GetPlayerMapPosition and ns.Compat.GetPlayerMapPosition())
	local records, reason = R.NearbyRecords()
	out.reason = reason
	if reason then return out end
	for _, r in ipairs(records) do
		if not out.map or not r.map or r.map == out.map then
			r.recent = true
			out.entries[#out.entries + 1] = r
			if #out.entries == 3 then break end
		end
	end
	-- Bounded realm history (at most 400 records), never a Codex-wide spawn
	-- scan. A past sighting in this map is explicitly historical, not live.
	if #out.entries == 0 and out.map and R.History then
		local history = {}
		for key, e in pairs(R.History()) do
			if e.kind == "rare" and e.map == out.map and e.t and not R.IsIgnored(key) then
				history[#history + 1] = { key = key, id = e.id, name = e.name or key, level = e.level,
					map = e.map, x = e.x, y = e.y, t = e.t, source = e.src, dead = e.dead and e.dead == e.t }
			end
		end
		table.sort(history, function(a, b) return a.t > b.t or a.t == b.t and a.key < b.key end)
		for i = 1, math.min(3, #history) do out.entries[i] = history[i] end
	end
	return out
end

function O.Read(d, wanted)
	wanted = wanted or { training = true, gear = true, rares = true }
	local E = ns.Engine
	d.training = { status = wanted.training and E and E.TrainingStatus and E.TrainingStatus() }
	local T = ns.QoL and ns.QoL.Trainer
	if wanted.training and T and T.Services then d.training.services, d.training.reason = T.Services() end
	d.training.available = 0
	for _, service in ipairs(d.training.services or {}) do
		if service.status == "available" then d.training.available = d.training.available + 1 end
	end
	d.gear = wanted.gear and readGear(d) or { entries = {}, equipped = {}, reason = "hidden" }
	d.rares = wanted.rares and readRares(d) or { entries = {}, reason = "hidden" }
end

function O.TrainingSummary(d)
	local t, s = d.training, d.training.status
	if t.services then return t.available == 1 and L["1 service listed as available"] or string.format(L["%d services listed as available"], t.available) end
	if not s then return L["Training reminder information is unavailable."] end
	if s.guideSoon then return L["Your guide includes class training soon."] end
	if s.reminderDue then return L["Class trainer visit reminder due."] end
	if not s.interval then return L["Class training reminders are turned off."] end
	return L["No class training reminder due."]
end

function O.GearLabel(e)
	if e.equipped then return L["Equipped item"] end
	if e.available then return e.upgrade and L["Available reward; potential upgrade"] or L["Available reward"] end
	if e.upgrade then return L["Potential upgrade; known quest reward"] end
	return L["Known quest reward"]
end

function O.GearSummary(d, selected)
	local g = d.gear
	if g.reason == "off" then return L["Gear advice is turned off."] end
	if g.reason then return L["Gear comparison is unavailable."] end
	local e = selected or g.entries[1] or g.equipped[1]
	if e then return e.name, O.GearLabel(e) end
	return g.missingRewards and L["Quest reward data is unavailable."] or L["No gear rewards known for the current step."],
		g.inventory and L["Coverage: current step rewards and equipped items."] or L["Equipment information is unavailable."]
end

function O.RareLabel(r) return r.recent and L["Recently detected"] or L["Previously seen here"] end
function O.RareSummary(d, selected)
	local r = d.rares
	if r.reason == "off" then return L["Rare detection is turned off."] end
	if r.reason then return L["Rare detection information is unavailable."] end
	local e = selected or r.entries[1]
	return e and e.name or L["No recent rare detections here."], e and O.RareLabel(e) or L["Open Rares for known spawn records."]
end

local function find(list, id) for _, e in ipairs(list or {}) do if e.key == id then return e end end end
function O.GearSelection(d, selection)
	local g = d.gear
	return selection and selection.kind == "gear" and (find(g.entries, selection.id) or find(g.equipped, selection.id))
		or g.entries[1] or g.equipped[1]
end
function O.RareSelection(d, selection)
	return selection and selection.kind == "rares" and find(d.rares.entries, selection.id) or d.rares.entries[1]
end
local function choices(rows, kind, entries, id)
	for i = 1, math.min(3, #entries) do
		local e = entries[i]
		if e.key ~= id then
			local key = e.key
			rows[#rows + 1] = { action = { key = "inspect:" .. key, label = e.name,
				run = function(source) UI.HomeSection.SelectContext(kind, key, source) end } }
		end
	end
end

local function training(s, d)
	local rows, t = {}, d.training
	local out = context(s, L["Class Training"], rows)
	if not d.player or d.player.class ~= s.id then out.empty = true; add(rows, L["Class information unavailable."]); return out end
	out.meta = UI.ClassName(s.id) .. (d.player.level and (DOT .. string.format(L["Level %d"], d.player.level)) or "")
	add(rows, O.TrainingSummary(d))
	add(rows, L["A visit reminder does not confirm unlearned spells. Trainer services are known only while that trainer is open."])
	if t.reason == "unavailable" then add(rows, L["Trainer service information is unavailable from this client."]) end
	local state = t.status
	if state and state.lastVisit then add(rows, string.format(L["Last class trainer visit: level %d"], state.lastVisit)) end
	if state and state.interval then add(rows, string.format(L["Reminder interval: %d levels"], state.interval)) end
	if t.services then
		local services = {}
		for _, service in ipairs(t.services) do
			add(services, service.name .. (service.rank and service.rank ~= "" and (DOT .. service.rank) or ""))
			add(services, service.status == "available" and L["Trainer lists as available"] or L["Trainer lists as unavailable"])
			if service.cost then
				add(services, ns.MoneyText(service.cost))
				local money = ns.QoL.Client.Money()
				if money and service.cost > money then add(services, L["Not enough money"]) end
			end
		end
		if #services == 0 then add(services, L["No unlearned services are listed by this trainer."]) end
		out.tabs[#out.tabs + 1] = tab("services", L["Services"], services)
	end
	-- Ranking the registered trainers is deferred until this inspector opens.
	local E = ns.Engine
	local trainer = E and E.NearestClassTrainer and E.NearestClassTrainer()
	if trainer then
		local places = { location(trainer) }
		local action = lookup("npc", trainer.npc)
		if action then action.key = "trainer-lookup"; places[#places + 1] = { action = action } end
		out.tabs[#out.tabs + 1] = tab("trainer", L["Trainer"], places)
	else add(rows, L["Trainer location is unavailable."]) end
	local nearby = ns.Nav and ns.Nav.nearby
	if nearby and nearby.Go then out.action = { label = L["Find trainer"], run = function() nearby.Go("class") end } end
	return out
end

local function gear(s, d)
	local g, rows = d.gear, {}
	local e = find(g.entries, s.id) or find(g.equipped, s.id)
	local out = context(s, e and e.name or L["Gear Opportunities"], rows)
	if not e then
		out.empty = true
		add(rows, O.GearSummary(d))
		if not g.reason and s.id ~= "equipment" then add(rows, L["This item is no longer in the current equipment or reward context."]) end
		out.action = section("Lookup", L["Open Lookup"])
		return out
	end
	out.meta = O.GearLabel(e)
	add(rows, g.spec and (L["Gear weights"] .. ": " .. g.spec))
	add(rows, L["Coverage: current live-step quest records, open reward choices and equipped items. Known rewards may not be obtainable now."])
	if g.missingRewards then add(rows, L["Quest reward data is unavailable; showing equipment context."]) end
	choices(rows, "gear", g.entries, s.id)
	local G, info = ns.Gear, ns.Gear.GetItemInfo(e.link)
	local stats = {}
	if info then
		if info.req and info.req > 0 then add(stats, string.format(L["Requires level %d"], info.req)) end
		for _, key in ipairs(G.STAT_KEYS or {}) do
			local value = info.stats and info.stats[key]
			if value then add(stats, string.format("%s: %g", UI.GearStatName and UI.GearStatName(key) or key, value)) end
		end
	end
	if #stats == 0 then add(stats, L["Item stats are unavailable."]) end
	out.tabs[#out.tabs + 1] = tab("item", L["Item"], stats)
	local comparison, r = {}, e.comparison
	if e.equipped then
		add(comparison, G.SlotName and G.SlotName(e.slot))
		add(comparison, L["This item is equipped."])
	elseif r then
		add(comparison, L["Weighted comparison with current equipment; acquisition availability is separate."])
		local left, right = G.TooltipLine(e.link)
		if left then add(comparison, left .. ": " .. right) end
		if r.old then add(comparison, string.format(L["Equipped score: %.1f"], r.old)) end
		if r.new then add(comparison, string.format(L["Candidate score: %.1f"], r.new)) end
		if r.delta then add(comparison, string.format(L["Score change: %+.1f"], r.delta)) end
		local equipped = r.slot and G.Client.InventoryLink(r.slot)
		if equipped then add(comparison, L["Equipped item"] .. ": " .. itemName(G.ItemID(equipped), equipped)) end
	else add(comparison, L["Comparison data is unavailable; this is only a known item."]) end
	out.tabs[#out.tabs + 1] = tab("comparison", L["Comparison"], comparison)
	local sources = {}
	if e.quest then
		add(sources, (e.available and L["Offered in the current completion dialogue"] or L["Known quest reward"]) .. ": " .. (e.questName or (L["Quest"] .. " " .. e.quest)))
		add(sources, e.record and e.record.zoneName)
		if ns.Compat.IsOnQuest(e.quest) then add(sources, ns.Compat.IsQuestReadyForTurnIn(e.quest) and L["Quest ready to turn in"] or L["In quest log"]) end
		if ns.Compat.IsQuestCompleted(e.quest) then add(sources, L["Quest completed"]) end
	else
		add(sources, L["Currently equipped. Known sources do not establish how this copy was acquired."])
		local known = ns.ItemDB and ns.ItemDB.Sources and ns.ItemDB.Sources(e.id)
		for i = 1, math.min(8, #(known or {})) do
			local source = known[i]
			if source.kind == "quest" then add(sources, L["Known quest reward"] .. ": " .. (source.name or (L["Quest"] .. " " .. source.quest)))
			elseif source.kind == "drop" then add(sources, L["Known drop"] .. ": " .. (source.npcName or L["Unknown creature"]))
			elseif source.kind == "craft" then
				add(sources, L["Crafted"] .. ": " .. (source.profession or L["Unknown profession"]))
				if source.skill then add(sources, string.format(L["Requires skill %d"], source.skill)) end
			end
			add(sources, source.zoneName)
		end
	end
	out.tabs[#out.tabs + 1] = tab("source", L["Source"], sources)
	if #g.equipped > 0 then
		local equipment = {}
		for _, worn in ipairs(g.equipped) do
			add(equipment, G.SlotName(worn.slot))
			local key = worn.key
			equipment[#equipment + 1] = { action = { key = "inspect:" .. key, label = worn.name,
				run = function(source) UI.HomeSection.SelectContext("gear", key, source) end } }
		end
		out.tabs[#out.tabs + 1] = tab("equipment", L["Equipment"], equipment)
	end
	out.action = lookup("item", e.id) or section("Lookup", L["Open Lookup"])
	return out
end

local function rares(s, d)
	local R, rows = ns.Rares, {}
	local e = find(d.rares.entries, s.id)
	local out = context(s, e and e.name or L["Rares Nearby"], rows)
	if not e then
		out.empty = true
		add(rows, O.RareSummary(d))
		if not d.rares.reason and s.id ~= "nearby" then add(rows, L["This encounter is no longer in the current nearby context."]) end
		out.action = section("Rares", L["Open Rares"])
		return out
	end
	local info = e.id and R.Info("rare", e.id)
	out.meta = O.RareLabel(e)
	add(rows, R.KindText("rare", e.elite or info and info.elite))
	local level = R.LevelText(e.level or info and info.level, info and info.levelMax)
	if level then add(rows, L["Level"] .. " " .. level) end
	add(rows, L["Current zone"] .. ": " .. (d.zone or UI.MapName(d.rares.map) or L["Unknown"]))
	add(rows, L["A recent detection or known spawn does not confirm that this rare is currently alive."])
	if e.source then add(rows, L["Detection source"] .. ": " .. e.source) end
	if e.t then add(rows, string.format(L["Last seen %s"], R.AgoText(e.t))) end
	if e.dead then add(rows, L["Recorded dead at that sighting."]) end
	choices(rows, "rares", d.rares.entries, s.id)
	local places = {}
	local function point(p, label, key)
		if not (p and p.map and type(p.x) == "number" and type(p.y) == "number") then return end
		add(places, label .. ": " .. location(p))
		if ns.Nav and ns.Nav.SetTarget then
			places[#places + 1] = { action = { key = key, label = L["Set waypoint"] .. ": " .. label,
				run = function() ns.Nav.SetTarget(p.map, p.x, p.y, e.name, p.f) end } }
		end
	end
	point(e, e.exact and L["Detected location"] or L["Last seen near"], "sighting")
	local n = 0
	for _, p in ipairs(info and info.spawns or {}) do
		if p.map == d.rares.map and n < 3 then n = n + 1; point(p, L["Known spawn"], "spawn:" .. n) end
	end
	if #places == 0 then add(places, L["No authoritative location is available."]) end
	out.tabs[#out.tabs + 1] = tab("location", L["Location"], places)
	if e.id and R.Show then out.action = { label = L["Show rare"], run = function() R.Show("rare", e.id) end }
	else out.action = section("Rares", L["Open Rares"]) end
	return out
end

function O.Resolve(s, d)
	if s.kind == "training" then return training(s, d) end
	if s.kind == "gear" then return gear(s, d) end
	if s.kind == "rares" then return rares(s, d) end
end
