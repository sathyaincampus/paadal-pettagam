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
import { getAuth, signInAnonymously } from "firebase/auth";
import { FIREBASE_CONFIG } from "./firebase-config.js";

export const SYNC_AVAILABLE =
  !!FIREBASE_CONFIG?.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("PASTE");

let db = null;

async function ensureInit() {
  if (!db) {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    await signInAnonymously(getAuth(app));
  }
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
