# Project Overview — Drawn System Documentation

This document provides a product and systems overview of the **Drawn** application. It explains why Drawn exists, the engineering problems it addresses, its boundaries, target audience, and high-level design topology.

---

## Background

Social parlor games rely on human expression, immediate laughter, and non-verbal cues. In physical spaces, games like Pictionary are engaging because of the cross-talk, shared reactions, and immediate visual feedback. 

When parlor games migrated to the web, they were split into functional components:
- The **game canvas** runs in a browser tab.
- The **group voice and video feeds** run in external chat applications (such as Discord, Zoom, or Teams).

By dividing the gameplay loop from the communications channel, traditional online board games lose the feeling of shared presence. Drawn was built to solve this separation. It integrates WebRTC video/voice feeds, real-time cooperative canvases, and game state loops into a unified, zero-install interface.

---

## Problem

Building a unified game-and-video application in the browser introduces three main problems:

1. **Context-Switching & Setup Friction**: 
   Getting a group of casual players onto a game requires coordinating room codes, link sharing, VoIP channel invites, camera testing, and window resizing. This multi-step configuration process leads to player dropouts before the game even begins.
2. **Synchronization Lag (Voice vs. Draw)**: 
   Standard audio/video streams use separate transport pipelines than game state WebSockets. This leads to a synchronization lag. A player drawing a prompt might hear a friend guess it correctly via voice chat before their screen renders the finishing strokes, ruining the suspense of the round.
3. **Hardware Overhead & Connection Limits**: 
   Running heavy web-conferencing channels alongside interactive canvases can crash browser tabs on mobile and lower-end hardware. Additionally, corporate firewalls and academic routers often block peer-to-peer media traffic.

Drawn solves these issues by acting as a **single browser-native client** that combines:
- Real-time drawing coordinates throttled to a low-bandwidth queue.
- Low-latency P2P mesh WebRTC video and audio channels.
- Synthesized game audio notifications generated directly on the client using the Web Audio API.

---

## Goals

The design of Drawn focuses on four key goals:

* **Zero-Setup Accessibility**: 
  A player can create a game room, share a link, and immediately have friends join with cameras, mics, and drawing tools working instantly without downloading apps or registering accounts.
* **Tight Event Synchronization**: 
  Game state transitions, correct guess triggers, tick-tock countdowns, and WebRTC media streams are synchronized to prevent spoilers.
* **Low-Bandwidth Footprint**: 
  Uses client-side audio synthesis (Web Audio API retro oscillators) to eliminate static sound file transfers, and normalizes drawing coordinate payloads to keep WebSocket traffic lightweight.
* **Resilient Connections**: 
  Features a 15-second backend session retention window that allows players to refresh their tabs without losing their score, host status, or room state. Stale WebRTC channels are cleaned up and renegotiated automatically upon re-joining.

---

## Non-goals

Drawn focuses on group game sessions and avoids features outside that scope:

- **Not a Professional Art Studio**: 
  The canvas does not support high-fidelity design tools (such as bezier curve controls, complex layers, custom textures, or pressure-sensitive pen dynamics). The focus is on fast, simple sketching.
- **Not a Large-Scale Video Conferencing Platform**: 
  Drawn does not aim to host hundreds of concurrent video feeds. It uses a full-mesh WebRTC topology optimized for casual group sizes (typically 2 to 10 players). Scaling beyond this is out of scope.
- **No Persistent Player Databases**: 
  To protect privacy and minimize server overhead, the application uses temporary, in-memory rooms. There are no profiles, user accounts, password databases, or persistent historic records.
- **No Native App Store Releases**: 
  Drawn is built exclusively for modern web browsers. Native wrapper apps (Electron, React Native) are out of scope.

---

## Target Users

Drawn is built for three primary groups:

1. **Distributed Workforces**: 
   Remote teams looking for quick, zero-setup icebreakers or team-building activities during meetings without needing corporate firewall access for external apps.
2. **Friend Groups**: 
   Friends who want to host game nights across different locations, chatting and laughing in real-time without having to split their screens.
3. **Casual Players**: 
   Web users looking for quick game sessions that load immediately on mobile devices, laptops, and tablets.

---

## High-level Design

Drawn uses a hybrid architecture: **Client-Server State Coordination** combined with a **Peer-to-Peer Media Mesh**.

```
                           +----------------------+
                           |  Node.js Backend     |
                           |  - WebSocket Server  |
                           |  - Room State Machine|
                           |  - Signaling Router  |<--+
                           +----------------------+   |
                                      ^               |
                     WebSocket        | WebSocket     | Signaling
                     Messages         | Messages      | Messages
                                      v               v
+-----------------------+  WebRTC   +-----------------------+
|     React Client 1    |<=========>|     React Client 2    |
| - Canvas Drawing      |  Media    | - Canvas Drawing      |
| - Audio Web Synth     |  Streams  | - Audio Web Synth     |
| - State Sync Receiver |           | - State Sync Receiver |
+-----------------------+           +-----------------------+
```

1. **The Game Coordinator (Authoritative Server)**: 
   Maintains the game state (timers, player scoreboards, lobby status, drawing stroke histories) in server memory. This ensures all clients are synced to the same clock.
2. **The Signaling Gateway (Relay)**: 
   Coordinates WebRTC connection handshakes. When a client joins, the server routes signaling payloads (SDP offers, answers, and candidates) between peers to establish media connections.
3. **The WebRTC Peer Mesh (Direct Media Channels)**: 
   Once signaling is complete, client media engines (cameras and microphones) stream directly to each other without touching the server, minimizing hosting costs and latency.
4. **The React Single-Page Application (Client)**: 
   Renders the game board, coordinates canvas updates, synthesizes audio effects, handles particle animations, and manages local webcam/microphone hardware inputs.

---

## Core Components

The Drawn system is composed of six core elements:

- **Server-Authoritative Game Engine**: 
  A state machine in [server.ts](file:///Users/swas_k/antigravity/Scribble-Voice-&-Video-Showdown-2026-07-02-1904e/server.ts) that handles rooms, player slots, word selections, draw phases, automatic timer countdowns, and scoreboard rankings.
- **WebSocket WebRTC Signaling Gateway**: 
  Relays WebRTC signals between clients to open direct media paths, and handles session recovery and cleanup of stale channels.
- **Throttled Interactive Canvas**: 
  The client drawing canvas in [DrawingCanvas.tsx](file:///Users/swas_k/antigravity/Scribble-Voice-&-Video-Showdown-2026-07-02-1904e/src/components/DrawingCanvas.tsx) that translates coordinates to a normalized `[0,1]` scale and throttled broadcasts (every 60ms) to ensure smooth rendering on varying screen resolutions.
- **WebRTC Peer-to-Peer Media Room**: 
  Manages device permission prompts (camera/mic) and maintains direct peer connections using STUN fallbacks and dynamic TURN API credentials.
- **Web Audio API Synth Engine**: 
  A chiptune music and sound synthesizer in [CelebrationOverlay.tsx](file:///Users/swas_k/antigravity/Scribble-Voice-&-Video-Showdown-2026-07-02-1904e/src/components/CelebrationOverlay.tsx#L4-L154) that generates custom 8-bit sound cues locally on the client.
- **2D Particle Canvas Overlay**: 
  Renders particle animations (confetti, stars, emojis) using `requestAnimationFrame` to celebrate correct guesses and game-over states.
