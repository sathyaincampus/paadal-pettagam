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
export function lookupRaga(name) {
  return DB[norm(name)] || null;
}
