/**
 * ESP32 Weather Station — Backend Server
 * Node.js / Express  |  Tier 2
 *
 * Endpoints:
 *   POST /api/weather/upload   ← ESP32 pushes readings here
 *   GET  /api/weather/latest   ← Dashboard polls this
 *   GET  /api/weather/history  ← Last N readings (default 50)
 */

const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── In-memory store (replace with DB for production) ──────
const MAX_HISTORY = 200;
const readings    = [];   // newest-first after push

// ── Validation helpers ────────────────────────────────────
const RANGES = {
  temperature:   { min: -40,  max: 85  },   // BMP280 / DHT11 limits
  humidity:      { min: 0,    max: 100 },
  reading_age_secs: { min: 0, max: 86400 },  // sanity: ≤ 24 h
};

function validate(body) {
  const errors = [];

  if (typeof body.device_id !== "string" || !body.device_id.trim())
    errors.push("device_id must be a non-empty string");

  for (const [field, { min, max }] of Object.entries(RANGES)) {
    const v = body[field];
    if (typeof v !== "number" || isNaN(v))
      errors.push(`${field} must be a number`);
    else if (v < min || v > max)
      errors.push(`${field} out of range [${min}, ${max}] — got ${v}`);
  }

  return errors;
}

// ── POST /api/weather/upload ──────────────────────────────
app.post("/api/weather/upload", (req, res) => {
  const errors = validate(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }

  const record = {
    device_id:        req.body.device_id,
    temperature:      +req.body.temperature.toFixed(1),
    humidity:         +req.body.humidity.toFixed(1),
    is_cached:        Boolean(req.body.is_cached),
    reading_age_secs: Math.round(req.body.reading_age_secs),
    received_at:      new Date().toISOString(),
  };

  readings.unshift(record);          // newest first
  if (readings.length > MAX_HISTORY) readings.length = MAX_HISTORY;

  console.log(`[${record.received_at}] ${record.device_id} → ${record.temperature}°C  ${record.humidity}% RH${record.is_cached ? "  (cached)" : ""}`);
  res.json({ ok: true });
});

// ── GET /api/weather/latest ───────────────────────────────
app.get("/api/weather/latest", (req, res) => {
  if (!readings.length)
    return res.status(404).json({ ok: false, error: "No data yet" });
  res.json({ ok: true, data: readings[0] });
});

// ── GET /api/weather/history?limit=50 ────────────────────
app.get("/api/weather/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_HISTORY);
  res.json({ ok: true, data: readings.slice(0, limit) });
});

// ── Health check ──────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, count: readings.length }));

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`Weather server running on http://localhost:${PORT}`)
);
