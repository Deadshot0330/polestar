-- Quest reward picks from Polestar.ItemDB's leveling data (Forever.lua:
-- which quest offers which reward choices): the choice to take for this
-- character, for the guide window's turn-in goals and reward-item tooltips.
--
--   Gear.QuestPick(questID) -> pick | nil
--       pick = { quest, choices = RankChoices list, pick (index), upgrade (bool),
--                entry (the picked choice) }; nil when the quest offers no gear
--       choice this character can use. Cached per quest until gear advice
--       changes (GEAR_UPDATED: spec, level, equipment, item data).
--   Gear.ChoiceOf(itemID) -> { quest, isPick, pick } | nil
--       The quest that offers this item as a reward choice, and whether it is
--       the pick there. Cached per item the same way.
--   Gear.CurrentRewards() -> { quest, choices = { { id, link, name } } } | nil, reason
--       Only the open completion dialogue, never a stored offer or a request.
--
-- Ranking runs only on demand. Completion events only track the open quest ID.

local ADDON, ns = ...

local Gear = ns.Gear
local type, ipairs, pairs, tonumber = type, ipairs, pairs, tonumber

local pickCache, choiceCache = {}, {}

local function linkOf(id) return "item:" .. id end

local rewardQuest
ns.RegisterEvent("QUEST_COMPLETE", function()
	rewardQuest = GetQuestID and ns.Compat.Readable(GetQuestID()) or nil
end)
ns.RegisterEvent("QUEST_FINISHED", function() rewardQuest = nil end)

-- Only choices offered in the currently open completion dialogue. This is
-- read-only and independent of auto-pick settings. No quest-log selection or
-- reward requests; missing client data is not an empty opportunity catalogue.
function Gear.CurrentRewards()
	if not rewardQuest or not GetQuestID or ns.Compat.Readable(GetQuestID()) ~= rewardQuest then return nil, "closed" end
	if not (GetNumQuestChoices and GetQuestItemInfo) then return nil, "unavailable" end
	local choices, C = {}, ns.Compat
	for i = 1, math.min(32, C.Readable(GetNumQuestChoices()) or 0) do
		local name, _, _, _, _, id = GetQuestItemInfo("choice", i)
		local link = GetQuestItemLink and C.Readable(GetQuestItemLink("choice", i))
		id = C.Readable(id)
		if type(id) == "number" or type(link) == "string" then
			choices[#choices + 1] = { id = id or Gear.ItemID(link), link = link or linkOf(id), name = C.Readable(name) }
		end
	end
	return { quest = rewardQuest, choices = choices }
end

function Gear.QuestPick(questID)
	questID = tonumber(questID)
	if not questID then return nil end
	local hit = pickCache[questID]
	if hit ~= nil then return hit or nil end
	local D = ns.ItemDB
	local q = D and D.Quest(questID)
	local res = false
	if q and #q.choices > 0 and Gear.GetWeights() then
		local links = {}
		for i, id in ipairs(q.choices) do links[i] = linkOf(id) end
		local list, pick = Gear.RankChoices(links)
		if pick then
			res = { quest = questID, choices = list, pick = pick, upgrade = list[pick].upgrade, entry = list[pick] }
		end
	end
	pickCache[questID] = res
	return res or nil
end

function Gear.ChoiceOf(itemID)
	itemID = tonumber(itemID)
	if not itemID then return nil end
	local hit = choiceCache[itemID]
	if hit ~= nil then return hit or nil end
	local D = ns.ItemDB
	local res = false
	for _, s in ipairs(D and D.Sources(itemID) or {}) do
		if s.kind == "quest" then
			local q = D.Quest(s.quest)
			for _, c in ipairs(q and q.choices or {}) do
				if c == itemID then
					local pick = Gear.QuestPick(s.quest)
					res = { quest = q, isPick = pick and pick.entry.id == itemID or false, pick = pick }
					break
				end
			end
			if res then break end
		end
	end
	choiceCache[itemID] = res
	return res or nil
end

ns.On("GEAR_UPDATED", function()
	for k in pairs(pickCache) do pickCache[k] = nil end
	for k in pairs(choiceCache) do choiceCache[k] = nil end
end)
