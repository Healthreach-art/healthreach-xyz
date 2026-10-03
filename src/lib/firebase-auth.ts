/**
 * Firebase Authentication helpers for HealthReachCare.
 *
 * These helpers centralize Firebase Authentication operations used by the app.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as sdkSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  type User as FirebaseUser,
  type Unsubscribe,
} from "firebase/auth";
import { getFirebase } from "./firebase";

export type FirebaseAuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
};

function toAuthUser(user: FirebaseUser): FirebaseAuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
  };
}

/** Listen to sign-in state. Returns an unsubscribe function. */
export async function onFirebaseAuthChange(
  callback: (user: FirebaseAuthUser | null) => void,
): Promise<Unsubscribe> {
  const { auth } = await getFirebase();
  return onAuthStateChanged(auth, (user) =>
    callback(user ? toAuthUser(user) : null),
  );
}

/** Get the currently signed-in user (null when signed out). */
export async function getFirebaseCurrentUser(): Promise<FirebaseAuthUser | null> {
  const { auth } = await getFirebase();
  await auth.authStateReady();
  return auth.currentUser ? toAuthUser(auth.currentUser) : null;
}

/** Create a new account with email and password. */
export async function firebaseSignUp(
  email: string,
  password: string,
  displayName?: string,
): Promise<FirebaseAuthUser> {
  const { auth } = await getFirebase();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return toAuthUser(cred.user);
}

/** Sign in with email and password. */
export async function firebaseSignIn(
  email: string,
  password: string,
): Promise<FirebaseAuthUser> {
  const { auth } = await getFirebase();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return toAuthUser(cred.user);
}

/** Sign in with Google via popup. */
export async function firebaseSignInWithGoogle(): Promise<FirebaseAuthUser> {
  const { auth } = await getFirebase();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return toAuthUser(cred.user);
}

/** Send a password-reset email. */
export async function firebaseSendPasswordReset(email: string): Promise<void> {
  const { auth } = await getFirebase();
  await sendPasswordResetEmail(auth, email);
}

/** Sign out. */
export async function firebaseSignOut(): Promise<void> {
  const { auth } = await getFirebase();
  await sdkSignOut(auth);
}

/** Get the current user's ID token for authenticated server calls. */
export async function getFirebaseIdToken(): Promise<string | null> {
  const { auth } = await getFirebase();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
