interface ImportMetaEnv {
  /** `fake` selects the local fake Backend (e2e, local dev without Firebase). */
  readonly VITE_BACKEND?: string;
  /** `1` runs the Firebase backend on the local emulators, with no Firebase project. */
  readonly VITE_FIREBASE_EMULATOR?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string;
}
