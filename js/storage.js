import { getTodayKey, generateId } from './utils.js';
// Circular by design: addToYtHistory/deleteYtHistoryEntry re-render and
// re-fetch the title after writing, exactly like the original inline script
// did. Safe because both imports are only used inside function bodies
// (called after the full module graph, including youtube.js from Step 5,
// has loaded) — never at module-evaluation time.
import { renderYtHistory, fetchYtTitle } from './youtube.js';

// ----------------- KEYS / CONSTANTS -----------------
const SYLLABUS_KEY = "jee_syllabus_progress";
const NOTIF_DEFAULTS = { enabled: false, breakOverrun: true, breakThresholdMin: 45, plannerReminder: true, examMilestones: true, idleNudge: true, idleThresholdMin: 30, revisionReminder: true, sleepReminder: true, parentLogReminder: true };
const YT_HISTORY_KEY = "jee_yt_history";
const YT_HISTORY_MAX = 20;
export const MOCK_DB_NAME = "jee_mocktest_db";
export const MOCK_STORE = "tests";
export const EXAM_YEAR_KEY = "jee_exam_year";
export const BASE_EXAM_YEAR = 2027;
export const BASE_EXAM_DATES = { mains1: "2027-01-21T00:00:00+05:30", mains2: "2027-04-02T00:00:00+05:30", adv: "2027-05-17T00:00:00+05:30" };

// ----------------- STUDY DAY DB -----------------
export function blankDay() {
    return { subjects: { "Physics": 0, "Organic Chemistry": 0, "Inorganic Chemistry": 0, "Physical Chemistry": 0, "Mathematics": 0, "Revision": 0, "Mock Test / Analysis": 0 }, breaks: [], studySessions: [], todos: [], slots: [], totalStudy: 0, totalBreak: 0 };
}

export function ensureDayShape(day) {
    if (!day.studySessions) day.studySessions = [];
    if (!day.breaks) day.breaks = [];
    // Backfill ids on entries saved before this fix — sorting/deleting now
    // relies on id, not array position.
    day.studySessions.forEach(s => { if (!s.id) s.id = generateId(); });
    day.breaks.forEach(b => { if (!b.id) b.id = generateId(); });
    return day;
}

export function getDB() {
    let raw = localStorage.getItem("jee_ypt_v3_data");
    return raw ? JSON.parse(raw) : {};
}

export function saveDB(data) { localStorage.setItem("jee_ypt_v3_data", JSON.stringify(data)); }

export function initDay(dayKey) {
    let db = getDB();
    if (!db[dayKey]) { db[dayKey] = blankDay(); saveDB(db); }
    return db[dayKey];
}

export function initToday() { return initDay(getTodayKey()); }

// ----------------- ACTIVE (in-progress) SESSION -----------------
// Raw key read/write only — timer.js owns the state-machine logic
// (persistActiveSession / clearActiveSession / tryRestoreActiveSession)
// and calls these three so it never touches localStorage directly.
export function saveActiveSessionRaw(snapshot) { localStorage.setItem("jee_active_session", JSON.stringify(snapshot)); }
export function readActiveSessionRaw() { return localStorage.getItem("jee_active_session"); }
export function clearActiveSessionRaw() { localStorage.removeItem("jee_active_session"); }

// ----------------- PLANNER (todo + calendar) -----------------
export function getPlannerDB() { let raw = localStorage.getItem("jee_planner_tasks"); return raw ? JSON.parse(raw) : {}; }
export function savePlannerDB(data) { localStorage.setItem("jee_planner_tasks", JSON.stringify(data)); }

// ----------------- SLEEP LOG -----------------
const SLEEP_LOG_KEY = "jee_sleep_log";
export function getSleepLog() {
    try { return JSON.parse(localStorage.getItem(SLEEP_LOG_KEY) || "{}"); } catch (e) { return {}; }
}
// Raw setter for the whole log object. Named writeSleepLog (not saveSleepLog)
// because sleep.js's saveSleepLog() is the UI-facing "save today's entry"
// handler — that name was already taken by the blueprint's Step 4 file.
// The original inline importDataJSON() wrote localStorage.setItem(SLEEP_LOG_KEY, ...)
// directly; routed through here instead so storage.js stays the only file
// touching localStorage.
export function writeSleepLog(log) { localStorage.setItem(SLEEP_LOG_KEY, JSON.stringify(log)); }

export function getSleepPending() {
    try { return JSON.parse(localStorage.getItem("jee_sleep_pending") || "null"); } catch (e) { return null; }
}

