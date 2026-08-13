import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { transliterate } from "./translit.js";
import {
  SYNC_AVAILABLE,
  startSync,
  pushSongs,
  fetchSongsOnce,
  normalizeFamilyCode,
} from "./sync.js";

/* Running inside a Capacitor native shell (Android / iOS)? */
const IS_NATIVE =
  typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

/* Storage shim: inside Claude, window.storage exists. Standalone/native,
   fall back to localStorage with the same async contract. */
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      if (v === null) throw new Error("not found");
      return { key, value: v };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value };
    },
  };
}


/* ------------------------------------------------------------------ */
/*  Paadal Pettagam — Carnatic Song Notebook                           */
/*  Tracks every Carnatic song a student has learned.                  */
/*  - Add with just a name (any script); fill the rest in later        */
/*  - AI transliteration of the original script into Latin letters     */
/*  - Duplicate alert before adding                                    */
/*  - Numbered, searchable list                                        */
/*  - Link a lyrics PDF and an audio recording per song                */
/*  - Persistent storage across sessions (window.storage)              */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "carnatic-songs-v1";

const EMPTY_FORM = {
  name: "",
  transliteration: "",
  language: "",
  composer: "",
  raga: "",
  tala: "",
  guru: "",
  lyricsUrl: "",
  audioUrl: "",
  notes: "",
};

/* ---------- helpers ------------------------------------------------ */

// Normalize for duplicate comparison: lowercase, strip diacritics,
// punctuation and spaces so "Vātāpi Gaṇapatim" ~ "vatapi ganapatim".
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0900-\u0DFF]/g, "");
}

function similarityHit(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a)))
    return true;
  return false;
}

async function loadSongs() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch {
    return []; // key doesn't exist yet
  }
}

function mergeSongs(local, remote) {
  const map = new Map();
  for (const s of local) map.set(s.id, s);
  for (const s of remote) map.set(s.id, s); // remote wins on same id
  return [...map.values()];
}

async function persistSongs(songs) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(songs));
    return true;
  } catch (e) {
    console.error("Storage error:", e);
    return false;
  }
}

/* ---------- component ---------------------------------------------- */

