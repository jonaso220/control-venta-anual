import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const environment = import.meta.env ?? {};

const firebaseConfig = {
  apiKey: environment.VITE_FIREBASE_API_KEY || '',
  authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: environment.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: environment.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);
export const isAppCheckConfigured = isFirebaseConfigured
  && Boolean(environment.VITE_FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY);

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
const googleProvider = new GoogleAuthProvider();

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);

  if (isAppCheckConfigured) {
    if (import.meta.env.DEV && environment.VITE_FIREBASE_APPCHECK_DEBUG === 'true') {
      const debugGlobal = globalThis as typeof globalThis & {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean;
      };
      debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(
        environment.VITE_FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY,
      ),
      isTokenAutoRefreshEnabled: true,
    });
  }

  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, appCheck, auth, googleProvider, db };
