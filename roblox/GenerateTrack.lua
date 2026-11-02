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

-- Garis Start/Finish Line Checkerboard di Aspal
local startLine = Instance.new("Part")
startLine.Name = "StartFinishLine"
startLine.Size = Vector3.new(trackWidth, 0.4, 4)
startLine.CFrame = CFrame.lookAt(Vector3.new(radiusX, 1.25, 0), Vector3.new(radiusX, 1.25, 10))
startLine.Color = Color3.fromRGB(248, 250, 252)
startLine.Material = Enum.Material.SmoothPlastic
startLine.Anchored = true
startLine.CanCollide = false
startLine.Parent = trackModel

-- Strip Checkerboard hitam di garis start
local checkStrip = Instance.new("Part")
checkStrip.Size = Vector3.new(trackWidth, 0.45, 1.5)
checkStrip.Position = Vector3.new(radiusX, 1.28, 0)
checkStrip.Color = Color3.fromRGB(15, 23, 42)
checkStrip.Material = Enum.Material.SmoothPlastic
checkStrip.Anchored = true
checkStrip.CanCollide = false
checkStrip.Parent = trackModel

-- Gerbang Start / Finish Line (Lebar & CanCollide = false agar mobil TIDAK PERNAH NYANGKUT!)
local startPos = Vector3.new(radiusX, 1.2, 0)
local archClearance = trackWidth / 2 + 5 -- 19 studs dari tengah (5 studs di luar barrier neon)

local archInner = Instance.new("Part")
archInner.Name = "StartArch_InnerPillar"
archInner.Size = Vector3.new(3, 18, 3)
archInner.Position = startPos + Vector3.new(-archClearance, 9, 0)
archInner.Color = Color3.fromRGB(15, 23, 42)
archInner.Anchored = true
archInner.CanCollide = false -- AMAN: Tidak akan pernah nyangkut!
archInner.Parent = trackModel

local archOuter = Instance.new("Part")
archOuter.Name = "StartArch_OuterPillar"
archOuter.Size = Vector3.new(3, 18, 3)
archOuter.Position = startPos + Vector3.new(archClearance, 9, 0)
archOuter.Color = Color3.fromRGB(15, 23, 42)
archOuter.Anchored = true
archOuter.CanCollide = false -- AMAN: Tidak akan pernah nyangkut!
archOuter.Parent = trackModel

local archTop = Instance.new("Part")
archTop.Name = "StartArch_Beam"
archTop.Size = Vector3.new(trackWidth + 14, 3.8, 3.5)
archTop.Position = startPos + Vector3.new(0, 18, 0)
archTop.Color = Color3.fromRGB(234, 179, 8)
archTop.Material = Enum.Material.Neon
archTop.Anchored = true
archTop.CanCollide = false
archTop.Parent = trackModel

-- Spanduk Teks Depan (Menghadap mobil yang mendekat dari belakang garis start / -Z)
local sgFront = Instance.new("SurfaceGui")
sgFront.Face = Enum.NormalId.Back
sgFront.Parent = archTop

local titleLabel = Instance.new("TextLabel")
titleLabel.Size = UDim2.new(1, 0, 1, 0)
titleLabel.BackgroundTransparency = 1
titleLabel.Font = Enum.Font.GothamBlack
titleLabel.Text = "🏁 TIKTOK LIVE RACE ARENA 🏁"
titleLabel.TextScaled = true
titleLabel.TextColor3 = Color3.fromRGB(15, 23, 42)
titleLabel.Parent = sgFront

-- Spanduk Teks Belakang (Menghadap pembalap yang melewati finish / +Z)
local sgBack = Instance.new("SurfaceGui")
sgBack.Face = Enum.NormalId.Front
sgBack.Parent = archTop

local finishLabel = Instance.new("TextLabel")
finishLabel.Size = UDim2.new(1, 0, 1, 0)
finishLabel.BackgroundTransparency = 1
finishLabel.Font = Enum.Font.GothamBlack
finishLabel.Text = "🏁 FINISH LINE 🏁"
finishLabel.TextScaled = true
finishLabel.TextColor3 = Color3.fromRGB(15, 23, 42)
finishLabel.Parent = sgBack

-- =============================================================================
-- PANGGUNG VIP STREAMER & KOMENTATOR (HOST SPECTATOR STAND)
-- =============================================================================
-- Terletak tepat di samping garis start pada posisi tinggi dengan pemandangan
-- penuh ke seluruh arena balap dan grid mobil!
local standPos = Vector3.new(radiusX + 22, 6, -15)

local standBase = Instance.new("Part")
standBase.Name = "HostSpectatorStand"
standBase.Size = Vector3.new(20, 2, 32)
standBase.Position = standPos
standBase.Color = Color3.fromRGB(30, 41, 59)
standBase.Material = Enum.Material.DiamondPlate
standBase.Anchored = true
standBase.CanCollide = true
standBase.Parent = trackModel

-- Tiang Penyangga Panggung (4 Tiang)
local legOffsets = {
    Vector3.new(8, -3.5, 14),
    Vector3.new(-8, -3.5, 14),
    Vector3.new(8, -3.5, -14),
    Vector3.new(-8, -3.5, -14)
}
for _, legOff in ipairs(legOffsets) do
    local leg = Instance.new("Part")
    leg.Size = Vector3.new(2, 5, 2)
    leg.Position = standPos + legOff
    leg.Color = Color3.fromRGB(15, 23, 42)
    leg.Anchored = true
    leg.CanCollide = true
    leg.Parent = trackModel