export function setSleepPending(pending) {
    localStorage.setItem("jee_sleep_pending", JSON.stringify(pending));
}

// ----------------- SYLLABUS -----------------
export function getSyllabusProgress() { try { return JSON.parse(localStorage.getItem(SYLLABUS_KEY) || "{}"); } catch (e) { return {}; } }
export function saveSyllabusProgress(p) { localStorage.setItem(SYLLABUS_KEY, JSON.stringify(p)); }

// ----------------- NOTIFICATIONS -----------------
export function getNotifSettings() { let raw = localStorage.getItem("jee_notif_settings"); return raw ? { ...NOTIF_DEFAULTS, ...JSON.parse(raw) } : { ...NOTIF_DEFAULTS }; }
export function saveNotifSettings(s) { localStorage.setItem("jee_notif_settings", JSON.stringify(s)); }

// ----------------- YOUTUBE HISTORY -----------------
export function getYtHistory() { try { return JSON.parse(localStorage.getItem(YT_HISTORY_KEY) || "[]"); } catch (e) { return []; } }

export function addToYtHistory(id, url) {
    let hist = getYtHistory().filter(v => v.id !== id);
    hist.unshift({ id, url, title: null, addedAt: Date.now() });
    if (hist.length > YT_HISTORY_MAX) hist = hist.slice(0, YT_HISTORY_MAX);
    localStorage.setItem(YT_HISTORY_KEY, JSON.stringify(hist));
    renderYtHistory();
    fetchYtTitle(id);
}

// Used by fetchYtTitle (youtube.js) once the oEmbed title comes back.
export function saveYtHistory(hist) { localStorage.setItem(YT_HISTORY_KEY, JSON.stringify(hist)); }

export function deleteYtHistoryEntry(id) {
    if (!confirm("Remove this video from history?")) return;
    let hist = getYtHistory().filter(v => v.id !== id);
    localStorage.setItem(YT_HISTORY_KEY, JSON.stringify(hist));
    renderYtHistory();
}

// ----------------- MOCK TESTS (IndexedDB) -----------------
export function openMockDB() {
    return new Promise((resolve, reject) => {
        let req = indexedDB.open(MOCK_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            let db = e.target.result;
            if (!db.objectStoreNames.contains(MOCK_STORE)) db.createObjectStore(MOCK_STORE, { keyPath: "id" });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export function getAllMockTests() {
    return openMockDB().then(db => new Promise((resolve, reject) => {
        let tx = db.transaction(MOCK_STORE, "readonly");
        let req = tx.objectStore(MOCK_STORE).getAll();
        req.onsuccess = () => resolve(req.result.sort((a,b) => b.id - a.id));
        req.onerror = () => reject(req.error);
    }));
}

// ----------------- EXAM YEAR -----------------
export function getExamYear() {
    let y = parseInt(localStorage.getItem(EXAM_YEAR_KEY), 10);
    return (y && y >= 2027 && y <= 2031) ? y : BASE_EXAM_YEAR;
}
// Raw setter — original's setExamYear() (ui.js) wrote localStorage directly;
// routed through here so storage.js stays the only file touching localStorage.
export function setStoredExamYear(year) { localStorage.setItem(EXAM_YEAR_KEY, String(year)); }

// ----------------- BACKUP -----------------
export function markBackupDone() { localStorage.setItem("jee_last_backup", Date.now().toString()); }
export function getLastBackupAt() {
    let v = parseInt(localStorage.getItem("jee_last_backup") || "0", 10);
    return isNaN(v) ? 0 : v;
}

// Generic raw key read/write for the handful of one-off "last notified at"
// / "already notified today" flag keys notifications.js uses (per-day
// planner/sleep/revision/parent-log reminder cooldowns). The original wrote
// these with localStorage.getItem/setItem directly; routed through here so
// storage.js stays the only file touching localStorage.
export function getRawFlag(key) { return localStorage.getItem(key); }
export function setRawFlag(key, value) { localStorage.setItem(key, value); }
export function clearRawFlag(key) { localStorage.removeItem(key); }

// ----------------- FULL RESET -----------------
export function resetAllData() {
    if (!confirm("This will permanently DELETE all study logs, planner tasks, sleep logs, and mock tests from this device. This action cannot be undone! Are you sure?")) return;
    localStorage.clear();
    let req = indexedDB.deleteDatabase(MOCK_DB_NAME);
    req.onsuccess = () => { location.reload(); };
    req.onerror = () => { location.reload(); };
}
