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
  sendEmailVerification,
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  reload,
  updateProfile,
  updatePassword,
  verifyPasswordResetCode,
  type ActionCodeInfo,
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

function authContinuationUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  if (url.hostname === "www.healthreachcare.co.za") {
    url.hostname = "healthreachcare.co.za";
  }
  return url.toString();
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

/** Send Firebase's verification email with a HealthReachCare continuation URL. */
export async function firebaseSendEmailVerification(): Promise<boolean> {
  const { auth } = await getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before requesting an email verification link.");
  await reload(user);
  if (user.emailVerified) return false;

  const continueUrl = new URL(authContinuationUrl("/auth/verify-email"));
  continueUrl.searchParams.set("continue", "1");
  await sendEmailVerification(user, { url: continueUrl.toString() });
  try {
    window.localStorage.setItem("hr_email_verification_resend_until", String(Date.now() + 60_000));
  } catch (error) {
    console.warn("[auth] Could not persist the verification resend cooldown.", error);
  }
  return true;
}

/** Apply the Firebase email verification action code from the email link. */
export async function firebaseApplyEmailVerificationCode(
  actionCode: string,
): Promise<ActionCodeInfo> {
  const { auth } = await getFirebase();
  const action = await checkActionCode(auth, actionCode);
  await applyActionCode(auth, actionCode);
  return action;
}

/** Refresh the signed-in user's server-confirmed email verification state. */
export async function firebaseReloadCurrentUser(): Promise<FirebaseAuthUser | null> {
  const { auth } = await getFirebase();
  if (!auth.currentUser) return null;
  await reload(auth.currentUser);
  return auth.currentUser ? toAuthUser(auth.currentUser) : null;
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
export async function firebaseSendPasswordReset(email: string, continueUrl?: string): Promise<void> {
  const { auth } = await getFirebase();
  await sendPasswordResetEmail(auth, email, {
    url: continueUrl ?? authContinuationUrl("/reset-password"),
    handleCodeInApp: true,
  });
}

/** Validate and complete a Firebase password-reset action code. */
export async function firebaseVerifyPasswordResetCode(actionCode: string): Promise<string> {
  const { auth } = await getFirebase();
  return verifyPasswordResetCode(auth, actionCode);
}

export async function firebaseConfirmPasswordReset(actionCode: string, password: string): Promise<void> {
  const { auth } = await getFirebase();
  await confirmPasswordReset(auth, actionCode, password);
}

/** Update the password for the currently signed-in Firebase user. */
export async function firebaseUpdateCurrentPassword(password: string): Promise<void> {
  const { auth } = await getFirebase();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in before changing your password.");
  await updatePassword(auth.currentUser, password);
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