end

-- Tangga / Ramp Akses ke Panggung
local ramp = Instance.new("WedgePart")
ramp.Size = Vector3.new(6, 6, 14)
ramp.CFrame = CFrame.lookAt(standPos + Vector3.new(0, -3, -23), standPos + Vector3.new(0, -3, -15)) * CFrame.Angles(0, math.rad(180), 0)
ramp.Color = Color3.fromRGB(51, 65, 85)
ramp.Material = Enum.Material.DiamondPlate
ramp.Anchored = true
ramp.CanCollide = true
ramp.Parent = trackModel

-- Pagar Kaca Transparan Menghadap Arena Balap
local glassFront = Instance.new("Part")
glassFront.Size = Vector3.new(0.8, 4.2, 32)
glassFront.Position = standPos + Vector3.new(-9.6, 3.1, 0)
glassFront.Color = Color3.fromRGB(186, 230, 253)
glassFront.Material = Enum.Material.Glass
glassFront.Transparency = 0.55
glassFront.Anchored = true
glassFront.CanCollide = true
glassFront.Parent = trackModel

-- Meja Komentator Live
local desk = Instance.new("Part")
desk.Size = Vector3.new(3.5, 3.2, 12)
desk.Position = standPos + Vector3.new(-6.8, 2.6, 0)
desk.Color = Color3.fromRGB(15, 23, 42)
desk.Material = Enum.Material.SmoothPlastic
desk.Anchored = true
desk.CanCollide = true
desk.Parent = trackModel

-- Layar Monitor Siaran di Meja
local deskScreen = Instance.new("Part")
deskScreen.Size = Vector3.new(0.5, 2.2, 8)
deskScreen.Position = desk.Position + Vector3.new(0, 2.5, 0)
deskScreen.Color = Color3.fromRGB(14, 165, 233)
deskScreen.Material = Enum.Material.Neon
deskScreen.Anchored = true
deskScreen.CanCollide = false
deskScreen.Parent = trackModel

local sgDesk = Instance.new("SurfaceGui")
sgDesk.Face = Enum.NormalId.Right
sgDesk.Parent = deskScreen
local screenLabel = Instance.new("TextLabel")
screenLabel.Size = UDim2.new(1, 0, 1, 0)
screenLabel.BackgroundTransparency = 1
screenLabel.Font = Enum.Font.GothamBold
screenLabel.Text = "🎙️ LIVE STREAM DIRECTOR"
screenLabel.TextScaled = true
screenLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
screenLabel.Parent = sgDesk

-- Atap Kanopi VIP
local roof = Instance.new("Part")
roof.Size = Vector3.new(22, 1.5, 34)
roof.Position = standPos + Vector3.new(0, 14, 0)
roof.Color = Color3.fromRGB(15, 23, 42)
roof.Anchored = true
roof.CanCollide = true
roof.Parent = trackModel

local roofPillar = Instance.new("Part")
roofPillar.Size = Vector3.new(1.8, 14, 1.8)
roofPillar.Position = standPos + Vector3.new(9, 7, 0)
roofPillar.Color = Color3.fromRGB(51, 65, 85)
roofPillar.Anchored = true
roofPillar.Parent = trackModel

-- Plang Lampu Neon Mimbar
local bannerSign = Instance.new("Part")
bannerSign.Size = Vector3.new(1, 3.2, 22)
bannerSign.Position = standPos + Vector3.new(-10.5, 14.5, 0)
bannerSign.Color = Color3.fromRGB(56, 189, 248)
bannerSign.Material = Enum.Material.Neon
bannerSign.Anchored = true
bannerSign.CanCollide = false
bannerSign.Parent = trackModel

local sgBanner = Instance.new("SurfaceGui")
sgBanner.Face = Enum.NormalId.Left
sgBanner.Parent = bannerSign
local bannerText = Instance.new("TextLabel")
bannerText.Size = UDim2.new(1, 0, 1, 0)
bannerText.BackgroundTransparency = 1
bannerText.Font = Enum.Font.GothamBlack
bannerText.Text = "🎙️ HOST & KOMENTATOR VIP 🎙️"
bannerText.TextScaled = true
bannerText.TextColor3 = Color3.fromRGB(15, 23, 42)
bannerText.Parent = sgBanner

-- SpawnLocation Khusus Host/Streamer (Langsung Menghadap Garis Start!)
local hostSpawn = Instance.new("SpawnLocation")
hostSpawn.Name = "HostSpawnLocation"
hostSpawn.Size = Vector3.new(8, 0.6, 8)
hostSpawn.Position = standPos + Vector3.new(1, 1.4, 0)
hostSpawn.CFrame = CFrame.lookAt(standPos + Vector3.new(1, 1.4, 0), Vector3.new(radiusX, 3, -15))
hostSpawn.Color = Color3.fromRGB(59, 130, 246)
hostSpawn.Material = Enum.Material.Neon
hostSpawn.Anchored = true
hostSpawn.CanCollide = true
hostSpawn.Neutral = true
hostSpawn.Duration = 0
hostSpawn.Parent = trackModel

-- Hapus default SpawnLocation di baseplate kosong (koordinat 0,0,0) agar TIDAK NYASAR!
for _, item in ipairs(Workspace:GetChildren()) do
    if item:IsA("SpawnLocation") and item ~= hostSpawn then
        item:Destroy()
        print("🗑️ SpawnLocation lama di luar sirkuit berhasil dibersihkan.")
    end
end

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

