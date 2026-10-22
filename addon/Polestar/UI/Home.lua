-- Home presents guide context; Picker/Engine still own every load action.
local ADDON, ns = ...
local UI, W, Theme, L = ns.UI, ns.Widgets, ns.Theme, ns.L
local floor, min, max = math.floor, math.min, math.max
local H = {}
UI.HomeSection = H
local frame, hub, scroll, hero, openHead, suggestHead
local openCards, suggestCards
local cards, rows, visibleIds, visibleButtons = {}, {}, {}, {}
local data, dirty, queued = nil, true, false
local keyboardButton
local header, inspector, dashboard = nil, nil, {}
local inspectorOpen, selection = true, nil
local Content = UI.HomeContent
local Opportunities = UI.HomeOpportunities
local Customize = UI.HomeCustomize
local customizer, customizeOpen, ordered = nil, false, {}
local themeDirty = false
local inspectorDirty, activatingKeyboard = true, false
local layout
local workspaceScale = 1
local SUGGEST_MAX, FOLLOW_REACH = 5, 2
local DOT = "  \194\183  "

local function visible()
	return frame and hub:IsShown() and UI.Picker.Section() == "Home" and frame:IsShown()
end
local function guideState(id)
	local E = ns.Engine
	return E and E.GetGuideState and E.GetGuideState(id)
end
local function offered(fromId, id)
	local E = ns.Engine
	return not (E and E.RouteOffered) or E.RouteOffered(fromId, id)
end

-- Migrated from Guides Home: current suggestions first, then eligible
-- follow-ups, excluding finished guides and duplicates, capped at five.
local function suggestions(byId, tabs, openIndex, level)
	local G = ns.Guides
	local out, seen = {}, {}
	local function add(id, followUp)
		if #out >= SUGGEST_MAX or not id or seen[id] or not byId[id] then return end
		if followUp and (openIndex[id] or (level and level + FOLLOW_REACH < (byId[id].minLevel or 1))) then return end
		seen[id] = true
		if guideState(id) == "done" then return end
		out[#out + 1] = byId[id]
	end
	for _, id in ipairs(G and G.Suggestions and G.Suggestions() or {}) do add(id) end
	for _, t in ipairs(tabs or {}) do
		local h = byId[t.guideId]
		if h then
			for _, c in ipairs(type(h.nextChoices) == "table" and h.nextChoices or { h.next }) do
				if offered(h.id, c) then add(c, true) end
			end
		end
	end
	return out
end

local function choose() UI.ShowPicker({ section = "Guides", view = "browse" }) end
local function continueGuide()
	local E = ns.Engine
	local g = E and E.GetGuide and E.GetGuide()
	if g and g.id then UI.Picker.Load(g.id, false) else choose() end
end
local function loadSelected() UI.Picker.LoadSelected() end
local function enter()
	if selection and inspectorOpen and selection.kind ~= "guide" then H.ActivateContext(Content.Key(selection)); return end
	local id = UI.Picker.Selected()
	if data and data.byId[id] then loadSelected() else continueGuide() end
end
local function pick(self)
	UI.Picker.Select(self.psGuide.id)
	H.SelectContext("guide", self.psGuide.id, self)
end
local function doubleClick(self) pick(self); loadSelected() end

local function clearKeyboard()
	if keyboardButton then keyboardButton.psHomeKeyboard:Hide() end
	keyboardButton = nil
end

local function focusKeyboard(b)
	clearKeyboard()
	if not b or not b:IsVisible() then return end
	keyboardButton = b
	if not b.psHomeKeyboard then
		local mark = W.Fill(b, "accent", "OVERLAY")
		mark:ClearAllPoints()
		mark:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
		mark:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0)
		mark:SetWidth(2)
		b.psHomeKeyboard = mark
	end
	b.psHomeKeyboard:Show()
end

local function sameSelection(s) return selection and Content.Key(selection) == Content.Key(s) end
local function origin()
	for _, c in ipairs(dashboard) do if sameSelection(c.psSelection) then return c.Inspect end end
	for _, pool in ipairs({ cards, rows }) do
		for _, b in ipairs(pool) do if b:IsVisible() and sameSelection(b.psSelection) then return b end end
	end
	return hero.Action
end

local function revealRange(y, h)
	local at = scroll:GetVerticalScroll()
	if y < at then W.ScrollTo(scroll, y)
	elseif y + h > at + scroll.psView then W.ScrollTo(scroll, y + h - scroll.psView) end
end
local function reveal(b)
	if customizer and ns.Gamepad.Within(b, customizer) then
		local y, h = customizer.Reveal(b)
		revealRange((customizer.psHomeY or 0) + y, h)
		return
	end
	if inspector and ns.Gamepad.Within(b, inspector) then
		local y, h = inspector.Reveal(b)
		if inspector.psHomeY then revealRange(inspector.psHomeY + y, h) end
		return
	end
	-- Header and inspector controls do not belong to the workspace scroll.
	if b.psHomeY == nil then return end
	revealRange(b.psHomeY, b:GetHeight())
end

-- Picker's existing gamepad onFocus hook delegates nested Home scrolling.
function H.RevealControl(b) if visible() and b and ns.Gamepad.Within(b, frame) then reveal(b) end end

