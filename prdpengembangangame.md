# RIZLIVE RACING BATTLE — DEVELOPMENT HANDOFF

**Version:** 1.0  
**Product:** RizLive Game Engine  
**Game:** Racing Battle  
**Platform:** HTML5 Web Game  
**Engine:** Phaser 4 + TypeScript  
**Backend:** Node.js  
**Realtime:** Socket.IO  
**Database:** SQLite

## 1. Project Objective

Build an individual multiplayer arcade racing game controlled automatically by TikTok Live events through the existing Universal TikTok Live Game Controller.

Each TikTok viewer can become an individual racer. Gift events, comments, likes, follows, and other supported events can trigger configured actions on the corresponding participant's vehicle.

## 2. Mandatory Architecture

Maintain strict separation between:

1. Existing TikTok Connector.
2. Universal Event Processing Engine.
3. Universal Game Adapter Protocol.
4. Racing Game Server.
5. Racing Game Client.
6. Creator Dashboard.

The Racing Game MUST NOT implement its own TikTok connector.

The game must receive validated universal actions through the adapter protocol.

## 3. Core Requirements

- Individual participant registration.
- Unique participant identity.
- Vehicle assignment.
- Automatic racing mechanics.
- Multiple laps.
- Race countdown.
- Finish detection.
- Leaderboard.
- Gift and comment action mapping.
- Nitro and power-up system.
- Event queue.
- Cooldown.
- Duplicate event prevention.
- Session management.
- Race history.
- Reconnection and state synchronization.

## 4. Gameplay

MVP uses top-down 2D arcade racing.

Vehicles follow a configured circuit. Their speed, lane selection, and power-ups can be affected by universal actions.

Each participant has an independent vehicle state.

Gift actions must target the correct participant using a stable TikTok user identifier.

Gift sending is not mandatory for basic participation.

## 5. Universal Actions

Implement:

- JOIN_RACE
- LEAVE_RACE
- ACCELERATE
- NITRO
- TURN_LEFT
- TURN_RIGHT
- SHIELD
- REPAIR
- SLOW_DOWN
- SPAWN_OBSTACLE
- START_RACE
- PAUSE_RACE
- FINISH_RACE
- RESET_RACE

Expose supported actions through a capabilities endpoint.

## 6. Game State

Implement:

- IDLE
- WAITING
- COUNTDOWN
- RACING
- PAUSED
- FINISHED
- RESULTS
- ERROR

All game state transitions must be validated on the server.

## 7. Technical Requirements

- TypeScript throughout the game packages.
- Phaser for game rendering.
- Node.js for game logic and session management.
- Socket.IO for realtime communication.
- SQLite for persistent configuration and race results.
- JSON-based game profiles.
- Protocol versioning.
- Authentication for adapter connections.
- Event deduplication.
- Rate limiting.
- Bounded action queues.
- Emergency stop.

The game server must be authoritative for participant positions, race progress, action validation, and winner determination.

The browser client is responsible for rendering and presentation, not deciding official race results.

## 8. Creator Dashboard

Provide:

- Game session controls.
- Race configuration.
- Participant monitoring.
- Gift mapping editor.
- Action configuration.
- Event monitor.
- Leaderboard.
- Race history.
- Connection status.
- Event simulation mode.

## 9. Future Compatibility

The architecture must support future adapters:

- Quiz Battle.
- Unity games.
- Unreal games.
- Browser games.
- Custom games.

Quiz Battle will use the same Universal Controller and communication protocol, with separate team, question, answer, and score logic.

## 10. Development Rules

- Inspect the existing Universal Controller before integration.
- Do not replace or rewrite its TikTok connector.
- Do not assume unsupported event types are available.
- Do not duplicate event processing logic inside the game.
- Do not hardcode gift mappings.
- Do not hardcode game balance values.
- Keep game profiles configurable.
- Maintain backward-compatible protocol versions where practical.
- Build and test each module independently.
- Provide automated tests for critical game logic.
- Document all adapter events and action schemas.

## 11. Definition of Done

The MVP is complete when a real supported TikTok event can pass through the existing controller, be normalized, mapped to a universal action, validated by the Racing Adapter, executed on the correct vehicle, and reflected in the real-time game state and leaderboard.

A simulated-event test mode must also work without an active TikTok Live session.

**Final Deliverable:** RizLive Racing Battle V1.0 Beta, including source code, game adapter, creator dashboard, database schema, integration documentation, and Windows/browser deployment instructions.