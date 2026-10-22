-- One Home-owned inspector shell. Content follows HomeContent.lua's plain
-- context contract; this file knows nothing about guides, talents or gameplay.
-- Frames are pooled. Context/tab identity owns session-only tab/scroll memory.
local ADDON, ns = ...
local UI, W, Theme, L = ns.UI, ns.Widgets, ns.Theme, ns.L
local max, min, floor = math.max, math.min, math.floor
local I = {}
UI.HomeInspector = I

local function fitButton(b, width)
	b.Label:SetWidth(0)
	W.SetButtonText(b, b.Label:GetText())
	b:SetWidth(min(width, b:GetWidth()))
	b.Label:SetWidth(max(1, b:GetWidth() - Theme.Metric("buttonPad", 16) * 2))
	b.Label:SetWordWrap(true)
	b:SetHeight(max(Theme.Metric("buttonH", 28), b.Label:GetStringHeight() + 12))
end

function I.Build(parent, callbacks)
	local f = CreateFrame("Frame", nil, parent)
	Theme.Skin(f, "panel")
	f.tabButtons, f.rows, f.rowButtons = {}, {}, {}
	local context, active, memory, width, view = nil, nil, {}, 240, 400
	local needsLayout = true
	local function save()
		if context and active then
			local m = memory[context.key] or { scroll = {} }
			m.tab, m.scroll[active] = active, f.Body:GetVerticalScroll()
			memory[context.key] = m
		end
	end
	local function currentTab()
		for _, t in ipairs(context and context.tabs or {}) do if t.key == active then return t end end
	end
	local function tabButton(i)
		if f.tabButtons[i] then return f.tabButtons[i] end
		local b = CreateFrame("Button", nil, f.Tabs.Child)
		Theme.Skin(b, "tab")
		b.Label = W.Text(b, "small", "textDim")
		b.Label:SetWordWrap(true)
		b.Label:SetPoint("CENTER", b, "CENTER", 0, 0)
		b:SetScript("OnClick", function(self) f.SelectTab(self.psKey) end)
		f.tabButtons[i] = b
		return b
	end
	f.Banner = Theme.Band(f, "BACKGROUND", -1)
	f.Banner:SetPoint("TOPLEFT", f, "TOPLEFT", 1, -1)
	f.Banner:SetPoint("TOPRIGHT", f, "TOPRIGHT", -1, -1)
	f.Emblem = W.Tex(f, "ARTWORK", "emblem", "accent")
	f.Close = W.IconButton(f, "close", 24, L["Hide details"], callbacks.dismiss, 12)
	f.Close:SetPoint("TOPRIGHT", f, "TOPRIGHT", -8, -8)
	f.Tabs = W.Scroll(f)
	f.Primary = W.Scroll(f)
	f.Action = W.Button(f.Primary.Child, "", function() callbacks.act(context and context.key) end, { primary = true })
	f.Action:SetPoint("TOPLEFT", f.Primary.Child, "TOPLEFT", 0, 0)
	f.Body = W.Scroll(f)
	f.Title = W.Text(f.Body.Child, "heading", "text")
	f.Title:SetWordWrap(true)
	f.Meta = W.Text(f.Body.Child, "small", "textDim")
	f.Meta:SetWordWrap(true)
	-- Compatibility names for the first two pooled paragraphs.
	f.Note = W.Text(f.Body.Child, "body", "text")
	f.Hint = W.Text(f.Body.Child, "body", "text")
	f.rows[1], f.rows[2] = f.Note, f.Hint
	f.Note:SetWordWrap(true); f.Hint:SetWordWrap(true)

	function f.Layout(w, h, force)
		w, h = w or width, h or view
		if not force and not needsLayout and width == w and view == h then return end
		width, view, needsLayout = w, h, false
		if not context then return end
		local inner, bannerH = max(1, width - 40), view >= 300 and 64 or 40
		f.Banner:SetHeight(bannerH)
		if f.Emblem:SetTexture(Theme.Media(context.icon or "emblem")) == false then
			f.Emblem:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
		end
		local size = min(32, bannerH - 16)
		f.Emblem:SetSize(size, size)
		f.Emblem:ClearAllPoints()
		f.Emblem:SetPoint("TOPLEFT", f, "TOPLEFT", 16, -(bannerH - size) / 2)
		local x, y, rowH = 0, 0, 0
		for i, t in ipairs(context.tabs or {}) do
			local b = tabButton(i)
			if b.psKey and b.psKey ~= t.key and callbacks.rebind then callbacks.rebind(b) end
			b.psKey = t.key
			b.Label:SetText(t.label)
			b.Label:SetWidth(0)
			local bw = min(inner, max(64, floor(b.Label:GetStringWidth() + 24)))
			b.Label:SetWidth(max(1, bw - 16))
			local bh = max(28, b.Label:GetStringHeight() + 12)
			if x > 0 and x + bw > inner then x, y, rowH = 0, y + rowH + 4, 0 end
			b:ClearAllPoints()
			b:SetPoint("TOPLEFT", f.Tabs.Child, "TOPLEFT", x, -y)
			b.psInspectorY = y
			b:SetSize(bw, bh)
			Theme.SetTabSelected(b, t.key == active)
			W.Color(b.Label, t.key == active and "text" or "textDim")
			b:Show()
			x, rowH = x + bw + 4, max(rowH, bh)
		end
		for i = #(context.tabs or {}) + 1, #f.tabButtons do f.tabButtons[i]:Hide() end
		local tabsH = #(context.tabs or {}) > 1 and min(y + rowH, max(28, floor(view * 0.26))) or 0
		f.Tabs:SetShown(tabsH > 0)
		f.Tabs:ClearAllPoints()
		f.Tabs:SetPoint("TOPLEFT", f, "TOPLEFT", 16, -bannerH - 8)
		f.Tabs:SetSize(inner + 8, max(1, tabsH))
		f.Tabs.psInspectorTop = bannerH + 8
		f.Tabs.Child:SetWidth(inner)
		W.SetScrollContent(f.Tabs, y + rowH, max(1, tabsH))
		local actionH = 0
		f.Primary:SetShown(context.action ~= nil)
		if context.action then
			W.SetButtonText(f.Action, context.action.label)
			fitButton(f.Action, inner)
			actionH = min(f.Action:GetHeight(), max(28, floor(view * 0.25))) + 12
			W.SetScrollContent(f.Primary, f.Action:GetHeight(), actionH - 12)
		end
		f.Primary:ClearAllPoints()
		f.Primary:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 16, 16)
		f.Primary:SetSize(inner + 8, max(1, actionH - 12))
		f.Primary.psInspectorTop = view - 16 - max(1, actionH - 12)
		f.Primary.Child:SetWidth(inner)
		local top = bannerH + (tabsH > 0 and tabsH + 16 or 12)
		local bodyView = max(1, view - top - actionH - 16)
		f.Body:ClearAllPoints()
		f.Body:SetPoint("TOPLEFT", f, "TOPLEFT", 16, -top)
		f.Body:SetSize(inner + 8, bodyView)
		f.Body.psInspectorTop = top
		f.Body.Child:SetWidth(inner)
		local cy = 0
		local function text(fs, value)
			fs:SetText(value or "")
			fs:SetShown(value ~= nil and value ~= "")
			fs:ClearAllPoints()
			fs:SetPoint("TOPLEFT", f.Body.Child, "TOPLEFT", 0, -cy)
			fs:SetWidth(inner)
			if fs:IsShown() then cy = cy + fs:GetStringHeight() + 12 end
		end
		text(f.Title, context.title); text(f.Meta, context.meta)
		local t = currentTab()
		local rows = t and t.rows or {}
		for i, value in ipairs(rows) do
			if type(value) == "table" and value.action then
				if f.rows[i] then f.rows[i]:Hide() end
				local b = f.rowButtons[i]
				if not b then
					b = W.Button(f.Body.Child, "", function(self) callbacks.act(context and context.key, self.psActionKey, self) end)
					f.rowButtons[i] = b
				end
				if b.psActionKey and b.psActionKey ~= value.action.key and callbacks.rebind then callbacks.rebind(b) end
				b.psActionKey = value.action.key
				W.SetButtonText(b, value.action.label)
				fitButton(b, inner)
				b:ClearAllPoints(); b:SetPoint("TOPLEFT", f.Body.Child, "TOPLEFT", 0, -cy)
				b.psInspectorBodyY = cy
				b:Show()
				cy = cy + b:GetHeight() + 12
			else
				if f.rowButtons[i] then f.rowButtons[i]:Hide() end
				if not f.rows[i] then f.rows[i] = W.Text(f.Body.Child, "body", "text"); f.rows[i]:SetWordWrap(true) end
				text(f.rows[i], value)
			end
		end
		for i, fs in pairs(f.rows) do if i > #rows then fs:Hide() end end
		for i, b in pairs(f.rowButtons) do if i > #rows then b:Hide() end end
		W.SetScrollContent(f.Body, cy + 4, bodyView)
	end

	function f.SetContext(value, w, h)
		save()
		context = value
		local m = memory[value.key]
		active = m and m.tab or nil
		if not currentTab() then active = value.tabs and value.tabs[1] and value.tabs[1].key end
		f.Context, f.ActiveTab = value, active
		needsLayout = true
		f.Layout(w, h)
		W.ScrollTo(f.Body, m and m.scroll[active] or 0)
		for _, b in ipairs(f.tabButtons) do if b.psKey == active then f.Reveal(b) end end
	end
	function f.SelectTab(key)
		if key == active then return end
		local found
		for _, t in ipairs(context and context.tabs or {}) do if t.key == key then found = true end end
		if not found then return end
		save()
		active, f.ActiveTab = key, key
		needsLayout = true
		f.Layout()
		local m = memory[context.key]
		W.ScrollTo(f.Body, m and m.scroll[key] or 0)
		if callbacks.changed then callbacks.changed() end
	end
	function f.Controls()
		local out = {}
		for _, b in ipairs(f.tabButtons) do if b:IsVisible() then out[#out + 1] = b end end
		local t = currentTab()
		for i = 1, #(t and t.rows or {}) do
			local b = f.rowButtons[i]
			if b and b:IsVisible() then out[#out + 1] = b end
		end
		if f.Action:IsVisible() then out[#out + 1] = f.Action end
		out[#out + 1] = f.Close
		return out
	end
	function f.Reveal(b)
		if rawget(b, "psInspectorBodyY") then
			local y, at = b.psInspectorBodyY, f.Body:GetVerticalScroll()
			if y < at then W.ScrollTo(f.Body, y)
			elseif y + b:GetHeight() > at + f.Body.psView then W.ScrollTo(f.Body, y + b:GetHeight() - f.Body.psView) end
		end
		if rawget(b, "psInspectorY") then
			local y, at = b.psInspectorY, f.Tabs:GetVerticalScroll()
			if y < at then W.ScrollTo(f.Tabs, y)
			elseif y + b:GetHeight() > at + f.Tabs.psView then W.ScrollTo(f.Tabs, y + b:GetHeight() - f.Tabs.psView) end
		end
		if b == f.Action then return f.Primary.psInspectorTop, f.Primary.psView end
		if b == f.Close then return 8, b:GetHeight() end
		if rawget(b, "psInspectorBodyY") then return f.Body.psInspectorTop + b.psInspectorBodyY - f.Body:GetVerticalScroll(), b:GetHeight() end
		if rawget(b, "psInspectorY") then return f.Tabs.psInspectorTop + b.psInspectorY - f.Tabs:GetVerticalScroll(), b:GetHeight() end
		return 0, b:GetHeight()
	end
	f:HookScript("OnHide", save)
	return f
end
