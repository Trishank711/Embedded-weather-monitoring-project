import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";

// ── Config ────────────────────────────────────────────────
const API_BASE    = "http://localhost:3000/api/weather";
const POLL_MS     = 30_000;   // 30 s polling
const STALE_SECS  = 660;      // > 11 min = stale (2 missed uploads)
const CACHE_KEY   = "wx_latest";

// ── Range bounds (mirrors server) ─────────────────────────
const BOUNDS = {
  temperature: { min: -40, max: 85,  unit: "°C" },
  humidity:    { min: 0,   max: 100, unit: "%" },
};

function outOfRange(field, val) {
  if (val == null) return false;
  return val < BOUNDS[field].min || val > BOUNDS[field].max;
}

// ── Stale badge ───────────────────────────────────────────
function staleSince(receivedAt) {
  if (!receivedAt) return null;
  return Math.floor((Date.now() - new Date(receivedAt).getTime()) / 1000);
}

// ── Minimal fetch wrapper ─────────────────────────────────
async function apiFetch(path) {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function Badge({ label, danger, warn, muted }) {
  const bg = danger ? "#ef4444" : warn ? "#f59e0b" : muted ? "#374151" : "#10b981";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.05em",
      background: bg,
      color: "#fff",
      textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}

function Metric({ label, value, unit, field, cached }) {
  if (value == null) return null;
  const bad = outOfRange(field, value);
  return (
    <div style={{
      background: bad ? "rgba(239,68,68,.1)" : "rgba(255,255,255,.04)",
      border: `1px solid ${bad ? "#ef4444" : "rgba(255,255,255,.1)"}`,
      borderRadius: 10,
      padding: "18px 22px",
      flex: "1 1 160px",
      minWidth: 150,
    }}>
      <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 38, fontWeight: 300, color: bad ? "#ef4444" : "#f3f4f6", lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>
        {value}<span style={{ fontSize: 18, marginLeft: 3, color: "#6b7280" }}>{unit}</span>
      </div>
      {bad && <div style={{ marginTop: 6 }}><Badge label="Out of range" danger /></div>}
      {cached && !bad && <div style={{ marginTop: 6 }}><Badge label="Cached" warn /></div>}
    </div>
  );
}

function MiniChart({ data, field, color }) {
  if (!data.length) return null;
  const chartData = [...data].reverse().map((r, i) => ({
    i,
    v: r[field],
    t: r.received_at ? new Date(r.received_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : i,
  }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
        <XAxis dataKey="t" tick={{ fill: "#6b7280", fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: "#9ca3af" }}
          itemStyle={{ color: color }}
        />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────
export default function App() {
  const [latest,  setLatest]  = useState(null);
  const [history, setHistory] = useState([]);
  const [error,   setError]   = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const timerRef = useRef(null);

  // ── Load / save localStorage fallback ─────────────────
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }
  function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  }

  // ── Fetch ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [latRes, histRes] = await Promise.all([
        apiFetch("/latest"),
        apiFetch("/history?limit=40"),
      ]);
      if (latRes.ok)  { setLatest(latRes.data); saveCache(latRes.data); setFromCache(false); }
      if (histRes.ok) setHistory(histRes.data);
      setError(null);
    } catch (e) {
      // Fall back to localStorage
      const cached = loadCache();
      if (cached) { setLatest(cached); setFromCache(true); }
      setError("Cannot reach server — showing cached data");
    }
  }, []);

  useEffect(() => {
    // Immediately show cached while fetching
    const c = loadCache();
    if (c) { setLatest(c); setFromCache(true); }
    fetchAll();
    timerRef.current = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  // ── Stale detection ────────────────────────────────────
  const ageSecs   = latest ? staleSince(latest.received_at) : null;
  const isStale   = ageSecs != null && ageSecs > STALE_SECS;

  // ── Styles ─────────────────────────────────────────────
  const S = {
    root: {
      minHeight: "100vh",
      background: "#0d1117",
      color: "#f3f4f6",
      fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
      padding: "28px 24px",
      maxWidth: 780,
      margin: "0 auto",
    },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
    title: { fontSize: 20, fontWeight: 700, color: "#e5e7eb", letterSpacing: "-0.01em" },
    sub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },
    row:   { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 },
    errorBanner: {
      background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)",
      borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5",
      marginBottom: 18,
    },
    refreshBtn: {
      background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
      color: "#d1d5db", borderRadius: 6, padding: "6px 14px", fontSize: 12,
      cursor: "pointer", fontFamily: "inherit",
    },
    meta: { fontSize: 12, color: "#4b5563", marginTop: 6 },
  };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>⛅ Weather Station</div>
          <div style={S.sub}>{latest?.device_id ?? "—"} · polling every 30 s</div>
        </div>
        <button style={S.refreshBtn} onClick={fetchAll}>↻ Refresh</button>
      </div>

      {/* Error banner */}
      {error && <div style={S.errorBanner}>⚠ {error}</div>}

      {/* Status badges */}
      {latest && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {isStale    && <Badge label={`Stale · ${Math.round(ageSecs / 60)} min ago`} danger />}
          {!isStale   && ageSecs != null && <Badge label="Live" />}
          {fromCache  && <Badge label="localStorage fallback" warn />}
          {latest.is_cached && <Badge label="ESP32 cached reading" warn />}
          {latest.reading_age_secs > 0 && (
            <Badge label={`Reading age: ${latest.reading_age_secs}s`} muted />
          )}
        </div>
      )}

      {/* Metrics */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Current readings</div>
        {latest ? (
          <div style={S.row}>
            <Metric label="Temperature" value={latest.temperature} unit="°C" field="temperature" cached={latest.is_cached} />
            <Metric label="Humidity"    value={latest.humidity}    unit="%"  field="humidity"    cached={latest.is_cached} />
          </div>
        ) : (
          <div style={S.meta}>No data received yet.</div>
        )}
        {latest?.received_at && (
          <div style={S.meta}>Last received: {new Date(latest.received_at).toLocaleString()}</div>
        )}
      </div>

      {/* Charts */}
      {history.length > 1 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Temperature history (last {history.length} readings)</div>
          <MiniChart data={history} field="temperature" color="#38bdf8" />
        </div>
      )}

      {history.length > 1 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Humidity history</div>
          <MiniChart data={history} field="humidity" color="#a78bfa" />
        </div>
      )}

      {/* History table */}
      {history.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Recent log</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
                  {["Time", "Temp °C", "Hum %", "Cached", "Age s"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 15).map((r, i) => {
                  const badT = outOfRange("temperature", r.temperature);
                  const badH = outOfRange("humidity", r.humidity);
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #111827" }}>
                      <td style={{ padding: "5px 10px", color: "#9ca3af" }}>
                        {r.received_at ? new Date(r.received_at).toLocaleTimeString() : "—"}
                      </td>
                      <td style={{ padding: "5px 10px", color: badT ? "#ef4444" : "#e5e7eb" }}>{r.temperature}</td>
                      <td style={{ padding: "5px 10px", color: badH ? "#ef4444" : "#e5e7eb" }}>{r.humidity}</td>
                      <td style={{ padding: "5px 10px" }}>{r.is_cached ? "⚠ yes" : "—"}</td>
                      <td style={{ padding: "5px 10px", color: "#6b7280" }}>{r.reading_age_secs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
