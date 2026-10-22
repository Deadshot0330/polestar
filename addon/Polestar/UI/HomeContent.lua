-- Home's content adapters. This is presentation, not progression.
-- Resolve({ kind, id }, snapshot) -> a plain inspector context:
-- { key, title, meta?, icon?, tabs = { { key, label, rows = { text | { action }, ... } } },
--   action? = { label, run }, empty? }. IDs are provider IDs, never frame refs.
-- Rows and tabs contain only available facts. Actions are explicit existing UI
-- entry points; resolving a context must never load a guide or move the arrow.
local ADDON, ns = ...
local UI, L = ns.UI, ns.L
local C = {}
UI.HomeContent = C
local DOT = "  \194\183  "

function C.Key(s) return s and (s.kind .. ":" .. (s.id or "")) end

local function tab(key, label, rows) return { key = key, label = label, rows = rows } end
local function add(rows, value) if type(value) == "string" and value ~= "" then rows[#rows + 1] = value end end
local function section(key, label)
	for _, spec in ipairs(UI.Picker.Sections()) do
		if spec.key == key then return { label = label, run = function() UI.Picker.ShowSection(key) end } end
	end
end
local function empty(s, title, reason)
	return { key = C.Key(s), title = title, empty = true, tabs = { tab("overview", L["Overview"], { reason }) } }
end

function C.ContinueLabel(g)
	local category = g and UI.Category(g) or "Leveling"
	return category == "Leveling" and L["Continue Leveling"] or (L["Continue"] .. DOT .. L[category])
end

function C.LiveGoal(d)
	local step = d.step
	-- A pinned browse step can leave the live view without a current goal.
	-- Keep its step summary rather than inferring a different arrow target.
	if not step or not step.current then return nil end
	for i, goal in ipairs(step.goals or {}) do
		if (goal.index or i) == step.current and goal.status == "active" and not goal.folded and not goal.header then return goal end
	end
end

function C.GoalProgress(goal)
	local count = UI.GoalProgress(goal)
	if count then return count end
	local _, label = UI.GoalBar(goal)
	return label
end

function C.PlayerContext(d)
	local parts = {}
	add(parts, d.guide and L[UI.Category(d.guide)])
	if d.player and type(d.player.level) == "number" then add(parts, string.format(L["Level %d"], d.player.level)) end
	add(parts, d.zone or (C.LiveGoal(d) and UI.MapName(C.LiveGoal(d).map)) or UI.GuidePlace(d.guide))
	return table.concat(parts, DOT)
end

-- The Engine settles succession. Recommendations remain optional; merely
-- appearing in Suggestions never confirms a branch or a future player choice.
function C.Next(d)
	local g, E = d.guide, ns.Engine
	local h = d.nextId and d.byId[d.nextId]
	local state = h and E and E.GetGuideState and E.GetGuideState(h.id)
	if h and (not g or h.id ~= g.id) and state ~= "done"
		and (not g or not E or not E.RouteOffered or E.RouteOffered(g.id, h.id)) then
		return { guide = h, kind = "continuation", from = g and g.id }
	end
	if g and not d.hasNextProvider and not g.nextChoices then
		h = g.next and d.byId[g.next]
		if h and h.id ~= g.id and (not E or not E.RouteOffered or E.RouteOffered(g.id, h.id))
			and (not E or not E.GetGuideState or E.GetGuideState(h.id) ~= "done") then
			return { guide = h, kind = "followup", from = g.id }
		end
	end
	for _, candidate in ipairs(d.suggestions or {}) do
		if (not g or candidate.id ~= g.id) and not d.openIndex[candidate.id] then
			local follows = false
			if g then
				for _, id in ipairs(type(g.nextChoices) == "table" and g.nextChoices or { g.next }) do
					if id == candidate.id and E and E.RouteOffered and E.RouteOffered(g.id, id) then follows = true end
				end
			end
			return { guide = candidate, kind = follows and "optional" or "suggestion", from = follows and g.id or nil }
		end
	end
end

function C.Transition(nextGuide)
	if not nextGuide then return nil end
	local labels = { continuation = L["Guide continuation"], followup = L["Guide follow-up"],
		optional = L["Optional follow-up"], suggestion = L["Optional suggestion"] }
	return labels[nextGuide.kind]
end

function C.BuildStatus(d)
	local c = d.build
	if d.buildReason == "off" then return L["Talent plans are turned off. Turn them on under Options > Questing > Talents."] end
	if not c then return L["No talent plan available."] end
	if c.valid and not c.valid.ok then return L["Your talent plan needs an update."] end
	local s = c.state
	if not s then return L["Live talent progress is unavailable."] end
	if s.status == "offplan" then return L["Points are spent outside this plan."] end
	if s.status == "early" then return L["No talent points yet. The first pick is marked once the game gives you one."] end
	if s.status == "complete" then return L["Every pick in this plan is learned."] end
	return s.status == "onplan" and L["On plan."] or nil
end

function C.BuildNext(d)
	local c, T = d.build, ns.Talents
	if c and c.state and c.state.next and c.data and c.valid and c.valid.ok and T and T.PickText then
		return L["Next planned pick"] .. ": " .. T.PickText(c.data, c.state.next, c.valid)
	end
end

function C.BuildMeta(d)
	local c, rows = d.build, {}
	local b = c and c.build
	local class = c and c.data and c.data.class or d.player and d.player.class
	local identity = {}
	add(identity, class and UI.ClassName(class)); add(identity, b and b.specName); add(identity, b and b.split)
	add(rows, table.concat(identity, DOT))
	add(rows, C.BuildNext(d))
	if c and c.state and type(c.state.unspent) == "number" then
		add(rows, string.format(c.state.source == "level" and L["Estimated unspent talent points: %d"] or L["%d unspent talent points"], c.state.unspent))
	end
	add(rows, C.BuildStatus(d))
	return table.concat(rows, "\n")
end

function C.DungeonSummary(d)
	local rows, D = {}, ns.Dungeons
	for i = 1, math.min(3, #(d.dungeons or {})) do
		local instance = d.dungeons[i]
		local parts = { instance.name or instance.key }
		add(parts, UI.LevelRange(instance.minLevel, instance.maxLevel))
		if D and D.QuestCount then add(parts, string.format(L["%d known quests"], D.QuestCount(instance, d.player and d.player.faction))) end
		add(rows, table.concat(parts, DOT))
	end
	if #rows == 0 and d.dungeonReason then
		if d.dungeonReason == "off" then return L["Dungeons are turned off."] end
		if d.dungeonReason == "player" then return L["Character level is unavailable."] end
		return L["Dungeon catalog is unavailable."]
	end
	return #rows > 0 and table.concat(rows, "\n") or L["No dungeons available for your level."]
end

-- Row actions share the primary action's execution-time revalidation.
function C.Action(context, key)
	if not key then return context.action end
	for _, t in ipairs(context.tabs or {}) do
		for _, row in ipairs(t.rows or {}) do
			if type(row) == "table" and row.action and row.action.key == key then return row.action end
		end
	end
end

local function pointText(point)
	if not point then return nil end
	local parts = {}
	add(parts, point.label or point.name)
	if point.map then add(parts, UI.MapName(point.map)) end
	if type(point.x) == "number" and type(point.y) == "number" then add(parts, string.format("%.1f, %.1f", point.x, point.y)) end
	return #parts > 0 and table.concat(parts, DOT) or nil
end

local function guide(s, d)
	local g = s.id and d.byId[s.id]
	local active = s.kind == "continue"
	if active and not s.id and not d.guide then
		local out = empty(s, L["Choose a Guide"], L["No guide is active. Browse guides to choose one."])
		out.action = { label = L["Choose a Guide"], run = function() UI.ShowPicker({ section = "Guides", view = "browse" }) end }
		return out
	end
	if not g or (active and (not d.guide or d.guide.id ~= s.id)) then
		return empty(s, active and C.ContinueLabel(d.guide) or L["Guide unavailable"],
			active and L["This guide is no longer active. Select Continue Leveling again for your current guide."]
				or L["This guide is no longer available. Choose another guide."])
	end
	local full = ns.Guides and ns.Guides.Get and ns.Guides.Get(s.id)
	local context = { key = C.Key(s), title = g.title or g.id, meta = UI.GuideMeta(g), icon = "guides", tabs = {} }
	local overview = {}
	if active then
		add(overview, C.PlayerContext(d))
		if type(d.done) == "number" and type(d.total) == "number" and d.total > 0 then
			add(overview, string.format(L["%d of %d steps complete"], d.done, d.total))
		end
		add(overview, d.step and d.step.title)
		add(overview, d.step and d.step.note)
		local goal = C.LiveGoal(d)
		if goal then
			add(overview, UI.GoalText(goal)); add(overview, C.GoalProgress(goal)); add(overview, UI.GoalDetail(goal))
		end
		if d.upNext and d.upNext.from == g.id then add(overview, C.Transition(d.upNext) .. ": " .. (d.upNext.guide.title or d.upNext.guide.id)) end
	else
		local state, done, total
		if ns.Engine and ns.Engine.GetGuideState then state, done, total = ns.Engine.GetGuideState(s.id) end
		add(overview, state == "done" and L["Finished"] or state == "started" and L["Started"] or L["Not started"])
		if type(total) == "number" and total > 0 and type(done) == "number" then
			add(overview, string.format(L["%d of %d steps complete"], done, total))
		end
	end
	if s.kind == "upcoming" then
		if d.upNext and d.upNext.guide.id == s.id then
			add(overview, C.Transition(d.upNext))
			local from = d.upNext.from and d.byId[d.upNext.from]
			if from then add(overview, L["From guide"] .. ": " .. (from.title or from.id)) end
		else add(overview, L["This guide is no longer the current continuation or suggestion."]) end
	end
	add(overview, g.pitch)
	add(overview, g.why)
	add(overview, ns.FactionName(g.faction))
	add(overview, UI.ClassList(g.classes))
	if g.group then add(overview, L["Group"]) end
	if g.stepCount then add(overview, string.format(L["%d steps"], g.stepCount)) end
	local credits = UI.Picker.Credits and UI.Picker.Credits(g)
	add(overview, credits)
	if #overview == 0 then add(overview, L["No additional guide information is available."]) end
	context.tabs[1] = tab("overview", L["Overview"], overview)
	-- As in Guides' detail pane, author goals supply quests and visited zones.
	-- These are route facts, never a new route calculation or progress model.
	local quests, route, seenQ, seenMap = {}, {}, {}, {}
	local G, info = ns.Guides, d.player
	local function applies(only)
		if type(only) ~= "table" then return true end
		return info ~= nil and G and G.Matches and G.Matches(only, info)
	end
	for _, step in ipairs(full and full.steps or {}) do
		if applies(step.only) then
			for _, goal in ipairs(step.goals or {}) do
				if applies(goal.only) then
					if goal.quest and not seenQ[goal.quest] then
						seenQ[goal.quest] = true
						add(quests, UI.QuestTitle(goal.quest) or (ns.Names and ns.Names.Quest and ns.Names.Quest(goal.quest))
							or (L["Quest"] .. " " .. goal.quest))
					end
					if goal.map and not seenMap[goal.map] then
						seenMap[goal.map] = true
						add(route, UI.MapName(goal.map))
					end
				end
			end
		end
	end
	local liveQuests = {}
	if active then
		local seen = {}
		for _, goal in ipairs(d.step and d.step.goals or {}) do
			if goal.quest and goal.status ~= "na" and not goal.folded and not seen[goal.quest] then
				seen[goal.quest] = true
				add(liveQuests, UI.QuestTitle(goal.quest) or (L["Quest"] .. " " .. goal.quest))
				add(liveQuests, UI.GoalText(goal)); add(liveQuests, C.GoalProgress(goal)); add(liveQuests, UI.GoalDetail(goal))
			end
		end
	end
	if #liveQuests > 0 then
		table.insert(liveQuests, 1, L["Current step quests"])
		if #quests > 0 then add(liveQuests, L["Guide quests"]); for _, text in ipairs(quests) do add(liveQuests, text) end end
		quests = liveQuests
	end
	if #quests > 0 then context.tabs[#context.tabs + 1] = tab("quests", L["Quests"], quests) end
	if active then
		local liveRoute = {}
		local waypoint, target = pointText(d.waypoint), pointText(d.target)
		if waypoint then add(liveRoute, L["Guide waypoint"] .. ": " .. waypoint) end
		if target then add(liveRoute, L["Navigation target"] .. ": " .. target) end
		for _, text in ipairs(route) do add(liveRoute, text) end
		route = liveRoute
	end
	for _, id in ipairs(type(g.nextChoices) == "table" and g.nextChoices or { g.next }) do
		local nextGuide = d.byId[id]
		if nextGuide and (not ns.Engine or not ns.Engine.RouteOffered or ns.Engine.RouteOffered(g.id, id)) then
			add(route, (g.nextChoices and L["Optional follow-up"] or L["Guide follow-up"]) .. ": " .. (nextGuide.title or id))
		end
	end
	if #route > 0 then context.tabs[#context.tabs + 1] = tab("route", L["Route"], route) end
	local rewards = {}
	if active then
		for _, goal in ipairs(d.step and d.step.goals or {}) do
			if goal.status ~= "na" and not goal.folded then
				local known = UI.GoalRewards(goal)
				if known then add(rewards, UI.GoalText(goal) .. ": " .. known) end
			end
		end
	end
	for _, r in ipairs(type(g.reward) == "table" and g.reward or {}) do
		if type(r) == "table" then
			local N = ns.Names
			local name = r.item and ((N and N.Item and N.Item(r.item)) or r.itemName or (L["Item"] .. " " .. r.item))
				or r.spell and ((N and N.Spell and N.Spell(r.spell)) or r.spellName or (L["Spell"] .. " " .. r.spell)) or r.text
			if name then add(rewards, (r.choice and L["Choose one"] or L["Reward"]) .. ": " .. name) end
		end
	end
	if #rewards > 0 then context.tabs[#context.tabs + 1] = tab("rewards", L["Rewards"], rewards) end
	if active then
		context.action = { label = L["Continue Guide"], run = function()
			local live = ns.Engine and ns.Engine.GetGuide and ns.Engine.GetGuide()
			if live and live.id == s.id then UI.Picker.Load(s.id, false) end
		end }
	else
		context.action = { label = L["View guide"], run = function()
			if ns.Guides and ns.Guides.Get and ns.Guides.Get(s.id) then
				UI.Picker.Select(s.id)
				UI.ShowPicker({ section = "Guides", view = "browse" })
			end
		end }
	end
	return context
end

function C.BuildId(current)
	local b = current and current.build
	return b and (b.key or b.specName)
end

local function build(s, d)
	local c = d.build
	if not c or not c.build or C.BuildId(c) ~= s.id then
		local out = empty(s, L["Leveling Build"], d.buildReason == "off" and C.BuildStatus(d)
			or L["This talent plan is unavailable. Select Leveling Build again for the current plan."])
		if d.buildReason == "off" then out.action = section("Talents", L["View Talents"]) end
		return out
	end
	local b, T, rows = c.build, ns.Talents, {}
	add(rows, C.BuildStatus(d))
	add(rows, c.data and c.data.summary)
	if c.state and (not c.valid or c.valid.ok) then
		if c.state.done and c.state.total then add(rows, string.format(L["%d of %d picks"], c.state.done, c.state.total)) end
		if c.state.unspent then add(rows, string.format(c.state.source == "level" and L["Estimated unspent talent points: %d"] or L["%d unspent talent points"], c.state.unspent)) end
		add(rows, C.BuildNext(d))
		if c.state.source == "currency" and c.state.points then add(rows, string.format(L["%d talent points granted"], c.state.points)) end
		if c.state.source == "level" then add(rows, L["Talent point availability is estimated by the Talents module."]) end
	end
	if #rows == 0 then add(rows, L["Explore talent plans for your class."]) end
	local class = c.data and c.data.class or d.player and d.player.class
	local out = { key = C.Key(s), title = b.title or b.specName or L["Leveling Build"],
		meta = table.concat({ class and UI.ClassName(class) or "", b.specName or "", b.split or "" }, DOT), icon = "icon-train",
		tabs = { tab("overview", L["Overview"], rows) }, action = section("Talents", L["View Talents"]) }
	local picks = {}
	if c.data and T and T.PickText then
		for i, pick in ipairs(b.picks or {}) do add(picks, i .. ". " .. T.PickText(c.data, pick, c.valid)) end
	end
	if #picks > 0 then out.tabs[#out.tabs + 1] = tab("picks", L["Picks"], picks) end
	local notes, levels = {}, {}
	for level in pairs(b.notes or {}) do levels[#levels + 1] = level end
	table.sort(levels)
	for _, level in ipairs(levels) do add(notes, string.format(L["Around level %d: %s"], level, b.notes[level])) end
	if #notes > 0 then out.tabs[#out.tabs + 1] = tab("notes", L["Notes"], notes) end
	local source = {}
	add(source, c.data and c.data.source); add(source, c.data and c.data.url)
	if #source > 0 then out.tabs[#out.tabs + 1] = tab("source", L["Source"], source) end
	if out.action and b.spec and UI.TalentsSection and UI.TalentsSection.SetTab then
		out.action.run = function() UI.TalentsSection.SetTab(tostring(b.spec)); UI.Picker.ShowSection("Talents") end
	end
	return out
end

local function dungeon(s, d)
	local D, instance = ns.Dungeons, nil
	for _, candidate in ipairs(d.dungeons or {}) do if candidate.key == s.id then instance = candidate end end
	if not instance then return empty(s, L["Dungeons for Your Level"], d.dungeonReason and C.DungeonSummary(d)
		or L["This dungeon is no longer available for your level and faction."]) end
	local level = d.player and d.player.level
	local faction = d.player and d.player.faction
	local side = faction == "Alliance" and "A" or faction == "Horde" and "H" or nil
	local overview = { L["Catalog level matches; check entry requirements in the dungeon journal."] }
	local range = UI.LevelRange(instance.minLevel, instance.maxLevel)
	if range then add(overview, L["Levels"] .. " " .. range) end
	add(overview, ns.FactionName(faction))
	add(overview, instance.zoneName)
	if instance.players then add(overview, string.format(L["%d players"], instance.players)) end
	if D and D.QuestCount then add(overview, string.format(L["%d known quests"], D.QuestCount(instance, faction))) end
	-- Other catalog candidates stay inside the shared inspector. Their row
	-- actions select provider IDs; they do not turn a dungeon on or plan a run.
	for i = 1, math.min(3, #d.dungeons) do
		local candidate = d.dungeons[i]
		if candidate.key ~= s.id then
			local id = candidate.key
			local levels = UI.LevelRange(candidate.minLevel, candidate.maxLevel)
			overview[#overview + 1] = { action = { key = "inspect:" .. id,
				label = (candidate.name or id) .. (levels and (" (" .. levels .. ")") or ""),
				run = function(source) UI.HomeSection.SelectContext("dungeon", id, source) end } }
		end
	end
	local out = { key = C.Key(s), title = instance.name or instance.key, meta = range,
		icon = "icon-dungeon", tabs = { tab("overview", L["Overview"], overview) } }
	if D and D.Open then out.action = { label = L["Open Dungeon"], run = function() D.Open(s.id) end } end
	local quests, rewards = {}, {}
	local status = { done = L["Completed"], ready = L["Ready to turn in"], log = L["In quest log"] }
	-- Only the selected page is decoded. Catalog summaries never plan pickup
	-- routes or decode every candidate's quests just to show a card count.
	for _, q in ipairs(D and D.Quests and D.Quests(s.id, side) or {}) do
		local title = q.title or UI.QuestTitle(q.id) or (L["Quest"] .. " " .. q.id)
		add(quests, title)
		if q.level then add(quests, string.format(L["Level %d"], q.level)) end
		if q.minLevel then add(quests, string.format(L["Requires level %d"], q.minLevel)) end
		local state = D.QuestState and D.QuestState(q, level)
		add(quests, status[state])
		local classes = UI.ClassList(q.classes)
		if classes then add(quests, L["Classes"] .. ": " .. classes) end
		add(quests, D.ObjectiveText and D.ObjectiveText(q))
		if q.start and q.start.name then add(quests, L["Starts at"] .. ": " .. q.start.name) end
		if q.finish and q.finish.name then add(quests, L["Ends at"] .. ": " .. q.finish.name) end
		local r, rows = q.rewards, {}
		if r then
			for _, item in ipairs(r.items or {}) do
				local name = item.name or (ns.Names and ns.Names.Item and ns.Names.Item(item.id)) or (L["Item"] .. " " .. item.id)
				add(rows, (item.choice and L["Choose one"] or L["Reward"]) .. ": " .. name)
			end
			if type(r.xp) == "number" and r.xp > 0 then add(rows, string.format(L["Base quest XP: %d"], r.xp)) end
			if type(r.money) == "number" and r.money > 0 then add(rows, ns.MoneyText(r.money)) end
			for _, rep in ipairs(r.rep or {}) do
				if rep.name and type(rep.value) == "number" then add(rows, string.format("%s: %+d", rep.name, rep.value)) end
			end
		end
		if #rows > 0 then add(rewards, title); for _, text in ipairs(rows) do add(rewards, text) end end
	end
	if #quests > 0 then out.tabs[#out.tabs + 1] = tab("quests", L["Quests"], quests) end
	if #rewards > 0 then out.tabs[#out.tabs + 1] = tab("rewards", L["Rewards"], rewards) end
	local location = {}
	local entrance = pointText(instance.entrance)
	add(location, instance.zoneName); add(location, entrance)
	if instance.entrance and instance.entrance.map then
		if D and D.ShowOnMap and ns.Compat and ns.Compat.CanOpenWorldMap and ns.Compat.CanOpenWorldMap() then
			location[#location + 1] = { action = { key = "map", label = L["Show on Map"], run = function() D.ShowOnMap(s.id) end } }
		end
		if D and D.GuideTo and ns.Nav and ns.Nav.SetTarget then
			location[#location + 1] = { action = { key = "entrance", label = L["Navigate to entrance"], run = function() D.GuideTo(s.id) end } }
		end
	end
	if #location > 0 then out.tabs[#out.tabs + 1] = tab("map", L["Map"], location) end
	return out
end

function C.Resolve(s, d)
	if not s then return { key = "none", title = L["Journey details"], tabs = {
		tab("overview", L["Overview"], { L["Select a card to see its context here."] }) } } end
	if s.kind == "continue" or s.kind == "guide" or s.kind == "upcoming" then return guide(s, d) end
	if s.kind == "build" then return build(s, d) end
	if s.kind == "dungeon" then return dungeon(s, d) end
	return UI.HomeOpportunities.Resolve(s, d) or empty(s, L["Information unavailable."], L["Select another card."])
end
