import { useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase';
import {
  AccessDeniedError,
  USER_NOT_ALLOWED_MESSAGE,
  createAccessPolicy,
  hasRequiredAppAccessClaim,
  isIdentityAllowed,
} from '../security/accessPolicy';
import type { User } from '../types';
import { AuthContext } from './AuthContext';

const environment = import.meta.env ?? {};
const accessPolicy = createAccessPolicy({
  allowedEmails: environment.VITE_AUTH_ALLOWED_EMAILS,
  allowedUids: environment.VITE_AUTH_ALLOWED_UIDS,
  requireAllowlist: environment.VITE_AUTH_REQUIRE_ALLOWLIST === 'true',
});
const requireAppAccessClaim = environment.VITE_AUTH_REQUIRE_APP_ACCESS_CLAIM === 'true';

async function isFirebaseUserAllowed(firebaseUser: FirebaseUser): Promise<boolean> {
  if (!isIdentityAllowed(accessPolicy, firebaseUser)) return false;
  if (!requireAppAccessClaim) return true;

  // Force a refresh so a newly granted access claim is recognized without
  // waiting for Firebase's cached ID token to expire.
  const token = await firebaseUser.getIdTokenResult(true);
  return hasRequiredAppAccessClaim(true, token.claims);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured && auth !== null);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return;
    const firebaseAuth = auth;

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        try {
          const allowed = await isFirebaseUserAllowed(firebaseUser);
          if (firebaseAuth.currentUser?.uid !== firebaseUser.uid) return;

          if (!allowed) {
            setUser(null);
            setAccessError(USER_NOT_ALLOWED_MESSAGE);
            setLoading(false);
            void signOut(firebaseAuth).catch(() => undefined);
            return;
          }
        } catch {
          if (firebaseAuth.currentUser?.uid !== firebaseUser.uid) return;
          setUser(null);
          setAccessError('No se pudo verificar el acceso de esta cuenta.');
          setLoading(false);
          void signOut(firebaseAuth).catch(() => undefined);
          return;
        }

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
        setAccessError(null);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Firebase no esta configurado');
    setAccessError(null);
    const credential = await signInWithPopup(auth, googleProvider);

    if (!await isFirebaseUserAllowed(credential.user)) {
      setUser(null);
      setAccessError(USER_NOT_ALLOWED_MESSAGE);
      await signOut(auth);
      throw new AccessDeniedError();
    }
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      firebaseReady: isFirebaseConfigured,
      accessError,
      signInWithGoogle,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
