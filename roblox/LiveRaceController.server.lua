--[[
    =============================================================================
    ROBLOX LIVE RACE CONTROLLER v2.2 (TikInfinity Bridge & In-Game Host HUD)
    =============================================================================
    Letakkan script ini di: ServerScriptService -> Script (Bukan LocalScript)
    
    Fitur Baru:
    1. In-Game Host HUD: Tombol kontrol langsung di layar Roblox (Mulai Balap, Tambah, Hapus, Reset).
    2. Hitungan Mundur Dramatis: 3.. 2.. 1.. GOOO! (Visual teks raksasa + suara revving knalpot).
    3. Sinkronisasi penuh dengan Web Dashboard TikInfinity (http://127.0.0.1:8000).
    4. Auto-spawn Mobil & Motor dengan Billboard nama penonton TikTok.
    5. Power-up Mawar (Boost 1x/5x), Donut (Turbo Api), Topi (Roket Penembak Lawan).
    =============================================================================
]]

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

local API_BASE_URL = "http://127.0.0.1:8000"
local POLL_INTERVAL = 0.35
local BASE_SPEED = 28

-- RemoteEvent untuk sinyal kamera dinamis & VIP gift fokus
local cameraRemote = ReplicatedStorage:FindFirstChild("RaceCameraRemote")
if not cameraRemote then
    cameraRemote = Instance.new("RemoteEvent")
    cameraRemote.Name = "RaceCameraRemote"
    cameraRemote.Parent = ReplicatedStorage
end

-- State internal balapan
local isRaceRunning = false
local isCountingDown = false
local totalLaps = 3
local lastActionId = 0
local racers = {} -- user_id -> table data racer
local waypoints = {}
local vehiclePreference = "mixed"

-- Warna-warni cerah kendaraan
local VEHICLE_COLORS = {
    Color3.fromRGB(244, 63, 94),   -- Merah Rose
    Color3.fromRGB(59, 130, 246),  -- Biru Elektrik
    Color3.fromRGB(16, 185, 129),  -- Hijau Neon
    Color3.fromRGB(234, 179, 8),   -- Kuning Emas
    Color3.fromRGB(168, 85, 247),  -- Ungu Neon
    Color3.fromRGB(249, 115, 22),  -- Oranye Sport
    Color3.fromRGB(6, 182, 212),   -- Cyan Turbo
    Color3.fromRGB(236, 72, 153),  -- Pink Magenta
}

-- Setup Audio Sederhana (Beep & Horn resmi bawaan engine Roblox, bebas error)
local countdownSound = Instance.new("Sound")
countdownSound.Name = "CountdownBeep"
countdownSound.SoundId = "rbxasset://sounds/electronicpingshort.wav"
countdownSound.Volume = 1
countdownSound.Parent = workspace

-- =============================================================================
-- DETEKSI SPOT GRID START RESMI (MISANO CIRCUIT / RORACING / MODULAR)
-- =============================================================================
local function findGridSpots()
    local spotContainers = {
        workspace:FindFirstChild("Gridspots", true),
        workspace:FindFirstChild("MotoGP Grid", true),
        workspace:FindFirstChild("Starting Grid", true),
        workspace:FindFirstChild("Grid", true),
        workspace:FindFirstChild("StartingSpots", true),
        workspace:FindFirstChild("GridSpots", true),
    }

    for _, container in ipairs(spotContainers) do
        if container then
            local spots = {}
            for _, child in ipairs(container:GetChildren()) do
                if child:IsA("BasePart") or child:IsA("Model") then
                    table.insert(spots, child)
                end
            end
            if #spots > 0 then
                table.sort(spots, function(a, b)
                    local na = tonumber(a.Name:match("%d+")) or 999
                    local nb = tonumber(b.Name:match("%d+")) or 999
                    if na ~= nb then return na < nb end
                    return a.Name < b.Name
                end)
                return spots
            end
        end
    end
    return nil
end

-- Pastikan folder Waypoints tersedia
local function setupWaypoints()
    waypoints = {}
    local wpFolder = workspace:FindFirstChild("RaceWaypoints")
    if wpFolder and #wpFolder:GetChildren() > 0 then
        local children = wpFolder:GetChildren()
        table.sort(children, function(a, b) return a.Name < b.Name end)
        for _, child in ipairs(children) do
            if child:IsA("BasePart") then
                table.insert(waypoints, child)
            end
        end
        return
    end

    -- Cek jika Sirkuit Misano World Circuit terpasang di Workspace
    local misano = workspace:FindFirstChild("[V1.1] Misano World Circuit Marco Simoncelli", true)
        or workspace:FindFirstChild("Misano World Circuit Marco Simoncelli", true)
        or workspace:FindFirstChild("Misano", true)

    if misano then
        local turns = {}
        for _, desc in ipairs(misano:GetDescendants()) do
            if desc:IsA("Model") and desc.Name:lower():find("turn ") then
                local num = tonumber(desc.Name:match("Turn%s+(%d+)"))
                if num then
                    local primary = desc.PrimaryPart or desc:FindFirstChildWhichIsA("BasePart")
                    if primary then
                        table.insert(turns, { num = num, part = primary, name = desc.Name })
                    end
                end
            end
        end

        if #turns >= 4 then
            table.sort(turns, function(a, b) return a.num < b.num end)
            
            if not wpFolder then
                wpFolder = Instance.new("Folder")
                wpFolder.Name = "RaceWaypoints"
                wpFolder.Parent = workspace
            end

            -- Waypoint awal pada garis start / gridspot 1
            local spots = findGridSpots()
            if spots and #spots > 0 then
                local s1 = spots[1]:IsA("Model") and (spots[1].PrimaryPart or spots[1]:FindFirstChildWhichIsA("BasePart")) or spots[1]
                if s1 then
                    table.insert(waypoints, s1)
                end
            end

            for _, t in ipairs(turns) do
                table.insert(waypoints, t.part)
            end
            print("🏁 Sirkuit Misano World Circuit Terdeteksi! Total Waypoint Tikungan:", #waypoints)
            return
        end
    end

    -- Sirkuit Standar Oval Stadium
    if not wpFolder then
        wpFolder = Instance.new("Folder")
        wpFolder.Name = "RaceWaypoints"
        wpFolder.Parent = workspace
        
        local radiusX = 140
        local radiusZ = 90
        local center = Vector3.new(0, 5, 0)
        local count = 16
        for i = 1, count do
            local angle = (i / count) * math.pi * 2
            local pos = center + Vector3.new(math.cos(angle) * radiusX, 0, math.sin(angle) * radiusZ)
            
            local node = Instance.new("Part")
            node.Name = string.format("WP_%02d", i)
            node.Size = Vector3.new(4, 1, 4)
            node.Position = pos
            node.Anchored = true
            node.CanCollide = false
            node.Transparency = 0.8
            node.BrickColor = BrickColor.new("Bright yellow")
            node.Parent = wpFolder
            table.insert(waypoints, node)
        end
    end
end

-- =============================================================================
-- PEMBUAT KENDARAAN (MOBIL & MOTOR 3D PROCEDURAL)
-- =============================================================================
local function createCarModel(color)
    local car = Instance.new("Model")
    car.Name = "RacerCar"

    local chassis = Instance.new("Part")
    chassis.Name = "PrimaryPart"
    chassis.Size = Vector3.new(7, 2, 12)
    chassis.Material = Enum.Material.SmoothPlastic
    chassis.Color = color
    chassis.Anchored = false
    chassis.CanCollide = true
    chassis.Parent = car
    car.PrimaryPart = chassis

    local roof = Instance.new("Part")
    roof.Size = Vector3.new(5.5, 1.8, 6)
    roof.Position = chassis.Position + Vector3.new(0, 1.8, -0.5)
    roof.Color = Color3.fromRGB(30, 41, 59)
    roof.Material = Enum.Material.Glass
    roof.Transparency = 0.3
    roof.Anchored = false
    roof.CanCollide = false
    roof.Parent = car
    local roofWeld = Instance.new("WeldConstraint")
    roofWeld.Part0 = chassis
    roofWeld.Part1 = roof
    roofWeld.Parent = chassis

    local spoiler = Instance.new("Part")
    spoiler.Size = Vector3.new(6.5, 0.4, 1.5)
    spoiler.Position = chassis.Position + Vector3.new(0, 2.2, 5.2)
    spoiler.Color = Color3.fromRGB(15, 23, 42)
    spoiler.Anchored = false
    spoiler.CanCollide = false
    spoiler.Parent = car
    local spWeld = Instance.new("WeldConstraint")
    spWeld.Part0 = chassis
    spWeld.Part1 = spoiler
    spWeld.Parent = chassis

    local exhaust = Instance.new("Part")
    exhaust.Name = "Exhaust"
    exhaust.Size = Vector3.new(1.2, 0.6, 0.6)
    exhaust.Position = chassis.Position + Vector3.new(0, 0, 6.2)
    exhaust.Color = Color3.fromRGB(71, 85, 105)
    exhaust.Anchored = false
    exhaust.CanCollide = false
    exhaust.Parent = car
    local exWeld = Instance.new("WeldConstraint")
    exWeld.Part0 = chassis
    exWeld.Part1 = exhaust
    exWeld.Parent = chassis

    local fire = Instance.new("Fire")
    fire.Name = "TurboFire"
    fire.Size = 4
    fire.Heat = 12
    fire.Color = Color3.fromRGB(249, 115, 22)
    fire.SecondaryColor = Color3.fromRGB(234, 179, 8)
    fire.Enabled = false
    fire.Parent = exhaust

    local smoke = Instance.new("Smoke")
    smoke.Name = "RevSmoke"
    smoke.Size = 2
    smoke.RiseVelocity = 3
    smoke.Color = Color3.fromRGB(200, 200, 200)
    smoke.Enabled = false
    smoke.Parent = exhaust

    local wheelOffsets = {
        Vector3.new(3.8, -0.6, 4),
        Vector3.new(-3.8, -0.6, 4),
        Vector3.new(3.8, -0.6, -4),
        Vector3.new(-3.8, -0.6, -4),
    }
    for _, offset in ipairs(wheelOffsets) do
        local wheel = Instance.new("Part")
        wheel.Shape = Enum.PartType.Cylinder
        wheel.Size = Vector3.new(1.4, 2.8, 2.8)
        wheel.CFrame = (chassis.CFrame + offset) * CFrame.Angles(0, 0, math.rad(90))
        wheel.Color = Color3.fromRGB(15, 23, 42)
        wheel.Material = Enum.Material.Rubber
        wheel.Anchored = false
        wheel.CanCollide = false
        wheel.Parent = car
        local wWeld = Instance.new("WeldConstraint")
        wWeld.Part0 = chassis
        wWeld.Part1 = wheel
        wWeld.Parent = chassis
    end

    return car, chassis, exhaust
end

local function createMotorcycleModel(color)
    local bike = Instance.new("Model")
    bike.Name = "RacerMotorcycle"

    local frame = Instance.new("Part")
    frame.Name = "PrimaryPart"
    frame.Size = Vector3.new(2.2, 2.6, 9)
    frame.Material = Enum.Material.SmoothPlastic
    frame.Color = color
    frame.Anchored = false
    frame.CanCollide = true
    frame.Parent = bike
    bike.PrimaryPart = frame

    local tank = Instance.new("Part")
    tank.Size = Vector3.new(2.4, 1.4, 3.5)
    tank.Position = frame.Position + Vector3.new(0, 1.6, -1.2)
    tank.Color = Color3.fromRGB(15, 23, 42)
    tank.Anchored = false
    tank.CanCollide = false
    tank.Parent = bike
    local tWeld = Instance.new("WeldConstraint")
    tWeld.Part0 = frame
    tWeld.Part1 = tank
    tWeld.Parent = frame

    local handlebar = Instance.new("Part")
    handlebar.Size = Vector3.new(4.8, 0.4, 0.4)
    handlebar.Position = frame.Position + Vector3.new(0, 2.2, -2.8)
    handlebar.Color = Color3.fromRGB(203, 213, 225)
    handlebar.Anchored = false
    handlebar.CanCollide = false
    handlebar.Parent = bike
    local hWeld = Instance.new("WeldConstraint")
    hWeld.Part0 = frame
    hWeld.Part1 = handlebar
    hWeld.Parent = frame

    local exhaust = Instance.new("Part")
    exhaust.Name = "Exhaust"
    exhaust.Size = Vector3.new(0.8, 0.8, 2.5)
    exhaust.Position = frame.Position + Vector3.new(1.3, -0.4, 3.2)
    exhaust.Color = Color3.fromRGB(148, 163, 184)
    exhaust.Anchored = false
    exhaust.CanCollide = false
    exhaust.Parent = bike
    local exWeld = Instance.new("WeldConstraint")
    exWeld.Part0 = frame
    exWeld.Part1 = exhaust
    exWeld.Parent = frame

    local fire = Instance.new("Fire")
    fire.Name = "TurboFire"
    fire.Size = 4
    fire.Heat = 12
    fire.Color = Color3.fromRGB(249, 115, 22)
    fire.SecondaryColor = Color3.fromRGB(234, 179, 8)
    fire.Enabled = false
    fire.Parent = exhaust

    local smoke = Instance.new("Smoke")
    smoke.Name = "RevSmoke"
    smoke.Size = 2
    smoke.RiseVelocity = 3
    smoke.Color = Color3.fromRGB(200, 200, 200)
    smoke.Enabled = false
    smoke.Parent = exhaust

    local wheels = {
        Vector3.new(0, -0.6, -3.8),
        Vector3.new(0, -0.6, 3.8),
    }
    for _, offset in ipairs(wheels) do
        local wheel = Instance.new("Part")
        wheel.Shape = Enum.PartType.Cylinder
        wheel.Size = Vector3.new(1.2, 3.2, 3.2)
        wheel.CFrame = (frame.CFrame + offset) * CFrame.Angles(0, 0, math.rad(90))
        wheel.Color = Color3.fromRGB(15, 23, 42)
        wheel.Material = Enum.Material.Rubber
        wheel.Anchored = false
        wheel.CanCollide = false
        wheel.Parent = bike
        local wWeld = Instance.new("WeldConstraint")
        wWeld.Part0 = frame
        wWeld.Part1 = wheel
        wWeld.Parent = frame
    end

    return bike, frame, exhaust
end

-- =============================================================================
-- SUPERCAR BUILDERS (FERRARI, LAMBORGHINI, BUGATTI) & ASSET LOADER
-- =============================================================================
local function createFerrariModel(color)
    local car = Instance.new("Model")
    car.Name = "FerrariSupercar"

    local ferrariRed = Color3.fromRGB(220, 38, 38)
    local chassis = Instance.new("Part")
    chassis.Name = "PrimaryPart"
    chassis.Size = Vector3.new(7.2, 1.8, 12.5)
    chassis.Material = Enum.Material.SmoothPlastic
    chassis.Color = ferrariRed
    chassis.Anchored = false
    chassis.CanCollide = true
    chassis.Parent = car
    car.PrimaryPart = chassis

    -- Front Carbon Splitter
    local splitter = Instance.new("Part")
    splitter.Size = Vector3.new(7.6, 0.4, 2)
    splitter.Position = chassis.Position + Vector3.new(0, -0.6, -5.8)
    splitter.Color = Color3.fromRGB(15, 23, 42)
    splitter.Anchored = false
    splitter.CanCollide = false
    splitter.Parent = car
    local sWeld = Instance.new("WeldConstraint")
    sWeld.Part0 = chassis
    sWeld.Part1 = splitter
    sWeld.Parent = chassis

    -- Ferrari Yellow Badge
    local badge = Instance.new("Part")
    badge.Size = Vector3.new(0.8, 0.2, 0.8)
    badge.Position = chassis.Position + Vector3.new(0, 0.95, -4.2)
    badge.Color = Color3.fromRGB(250, 204, 21)
    badge.Material = Enum.Material.Neon
    badge.Anchored = false
    badge.CanCollide = false
    badge.Parent = car
    local bWeld = Instance.new("WeldConstraint")
    bWeld.Part0 = chassis
    bWeld.Part1 = badge
    bWeld.Parent = chassis

    -- Aero Cockpit Glass
    local cockpit = Instance.new("Part")
    cockpit.Size = Vector3.new(5.2, 1.5, 6.2)
    cockpit.Position = chassis.Position + Vector3.new(0, 1.6, -0.2)
    cockpit.Color = Color3.fromRGB(15, 23, 42)
    cockpit.Material = Enum.Material.Glass
    cockpit.Transparency = 0.35
    cockpit.Anchored = false
    cockpit.CanCollide = false
    cockpit.Parent = car
    local cWeld = Instance.new("WeldConstraint")
    cWeld.Part0 = chassis
    cWeld.Part1 = cockpit
    cWeld.Parent = chassis

    -- Rear Aero Wing & Diffuser
    local wing = Instance.new("Part")
    wing.Size = Vector3.new(6.8, 0.3, 1.4)
    wing.Position = chassis.Position + Vector3.new(0, 1.8, 5.6)
    wing.Color = Color3.fromRGB(15, 23, 42)
    wing.Anchored = false
    wing.CanCollide = false
    wing.Parent = car
    local wWeld = Instance.new("WeldConstraint")
    wWeld.Part0 = chassis
    wWeld.Part1 = wing
    wWeld.Parent = chassis

    -- Quad Racing Exhaust
    local exhaust = Instance.new("Part")
    exhaust.Name = "Exhaust"
    exhaust.Size = Vector3.new(2.4, 0.6, 0.6)
    exhaust.Position = chassis.Position + Vector3.new(0, -0.2, 6.4)
    exhaust.Color = Color3.fromRGB(51, 65, 85)
    exhaust.Anchored = false
    exhaust.CanCollide = false
    exhaust.Parent = car
    local exWeld = Instance.new("WeldConstraint")
    exWeld.Part0 = chassis
    exWeld.Part1 = exhaust
    exWeld.Parent = chassis

    local fire = Instance.new("Fire")
    fire.Name = "TurboFire"
    fire.Size = 5
    fire.Heat = 14
    fire.Color = Color3.fromRGB(239, 68, 68)
    fire.SecondaryColor = Color3.fromRGB(245, 158, 11)
    fire.Enabled = false
    fire.Parent = exhaust

    -- Wheels
    local wheelOffsets = {
        Vector3.new(3.8, -0.6, 4.2),
        Vector3.new(-3.8, -0.6, 4.2),
        Vector3.new(3.8, -0.6, -4.2),
        Vector3.new(-3.8, -0.6, -4.2),
    }
    for _, offset in ipairs(wheelOffsets) do
        local wheel = Instance.new("Part")
        wheel.Shape = Enum.PartType.Cylinder
        wheel.Size = Vector3.new(1.4, 2.8, 2.8)
        wheel.CFrame = (chassis.CFrame + offset) * CFrame.Angles(0, 0, math.rad(90))
        wheel.Color = Color3.fromRGB(15, 23, 42)
        wheel.Material = Enum.Material.Rubber
        wheel.Anchored = false
        wheel.CanCollide = false
        wheel.Parent = car
        local ww = Instance.new("WeldConstraint")
        ww.Part0 = chassis
        ww.Part1 = wheel
        ww.Parent = chassis
    end

    return car, chassis, exhaust
end

local function createLamborghiniModel(color)
    local car = Instance.new("Model")
    car.Name = "LamborghiniSupercar"

    local lamboYellow = Color3.fromRGB(234, 179, 8)
    local chassis = Instance.new("Part")
    chassis.Name = "PrimaryPart"
    chassis.Size = Vector3.new(7.4, 1.7, 12.8)
    chassis.Material = Enum.Material.SmoothPlastic
    chassis.Color = lamboYellow
    chassis.Anchored = false
    chassis.CanCollide = true
    chassis.Parent = car
    car.PrimaryPart = chassis

    -- Sharp Angular Nose
    local nose = Instance.new("WedgePart")
    nose.Size = Vector3.new(7, 1.4, 3)
    nose.CFrame = (chassis.CFrame + Vector3.new(0, -0.15, -6.5)) * CFrame.Angles(0, math.rad(180), 0)
    nose.Color = lamboYellow
    nose.Anchored = false
    nose.CanCollide = false
    nose.Parent = car
    local nWeld = Instance.new("WeldConstraint")
    nWeld.Part0 = chassis
    nWeld.Part1 = nose
    nWeld.Parent = chassis

    -- Stealth Canopy
    local canopy = Instance.new("Part")
    canopy.Size = Vector3.new(5.0, 1.5, 6)
    canopy.Position = chassis.Position + Vector3.new(0, 1.5, -0.4)
    canopy.Color = Color3.fromRGB(15, 23, 42)
    canopy.Material = Enum.Material.Glass
    canopy.Transparency = 0.25
    canopy.Anchored = false
    canopy.CanCollide = false
    canopy.Parent = car
    local cWeld = Instance.new("WeldConstraint")
    cWeld.Part0 = chassis
    cWeld.Part1 = canopy
    cWeld.Parent = chassis

    -- High Carbon GT Wing
    local wing = Instance.new("Part")
    wing.Size = Vector3.new(7.6, 0.4, 1.6)
    wing.Position = chassis.Position + Vector3.new(0, 2.4, 5.5)
    wing.Color = Color3.fromRGB(15, 23, 42)
    wing.Anchored = false
    wing.CanCollide = false
    wing.Parent = car
    local wWeld = Instance.new("WeldConstraint")
    wWeld.Part0 = chassis
    wWeld.Part1 = wing
    wWeld.Parent = chassis

    -- Twin Central Hex Exhaust
    local exhaust = Instance.new("Part")
    exhaust.Name = "Exhaust"
    exhaust.Size = Vector3.new(1.6, 0.8, 0.8)
    exhaust.Position = chassis.Position + Vector3.new(0, 0.2, 6.5)
    exhaust.Color = Color3.fromRGB(30, 41, 59)
    exhaust.Anchored = false
    exhaust.CanCollide = false
    exhaust.Parent = car
    local exWeld = Instance.new("WeldConstraint")
    exWeld.Part0 = chassis
    exWeld.Part1 = exhaust
    exWeld.Parent = chassis

    local fire = Instance.new("Fire")
    fire.Name = "TurboFire"
    fire.Size = 5
    fire.Heat = 16
    fire.Color = Color3.fromRGB(6, 182, 212)
    fire.SecondaryColor = Color3.fromRGB(249, 115, 22)
    fire.Enabled = false
    fire.Parent = exhaust

    -- Wheels
    local wheelOffsets = {
        Vector3.new(3.8, -0.6, 4.4),
        Vector3.new(-3.8, -0.6, 4.4),
        Vector3.new(3.8, -0.6, -4.0),
        Vector3.new(-3.8, -0.6, -4.0),
    }
    for _, offset in ipairs(wheelOffsets) do
        local wheel = Instance.new("Part")
        wheel.Shape = Enum.PartType.Cylinder
        wheel.Size = Vector3.new(1.5, 3.0, 3.0)
        wheel.CFrame = (chassis.CFrame + offset) * CFrame.Angles(0, 0, math.rad(90))
        wheel.Color = Color3.fromRGB(15, 23, 42)
        wheel.Material = Enum.Material.Rubber
        wheel.Anchored = false
        wheel.CanCollide = false
        wheel.Parent = car
        local ww = Instance.new("WeldConstraint")
        ww.Part0 = chassis
        ww.Part1 = wheel
        ww.Parent = chassis
    end

    return car, chassis, exhaust
end

local function createBugattiModel(color)
    local car = Instance.new("Model")
    car.Name = "BugattiHypercar"

    local bugattiBlue = Color3.fromRGB(2, 132, 199)
    local chassis = Instance.new("Part")
    chassis.Name = "PrimaryPart"
    chassis.Size = Vector3.new(7.6, 2.0, 13)
    chassis.Material = Enum.Material.SmoothPlastic
    chassis.Color = bugattiBlue
    chassis.Anchored = false
    chassis.CanCollide = true
    chassis.Parent = car
    car.PrimaryPart = chassis

    -- Bugatti Horseshoe Grille
    local grille = Instance.new("Part")
    grille.Size = Vector3.new(2.4, 1.2, 0.4)
    grille.Position = chassis.Position + Vector3.new(0, -0.2, -6.6)
    grille.Color = Color3.fromRGB(226, 232, 240)
    grille.Material = Enum.Material.SmoothPlastic
    grille.Anchored = false
    grille.CanCollide = false
    grille.Parent = car
    local gWeld = Instance.new("WeldConstraint")
    gWeld.Part0 = chassis
    gWeld.Part1 = grille
    gWeld.Parent = chassis

    -- Black Side C-Bar
    local cBar = Instance.new("Part")
    cBar.Size = Vector3.new(7.8, 1.8, 5.5)
    cBar.Position = chassis.Position + Vector3.new(0, 0.1, 0.5)
    cBar.Color = Color3.fromRGB(15, 23, 42)
    cBar.Anchored = false
    cBar.CanCollide = false
    cBar.Parent = car
    local cbWeld = Instance.new("WeldConstraint")
    cbWeld.Part0 = chassis
    cbWeld.Part1 = cBar
    cbWeld.Parent = chassis

    -- Active Aero Spoiler
    local spoiler = Instance.new("Part")
    spoiler.Size = Vector3.new(7.2, 0.4, 1.8)
    spoiler.Position = chassis.Position + Vector3.new(0, 2.2, 5.6)
    spoiler.Color = bugattiBlue
    spoiler.Anchored = false
    spoiler.CanCollide = false
    spoiler.Parent = car
    local spWeld = Instance.new("WeldConstraint")
    spWeld.Part0 = chassis
    spWeld.Part1 = spoiler
    spWeld.Parent = chassis

    local exhaust = Instance.new("Part")
    exhaust.Name = "Exhaust"
    exhaust.Size = Vector3.new(2.2, 0.8, 0.8)
    exhaust.Position = chassis.Position + Vector3.new(0, -0.1, 6.6)
    exhaust.Color = Color3.fromRGB(71, 85, 105)
    exhaust.Anchored = false
    exhaust.CanCollide = false
    exhaust.Parent = car
    local exWeld = Instance.new("WeldConstraint")
    exWeld.Part0 = chassis
    exWeld.Part1 = exhaust
    exWeld.Parent = chassis

    local fire = Instance.new("Fire")
    fire.Name = "TurboFire"
    fire.Size = 5
    fire.Heat = 18
    fire.Color = Color3.fromRGB(59, 130, 246)
    fire.SecondaryColor = Color3.fromRGB(249, 115, 22)
    fire.Enabled = false
    fire.Parent = exhaust

    -- Wheels
    local wheelOffsets = {
        Vector3.new(4.0, -0.6, 4.2),
        Vector3.new(-4.0, -0.6, 4.2),
        Vector3.new(4.0, -0.6, -4.2),
        Vector3.new(-4.0, -0.6, -4.2),
    }
    for _, offset in ipairs(wheelOffsets) do
        local wheel = Instance.new("Part")
        wheel.Shape = Enum.PartType.Cylinder
        wheel.Size = Vector3.new(1.6, 3.0, 3.0)
        wheel.CFrame = (chassis.CFrame + offset) * CFrame.Angles(0, 0, math.rad(90))
        wheel.Color = Color3.fromRGB(15, 23, 42)
        wheel.Material = Enum.Material.Rubber
        wheel.Anchored = false
        wheel.CanCollide = false
        wheel.Parent = car
        local ww = Instance.new("WeldConstraint")
        ww.Part0 = chassis
        ww.Part1 = wheel
        ww.Parent = chassis
    end

    return car, chassis, exhaust
end

-- =============================================================================
-- DETEKSI OTOMATIS ASSET MOBIL NYATA (FORTUNE NISSAN SILVIA S15, MISANO CARS, DLL)
-- =============================================================================
local function getAllAvailableCustomVehicles()
    local list = {}
    local seen = {}

    local function addModel(m)
        if m and m:IsA("Model") and not seen[m] then
            -- Pastikan bukan model karakter pemain, bukan track atau bangunan
            if not m:FindFirstChildOfClass("Humanoid") or m:FindFirstChildOfClass("VehicleSeat") then
                seen[m] = true
                table.insert(list, m)
            end
        end
    end

    local ServerStorage = game:GetService("ServerStorage")
    local ReplicatedStorage = game:GetService("ReplicatedStorage")

    -- 1. Periksa folder "Vehicles" / "Cars" di ServerStorage, ReplicatedStorage, dan Workspace
    local searchContainers = {
        ServerStorage:FindFirstChild("Vehicles", true),
        ServerStorage:FindFirstChild("Cars", true),
        ServerStorage:FindFirstChild("RaceVehicles", true),
        ReplicatedStorage:FindFirstChild("Vehicles", true),
        ReplicatedStorage:FindFirstChild("Cars", true),
        ReplicatedStorage:FindFirstChild("RaceVehicles", true),
        workspace:FindFirstChild("Vehicles", true),
        workspace:FindFirstChild("Parked Vehicles", true),
        workspace:FindFirstChild("RaceVehicles", true),
    }

    for _, container in ipairs(searchContainers) do
        if container and (container:IsA("Folder") or container:IsA("Model")) then
            for _, child in ipairs(container:GetChildren()) do
                if child:IsA("Model") then
                    addModel(child)
                end
            end
        end
    end

    -- 2. Cari model mobil spesifik (Silvia, S15, Nissan, Fortune, Red Car, Blue Car, dll) di mana pun berada
    for _, root in ipairs({ServerStorage, ReplicatedStorage, workspace}) do
        for _, desc in ipairs(root:GetDescendants()) do
            if desc:IsA("Model") and not seen[desc] then
                local dName = desc.Name:lower()
                if dName:find("silvia") or dName:find("s15") or dName:find("nissan") or dName:find("fortune")
                    or dName:find("red car") or dName:find("blue car") or dName:find("black car") 
                    or dName:find("white car") or dName:find("yellow car")
                    or desc:FindFirstChildOfClass("VehicleSeat") or desc:FindFirstChild("DriveSeat") then
                    addModel(desc)
                end
            end
        end
    end

    return list
end

local function prepareCustomVehicleModel(templateModel, targetColor)
    local clone = templateModel:Clone()
    
    -- Tentukan PrimaryPart (DriveSeat / VehicleSeat / Body / BasePart)
    local primary = clone.PrimaryPart
    if not primary then
        primary = clone:FindFirstChild("DriveSeat")
            or clone:FindFirstChildWhichIsA("VehicleSeat")
            or clone:FindFirstChild("Chassis")
            or clone:FindFirstChild("Body")
            or clone:FindFirstChildWhichIsA("BasePart")
        if primary then
            clone.PrimaryPart = primary
        end
    end

    if not primary then
        return nil, nil, nil
    end

    -- Pastikan semua bagian tersambung rapi (weld) dan tidak kaku (Anchored = false) saat melaju
    for _, part in ipairs(clone:GetDescendants()) do
        if part:IsA("BasePart") then
            part.Anchored = false
            if part ~= primary and #part:GetJoints() == 0 then
                local w = Instance.new("WeldConstraint")
                w.Part0 = primary
                w.Part1 = part
                w.Parent = primary
            end
        end
    end

    -- Pasang knalpot & efek knalpot turbo
    local exhaust = clone:FindFirstChild("Exhaust", true)
    if not exhaust then
        exhaust = Instance.new("Part")
        exhaust.Name = "Exhaust"
        exhaust.Size = Vector3.new(1, 0.5, 0.5)
        local cf = primary.CFrame
        exhaust.CFrame = cf * CFrame.new(0, -0.5, 5)
        exhaust.Anchored = false
        exhaust.CanCollide = false
        exhaust.Transparency = 1
        exhaust.Parent = clone

        local w = Instance.new("WeldConstraint")
        w.Part0 = primary
        w.Part1 = exhaust
        w.Parent = primary
    end

    if not exhaust:FindFirstChild("TurboFire") then
        local fire = Instance.new("Fire")
        fire.Name = "TurboFire"
        fire.Size = 4
        fire.Heat = 14
        fire.Color = Color3.fromRGB(249, 115, 22)
        fire.SecondaryColor = Color3.fromRGB(234, 179, 8)
        fire.Enabled = false
        fire.Parent = exhaust
    end

    if not exhaust:FindFirstChild("RevSmoke") then
        local smoke = Instance.new("Smoke")
        smoke.Name = "RevSmoke"
        smoke.Size = 1.5
        smoke.RiseVelocity = 3
        smoke.Color = Color3.fromRGB(200, 200, 200)
        smoke.Enabled = false
        smoke.Parent = exhaust
    end

    return clone, primary, exhaust
end

-- =============================================================================
-- VEHICLE RESOLVER (ASSET MODEL NYATA + SUPERCAR PROCEDURAL FALLBACK)
-- =============================================================================
local function getVehicleModel(vehicleType, color, racerIndex)
    local vRaw = tostring(vehicleType or ""):lower()
    local customList = getAllAvailableCustomVehicles()

    -- 1. Jika penonton/streamer meminta tipe mobil spesifik (misal: !silvia, !nissan, !redcar, !ferrari, dll)
    if vRaw ~= "" and vRaw ~= "car" and vRaw ~= "mixed" then
        for _, m in ipairs(customList) do
            local mName = m.Name:lower()
            if mName:find(vRaw) or vRaw:find(mName) then
                local c, p, e = prepareCustomVehicleModel(m, color)
                if c and p and e then
                    print("🚘 Memuat Model Aset Kustom:", m.Name)
                    return c, p, e
                end
            end
        end
    end

    -- 2. Jika ada koleksi mobil aset nyata (Nissan Silvia S15, Red Car, Blue Car, dll), pilih berurutan!
    if #customList > 0 then
        local pickedIndex = ((racerIndex or 0) % #customList) + 1
        local chosenModel = customList[pickedIndex]
        local c, p, e = prepareCustomVehicleModel(chosenModel, color)
        if c and p and e then
            print("🏎️ Menggunakan Mobil Aset Terbaru:", chosenModel.Name, "untuk racer #" .. tostring(racerIndex or 0))
            return c, p, e
        end
    end

    -- 3. Fallback Model Supercar Procedural 3D
    if vRaw == "ferrari" then
        return createFerrariModel(color)
    elseif vRaw == "lamborghini" or vRaw == "lambo" then
        return createLamborghiniModel(color)
    elseif vRaw == "bugatti" then
        return createBugattiModel(color)
    elseif vRaw == "motorcycle" or vRaw == "motor" then
        return createMotorcycleModel(color)
    else
        return createCarModel(color)
    end
end

-- =============================================================================
-- HITUNG POSISI GRID START (ANTI-NYANGKUT & 100% DI DALAM JALAN ASPAL SIRKUIT)
-- =============================================================================
local function getStartingGridCFrame(racerIndex)
    -- 1. Cek apakah ada Gridspots resmi dari Misano Circuit atau RoRacing di Workspace
    local spots = findGridSpots()
    if spots and #spots > 0 then
        local spotIndex = (racerIndex % #spots) + 1
        local spot = spots[spotIndex]
        local spotCF = spot:IsA("Model") and spot:GetPivot() or spot.CFrame

        -- Hadapkan mobil lurus searah lintasan (menghadap ke waypoint terdekat)
        local facingDir = spotCF.LookVector
        if #waypoints >= 1 then
            local toWP = (waypoints[1].Position - spotCF.Position).Unit
            if toWP.Magnitude > 0.1 then
                facingDir = toWP
            end
        end

        local spawnPos = spotCF.Position + Vector3.new(0, 2.8, 0)
        return CFrame.lookAt(spawnPos, spawnPos + facingDir)
    end

    -- 2. Ikuti kurva lintasan balap ke BELAKANG garis start (100% selalu di tengah jalan aspal)
    if #waypoints >= 2 then
        local row = math.floor(racerIndex / 2)
        local col = (racerIndex % 2 == 0) and -1 or 1 -- -1 = lajur kiri, +1 = lajur kanan

        local targetDistBack = 12 + (row * 14) -- Jarak mundur dari garis start (WP 1)
        
        -- Telusuri kurva waypoint ke belakang secara dinamis: WP 1 -> WP terakhir -> WP sebelumnya
        local accumulated = 0
        local currIdx = 1
        local prevIdx = #waypoints

        local chosenPos = waypoints[1].Position
        local chosenDir = (waypoints[1].Position - waypoints[#waypoints].Position).Unit

        while accumulated < targetDistBack and prevIdx > 1 do
            local pStart = waypoints[currIdx].Position
            local pEnd = waypoints[prevIdx].Position
            local segLen = (pStart - pEnd).Magnitude

            if accumulated + segLen >= targetDistBack then
                local remaining = targetDistBack - accumulated
                local frac = math.clamp(remaining / math.max(0.1, segLen), 0, 1)
                chosenPos = pStart:Lerp(pEnd, frac)
                chosenDir = (pStart - pEnd).Unit
                break
            else
                accumulated = accumulated + segLen
                currIdx = prevIdx
                prevIdx = prevIdx - 1
                chosenPos = pEnd
            end
        end

        local rightDir = Vector3.new(-chosenDir.Z, 0, chosenDir.X).Unit
        local laneOffset = rightDir * (col * 4.5) -- Lajur kiri / kanan
        local spawnPos = chosenPos + laneOffset + Vector3.new(0, 2.8, 0)

        return CFrame.lookAt(spawnPos, spawnPos + chosenDir)
    end

    -- 3. Fallback absolut jika belum ada sirkuit terpasang
    local row = math.floor(racerIndex / 2)
    local col = (racerIndex % 2 == 0) and -1 or 1
    local spawnPos = Vector3.new(160 + (col * 4.5), 2.5, -(12 + (row * 14)))
    return CFrame.lookAt(spawnPos, spawnPos + Vector3.new(0, 0, 1))
end

-- Pastikan semua tiang/gerbang start tidak memiliki tabrakan (CanCollide = false) agar mobil tidak pernah nyangkut
local function ensureTrackCollisionsSafe()
    local track = workspace:FindFirstChild("StadiumRaceTrack")
    if track then
        for _, part in ipairs(track:GetDescendants()) do
            if part:IsA("BasePart") then
                local name = part.Name:lower()
                if name:find("arch") or name:find("pillar") or name:find("tiang") or name:find("startline") then
                    part.CanCollide = false
                end
            end
        end
    end
end

-- =============================================================================
-- SPAWN PEMBALAP (RACER)
-- =============================================================================
local function spawnRacerVehicle(racerData)
    local uid = tostring(racerData.user_id or racerData.nickname):lower()
    if racers[uid] and racers[uid].model then
        return racers[uid]
    end

    if #waypoints == 0 then
        setupWaypoints()
    end
    ensureTrackCollisionsSafe()

    local racerIndex = 0
    for _ in pairs(racers) do racerIndex = racerIndex + 1 end
    local color = VEHICLE_COLORS[(racerIndex % #VEHICLE_COLORS) + 1]

    local spawnCFrame = getStartingGridCFrame(racerIndex)

    local vType = racerData.vehicle
    if not vType or vType == "mixed" then
        vType = (racerIndex % 2 == 0) and "car" or "motorcycle"
    end

    local model, primaryPart, exhaust = getVehicleModel(vType, color, racerIndex)

    model:PivotTo(spawnCFrame)
    if primaryPart then
        primaryPart.CFrame = spawnCFrame
    end

    local bg = Instance.new("BodyGyro")
    bg.MaxTorque = Vector3.new(400000, 400000, 400000)
    bg.P = 15000
    bg.CFrame = spawnCFrame
    bg.Parent = primaryPart

    local bv = Instance.new("BodyVelocity")
    bv.MaxForce = Vector3.new(400000, 400000, 400000)
    bv.Velocity = Vector3.new(0, 0, 0)
    bv.Parent = primaryPart

    local bb = Instance.new("BillboardGui")
    bb.Name = "RacerTag"
    bb.Size = UDim2.new(0, 160, 0, 60)
    bb.StudsOffset = Vector3.new(0, 5, 0)
    bb.AlwaysOnTop = true
    bb.Parent = primaryPart

    local bgFrame = Instance.new("Frame")
    bgFrame.Size = UDim2.new(1, 0, 1, 0)
    bgFrame.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
    bgFrame.BackgroundTransparency = 0.15
    bgFrame.BorderSizePixel = 0
    bgFrame.Parent = bb
    local uic = Instance.new("UICorner")
    uic.CornerRadius = UDim.new(0, 10)
    uic.Parent = bgFrame

    local uistroke = Instance.new("UIStroke")
    uistroke.Color = color
    uistroke.Thickness = 2
    uistroke.Parent = bgFrame

    local nameLabel = Instance.new("TextLabel")
    nameLabel.Name = "Nickname"
    nameLabel.Size = UDim2.new(1, -10, 0.5, 0)
    nameLabel.Position = UDim2.new(0, 5, 0, 2)
    nameLabel.BackgroundTransparency = 1
    nameLabel.Font = Enum.Font.GothamBold
    nameLabel.TextSize = 14
    nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    local vIcon = "🏎️ "
    if vType == "motorcycle" then vIcon = "🏍️ "
    elseif vType == "ferrari" then vIcon = "🐎 "
    elseif vType == "lamborghini" or vType == "lambo" then vIcon = "🐂 "
    elseif vType == "bugatti" then vIcon = "⚡ "
    end
    nameLabel.Text = vIcon .. tostring(racerData.nickname or uid)
    nameLabel.TextScaled = true
    nameLabel.Parent = bgFrame

    local infoLabel = Instance.new("TextLabel")
    infoLabel.Name = "Status"
    infoLabel.Size = UDim2.new(1, -10, 0.45, 0)
    infoLabel.Position = UDim2.new(0, 5, 0.5, 0)
    infoLabel.BackgroundTransparency = 1
    infoLabel.Font = Enum.Font.GothamMedium
    infoLabel.TextSize = 12
    infoLabel.TextColor3 = Color3.fromRGB(254, 240, 138)
    infoLabel.Text = "🏁 Lap 1/" .. tostring(totalLaps)
    infoLabel.Parent = bgFrame

    model.Parent = workspace

    local racerEntry = {
        userId = uid,
        nickname = racerData.nickname or uid,
        vehicleType = vType,
        model = model,
        primaryPart = primaryPart,
        exhaust = exhaust,
        bg = bg,
        bv = bv,
        infoLabel = infoLabel,
        color = color,
        currentWP = 1,
        lap = 1,
        speedBonus = 0,
        bonusTimer = 0,
        turboActive = false,
        spinTimer = 0,
    }

    racers[uid] = racerEntry
    print("🏎️ Racer Spawned:", racerEntry.nickname, "(" .. vType .. ")")

    -- Beri sinyal kamera fokus sesaat ke pembalap yang baru join
    if cameraRemote then
        cameraRemote:FireAllClients("GIFT_FOCUS", {
            userId = racerEntry.userId,
            nickname = racerEntry.nickname,
            giftName = "Masuk Arena Balap! 🏁",
            duration = 4.0
        })
    end

    return racerEntry
end

-- =============================================================================
-- TRANSFORMASI KENDARAAN PEMBALAP (GANTI FERRARI, LAMBO, BUGATTI, MOTOR DLL)
-- =============================================================================
local function changeRacerVehicle(racer, newVehicleType)
    if not racer or not racer.model or not racer.primaryPart then return end

    local oldModel = racer.model
    local oldCF = racer.primaryPart.CFrame
    local oldVel = racer.bv and racer.bv.Velocity or Vector3.new(0, 0, 0)

    -- Partikel Transformasi Asap & Percikan
    local poof = Instance.new("Part")
    poof.Size = Vector3.new(1, 1, 1)
    poof.Position = oldCF.Position
    poof.Anchored = true
    poof.CanCollide = false
    poof.Transparency = 1
    poof.Parent = workspace

    local smoke = Instance.new("Smoke")
    smoke.Color = Color3.fromRGB(254, 240, 138)
    smoke.Size = 10
    smoke.RiseVelocity = 4
    smoke.Parent = poof
    game:GetService("Debris"):AddItem(poof, 1.5)

    -- Buat model kendaraan baru
    local newModel, newPrimary, newExhaust = getVehicleModel(newVehicleType, racer.color)
    newModel:PivotTo(oldCF)
    if newPrimary then
        newPrimary.CFrame = oldCF
    end
    newModel.Parent = workspace

    local bg = Instance.new("BodyGyro")
    bg.MaxTorque = Vector3.new(400000, 400000, 400000)
    bg.P = 15000
    bg.CFrame = oldCF
    bg.Parent = newPrimary

    local bv = Instance.new("BodyVelocity")
    bv.MaxForce = Vector3.new(400000, 400000, 400000)
    bv.Velocity = oldVel
    bv.Parent = newPrimary

    -- Pindahkan billboard tag ke mobil baru
    local tag = oldModel:FindFirstChild("RacerTag", true)
    if tag then
        tag.Parent = newPrimary
        local nickLabel = tag:FindFirstChild("Nickname", true)
        if nickLabel then
            local icon = "🏎️ "
            local nRaw = newVehicleType:lower()
            if nRaw == "motorcycle" or nRaw == "motor" then icon = "🏍️ "
            elseif nRaw == "ferrari" then icon = "🐎 "
            elseif nRaw == "lamborghini" or nRaw == "lambo" then icon = "🐂 "
            elseif nRaw == "bugatti" then icon = "⚡ "
            end
            nickLabel.Text = icon .. racer.nickname
        end
    end

    oldModel:Destroy()
    racer.model = newModel
    racer.primaryPart = newPrimary
    racer.exhaust = newExhaust
    racer.bg = bg
    racer.bv = bv
    racer.vehicleType = newVehicleType

    print("🔄 [Transform] " .. racer.nickname .. " berubah jadi " .. newVehicleType:upper() .. "!")

    if cameraRemote then
        cameraRemote:FireAllClients("GIFT_FOCUS", {
            userId = racer.userId,
            nickname = racer.nickname,
            giftName = "Ganti " .. newVehicleType:upper() .. "! 🔥",
            duration = 3.5
        })
    end
end

-- =============================================================================
-- LOGIKA POWER-UP (SPEED BOOST, TURBO DONUT, ROKET TOPI)
-- =============================================================================
local function applyBoost(racerEntry, multiplier, isTurbo)
    if not racerEntry then return end
    
    if isTurbo then
        racerEntry.turboActive = true
        racerEntry.speedBonus = 55
        racerEntry.bonusTimer = 8.0
        if racerEntry.exhaust then
            local fire = racerEntry.exhaust:FindFirstChild("TurboFire")
            if fire then fire.Enabled = true end
        end
        racerEntry.infoLabel.Text = "🍩 TURBO AKTIF! 🔥"
    else
        local bonus = math.min(multiplier * 9, 45)
        racerEntry.speedBonus = bonus
        racerEntry.bonusTimer = 5.0
        racerEntry.infoLabel.Text = "⚡ BOOST +" .. tostring(multiplier) .. "x!"
    end

    -- 🎥 PRIORITAS KAMERA: Arahkan kamera langsung ke mobil yang dapat boost/turbo!
    if cameraRemote then
        local gName = isTurbo and "Donut (TURBO API)" or ("Mawar (" .. tostring(multiplier) .. "x Boost)")
        cameraRemote:FireAllClients("GIFT_FOCUS", {
            userId = racerEntry.userId,
            nickname = racerEntry.nickname,
            giftName = gName,
            duration = 7.5
        })
    end
end

local function fireRocket(shooterEntry)
    if not shooterEntry or not shooterEntry.primaryPart then return end

    local targetEntry = nil
    local nearestDist = 999999
    local shooterPos = shooterEntry.primaryPart.Position

    for _, other in pairs(racers) do
        if other.userId ~= shooterEntry.userId and other.primaryPart then
            local dist = (other.primaryPart.Position - shooterPos).Magnitude
            if dist < nearestDist and dist > 5 then
                nearestDist = dist
                targetEntry = other
            end
        end
    end

    local rocket = Instance.new("Part")
    rocket.Name = "RocketTopi"
    rocket.Size = Vector3.new(1.8, 1.8, 4)
    rocket.Shape = Enum.PartType.Cylinder
    rocket.Color = Color3.fromRGB(244, 63, 94)
    rocket.Material = Enum.Material.Neon
    rocket.CanCollide = false
    rocket.CFrame = shooterEntry.primaryPart.CFrame * CFrame.Angles(0, math.rad(90), 0) + Vector3.new(0, 3, 0)
    rocket.Parent = workspace

    local rocketFire = Instance.new("Fire")
    rocketFire.Size = 3
    rocketFire.Color = Color3.fromRGB(56, 189, 248)
    rocketFire.Parent = rocket

    -- 🎥 PRIORITAS KAMERA: Arahkan kamera langsung ke penembak roket!
    if cameraRemote then
        cameraRemote:FireAllClients("GIFT_FOCUS", {
            userId = shooterEntry.userId,
            nickname = shooterEntry.nickname,
            giftName = "Topi (ROKET TEMBAK)",
            duration = 6.5
        })
    end

    task.spawn(function()
        local dir = shooterEntry.primaryPart.CFrame.LookVector
        for step = 1, 35 do
            if not rocket or not rocket.Parent then break end
            if targetEntry and targetEntry.primaryPart then
                dir = (targetEntry.primaryPart.Position - rocket.Position).Unit
            end
            rocket.CFrame = CFrame.lookAt(rocket.Position + (dir * 9), rocket.Position + (dir * 18))
            
            if targetEntry and targetEntry.primaryPart then
                local hitDist = (rocket.Position - targetEntry.primaryPart.Position).Magnitude
                if hitDist < 8 then
                    local exp = Instance.new("Explosion")
                    exp.Position = targetEntry.primaryPart.Position
                    exp.BlastRadius = 15
                    exp.BlastPressure = 0
                    exp.Parent = workspace

                    targetEntry.spinTimer = 2.5
                    targetEntry.speedBonus = -20
                    targetEntry.infoLabel.Text = "💥 TERKENA ROKET! 💫"

                    rocket:Destroy()
                    return
                end
            end
            task.wait(0.04)
        end
        if rocket and rocket.Parent then rocket:Destroy() end
    end)
end

-- =============================================================================
-- HITUNG MUNDUR (COUNTDOWN 3.. 2.. 1.. GOOO!) DENGAN TAMPILAN RAKSASA & AUTO-HIDE
-- =============================================================================
local countdownBannerToken = 0

local function showCountdownBanner(text, color, scale, autoFadeDuration)
    countdownBannerToken = countdownBannerToken + 1
    local currentToken = countdownBannerToken

    for _, player in ipairs(Players:GetPlayers()) do
        local pGui = player:FindFirstChild("PlayerGui")
        if pGui then
            local cGui = pGui:FindFirstChild("RaceCountdownGui")
            if cGui then
                local label = cGui:FindFirstChild("CountLabel", true)
                if label then
                    local stroke = label:FindFirstChildOfClass("UIStroke")
                    label.Text = text
                    label.TextColor3 = color
                    label.Visible = true
                    label.TextTransparency = 0
                    if stroke then stroke.Transparency = 0 end

                    -- Efek animasi pop-in dengan TweenService
                    local targetSize = UDim2.new(0, 400 * (scale or 1), 0, 180 * (scale or 1))
                    label.Size = UDim2.new(0, 320 * (scale or 1), 0, 140 * (scale or 1))
                    pcall(function()
                        local popTween = TweenService:Create(
                            label,
                            TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
                            { Size = targetSize }
                        )
                        popTween:Play()
                    end)

                    -- Garansi auto-fade otomatis (pasti hilang, tidak akan pernah nyangkut!)
                    if autoFadeDuration and autoFadeDuration > 0 then
                        task.delay(math.max(0.1, autoFadeDuration - 0.4), function()
                            if countdownBannerToken == currentToken and label and label.Parent then
                                pcall(function()
                                    local fadeTween = TweenService:Create(
                                        label,
                                        TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
                                        { TextTransparency = 1 }
                                    )
                                    fadeTween:Play()
                                    if stroke then
                                        local strokeTween = TweenService:Create(
                                            stroke,
                                            TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
                                            { Transparency = 1 }
                                        )
                                        strokeTween:Play()
                                    end
                                end)
                            end
                        end)

                        task.delay(autoFadeDuration, function()
                            if countdownBannerToken == currentToken and label and label.Parent then
                                label.Visible = false
                                label.TextTransparency = 0
                                if stroke then stroke.Transparency = 0 end
                            end
                        end)
                    end
                end
            end
        end
    end
end

local function hideCountdownBanner()
    countdownBannerToken = countdownBannerToken + 1 -- batalkan timer banner sebelumnya
    for _, player in ipairs(Players:GetPlayers()) do
        local pGui = player:FindFirstChild("PlayerGui")
        if pGui then
            local cGui = pGui:FindFirstChild("RaceCountdownGui")
            if cGui then
                local label = cGui:FindFirstChild("CountLabel", true)
                if label then
                    label.Visible = false
                    label.TextTransparency = 0
                    local stroke = label:FindFirstChildOfClass("UIStroke")
                    if stroke then stroke.Transparency = 0 end
                end
            end
        end
    end
end

local function startCountdownSequence()
    if isCountingDown or isRaceRunning then return end
    isCountingDown = true
    isRaceRunning = false

    -- Nyalakan efek asap knalpot revving untuk semua mobil
    for _, r in pairs(racers) do
        if r.exhaust then
            local smoke = r.exhaust:FindFirstChild("RevSmoke")
            if smoke then smoke.Enabled = true end
        end
        if r.bv then r.bv.Velocity = Vector3.new(0, 0, 0) end
    end

    -- Hitungan 3
    showCountdownBanner("3", Color3.fromRGB(239, 68, 68), 1.2) -- Merah
    countdownSound.PlaybackSpeed = 1.0
    countdownSound:Play()
    task.wait(1.0)

    -- Hitungan 2
    showCountdownBanner("2", Color3.fromRGB(245, 158, 11), 1.2) -- Kuning
    countdownSound.PlaybackSpeed = 1.2
    countdownSound:Play()
    task.wait(1.0)

    -- Hitungan 1
    showCountdownBanner("1", Color3.fromRGB(16, 185, 129), 1.2) -- Hijau
    countdownSound.PlaybackSpeed = 1.4
    countdownSound:Play()
    task.wait(1.0)

    -- 🏁 GOOO! (Dengan auto-fadeout 1.2 detik terjamin!)
    showCountdownBanner("🏁 GOOO! 🏁", Color3.fromRGB(254, 240, 138), 1.4, 1.2) -- Emas
    countdownSound.PlaybackSpeed = 2.0
    countdownSound:Play()

    -- Matikan asap revving dan mulai balapan!
    for _, r in pairs(racers) do
        if r.exhaust then
            local smoke = r.exhaust:FindFirstChild("RevSmoke")
            if smoke then smoke.Enabled = false end
        end
    end

    isRaceRunning = true
    isCountingDown = false
    print("🚀 BALAPAN DIMULAI!")

    -- Sinkronkan status aktif ke TikInfinity Server secara asynchronous (NON-BLOCKING)
    task.spawn(function()
        pcall(function()
            HttpService:PostAsync(
                API_BASE_URL .. "/api/roblox/state",
                HttpService:JSONEncode({
                    race_state = "racing",
                    total_laps = totalLaps
                }),
                Enum.HttpContentType.ApplicationJson
            )
        end)
    end)

    -- Pengaman tambahan: pastikan banner tertutup setelah 1.3 detik
    task.delay(1.3, function()
        hideCountdownBanner()
    end)
end

-- =============================================================================
-- WINNER CELEBRATION
-- =============================================================================
local function announceWinner(winnerEntry)
    isRaceRunning = false
    print("🏆 PEMENANG BALAPAN: " .. winnerEntry.nickname)

    -- Tampilkan nama juara selama 4.0 detik dengan auto-fadeout
    showCountdownBanner("🏆 JUARA: " .. winnerEntry.nickname .. "!", Color3.fromRGB(254, 240, 138), 1.2, 4.0)

    -- Sinkronisasi pemenang ke backend secara asynchronous (NON-BLOCKING)
    task.spawn(function()
        pcall(function()
            HttpService:PostAsync(
                API_BASE_URL .. "/api/roblox/state",
                HttpService:JSONEncode({
                    race_state = "finished",
                    winner = {
                        user_id = winnerEntry.userId,
                        nickname = winnerEntry.nickname,
                        vehicle = winnerEntry.vehicleType,
                    }
                }),
                Enum.HttpContentType.ApplicationJson
            )
        end)
    end)

    task.spawn(function()
        for i = 1, 8 do
            if not winnerEntry.primaryPart then break end
            local firework = Instance.new("Explosion")
            firework.Position = winnerEntry.primaryPart.Position + Vector3.new(
                math.random(-20, 20),
                math.random(15, 35),
                math.random(-20, 20)
            )
            firework.BlastPressure = 0
            firework.BlastRadius = 25
            firework.Parent = workspace
            task.wait(0.4)
        end
        task.wait(2)
        hideCountdownBanner()
    end)
end

-- =============================================================================
-- IN-GAME STREAMER HOST HUD (KONTROL LAYAR ROBLOX)
-- =============================================================================
local function setupPlayerHUD(player)
    local pGui = player:WaitForChild("PlayerGui", 10)
    if not pGui then return end

    -- 1. Countdown Overlay Gui
    local cGui = pGui:FindFirstChild("RaceCountdownGui")
    if not cGui then
        cGui = Instance.new("ScreenGui")
        cGui.Name = "RaceCountdownGui"
        cGui.ResetOnSpawn = false
        cGui.DisplayOrder = 999
        cGui.Parent = pGui

        local cLabel = Instance.new("TextLabel")
        cLabel.Name = "CountLabel"
        cLabel.Size = UDim2.new(0, 400, 0, 180)
        cLabel.Position = UDim2.new(0.5, 0, 0.35, 0)
        cLabel.AnchorPoint = Vector2.new(0.5, 0.5)
        cLabel.BackgroundTransparency = 1
        cLabel.Font = Enum.Font.GothamBlack
        cLabel.Text = ""
        cLabel.TextScaled = true
        cLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        cLabel.Visible = false
        cLabel.Parent = cGui

        local stroke = Instance.new("UIStroke")
        stroke.Thickness = 6
        stroke.Color = Color3.fromRGB(15, 23, 42)
        stroke.Parent = cLabel
    end

    -- 2. Streamer Control Panel GUI
    local hostGui = pGui:FindFirstChild("RaceHostControlGui")
    if not hostGui then
        hostGui = Instance.new("ScreenGui")
        hostGui.Name = "RaceHostControlGui"
        hostGui.ResetOnSpawn = false
        hostGui.DisplayOrder = 100
        hostGui.Parent = pGui

        -- Tombol Minimize Toggle (Pojok Kiri Bawah)
        local toggleBtn = Instance.new("TextButton")
        toggleBtn.Name = "ToggleHUD"
        toggleBtn.Size = UDim2.new(0, 130, 0, 36)
        toggleBtn.Position = UDim2.new(0, 20, 1, -55)
        toggleBtn.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
        toggleBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
        toggleBtn.Font = Enum.Font.GothamBold
        toggleBtn.TextSize = 12
        toggleBtn.Text = "⚙️ Panel Balap"
        toggleBtn.Parent = hostGui
        local tCorner = Instance.new("UICorner")
        tCorner.CornerRadius = UDim.new(0, 8)
        tCorner.Parent = toggleBtn
        local tStroke = Instance.new("UIStroke")
        tStroke.Color = Color3.fromRGB(244, 63, 94)
        tStroke.Thickness = 1.5
        tStroke.Parent = toggleBtn

        -- Main Control Frame
        local mainFrame = Instance.new("Frame")
        mainFrame.Name = "MainControls"
        mainFrame.Size = UDim2.new(0, 680, 0, 120)
        mainFrame.Position = UDim2.new(0.5, 0, 1, -75)
        mainFrame.AnchorPoint = Vector2.new(0.5, 0.5)
        mainFrame.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
        mainFrame.BackgroundTransparency = 0.1
        mainFrame.BorderSizePixel = 0
        mainFrame.Parent = hostGui

        local mfCorner = Instance.new("UICorner")
        mfCorner.CornerRadius = UDim.new(0, 12)
        mfCorner.Parent = mainFrame
        local mfStroke = Instance.new("UIStroke")
        mfStroke.Color = Color3.fromRGB(56, 189, 248)
        mfStroke.Thickness = 2
        mfStroke.Parent = mainFrame

        -- Judul Panel
        local title = Instance.new("TextLabel")
        title.Size = UDim2.new(1, -20, 0, 24)
        title.Position = UDim2.new(0, 10, 0, 6)
        title.BackgroundTransparency = 1
        title.Font = Enum.Font.GothamBold
        title.TextSize = 12
        title.TextColor3 = Color3.fromRGB(226, 232, 240)
        title.TextXAlignment = Enum.TextXAlignment.Left
        title.Text = "🏎️ TIKTOK LIVE RACE HOST CONTROLS"
        title.Parent = mainFrame

        -- Baris Tombol Aksi
        local buttonContainer = Instance.new("Frame")
        buttonContainer.Size = UDim2.new(1, -20, 0, 75)
        buttonContainer.Position = UDim2.new(0, 10, 0, 35)
        buttonContainer.BackgroundTransparency = 1
        buttonContainer.Parent = mainFrame

        local uilayout = Instance.new("UIListLayout")
        uilayout.FillDirection = Enum.FillDirection.Horizontal
        uilayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        uilayout.Padding = UDim.new(0, 8)
        uilayout.Parent = buttonContainer

        -- Helper pembuat tombol
        local function makeButton(text, bgCol, callback)
            local btn = Instance.new("TextButton")
            btn.Size = UDim2.new(0, 105, 0, 68)
            btn.BackgroundColor3 = bgCol
            btn.TextColor3 = Color3.fromRGB(255, 255, 255)
            btn.Font = Enum.Font.GothamBold
            btn.TextSize = 12
            btn.Text = text
            btn.TextWrapped = true
            btn.Parent = buttonContainer
            local bCorner = Instance.new("UICorner")
            bCorner.CornerRadius = UDim.new(0, 10)
            bCorner.Parent = btn

            btn.MouseButton1Click:Connect(callback)
            return btn
        end

        -- 1. Tombol MULAI BALAP (3.. 2.. 1.. GO!)
        makeButton("🚀 MULAI\n(3.. 2.. 1.. GO!)", Color3.fromRGB(16, 185, 129), function()
            startCountdownSequence()
        end)

        -- 2. Tombol TAMBAH PEMBALAP BOT
        makeButton("➕ TAMBAH\nPEMBALAP", Color3.fromRGB(59, 130, 246), function()
            local botIndex = 0
            for _ in pairs(racers) do botIndex = botIndex + 1 end
            local sampleNames = {"Rizky_Speed", "Budi_Gamer", "Nabila_Racer", "Siti_Turbo", "Aldi_Pro", "Chibi_Star"}
            local name = sampleNames[(botIndex % #sampleNames) + 1] .. "_" .. tostring(math.random(10, 99))
            local racer = spawnRacerVehicle({
                user_id = name:lower(),
                nickname = name,
                vehicle = vehiclePreference
            })
            task.spawn(function()
                pcall(function()
                    HttpService:PostAsync(
                        API_BASE_URL .. "/api/roblox/test-action",
                        HttpService:JSONEncode({
                            test_type = "join_rose",
                            nickname = name
                        }),
                        Enum.HttpContentType.ApplicationJson
                    )
                end)
            end)
        end)

        -- 3. Tombol RESET KE GARIS START
        makeButton("🔄 RESET\nSTART", Color3.fromRGB(71, 85, 105), function()
            isRaceRunning = false
            local rIdx = 0
            for _, r in pairs(racers) do
                r.lap = 1
                r.currentWP = 1
                r.speedBonus = 0
                r.bonusTimer = 0
                r.spinTimer = 0
                r.infoLabel.Text = "🏁 Lap 1/" .. tostring(totalLaps)
                
                if r.primaryPart then
                    local pCF = getStartingGridCFrame(rIdx)
                    if r.model then r.model:PivotTo(pCF) end
                    r.primaryPart.CFrame = pCF
                    if r.bg then r.bg.CFrame = pCF end
                    if r.bv then r.bv.Velocity = Vector3.new(0, 0, 0) end
                end
                rIdx = rIdx + 1
            end
            hideCountdownBanner()
            task.spawn(function()
                pcall(function()
                    HttpService:PostAsync(
                        API_BASE_URL .. "/api/roblox/control",
                        HttpService:JSONEncode({ action = "reset" }),
                        Enum.HttpContentType.ApplicationJson
                    )
                end)
            end)
        end)

        -- 4. Tombol HAPUS SEMUA PEMBALAP
        makeButton("🧹 HAPUS\nSEMUA", Color3.fromRGB(225, 29, 72), function()
            isRaceRunning = false
            for _, r in pairs(racers) do
                if r.model then r.model:Destroy() end
            end
            racers = {}
            hideCountdownBanner()
            if cameraRemote then
                cameraRemote:FireAllClients("RACE_RESET")
            end
            task.spawn(function()
                pcall(function()
                    HttpService:PostAsync(
                        API_BASE_URL .. "/api/roblox/control",
                        HttpService:JSONEncode({ action = "clear" }),
                        Enum.HttpContentType.ApplicationJson
                    )
                end)
            end)
        end)

        -- 5. Tombol GANTI SUDUT KAMERA (Belakang / Depan / Samping / Drone)
        makeButton("🎥 GANTI\nANGLE (C)", Color3.fromRGB(139, 92, 246), function()
            if cameraRemote then
                cameraRemote:FireAllClients("CYCLE_ANGLE")
            end
        end)

        -- 6. Tombol TELEPORT KE MIMBAR VIP
        makeButton("🎪 TELEPORT\nKE MIMBAR", Color3.fromRGB(14, 165, 233), function()
            if player.Character then
                teleportStreamerToSpectatorStand(player.Character)
            end
        end)

        -- Toggle hide/show
        toggleBtn.MouseButton1Click:Connect(function()
            mainFrame.Visible = not mainFrame.Visible
            toggleBtn.Text = mainFrame.Visible and "⚙️ Sembunyikan" or "⚙️ Buka Panel"
        end)
    end
end

-- Teleport Karakter Host/Streamer ke Mimbar Komentator
local function teleportStreamerToSpectatorStand(character)
    if not character then return end
    local root = character:WaitForChild("HumanoidRootPart", 5)
    if not root then return end

    task.wait(0.2)
    local hostSpawn = workspace:FindFirstChild("HostSpawnLocation", true)

    if hostSpawn then
        root.CFrame = hostSpawn.CFrame + Vector3.new(0, 3, 0)
    else
        local startLinePart = workspace:FindFirstChild("StartFinishLine", true) or workspace:FindFirstChild("PStart", true)
        if startLinePart then
            root.CFrame = startLinePart.CFrame * CFrame.new(20, 8, -10)
        else
            root.CFrame = CFrame.lookAt(Vector3.new(182, 8, -15), Vector3.new(160, 3, -15))
        end
    end
end

-- Pasang HUD untuk setiap player yang bermain / baru masuk
local function onPlayerJoined(player)
    setupPlayerHUD(player)

    -- Auto-teleport ke mimbar komentator jika karakter spawn/respawn
    player.CharacterAdded:Connect(function(char)
        teleportStreamerToSpectatorStand(char)
    end)
    if player.Character then
        task.spawn(function()
            teleportStreamerToSpectatorStand(player.Character)
        end)
    end
end

Players.PlayerAdded:Connect(onPlayerJoined)
for _, p in ipairs(Players:GetPlayers()) do
    onPlayerJoined(p)
end

-- =============================================================================
-- GAME LOOP (PERGERAKAN SIRKUIT & UPDATE POSISI)
-- =============================================================================
RunService.Heartbeat:Connect(function(dt)
    if not isRaceRunning or #waypoints == 0 then return end

    for uid, racer in pairs(racers) do
        if racer.primaryPart and racer.bg and racer.bv then
            if racer.bonusTimer > 0 then
                racer.bonusTimer = racer.bonusTimer - dt
                if racer.bonusTimer <= 0 then
                    racer.speedBonus = 0
                    racer.turboActive = false
                    if racer.exhaust then
                        local fire = racer.exhaust:FindFirstChild("TurboFire")
                        if fire then fire.Enabled = false end
                    end
                    racer.infoLabel.Text = "🏁 Lap " .. tostring(racer.lap) .. "/" .. tostring(totalLaps)
                end
            end

            if racer.spinTimer > 0 then
                racer.spinTimer = racer.spinTimer - dt
                racer.bg.CFrame = racer.bg.CFrame * CFrame.Angles(0, math.rad(45), 0)
                racer.bv.Velocity = Vector3.new(0, 0, 0)
            else
                local targetWP = waypoints[racer.currentWP]
                if targetWP then
                    local targetPos = targetWP.Position + Vector3.new(0, 3, 0)
                    local currentPos = racer.primaryPart.Position
                    local toTarget = (targetPos - currentPos)
                    local dist = toTarget.Magnitude

                    if dist < 14 then
                        racer.currentWP = racer.currentWP + 1
                        if racer.currentWP > #waypoints then
                            racer.currentWP = 1
                            racer.lap = racer.lap + 1
                            racer.infoLabel.Text = "🏁 Lap " .. tostring(racer.lap) .. "/" .. tostring(totalLaps)

                            if racer.lap > totalLaps then
                                announceWinner(racer)
                                return
                            end
                        end
                    end

                    local moveDir = toTarget.Unit
                    local speed = math.max(10, BASE_SPEED + racer.speedBonus)
                    racer.bv.Velocity = moveDir * speed
                    racer.bg.CFrame = CFrame.lookAt(currentPos, currentPos + moveDir)
                end
            end
        end
    end
end)

-- =============================================================================
-- HTTP POLLING DARI TIKINFINITY LOCAL SERVER
-- =============================================================================
local function pollServer()
    local url = API_BASE_URL .. "/api/roblox/actions?since_id=" .. tostring(lastActionId)
    local success, response = pcall(function()
        return HttpService:GetAsync(url)
    end)

    if success and response then
        local ok, data = pcall(function()
            return HttpService:JSONDecode(response)
        end)

        if ok and data and data.actions then
            for _, actionItem in ipairs(data.actions) do
                if actionItem.id > lastActionId then
                    lastActionId = actionItem.id
                    local act = actionItem.action
                    local payload = actionItem.data or {}

                    if act == "spawn_racer" then
                        spawnRacerVehicle(payload)

                    elseif act == "change_vehicle" then
                        local uid = tostring(payload.user_id or payload.nickname):lower()
                        local racer = racers[uid]
                        if racer then
                            changeRacerVehicle(racer, payload.vehicle or "ferrari")
                        else
                            spawnRacerVehicle(payload)
                        end

                    elseif act == "boost" then
                        local uid = tostring(payload.user_id or payload.nickname):lower()
                        local racer = racers[uid] or spawnRacerVehicle(payload)
                        applyBoost(racer, payload.multiplier or 1, payload.turbo or false)

                    elseif act == "fire_rocket" then
                        local uid = tostring(payload.user_id or payload.nickname):lower()
                        local racer = racers[uid] or spawnRacerVehicle(payload)
                        fireRocket(racer)

                    elseif act == "start_race" then
                        totalLaps = payload.total_laps or 3
                        startCountdownSequence()

                    elseif act == "reset_race" then
                        isRaceRunning = false
                        isCountingDown = false
                        hideCountdownBanner()
                        if payload.clear_racers then
                            for _, r in pairs(racers) do
                                if r.model then r.model:Destroy() end
                            end
                            racers = {}
                            print("🧹 Arena Balap Dikosongkan.")
                        else
                            local rIdx = 0
                            for _, r in pairs(racers) do
                                r.lap = 1
                                r.currentWP = 1
                                r.speedBonus = 0
                                r.bonusTimer = 0
                                r.spinTimer = 0
                                r.infoLabel.Text = "🏁 Lap 1/" .. tostring(totalLaps)
                                
                                if r.primaryPart then
                                    local pCF = getStartingGridCFrame(rIdx)
                                    if r.model then r.model:PivotTo(pCF) end
                                    r.primaryPart.CFrame = pCF
                                    if r.bg then r.bg.CFrame = pCF end
                                    if r.bv then r.bv.Velocity = Vector3.new(0, 0, 0) end
                                end
                                rIdx = rIdx + 1
                            end
                            print("🔄 Posisi Balapan Direset ke Garis Start.")
                        end
                    end
                end
            end
        end
    end
end

-- =============================================================================
-- INTI RUNNER
-- =============================================================================
setupWaypoints()
ensureTrackCollisionsSafe()
print("🏎️ [TikInfinity] Roblox Live Race Controller v2.3 Aktif!")

task.spawn(function()
    while true do
        pollServer()
        task.wait(POLL_INTERVAL)
    end
end)
