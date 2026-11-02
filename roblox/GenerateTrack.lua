--[[
    =============================================================================
    ROBLOX STADIUM RACE TRACK GENERATOR (Command Bar Script)
    =============================================================================
    CARA PAKAI DI ROBLOX STUDIO:
    1. Buka Roblox Studio (proyek Baseplate kosong).
    2. Buka View -> Centang "Command Bar" (di bagian bawah layar).
    3. Copy seluruh isi script ini, lalu Paste di Command Bar dan tekan ENTER!
    4. Sirkuit balap lengkap dengan aspal, pembatas neon, lampu stadion,
       garis start/finish, dan 16 waypoints akan otomatis tercipta dalam 1 detik!
    =============================================================================
]]

local Workspace = game:GetService("Workspace")

-- Bersihkan track lama jika ada
local oldTrack = Workspace:FindFirstChild("StadiumRaceTrack")
if oldTrack then oldTrack:Destroy() end

local oldWP = Workspace:FindFirstChild("RaceWaypoints")
if oldWP then oldWP:Destroy() end

local trackModel = Instance.new("Model")
trackModel.Name = "StadiumRaceTrack"
trackModel.Parent = Workspace

local wpFolder = Instance.new("Folder")
wpFolder.Name = "RaceWaypoints"
wpFolder.Parent = Workspace

-- Parameter Sirkuit Oval Stadium
local radiusX = 160 -- Panjang sirkuit
local radiusZ = 100 -- Lebar sirkuit
local trackWidth = 28 -- Lebar jalan aspal
local segmentCount = 36 -- Kehalusan kelokan sirkuit
local center = Vector3.new(0, 1, 0)

-- Lantai Aspal & Pembatas Neon
for i = 1, segmentCount do
    local angle1 = ((i - 1) / segmentCount) * math.pi * 2
    local angle2 = (i / segmentCount) * math.pi * 2

    local p1 = center + Vector3.new(math.cos(angle1) * radiusX, 0, math.sin(angle1) * radiusZ)
    local p2 = center + Vector3.new(math.cos(angle2) * radiusX, 0, math.sin(angle2) * radiusZ)

    local segmentCenter = (p1 + p2) / 2
    local segmentLength = (p2 - p1).Magnitude
    local dir = (p2 - p1).Unit
    local norm = Vector3.new(-dir.Z, 0, dir.X).Unit

    -- Segmen Aspal Jalan
    local road = Instance.new("Part")
    road.Name = "RoadSegment_" .. i
    road.Size = Vector3.new(trackWidth, 1.2, segmentLength + 0.5)
    road.CFrame = CFrame.lookAt(segmentCenter, segmentCenter + dir)
    road.Color = Color3.fromRGB(30, 41, 59)
    road.Material = Enum.Material.Asphalt
    road.Anchored = true
    road.CanCollide = true
    road.Parent = trackModel

    -- Garis Marka Putih di Tengah Jalan
    local line = Instance.new("Part")
    line.Size = Vector3.new(1.2, 1.25, segmentLength * 0.6)
    line.CFrame = CFrame.lookAt(segmentCenter, segmentCenter + dir)
    line.Color = Color3.fromRGB(255, 255, 255)
    line.Material = Enum.Material.SmoothPlastic
    line.Anchored = true
    line.CanCollide = false
    line.Parent = trackModel

    -- Pembatas Luar (Neon Pink / Magenta)
    local outerPos = segmentCenter + (norm * (trackWidth / 2 + 1)) + Vector3.new(0, 1.8, 0)
    local outerBarrier = Instance.new("Part")
    outerBarrier.Size = Vector3.new(1.6, 2.6, segmentLength + 0.6)
    outerBarrier.CFrame = CFrame.lookAt(outerPos, outerPos + dir)
    outerBarrier.Color = Color3.fromRGB(244, 63, 94)
    outerBarrier.Material = Enum.Material.Neon
    outerBarrier.Anchored = true
    outerBarrier.CanCollide = true
    outerBarrier.Parent = trackModel

    -- Pembatas Dalam (Neon Cyan / Electric Blue)
    local innerPos = segmentCenter - (norm * (trackWidth / 2 + 1)) + Vector3.new(0, 1.8, 0)
    local innerBarrier = Instance.new("Part")
    innerBarrier.Size = Vector3.new(1.6, 2.6, segmentLength + 0.6)
    innerBarrier.CFrame = CFrame.lookAt(innerPos, innerPos + dir)
    innerBarrier.Color = Color3.fromRGB(6, 182, 212)
    innerBarrier.Material = Enum.Material.Neon
    innerBarrier.Anchored = true
    innerBarrier.CanCollide = true
    innerBarrier.Parent = trackModel

    -- Simpan Waypoint balapan (setiap 2 segmen)
    if i % 2 == 1 or i == segmentCount then
        local wpIndex = #wpFolder:GetChildren() + 1
        local wp = Instance.new("Part")
        wp.Name = string.format("WP_%02d", wpIndex)
        wp.Size = Vector3.new(6, 1, 6)
        wp.Position = segmentCenter + Vector3.new(0, 1, 0)
        wp.Anchored = true
        wp.CanCollide = false
        wp.Transparency = 0.95
        wp.BrickColor = BrickColor.new("Bright yellow")
        wp.Parent = wpFolder
    end
