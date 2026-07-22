// firebase-config.js — PASTE YOUR OWN FIREBASE CONFIG HERE.
//
// This is the ONLY setup step. It takes about 5 minutes, once, and it's free.
// Full walkthrough is in the README ("Set up the free Firebase backend"), but
// the short version:
//
//   1. Go to https://console.firebase.google.com  and click "Add project"
//      (any name, e.g. "pushup-poker"). You can turn off Google Analytics.
//   2. In the left sidebar: Build → Realtime Database → Create Database.
//      Pick a location, and choose "Start in TEST mode" for now.
//   3. Back on the project overview, click the </> ("Web") icon to register a
//      web app (any nickname, no hosting needed). Firebase shows you a
//      `firebaseConfig = { ... }` snippet.
//   4. Copy the values from that snippet into the object below, then save this
//      file and push to GitHub. That's it.
//
// The `databaseURL` line is the important one — make sure it's filled in.

export const firebaseConfig = {
  apiKey: "AIzaSyDpScFVl50yNEQLsx4X2fDLWELTJ76plFg",
  authDomain: "pushup-poker.firebaseapp.com",
  databaseURL: "https://pushup-poker-default-rtdb.firebaseio.com",
  projectId: "pushup-poker",
  storageBucket: "pushup-poker.firebasestorage.app",
  messagingSenderId: "966794496301",
  appId: "1:966794496301:web:c73270625f7179c97e6ba4"
};

// Leave this alone. (Used only for local testing against the Firebase emulator.)
export const emulator = null;
