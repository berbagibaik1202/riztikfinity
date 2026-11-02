--[[
    =============================================================================
    ROBLOX LIVE RACE CINEMATIC CAMERA (LocalScript)
    =============================================================================
    Letakkan script ini di: StarterPlayer -> StarterPlayerScripts -> LocalScript
    (atau di dalam StarterGui)
    
    Fitur:
    1. Otomatis beralih sudut kamera dinamis (Belakang, Depan, Samping, Drone).
    2. PRIORITAS GIFT: Saat penonton kirim Mawar/Donat/Topi, kamera SEKETIKA
       mengarah ke mobil milik penonton tersebut dengan banner VIP di layar!
    3. Transisi gerakan kamera halus (Smooth Interpolation / Lerping) seperti siaran TV F1.
    4. Hotkey Manual:
       - Tekan [C] : Ganti Sudut Kamera (Belakang ➔ Depan ➔ Samping ➔ Drone)
       - Tekan [V] : Ganti Pembalap Berikutnya
       - Tekan [B] : Reset ke Kamera Otomatis (Auto Director)
    =============================================================================
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local localPlayer = Players.LocalPlayer
local camera = workspace.CurrentCamera

-- Dapatkan RemoteEvent untuk sinyal balap & kamera dari Server
local cameraRemote = ReplicatedStorage:WaitForChild("RaceCameraRemote", 10)

-- State Kamera
local isAutoDirector = true
local isRaceActive = false
local currentTargetModel = nil
local currentTargetUserId = nil
local currentTargetName = "Pembalap"
local currentAngleIndex = 1 -- 1: Belakang, 2: Depan, 3: Samping, 4: Drone
local ANGLE_MODES = {"BEHIND", "FRONT", "SIDE", "DRONE"}

local giftLockTimer = 0 -- Timer pengunci kamera saat ada gift masuk
local autoSwitchTimer = 5.0 -- Timer pergantian otomatis sudut kamera (detik)

-- GUI Banner Fokus Kamera di Layar
local pGui = localPlayer:WaitForChild("PlayerGui")
local camGui = pGui:FindFirstChild("RaceCameraFocusGui")
if not camGui then
    camGui = Instance.new("ScreenGui")
    camGui.Name = "RaceCameraFocusGui"
    camGui.ResetOnSpawn = false
    camGui.DisplayOrder = 200
    camGui.Parent = pGui
end

-- Banner VIP Penonton yang Dapat Gift / Sedang Difokuskan
local focusBanner = Instance.new("Frame")
focusBanner.Name = "FocusBanner"
focusBanner.Size = UDim2.new(0, 360, 0, 48)
focusBanner.Position = UDim2.new(0.5, 0, 0.08, 0)
focusBanner.AnchorPoint = Vector2.new(0.5, 0)
focusBanner.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
focusBanner.BackgroundTransparency = 0.15
focusBanner.BorderSizePixel = 0
focusBanner.Visible = false
focusBanner.Parent = camGui

local fbCorner = Instance.new("UICorner")
fbCorner.CornerRadius = UDim.new(0, 10)
fbCorner.Parent = focusBanner

local fbStroke = Instance.new("UIStroke")
fbStroke.Color = Color3.fromRGB(244, 63, 94)
fbStroke.Thickness = 2
fbStroke.Parent = focusBanner

local fbIcon = Instance.new("TextLabel")
fbIcon.Size = UDim2.new(0, 36, 1, 0)
fbIcon.Position = UDim2.new(0, 8, 0, 0)
fbIcon.BackgroundTransparency = 1
fbIcon.Font = Enum.Font.GothamBold
fbIcon.TextSize = 22
fbIcon.Text = "🎥"
fbIcon.Parent = focusBanner

local fbTitle = Instance.new("TextLabel")
fbTitle.Name = "Title"
fbTitle.Size = UDim2.new(1, -50, 0.5, 0)
fbTitle.Position = UDim2.new(0, 45, 0, 5)
fbTitle.BackgroundTransparency = 1
fbTitle.Font = Enum.Font.GothamBold
fbTitle.TextSize = 13
fbTitle.TextColor3 = Color3.fromRGB(255, 255, 255)
fbTitle.TextXAlignment = Enum.TextXAlignment.Left
fbTitle.Text = "KAMERA FOKUS: Penonton"
fbTitle.Parent = focusBanner

local fbSub = Instance.new("TextLabel")
fbSub.Name = "Subtitle"
fbSub.Size = UDim2.new(1, -50, 0.45, 0)
fbSub.Position = UDim2.new(0, 45, 0.5, 0)
fbSub.BackgroundTransparency = 1
fbSub.Font = Enum.Font.GothamMedium
fbSub.TextSize = 11
fbSub.TextColor3 = Color3.fromRGB(254, 240, 138)
fbSub.TextXAlignment = Enum.TextXAlignment.Left
fbSub.Text = "⚡ Mengaktifkan Speed Boost!"
fbSub.Parent = focusBanner

local function showFocusBanner(titleText, subText, strokeColor)
    fbTitle.Text = titleText
    fbSub.Text = subText or ""
    fbStroke.Color = strokeColor or Color3.fromRGB(244, 63, 94)
    focusBanner.Visible = true
end

local function hideFocusBanner()
    focusBanner.Visible = false
end

-- =============================================================================
-- MENCARI KENDARAAN PEMBALAP DI WORKSPACE
-- =============================================================================
local function getAllRacerModels()
    local list = {}
    for _, child in ipairs(workspace:GetChildren()) do
        if (child.Name == "RacerCar" or child.Name == "RacerMotorcycle") and child:FindFirstChild("PrimaryPart") then
            table.insert(list, child)
        end
    end
    return list
end

local function findRacerModelByUserId(uid)
    local cleanUid = tostring(uid):lower()
    for _, model in ipairs(getAllRacerModels()) do
        local bb = model:FindFirstChild("RacerTag", true)
        if bb then
            local nickLabel = bb:FindFirstChild("Nickname")
            if nickLabel and string.find(string.lower(nickLabel.Text), cleanUid) then
                return model
            end
        end
    end
    return nil
end

-- =============================================================================
-- LOGIKA POSISI KAMERA DINAMIS (BELAKANG, DEPAN, SAMPING, DRONE)
-- =============================================================================
local function calculateDesiredCameraCFrame(targetModel, angleMode)
    local primary = targetModel and targetModel:FindFirstChild("PrimaryPart")
    if not primary then return nil end

    local pos = primary.Position
    local cf = primary.CFrame

    if angleMode == "BEHIND" then
        -- Kamera mengejar dari belakang mobil (pandangan balap F1 / Need for Speed)
        local camPos = cf * CFrame.new(0, 4.8, 14.5)
        local lookTarget = pos + (cf.LookVector * 18) + Vector3.new(0, 1.5, 0)
        return CFrame.lookAt(camPos.Position, lookTarget)

    elseif angleMode == "FRONT" then
        -- Kamera aksi depan menatap wajah driver & kap mesin kendaraan
        local camPos = cf * CFrame.new(0, 3.6, -12.5)
        local lookTarget = pos + Vector3.new(0, 2.2, 0)
        return CFrame.lookAt(camPos.Position, lookTarget)

    elseif angleMode == "SIDE" then
        -- Kamera samping perfil / aksi drifting
        local camPos = cf * CFrame.new(8.5, 2.8, 2)
        local lookTarget = pos + Vector3.new(0, 1.2, 0)
        return CFrame.lookAt(camPos.Position, lookTarget)

    elseif angleMode == "DRONE" then
        -- Kamera drone stadion melayang tinggi
        local camPos = pos + (cf.LookVector * -12) + Vector3.new(12, 18, 12)
        local lookTarget = pos
        return CFrame.lookAt(camPos, lookTarget)
    end

    -- Default fallback
    return cf * CFrame.new(0, 5, 14)
end

-- =============================================================================
-- LISTENER EVENT DARI SERVER (GIFT FOKUS & RACE EVENT)
-- =============================================================================
if cameraRemote then
    cameraRemote.OnClientEvent:Connect(function(eventType, payload)
        if eventType == "GIFT_FOCUS" and payload then
            -- Penonton mengirim Gift! SEKETIKA pindahkan kamera ke mobilnya!
            local targetModel = findRacerModelByUserId(payload.userId)
            if not targetModel then
                -- Coba cari berdasarkan nickname
                targetModel = findRacerModelByUserId(payload.nickname)
            end

            if targetModel then
                currentTargetModel = targetModel
                currentTargetUserId = payload.userId
                currentTargetName = payload.nickname or "Pembalap"
                
                -- Kunci kamera ke pembalap ini
                giftLockTimer = payload.duration or 7.0
                
                -- Mulai dari kamera DEPAN agar terlihat jelas siapa yang memberi gift,
                -- lalu otomatis berputar ke BELAKANG untuk melihat knalpot turbo/roket!
                currentAngleIndex = 2 -- FRONT

                local gName = payload.giftName or "Gift"
                local strokeCol = Color3.fromRGB(244, 63, 94)
                if string.find(string.lower(gName), "donut") or string.find(string.lower(gName), "turbo") then
                    strokeCol = Color3.fromRGB(249, 115, 22) -- Oranye api
                elseif string.find(string.lower(gName), "topi") or string.find(string.lower(gName), "roket") then
                    strokeCol = Color3.fromRGB(168, 85, 247) -- Ungu roket
                end

                showFocusBanner(
                    "🎥 FOKUS VIP: " .. currentTargetName,
                    "🎁 Memberi " .. gName .. "! (" .. tostring(math.floor(giftLockTimer)) .. "s)",
                    strokeCol
                )
                print("🎥 [KAMERA] Mengarahkan fokus langsung ke:", currentTargetName, "(" .. gName .. ")")
            end

        elseif eventType == "RACE_START" then
            isRaceActive = true
            camera.CameraType = Enum.CameraType.Scriptable
            hideFocusBanner()

        elseif eventType == "RACE_RESET" then
            isRaceActive = false
            giftLockTimer = 0
            hideFocusBanner()
            camera.CameraType = Enum.CameraType.Custom

        elseif eventType == "CYCLE_ANGLE" then
            currentAngleIndex = (currentAngleIndex % #ANGLE_MODES) + 1
            print("🎥 Angle Kamera Diganti via Host HUD:", ANGLE_MODES[currentAngleIndex])
        end
    end)
end

-- =============================================================================
-- RENDER STEPPED (GERAKAN KAMERA HALUS & SIKLUS ANGLE OTOMATIS)
-- =============================================================================
RunService.RenderStepped:Connect(function(dt)
    local allRacers = getAllRacerModels()
    if #allRacers == 0 then
        if not isRaceActive then
            camera.CameraType = Enum.CameraType.Custom
        end
        hideFocusBanner()
        return
    end

    -- Pastikan CameraType Scriptable saat balapan berlangsung
    camera.CameraType = Enum.CameraType.Scriptable

    -- Timer pengunci gift
    if giftLockTimer > 0 then
        giftLockTimer = giftLockTimer - dt
        
        -- Setelah 2.5 detik kamera depan, beralih ke kamera belakang agar melihat turbo/roket
        if giftLockTimer <= 4.5 and currentAngleIndex == 2 then
            currentAngleIndex = 1 -- BEHIND
        end

        if giftLockTimer <= 0 then
            giftLockTimer = 0
            hideFocusBanner()
        else
            fbSub.Text = "⚡ Sorotan Kamera Live (" .. string.format("%.1f", giftLockTimer) .. "s)"
        end
    else
        -- Siklus otomatis berganti pembalap dan sudut kamera setiap beberapa detik
        if isAutoDirector then
            autoSwitchTimer = autoSwitchTimer - dt
            if autoSwitchTimer <= 0 then
                autoSwitchTimer = math.random(50, 75) / 10 -- 5.0 - 7.5 detik

                -- Ganti sudut kamera (Belakang ➔ Depan ➔ Samping ➔ Drone)
                currentAngleIndex = (currentAngleIndex % #ANGLE_MODES) + 1

                -- Ganti pembalap target (acak atau bergiliran)
                local randIndex = math.random(1, #allRacers)
                currentTargetModel = allRacers[randIndex]
            end
        end
    end

    -- Pastikan ada target yang valid
    if not currentTargetModel or not currentTargetModel.Parent then
        currentTargetModel = allRacers[1]
    end

    local angleMode = ANGLE_MODES[currentAngleIndex] or "BEHIND"
    local targetCFrame = calculateDesiredCameraCFrame(currentTargetModel, angleMode)

    if targetCFrame then
        -- Interpolasi halus (Smooth Lerp 0.15)
        camera.CFrame = camera.CFrame:Lerp(targetCFrame, math.clamp(dt * 12, 0.08, 0.35))
    end
end)

-- =============================================================================
-- HOTKEY MANUAL UNTUK STREAMER (C, V, B)
-- =============================================================================
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end

    if input.KeyCode == Enum.KeyCode.C then
        -- Ganti Angle Kamera
        currentAngleIndex = (currentAngleIndex % #ANGLE_MODES) + 1
        print("🎥 Angle Kamera Diganti:", ANGLE_MODES[currentAngleIndex])

    elseif input.KeyCode == Enum.KeyCode.V then
        -- Ganti Pembalap Berikutnya
        local allRacers = getAllRacerModels()
        if #allRacers > 0 then
            local currentIndex = 1
            for i, model in ipairs(allRacers) do
                if model == currentTargetModel then
                    currentIndex = i
                    break
                end
            end
            local nextIndex = (currentIndex % #allRacers) + 1
            currentTargetModel = allRacers[nextIndex]
            isAutoDirector = false
            print("🎥 Fokus Pembalap Dipindah Manual.")
        end

    elseif input.KeyCode == Enum.KeyCode.B then
        -- Reset ke Kamera Otomatis
        isAutoDirector = true
        giftLockTimer = 0
        hideFocusBanner()
        print("🎥 Mode Kamera Otomatis (Auto Director) Diaktifkan.")
    end
end)

print("🎥 [TikInfinity] Cinematic Race Camera System v2.2 Aktif!")
