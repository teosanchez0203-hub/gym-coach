// IndexedDB wrapper — all functions return Promises
const DB_NAME = "GymCoach";
const DB_VERSION = 1;
const STORE = "sessions";

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveSession(session) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAllSessions() {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// Returns last session data for a specific exercise id
async function getLastExerciseData(exerciseId) {
  const sessions = await getAllSessions();
  // Sort newest first
  sessions.sort((a, b) => b.id - a.id);
  for (const session of sessions) {
    const ex = (session.ejercicios || []).find(e => e.id === exerciseId);
    if (ex && ex.series && ex.series.length > 0) {
      return ex; // {id, nombre, series: [{kg, reps}]}
    }
  }
  return null;
}

// Returns all sessions containing a specific exercise (for progression checks)
async function getExerciseHistory(exerciseId) {
  const sessions = await getAllSessions();
  sessions.sort((a, b) => b.id - a.id);
  const result = [];
  for (const session of sessions) {
    const ex = (session.ejercicios || []).find(e => e.id === exerciseId);
    if (ex && ex.series && ex.series.length > 0) {
      result.push({ fecha: session.fecha, tipo: session.tipo, series: ex.series });
    }
  }
  return result;
}

// Get reverse_fly sets done this week
async function getReverseFlyWeeklySets() {
  const sessions = await getAllSessions();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // start of week (Sunday)
  weekStart.setHours(0, 0, 0, 0);

  let count = 0;
  for (const session of sessions) {
    const sessionDate = new Date(session.fecha);
    if (sessionDate >= weekStart) {
      const ex = (session.ejercicios || []).find(e => e.id === "reverse_fly");
      if (ex && ex.series) count += ex.series.length;
    }
  }
  return count;
}
