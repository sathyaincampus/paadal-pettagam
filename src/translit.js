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
export function transliterate(text) {
  const script = detectScript(text);
  if (!script) return { transliteration: text, language: "" };
  const def = SCRIPTS[script];
  const raw = runEngine(text, def);
  const language = script === "Sanskrit" ? "Sanskrit/Hindi" : script;
  return { transliteration: titleCase(raw), language };
}