local function entry(pool, i)
	local b = pool[i]
	if b then return b end
	b = CreateFrame("Button", nil, pool == cards and openCards or suggestCards)
	Theme.Skin(b, "button")
	W.Hover(b)
	b.Mark = W.Fill(b, "accent", "ARTWORK")
	b.Mark:ClearAllPoints()
	b.Mark:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
	b.Mark:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 0, 0)
	b.Mark:SetWidth(2)
	b.Title = W.Text(b, "body", "text")
	b.Title:SetWordWrap(true)
	b.Title:SetPoint("TOPLEFT", b, "TOPLEFT", 12, -10)
	b.Title:SetPoint("TOPRIGHT", b, "TOPRIGHT", -12, -10)
	b.Note = W.Text(b, "small", "textDim")
	b.Note:SetWordWrap(true)
	b.Group = W.Chip(b)
	b.Group:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -12, 10)
	b:SetScript("OnClick", pick)
	b:SetScript("OnDoubleClick", doubleClick)
	b.psTip = L["Double-click a guide or press Enter to load it."]
	b:SetScript("OnEnter", W.SimpleTip)
	b:SetScript("OnLeave", W.HideTip)
	pool[i] = b
	return b
end

local function paint(b, g, note, width)
	-- A pooled card must not silently transfer keyboard activation to a
	-- different guide. Ordinary repaints keep the player's focus intact.
	if keyboardButton == b and b.psGuide and b.psGuide.id ~= g.id then clearKeyboard() end
	b.psGuide = g
	b.psSelection = { kind = "guide", id = g.id }
	b.Title:SetText(g.title or g.id)
	b.Note:SetText(note or "")
	b.Mark:SetShown((selection and sameSelection(b.psSelection) or not selection and UI.Picker.Selected() == g.id) and true or false)
	b.Group:SetShown(g.group == true)
	local groupW = g.group and (W.SetChip(b.Group, L["Group"], "dungeon") + 8) or 0
	b.Title:SetWidth(max(1, width - 24))
	local titleH = b.Title:GetStringHeight()
	b.Note:ClearAllPoints()
	b.Note:SetPoint("TOPLEFT", b, "TOPLEFT", 12, -14 - titleH)
	b.Note:SetWidth(max(1, width - 24 - groupW))
	b:Show()
	return max(60, 24 + titleH + b.Note:GetStringHeight(), groupW > 0 and 24 + titleH + b.Group:GetHeight() or 0)
end

local function read()
	local E, G, C = ns.Engine, ns.Guides, ns.Compat
	local d = { byId = {}, tabs = {}, openIndex = {} }
	local _, wanted = Customize.Read()
	d.wanted = wanted
	for _, g in ipairs(G and G.List and G.List() or {}) do d.byId[g.id] = g end
	if E and E.GetTabs then d.tabs, d.active = E.GetTabs() end
	d.tabs = d.tabs or {}
	for i, t in ipairs(d.tabs) do d.openIndex[t.guideId] = i end
	d.guide = E and E.GetGuide and E.GetGuide()
	if d.guide then
		if E.GetProgress then d.done, d.total = E.GetProgress() end
		local live = E.GetLiveStep and E.GetLiveStep()
		if live and E.GetStepView then d.step = E.GetStepView(live) end
		if E.GetWaypoint then d.waypoint = E.GetWaypoint() end
		d.hasNextProvider = E.NextGuide ~= nil
		if E.NextGuide then d.nextId = E.NextGuide(d.guide.id) end
	end
	d.target = ns.Nav and ns.Nav.GetTarget and ns.Nav.GetTarget()
	d.player = C and C.GetPlayerInfo and C.GetPlayerInfo()
	d.zone = C and C.GetZoneText and C.GetZoneText()
	local T = ns.Talents
	if wanted.build and T and T.Current then d.build, d.buildReason = T.Current() end
	if T and T.Get and not T.Get("enabled") then d.build, d.buildReason = nil, "off" end
	if wanted.build and not d.build and d.buildReason ~= "off" and T and T.Data and T.ActiveBuild then
		local tree = T.Data()
		local plan = tree and T.ActiveBuild(tree)
		if plan then d.build = { data = tree, build = plan } end
	end
	Opportunities.Read(d, wanted)
	d.dungeons, d.dungeonReason = {}, "unavailable"
	if wanted.dungeon and ns.Dungeons and ns.Dungeons.ForPlayer then d.dungeons, d.dungeonReason = ns.Dungeons.ForPlayer(d.player) end
	d.suggestions = suggestions(d.byId, d.tabs, d.openIndex, d.player and d.player.level)
	d.upNext = Content.Next(d)
	return d
end

function H.SelectedContext()
	return selection and { kind = selection.kind, id = selection.id }
end

function H.SelectContext(kind, id, source)
	if not visible() then return false end
	local old = Content.Key(selection)
	selection, inspectorOpen = { kind = kind, id = id }, true
	if old ~= Content.Key(selection) then clearKeyboard() end
	inspectorDirty = true
	layout()
	if inspector.psHomeY then W.ScrollTo(scroll, inspector.psHomeY) end
	local first = inspector.Controls()[1]
	if activatingKeyboard then focusKeyboard(first) end
	local G = ns.Gamepad
	if source and G and G.Focused(hub) == source and first:IsVisible() then G.SetFocus(hub, first) end
end

function H.DismissInspector()
	local G = ns.Gamepad
	local keyboard = keyboardButton and G.Within(keyboardButton, inspector)
	local focused = G and G.Focused(hub)
	local pad = focused and G.Within(focused, inspector)
	inspectorOpen = false
	layout()
	local target = origin()
	if keyboard then focusKeyboard(target); reveal(target) end
	if pad then G.SetFocus(hub, target) end
end

