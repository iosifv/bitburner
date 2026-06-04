// Shared environment constants for the engine-v2 system.


// ── Ports ─────────────────────────────────────────────────────────────────────
export const LOG_PORT          = 100; // propulsion engine log drain
export const BATCH_DONE_PORT   = 101; // reserved for JIT batcher completion signals
export const BATCHER_PORT      = 102; // batcher state — peek() to read without consuming
export const DARKNET_ROAMING_PORT   = 666;  // tendrils → engine: heartbeats and auth results
export const DARKNET_BROADCAST_PORT = 1666; // engine → tendrils: known node secrets (peek-able snapshot)

// ── UI window layout ──────────────────────────────────────────────────────────
export const uiTopPadding     = 20;
export const uiQuonfigWidth   = 400;
export const uiQuonfigHeight  = 1400;

export const uiStatsWidth     = 625;
export const uiStatsHeight    = 400;

export const uiEngineWidth    = 625;
export const uiBatchingWidth  = 525;
export const uiBatchingHeight = uiQuonfigHeight;


export const uiBoysWidth      = uiStatsWidth;
export const uiBoysHeight     = 620;

export const uiDarknetWidth   = 800;
export const uiDarknetHeight  = uiQuonfigHeight - 30;
