-- Home's account-wide arrangement, using the ordinary settings store. The
-- immutable card catalogue is also Home's layout/keyboard order vocabulary.
local ADDON, ns = ...
local UI, W, Theme, L = ns.UI, ns.Widgets, ns.Theme, ns.L
local C = {}
UI.HomeCustomize = C
C.Cards = {
	{ key = "build", index = 2, label = L["Leveling Build"], icon = "icon-train", wide = true },
	{ key = "dungeon", index = 3, label = L["Dungeons for Your Level"], icon = "icon-dungeon", wide = true },
	{ key = "upcoming", index = 4, label = L["Up Next"], icon = "chevron-right" },
	{ key = "training", index = 5, label = L["Class Training"], icon = "icon-train" },
	{ key = "gear", index = 6, label = L["Gear Opportunities"], icon = "gear" },
	{ key = "rares", index = 7, label = L["Rares Nearby"], icon = "icon-skull" },
}
local byKey, defaults = {}, {}
for i, spec in ipairs(C.Cards) do byKey[spec.key], defaults[i] = spec, spec.key end
ns.RegisterDefaults("home", { layout = { order = defaults, hidden = {} } })

-- Normalize old/malformed preferences without modifying saved/default tables.
-- Unknown/duplicate keys are ignored; newly added cards retain their defaults.
function C.Read()
	local saved, order, shown, seen = ns.Get("home.layout"), {}, {}, {}
	local function add(key)
		if byKey[key] and not seen[key] then order[#order + 1], seen[key] = byKey[key], true end
	end
	if type(saved) == "table" and type(saved.order) == "table" then
		for _, key in ipairs(saved.order) do if type(key) == "string" then add(key) end end
	end
	for _, spec in ipairs(C.Cards) do
		add(spec.key)
		shown[spec.key] = not (type(saved) == "table" and type(saved.hidden) == "table" and saved.hidden[spec.key] == true)
	end
	return order, shown
end
local function save(order, shown)
	local saved = { order = {}, hidden = {} }
	for i, spec in ipairs(order) do saved.order[i] = spec.key; if not shown[spec.key] then saved.hidden[spec.key] = true end end
	ns.Set("home.layout", saved)
end
local function show(key, on)
	local order, shown = C.Read()
	shown[key] = on
	save(order, shown)
end
local function move(key, delta)
	local order, shown = C.Read()
	for i, spec in ipairs(order) do
		if spec.key == key and order[i + delta] then order[i], order[i + delta] = order[i + delta], order[i]; save(order, shown); return end
	end
end
local function fit(b, width)
	b.Label:SetWidth(0); W.SetButtonText(b, b.Label:GetText())
	b:SetWidth(math.min(width, b:GetWidth()))
	b.Label:SetWidth(math.max(1, b:GetWidth() - 2 * Theme.Metric("buttonPad", 16)))
	b.Label:SetWordWrap(true)
	b:SetHeight(math.max(Theme.Metric("buttonH", 28), b.Label:GetStringHeight() + 12))
end

function C.Build(parent, callbacks)
	local f = CreateFrame("Frame", nil, parent)
	Theme.Skin(f, "panel")
	f.Title = W.Text(f, "heading", "text")
	f.Title:SetText(L["Customize Home"]); f.Title:SetWordWrap(true)
	f.Note = W.Text(f, "small", "textDim")
	f.Note:SetText(L["Account-wide layout. Continue Guide stays first. Changes are saved immediately."])
	f.Note:SetWordWrap(true)
	f.Body = W.Scroll(f)
	f.rows = {}
	for _, spec in ipairs(C.Cards) do
		local key = spec.key
		local row = CreateFrame("Frame", nil, f.Body.Child)
		row.Title = W.Text(row, "body", "text"); row.Title:SetWordWrap(true)
		row.Visible = W.Switch(row, function() local _, shown = C.Read(); return shown[key] end,
			function(on) show(key, on) end, spec.label)
		row.Up = W.Button(row, L["Move up"], function(self) move(key, -1); callbacks.moved(key, self) end)
		row.Down = W.Button(row, L["Move down"], function(self) move(key, 1); callbacks.moved(key, self) end)
		f.rows[key] = row
	end
	f.Reset = W.Button(f, L["Restore defaults"], function() ns.Set("home.layout", nil) end)
	f.Done = W.Button(f, L["Done"], callbacks.close, { primary = true })
	function f.Layout(width)
		local inner, y = math.max(1, width - 32), 16
		local function text(fs)
			fs:ClearAllPoints(); fs:SetPoint("TOPLEFT", f, "TOPLEFT", 16, -y); fs:SetWidth(inner)
			y = y + fs:GetStringHeight() + 8
		end
		text(f.Title); text(f.Note)
		local top, cy = y + 4, 0
		local order, shown = C.Read()
		for i, spec in ipairs(order) do
			local row = f.rows[spec.key]
			row:ClearAllPoints(); row:SetPoint("TOPLEFT", f.Body.Child, "TOPLEFT", 0, -cy); row:SetWidth(inner - 8)
			row.Title:SetText(i .. ". " .. spec.label)
			row.Title:ClearAllPoints(); row.Title:SetPoint("TOPLEFT", row, "TOPLEFT", 0, -4)
			row.Visible:ClearAllPoints(); row.Visible:SetPoint("TOPRIGHT", row, "TOPRIGHT", 0, 0); row.Visible:Refresh()
			fit(row.Up, math.max(1, inner - 8)); fit(row.Down, math.max(1, inner - 8))
			row.Up:SetEnabled(i > 1); row.Down:SetEnabled(i < #order)
			local controls = row.Up:GetWidth() + row.Down:GetWidth() + 8
			local inline = inner >= controls + 260
			row.Title:SetWidth(math.max(1, inner - 56 - (inline and controls + 12 or 0)))
			local ry, x, rh = inline and 0 or math.max(28, row.Title:GetStringHeight() + 8), inline and (inner - 56 - controls) or 0, 0
			for _, b in ipairs({ row.Up, row.Down }) do
				if x > 0 and x + b:GetWidth() > inner - 8 then x, ry, rh = 0, ry + rh + 8, 0 end
				b:ClearAllPoints(); b:SetPoint("TOPLEFT", row, "TOPLEFT", x, -ry)
				x, rh = x + b:GetWidth() + 8, math.max(rh, b:GetHeight())
				b.psCustomizeY = cy + ry
			end
			row.Visible.psCustomizeY = cy
			local height = math.max(row.Title:GetStringHeight() + 8, ry + rh) + 12
			row:SetHeight(height); cy = cy + height
		end
		local bodyH = math.min(280, cy)
		f.Body:ClearAllPoints(); f.Body:SetPoint("TOPLEFT", f, "TOPLEFT", 16, -top)
		f.Body:SetSize(inner, bodyH); f.Body.Child:SetWidth(math.max(1, inner - 8))
		f.Body.psCustomizeTop = top
		W.SetScrollContent(f.Body, cy, bodyH)
		y = top + bodyH + 12
		local x, h = 16, 0
		for _, b in ipairs({ f.Reset, f.Done }) do
			fit(b, inner)
			if x > 16 and x + b:GetWidth() > width - 16 then x, y, h = 16, y + h + 8, 0 end
			b:ClearAllPoints(); b:SetPoint("TOPLEFT", f, "TOPLEFT", x, -y)
			b.psCustomizeFooterY = y
			x, h = x + b:GetWidth() + 12, math.max(h, b:GetHeight())
		end
		return y + h + 16
	end
	function f.Controls()
		local out, order = {}, C.Read()
		for _, spec in ipairs(order) do
			local row = f.rows[spec.key]
			for _, b in ipairs({ row.Visible, row.Up, row.Down }) do if b:IsVisible() and b:IsEnabled() then out[#out + 1] = b end end
		end
		out[#out + 1], out[#out + 2] = f.Reset, f.Done
		return out
	end
	function f.Reveal(b)
		local y = rawget(b, "psCustomizeY")
		if y then
			local at = f.Body:GetVerticalScroll()
			if y < at then W.ScrollTo(f.Body, y)
			elseif y + b:GetHeight() > at + f.Body.psView then W.ScrollTo(f.Body, y + b:GetHeight() - f.Body.psView) end
			return f.Body.psCustomizeTop + y - f.Body:GetVerticalScroll(), b:GetHeight()
		end
		return rawget(b, "psCustomizeFooterY") or 0, b:GetHeight()
	end
	f:Hide()
	return f
end