function H.InspectorBack()
	local focused = ns.Gamepad and ns.Gamepad.Focused(hub)
	if customizeOpen and focused and ns.Gamepad.Within(focused, customizer) then H.ToggleCustomization(); return true end
	if inspectorOpen and focused and ns.Gamepad.Within(focused, inspector) then H.DismissInspector(); return true end
end

function H.ToggleCustomization()
	if not visible() then return end
	local keyboard = keyboardButton ~= nil or activatingKeyboard
	customizeOpen = not customizeOpen
	layout()
	local target = customizeOpen and customizer.Controls()[1] or header.Customize
	if keyboard then focusKeyboard(target) end
	local G = ns.Gamepad
	if G and G.Focused(hub) then G.SetFocus(hub, target) end
	if customizeOpen then reveal(target) end
end

function H.ActivateContext(key, actionKey, source)
	if not visible() or not inspector:IsVisible() or Content.Key(selection) ~= key then return end
	-- Revalidate at execution time, including queued guide/pack changes.
	data, dirty, inspectorDirty = read(), false, true
	layout()
	local action = Content.Action(inspector.Context, actionKey)
	if action then action.run(source) end
end

local function fitButton(b, width)
	b.Label:SetWidth(0)
	W.SetButtonText(b, b.Label:GetText())
	b:SetWidth(min(width, b:GetWidth()))
	b.Label:SetWordWrap(true)
	b.Label:SetWidth(max(1, b:GetWidth() - 2 * Theme.Metric("buttonPad", 16)))
	b:SetHeight(max(Theme.Metric("buttonH", 28), b.Label:GetStringHeight() + 12))
end

-- Home's card vocabulary stays private: all seven cards share their ground,
-- heading, summary, metadata, selection and independent action/details controls.
local function card(parent, title, icon, primary)
	local c = CreateFrame("Frame", nil, parent)
	Theme.Skin(c, "button")
	c:EnableMouse(true)
	local hover = W.Hover(c)
	hover:Hide()
	c:SetScript("OnEnter", function() hover:Show() end)
	c:SetScript("OnLeave", function() hover:Hide() end)
	c.psSelection = false
	c.psIcon = icon
	c:SetScript("OnMouseUp", function(self, button)
		if button == "LeftButton" and self.psSelection then H.SelectContext(self.psSelection.kind, self.psSelection.id, self.Inspect) end
	end)
	c.Mark = W.Fill(c, "accent", "ARTWORK")
	c.Mark:ClearAllPoints()
	c.Mark:SetPoint("TOPLEFT", c, "TOPLEFT", 0, 0)
	c.Mark:SetPoint("BOTTOMLEFT", c, "BOTTOMLEFT", 0, 0)
	c.Mark:SetWidth(2)
	c.Mark:Hide()
	c.Selected = W.Fill(c, "accent", "BACKGROUND", -1)
	W.Painter(c.Selected, function(t) t:SetVertexColor(Theme.Wash("selected")) end)
	c.Selected:Hide()
	c.Icon = W.Tex(c, "ARTWORK", icon, "accent")
	c.Icon:SetSize(18, 18)
	c.Icon:SetPoint("TOPLEFT", c, "TOPLEFT", 16, -16)
	c.Heading = W.Text(c, "label", "textDim")
	c.Heading:SetText(title)
	c.Heading:SetWordWrap(true)
	c.Summary = W.Text(c, primary and "heading" or "body", "text")
	c.Meta = W.Text(c, "small", "textDim")
	c.Summary:SetWordWrap(true)
	c.Meta:SetWordWrap(true)
	c.Inspect = W.IconButton(c, "chevron-right", 24, L["Show details"], function()
		if c.psSelection then H.SelectContext(c.psSelection.kind, c.psSelection.id, c.Inspect) end
	end, 12)
	c.Inspect:SetPoint("TOPRIGHT", c, "TOPRIGHT", -8, -10)
	c.Inspect.psHomeCard = c
	return c
end

local function fitCard(c, width, fields, buttons, minimum)
	c.Heading:ClearAllPoints()
	c.Heading:SetPoint("TOPLEFT", c, "TOPLEFT", 42, -16)
	c.Heading:SetWidth(max(1, width - 82))
	local y = max(18, c.Heading:GetStringHeight()) + 20
	for _, fs in ipairs(fields) do
		fs:ClearAllPoints()
		fs:SetPoint("TOPLEFT", c, "TOPLEFT", 16, -y)
		fs:SetWidth(max(1, width - 32))
		-- Cards are summaries; the inspector retains the complete wrapped text.
		fs:SetWordWrap(false)
		if fs:IsShown() and (fs:GetText() or "") ~= "" then y = y + fs:GetStringHeight() + 4 end
	end
	if rawget(c, "Line") and c.Line:IsShown() then
		c.Line:ClearAllPoints()
		c.Line:SetPoint("TOPLEFT", c, "TOPLEFT", 16, -y)
		c.Line:SetWidth(max(1, width - 32))
		W.SetProgress(c.Line, data.done / data.total, max(1, width - 32))
		y = y + 14
	end
	local x, row, rowH = 16, y + 4, 0
	for _, b in ipairs(buttons) do
		if b:IsShown() then
			fitButton(b, max(1, width - 32))
			if x > 16 and x + b:GetWidth() > width - 16 then x, row, rowH = 16, row + rowH + 8, 0 end
			b:ClearAllPoints()
			b:SetPoint("TOPLEFT", c, "TOPLEFT", x, -row)
			b.psHomeOffset = row
			x, rowH = x + b:GetWidth() + 12, max(rowH, b:GetHeight())
		end
	end
	c.Mark:SetShown(sameSelection(c.psSelection) and true or false)
	c.Selected:SetShown(sameSelection(c.psSelection) and true or false)
	if c.Icon:SetTexture(Theme.Media(c.psIcon)) == false then c.Icon:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark") end
	return max(minimum or 120, row + rowH + 16)
