/* ------------------------------------------------------------------ */
/*  sync.js — cross-device sync via Firebase Firestore                */
/*                                                                    */
/*  All devices that enter the same family code share one live song   */
/*  list. The whole collection is one document (atomic writes,        */
/*  last-write-wins), mirrored to localStorage as an offline cache.   */
/*  If firebase-config.js still has the placeholder, everything       */
/*  falls back to device-only localStorage automatically.             */
/* ------------------------------------------------------------------ */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged as fbAuthChanged,
  signOut as fbSignOut,
} from "firebase/auth";
import { FIREBASE_CONFIG } from "./firebase-config.js";

export const SYNC_AVAILABLE =
  !!FIREBASE_CONFIG?.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("PASTE");

let app = null;
let db = null;
let auth = null;

function ensureApp() {
  if (!app) {
    app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    auth = getAuth(app);
  }
}

async function ensureInit() {
  ensureApp();
  if (!auth.currentUser) await signInAnonymously(auth);
}

function familyDoc(code) {
  return doc(db, "families", code);
}

export function normalizeFamilyCode(raw) {
  return (raw || "").trim().toLowerCase().replace(/\s+/g, "-");
}

/* Sign in anonymously and open a live subscription on the family doc.
   onRemote(songs) fires on every change from any device.
   Returns an unsubscribe function. */
export async function startSync(code, onRemote, onError) {
  await ensureInit();
  return onSnapshot(
    familyDoc(code),
    (snap) => {
      const data = snap.data();
      if (data?.songsJson) {
        try {
          onRemote(JSON.parse(data.songsJson));
        } catch {
          /* corrupt remote — ignore */
        }
      } else {
        onRemote([]); // brand-new family code
      }
    },
    (err) => {
      console.error("Sync subscription error:", err);
      onError?.(err);
    }
  );
}

export async function pushSongs(code, songs) {
  await ensureInit();
  await setDoc(familyDoc(code), {
    songsJson: JSON.stringify(songs),
    updatedAt: new Date().toISOString(),
  });
}

export async function fetchSongsOnce(code) {
  await ensureInit();
  const snap = await getDoc(familyDoc(code));
  const data = snap.data();
  return data?.songsJson ? JSON.parse(data.songsJson) : [];
}

/* ---------- Google sign-in (optional identity on top of family code) --- */

export function watchAuth(cb) {
  ensureApp();
  return fbAuthChanged(auth, (u) => cb(u && !u.isAnonymous ? u : null));
}

export async function googleSignIn() {
  ensureApp();
  const provider = new GoogleAuthProvider();
  try {
    const res = await signInWithPopup(auth, provider);
    return res.user;
  } catch (e) {
    if (e.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider); // page navigates away
      return null;
    }
    if (e.code === "auth/popup-closed-by-user") return null;
    throw e;
  }
}

export async function checkRedirectResult() {
  ensureApp();
  try {
    const r = await getRedirectResult(auth);
    return r?.user && !r.user.isAnonymous ? r.user : null;
  } catch {
    return null;
  }
}

export async function googleSignOut() {
  ensureApp();
  await fbSignOut(auth);
}

/* The user's Google profile doc remembers their family code, so signing
   in on any device reconnects to the same song list automatically. */
export async function getSavedFamilyCode(uid) {
  ensureApp();
  const snap = await getDoc(doc(db, "users", uid));
  return snap.data()?.familyCode || "";
}

export async function saveFamilyCode(uid, code) {
  ensureApp();
  await setDoc(
    doc(db, "users", uid),
    { familyCode: code, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}