end

-- Gerbang Start / Finish Line dengan Lampu & Billboard Checkerboard
local startPos = center + Vector3.new(radiusX, 0, 0)
local archLeft = Instance.new("Part")
archLeft.Size = Vector3.new(2.5, 16, 2.5)
archLeft.Position = startPos + Vector3.new(0, 8, -(trackWidth / 2 + 3))
archLeft.Color = Color3.fromRGB(15, 23, 42)
archLeft.Anchored = true
archLeft.Parent = trackModel

local archRight = Instance.new("Part")
archRight.Size = Vector3.new(2.5, 16, 2.5)
archRight.Position = startPos + Vector3.new(0, 8, (trackWidth / 2 + 3))
archRight.Color = Color3.fromRGB(15, 23, 42)
archRight.Anchored = true
archRight.Parent = trackModel

local archTop = Instance.new("Part")
archTop.Size = Vector3.new(4, 3.5, trackWidth + 8)
archTop.Position = startPos + Vector3.new(0, 16, 0)
archTop.Color = Color3.fromRGB(234, 179, 8)
archTop.Material = Enum.Material.Neon
archTop.Anchored = true
archTop.Parent = trackModel

-- Spanduk Teks Start / Finish
local surfaceGui = Instance.new("SurfaceGui")
surfaceGui.Face = Enum.NormalId.Front
surfaceGui.Parent = archTop

local titleLabel = Instance.new("TextLabel")
titleLabel.Size = UDim2.new(1, 0, 1, 0)
titleLabel.BackgroundTransparency = 1
titleLabel.Font = Enum.Font.GothamBlack
titleLabel.Text = "🏁 TIKTOK LIVE RACE ARENA 🏁"
titleLabel.TextScaled = true
titleLabel.TextColor3 = Color3.fromRGB(15, 23, 42)
titleLabel.Parent = surfaceGui

-- Lampu Sorot Stadion (4 Pilar Lampu)
local lightPoles = {
    Vector3.new(radiusX + 25, 0, radiusZ + 25),
    Vector3.new(-radiusX - 25, 0, radiusZ + 25),
    Vector3.new(radiusX + 25, 0, -radiusZ - 25),
    Vector3.new(-radiusX - 25, 0, -radiusZ - 25),
}
for _, polePos in ipairs(lightPoles) do
    local pole = Instance.new("Part")
    pole.Size = Vector3.new(3, 40, 3)
    pole.Position = polePos + Vector3.new(0, 20, 0)
    pole.Color = Color3.fromRGB(71, 85, 105)
    pole.Anchored = true
    pole.Parent = trackModel

    local lampHead = Instance.new("Part")
    lampHead.Size = Vector3.new(10, 4, 10)
    lampHead.Position = pole.Position + Vector3.new(0, 20, 0)
    lampHead.Color = Color3.fromRGB(254, 240, 138)
    lampHead.Material = Enum.Material.Neon
    lampHead.Anchored = true
    lampHead.Parent = trackModel

    local spotLight = Instance.new("SpotLight")
    spotLight.Brightness = 6
    spotLight.Range = 180
    spotLight.Color = Color3.fromRGB(255, 255, 255)
    spotLight.Face = Enum.NormalId.Bottom
    spotLight.Parent = lampHead
end

print("🎉 SIRKUIT BALAP ROBLOX SELESAI DIBUAT DENGAN SUKSES!")
print("📍 Total Waypoints:", #wpFolder:GetChildren())

-- Pasang Kamera Sinematik Otomatis di StarterPlayerScripts jika belum ada
local StarterPlayer = game:GetService("StarterPlayer")
local spScripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
if spScripts then
    local oldCam = spScripts:FindFirstChild("LiveRaceCamera")
    if oldCam then oldCam:Destroy() end
    local success, camCode = pcall(function()
        return game:GetService("HttpService"):GetAsync("http://127.0.0.1:8000/api/roblox/script/camera")
    end)
    if success and camCode and #camCode > 100 then
        local camScript = Instance.new("LocalScript")
        camScript.Name = "LiveRaceCamera"
        camScript.Source = camCode
        camScript.Parent = spScripts
        print("🎥 Script LiveRaceCamera berhasil otomatis dipasang di StarterPlayerScripts!")
    else
        print("💡 Catatan: Jangan lupa pasang script LiveRaceCamera.client.lua di StarterPlayerScripts.")
    end
end

print("🚀 Jalankan game (Play/Run F5) dan buka TikInfinity Controller!")

