import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

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
  arohanam: "",
  avarohanam: "",
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

async function persistSongs(songs) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(songs));
    return true;
  } catch (e) {
    console.error("Storage error:", e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  translit.js — offline Indic → Latin transliteration               */
/*  Zero dependencies, zero network. Supports Tamil, Telugu,          */
/*  Kannada, Malayalam, and Devanagari (Sanskrit/Hindi).              */
/*                                                                    */
/*  Style: conventional Carnatic romanization — long vowels collapse  */
/*  (ā → a), so வாதாபி கணபதிம் → "Vatapi Kanapatim". Rule-based       */
/*  mapping can't always pick voiced consonants in Tamil (k/g, t/d,   */
/*  p/b share one letter) — the field stays editable for those.       */
/* ------------------------------------------------------------------ */

const SCRIPTS = {
  Tamil: {
    range: /[\u0B80-\u0BFF]/,
    virama: "\u0BCD", // ்
    vowels: { அ: "a", ஆ: "a", இ: "i", ஈ: "i", உ: "u", ஊ: "u", எ: "e", ஏ: "e", ஐ: "ai", ஒ: "o", ஓ: "o", ஔ: "au" },
    matras: { "ா": "a", "ி": "i", "ீ": "i", "ு": "u", "ூ": "u", "ெ": "e", "ே": "e", "ை": "ai", "ொ": "o", "ோ": "o", "ௌ": "au" },
    signs: { ஃ: "h" },
    consonants: { க: "k", ங: "ng", ச: "ch", ஞ: "n", ட: "t", ண: "n", த: "t", ந: "n", ப: "p", ம: "m", ய: "y", ர: "r", ல: "l", வ: "v", ழ: "zh", ள: "l", ற: "r", ன: "n", ஜ: "j", ஶ: "sh", ஷ: "sh", ஸ: "s", ஹ: "h" },
  },
  Telugu: {
    range: /[\u0C00-\u0C7F]/,
    virama: "\u0C4D", // ్
    vowels: { అ: "a", ఆ: "a", ఇ: "i", ఈ: "i", ఉ: "u", ఊ: "u", ఋ: "ri", ఎ: "e", ఏ: "e", ఐ: "ai", ఒ: "o", ఓ: "o", ఔ: "au" },
    matras: { "ా": "a", "ి": "i", "ీ": "i", "ు": "u", "ూ": "u", "ృ": "ri", "ె": "e", "ే": "e", "ై": "ai", "ొ": "o", "ో": "o", "ౌ": "au" },
    signs: { "ం": "m", "ః": "h" },
    consonants: { క: "k", ఖ: "kh", గ: "g", ఘ: "gh", ఙ: "n", చ: "ch", ఛ: "chh", జ: "j", ఝ: "jh", ఞ: "n", ట: "t", ఠ: "th", డ: "d", ఢ: "dh", ణ: "n", త: "t", థ: "th", ద: "d", ధ: "dh", న: "n", ప: "p", ఫ: "ph", బ: "b", భ: "bh", మ: "m", య: "y", ర: "r", ల: "l", వ: "v", శ: "sh", ష: "sh", స: "s", హ: "h", ళ: "l", ఱ: "r" },
  },
  Kannada: {
    range: /[\u0C80-\u0CFF]/,
    virama: "\u0CCD", // ್
    vowels: { ಅ: "a", ಆ: "a", ಇ: "i", ಈ: "i", ಉ: "u", ಊ: "u", ಋ: "ri", ಎ: "e", ಏ: "e", ಐ: "ai", ಒ: "o", ಓ: "o", ಔ: "au" },
    matras: { "ಾ": "a", "ಿ": "i", "ೀ": "i", "ು": "u", "ೂ": "u", "ೃ": "ri", "ೆ": "e", "ೇ": "e", "ೈ": "ai", "ೊ": "o", "ೋ": "o", "ೌ": "au" },
    signs: { "ಂ": "m", "ಃ": "h" },
    consonants: { ಕ: "k", ಖ: "kh", ಗ: "g", ಘ: "gh", ಙ: "n", ಚ: "ch", ಛ: "chh", ಜ: "j", ಝ: "jh", ಞ: "n", ಟ: "t", ಠ: "th", ಡ: "d", ಢ: "dh", ಣ: "n", ತ: "t", ಥ: "th", ದ: "d", ಧ: "dh", ನ: "n", ಪ: "p", ಫ: "ph", ಬ: "b", ಭ: "bh", ಮ: "m", ಯ: "y", ರ: "r", ಲ: "l", ವ: "v", ಶ: "sh", ಷ: "sh", ಸ: "s", ಹ: "h", ಳ: "l" },
  },
  Malayalam: {
    range: /[\u0D00-\u0D7F]/,
    virama: "\u0D4D", // ്
    vowels: { അ: "a", ആ: "a", ഇ: "i", ഈ: "i", ഉ: "u", ഊ: "u", ഋ: "ri", എ: "e", ഏ: "e", ഐ: "ai", ഒ: "o", ഓ: "o", ഔ: "au" },
    matras: { "ാ": "a", "ി": "i", "ീ": "i", "ു": "u", "ൂ": "u", "ൃ": "ri", "െ": "e", "േ": "e", "ൈ": "ai", "ൊ": "o", "ോ": "o", "ൌ": "au", "ൗ": "au" },
    signs: { "ം": "m", "ഃ": "h", ൻ: "n", ർ: "r", ൽ: "l", ൾ: "l", ൺ: "n" },
    consonants: { ക: "k", ഖ: "kh", ഗ: "g", ഘ: "gh", ങ: "ng", ച: "ch", ഛ: "chh", ജ: "j", ഝ: "jh", ഞ: "n", ട: "t", ഠ: "th", ഡ: "d", ഢ: "dh", ണ: "n", ത: "t", ഥ: "th", ദ: "d", ധ: "dh", ന: "n", പ: "p", ഫ: "ph", ബ: "b", ഭ: "bh", മ: "m", യ: "y", ര: "r", ല: "l", വ: "v", ശ: "sh", ഷ: "sh", സ: "s", ഹ: "h", ള: "l", ഴ: "zh", റ: "r" },
  },
  Sanskrit: {
    // Devanagari — covers Sanskrit and Hindi
    range: /[\u0900-\u097F]/,
    virama: "\u094D", // ्
    vowels: { अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au" },
    matras: { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au" },
    signs: { "ं": "m", "ः": "h", "ँ": "n", ऽ: "" },
    consonants: { क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n", ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n", प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "sh", ष: "sh", स: "s", ह: "h", ळ: "l" },
  },
};

function detectScript(text) {
  let best = null;
  let bestCount = 0;
  for (const [name, def] of Object.entries(SCRIPTS)) {
    const count = [...text].filter((c) => def.range.test(c)).length;
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function runEngine(text, def) {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (def.consonants[c] !== undefined) {
      out += def.consonants[c];
      const next = chars[i + 1];
      if (next === def.virama) {
        i++; // bare consonant — suppress the inherent 'a'
      } else if (next !== undefined && def.matras[next] !== undefined) {
        out += def.matras[next];
        i++;
      } else {
        out += "a"; // inherent vowel
      }
    } else if (def.vowels[c] !== undefined) {
      out += def.vowels[c];
    } else if (def.signs && def.signs[c] !== undefined) {
      let sign = def.signs[c];
      if (sign === "m") {
        // Anusvara assimilates: "n" before dentals/palatals (Endaro, not Emdaro)
        const nextBase = def.consonants[chars[i + 1]];
        if (nextBase && /^(t|d|n|ch|j)/.test(nextBase)) sign = "n";
      }
      out += sign;
    } else if (def.matras[c] !== undefined) {
      out += def.matras[c]; // stray matra — be forgiving
    } else if (c === def.virama) {
      // stray virama — skip
    } else {
      out += c; // Latin letters, digits, punctuation pass through
    }
  }
  return out;
}

function titleCase(s) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Transliterate Indic-script text into Latin letters (sounds, not meaning).
 * Fully offline. Returns { transliteration, language }.
 * Unrecognized scripts return the input unchanged with language "".
 */
function transliterate(text) {
  const script = detectScript(text);
  if (!script) return { transliteration: text, language: "" };
  const def = SCRIPTS[script];
  const raw = runEngine(text, def);
  const language = script === "Sanskrit" ? "Sanskrit/Hindi" : script;
  return { transliteration: titleCase(raw), language };
}

/* ------------------------------------------------------------------ */
/*  raga-db.js — offline Carnatic raga database                       */
/*  All 72 melakarta ragas (generated from the chakra scheme) plus    */
/*  common janya ragas, with arohanam/avarohanam in swara notation    */
/*  (S R1 R2 G1..G3 M1 M2 P D1..D3 N1..N3). Zero dependencies.        */
/* ------------------------------------------------------------------ */

const MELAKARTA_NAMES = [
  "Kanakangi", "Ratnangi", "Ganamurti", "Vanaspati", "Manavati", "Tanarupi",
  "Senavati", "Hanumatodi", "Dhenuka", "Natakapriya", "Kokilapriya", "Rupavati",
  "Gayakapriya", "Vakulabharanam", "Mayamalavagowla", "Chakravakam", "Suryakantam", "Hatakambari",
  "Jhankaradhwani", "Natabhairavi", "Keeravani", "Kharaharapriya", "Gourimanohari", "Varunapriya",
  "Mararanjani", "Charukesi", "Sarasangi", "Harikambhoji", "Dheerasankarabharanam", "Naganandini",
  "Yagapriya", "Ragavardhini", "Gangeyabhushani", "Vagadheeswari", "Shulini", "Chalanata",
  "Salagam", "Jalarnavam", "Jhalavarali", "Navaneetam", "Pavani", "Raghupriya",
  "Gavambodhi", "Bhavapriya", "Shubhapantuvarali", "Shadvidamargini", "Suvarnangi", "Divyamani",
  "Dhavalambari", "Namanarayani", "Kamavardhini", "Ramapriya", "Gamanashrama", "Vishwambari",
  "Shamalangi", "Shanmukhapriya", "Simhendramadhyamam", "Hemavati", "Dharmavati", "Neetimati",
  "Kantamani", "Rishabhapriya", "Latangi", "Vachaspati", "Mechakalyani", "Chitrambari",
  "Sucharitra", "Jyotiswarupini", "Dhatuvardhani", "Nasikabhushani", "Kosalam", "Rasikapriya",
];

const RG = [["R1","G1"],["R1","G2"],["R1","G3"],["R2","G2"],["R2","G3"],["R3","G3"]];
const DN = [["D1","N1"],["D1","N2"],["D1","N3"],["D2","N2"],["D2","N3"],["D3","N3"]];

const DB = {};

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// Generate all 72 melakartas
MELAKARTA_NAMES.forEach((name, i) => {
  const m = i < 36 ? "M1" : "M2";
  const [r, g] = RG[Math.floor((i % 36) / 6)];
  const [d, n] = DN[i % 6];
  DB[norm(name)] = {
    name,
    mela: i + 1,
    arohanam: `S ${r} ${g} ${m} P ${d} ${n} S`,
    avarohanam: `S ${n} ${d} P ${m} ${g} ${r} S`,
  };
});

// Common janya (and popularly-known) ragas
const JANYA = {
  "Mohanam":          ["S R2 G3 P D2 S",        "S D2 P G3 R2 S"],
  "Hamsadhwani":      ["S R2 G3 P N3 S",        "S N3 P G3 R2 S"],
  "Hindolam":         ["S G2 M1 D1 N2 S",       "S N2 D1 M1 G2 S"],
  "Abhogi":           ["S R2 G2 M1 D2 S",       "S D2 M1 G2 R2 S"],
  "Sriranjani":       ["S R2 G2 M1 D2 N2 S",    "S N2 D2 M1 G2 R2 S"],
  "Shuddha Saveri":   ["S R2 M1 P D2 S",        "S D2 P M1 R2 S"],
  "Madhyamavati":     ["S R2 M1 P N2 S",        "S N2 P M1 R2 S"],
  "Bilahari":         ["S R2 G3 P D2 S",        "S N3 D2 P M1 G3 R2 S"],
  "Kambhoji":         ["S R2 G3 M1 P D2 S",     "S N2 D2 P M1 G3 R2 S"],
  "Arabhi":           ["S R2 M1 P D2 S",        "S N3 D2 P M1 G3 R2 S"],
  "Saveri":           ["S R1 M1 P D1 S",        "S N3 D1 P M1 G3 R1 S"],
  "Bhairavi":         ["S R2 G2 M1 P D2 N2 S",  "S N2 D1 P M1 G2 R2 S"],
  "Khamas":           ["S M1 G3 M1 P D2 N2 S",  "S N2 D2 P M1 G3 S"],
  "Valaji":           ["S G3 P D2 N2 S",        "S N2 D2 P G3 S"],
  "Revati":           ["S R1 M1 P N2 S",        "S N2 P M1 R1 S"],
  "Amritavarshini":   ["S G3 M2 P N3 S",        "S N3 P M2 G3 S"],
  "Bahudari":         ["S G3 M1 P D2 N2 S",     "S N2 P M1 G3 S"],
  "Nalinakanti":      ["S G3 R2 M1 P N3 S",     "S N3 P M1 G3 R2 S"],
  "Sri":              ["S R2 M1 P N2 S",        "S N2 P D2 N2 P M1 R2 G2 R2 S"],
  "Anandabhairavi":   ["S G2 R2 G2 M1 P D2 P S","S N2 D2 P M1 G2 R2 S"],
  "Mohana Kalyani":   ["S R2 G3 P D2 S",        "S N3 D2 P M2 G3 R2 S"],
  "Shuddha Dhanyasi": ["S G2 M1 P N2 S",        "S N2 P M1 G2 S"],
  "Malahari":         ["S R1 M1 P D1 S",        "S D1 P M1 G3 R1 S"],
  "Bauli":            ["S R1 G3 P D1 S",        "S N3 D1 P G3 R1 S"],
  "Nata":             ["S R3 G3 M1 P D3 N3 S",  "S N3 P M1 R3 S"],
  "Gambhira Nata":    ["S G3 M1 P N3 S",        "S N3 P M1 G3 S"],
  "Bhupalam":         ["S R1 G2 P D1 S",        "S D1 P G2 R1 S"],
};

for (const [name, [aro, ava]] of Object.entries(JANYA)) {
  DB[norm(name)] = { name, arohanam: aro, avarohanam: ava };
}

// Popular alternate names / spellings → canonical entry
const ALIASES = {
  kalyani: "Mechakalyani",
  sankarabharanam: "Dheerasankarabharanam",
  shankarabharanam: "Dheerasankarabharanam",
  todi: "Hanumatodi",
  thodi: "Hanumatodi",
  pantuvarali: "Kamavardhini",
  mayamalavagoula: "Mayamalavagowla",
  mayamalavagaula: "Mayamalavagowla",
  kiravani: "Keeravani",
  keervani: "Keeravani",
  kirvani: "Keeravani",
  harikamboji: "Harikambhoji",
  kamboji: "Kambhoji",
  mohana: "Mohanam",
  hamsadhvani: "Hamsadhwani",
  hamsadwani: "Hamsadhwani",
  hindola: "Hindolam",
  sriragam: "Sri",
  shree: "Sri",
  shreeragam: "Sri",
  suddhasaveri: "Shuddha Saveri",
  suddhadhanyasi: "Shuddha Dhanyasi",
  udayaravichandrika: "Shuddha Dhanyasi",
  shanmugapriya: "Shanmukhapriya",
  simhendramadhyama: "Simhendramadhyamam",
  chalanattai: "Chalanata",
  natai: "Nata",
  nattai: "Nata",
};

for (const [alias, canonical] of Object.entries(ALIASES)) {
  if (DB[norm(canonical)]) DB[alias] = DB[norm(canonical)];
}

/**
 * Look up a raga by name (any common spelling).
 * Returns { name, arohanam, avarohanam, mela? } or null.
 */
function lookupRaga(name) {
  return DB[norm(name)] || null;
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
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState("ta-IN");
  const recogRef = useRef(null);

  useEffect(() => {
    (async () => {
      setSongs(await loadSongs());
      setLoading(false);
    })();
  }, []);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function commit(next) {
    setSongs(next);
    const ok = await persistSongs(next);
    if (!ok) notify("Couldn't save — check your connection and try again.");
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
    autoTranslitRef.current = "";
    autoLangRef.current = "";
    autoRagaRef.current = { a: "", av: "" };
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPanel("add");
  }

  function openEdit(song) {
    autoTranslitRef.current = "";
    autoLangRef.current = "";
    autoRagaRef.current = { a: "", av: "" };
    setForm({ ...EMPTY_FORM, ...song });
    setEditingId(song.id);
    setPanel("edit");
    setExpandedId(null);
  }

  function setF(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const autoTranslitRef = useRef("");
  const autoLangRef = useRef("");
  const autoRagaRef = useRef({ a: "", av: "" });

  // Live transliteration: fills in as you type (or speak) the name.
  // A manually edited transliteration is never overwritten.
  function handleNameChange(v) {
    setForm((f) => {
      const next = { ...f, name: v };
      if (/[^\u0000-\u024F]/.test(v)) {
        const r = transliterate(v);
        if (!f.transliteration || f.transliteration === autoTranslitRef.current) {
          next.transliteration = r.transliteration;
          autoTranslitRef.current = r.transliteration;
          if (!f.language || f.language === autoLangRef.current) {
            next.language = r.language;
            autoLangRef.current = r.language;
          }
        }
      }
      return next;
    });
  }

  // Auto-fill arohanam/avarohanam from the built-in raga database.
  // Manual edits are never overwritten.
  function handleRagaChange(v) {
    setForm((f) => {
      const next = { ...f, raga: v };
      const hit = lookupRaga(v);
      if (hit) {
        if (!f.arohanam || f.arohanam === autoRagaRef.current.a)
          next.arohanam = hit.arohanam;
        if (!f.avarohanam || f.avarohanam === autoRagaRef.current.av)
          next.avarohanam = hit.avarohanam;
        autoRagaRef.current = { a: hit.arohanam, av: hit.avarohanam };
      }
      return next;
    });
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
      "Arohanam": s.arohanam || "",
      "Avarohanam": s.avarohanam || "",
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
      { wch: 22 }, // arohanam
      { wch: 24 }, // avarohanam
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
    try {
      recogRef.current?.stop();
    } catch {}
    setListening(false);
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      notify("Voice input isn't supported in this browser — please type the name.");
      return;
    }
    if (listening) {
      stopVoice();
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
        handleNameChange(heard.trim());
        notify("Heard it — check the name and edit if it's not quite right.");
      }
    };
    recog.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") {
        notify("Microphone permission was denied — allow it to use voice input.");
      } else if (e.error === "no-speech") {
        notify("Didn't catch anything — tap the mic and try again.");
      } else if (
        (e.error === "service-not-allowed" || e.error === "not-allowed") &&
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !/Safari/.test(navigator.userAgent.replace(/CriOS|FxiOS|EdgiOS|GSA/g, ""))
      ) {
        notify(
          "On iPhone, this mic works only in Safari. Open this site in Safari — or tap the mic on your keyboard (dictation) to speak straight into the field."
        );
      } else if (e.error === "service-not-allowed") {
        notify(
          "Speech service is blocked here. On iPhone use Safari or the keyboard's dictation mic; on Android use Chrome."
        );
      } else if (e.error !== "aborted") {
        notify(`Mic error: ${e.error || "unknown"}. Check the site's microphone permission, or type the name.`);
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
                  onChange={(e) => handleNameChange(e.target.value)}
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
                onChange={(e) => handleRagaChange(e.target.value)}
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
            <label className="pp-field">
              <span>Arohanam — auto-fills from the raga</span>
              <input
                className="pp-swara"
                value={form.arohanam}
                onChange={(e) => setF("arohanam", e.target.value)}
                placeholder="S R2 G3 P D2 S"
              />
            </label>
            <label className="pp-field">
              <span>Avarohanam</span>
              <input
                className="pp-swara"
                value={form.avarohanam}
                onChange={(e) => setF("avarohanam", e.target.value)}
                placeholder="S D2 P G3 R2 S"
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
                      {s.arohanam && (<><dt>Arohanam</dt><dd className="pp-swara-dd">{s.arohanam}</dd></>)}
                      {s.avarohanam && (<><dt>Avarohanam</dt><dd className="pp-swara-dd">{s.avarohanam}</dd></>)}
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
        Songs are saved automatically and remembered next time you open this.
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
  display: grid; grid-template-columns: 96px 1fr; gap: 3px 10px;
  font-size: 13.5px; margin: 0 0 10px;
}
.pp-facts dt { color: #7A5A42; font-weight: 600; }
.pp-facts dd { margin: 0; overflow-wrap: anywhere; }
.pp-audio { margin: 6px 0 10px; }
.pp-swara, .pp-swara-dd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .04em;
}
.pp-swara-dd { font-size: 12.5px; color: var(--teal); }
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
