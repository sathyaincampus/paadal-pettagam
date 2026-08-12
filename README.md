# Paadal Pettagam — Carnatic Song Notebook

A cross-platform app that keeps a permanent record of every Carnatic song your son has learned. Add a song with nothing but its name (typed **or spoken**), fill in composer / raga / tala / guru later, link a lyrics PDF and an audio recording, and the app remembers everything.

**Features:** voice input for the song name (editable if heard wrongly) · offline transliteration of Tamil/Telugu/Kannada/Malayalam/Sanskrit script into English letters (transliteration, not translation — no API, no network) · duplicate alert before adding · numbered searchable list · guru/composer/raga autocomplete · lyrics PDF viewing · inline audio player · persistent storage · JSON backup export.

This repo is a Vite + React + Capacitor project: **one codebase → web, Android, and iOS.** The native speech-recognition plugin is already wired in — the app detects whether it's running in a browser (Web Speech API) or a native shell (`@capacitor-community/speech-recognition`) and uses the right one.

## Repo layout

```
src/App.jsx        The whole app (Capacitor-ready: storage shim + native speech)
src/main.jsx       React entry point
artifact/          Claude-artifact version (runs inside claude.ai as-is)
docs/              ARCHITECTURE.md + sequence diagrams
capacitor.config.json, vite.config.js, index.html, package.json
```

## Run on the web

```bash
npm install
npm run dev        # local dev server
npm run build      # production build in dist/
```

Deploy `dist/` to Vercel / Netlify / GitHub Pages and use the browser's **Add to Home Screen** on any phone for an app-like install with zero store fees.

## Build the Android app

```bash
npm install
npx cap add android
npm run android    # builds web assets, syncs, opens Android Studio
```

In `android/app/src/main/AndroidManifest.xml`, make sure these are present:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

Then **Run ▶** on a connected device, or **Build → Generate Signed App Bundle** to publish through the Play Console (one-time $25 developer fee).

## Build the iOS app (requires a Mac with Xcode)

```bash
npm install
npx cap add ios
npm run ios        # builds, syncs, opens Xcode
```

In `ios/App/App/Info.plist`, add:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Speak a song name to add it to the notebook.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Converts your spoken song name into text you can edit.</string>
```

Set your signing team in Xcode, run on a device, then Archive → TestFlight → App Store (Apple Developer account, $99/year).

## After any code change

```bash
npm run sync       # rebuild web assets and copy into both native projects
```

## Transliteration — fully offline

Transliteration is rule-based and runs entirely on-device (`src/translit.js`, zero dependencies). It detects the script (Tamil, Telugu, Kannada, Malayalam, Devanagari), maps syllables to conventional Carnatic romanization, and title-cases the result — no API key, no server, no cost, works in airplane mode. One known limit: Tamil writes k/g, t/d, and p/b with the same letter, so a name like கணபதிம் comes out "Kanapatim" — the field stays editable, so a one-letter fix gets you "Ganapatim".

## Storage

Inside Claude the app uses Claude's persistent `window.storage`. Everywhere else, a shim at the top of `App.jsx` transparently falls back to `localStorage` on the device. Use **Export backup** periodically — it downloads the whole collection as JSON.

## Cross-device sync (free, via Firebase)

Out of the box the hosted app saves songs per device (localStorage). To share **one live song list across every phone, tablet, and computer**, connect a free Firebase project (Spark plan: no credit card, 1 GB storage, 50K reads/day — a family song list uses a fraction of a percent):

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (any name, Analytics off is fine)
2. Project overview → **</> Web app** → register → copy the `firebaseConfig` object
3. Paste it into `src/firebase-config.js` (these values are public identifiers, safe to commit — security comes from the rules below)
4. **Build → Firestore Database → Create database** (production mode, any region)
5. **Build → Authentication → Sign-in method → enable Anonymous**
6. **Firestore → Rules** → replace with the following → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{family} {
      allow read, write: if request.auth != null;
    }
  }
}
```

7. Rebuild and redeploy (`npm run build`, push `dist/` to `gh-pages`)

On first open, the app asks each device for a **family code** — any secret phrase you invent. Every device that enters the same code shares the same live list: adds and edits appear on the other devices within a second, writes go through Firestore with last-write-wins, and each device keeps a localStorage copy as an offline cache. Treat the code like a password (that's what scopes your data). "Stop syncing on this device" in the footer returns a device to local-only.

Until `firebase-config.js` is filled in, the app silently stays in device-only mode — nothing breaks.

## Docs

- `docs/ARCHITECTURE.md` — component design, data model, storage, duplicate detection, and four Mermaid sequence diagrams (GitHub renders them natively).
- `docs/add-song-flow.mermaid` — the core add-song flow as a standalone diagram.