end

local function sectionExists(key)
	for _, spec in ipairs(UI.Picker.Sections()) do if spec.key == key then return true end end
	return false
end

local function setCard(c, summary, meta, action, run)
	local identity = Content.Key(c.psSelection)
	if keyboardButton == c.Action and (c.Summary:GetText() ~= summary or c.psActionIdentity ~= identity) then clearKeyboard() end
	c.psActionIdentity = identity
	c.Summary:SetText(summary or L["Information unavailable."])
	c.Meta:SetText(meta or "")
	c.psAction = run
	c.Action:SetShown(action ~= nil and run ~= nil)
	if action then W.SetButtonText(c.Action, action) end
end

local function updateDashboard(d)
	local function destination(key) return sectionExists(key) and function() UI.Picker.ShowSection(key) end or nil end
	local build = d.build
	local instance = d.dungeons[1]
	if selection and selection.kind == "dungeon" then
		for _, candidate in ipairs(d.dungeons) do if candidate.key == selection.id then instance = candidate end end
	end
	hero.psSelection = { kind = "continue", id = d.guide and d.guide.id }
	dashboard[2].psSelection = { kind = "build", id = Content.BuildId(build) }
	dashboard[3].psSelection = { kind = "dungeon", id = instance and instance.key }
	dashboard[4].psSelection = { kind = "upcoming", id = d.upNext and d.upNext.guide.id }
	dashboard[5].psSelection = { kind = "training", id = d.player and d.player.class }
	local equipment = Opportunities.GearSelection(d, selection)
	local rare = Opportunities.RareSelection(d, selection)
	dashboard[6].psSelection = { kind = "gear", id = equipment and equipment.key or "equipment" }
	dashboard[7].psSelection = { kind = "rares", id = rare and rare.key or "nearby" }
	setCard(dashboard[2], build and build.build and (build.build.title or build.build.specName) or L["No talent plan available."],
		Content.BuildMeta(d), L["View Talents"], destination("Talents"))
	local dungeonAction = instance and ns.Dungeons and ns.Dungeons.Open and function() ns.Dungeons.Open(instance.key) end or destination("Dungeons")
	setCard(dashboard[3], Content.DungeonSummary(d),
		#d.dungeons > 0 and L["Catalog level matches; check entry requirements in the dungeon journal."] or "",
		instance and L["Open Dungeon"] or L["Open Dungeons"], dungeonAction)
	local nextGuide = d.upNext and d.upNext.guide
	local nextRange = nextGuide and UI.LevelRange(nextGuide.minLevel, nextGuide.maxLevel)
	local nextMeta = nextGuide and (Content.Transition(d.upNext) .. (nextRange and DOT .. nextRange or ""))
	setCard(dashboard[4], nextGuide and (nextGuide.title or nextGuide.id) or L["No suggested guide right now."],
		nextMeta or L["Suggestions follow your journey and location."],
		nextGuide and L["View guide"] or nil, nextGuide and function() UI.Picker.Select(nextGuide.id); choose() end or nil)
	local nearby = ns.Nav and ns.Nav.nearby
	local class = d.player and d.player.class
	setCard(dashboard[5], Opportunities.TrainingSummary(d),
		class and (UI.ClassName(class) .. DOT .. string.format(L["Level %d"], d.player.level or 0)) or L["Class information unavailable."],
		L["Find trainer"], class and nearby and nearby.Go and function() nearby.Go("class") end or nil)
	local gearSummary, gearMeta = Opportunities.GearSummary(d, equipment)
	setCard(dashboard[6], gearSummary, gearMeta, equipment and L["Look up"] or L["Open Lookup"],
		equipment and ns.Lookup and ns.Lookup.Show and function() ns.Lookup.Show(nil, "item", equipment.id) end or destination("Lookup"))
	local rareSummary, rareMeta = Opportunities.RareSummary(d, rare)
	setCard(dashboard[7], rareSummary, (rareMeta or "") .. (d.zone and ((rareMeta and DOT or "") .. d.zone) or ""),
		rare and rare.id and L["Show rare"] or L["Open Rares"],
		rare and rare.id and ns.Rares and ns.Rares.Show and function() ns.Rares.Show("rare", rare.id) end or destination("Rares"))
end

