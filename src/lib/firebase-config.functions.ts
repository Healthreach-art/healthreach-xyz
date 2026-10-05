import { createServerFn } from "@tanstack/react-start";

// Firebase web config is public by design; the API key is kept as a project
// secret and handed to the browser on demand so it never lives in the repo.
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const isPlaceholder = (v: string) => !v || v.includes("your-") || !v.startsWith("AIza");
  const candidates = [process.env["GOOGLE_API_KEY"], process.env["VITE_FIREBASE_API_KEY"], process.env["FIREBASE_API_KEY"]]
    .map((v) => (v ?? "").trim());
  const apiKey = candidates.find((v) => !isPlaceholder(v)) ?? "";
  if (!apiKey) {
    console.error("[firebase] No valid Firebase Web API key found. Set GOOGLE_API_KEY in your .env (starts with AIza).");
  }
  return {
    apiKey,
    authDomain: "healthreachcare-prod.firebaseapp.com",
    projectId: "healthreachcare-prod",
    storageBucket: "healthreachcare-prod.firebasestorage.app",
    messagingSenderId: "234748796667",
    appId: "1:234748796667:web:5b5db868213a5f4e011a5e",
  };
});
