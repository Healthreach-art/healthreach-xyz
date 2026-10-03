import { createServerFn } from "@tanstack/react-start";

// Firebase web config is public by design; the API key is kept as a project
// secret and handed to the browser on demand so it never lives in the repo.
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const apiKey = (process.env["GOOGLE_API_KEY"] ?? "").trim();
  return {
    apiKey,
    authDomain: "healthreachcare-prod.firebaseapp.com",
    projectId: "healthreachcare-prod",
    storageBucket: "healthreachcare-prod.firebasestorage.app",
    messagingSenderId: "234748796667",
    appId: "1:234748796667:web:5b5db868213a5f4e011a5e",
  };
});
