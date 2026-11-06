"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Track = void 0;
class Track {
    id;
    name;
    roadWidth;
    waypoints;
    segmentLengths = [];
    totalLength = 0;
    constructor() {
        this.id = "circuit_grand_prix";
        this.name = "RizLive Arena Grand Prix";
        this.roadWidth = 140; // width of road in pixels
        // Smooth closed loop waypoints (optimized for 1920x1080 canvas)
        this.waypoints = [
            { x: 380, y: 880 }, // 0: Start / Finish Line
            { x: 780, y: 880 }, // 1: Straightaway
            { x: 1220, y: 880 }, // 2: End of straight
            { x: 1580, y: 800 }, // 3: Turn 1 Entry
            { x: 1720, y: 580 }, // 4: Turn 1 Apex
            { x: 1580, y: 340 }, // 5: Turn 1 Exit
            { x: 1280, y: 260 }, // 6: Upper Straight
            { x: 1040, y: 380 }, // 7: Chicane Entry
            { x: 880, y: 240 }, // 8: Chicane Apex
            { x: 620, y: 260 }, // 9: Chicane Exit
            { x: 320, y: 320 }, // 10: Hairpin Entry
            { x: 200, y: 540 }, // 11: Hairpin Apex
            { x: 280, y: 740 }, // 12: Final Turn Entry
        ];
        this.calculateLengths();
    }
    calculateLengths() {
        this.segmentLengths = [];
        this.totalLength = 0;
        const n = this.waypoints.length;
        for (let i = 0; i < n; i++) {
            const p1 = this.waypoints[i];
            const p2 = this.waypoints[(i + 1) % n];
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            this.segmentLengths.push(dist);
            this.totalLength += dist;
        }
    }
    getTrackData() {
        return {
            id: this.id,
            name: this.name,
            waypoints: this.waypoints,
            roadWidth: this.roadWidth,
            length: this.totalLength,
        };
    }
    /**
     * Get continuous position along track given progress (0.0 to 1.0) and lateral lane offset (-1.0 to 1.0)
     */
    getPointAtProgress(progress, laneOffset = 0) {
        const normProgress = ((progress % 1) + 1) % 1;
        let targetDist = normProgress * this.totalLength;
        const n = this.waypoints.length;
        let accumulated = 0;
        for (let i = 0; i < n; i++) {
            const segLen = this.segmentLengths[i];
            if (accumulated + segLen >= targetDist || i === n - 1) {
                const remaining = targetDist - accumulated;
                const t = Math.max(0, Math.min(1, segLen > 0 ? remaining / segLen : 0));
                const p1 = this.waypoints[i];
                const p2 = this.waypoints[(i + 1) % n];
                // Center road position
                const cx = p1.x + (p2.x - p1.x) * t;
                const cy = p1.y + (p2.y - p1.y) * t;
                // Heading direction and perpendicular normal for lane offset
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const angle = Math.atan2(dy, dx);
                // Perpendicular vector (-dy, dx)
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                // Offset lateral position based on lane (-1 to +1 of half road width)
                const lateralDist = laneOffset * (this.roadWidth * 0.35);
                const x = cx + nx * lateralDist;
                const y = cy + ny * lateralDist;
                return { x, y, angle, currentWaypoint: i };
            }
            accumulated += segLen;
        }
        const p0 = this.waypoints[0];
        return { x: p0.x, y: p0.y, angle: 0, currentWaypoint: 0 };
    }
}
exports.Track = Track;
