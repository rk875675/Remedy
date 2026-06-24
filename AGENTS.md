# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

## Cursor Cloud specific instructions

Remedy is an **iOS-first React Native + Expo (SDK 54, managed workflow)** app. Package manager is **npm** (`package-lock.json`); Node 22 works. Run scripts live in `package.json`.

- **Run dev (the actual service):** `npx expo start` (Metro bundler). Native modules (Superwall, IAP, push) only work in a dev-client/device build (`npm run start:dev`) — not Expo Go/simulator. There is **no iOS simulator on this Linux VM**, so you cannot render the UI here; develop against the bundler and, if you need a live device, use Expo Go via QR/tunnel.
- **Verifying it builds without a device:** request the **expo-router entry** bundle, e.g. `curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true"`. Do NOT use `/index.bundle` — root `index.ts`/`App.tsx` are dead code (legacy entry) and bundle the wrong tree; the real entry is `expo-router/entry` (`main` in `package.json`) → `app/_layout.tsx`.
- **Runtime env required:** `lib/supabase.ts` non-null-asserts `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The app **bundles fine without them but crashes at runtime** on the Supabase client init. Set them (e.g. `.env` / secrets) to exercise the app end-to-end. Optional client vars: `EXPO_PUBLIC_SUPERWALL_API_KEY`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- **Type check:** `npx tsc --noEmit` (no ESLint config exists). There are **pre-existing** errors unrelated to setup: `@expo/vector-icons` resolves only nested under `node_modules/expo/` (Metro resolves it fine; tsc complains), and `never`-type errors in `app/session/[id].tsx`. Don't treat these as setup breakage.
- **Benign warning:** Metro logs an `expo-superwall` "exports … no match resolved, falling back to file-based resolution" warning on every bundle — harmless.
- **Supabase backend** (Deno edge functions in `supabase/functions/`, SQL migrations in `supabase/migrations/`) is linked to a **remote** project (`supabase/.temp/`), not a local stack (no `config.toml`). It needs the Supabase CLI + credentials and is optional for client dev. Upstash/Cloudflare/Resend/PostHog are optional and largely not wired into client source yet.