export default function CarnaticSongTracker() {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null); // null | "add" | "edit"
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [dupMatches, setDupMatches] = useState(null); // songs[] | null
  const [pendingSong, setPendingSong] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [familyCode, setFamilyCode] = useState(() => {
    try {
      return localStorage.getItem("pp-family-code") || "";
    } catch {
      return "";
    }
  });
  const [codeInput, setCodeInput] = useState("");
  const [syncState, setSyncState] = useState("off"); // off|connecting|live|error
  const [syncDismissed, setSyncDismissed] = useState(false);
  const unsubRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState("ta-IN");
  const recogRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadSongs();
      if (!cancelled) {
        setSongs(local);
        setLoading(false);
      }
      if (SYNC_AVAILABLE && familyCode) {
        setSyncState("connecting");
        try {
          unsubRef.current = await startSync(
            familyCode,
            (remote) => {
              setSongs(remote);
              persistSongs(remote); // offline cache
              setSyncState("live");
            },
            () => setSyncState("error")
          );
        } catch (e) {
          console.error(e);
          setSyncState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubRef.current?.();
    };
  }, [familyCode]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function commit(next) {
    setSongs(next);
    const ok = await persistSongs(next);
    if (SYNC_AVAILABLE && familyCode) {
      try {
        await pushSongs(familyCode, next);
      } catch (e) {
        console.error(e);
        notify("Saved on this device — sync will catch up when you're online.");
      }
    } else if (!ok) {
      notify("Couldn't save — check your connection and try again.");
    }
  }

  async function connectFamily() {
    const code = normalizeFamilyCode(codeInput);
    if (code.length < 4) {
      notify("Use at least 4 characters — treat the code like a password.");
      return;
    }
    setSyncState("connecting");
    try {
      const remote = await fetchSongsOnce(code);
      const merged = mergeSongs(songs, remote);
      await pushSongs(code, merged);
      try {
        localStorage.setItem("pp-family-code", code);
      } catch {}
      setCodeInput("");
      setFamilyCode(code); // the effect opens the live subscription
      notify("Synced — enter the same family code on every device.");
    } catch (e) {
      console.error(e);
      setSyncState("error");
      notify("Couldn't connect — check the Firebase setup steps in the README.");
    }
  }

  function disconnectFamily() {
    unsubRef.current?.();
    unsubRef.current = null;
    try {
      localStorage.removeItem("pp-family-code");
    } catch {}
    setFamilyCode("");
    setSyncState("off");
    notify("This device is now local-only. Your songs stay saved here.");
  }

  /* ----- derived ----- */

  const gurus = useMemo(
    () => [...new Set(songs.map((s) => s.guru).filter(Boolean))],
    [songs]
  );
  const composers = useMemo(
    () => [...new Set(songs.map((s) => s.composer).filter(Boolean))],
    [songs]
  );
  const ragas = useMemo(
    () => [...new Set(songs.map((s) => s.raga).filter(Boolean))],
    [songs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) =>
      [s.name, s.transliteration, s.composer, s.raga, s.tala, s.guru, s.language, s.notes]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [songs, search]);

  /* ----- duplicate check ----- */

  function findDuplicates(candidate, excludeId) {
    const keys = [normalize(candidate.name), normalize(candidate.transliteration)].filter(
      (k) => k.length > 0
    );
    return songs.filter((s) => {
      if (s.id === excludeId) return false;
      const existing = [normalize(s.name), normalize(s.transliteration)].filter(Boolean);
      return keys.some((k) => existing.some((e) => similarityHit(k, e)));
    });
  }

  /* ----- form handling ----- */

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPanel("add");
  }

  function openEdit(song) {
    setForm({ ...EMPTY_FORM, ...song });
    setEditingId(song.id);
    setPanel("edit");
    setExpandedId(null);
  }

  function setF(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submitForm() {
    const name = form.name.trim();
    if (!name) {
      notify("A song name is required — everything else can wait.");
      return;
    }
    setBusy(true);

    let translit = form.transliteration.trim();
    let language = form.language.trim();

    // Auto-transliterate offline when the name contains non-Latin script
    // and no transliteration was typed manually. No network, no API.
    if (!translit && /[^\u0000-\u024F]/.test(name)) {
      const r = transliterate(name);
      translit = r.transliteration || "";
      language = language || r.language || "";
    }

    const candidate = {
      ...form,
      id: editingId || `song-${Date.now()}`,
      name,
      transliteration: translit,
      language,
      dateAdded: editingId
        ? songs.find((s) => s.id === editingId)?.dateAdded || new Date().toISOString()
        : new Date().toISOString(),
    };

    if (!editingId) {
      const dups = findDuplicates(candidate, null);
      if (dups.length > 0) {
        setDupMatches(dups);
        setPendingSong(candidate);
        setBusy(false);
        return; // wait for the user's decision in the alert dialog
      }
    }

    await finalizeSave(candidate);
    setBusy(false);
  }

  async function finalizeSave(candidate) {
    let next;
    if (editingId) {
      next = songs.map((s) => (s.id === editingId ? candidate : s));
    } else {
      next = [...songs, candidate];
    }
    await commit(next);
    setPanel(null);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDupMatches(null);
    setPendingSong(null);
    notify(editingId ? "Song updated." : `Added — song #${next.length} in the book.`);
  }

  async function deleteSong(id) {
    await commit(songs.filter((s) => s.id !== id));
    setExpandedId(null);
    notify("Song removed.");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(songs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "carnatic-songs-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    const rows = songs.map((s, i) => ({
      "#": i + 1,
      "Song (original)": s.name,
      "Transliteration": s.transliteration || "",
      "Language": s.language || "",
      "Composer": s.composer || "",
      "Raga": s.raga || "",
      "Tala": s.tala || "",
      "Guru": s.guru || "",
      "Lyrics PDF": s.lyricsUrl || "",
      "Audio": s.audioUrl || "",
      "Notes": s.notes || "",
      "Date added": s.dateAdded
        ? new Date(s.dateAdded).toLocaleDateString()
        : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 4 },  // #
      { wch: 28 }, // original
      { wch: 26 }, // transliteration
      { wch: 10 }, // language
      { wch: 22 }, // composer
      { wch: 14 }, // raga
      { wch: 10 }, // tala
      { wch: 20 }, // guru
      { wch: 30 }, // lyrics
      { wch: 30 }, // audio
      { wch: 30 }, // notes
      { wch: 12 }, // date
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Songs");
    XLSX.writeFile(wb, "carnatic-songs.xlsx");
  }

  /* ----- voice input for the song name ----- */

  const VOICE_LANGS = [
    ["ta-IN", "Tamil"],
    ["te-IN", "Telugu"],
    ["kn-IN", "Kannada"],
    ["ml-IN", "Malayalam"],
    ["hi-IN", "Hindi / Sanskrit"],
    ["en-IN", "English"],
  ];

  function stopVoice() {
    if (IS_NATIVE) {
      SpeechRecognition.stop().catch(() => {});
    } else {
      try {
        recogRef.current?.stop();
      } catch {}
    }
    setListening(false);
  }

  async function startVoiceNative() {
    try {
      const { available } = await SpeechRecognition.available();
      if (!available) {
        notify("Speech recognition isn't available on this device.");
        return;
      }
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        notify("Microphone permission was denied — allow it to use voice input.");
        return;
      }
      setListening(true);
      const result = await SpeechRecognition.start({
        language: voiceLang,
        maxResults: 1,
        partialResults: false,
        popup: false,
      });
      const heard = result?.matches?.[0] || "";
      if (heard) {
        // Fill the normal name field — fully editable if it was heard wrongly.
        setF("name", heard.trim());
        notify("Heard it — check the name and edit if it's not quite right.");
      } else {
        notify("Couldn't hear that — try again closer to the mic, or type it.");
      }
    } catch (e) {
      console.error("Native speech error:", e);
      notify("Couldn't hear that — try again closer to the mic, or type it.");
    } finally {
      setListening(false);
    }
  }

  function startVoice() {
    if (listening) {
      stopVoice();
      return;
    }
    if (IS_NATIVE) {
      startVoiceNative();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      notify("Voice input isn't supported in this browser — please type the name.");
      return;
    }
    const recog = new SR();
    recogRef.current = recog;
    recog.lang = voiceLang;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => {
      const heard = e.results?.[0]?.[0]?.transcript || "";
      if (heard) {
        // Fill the normal name field — fully editable if it was heard wrongly.
        setF("name", heard.trim());
        notify("Heard it — check the name and edit if it's not quite right.");
      }
    };
    recog.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") {
        notify("Microphone permission was denied — allow it to use voice input.");
      } else if (e.error !== "aborted") {
        notify("Couldn't hear that — try again closer to the mic, or type it.");
      }
    };
    recog.onend = () => setListening(false);
    try {
      recog.start();
      setListening(true);
    } catch {
      notify("Couldn't start the microphone — please type the name instead.");
    }
  }

  /* ----- render ----- */

  return (
    <div className="pp-root">
      <style>{css}</style>

      {/* ---------- header ---------- */}
      <header className="pp-header">
        <div className="pp-eyebrow">Carnatic song notebook</div>
        <h1 className="pp-title">Paadal Pettagam</h1>
        <div className="pp-sub">
          Every song he has learned, remembered in one place.
        </div>
        {/* tambura strings — signature divider */}
        <div className="pp-tambura" aria-hidden="true">
          <span /><span /><span /><span />
          <i className="pp-tambura-dot" />
        </div>
      </header>

      {/* ---------- stats ---------- */}
      <section className="pp-stats">
        <div className="pp-stat">
          <b>{songs.length}</b>
          <span>songs learned</span>
        </div>
        <div className="pp-stat">
          <b>{composers.length}</b>
          <span>composers</span>
        </div>
        <div className="pp-stat">
          <b>{ragas.length}</b>
          <span>ragas</span>
        </div>
        <div className="pp-stat">
          <b>{gurus.length}</b>
          <span>gurus</span>
        </div>
      </section>

      {/* ---------- controls ---------- */}
      <section className="pp-controls">
        <input
          className="pp-search"
          placeholder="Search songs, ragas, composers, gurus…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="pp-btn pp-btn-primary" onClick={openAdd}>
          + Add a song
        </button>
        {songs.length > 0 && (
          <>
            <button className="pp-btn pp-btn-ghost" onClick={exportExcel}>
              Export Excel
            </button>
            <button className="pp-btn pp-btn-ghost" onClick={exportJson}>
              Export JSON
            </button>
          </>
        )}
      </section>

      {/* ---------- sync setup ---------- */}
      {SYNC_AVAILABLE && !familyCode && !syncDismissed && (
        <section className="pp-sync-card">
          <div className="pp-sync-title">Sync across all your devices</div>
          <p className="pp-sync-text">
            Invent a family code — any secret phrase — and enter the same code
            on every phone, tablet, and computer. Everyone sees the same song
            list, updated live.
          </p>
          <div className="pp-sync-row">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="e.g. our-secret-raga-2026"
            />
            <button
              className="pp-btn pp-btn-primary"
              onClick={connectFamily}
              disabled={syncState === "connecting"}
            >
              {syncState === "connecting" ? "Connecting…" : "Start syncing"}
            </button>
          </div>
          <button
            className="pp-sync-skip"
            onClick={() => setSyncDismissed(true)}
          >
            Not now — keep songs on this device only
          </button>
        </section>
      )}

      {/* ---------- add / edit panel ---------- */}
      {panel && (
        <section className="pp-panel">
          <div className="pp-panel-title">
            {panel === "add" ? "Add a new song" : "Edit song"}
          </div>
          <div className="pp-grid">
            <label className="pp-field pp-span2">
              <span>Song name / first line — any script *</span>
              <div className="pp-voice-row">
                <input
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                  placeholder="வாதாபி கணபதிம் / Vatapi Ganapatim"
                  autoFocus
                />
                <select
                  className="pp-voice-lang"
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value)}
                  title="Language to listen for"
                >
                  {VOICE_LANGS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`pp-mic ${listening ? "pp-mic-on" : ""}`}
                  onClick={startVoice}
                  title={listening ? "Stop listening" : "Speak the song name"}
                >
                  {listening ? "◼" : "🎙"}
                </button>
              </div>
              {listening && (
                <div className="pp-voice-hint">Listening… sing or say the song name</div>
              )}
            </label>
            <label className="pp-field pp-span2">
              <span>Transliteration (English letters) — auto-filled if left blank</span>
              <input
                value={form.transliteration}
                onChange={(e) => setF("transliteration", e.target.value)}
                placeholder="Filled in automatically for Tamil, Telugu, Sanskrit…"
              />
            </label>
            <label className="pp-field">
              <span>Language</span>
              <input
                value={form.language}
                onChange={(e) => setF("language", e.target.value)}
                placeholder="Tamil, Telugu, Sanskrit…"
              />
            </label>
            <label className="pp-field">
              <span>Composer</span>
              <input
                list="pp-composers"
                value={form.composer}
                onChange={(e) => setF("composer", e.target.value)}
                placeholder="Muthuswami Dikshitar…"
              />
              <datalist id="pp-composers">
                {composers.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="pp-field">
              <span>Raga</span>
              <input
                list="pp-ragas"
                value={form.raga}
                onChange={(e) => setF("raga", e.target.value)}
                placeholder="Hamsadhwani…"
              />
              <datalist id="pp-ragas">
                {ragas.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className="pp-field">
              <span>Tala</span>
              <input
                value={form.tala}
                onChange={(e) => setF("tala", e.target.value)}
                placeholder="Adi…"
              />
            </label>
            <label className="pp-field pp-span2">
              <span>Guru — who taught this song</span>
              <input
                list="pp-gurus"
                value={form.guru}
                onChange={(e) => setF("guru", e.target.value)}
                placeholder="His music teacher, a workshop guru…"
              />
              <datalist id="pp-gurus">
                {gurus.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
            <label className="pp-field pp-span2">
              <span>Lyrics PDF link</span>
              <input
                value={form.lyricsUrl}
                onChange={(e) => setF("lyricsUrl", e.target.value)}
                placeholder="https://… (Google Drive share link works)"
              />
            </label>
            <label className="pp-field pp-span2">
              <span>Audio link</span>
              <input
                value={form.audioUrl}
                onChange={(e) => setF("audioUrl", e.target.value)}
                placeholder="https://… direct link to an mp3 / m4a"
              />
            </label>
            <label className="pp-field pp-span2">
              <span>Notes</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setF("notes", e.target.value)}
                placeholder="Learned for the annual day concert…"
              />
            </label>
          </div>
          <div className="pp-panel-actions">
            <button
              className="pp-btn pp-btn-primary"
              onClick={submitForm}
              disabled={busy}
            >
              {busy
                ? "Transliterating…"
                : panel === "add"
                ? "Save song"
                : "Save changes"}
            </button>
            <button
              className="pp-btn pp-btn-ghost"
              onClick={() => {
                setPanel(null);
                setForm(EMPTY_FORM);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ---------- duplicate alert ---------- */}
      {dupMatches && (
        <div className="pp-overlay">
          <div className="pp-dialog">
            <div className="pp-dialog-title">This song may already exist</div>
            <p className="pp-dialog-text">
              “{pendingSong?.transliteration || pendingSong?.name}” looks like:
            </p>
            <ul className="pp-dialog-list">
              {dupMatches.map((m) => (
                <li key={m.id}>
                  <b>#{songs.indexOf(m) + 1}</b> {m.name}
                  {m.transliteration ? ` — ${m.transliteration}` : ""}
                  {m.raga ? ` (${m.raga})` : ""}
                </li>
              ))}
            </ul>
            <div className="pp-panel-actions">
              <button
                className="pp-btn pp-btn-ghost"
                onClick={() => {
                  setDupMatches(null);
                  setPendingSong(null);
                }}
              >
                Don't add — it's the same song
              </button>
              <button
                className="pp-btn pp-btn-primary"
                onClick={() => finalizeSave(pendingSong)}
              >
                Add anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- list ---------- */}
      <main className="pp-list">
        {loading ? (
          <div className="pp-empty">Opening the notebook…</div>
        ) : filtered.length === 0 ? (
          <div className="pp-empty">
            {songs.length === 0
              ? "The notebook is empty. Add the first song he learned."
              : "No songs match that search."}
          </div>
        ) : (
          filtered.map((s) => {
            const num = songs.indexOf(s) + 1;
            const open = expandedId === s.id;
            return (
              <article
                key={s.id}
                className={`pp-card ${open ? "pp-card-open" : ""}`}
              >
                <div
                  className="pp-card-head"
                  onClick={() => setExpandedId(open ? null : s.id)}
                >
                  <div className="pp-num">{num}</div>
                  <div className="pp-card-names">
                    <div className="pp-card-name">{s.name}</div>
                    {s.transliteration && s.transliteration !== s.name && (
                      <div className="pp-card-translit">{s.transliteration}</div>
                    )}
                    <div className="pp-chips">
                      {s.raga && <span className="pp-chip">{s.raga}</span>}
                      {s.composer && <span className="pp-chip">{s.composer}</span>}
                      {s.guru && <span className="pp-chip pp-chip-guru">Guru: {s.guru}</span>}
                    </div>
                  </div>
                  <div className="pp-badges">
                    {s.lyricsUrl && <span title="Lyrics linked">📄</span>}
                    {s.audioUrl && <span title="Audio linked">🎧</span>}
                  </div>
                </div>

                {open && (
                  <div className="pp-card-body">
                    <dl className="pp-facts">
                      {s.language && (<><dt>Language</dt><dd>{s.language}</dd></>)}
                      {s.tala && (<><dt>Tala</dt><dd>{s.tala}</dd></>)}
                      {s.dateAdded && (
                        <>
                          <dt>Added</dt>
                          <dd>{new Date(s.dateAdded).toLocaleDateString()}</dd>
                        </>
                      )}
                      {s.notes && (<><dt>Notes</dt><dd>{s.notes}</dd></>)}
                    </dl>

                    {s.audioUrl && (
                      <div className="pp-audio">
                        <audio controls src={s.audioUrl} style={{ width: "100%" }} />
                      </div>
                    )}

                    <div className="pp-card-actions">
                      {s.lyricsUrl && (
                        <a
                          className="pp-btn pp-btn-primary"
                          href={s.lyricsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View lyrics (PDF)
                        </a>
                      )}
                      <button className="pp-btn pp-btn-ghost" onClick={() => openEdit(s)}>
                        Edit / fill in details
                      </button>
                      <button
                        className="pp-btn pp-btn-danger"
                        onClick={() => {
                          if (confirm(`Remove "${s.transliteration || s.name}"?`))
                            deleteSong(s.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </main>

      {toast && <div className="pp-toast">{toast}</div>}

      <footer className="pp-footer">
        {familyCode && syncState === "live" ? (
          <>
            Synced across devices as "{familyCode}" ·{" "}
            <button className="pp-linkbtn" onClick={disconnectFamily}>
              stop syncing on this device
            </button>
          </>
        ) : familyCode && syncState === "connecting" ? (
          "Connecting to your family's song list…"
        ) : familyCode && syncState === "error" ? (
          "Sync is unreachable — songs are saved on this device and will catch up."
        ) : (
          "Songs are saved automatically on this device."
        )}
      </footer>
    </div>
  );
}

/* ---------- styles -------------------------------------------------- */

const css = `
:root {
  --paper:   #F6EEDC;
  --ink:     #4A1416;   /* kanjivaram maroon */
  --teal:    #16606B;   /* peacock */
  --gold:    #C1922F;   /* turmeric gold */
  --kumkum:  #B3402A;
  --line:    #DDCFAE;
  --card:    #FBF6E9;
}
.pp-root {
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-family: -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  padding: 20px 16px 56px;
  max-width: 780px;
  margin: 0 auto;
}
.pp-header { text-align: center; padding: 8px 0 4px; }
.pp-eyebrow {
  font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--teal); font-weight: 600;
}
.pp-title {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: clamp(30px, 7vw, 44px);
  font-weight: 700; margin: 6px 0 4px; letter-spacing: 0.01em;
}
.pp-sub { font-size: 14px; color: #7A5A42; }
.pp-tambura {
  position: relative; margin: 18px auto 0; max-width: 420px;
  display: flex; flex-direction: column; gap: 4px;
}
.pp-tambura span { display: block; height: 1px; background: var(--gold); opacity: .8; }
.pp-tambura span:nth-child(2), .pp-tambura span:nth-child(3) { opacity: .45; }
.pp-tambura-dot {
  position: absolute; right: 12%; top: 50%; transform: translateY(-50%);
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--kumkum); box-shadow: 0 0 0 3px rgba(179,64,42,.15);
}
.pp-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 8px; margin: 22px 0 14px;
}
.pp-stat {
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  text-align: center; padding: 10px 4px;
}
.pp-stat b {
  display: block;
  font-family: "Iowan Old Style", Palatino, Georgia, serif;
  font-size: 22px; color: var(--kumkum);
}
.pp-stat span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #7A5A42; }
.pp-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.pp-search {
  flex: 1 1 220px; padding: 11px 14px; border-radius: 10px;
  border: 1px solid var(--line); background: #FFFDF6; font-size: 15px; color: var(--ink);
}
.pp-search:focus { outline: 2px solid var(--teal); outline-offset: 1px; }
.pp-btn {
  padding: 11px 16px; border-radius: 10px; border: 1px solid transparent;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.pp-btn:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.pp-btn-primary { background: var(--ink); color: #FBF3E4; }
.pp-btn-primary:disabled { opacity: .6; cursor: wait; }
.pp-btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.pp-btn-danger { background: transparent; color: var(--kumkum); border-color: #E0B7AC; }
.pp-panel {
  background: var(--card); border: 1px solid var(--line);
  border-radius: 14px; padding: 16px; margin-bottom: 18px;
}
.pp-panel-title {
  font-family: "Iowan Old Style", Palatino, Georgia, serif;
  font-size: 19px; font-weight: 700; margin-bottom: 12px;
}
.pp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.pp-span2 { grid-column: span 2; }
@media (max-width: 540px) { .pp-grid { grid-template-columns: 1fr; } .pp-span2 { grid-column: span 1; } }
.pp-field span {
  display: block; font-size: 11.5px; font-weight: 600; letter-spacing: .03em;
  color: var(--teal); margin-bottom: 4px;
}
.pp-field input, .pp-field textarea {
  width: 100%; box-sizing: border-box; padding: 10px 12px;
  border: 1px solid var(--line); border-radius: 9px; background: #FFFDF6;
  font-size: 15px; color: var(--ink); font-family: inherit;
}
.pp-field input:focus, .pp-field textarea:focus { outline: 2px solid var(--teal); outline-offset: 1px; }
.pp-panel-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.pp-overlay {
  position: fixed; inset: 0; background: rgba(46,17,18,.45);
  display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 20;
}
.pp-dialog {
  background: var(--card); border-radius: 14px; padding: 20px;
  max-width: 440px; width: 100%; border: 1px solid var(--gold);
}
.pp-dialog-title {
  font-family: "Iowan Old Style", Palatino, Georgia, serif;
  font-size: 19px; font-weight: 700; color: var(--kumkum); margin-bottom: 6px;
}
.pp-dialog-text { font-size: 14px; margin: 0 0 8px; }
.pp-dialog-list { margin: 0 0 10px; padding-left: 18px; font-size: 14px; }
.pp-dialog-list li { margin-bottom: 4px; }
.pp-list { display: flex; flex-direction: column; gap: 10px; }
.pp-empty {
  text-align: center; padding: 42px 12px; color: #7A5A42;
  background: var(--card); border: 1px dashed var(--line); border-radius: 14px; font-size: 15px;
}
.pp-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  overflow: hidden; transition: box-shadow .15s ease;
}
.pp-card-open { box-shadow: 0 4px 18px rgba(74,20,22,.10); border-color: var(--gold); }
.pp-card-head {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 13px 14px; cursor: pointer;
}
.pp-num {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #E3B857, var(--gold));
  color: #3E1B00; font-weight: 700; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  font-family: "Iowan Old Style", Palatino, Georgia, serif;
  box-shadow: inset 0 0 0 1px rgba(62,27,0,.25);
}
.pp-card-names { flex: 1 1 auto; min-width: 0; }
.pp-card-name {
  font-family: "Iowan Old Style", Palatino, Georgia, serif;
  font-size: 19px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere;
}
.pp-card-translit { font-size: 13.5px; color: var(--teal); margin-top: 2px; }
.pp-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.pp-chip {
  font-size: 11px; padding: 3px 9px; border-radius: 999px;
  background: #EFE3C4; color: #5C4318; font-weight: 600;
}
.pp-chip-guru { background: #DCE9E6; color: var(--teal); }
.pp-badges { flex: 0 0 auto; font-size: 15px; display: flex; gap: 4px; padding-top: 4px; }
.pp-card-body { border-top: 1px dashed var(--line); padding: 13px 14px 15px; }
.pp-facts {
  display: grid; grid-template-columns: 84px 1fr; gap: 3px 10px;
  font-size: 13.5px; margin: 0 0 10px;
}
.pp-facts dt { color: #7A5A42; font-weight: 600; }
.pp-facts dd { margin: 0; overflow-wrap: anywhere; }
.pp-audio { margin: 6px 0 10px; }
.pp-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.pp-card-actions a { text-decoration: none; display: inline-block; }
.pp-toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: #FBF3E4; padding: 11px 18px;
  border-radius: 999px; font-size: 14px; z-index: 30;
  box-shadow: 0 6px 20px rgba(46,17,18,.3); max-width: 90vw; text-align: center;
}
.pp-footer {
  text-align: center; font-size: 12px; color: #9A7A5E; margin-top: 26px;
}
.pp-sync-card {
  background: #EDF3F0; border: 1px solid #BFD6CF; border-radius: 14px;
  padding: 14px 16px; margin-bottom: 16px;
}
.pp-sync-title {
  font-family: "Iowan Old Style", Palatino, Georgia, serif;
  font-size: 17px; font-weight: 700; color: var(--teal);
}
.pp-sync-text { font-size: 13.5px; margin: 4px 0 10px; color: #2E4F49; }
.pp-sync-row { display: flex; gap: 8px; flex-wrap: wrap; }
.pp-sync-row input {
  flex: 1 1 200px; padding: 10px 12px; border-radius: 9px;
  border: 1px solid #BFD6CF; background: #FFFFFF; font-size: 15px;
}
.pp-sync-skip {
  background: none; border: none; padding: 6px 0 0; cursor: pointer;
  font-size: 12.5px; color: #55706A; text-decoration: underline;
}
.pp-linkbtn {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: #9A7A5E; text-decoration: underline;
}
.pp-voice-row { display: flex; gap: 6px; align-items: stretch; }
.pp-voice-row input { flex: 1 1 auto; min-width: 0; }
.pp-voice-lang {
  flex: 0 0 auto; max-width: 118px; padding: 0 8px;
  border: 1px solid var(--line); border-radius: 9px;
  background: #FFFDF6; color: var(--ink); font-size: 13px;
}
.pp-mic {
  flex: 0 0 auto; width: 44px; border-radius: 9px;
  border: 1px solid var(--line); background: #FFFDF6;
  font-size: 17px; cursor: pointer; color: var(--ink);
}
.pp-mic:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.pp-mic-on {
  background: var(--kumkum); border-color: var(--kumkum); color: #FBF3E4;
  animation: pp-pulse 1.2s ease-in-out infinite;
}
@keyframes pp-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(179,64,42,.35); }
  50% { box-shadow: 0 0 0 7px rgba(179,64,42,0); }
}
.pp-voice-hint { font-size: 12px; color: var(--kumkum); margin-top: 4px; }
@media (prefers-reduced-motion: reduce) {
  .pp-card { transition: none; }
  .pp-mic-on { animation: none; }
}
`;