local function layoutHeader(width)
	local context, info = {}, data.player
	if info then
		if info.name then context[#context + 1] = info.name end
		if info.class then context[#context + 1] = UI.ClassName(info.class) end
		if info.level then context[#context + 1] = string.format(L["Level %d"], info.level) end
		if info.faction then context[#context + 1] = ns.FactionName(info.faction) end
	end
	if data.zone and data.zone ~= "" then context[#context + 1] = data.zone end
	header.Context:SetText(table.concat(context, DOT))
	header.Title:SetText(L["Your Journey"])
	-- Both faction emblems ship with the client. Neutral/unknown identity
	-- uses Polestar's own artwork, which is also the rail's brand.
	local faction = info and info.faction
	local emblem = (faction == "Alliance" or faction == "Horde")
		and ("Interface\\TargetingFrame\\UI-PVP-" .. faction) or Theme.Media("emblem")
	if header.Emblem:SetTexture(emblem) == false and header.Emblem:SetTexture(Theme.Media("emblem")) == false then
		header.Emblem:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
	end
	local controlsW = max(160, min(240, floor(width * 0.3)))
	local stacked = width < 560
	local textW = max(1, width - 56 - (stacked and 0 or controlsW + 12))
	header.Title:SetWidth(textW)
	header.Context:ClearAllPoints()
	header.Context:SetPoint("TOPLEFT", header.Title, "BOTTOMLEFT", 0, -6)
	header.Context:SetWidth(textW)
	local textH = max(40, header.Title:GetStringHeight() + header.Context:GetStringHeight() + 6)
	fitButton(header.Customize, controlsW)
	header.Customize:ClearAllPoints()
	header.Customize:SetPoint("TOPRIGHT", header, "TOPRIGHT", 0, stacked and -(textH + 10) or 0)
	header.Toggle:SetShown(selection ~= nil)
	W.SetButtonText(header.Toggle, inspectorOpen and L["Hide details"] or L["Show details"])
	fitButton(header.Toggle, controlsW)
	header.Toggle:ClearAllPoints()
	header.Toggle:SetPoint("TOPRIGHT", header.Customize, "BOTTOMRIGHT", 0, -6)
	local controlsH = header.Customize:GetHeight() + (header.Toggle:IsShown() and header.Toggle:GetHeight() + 6 or 0)
	return (stacked and (textH + 10 + controlsH) or max(textH, controlsH)) + 16
end

local function layoutInspector(width, view)
	if not inspector:IsShown() then return end
	if inspectorDirty then
		inspectorDirty = false
		inspector.SetContext(Content.Resolve(selection, data), width, view)
	else
		inspector.Layout(width, view, themeDirty)
	end
	themeDirty = false
	local G = ns.Gamepad
	if keyboardButton and G.Within(keyboardButton, inspector) and not keyboardButton:IsVisible() then focusKeyboard(inspector.Close) end
end

layout = function(fitting)
	if not fitting then workspaceScale = 1 end
	local d = data
	if not d then return end
	local arrangement, shown = Customize.Read()
	ordered = {}
	for _, spec in ipairs(arrangement) do
		local c = dashboard[spec.index]
		c:SetShown(shown[spec.key])
		if shown[spec.key] then ordered[#ordered + 1] = c end
	end
	if selection and shown[selection.kind] == false then
		selection, inspectorOpen, inspectorDirty = nil, false, true
		if keyboardButton and ns.Gamepad.Within(keyboardButton, inspector) then focusKeyboard(header.Customize) end
		local G = ns.Gamepad
		local focused = G and G.Focused(hub)
		if focused and G.Within(focused, inspector) then G.SetFocus(hub, header.Customize) end
	end
	local pad = W.SHELL.side
	-- The first render precedes section anchoring. Use the shell geometry,
	-- including its live rail width, rather than Guides' narrow BodyWidth.
	local available = max(1, hub:GetWidth() - hub.psRail - 2 - pad * 2)
	-- Keep the shared shell lockup intact; measure its subtitle before placing
	-- Your Journey below it (the Home frame starts 44px below the shell top).
	local _, _, _, _, brandY = hub.Tagline:GetPoint(1)
	local headerTop = max(16, -brandY + hub.Tagline:GetStringHeight() + 12 - 44)
	header:ClearAllPoints()
	header:SetPoint("TOPLEFT", frame, "TOPLEFT", pad, -headerTop)
	header:SetWidth(available)
	local headerH = layoutHeader(available)
	header:SetHeight(headerH)
	local view = max(1, hub:GetHeight() - 2 - 44 - W.SHELL.footer - headerH - headerTop)
	local showInspector = inspectorOpen and selection ~= nil and available >= 760 and view >= 300
	local inlineInspector = inspectorOpen and selection ~= nil and not showInspector
	local inspectorW = min(340, max(240, floor(available * 0.30)))
	local width = (available - (showInspector and (inspectorW + 16) or 0)) / workspaceScale
	scroll.Child:SetScale(workspaceScale)
	inspector:SetShown(showInspector or inlineInspector)
	inspector:SetParent(inlineInspector and scroll.Child or frame)
	inspector.psHomeY = nil
	inspector:ClearAllPoints()
	inspector:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -pad, -headerH - headerTop)
	inspector:SetSize(inspectorW, view)
	scroll:ClearAllPoints()
	scroll:SetPoint("TOPLEFT", frame, "TOPLEFT", 0, -headerH - headerTop)
	scroll:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -(showInspector and (inspectorW + 16) or 0) - pad + 8, 0)
	for _, c in ipairs(dashboard) do c.Inspect:Show() end
	local function place(f, y, h, x, w)
		f:ClearAllPoints()
		f:SetPoint("TOPLEFT", scroll.Child, "TOPLEFT", x or pad, -y)
		f:SetSize(w or width, h)
	end
	scroll.Child:SetWidth(width + pad + 8)
	local g = d.guide
	hero.Heading:SetText(Content.ContinueLabel(g))
	hero.Title:SetText(g and (g.title or g.id) or L["Choose a Guide"])
	hero.GuideMeta:SetText(g and Content.PlayerContext(d) or "")
	hero.Step:SetText(g and (d.step and d.step.title or "") or L["Choose a guide to begin your journey."])
	local goal = Content.LiveGoal(d)
	local objective = goal and UI.GoalText(goal)
	local goalProgress = goal and Content.GoalProgress(goal)
	hero.Objective:SetText(objective and (objective .. (goalProgress and DOT .. goalProgress or "")) or "")
	hero.Detail:SetText(goal and UI.GoalDetail(goal) or "")
	local nextGuide = g and d.upNext and d.upNext.from == g.id and d.upNext
	hero.Next:SetText(nextGuide and (Content.Transition(nextGuide) .. ": " .. (nextGuide.guide.title or nextGuide.guide.id)) or "")
	local progress = g and type(d.total) == "number" and d.total > 0 and type(d.done) == "number"
	hero.Progress:SetShown(progress and true or false)
	hero.Line:SetShown(progress and true or false)
	if progress then
		hero.Progress:SetText(string.format(L["%d of %d steps complete"], d.done, d.total))
	end
	W.SetButtonText(hero.Action, g and L["Continue Guide"] or L["Choose a Guide"])
	hero.Details:SetShown(g ~= nil)
	-- Deduplicate only the finished recommendation result. Never refill its
	-- five-result cap after removing guides represented elsewhere on Home.
	local represented, other = {}, {}
	if g then represented[g.id] = true end
	for i, t in ipairs(d.tabs) do
		if not represented[t.guideId] then
			represented[t.guideId] = true
			other[#other + 1] = { tab = t, index = i }
		end
	end
	updateDashboard(d)
	local gap, top = 8, 0
	hero.Detail:Hide()
	hero.Next:Hide()
	local heroH = fitCard(hero, width, { hero.Title, hero.GuideMeta, hero.Step, hero.Objective, hero.Progress }, { hero.Action, hero.Details }, 144)
	place(hero, top, heroH)
	hero.Action.psHomeY = top + hero.Action.psHomeOffset
	hero.Details.psHomeY = top + (hero.Details.psHomeOffset or 0)
	hero.Inspect.psHomeY = top
	local y = top + heroH + gap
	customizer:SetShown(customizeOpen)
	if customizeOpen then
		local height = customizer.Layout(width)
		place(customizer, y, height); customizer.psHomeY = y
		y = y + height + gap
	end
	-- Keep exact saved order. Supporting cards span two cells on the four-
	-- column grid; compact cards keep their readable width when alone.
	local columns = width >= 4 * 170 + 3 * gap and 4 or width >= 2 * 170 + gap and 2 or 1
	local cell = floor((width - (columns - 1) * gap) / columns)
	local row, used, rowH = {}, 0, 0
	local function finishRow()
		for _, c in ipairs(row) do
			c:SetHeight(rowH)
			if c.Action:IsShown() then
				c.Action:ClearAllPoints(); c.Action:SetPoint("BOTTOMLEFT", c, "BOTTOMLEFT", 16, 16)
				c.Action.psHomeOffset = rowH - c.Action:GetHeight() - 16
				c.Action.psHomeY = y + c.Action.psHomeOffset
			end
		end
		if #row > 0 then y = y + rowH + gap end
		row, used, rowH = {}, 0, 0
	end
	for _, c in ipairs(ordered) do
		local span = columns == 4 and c.psSpec.wide and 2 or 1
		if used + span > columns then finishRow() end
		local cw = span * cell + (span - 1) * gap
		local height = fitCard(c, cw, { c.Summary, c.Meta }, { c.Action }, 112)
		place(c, y, height, pad + used * (cell + gap), cw)
		c.Inspect.psHomeY = y
		row[#row + 1], used, rowH = c, used + span, max(rowH, height)
		if used == columns then finishRow() end
	end
	finishRow()
	if inlineInspector then
		local height = min(440, max(300, view))
		place(inspector, y, height)
		inspector.psHomeY = y
		y = y + height + 16
	end
	-- Refresh after updating card summaries, so an open inspector cannot show
	-- the previous character/guide snapshot.
	layoutInspector(inlineInspector and width or inspectorW, inlineInspector and inspector:GetHeight() or view)
	visibleIds, visibleButtons = {}, {}
	local seen = {}
	local function navigable(b, id, y)
		if seen[id] then return end
		seen[id] = true
		b.psHomeY = y
		visibleIds[#visibleIds + 1] = id
		visibleButtons[#visibleButtons + 1] = b
	end
	if g then navigable(hero.Action, g.id, hero.Action.psHomeY) end
	openHead:SetShown(#other > 0)
	local ox, ow = pad, width
	if #other > 0 then place(openHead, y, 24, ox, ow); y = y + 28 end
	for i, o in ipairs(other) do
		local t = o.tab
		local b, total = entry(cards, i), t.total or 0
		local note = string.format(L["Tab %d"], o.index)
		if total > 0 then note = note .. DOT .. floor((t.done or 0) / total * 100 + 0.5) .. "%" end
		if t.complete then note = note .. DOT .. ns.LC("guide status", "Completed") end
		local height = paint(b, d.byId[t.guideId] or { id = t.guideId, title = t.title }, note, ow)
		place(b, y, height, ox, ow)
		navigable(b, t.guideId, y)
		y = y + height + 8
	end
	for i = #other + 1, #cards do cards[i]:Hide() end
	suggestHead:Hide()
	for _, b in ipairs(rows) do b:Hide() end
	-- Fit the workspace as a unit instead of hiding overflowing cards. Reflow
	-- at its logical width before applying the final scale. Details keep their
	-- own independent scrolling; no gameplay providers are read by this pass.
	if not customizeOpen and not inlineInspector and (y + 16) * workspaceScale > view + 1 then
		workspaceScale = workspaceScale * min(0.95, view / ((y + 16) * workspaceScale))
		return layout(true)
	end
	W.SetScrollContent(scroll, y + 16, view / workspaceScale)
	W.ScrollTo(scroll, 0)
	if keyboardButton and (not keyboardButton:IsVisible() or not keyboardButton:IsEnabled()) then clearKeyboard() end
end

function H.Render()
	if not visible() then return end
	if dirty then dirty = false; data = read(); inspectorDirty = true end
	W.ShellTitle(hub, L["Your Journey"])
	hub.Title:Hide()
	hub.Subtitle:Hide()
	layout()
end
local function invalidate()
	dirty = true
	if not visible() or queued then return end
	queued = true
	C_Timer.After(0, function()
		queued = false
		if visible() and dirty then H.Render() end
	end)
end
function H.Step(delta)
	clearKeyboard()
	local at = 0
	for i, id in ipairs(visibleIds) do if id == UI.Picker.Selected() then at = i break end end
	local id = visibleIds[min(#visibleIds, max(1, at + delta))]
	if not id then return end
	UI.Picker.Select(id)
	H.SelectContext(data.guide and data.guide.id == id and "continue" or "guide", id)
	for i, key in ipairs(visibleIds) do
		if key == id then
			reveal(visibleButtons[i])
			break
		end
	end
end

-- Tab / Shift-Tab reaches independent actions as well as guide choices.
-- Arrow keys retain guide selection; Enter retains its loading semantics.
local function tabFocus(delta)
	local buttons, at = {}, nil
	local function add(b)
		if b:IsVisible() and b:IsEnabled() then
			buttons[#buttons + 1] = b
			if b == keyboardButton then at = #buttons end
		end
	end
	add(hero.Action); add(hero.Details)
	add(hero.Inspect)
	if customizeOpen then for _, b in ipairs(customizer.Controls()) do add(b) end end
	for _, c in ipairs(ordered) do add(c.Action); add(c.Inspect) end
	for _, pool in ipairs({ cards, rows }) do for _, b in ipairs(pool) do add(b) end end
	add(header.Customize); add(header.Toggle)
	for _, b in ipairs(inspector.Controls()) do add(b) end
	if #buttons == 0 then return end
	local b = buttons[((at or (delta > 0 and 0 or 1)) - 1 + delta) % #buttons + 1]
	focusKeyboard(b)
	reveal(b)
end

local function build(parent, shell)
	frame, hub = parent, shell
	hub:HookScript("OnHide", function() dirty = true; clearKeyboard() end)
	header = CreateFrame("Frame", nil, parent)
	header.Emblem = header:CreateTexture(nil, "ARTWORK")
	header.Emblem:SetSize(36, 40)
	header.Emblem:SetPoint("TOPLEFT", header, "TOPLEFT", 0, 0)
	header.Title = W.Text(header, "heading", "text")
	header.Title:SetWordWrap(true)
	header.Title:SetPoint("TOPLEFT", header, "TOPLEFT", 52, 0)
	header.Context = W.Text(header, "small", "textDim")
	header.Context:SetWordWrap(true)
	header.Customize = W.Button(header, L["Customize Home"], H.ToggleCustomization)
	header.Toggle = W.Button(header, L["Hide details"], function()
		if inspectorOpen then H.DismissInspector()
		else inspectorOpen = true; layout(); if inspector.psHomeY then W.ScrollTo(scroll, inspector.psHomeY) end end
	end)
	scroll = W.Scroll(parent)
	hero = card(scroll.Child, L["Continue Leveling"], "guides", true)
	dashboard[1] = hero
	hero.Title, hero.Context = hero.Summary, header.Context
	hero.Step = W.Text(hero, "note", "text")
	hero.Step:SetWordWrap(true)
	hero.GuideMeta = W.Text(hero, "small", "textDim")
	hero.Objective = W.Text(hero, "body", "text")
	hero.Detail = W.Text(hero, "small", "textDim")
	hero.Next = W.Text(hero, "small", "textDim")
	for _, fs in ipairs({ hero.GuideMeta, hero.Objective, hero.Detail, hero.Next }) do fs:SetWordWrap(true) end
	hero.Progress = hero.Meta
	hero.Line = W.ProgressLine(hero, 2)
	hero.Action = W.Button(hero, L["Continue Guide"], continueGuide, { primary = true })
	hero.Details = W.Button(hero, L["Inspect guide details"], function()
		local E = ns.Engine
		local g = E and E.GetGuide and E.GetGuide()
		if g then H.SelectContext("continue", g.id, hero.Details) end
	end)
	for _, spec in ipairs(Customize.Cards) do
		local c = card(scroll.Child, spec.label, spec.icon)
		c.psSpec = spec
		c.Action = W.Button(c, "", function() if c.psAction then c.psAction() end end)
		dashboard[#dashboard + 1] = c
	end
	customizer = Customize.Build(scroll.Child, {
		close = H.ToggleCustomization,
		moved = function(key, button)
			local row = customizer.rows[key]
			local target = keyboardButton or activatingKeyboard and button
			if target and ns.Gamepad.Within(target, row) then
				if not target:IsEnabled() then target = row.Visible; focusKeyboard(target) end
				reveal(target)
			end
			local G = ns.Gamepad
			local focused = G and G.Focused(hub)
			if focused and G.Within(focused, row) then
				if not focused:IsEnabled() then focused = row.Visible; G.SetFocus(hub, focused) end
				reveal(focused)
			end
		end,
	})
	-- Separate non-interactive pools keep traversal in content order even
	-- when more pooled tab/suggestion buttons are created on a later render.
	openCards = CreateFrame("Frame", nil, scroll.Child)
	openCards:SetAllPoints(scroll.Child)
	suggestCards = CreateFrame("Frame", nil, scroll.Child)
	suggestCards:SetAllPoints(scroll.Child)
	openHead = W.SectionHeader(scroll.Child)
	W.SetSection(openHead, L["Open tabs"])
	suggestHead = W.SectionHeader(scroll.Child)
	W.SetSection(suggestHead, L["Suggested for you"])
	inspector = UI.HomeInspector.Build(parent, {
		dismiss = H.DismissInspector,
		act = H.ActivateContext,
		changed = function()
			if keyboardButton and not keyboardButton:IsVisible() then focusKeyboard(inspector.Close) end
		end,
		rebind = function(b)
			if keyboardButton == b then focusKeyboard(inspector.Close) end
			local G = ns.Gamepad
			if G and G.Focused(hub) == b then G.SetFocus(hub, inspector.Close) end
		end,
	})
	parent:EnableKeyboard(true)
	parent:SetPropagateKeyboardInput(true)
	parent:SetScript("OnKeyDown", function(self, key)
		local focused = GetCurrentKeyBoardFocus and GetCurrentKeyBoardFocus()
		local handled = visible() and not focused and not (PolestarMenu and PolestarMenu:IsShown())
			and (key == "UP" or key == "DOWN" or key == "ENTER" or key == "TAB" or (key == "ESCAPE" and (customizeOpen or selection and inspectorOpen)))
		self:SetPropagateKeyboardInput(not handled)
		if handled then
			if key == "ESCAPE" then
				if inspectorOpen and keyboardButton and ns.Gamepad.Within(keyboardButton, inspector) then H.DismissInspector()
				elseif customizeOpen then H.ToggleCustomization() else H.DismissInspector() end
			elseif key == "TAB" then tabFocus(IsShiftKeyDown() and -1 or 1)
			elseif key == "ENTER" and keyboardButton then
				local b = keyboardButton
				clearKeyboard()
				activatingKeyboard = true
				if b.psGuide then pick(b); loadSelected() else focusKeyboard(b); b:Click() end
				activatingKeyboard = false
			elseif key == "ENTER" then enter()
			else H.Step(key == "UP" and -1 or 1) end
		end
	end)
	parent:SetScript("OnSizeChanged", function() if visible() then layout() end end)
	parent:SetScript("OnHide", function()
		clearKeyboard()
		-- Location can change without a guide update while Home is away.
		-- Read once on entry; hidden notifications only mark the snapshot dirty.
		dirty = true
	end)
	H.Frame, H.Scroll, H.Hero, H.Cards, H.Rows = parent, scroll, hero, cards, rows
	H.Header, H.Dashboard, H.Inspector, H.Customizer = header, dashboard, inspector, customizer
end

UI.RegisterSection({ key = "Home", label = L["Home"], icon = "emblem", order = 5, build = build, render = H.Render,
	enter = enter, step = H.Step })
for _, event in ipairs({ "GUIDE_CHANGED", "TABS_CHANGED", "STEP_UPDATED", "GUIDES_REGISTERED", "PACKS_CHANGED", "TALENTS_UPDATED", "RARE_NEARBY", "RARES_HISTORY", "GEAR_UPDATED", "ITEMDB_LOADED", "TRAIN_DUE", "CLASS_TRAINED", "NAMES_LOADED", "NAME_LEARNED", "CODEX_LOADED", "ROUTE_CHOSEN", "WAYPOINT_CHANGED" }) do
	ns.On(event, invalidate)
end
Theme.OnChanged(function()
	themeDirty = true
	if visible() then layout() end
end)
ns.On("SETTING_CHANGED", function(path)
	if path == "home" or path:match("^home%.") then
		if not visible() then dirty = true; return end
		local _, shown = Customize.Read()
		for key, on in pairs(shown) do if on and not data.wanted[key] then dirty = true end end
		H.Render()
		return
	end
	if path == "behavior.suggestFrom" or path == "behavior.routeChoice" or path == "behavior.trainReminder" or path == "behavior" or path == "" or path == "talents" or path:match("^talents%.")
		or path == "dungeons" or path:match("^dungeons%.") or path == "gear" or path:match("^gear%.") or path == "rares" or path:match("^rares%.") then invalidate() end
end)
for _, event in ipairs({ "ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA" }) do
	ns.RegisterEvent(event, invalidate)
end
ns.RegisterEvent("PLAYER_LEVEL_UP", invalidate)
ns.RegisterEvent("PLAYER_ENTERING_WORLD", invalidate)
ns.RegisterEvent("UNIT_NAME_UPDATE", function(unit) if unit == "player" then invalidate() end end)
ns.RegisterEvent("NEUTRAL_FACTION_SELECT_RESULT", invalidate)
for _, event in ipairs({ "QUEST_ACCEPTED", "QUEST_REMOVED", "QUEST_TURNED_IN", "QUEST_LOG_UPDATE" }) do ns.RegisterEvent(event, invalidate) end
for _, event in ipairs({ "TRAINER_SHOW", "TRAINER_UPDATE", "TRAINER_CLOSED", "QUEST_COMPLETE", "QUEST_FINISHED", "PLAYER_MONEY", "GET_ITEM_INFO_RECEIVED", "PLAYER_REGEN_ENABLED" }) do ns.RegisterEvent(event, invalidate) end
