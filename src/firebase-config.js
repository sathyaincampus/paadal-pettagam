/* ------------------------------------------------------------------ */
/*  Firebase config — paste yours here to turn on cross-device sync.  */
/*                                                                    */
/*  1. console.firebase.google.com → Add project (any name)           */
/*  2. Project overview → Web app (</>) → Register → copy the         */
/*     firebaseConfig object and paste it below, replacing this one   */
/*  3. Build → Firestore Database → Create database (production)      */
/*  4. Build → Authentication → Sign-in method → enable "Anonymous"   */
/*  5. Firestore → Rules → paste the rules from README → Publish      */
/*                                                                    */
/*  These values are safe to commit — they are public identifiers,    */
/*  not secrets. Access is controlled by the Firestore rules.         */
/*  Until this is filled in, the app quietly falls back to            */
/*  device-only storage (localStorage).                               */
/* ------------------------------------------------------------------ */

export const FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_CONFIG_HERE",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
