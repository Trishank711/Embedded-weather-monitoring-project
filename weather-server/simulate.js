/**
 * ESP32 Weather Station — Simulator
 * Mimics the ESP32 sketch: posts a reading every 5 seconds (instead of 5 min)
 * Run: node simulate.js
 */

const SERVER_URL = "http://localhost:3000/api/weather/upload";
const DEVICE_ID  = "ESP32_WEATHER_01";
const INTERVAL_S = 5;

// Realistic drifting sensor values
let temp = 27.0;
let hum  = 55.0;
let tick = 0;

function drift(val, min, max, step = 0.3) {
  const delta = (Math.random() - 0.48) * step;
  return Math.min(max, Math.max(min, +(val + delta).toFixed(1)));
}

async function post(payload) {
  const res = await fetch(SERVER_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  const ts = new Date().toLocaleTimeString();
  if (res.ok) {
    console.log(`[${ts}] ✓ sent  temp=${payload.temperature}°C  hum=${payload.humidity}%${payload.is_cached ? "  (cached)" : ""}`);
  } else {
    console.error(`[${ts}] ✗ rejected:`, data.errors);
  }
}

async function tick_fn() {
  tick++;
  temp = drift(temp, 15, 40);
  hum  = drift(hum,  30, 90, 0.5);

  // Every 8th tick: simulate a cached/offline reading (older age)
  const isCached = tick % 8 === 0;
  await post({
    device_id:        DEVICE_ID,
    temperature:      temp,
    humidity:         hum,
    is_cached:        isCached,
    reading_age_secs: isCached ? 310 : 0,
  });

  // Every 15th tick: send an out-of-range value to test the red badge
  if (tick % 15 === 0) {
    console.log("  → injecting out-of-range reading for UI test");
    await post({
      device_id:        DEVICE_ID,
      temperature:      92.0,   // above 85°C limit
      humidity:         hum,
      is_cached:        false,
      reading_age_secs: 0,
    });
  }
}

console.log(`Simulating ESP32 → ${SERVER_URL}`);
console.log(`Posting every ${INTERVAL_S}s  |  Ctrl+C to stop\n`);
tick_fn();
setInterval(tick_fn, INTERVAL_S * 1000);
