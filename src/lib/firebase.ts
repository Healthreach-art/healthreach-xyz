import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirebaseConfig } from "./firebase-config.functions";

type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage };

let servicesPromise: Promise<FirebaseServices> | null = null;

/** Lazily initialise Firebase services in the browser. */
export function getFirebase(): Promise<FirebaseServices> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Firebase client is browser-only"));
  }
  if (!servicesPromise) {
    servicesPromise = getFirebaseConfig().then((config) => {
      if (!config.apiKey) throw new Error("Firebase API key is not configured");
      const app = getApps()[0] ?? initializeApp(config);
      return { app, auth: getAuth(app), db: getFirestore(app), storage: getStorage(app) };
    });
  }
  return servicesPromise;
}
