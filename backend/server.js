import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const app = express();
app.use(express.json({ limit: "2mb" }));

// CORS: GitHub Pages-ről fog jönni a kérés. Render/Fly esetén ezt érdemes szűkíteni.
app.use(cors());

const PORT = process.env.PORT || 3000;

// ====== Egyszerű "auth" ======
// Tanári jelszó: környezeti változóban add meg.
// Render/Fly/egyéb: Settings -> Environment.
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || "change-me";
const TEACHER_TOKEN = process.env.TEACHER_TOKEN || "teacher-token-change-me";

// ====== Tárolás (fájl alapú JSON) ======
// Online környezetben ez tipikusan a szerver fájlrendszerére megy.
// Ha a host nem ad tartós tárhelyet, akkor később érdemes DB/S3/R2-re váltani.
const DATA_DIR = path.resolve("./data");
const DB_FILE = path.join(DATA_DIR, "results.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ sessions: {}, submissions: [] }, null, 2));
}

function readDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { sessions: {}, submissions: [] };
  }
}

function writeDb(db) {
  ensureDataFile();
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function nowIsoCompact() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeSheetName(name) {
  // Excel sheet name max 31 char; tiltott: : \ / ? * [ ]
  const cleaned = String(name || "lap")
    .replace(/[:\\/\?\*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "lap").slice(0, 31);
}

// ====== API ======

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/teacher/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== TEACHER_PASSWORD) {
    return res.status(401).json({ error: "Hibás jelszó" });
  }
  return res.json({ token: TEACHER_TOKEN });
});

app.post("/api/teacher/session", (req, res) => {
  const { token, code, config } = req.body || {};
  if (token !== TEACHER_TOKEN) return res.status(401).json({ error: "Nincs jogosultság" });
  if (!code || typeof code !== "string") return res.status(400).json({ error: "Hiányzó kód" });
  if (!config || typeof config !== "object") return res.status(400).json({ error: "Hiányzó config" });

  const db = readDb();
  db.sessions[code] = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  return res.json({ ok: true });
});

app.get("/api/student/config", (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ error: "Hiányzó kód" });
  const db = readDb();
  const cfg = db.sessions[code];
  if (!cfg) return res.status(404).json({ error: "Ismeretlen kód" });
  return res.json(cfg);
});

app.post("/api/student/submit", (req, res) => {
  const { code, name, meta, items } = req.body || {};
  if (!code || typeof code !== "string") return res.status(400).json({ error: "Hiányzó kód" });
  if (!name || typeof name !== "string") return res.status(400).json({ error: "Hiányzó név" });
  if (!Array.isArray(items)) return res.status(400).json({ error: "Hiányzó items" });

  const db = readDb();
  if (!db.sessions[code]) return res.status(400).json({ error: "A kód nem aktív" });

  db.submissions.push({
    id: `${nowIsoCompact()}_${Math.random().toString(16).slice(2, 8)}`,
    code,
    name,
    meta: meta || {},
    items,
    receivedAt: new Date().toISOString(),
  });
  writeDb(db);
  return res.json({ ok: true });
});

app.get("/api/teacher/export.xlsx", async (req, res) => {
  const token = String(req.query.token || "");
  if (token !== TEACHER_TOKEN) return res.status(401).json({ error: "Nincs jogosultság" });

  const db = readDb();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Szódolgozat";

  // nincs adat -> legyen egy info lap
  if (!db.submissions.length) {
    const ws = wb.addWorksheet("Nincs adat");
    ws.addRow(["Még nincs beküldött dolgozat."]);
  } else {
    for (const sub of db.submissions) {
      const stamp = (sub.meta?.finishedAt || sub.receivedAt || "").slice(0, 19).replace(/[:T-]/g, "");
      const sheetName = safeSheetName(`${sub.name}_${stamp || ""}`);
      const ws = wb.addWorksheet(sheetName);

      // Meta
      ws.addRow(["Név", sub.name]);
      ws.addRow(["Kód", sub.code]);
      ws.addRow(["Évfolyam (munkalap)", sub.meta?.sheet || ""]);
      ws.addRow(["Lecke", sub.meta?.lesson || ""]);
      ws.addRow(["Mód", sub.meta?.mode || ""]);
      ws.addRow(["Pont", `${sub.meta?.score ?? ""} / ${sub.meta?.totalQuestions ?? ""}`]);
      ws.addRow(["Idő (mp)", sub.meta?.seconds ?? ""]);
      ws.addRow(["Dátum", sub.meta?.finishedAt || sub.receivedAt || ""]);
      ws.addRow([]);

      // Fejléc
      ws.addRow(["Kérdés", "Válasz", "Pont"]);
      ws.getRow(ws.rowCount).font = { bold: true };

      // Tartalom
      for (const it of sub.items || []) {
        ws.addRow([it.prompt ?? "", it.answer ?? "", it.point ?? ""]);
      }

      // Oszlopszélesség
      ws.getColumn(1).width = 40;
      ws.getColumn(2).width = 30;
      ws.getColumn(3).width = 8;
    }
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename=eredmenyek.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on :${PORT}`);
});
