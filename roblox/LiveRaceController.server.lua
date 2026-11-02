--[[
    =============================================================================
    ROBLOX LIVE RACE CONTROLLER (TikInfinity Bridge)
    =============================================================================
    Letakkan script ini di: ServerScriptService -> Script (Bukan LocalScript)
    
    Pastikan fitur HTTP Request aktif di Roblox Studio:
    Home -> Game Settings -> Security -> Aktifkan "Allow HTTP Requests" -> Save!
    
    Fitur:
    1. Polling aksi live dari TikInfinity (http://127.0.0.1:8000/api/roblox/actions).
    2. Auto-spawn Mobil & Motor sesuai partisipasi penonton (Mawar / chat "ikut").
    3. Billboard nama & foto penonton di atas kendaraan.
    4. Navigasi sirkuit otomatis mengikuti waypoints.
    5. Power-up Mawar (Speed Boost 1x / 5x).
    6. Power-up Donut (TURBO Api Knalpot).
    7. Power-up Topi (Tembak ROKET ke lawan di depan hingga terpental/berputar).
    8. Lap counter & Papan Pemenang (Podium + Kembang Api).
    =============================================================================
]]

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local API_BASE_URL = "http://127.0.0.1:8000"
local POLL_INTERVAL = 0.35 -- detik antar polling
local BASE_SPEED = 28 -- studs per detik

-- State internal balapan
local isRaceRunning = false
local totalLaps = 3
local lastActionId = 0
local racers = {} -- user_id -> table data racer
local waypoints = {}
local finishLine = nil

-- Warna-warni cerah untuk kendaraan
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

-- Pastikan folder Waypoints tersedia
local function setupWaypoints()
    waypoints = {}
    local wpFolder = workspace:FindFirstChild("RaceWaypoints")
    if not wpFolder then
        wpFolder = Instance.new("Folder")
        wpFolder.Name = "RaceWaypoints"
        wpFolder.Parent = workspace
        
        -- Buat 12 titik sirkuit melingkar default jika belum ada sirkuit
        local radiusX = 140
        local radiusZ = 90
        local center = Vector3.new(0, 5, 0)
        local count = 12
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
        print("🏁 Dibuat 12 waypoints default di Workspace.RaceWaypoints")
    else
        local children = wpFolder:GetChildren()
        table.sort(children, function(a, b) return a.Name < b.Name end)
        for _, child in ipairs(children) do
            if child:IsA("BasePart") then
                table.insert(waypoints, child)
            end
        end
    end
end

-- =============================================================================
-- PEMBUAT KENDARAAN (MOBIL & MOTOR 3D PROCEDURAL)
-- =============================================================================
local function createCarModel(color)
    local car = Instance.new("Model")
    car.Name = "RacerCar"

    -- Chassis Utama
    local chassis = Instance.new("Part")
    chassis.Name = "PrimaryPart"
    chassis.Size = Vector3.new(7, 2, 12)
    chassis.Material = Enum.Material.SmoothPlastic
    chassis.Color = color
    chassis.Anchored = false
    chassis.CanCollide = true
    chassis.Parent = car
    car.PrimaryPart = chassis

    -- Atap / Cockpit
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

    -- Sayap Belakang (Spoiler Sport)
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

    -- Knalpot Turbo
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

    -- 4 Roda
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

    -- Rangka Utama Motor
    local frame = Instance.new("Part")
    frame.Name = "PrimaryPart"
    frame.Size = Vector3.new(2.2, 2.6, 9)
    frame.Material = Enum.Material.SmoothPlastic
    frame.Color = color
    frame.Anchored = false
    frame.CanCollide = true
    frame.Parent = bike
    bike.PrimaryPart = frame

    -- Tangki & Stang
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

    -- Stang Handlebar
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

    -- Knalpot Motor
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

    -- 2 Roda Motor (Depan & Belakang)
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

    -- Hitung posisi start di grid
    local racerIndex = 0
    for _ in pairs(racers) do racerIndex = racerIndex + 1 end
    local color = VEHICLE_COLORS[(racerIndex % #VEHICLE_COLORS) + 1]

    local startWP = waypoints[1]
    local nextWP = waypoints[2] or waypoints[1]
    local trackDir = (nextWP.Position - startWP.Position).Unit
    local rightDir = Vector3.new(-trackDir.Z, 0, trackDir.X).Unit

    -- Urutan grid bertahap (kiri-kanan)
    local row = math.floor(racerIndex / 2)
    local col = (racerIndex % 2 == 0) and -1 or 1
    local spawnPos = startWP.Position - (trackDir * (row * 14)) + (rightDir * (col * 8)) + Vector3.new(0, 3, 0)
    local spawnCFrame = CFrame.lookAt(spawnPos, spawnPos + trackDir)

    -- Buat model Mobil atau Motor
    local vehicleType = racerData.vehicle or "car"
    local model, primaryPart, exhaust
    if vehicleType == "motorcycle" then
        model, primaryPart, exhaust = createMotorcycleModel(color)
    else
        model, primaryPart, exhaust = createCarModel(color)
    end

    model:SetPrimaryPartCFrame(spawnCFrame)

    -- Tambahkan BodyGyro & BodyVelocity untuk navigasi halus
    local bg = Instance.new("BodyGyro")
    bg.MaxTorque = Vector3.new(400000, 400000, 400000)
    bg.P = 15000
    bg.CFrame = spawnCFrame
    bg.Parent = primaryPart

    local bv = Instance.new("BodyVelocity")
    bv.MaxForce = Vector3.new(400000, 400000, 400000)
    bv.Velocity = Vector3.new(0, 0, 0)
    bv.Parent = primaryPart

    -- Billboard GUI di atas kendaraan
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
    local vIcon = (vehicleType == "motorcycle") and "🏍️ " or "🏎️ "
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
        vehicleType = vehicleType,
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
    print("🏎️ Racer Spawned:", racerEntry.nickname, "(" .. vehicleType .. ")")
    return racerEntry
end

-- =============================================================================
-- LOGIKA POWER-UP (SPEED BOOST, TURBO DONUT, ROKET TOPI)
-- =============================================================================
local function applyBoost(racerEntry, multiplier, isTurbo)
    if not racerEntry then return end
    
    if isTurbo then
        racerEntry.turboActive = true
        racerEntry.speedBonus = 55
        racerEntry.bonusTimer = 8.0 -- 8 detik turbo
        if racerEntry.exhaust then
            local fire = racerEntry.exhaust:FindFirstChild("TurboFire")
            if fire then fire.Enabled = true end
        end
        racerEntry.infoLabel.Text = "🍩 TURBO AKTIF! 🔥"
    else
        local bonus = math.min(multiplier * 9, 45)
        racerEntry.speedBonus = bonus
        racerEntry.bonusTimer = 5.0 -- 5 detik boost
        racerEntry.infoLabel.Text = "⚡ BOOST +" .. tostring(multiplier) .. "x!"
    end
end

local function fireRocket(shooterEntry)
    if not shooterEntry or not shooterEntry.primaryPart then return end

    -- Cari lawan terdekat di depan penembak
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

    -- Buat Proyektil Roket Topi
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

    -- Gerakkan roket ke target atau ke depan
    task.spawn(function()
        local dir = shooterEntry.primaryPart.CFrame.LookVector
        for step = 1, 35 do
            if not rocket or not rocket.Parent then break end
            if targetEntry and targetEntry.primaryPart then
                dir = (targetEntry.primaryPart.Position - rocket.Position).Unit
            end
            rocket.CFrame = CFrame.lookAt(rocket.Position + (dir * 9), rocket.Position + (dir * 18))
            
            -- Cek collision
            if targetEntry and targetEntry.primaryPart then
                local hitDist = (rocket.Position - targetEntry.primaryPart.Position).Magnitude
                if hitDist < 8 then
                    -- EXPLOSION!
                    local exp = Instance.new("Explosion")
                    exp.Position = targetEntry.primaryPart.Position
                    exp.BlastRadius = 15
                    exp.BlastPressure = 0
                    exp.Parent = workspace

                    -- Buat mobil lawan terpental & berputar (spin out)
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
-- WINNER CELEBRATION (KEMBANG API & PODIUM)
-- =============================================================================
local function announceWinner(winnerEntry)
    isRaceRunning = false
    print("🏆 PEMENANG BALAPAN: " .. winnerEntry.nickname)

    -- Kirim status juara ke TikInfinity Web Server
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

    -- Kembang api di atas mobil pemenang
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
    end)
end

-- =============================================================================
-- GAME LOOP (PERGERAKAN SIRKUIT & UPDATE POSISI)
-- =============================================================================
RunService.Heartbeat:Connect(function(dt)
    if not isRaceRunning or #waypoints == 0 then return end

    for uid, racer in pairs(racers) do
        if racer.primaryPart and racer.bg and racer.bv then
            -- Hitung bonus timer
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

            -- Hitung spin timer (akibat roket)
            if racer.spinTimer > 0 then
                racer.spinTimer = racer.spinTimer - dt
                racer.bg.CFrame = racer.bg.CFrame * CFrame.Angles(0, math.rad(45), 0)
                racer.bv.Velocity = Vector3.new(0, 0, 0)
            else
                -- Navigasi ke waypoint berikutnya
                local targetWP = waypoints[racer.currentWP]
                if targetWP then
                    local targetPos = targetWP.Position + Vector3.new(0, 3, 0)
                    local currentPos = racer.primaryPart.Position
                    local toTarget = (targetPos - currentPos)
                    local dist = toTarget.Magnitude

                    -- Jika sudah dekat dengan waypoint, lanjut ke WP berikutnya
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

                    -- Arahkan haluan ke waypoint
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

                    elseif act == "boost" then
                        local uid = tostring(payload.user_id or payload.nickname):lower()
                        local racer = racers[uid] or spawnRacerVehicle(payload)
                        applyBoost(racer, payload.multiplier or 1, payload.turbo or false)

                    elseif act == "fire_rocket" then
                        local uid = tostring(payload.user_id or payload.nickname):lower()
                        local racer = racers[uid] or spawnRacerVehicle(payload)
                        fireRocket(racer)

                    elseif act == "start_race" then
                        isRaceRunning = true
                        totalLaps = payload.total_laps or 3
                        print("🚀 BALAPAN RESMI DIMULAI! Total Lap:", totalLaps)

                    elseif act == "reset_race" then
                        isRaceRunning = false
                        if payload.clear_racers then
                            for _, r in pairs(racers) do
                                if r.model then r.model:Destroy() end
                            end
                            racers = {}
                            print("🧹 Arena Balap Dikosongkan.")
                        else
                            -- Reset ke grid start
                            local rIdx = 0
                            for _, r in pairs(racers) do
                                r.lap = 1
                                r.currentWP = 1
                                r.speedBonus = 0
                                r.bonusTimer = 0
                                r.spinTimer = 0
                                r.infoLabel.Text = "🏁 Lap 1/" .. tostring(totalLaps)
                                
                                local startWP = waypoints[1]
                                if startWP and r.primaryPart then
                                    local trackDir = Vector3.new(1, 0, 0)
                                    if waypoints[2] then trackDir = (waypoints[2].Position - startWP.Position).Unit end
                                    local rightDir = Vector3.new(-trackDir.Z, 0, trackDir.X).Unit
                                    local row = math.floor(rIdx / 2)
                                    local col = (rIdx % 2 == 0) and -1 or 1
                                    local p = startWP.Position - (trackDir * (row * 14)) + (rightDir * (col * 8)) + Vector3.new(0, 3, 0)
                                    r.primaryPart.CFrame = CFrame.lookAt(p, p + trackDir)
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
print("🏎️ [TikInfinity] Roblox Live Race Controller Aktif & Menunggu Event...")

task.spawn(function()
    while true do
        pollServer()
        task.wait(POLL_INTERVAL)
    end
end)

