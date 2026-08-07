import { initializeApp, type FirebaseApp } from 'firebase/app';
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

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
const googleProvider = new GoogleAuthProvider();

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, auth, googleProvider, db };
