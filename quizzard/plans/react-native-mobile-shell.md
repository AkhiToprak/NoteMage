# Plan: Ship Notemage as iOS (React Native) + Windows (Electron) Apps

## How to Use This Plan

This plan is **designed to be resumed across multiple conversations**. Each phase is a self-contained unit with enough context that a fresh conversation can pick up from any phase without re-reading the whole document.

**Reading order for a new conversation:**

1. Read "**Standing Context**" below (mandatory — this is the shared state all phases assume)
2. Read "**Standing Architecture**" below (mandatory — tech stack, monorepo layout, bridge protocol)
3. Jump to the specific **Phase** you want to work on — each phase has its own prerequisites, goals, implementation steps, and verification

**Phase dependency chain:** Phase 0 → 1 → 2 → (3, 4, 5 in parallel) → 6 → 7 → 8 → 9 → 10. Phases 3 and onward can overlap where dependencies allow; see each phase's "Prerequisites" section for specifics.

---

## Standing Context

**READ THIS BEFORE ANY PHASE.** All phases assume this is true.

### Product

**Notemage** is an AI-powered study notebook. Users write notes on an infinite canvas with handwriting/stylus support, generate flashcards and quizzes from their notes via AI, and chat with an AI tutor to understand concepts. Realtime cowork sessions and notebook sharing (DMs + groups) let students study together.

- **Operator:** Switzerland-based, product distributed globally
- **Domain:** `notemage.app`
- **Current status:** Next.js web app deployed on Vercel, Supabase Postgres backend, waitlist collecting signups. Not yet launched.

### Target Platforms (this plan)

1. **iOS / iPadOS** — primary platform, React Native WebView shell wrapping `https://notemage.app`
2. **Windows** — Electron shell wrapping the same `https://notemage.app`
3. **Web (companion)** — existing Next.js app serves as login-only companion for paying users on non-iOS / non-Windows devices (e.g., accessing notes from a Chromebook at school)

**Out of scope for this plan:** macOS standalone (Electron build may accidentally produce a Mac binary, fine — but no specific work), Android (deferred post-launch), iPhone specifically (the iPad build auto-supports iPhone via universal app, minimal extra work)

### Tier Model

| Tier | Price (target) | AI Features | Quotas | Notes |
|---|---|---|---|---|
| **Free** | $0 | **No AI at all** | N/A | Manual notebook, canvas, flashcards, quizzes, cowork, sharing |
| **Pro** | ~$9.99–$14.99/mo | Haiku 4.5 only | Daily: 20 flashcard gens + 30 tutor messages + 5 quiz gens | No PDF chat |
| **Plus** | ~$19.99–$24.99/mo | Sonnet 4.6 + Opus 4.6 on premium features | High/unlimited | PDF chat, voice notes, exam simulation |

Annual pricing: both paid tiers offered as monthly OR annual (~20% discount). Pricing is **TBD** — use placeholders until confirmed.

**Rationale for the Free/Pro/Plus split:** Variable cost per free user is zero (no AI = no token cost). Pro uses the cheap model to protect margins on light users. Plus uses Sonnet/Opus to justify the price premium for heavy users. Quotas are enforced **server-side** — every AI call is gated before it reaches Anthropic.

### MVP Feature Scope (what ships to the App Store and Windows first)

**In scope:**
- Notes (rich text + drawing)
- Infinite canvas with stylus + Apple Pencil support
- Manual flashcards + spaced repetition review
- Manual quizzes
- AI tutor chat (Pro/Plus only, tier-gated)
- AI flashcard generation (Pro/Plus only)
- AI quiz generation (Pro/Plus only)
- Study plans
- **Cowork (realtime collaboration)** via Socket.io
- **Notebook sharing** (DMs + groups)
- Onboarding wizard (full: account, avatar, username, goals)
- Cosmetics / gamification system

**Not in scope:**
- ~~Publishing / community posts~~ (already deleted from the codebase)
- Android app
- macOS-specific native features beyond what Electron provides out of the box

### Payment Architecture

**One subscription product, three distribution channels:**

- **iOS / iPadOS:** Apple In-App Purchase via StoreKit, abstracted by **RevenueCat**. Apple is the Merchant of Record. 15% commission (Small Business Program, auto-applies under $1M/year).
- **Windows (.exe):** **Paddle** or **Lemon Squeezy** as Merchant of Record. Checkout opens in external browser, webhook updates entitlement on backend. ~5% fee.
- **Web:** NO payment flow. Zero web checkout, zero Stripe. The web companion is login-only for users who already paid via iOS or Windows.

**Stripe is being deleted entirely.** Any existing Stripe code in `quizzard/` is dead code to be removed in Phase 4.

**The backend has one source of truth** for user entitlement state (`tier`, `expiresAt`, `quotaUsed`), fed by webhooks from both RevenueCat (for iOS) and Paddle/Lemon Squeezy (for Windows).

### Authentication

- **NextAuth** (existing) with:
  - Email + password (existing)
  - Google OAuth (existing, shipped per recent commit `3ccde87`)
  - **Sign in with Apple** (partially scaffolded per same commit — needs full wiring in Phase 4)
- **Sign in with Apple** is the primary auth method on iOS because it's the frictionless choice on Apple devices
- Unified account system: the same Apple ID → NextAuth user → same notebook on iOS, Windows, and web
- **Auth persistence in WebView:** NextAuth stores JWT in an httpOnly cookie. `sharedCookiesEnabled={true}` on iOS and `CookieManager` on Android keep the session alive inside the WebView across app restarts — tested in Phase 1.

### Existing Assets (Already Built in `quizzard/`)

- Next.js 15 App Router, ~143 API routes
- Prisma + Postgres (Supabase hosted)
- NextAuth (email/pw, Google OAuth shipped, Apple OAuth partially wired)
- Canvas with stylus barrel-button → eraser (`src/components/notebook/InfiniteCanvas.tsx:245-272`)
- Socket.io cowork server (`quizzard/ws-server.ts`)
- AI routes: `ai-inline`, chat messages, flashcard generation, quiz generation, page generation
- Full onboarding wizard (`src/components/onboarding/OnboardingWizard.tsx` with AccountStep, UsernameStep, AvatarStep, GoalsStep — PaymentStep will be deleted)
- Waitlist (`app/waitlist/page.tsx` + `app/api/waitlist/route.ts`)
- Legal pages: `/privacy`, `/terms`, `/legal` (scaffold shipped, real content pending)
- Marketing pages: `/about`, `/contact`, `/docs`, `/pricing`, root landing page
- Cosmetics / gamification system
- Notebook sharing + DMs + groups
- Stripe scaffolding (to be deleted in Phase 4 — files listed there)

---

## Standing Architecture

**READ THIS BEFORE ANY PHASE.**

### Monorepo Structure

After Phase 0, the repo looks like this:

```
notemage/
├── apps/
│   ├── web/              # Next.js app (the current quizzard/ contents)
│   ├── mobile/           # Expo React Native shell (iOS WebView wrapper)
│   └── desktop/          # Electron shell (Windows .exe wrapper)
├── packages/
│   └── shared/           # Shared TypeScript types (bridge protocol, entitlement shapes)
├── plans/                # This file and future plans
├── brand_assets/         # Logos, icons, color guides
├── pnpm-workspace.yaml
├── package.json          # workspace root
└── README.md
```

**Package manager:** pnpm workspaces. Root `package.json` declares workspaces; each app has its own `package.json` with local deps.

### Tech Stack

- **Backend / web:** Next.js 15 App Router, TypeScript, Prisma, Postgres, NextAuth
- **iOS shell:** Expo + `react-native-webview` + continuous native generation (`npx expo prebuild`). Opens `ios/` in Xcode for Pencil testing and native module work.
- **Windows shell:** Electron + `electron-builder` + `electron-updater`
- **IAP abstraction:** RevenueCat (iOS)
- **MoR (Windows):** Paddle or Lemon Squeezy (TBD, see Phase 7 for decision)
- **CI/CD:** GitHub Actions — Windows runners for Electron builds, macOS runners or EAS for iOS builds
- **Code signing:** Azure Trusted Signing (~$10/mo) for Windows `.exe`; Apple Developer Program ($99/yr) for iOS

### Native Bridge Protocol

Both the iOS shell and the Windows shell expose the same JS-callable bridge to the web app loaded inside them. The web app feature-detects the bridge and falls back to web-native behavior when loaded in a regular browser.

**Bridge API (same on both platforms):**

```typescript
// packages/shared/src/bridge.ts
export interface NativeBridge {
  isNative(): boolean;
  platform(): 'ios' | 'windows' | 'web';

  // Auth / account
  signInWithApple(): Promise<{ idToken: string; user: AppleUser }>;

  // IAP
  getProducts(): Promise<Product[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  getEntitlement(): Promise<Entitlement>;

  // UX affordances
  haptic(style: 'light' | 'medium' | 'heavy'): void;
  share(content: { url: string; title: string }): Promise<void>;
  openExternal(url: string): void;
  requestBiometricUnlock(): Promise<boolean>;

  // Push notifications
  registerPush(): Promise<{ token: string }>;

  // Pencil (iOS only, no-op on Windows)
  onPencilTap(callback: () => void): () => void; // returns unsubscribe
}
```

**Implementation pattern:**
- Web side (`apps/web/src/lib/native-bridge.ts`) exports a singleton that checks `window.ReactNativeWebView` (iOS) or `window.electronBridge` (Windows) and routes calls appropriately
- iOS shell (`apps/mobile/src/bridge.ts`) injects a JS handler via `postMessage` / `injectedJavaScript`
- Electron shell (`apps/desktop/src/preload.ts`) exposes `window.electronBridge` via `contextBridge`
- When neither is present → `isNative() === false`, and every method falls back to a web implementation or no-op

### Entitlement Source of Truth

The backend DB (`apps/web/` Prisma schema) is the single source of truth for user tier and quota state.

**New `Subscription` model (added in Phase 4):**

```prisma
model Subscription {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])

  tier            Tier     // FREE | PRO | PLUS
  source          Source   // APPLE_IAP | PADDLE | LEMON_SQUEEZY | MANUAL
  externalId      String?  // RevenueCat app user ID, Paddle subscription ID, etc.

  startedAt       DateTime @default(now())
  expiresAt       DateTime?
  autoRenew       Boolean  @default(true)
  canceledAt      DateTime?

  // Quota tracking
  dailyQuotaUsed  Int      @default(0)
  quotaResetAt    DateTime @default(now())

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("subscriptions")
}

enum Tier { FREE PRO PLUS }
enum Source { APPLE_IAP PADDLE LEMON_SQUEEZY MANUAL }
```

**Flow:**
- User purchases via iOS IAP → RevenueCat webhook hits `/api/webhooks/revenuecat` → we upsert the `Subscription` row
- User purchases via Windows Paddle → Paddle webhook hits `/api/webhooks/paddle` → same upsert
- Every AI API route reads `Subscription.tier` and `Subscription.dailyQuotaUsed` before accepting the request

### Budget Reality

| Cost | When | Amount |
|---|---|---|
| Apple Developer Program | Before Phase 2 (native hooks need it for prod push) | $99/year |
| RevenueCat | Phase 6 — free tier covers you until $2,500 MRR | $0 |
| Paddle / Lemon Squeezy | Phase 7 — free signup, fees on real sales only | $0 |
| Azure Trusted Signing | Phase 9 (CI/CD) — only when actually shipping `.exe` | ~$10/mo |
| Electron-updater infra | Phase 9 — GitHub Releases, free | $0 |
| GitHub Actions | Throughout — free tier covers all needed builds | $0 |
| iPad + Apple Pencil | Phase 1 — only if you don't own one | $0–$730 |

**Minimum to start Phase 0 and Phase 1:** $0 (free Apple ID works for initial iPad device testing; paid Developer Program can be deferred until Phase 2).

---

# Phases

## Phase 0 — Monorepo Conversion

### Goal

Convert the flat `quizzard/` Next.js repo into a pnpm-workspace monorepo with `apps/web/`, ready for `apps/mobile/` and `apps/desktop/` to be added in later phases.

### Prerequisites

- Clean working tree (commit or stash everything before starting)
- Node 20+ and pnpm 9+ installed locally
- Familiarity with where `quizzard/` lives: `/Users/toprakdemirel/Entwicklung/Quizzard/quizzard/`

### Context You Need (Beyond Standing)

The current repo layout has `quizzard/` as the Next.js app, with `brand_assets/` and `plans/` at siblings or inside. After this phase, `quizzard/` becomes `apps/web/`, the Next.js app moves there, and `brand_assets/` and `plans/` move up to the monorepo root.

### Implementation Steps

1. **Create the monorepo root structure**

   From `/Users/toprakdemirel/Entwicklung/Quizzard/`:

   ```bash
   mkdir -p apps packages
   git mv quizzard apps/web
   ```

2. **Move shared directories to the root**

   ```bash
   git mv apps/web/plans ./plans
   git mv apps/web/brand_assets ./brand_assets || true   # if it's in the subdir
   ```

   (If `brand_assets/` was already at the outer level, skip that line.)

3. **Create `pnpm-workspace.yaml` at the root**

   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```

4. **Create root `package.json`**

   ```json
   {
     "name": "notemage",
     "private": true,
     "version": "0.0.0",
     "scripts": {
       "dev:web": "pnpm --filter web dev",
       "build:web": "pnpm --filter web build",
       "lint": "pnpm -r lint",
       "typecheck": "pnpm -r typecheck"
     },
     "devDependencies": {
       "typescript": "^5.6.0"
     },
     "packageManager": "pnpm@9.12.0"
   }
   ```

5. **Update `apps/web/package.json`**

   - Change `"name"` to `"web"`
   - Keep all existing deps
   - Ensure scripts are still `"dev": "next dev"`, `"build": "next build"`, etc.

6. **Create `packages/shared/package.json`** (empty package, will be populated in later phases)

   ```json
   {
     "name": "@notemage/shared",
     "version": "0.0.0",
     "main": "./src/index.ts",
     "types": "./src/index.ts"
   }
   ```

   And `packages/shared/src/index.ts`:

   ```typescript
   export {};
   ```

7. **Reinstall dependencies**

   ```bash
   rm -rf node_modules apps/web/node_modules
   pnpm install
   ```

8. **Update any references to `quizzard/` in tooling**

   Search the repo for hardcoded `quizzard/` paths:

   ```bash
   grep -r "quizzard" --include="*.json" --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.md"
   ```

   Update CI configs, deploy configs, scripts. Most references should now say `apps/web/` or just rely on the workspace root.

9. **Update Vercel deployment settings**

   Vercel needs to know the project root is now `apps/web/`. In the Vercel dashboard:
   - Root Directory: `apps/web`
   - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`

10. **Commit**

    ```bash
    git add -A
    git commit -m "chore(monorepo): convert to pnpm workspaces with apps/web"
    ```

### Verification

- [ ] `pnpm dev:web` starts the Next.js dev server correctly
- [ ] `pnpm build:web` builds without errors
- [ ] Vercel preview deploys successfully from the new structure
- [ ] `apps/web/prisma/schema.prisma` still resolves at runtime (Prisma client generation works)
- [ ] All existing API routes still work in local dev
- [ ] Legal pages (`/privacy`, `/terms`, `/legal`) still render
- [ ] Waitlist still accepts signups
- [ ] Git history preserved for moved files (`git log --follow apps/web/app/page.tsx` shows the full history)

### Gotchas

- **`git mv` is essential** — don't copy-paste files, use `git mv` so history is preserved
- **Prisma client generation** — if Prisma generates into a custom location, the path resolution may change after the move. Run `pnpm --filter web exec prisma generate` after the move.
- **Environment variables** — Vercel env vars don't move automatically; they stay attached to the Vercel project and should still apply since you're just changing the root directory setting
- **Next.js `next.config.ts` path resolution** — if it references `../` paths to grab configs, those break. Check and fix.
- **IDE workspaces** — VS Code workspace files may need updating to include the new `apps/` and `packages/` folders

---

## Phase 1 — iOS Shell: WebView MVP

### Goal

Create `apps/mobile/`, an Expo React Native app that wraps `https://notemage.app` in a `WKWebView`, runs on a physical iPad via USB, and persists NextAuth login across app restarts. This is the foundation for all iOS work.

### Prerequisites

- Phase 0 complete (monorepo structure in place)
- Xcode installed on macOS
- An Apple ID (free, no paid Developer Program needed for this phase)
- A physical iPad with USB connection
- Working NextAuth auth flow on `https://notemage.app` (existing)

### Context You Need (Beyond Standing)

**Why WebView wrap is the right architecture for Notemage:**
- Existing Next.js frontend already has canvas, flashcards, quizzes, AI, cowork — rewriting in SwiftUI would throw away months of work
- NextAuth JWT-in-httpOnly-cookie persists inside `WKWebView` out of the box
- Modern WKWebView on Apple Silicon iPads handles Pencil, canvas, animations at near-native performance
- Hybrid later is always possible — we can introduce native views for specific screens (e.g. the canvas) without abandoning the WebView

**The "continuous native generation" workflow:** `npx expo prebuild` generates `ios/` and `android/` directories from the Expo config. This means:
- `ios/NotemageMobile.xcworkspace` opens in Xcode like any normal native iOS project
- You can run on a physical iPad over USB for Apple Pencil testing (`npx expo run:ios --device`)
- You can add Swift files for custom native modules (used in Phase 2 for `UIPencilInteraction`)
- Every Expo package (notifications, haptics, biometric) still works as CocoaPods
- EAS Build still works for cloud CI builds (used in Phase 9)

This is the modern recommended Expo workflow for projects that need both Expo ergonomics and Xcode access.

### Implementation Steps

1. **Scaffold the Expo app**

   From the monorepo root:

   ```bash
   cd apps
   npx create-expo-app mobile --template blank-typescript
   cd mobile
   ```

2. **Install required dependencies**

   ```bash
   npx expo install react-native-webview expo-constants expo-splash-screen react-native-safe-area-context
   ```

3. **Configure `apps/mobile/app.json`**

   ```json
   {
     "expo": {
       "name": "Notemage",
       "slug": "notemage-mobile",
       "version": "0.1.0",
       "orientation": "default",
       "icon": "./assets/icon.png",
       "scheme": "notemage",
       "userInterfaceStyle": "automatic",
       "splash": {
         "image": "./assets/splash.png",
         "resizeMode": "contain",
         "backgroundColor": "#0e0d20"
       },
       "assetBundlePatterns": ["**/*"],
       "ios": {
         "supportsTablet": true,
         "bundleIdentifier": "app.notemage.mobile",
         "infoPlist": {
           "ITSAppUsesNonExemptEncryption": false
         }
       },
       "web": {
         "favicon": "./assets/favicon.png"
       }
     }
   }
   ```

4. **Write `apps/mobile/app/index.tsx` (the root screen)**

   ```tsx
   import { WebView } from 'react-native-webview';
   import { SafeAreaView } from 'react-native-safe-area-context';
   import { StyleSheet, StatusBar } from 'react-native';

   const TARGET_URL = 'https://notemage.app';

   export default function App() {
     return (
       <SafeAreaView style={styles.container}>
         <StatusBar barStyle="light-content" />
         <WebView
           source={{ uri: TARGET_URL }}
           style={styles.webview}
           sharedCookiesEnabled={true}
           thirdPartyCookiesEnabled={true}
           domStorageEnabled={true}
           javaScriptEnabled={true}
           allowsInlineMediaPlayback={true}
           allowsBackForwardNavigationGestures={true}
           mediaPlaybackRequiresUserAction={false}
           pullToRefreshEnabled={true}
           scalesPageToFit={false}
         />
       </SafeAreaView>
     );
   }

   const styles = StyleSheet.create({
     container: { flex: 1, backgroundColor: '#0e0d20' },
     webview: { flex: 1, backgroundColor: '#0e0d20' },
   });
   ```

5. **Run prebuild to generate native `ios/` directory**

   ```bash
   npx expo prebuild --clean
   ```

   This creates `apps/mobile/ios/` with a real Xcode workspace.

6. **Open in Xcode and set signing team**

   ```bash
   open ios/NotemageMobile.xcworkspace
   ```

   - Select the project in the left sidebar
   - Under "Signing & Capabilities", set "Team" to your Personal Team (free Apple ID)
   - Change the bundle ID if needed to something unique (free accounts require unique bundle IDs per session)

7. **Connect a physical iPad via USB and trust the Mac**

   - Unlock the iPad, plug it into the Mac, tap "Trust" on the iPad when prompted
   - In Xcode's device list, select your iPad as the run target

8. **Build and run on the physical iPad**

   ```bash
   npx expo run:ios --device
   ```

   Select your iPad from the prompt. First build takes 3–5 minutes. After install, you may need to manually "trust" the developer certificate on the iPad:

   - Settings → General → VPN & Device Management → select your Apple ID → Trust

9. **Launch the app on the iPad**

   - Tap the Notemage icon on the iPad home screen
   - Verify the splash screen appears, then the WebView loads `https://notemage.app`
   - Log in via NextAuth (email/pw or Google OAuth — Sign in with Apple comes in Phase 4)
   - Force-quit the app (swipe up from the home indicator)
   - Reopen — verify you're still logged in (cookies persisted ✓)

### Verification

- [ ] App installs and launches on a physical iPad
- [ ] WebView loads `https://notemage.app` with the marketing landing page
- [ ] NextAuth login (email/pw or Google) works inside the WebView
- [ ] Cookies persist across force-quit + relaunch
- [ ] Canvas renders inside a notebook and accepts touch input
- [ ] **Apple Pencil input draws on the canvas with pressure variation** (critical perf check)
- [ ] Scrolling, zooming, tapping all feel responsive
- [ ] Safe area is respected (no content behind the notch or home indicator)
- [ ] Socket.io cowork session connects successfully from a second browser

### Gotchas

- **Free Apple ID limitations:** Apps installed from Xcode with a free Apple ID **expire after 7 days** and you can only have 3 apps active at once per device. This is fine during Phase 1 (you're rebuilding constantly anyway), but you'll want the $99 Developer Program before Phase 2.
- **`sharedCookiesEnabled` is mandatory** — without it, NextAuth sessions don't persist in the WebView
- **`iOS 17+ iPad` needs `webkit-tap-highlight-color: transparent` on the web side** to avoid the blue tap flash that looks unnative
- **Bundle ID collisions** — if you reuse a bundle ID already used for another free provisioning build, Xcode errors out. Use something unique like `app.notemage.mobile.dev.<your-initials>` during development.
- **Pencil perf canary** — if Pencil input feels laggy even at this stage, note it and flag it; we'd switch that screen to a native `PKCanvasView` in a hybrid move. This is the single biggest risk of the WebView approach and the whole point of testing Phase 1 on a real device before going further.

---

## Phase 2 — iOS Shell: Polish + Native Hooks

### Goal

Transform the Phase 1 WebView from "loads a website" into "feels like a native iOS app" by adding safe area handling, splash/loading screens, offline detection, error screens, and all native bridge integrations (push, share, biometric, Pencil gestures, deep links, external browser). This phase is what makes Apple's 4.2 "minimum functionality" reviewer accept the app.

### Prerequisites

- Phase 1 complete (app runs on iPad, WebView loads notemage.app, login persists)
- **Apple Developer Program enrollment ($99/year)** — required for production push notification certificates, real push tokens, proper code signing, and Sign in with Apple in production. Free Apple ID is no longer sufficient from this phase onward.
- Physical iPad for testing Pencil gestures

### Context You Need (Beyond Standing)

**Why this phase exists:** Apple rejects pure webview wrappers under guideline 4.2 ("Minimum Functionality"). To pass review, the app needs to offer native features that genuinely use the device's hardware and OS integrations. This phase ships those features.

**The bridge protocol** (defined in `packages/shared/src/bridge.ts` per Standing Architecture) routes calls from the web app → native shell. The web side feature-detects `window.ReactNativeWebView` and falls back to web-native behavior when not loaded inside the shell. This means the same Next.js code runs in three contexts: (a) inside the iOS WebView with bridge, (b) inside Electron with bridge, (c) in a plain browser without bridge.

**Feature support matrix:**

| Feature | Native package | Bridge method | Works in plain web too? |
|---|---|---|---|
| Haptics / vibration | `expo-haptics` | `haptic(style)` | Android only via `navigator.vibrate` |
| Push notifications | `expo-notifications` | `registerPush()` → token | No (iOS web push is PWA-only, unreliable) |
| Pencil drawing (pressure/tilt/palm-rejection) | none — `WKWebView` forwards pointer events | — | Yes, already works today via pointer events |
| Pencil double-tap / squeeze | custom Swift native module wrapping `UIPencilInteraction` | `onPencilTap(cb)` | No (no web API) |
| Stylus barrel button (Wacom/Adonit) | none | — | Yes, already handled at `InfiniteCanvas.tsx:245-272` |
| Face ID / Touch ID re-unlock | `expo-local-authentication` | `requestBiometricUnlock()` | No |
| Native share sheet | `expo-sharing` | `share({url, title})` | Partial (Android Web Share API) |
| Deep links (universal links) | `expo-linking` + `apple-app-site-association` | shell-side, routes `notemage://notebook/<id>` into WebView | No |
| External browser (OAuth, etc.) | `expo-web-browser` | `openExternal(url)` | Falls back to `window.open` |
| Splash screen | `expo-splash-screen` | shell-side only | No |

**Important clarifications:**
- **Face ID / Touch ID is not a login method.** It re-unlocks an existing NextAuth session after backgrounding. First sign-in on each device still uses email/password or Sign in with Apple.
- **Apple Pencil has no physical barrel button.** The existing barrel-button → eraser code in `InfiniteCanvas.tsx` supports third-party styluses (Wacom, Adonit, Logitech Crayon) and continues to work inside WKWebView unchanged. For Apple Pencil, we map **Pencil double-tap (Pencil 2)** and **squeeze (Pencil Pro)** to eraser via a custom Swift native module that wraps `UIPencilInteraction` and fires a bridge event.
- **Pencil drawing itself (pressure, tilt, palm rejection) already works in a WKWebView** — iPadOS Safari has had this for years and WKWebView uses the same engine. We don't need a native canvas; we only need the native module for the gestures that iOS doesn't expose to web.

### Implementation Steps

1. **Enroll in the Apple Developer Program**

   - Go to https://developer.apple.com/programs/
   - Enroll as an individual (or as the Swiss company if registered)
   - $99/year charge. Approval is usually instant for individuals, a few days for companies.
   - Once approved, update Xcode signing team to the paid team (not Personal Team)

2. **Install native hook packages**

   ```bash
   cd apps/mobile
   npx expo install expo-notifications expo-haptics expo-local-authentication expo-sharing expo-linking expo-web-browser expo-splash-screen @react-native-community/netinfo
   ```

3. **Define the shared bridge protocol**

   Create `packages/shared/src/bridge.ts` with the full TypeScript interface from Standing Architecture. Export it so both `apps/web` and `apps/mobile` can import it.

4. **Implement the shell-side bridge** (`apps/mobile/src/bridge.ts`)

   Handles incoming `postMessage` calls from the WebView and routes them to Expo APIs. Handles outgoing events (push notification received, pencil tap detected) by injecting JS back into the WebView.

5. **Implement the web-side bridge** (`apps/web/src/lib/native-bridge.ts`)

   Feature-detects `window.ReactNativeWebView`. Exposes the same `NativeBridge` interface. Falls back to no-op or web equivalent when the bridge is absent.

6. **Add safe area handling**

   Update `apps/mobile/app/index.tsx` to use `react-native-safe-area-context` properly, with status bar style adapting to dark/light theme.

7. **Add splash screen**

   Configure `expo-splash-screen` in `app.json` and the bridge: splash shows until the WebView's `onLoadEnd` fires (i.e., the web app has loaded enough to be interactive).

8. **Add offline detection and retry screen**

   Use `@react-native-community/netinfo` to detect when the device is offline. Show a native "Offline — Retry" screen instead of the browser's default offline error. Required for App Store 4.2 compliance.

9. **Add WebView crash handler**

   Catch `onError` and `onRenderProcessGone` events. Show a "Something went wrong — Reload" native screen. This alone helps with Apple 4.2.

10. **Implement push notifications**

    - Set up Apple Push Notification certificates in the Apple Developer portal (now that you have the paid program)
    - Use `expo-notifications` to request permission and fetch the token
    - `registerPush()` bridge method sends the token to `/api/devices/register-push` (new route, added in Phase 4)
    - Test receiving a push by triggering one from a test script — verify the notification shows on the iPad

11. **Implement native share sheet**

    - `share({url, title})` bridge method → Expo `Sharing.shareAsync`
    - Wire the web app's "Share this notebook" button to use the bridge when native, fall back to `navigator.share` when web

12. **Implement biometric re-unlock**

    - `requestBiometricUnlock()` → `expo-local-authentication`
    - Web side: when the app returns from background, prompt for biometric unlock before revealing the notebook content. Implement in `apps/web/src/lib/biometric-guard.ts`.

13. **Implement deep links**

    - Create `apps/web/public/.well-known/apple-app-site-association` with the universal link config
    - In `apps/mobile/app.json`, add `"associatedDomains": ["applinks:notemage.app"]`
    - Handle incoming `notemage://notebook/<id>` links by telling the WebView to navigate

14. **Implement custom Swift native module for Apple Pencil gestures**

    - Create `apps/mobile/ios/NotemageMobile/PencilInteractionModule.swift`
    - Wraps `UIPencilInteraction.preferredTapAction`
    - Fires `onPencilTap` events through the bridge
    - Register as a React Native turbo module
    - Web side: `apps/web/src/components/notebook/InfiniteCanvas.tsx` subscribes to `bridge.onPencilTap(() => toggleEraser())` when `bridge.isNative()` is true

15. **Update `apps/web/src/app/layout.tsx`**

    - Add `viewport-fit=cover` to the viewport meta tag (for notched iPads)
    - Ensure no desktop-only CSS leaks through

16. **Test every bridge method on a physical iPad**

    Run the app, trigger each native feature from the web UI, verify the native system UI appears (share sheet, biometric prompt, etc.)

### Verification

- [ ] App passes App Store 4.2 "minimum functionality" heuristic — has push, share, biometric, deep links, splash, offline screen, error screen
- [ ] Push notification received on a physical iPad → tap opens the app → deep link navigates to the right notebook
- [ ] Native share sheet opens when sharing a notebook
- [ ] Face ID re-unlock prompts correctly after backgrounding
- [ ] Apple Pencil double-tap toggles the eraser in the canvas (Pencil 2) — **verify on a real Pencil, not just the simulator**
- [ ] Universal link (`https://notemage.app/notebook/abc`) opens the native app if installed
- [ ] Offline screen shows when device is in airplane mode
- [ ] App reload from the offline screen works when connectivity restored
- [ ] Splash screen hides after the WebView finishes loading (no double-splash flash)
- [ ] Safe area respected on iPads with notches (Pro models) and without
- [ ] Haptic feedback fires on key UI interactions (button taps, successful saves)

### Gotchas

- **Push certificates are a rite of passage** — generating the APNs key and configuring it in the Apple Developer portal is finicky. Follow the Expo docs step-by-step; don't improvise.
- **Biometric unlock should be soft** — if the user declines or Face ID fails, fall back to the normal login screen, don't lock them out
- **`UIPencilInteraction` is Pencil 2+ only** — older Apple Pencils don't have tap actions. Guard the native module and no-op gracefully on Pencil 1.
- **Universal link config is double-sided** — both `app.json` (iOS side) and `.well-known/apple-app-site-association` (web side) must match exactly. Apple caches this aggressively; a misconfigured link may take hours to start working.
- **`WebView.onRenderProcessGone` is Android-only** — iOS WebView crashes don't fire that event. Listen for `onError` with specific iOS error codes instead.
- **Test push notifications on a real device** — push does NOT work in the iOS simulator.

---

## Phase 3 — Windows Electron Shell

### Goal

Create `apps/desktop/`, an Electron app that wraps `https://notemage.app`, runs on Windows, ships as an `.exe` installer, supports auto-update, and integrates with OS features (notifications, system tray, window state, auto-launch). Architecturally mirrors the iOS shell but on desktop.

### Prerequisites

- Phase 0 complete (monorepo structure in place)
- **Can start in parallel with Phases 1–2** — no dependency on iOS work
- Windows machine or VM for testing (can use GitHub Actions Windows runners if no local Windows available, but local testing is strongly preferred)
- Node 20+ and pnpm 9+

### Context You Need (Beyond Standing)

**Why Electron and not Tauri:**
- Electron is mature and well-documented, with a massive ecosystem
- `electron-builder` produces signed `.exe` installers with auto-update support out of the box
- `electron-updater` is the standard auto-update library and works with GitHub Releases as a free update server
- Tauri is smaller/lighter but less mature for the update flow and more Rust-dependent — defer as an optimization if Electron's bundle size becomes a real complaint
- The WebView wraps the same `https://notemage.app` URL, so there's zero frontend duplication between iOS shell and Windows shell

**Auto-update architecture:**
- User installs the `.exe` the first time from notemage.app download link
- Inside the app, `electron-updater` checks GitHub Releases on startup and every N hours
- When a new version is available, it downloads in the background and installs on next app restart
- No user action required. No App Store equivalent needed on Windows.

### Implementation Steps

1. **Scaffold the Electron app**

   From `apps/`:

   ```bash
   mkdir desktop
   cd desktop
   pnpm init
   pnpm add electron electron-builder electron-updater electron-log
   pnpm add -D @types/node typescript
   ```

2. **Create `apps/desktop/package.json`**

   ```json
   {
     "name": "desktop",
     "version": "0.1.0",
     "main": "dist/main.js",
     "scripts": {
       "build": "tsc",
       "start": "electron .",
       "dev": "electron . --dev",
       "pack": "electron-builder --dir",
       "dist": "electron-builder"
     },
     "build": {
       "appId": "app.notemage.desktop",
       "productName": "Notemage",
       "directories": { "output": "release" },
       "win": {
         "target": ["nsis"],
         "icon": "build/icon.ico",
         "publisherName": "Your Legal Name Here"
       },
       "nsis": {
         "oneClick": false,
         "allowToChangeInstallationDirectory": true,
         "perMachine": false,
         "deleteAppDataOnUninstall": false
       },
       "publish": [
         {
           "provider": "github",
           "owner": "YOUR_GH_USER",
           "repo": "notemage"
         }
       ]
     }
   }
   ```

3. **Create `apps/desktop/src/main.ts`** (the Electron main process)

   Implements:
   - `BrowserWindow` creation pointing at `https://notemage.app`
   - Window state persistence (size, position) via `electron-window-state`
   - Native menu bar with app-specific items
   - System tray integration (minimize to tray option)
   - `electron-updater` initialization and auto-check on startup
   - IPC handlers for bridge methods (share, open external, biometric unlock via Windows Hello, etc.)
   - Single-instance lock (prevents multiple copies running)

4. **Create `apps/desktop/src/preload.ts`** (the Electron preload script)

   Exposes `window.electronBridge` to the loaded web page via `contextBridge`. Implements the same `NativeBridge` interface from `packages/shared/src/bridge.ts`.

5. **Update `apps/web/src/lib/native-bridge.ts`** (web-side bridge)

   Add Electron detection: check `window.electronBridge` in addition to `window.ReactNativeWebView`. Route calls appropriately. `platform()` returns `'windows'` when running inside Electron.

6. **Implement native bridge methods on Windows**

   | Method | Windows implementation |
   |---|---|
   | `haptic()` | No-op (Windows has no universal haptic API) |
   | `registerPush()` | Windows Toast Notifications via `electron-notification` |
   | `share()` | Windows Share target via Windows Runtime APIs (node-ws integration) |
   | `openExternal()` | Electron `shell.openExternal()` |
   | `requestBiometricUnlock()` | Windows Hello via `node-ms-passport` or similar |
   | `signInWithApple()` | Opens the Apple OAuth flow in the default browser (not in an embedded webview — Apple blocks embedded) |
   | `getProducts()` / `purchase()` / `restorePurchases()` | Paddle / Lemon Squeezy checkout URLs opened in the default browser (see Phase 7) |

7. **Add icon and branding assets**

   Place the `.ico` file at `apps/desktop/build/icon.ico`. Generate from `brand_assets/` logo. Must be a multi-resolution `.ico` for best quality on all Windows display scales.

8. **Wire up `electron-updater`**

   In `main.ts`:

   ```ts
   import { autoUpdater } from 'electron-updater';
   import log from 'electron-log';

   autoUpdater.logger = log;
   autoUpdater.checkForUpdatesAndNotify();
   ```

   Configure the feed URL via `package.json` "publish" section (done in step 2). On Phase 9, GitHub Releases is the update feed.

9. **Build locally and test**

   ```bash
   pnpm --filter desktop dist
   ```

   Produces an unsigned `.exe` in `apps/desktop/release/`. Install it on a Windows machine and verify:
   - App launches, WebView loads notemage.app
   - Login persists across restarts
   - Window state persists across restarts
   - System tray icon works
   - Auto-update check runs at startup (will fail without a signed, published build — that's OK for local testing)

10. **Test bridge methods**

    Same as iOS Phase 2: trigger every bridge method from the web UI, verify the native system responds.

### Verification

- [ ] `.exe` installs cleanly on Windows 10 and Windows 11
- [ ] App launches, WebView loads `https://notemage.app`
- [ ] NextAuth login persists across restarts (cookies stored by Electron)
- [ ] Window state (size, position, maximized) persists across restarts
- [ ] System tray icon shows when minimized to tray
- [ ] Single-instance lock works (launching a second copy focuses the first)
- [ ] Windows Toast Notifications fire correctly
- [ ] Windows Hello biometric unlock works (if available on test machine)
- [ ] External links open in default browser, not in-app
- [ ] Canvas and Pencil input (on a Lenovo Yoga or similar stylus laptop) work smoothly

### Gotchas

- **Unsigned `.exe` triggers SmartScreen warning.** This is fine during local development but blocks real distribution. Signing is Phase 9's job — don't try to ship unsigned.
- **Auto-update requires the SAME code signing cert across versions.** If you sign with Azure Trusted Signing in Phase 9 and later change certs, existing installs break their update path. Pick a cert provider and commit.
- **Electron `BrowserWindow` uses a separate Chromium cookie store from the system browser.** That's expected — the user logs in inside the Electron window, not in their default browser.
- **Stylus on Windows laptops is more variable than on iPad.** Wacom AES, N-trig, MPP — each has slightly different pressure/tilt behavior. The existing `InfiniteCanvas.tsx` pointer event handling should work for all, but test on an actual Lenovo Yoga or Surface device if possible.
- **`contextIsolation: true`** in the Electron `BrowserWindow` config is mandatory for security. The preload script is the only way the web page can talk to Node APIs.
- **`nodeIntegration: false`** — the web page must NOT have direct Node access. Everything goes through the preload bridge.

---

## Phase 4 — Backend: Stripe Purge + Tier System + Sign in with Apple

### Goal

Delete all Stripe code from `apps/web/`, add a new `Subscription` model to the Prisma schema (tier + quota tracking), and fully wire up Sign in with Apple on the web side so both iOS and Windows shells can authenticate users cleanly.

### Prerequisites

- Phase 0 complete (monorepo in place)
- Apple Developer Program enrollment ($99, done in Phase 2 prep)
- Apple Service ID configured in the Apple Developer portal (used for Sign in with Apple on web)

### Context You Need (Beyond Standing)

**Why all three in one phase:** these three changes are intertwined.
- Stripe is dead code tied to the old subscription model — delete it before we add the new one
- The new `Subscription` model replaces Stripe's tier tracking — it has to be in place before Phase 5 (AI gating) can enforce it
- Sign in with Apple is partially scaffolded per the recent `auth` commit (`3ccde87`) — completing it now means it's ready for iOS/Windows IAP flows in Phases 6 and 7

**Stripe files to delete** (from the earlier audit):
- `apps/web/app/api/stripe/checkout/route.ts`
- `apps/web/app/api/stripe/checkout/status/route.ts`
- `apps/web/app/api/stripe/checkout/verify/route.ts`
- `apps/web/app/api/stripe/portal/route.ts`
- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/src/lib/stripe.ts`
- `apps/web/src/lib/stripe-client.ts`
- `apps/web/src/lib/stripe-fulfillment.ts`
- `apps/web/src/components/onboarding/PaymentStep.tsx`
- `stripeCustomerId` and `stripeSubscriptionId` columns in the `User` model (new migration to drop them)

### Implementation Steps

1. **Delete Stripe files**

   ```bash
   cd apps/web
   rm -rf app/api/stripe
   rm src/lib/stripe.ts src/lib/stripe-client.ts src/lib/stripe-fulfillment.ts
   rm src/components/onboarding/PaymentStep.tsx
   ```

2. **Remove PaymentStep from the onboarding wizard flow**

   Edit `apps/web/src/components/onboarding/OnboardingWizard.tsx`: remove the `PaymentStep` import and the step from the steps array. The wizard should now be: Account → Username → Avatar → Goals → Done. **Full wizard stays** (per the decision earlier).

3. **Remove Stripe package dependencies**

   ```bash
   cd apps/web
   pnpm remove @stripe/stripe-js stripe
   ```

4. **Add the `Subscription` model to Prisma schema**

   Edit `apps/web/prisma/schema.prisma` — add the `Subscription` model and `Tier` / `Source` enums per the Standing Architecture section. Remove `stripeCustomerId` and `stripeSubscriptionId` from the `User` model. Add `subscription Subscription?` relation.

5. **Generate and run the migration**

   ```bash
   cd apps/web
   npx prisma migrate dev --name subscription_model_and_remove_stripe
   ```

6. **Backfill existing users with a FREE tier subscription row**

   Create a one-time seed script (`apps/web/prisma/seed-subscriptions.ts`) that creates a `Subscription` row with `tier: FREE` for every existing user who doesn't have one. Run it once:

   ```bash
   npx tsx prisma/seed-subscriptions.ts
   ```

7. **Update `/api/user/tier/route.ts`** to read from the new `Subscription` model instead of Stripe data

8. **Update `/api/user/subscription/route.ts`** — strip Stripe cancel/change-plan logic, keep GET for tier display

9. **Wire up Sign in with Apple in NextAuth**

   Edit `apps/web/src/auth/config.ts` (or wherever NextAuth providers are configured):

   ```ts
   import AppleProvider from 'next-auth/providers/apple';

   providers: [
     // ...existing providers...
     AppleProvider({
       clientId: process.env.APPLE_ID!,
       clientSecret: process.env.APPLE_CLIENT_SECRET!,
     }),
   ]
   ```

   Ensure the Apple Service ID is correctly configured in the Apple Developer portal:
   - Service ID: `app.notemage.web` (or similar)
   - Primary App ID: `app.notemage.mobile` (from Phase 1)
   - Return URL: `https://notemage.app/api/auth/callback/apple`
   - Email relay: enabled
   - Private key (.p8): generated and converted to the JWT client secret per Apple's docs

10. **Set up environment variables in Vercel**

    - `APPLE_ID` — the Service ID
    - `APPLE_CLIENT_SECRET` — the generated JWT
    - `APPLE_TEAM_ID`
    - `APPLE_KEY_ID`
    - `APPLE_PRIVATE_KEY` (the .p8 key contents)

11. **Test Sign in with Apple end-to-end**

    - Click "Sign in with Apple" on notemage.app (web)
    - Verify the Apple OAuth flow opens and completes
    - Verify a new NextAuth user is created
    - Verify a `Subscription` row with tier `FREE` is created for the new user

12. **Update the `Subscription` creation hook**

    In NextAuth's `events.createUser` callback, automatically create a `Subscription` row with `tier: FREE` for every new user. This ensures the row always exists when needed.

13. **Commit**

    ```bash
    git add -A
    git commit -m "feat(subscriptions): replace Stripe with Subscription model + wire Sign in with Apple"
    ```

### Verification

- [ ] No references to `stripe` remain in `apps/web/` (grep check)
- [ ] `npx prisma migrate status` shows clean migration state
- [ ] New users get a `Subscription` row automatically with `tier: FREE`
- [ ] Existing users all have a `Subscription` row (seed script ran successfully)
- [ ] `/api/user/tier` returns the correct tier from the new model
- [ ] Sign in with Apple works on production `notemage.app`
- [ ] Apple login creates a new user with a FREE subscription
- [ ] Onboarding wizard completes all steps without PaymentStep
- [ ] Existing login flows (email/password, Google) still work
- [ ] No 500 errors in the admin dashboard from missing Stripe data

### Gotchas

- **The `APPLE_CLIENT_SECRET` is a JWT that expires every 6 months.** Apple requires re-generating it. Either:
  - Build a script that regenerates it automatically (cron job or Vercel scheduled function)
  - Or set a calendar reminder
  - Or use a library like `next-auth-apple` that regenerates transparently
- **Prisma migration on a production DB with existing data:** back up first (`pg_dump`), test the migration on a staging branch, then apply
- **The seed script is idempotent** — it checks if a subscription already exists before creating. Safe to re-run.
- **Admin dashboard may have Stripe-dependent queries** — check `app/api/admin/*` routes for references and update them to read from `Subscription` instead
- **Rollback plan:** if the migration breaks production, restore from backup. There's no gradual rollout for schema changes.

---

## Phase 5 — Backend: Server-Side AI Tier Gating + Quota Enforcement

### Goal

Add middleware to every AI-powered API route that checks the user's `Subscription.tier` and rejects calls that exceed the allowed tier or quota. Free users get zero AI access, Pro users get Haiku-only with daily quotas, Plus users get Sonnet/Opus with higher quotas. Enforcement is server-side only — the client is untrusted.

### Prerequisites

- Phase 4 complete (`Subscription` model exists, new users get FREE tier automatically)
- Clear tier definitions from Standing Context

### Context You Need (Beyond Standing)

**Why server-side enforcement is non-negotiable:** a jailbroken iOS device, a modified Electron build, or a determined attacker with DevTools can bypass any client-side tier check. The only reliable gate is at the API layer, before the request reaches Claude/OpenAI. Every AI call MUST pass through this middleware.

**Routes that need gating** (from the earlier audit):
- `apps/web/app/api/notebooks/[id]/pages/[pageId]/ai-inline/route.ts`
- `apps/web/app/api/notebooks/[id]/chats/[chatId]/messages/route.ts`
- `apps/web/app/api/notebooks/[id]/pages/[pageId]/generate/route.ts`

Plus any other AI-calling routes discovered during Phase 5 exploration. Do a `grep -r "anthropic\|openai\|@anthropic-ai\|@ai-sdk" apps/web/app/api/` to find them all.

**Tier rules enforced by the middleware:**

| Feature | Free | Pro | Plus |
|---|---|---|---|
| Flashcard generation | ❌ blocked | Haiku 4.5, 20/day | Sonnet 4.6, 100/day |
| Quiz generation | ❌ blocked | Haiku 4.5, 5/day | Sonnet 4.6, 30/day |
| AI tutor chat | ❌ blocked | Haiku 4.5, 30 msgs/day | Sonnet 4.6, 200 msgs/day |
| Inline AI (explain, simplify, expand) | ❌ blocked | Haiku 4.5, 30/day | Sonnet 4.6, 150/day |
| PDF chat | ❌ blocked | ❌ blocked | Sonnet 4.6, 10 docs/day |
| Voice notes transcription | ❌ blocked | ❌ blocked | 60 min/day |

Quotas are per-user, reset at 00:00 UTC daily. Quota counts stored in `Subscription.dailyQuotaUsed` (JSON or separate `QuotaUsage` table — decide in implementation).

### Implementation Steps

1. **Design the quota tracking schema**

   Option A: JSON column on `Subscription` with per-feature counters. Simpler, fewer migrations.
   Option B: Separate `QuotaUsage` table with `(userId, feature, date, count)` rows. Cleaner, more queryable for analytics.

   **Recommendation: Option B** — it's maybe 30 min more work but gives you analytics for free.

2. **Create `QuotaUsage` model in Prisma**

   ```prisma
   model QuotaUsage {
     id        String   @id @default(cuid())
     userId    String
     user      User     @relation(fields: [userId], references: [id])
     feature   String   // e.g. "flashcard_gen", "tutor_chat", "quiz_gen"
     date      DateTime @db.Date // UTC date only
     count     Int      @default(0)

     @@unique([userId, feature, date])
     @@index([userId, date])
   }
   ```

   Migration: `npx prisma migrate dev --name quota_usage_tracking`

3. **Create the tier-gate middleware**

   `apps/web/src/lib/ai-tier-gate.ts`:

   ```ts
   export interface TierGateOptions {
     feature: 'flashcard_gen' | 'quiz_gen' | 'tutor_chat' | 'inline_ai' | 'pdf_chat' | 'voice_transcription';
     tierQuotas: {
       PRO: { model: 'haiku' | 'sonnet'; limit: number } | null;
       PLUS: { model: 'haiku' | 'sonnet'; limit: number };
     };
   }

   export async function gateAIRequest(
     userId: string,
     options: TierGateOptions
   ): Promise<GateResult> {
     // 1. Fetch subscription
     // 2. Check tier — FREE blocked, PRO/PLUS allowed based on options
     // 3. Fetch today's quota usage for this feature
     // 4. If under limit, increment and return { allowed: true, model }
     // 5. If over, return { allowed: false, reason: 'quota_exceeded' }
   }
   ```

4. **Apply the gate to each AI route**

   Example for `apps/web/app/api/notebooks/[id]/pages/[pageId]/ai-inline/route.ts`:

   ```ts
   import { gateAIRequest } from '@/lib/ai-tier-gate';

   export async function POST(req: NextRequest, { params }: Props) {
     const session = await getServerSession();
     if (!session) return unauthorized();

     const gate = await gateAIRequest(session.user.id, {
       feature: 'inline_ai',
       tierQuotas: {
         PRO: { model: 'haiku', limit: 30 },
         PLUS: { model: 'sonnet', limit: 150 },
       },
     });

     if (!gate.allowed) {
       return NextResponse.json(
         {
           error: gate.reason,
           upgradeRequired: gate.currentTier === 'FREE',
           quotaExceeded: gate.reason === 'quota_exceeded',
         },
         { status: 402 }
       );
     }

     // Call AI with the model returned by the gate
     const result = await callAnthropic({
       model: gate.model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
       // ...
     });

     return NextResponse.json(result);
   }
   ```

5. **Handle the 402 response on the client**

   When the API returns 402 with `upgradeRequired: true` (user is FREE), show the upgrade CTA:
   - On iOS: trigger the IAP flow via bridge
   - On Windows: open the Paddle/Lemon Squeezy checkout via bridge
   - On web (plain browser): show "Upgrade in the iOS or Windows app" interstitial

6. **Add a daily quota reset job**

   Not strictly needed with the `QuotaUsage` table design (each day has its own row, so "today's count" is always fresh). No cron job required. Old rows can be pruned monthly via a separate cleanup job.

7. **Test the gate on every feature**

   - Create a FREE user → try every AI feature → verify 402 response
   - Upgrade to PRO manually (set `Subscription.tier = 'PRO'` in DB) → verify Haiku is used and quotas decrement
   - Burn through the daily quota → verify quota_exceeded response
   - Upgrade to PLUS → verify Sonnet is used and higher quotas apply

8. **Add quota status endpoint**

   `GET /api/user/quota` returns the user's current tier, today's usage per feature, and remaining limits. Used by the client to show "X of Y generations remaining today" in the UI.

### Verification

- [ ] Every AI-calling route in `apps/web/app/api/` has the tier gate applied (grep check for `gateAIRequest`)
- [ ] FREE user gets 402 on every AI feature
- [ ] PRO user can use Haiku features up to daily limit, then gets quota_exceeded
- [ ] PLUS user can use Sonnet features at higher limits
- [ ] Quota usage persists across requests and resets correctly at midnight UTC
- [ ] Client-side 402 handling shows the right upgrade CTA per platform (iOS → IAP, Windows → Paddle, web → interstitial)
- [ ] `/api/user/quota` returns accurate remaining limits
- [ ] No AI API call is possible without passing through the gate (verified by reading each route's code)

### Gotchas

- **Race conditions on quota increment** — two simultaneous requests from the same user could both see "count = 29" and both proceed. Use a DB transaction with SELECT FOR UPDATE or an atomic increment with a CHECK constraint to prevent this.
- **Don't trust the client for quota counts** — always re-fetch from DB at the start of the gate
- **Haiku vs Sonnet model name mapping** — the gate returns a tier label, the route maps it to the actual Anthropic model ID. Keep this mapping in one place to avoid drift.
- **Streaming responses** — if you use SSE/streaming for the tutor chat, the gate still has to run BEFORE the stream opens. Increment the quota at the start, not at completion.
- **"Generous" quotas in early access** — consider a flag that temporarily doubles all quotas during the first 30 days post-launch for goodwill. Controlled via an env var.

---

## Phase 6 — iOS IAP (RevenueCat + Apple StoreKit)

### Goal

Integrate Apple In-App Purchase via RevenueCat on the iOS shell. Users can tap "Upgrade" inside the app → Apple's native IAP sheet appears → they subscribe to Pro or Plus → RevenueCat webhook updates the backend → their entitlement changes → AI features unlock.

### Prerequisites

- Phase 2 complete (iOS shell has bridge + native hooks)
- Phase 4 complete (`Subscription` model exists)
- Phase 5 complete (tier gate blocks FREE users, ready to unlock PRO/PLUS)
- Apple Developer Program active ($99/year)
- Apple agreements signed in App Store Connect (Paid Apps Agreement specifically — required for IAP)

### Context You Need (Beyond Standing)

**Why RevenueCat:**
- Abstracts the StoreKit 2 API (which is notoriously tricky)
- Handles receipt validation server-side
- Sends webhooks to our backend on every purchase, renewal, cancellation, refund
- Free tier covers us until $2,500 MRR — zero cost during launch
- Same SDK works for future Android (when we expand)
- Replaces the need to write your own server-side IAP validation

**The IAP product model on Apple:**
- Apple products are defined in App Store Connect: a Product ID, a Price, a Subscription Group
- Pro and Plus are in the same Subscription Group (so users can "upgrade" from Pro to Plus without losing days)
- Two products per tier: `pro_monthly`, `pro_yearly`, `plus_monthly`, `plus_yearly`
- Prices are set per App Store region (USD, EUR, GBP, CHF, JPY, etc.) — Apple auto-converts

**The purchase flow:**
1. User taps "Upgrade to Pro" in the web UI
2. Web side detects `bridge.isNative() === true` and calls `bridge.purchase('pro_monthly')`
3. iOS shell bridge calls RevenueCat `Purchases.purchasePackage(...)`
4. RevenueCat calls Apple StoreKit, Apple shows the native IAP sheet
5. User confirms, Apple charges their Apple ID
6. StoreKit receipt → RevenueCat validates it → RevenueCat entitlement becomes "pro_entitlement"
7. RevenueCat fires a webhook to our `/api/webhooks/revenuecat` route
8. Our backend upserts the `Subscription` row with `tier: PRO`
9. Client refreshes its entitlement (via `bridge.getEntitlement()` or a `/api/user/tier` poll)
10. AI features unlock, gate now allows the requests

### Implementation Steps

1. **Create IAP products in App Store Connect**

   - Log in to App Store Connect → My Apps → Notemage → In-App Purchases
   - Create a Subscription Group called "Notemage Premium"
   - Add products:
     - `pro_monthly` — $TBD/month, level 1 in group
     - `pro_yearly` — $TBD/year, level 1 in group
     - `plus_monthly` — $TBD/month, level 2 in group
     - `plus_yearly` — $TBD/year, level 2 in group
   - Fill in metadata (display name, description, screenshots) for each
   - Submit for review — this takes 1–3 days the first time

2. **Set up RevenueCat**

   - Create account at https://revenuecat.com
   - Create a project called "Notemage"
   - Add the iOS app with bundle ID `app.notemage.mobile`
   - Upload the Apple App Store Connect API key (for receipt validation)
   - Configure Entitlements: `pro_entitlement` → [pro_monthly, pro_yearly], `plus_entitlement` → [plus_monthly, plus_yearly]
   - Configure Offerings: one offering with two packages (Pro and Plus), each with monthly and yearly durations

3. **Install RevenueCat SDK in the iOS shell**

   ```bash
   cd apps/mobile
   npx expo install react-native-purchases
   ```

   Note: `react-native-purchases` needs `expo prebuild` to be re-run because it adds native iOS dependencies.

4. **Initialize RevenueCat in the iOS shell**

   `apps/mobile/src/revenuecat.ts`:

   ```ts
   import Purchases from 'react-native-purchases';

   export function initRevenueCat(appUserId: string) {
     Purchases.configure({
       apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!,
       appUserID: appUserId, // our internal user ID, linked to NextAuth
     });
   }
   ```

   Call `initRevenueCat(user.id)` as soon as the WebView receives the logged-in user info via bridge message.

5. **Implement the purchase bridge methods**

   - `getProducts()` → `Purchases.getOfferings()` → map to bridge Product type
   - `purchase(productId)` → `Purchases.purchasePackage(package)` → returns success/fail
   - `restorePurchases()` → `Purchases.restorePurchases()` → returns active entitlements
   - `getEntitlement()` → `Purchases.getCustomerInfo()` → returns current tier

6. **Set up the RevenueCat webhook handler on the backend**

   `apps/web/app/api/webhooks/revenuecat/route.ts`:

   ```ts
   export async function POST(req: NextRequest) {
     const signature = req.headers.get('authorization');
     // Verify signature against REVENUECAT_WEBHOOK_SECRET

     const event = await req.json();

     switch (event.type) {
       case 'INITIAL_PURCHASE':
       case 'RENEWAL':
         await upsertSubscription({
           userId: event.app_user_id,
           tier: event.product_id.startsWith('plus_') ? 'PLUS' : 'PRO',
           source: 'APPLE_IAP',
           externalId: event.original_transaction_id,
           expiresAt: new Date(event.expires_date_ms),
           autoRenew: true,
         });
         break;

       case 'CANCELLATION':
         await markSubscriptionCanceled(event.app_user_id);
         break;

       // ... handle EXPIRATION, BILLING_ISSUE, etc.
     }

     return NextResponse.json({ received: true });
   }
   ```

7. **Configure the webhook URL in RevenueCat**

   Dashboard → Integrations → Webhooks → add `https://notemage.app/api/webhooks/revenuecat` with the shared secret from env

8. **Update the web-side pricing page CTA flow**

   When `bridge.isNative() && bridge.platform() === 'ios'`, clicking "Get Pro" triggers `bridge.purchase('pro_monthly')` instead of the old Stripe checkout.

9. **Test end-to-end in the App Store Sandbox**

   - Create a sandbox tester in App Store Connect
   - Log into the sandbox account on your iPad (Settings → App Store → Sandbox Account)
   - Build and run the app in Debug mode
   - Tap "Upgrade to Pro"
   - Verify the sandbox IAP sheet appears
   - Complete the purchase
   - Verify RevenueCat dashboard shows the test purchase
   - Verify the webhook fires and updates the `Subscription` row
   - Verify the client now sees `tier: PRO` and AI features unlock

10. **Handle edge cases**

    - User purchases, then immediately force-quits → webhook still fires, subscription still updates
    - User on airplane mode tries to purchase → RevenueCat queues the call, retries when online
    - User cancels mid-purchase → no charge, no webhook, no state change
    - User upgrades from Pro to Plus → Apple handles the proration, RevenueCat fires a product change event, backend updates

### Verification

- [ ] Sandbox purchase of each product (pro_monthly, pro_yearly, plus_monthly, plus_yearly) works
- [ ] Webhook handler receives and processes each event type
- [ ] `Subscription` table updates correctly with tier, expiresAt, externalId
- [ ] AI tier gate allows the upgraded user through
- [ ] Restore purchases works on a fresh install (user logs in with same Apple ID, taps Restore, gets their tier back)
- [ ] Cancellation flow: cancel in Settings → verify webhook → verify `Subscription.canceledAt` is set → user still has access until `expiresAt`
- [ ] Upgrade from Pro to Plus mid-period: prorated correctly by Apple, backend reflects new tier
- [ ] All RevenueCat webhook events are logged for debugging

### Gotchas

- **IAP doesn't work in the iOS simulator** — you MUST test on a real iPad with a sandbox Apple ID
- **First-time IAP setup in App Store Connect takes multiple days** — the Paid Apps Agreement must be signed and active, banking info must be verified. Start this admin work in parallel with development.
- **Sandbox Apple ID receipts look slightly different from production** — don't hardcode receipt parsing, trust RevenueCat
- **RevenueCat webhook retries on failure** — your handler must be idempotent. Use the `event_id` field for dedup.
- **The `app_user_id` must match your internal user ID** — or you can't link the purchase to the right account. Pass it during `Purchases.configure()` and never change it for a given user.
- **App Review will test IAP** — the reviewer logs in with a test account and attempts to purchase. Make sure IAP works in the submitted build, not just locally.

---

## Phase 7 — Windows IAP (Paddle or Lemon Squeezy)

### Goal

Integrate a Merchant of Record (MoR) for Windows subscriptions. Users click "Upgrade" in the Electron app → a checkout page opens in their default browser → they pay via card/PayPal → MoR webhook updates the backend → their entitlement changes. MoR handles all VAT/sales tax compliance globally.

### Prerequisites

- Phase 3 complete (Electron shell runs, bridge works on Windows)
- Phase 4 complete (`Subscription` model exists)
- Phase 5 complete (tier gate enforces access)
- Swiss business banking info for MoR payout setup

### Context You Need (Beyond Standing)

**Why a MoR instead of direct Stripe:**
- We're a Swiss operator selling globally → we'd otherwise need VAT registration in every country we sell to (Swiss ESTV, EU One-Stop Shop, UK HMRC, Australia, and so on)
- MoR services (Paddle, Lemon Squeezy) legally become the seller of record. They collect payment, remit taxes in every jurisdiction, and pay us the net revenue
- Fee is ~5% of revenue — negligible compared to the complexity they remove
- Only applicable to the Windows channel; iOS goes through Apple IAP (Apple is already a MoR for iOS purchases)

**Paddle vs Lemon Squeezy — the decision:**

| Criterion | Paddle | Lemon Squeezy |
|---|---|---|
| Fee | ~5% + $0.50/txn | 5% + $0.50/txn |
| Subscription support | First-class | First-class (added post-acquisition by Stripe in 2024) |
| UI / DX | Enterprise-leaning | Indie-leaning, cleaner dashboards |
| SDK maturity | More mature | Newer but adequate |
| Global tax coverage | Full | Full |
| Currency support | 20+ currencies with auto-conversion | Similar |

**Recommendation: Paddle** for subscription maturity and a decade of subscription-focused product work. Lemon Squeezy is also fine — pick whichever has a dashboard UI you prefer. The integration work is similar for both.

### Implementation Steps

(This phase is written generically so either Paddle or Lemon Squeezy works. Substitute the specific SDK as needed once you pick one.)

1. **Sign up and verify the MoR account**

   - Create account, provide Swiss business info
   - Submit banking info for payouts
   - Verify domain ownership of `notemage.app`
   - Wait for approval (usually 1–3 days, longer for some verticals)

2. **Create products in the MoR dashboard**

   Same product structure as iOS: `pro_monthly`, `pro_yearly`, `plus_monthly`, `plus_yearly`. Set prices consistent with the iOS IAP equivalents. Currencies: USD, EUR, CHF, GBP default.

3. **Generate checkout links**

   The MoR provides either:
   - Hosted checkout URLs (simple: just open the URL in browser, they handle the rest)
   - Or an inline overlay SDK (more complex, requires embedding in the app)

   **Use hosted checkout URLs** — they're simpler and the external-browser flow works better for Electron anyway (keeps payment out of our app context).

4. **Implement the purchase bridge method on Windows**

   `apps/desktop/src/main.ts` IPC handler:

   ```ts
   ipcMain.handle('bridge:purchase', async (_event, productId: string, userId: string) => {
     const checkoutUrl = `https://checkout.notemage.app/buy/${productId}?user_id=${userId}`;
     await shell.openExternal(checkoutUrl);
     return { opened: true };
   });
   ```

   The checkout URL contains the user ID so the webhook can link the payment to the right account. Optionally, use a signed JWT instead of raw user ID for security.

5. **Set up the webhook handler**

   `apps/web/app/api/webhooks/paddle/route.ts` (or `/lemon-squeezy/route.ts`):

   ```ts
   export async function POST(req: NextRequest) {
     // Verify signature
     const event = await req.json();

     if (event.event_type === 'subscription.created' || event.event_type === 'subscription.updated') {
       await upsertSubscription({
         userId: event.custom_data.user_id,
         tier: event.data.product_id.startsWith('plus_') ? 'PLUS' : 'PRO',
         source: 'PADDLE', // or 'LEMON_SQUEEZY'
         externalId: event.data.subscription_id,
         expiresAt: new Date(event.data.current_billing_period_ends_at),
       });
     } else if (event.event_type === 'subscription.canceled') {
       await markSubscriptionCanceled(event.custom_data.user_id);
     }
     // ... other events

     return NextResponse.json({ received: true });
   }
   ```

6. **Configure the webhook URL in the MoR dashboard**

   Point it at `https://notemage.app/api/webhooks/paddle` (or lemon-squeezy). Set the shared secret in env vars.

7. **Implement the entitlement refresh flow**

   After checkout, the user's default browser shows a "Thank you" page from the MoR. The Electron app can't see when they're done. Two options:

   Option A (simple): Poll `/api/user/tier` every 5 seconds after opening the checkout URL. Stop polling after 5 minutes or when tier changes.

   Option B (better): Use a deep link — the MoR's success page redirects to `notemage://purchase-complete?session_id=xxx`. Register `notemage://` as a protocol handler in Electron. When the deep link fires, refresh the entitlement.

   **Use Option A for Phase 7, add Option B as polish later.** Deep links on Windows are more fiddly than on iOS.

8. **Implement restore purchases**

   Windows users rarely need this (their entitlement is tied to their account, not their device), but for parity with iOS:
   - `bridge.restorePurchases()` → calls `/api/user/tier` → returns current tier
   - If tier is PRO or PLUS, that's the restore — no MoR API call needed

9. **Test end-to-end**

   - Log into Notemage Windows app as a FREE user
   - Click "Upgrade to Pro"
   - Verify checkout URL opens in the default browser
   - Complete payment with a test card (MoR provides test cards in sandbox mode)
   - Verify webhook fires and updates the `Subscription` row
   - Verify the app refreshes and shows PRO tier, AI features unlock

10. **Verify tax compliance**

    - Check that the checkout page shows the correct VAT for the user's country (MoR auto-detects)
    - Check that invoices include all required legal details (MoR generates these)
    - Confirm MoR is filing on your behalf — this should be in your MoR contract, don't assume

### Verification

- [ ] Sandbox purchase via Paddle/Lemon Squeezy test cards works
- [ ] Webhook handler processes subscription events correctly
- [ ] `Subscription` row updates with `source: PADDLE` (or `LEMON_SQUEEZY`) and correct tier
- [ ] Windows app polls tier correctly and unlocks features after purchase
- [ ] Tax shown at checkout matches user's country
- [ ] MoR invoice is generated with correct buyer info and VAT
- [ ] Cancellation flow: user cancels in MoR customer portal → webhook → `Subscription.canceledAt` set → access until `expiresAt`
- [ ] Upgrade from Pro to Plus mid-period works (MoR handles proration)

### Gotchas

- **MoR approval takes time** — start the signup/verification process early, even before Phase 3 is done, so it's ready when you need it
- **Test card numbers only work in sandbox mode** — switch to production keys only when you're ready to actually charge
- **Webhook signature verification is critical** — anyone can POST to your webhook URL, only signed requests should be trusted
- **`custom_data` is how you pass user ID through the checkout flow** — both Paddle and Lemon Squeezy support it. Read their docs for the exact field name.
- **Polling for entitlement refresh is a minor UX hiccup** — if this becomes a complaint, implement the deep link path (Option B above)
- **Currency mismatches** — if iOS shows the user $9.99 in USD and Windows shows them CHF 10.50, that's fine — Apple and Paddle convert independently. Just verify the prices roughly match across platforms so users don't feel scammed.

---

## Phase 8 — Web-Side Pricing Rework + Upgrade Flow

### Goal

Replace the web pricing page's Stripe-based upgrade CTAs with platform-aware "Download for iOS" / "Download for Windows" / "Upgrade in app" flows. Update upsell toasts, onboarding upsells, and any UI that assumed web payment. The web is now purely a marketing and login-companion surface — it never takes payment.

### Prerequisites

- Phases 4, 5, 6, 7 complete (tier system in place, IAP works on both platforms)
- Native bridge available on iOS and Windows (calls `bridge.purchase(...)`)

### Context You Need (Beyond Standing)

**What changes conceptually:**
- The web `/pricing` page stops being a purchase funnel and becomes a marketing comparison page
- "Upgrade" buttons across the web app need to route differently depending on platform detection:
  - **On iOS WebView:** call `bridge.purchase(productId)` → native Apple IAP sheet
  - **On Windows Electron:** call `bridge.purchase(productId)` → opens Paddle checkout in browser
  - **On plain web browser:** show an interstitial "Download the app to upgrade" with download CTAs
- The onboarding wizard already lost PaymentStep in Phase 4 — new users land on FREE and upgrade later from within the app

**Files to update** (from the earlier audit):
- `apps/web/app/pricing/page.tsx` — replace purchase CTAs
- `apps/web/src/components/pricing/PricingCard.tsx` — remove upgrade button logic
- `apps/web/src/components/pricing/FAQ.tsx` — add "Where do I subscribe?" Q&A
- `apps/web/src/components/pricing/PricingHero.tsx` — marketing copy update
- `apps/web/src/components/pricing/FeatureComparison.tsx` — keep feature table
- `apps/web/src/components/ui/UpsellToast.tsx` — change href from `/pricing` to platform-aware

### Implementation Steps

1. **Create a platform-aware upgrade trigger component**

   `apps/web/src/components/pricing/UpgradeButton.tsx`:

   ```tsx
   'use client';

   import { bridge } from '@/lib/native-bridge';
   import { useState } from 'react';
   import DownloadInterstitial from './DownloadInterstitial';

   interface Props {
     productId: 'pro_monthly' | 'pro_yearly' | 'plus_monthly' | 'plus_yearly';
     children: React.ReactNode;
   }

   export function UpgradeButton({ productId, children }: Props) {
     const [showInterstitial, setShowInterstitial] = useState(false);
     const [loading, setLoading] = useState(false);

     async function handleClick() {
       if (bridge.isNative()) {
         setLoading(true);
         try {
           const result = await bridge.purchase(productId);
           if (result.success) {
             // Refresh entitlement
             window.location.reload();
           }
         } finally {
           setLoading(false);
         }
       } else {
         setShowInterstitial(true);
       }
     }

     return (
       <>
         <button onClick={handleClick} disabled={loading}>
           {loading ? 'Processing...' : children}
         </button>
         {showInterstitial && (
           <DownloadInterstitial
             onClose={() => setShowInterstitial(false)}
             context={`upgrade_${productId}`}
           />
         )}
       </>
     );
   }
   ```

2. **Create the download interstitial component**

   `apps/web/src/components/pricing/DownloadInterstitial.tsx`:

   Modal with two big CTAs: "Download for iPad" (App Store link) and "Download for Windows" (link to `/download`). Copy: "Notemage subscriptions are managed inside the app. Download Notemage for your device to upgrade."

3. **Update `apps/web/app/pricing/page.tsx`**

   - Replace old Stripe CTAs in each pricing card with `<UpgradeButton productId={...}>`
   - Keep the feature comparison table as-is (it's purely informational)
   - Add a subtle banner at the top: "Manage your subscription in the Notemage iOS or Windows app. Browse features here, subscribe there."

4. **Update `apps/web/src/components/ui/UpsellToast.tsx`**

   - Change `href="/pricing"` to trigger the upgrade flow directly (via `UpgradeButton` logic)
   - If called from a plain web context, link to `/pricing` so users at least land on the comparison page

5. **Update `FAQ.tsx`** with new Q&A items:

   - "Where do I subscribe to Pro or Plus?" → "Inside the Notemage iOS or Windows app. The web version is a companion for existing paying users."
   - "Can I subscribe on the web?" → "No. Apple and Windows both have robust payment systems, and we use them directly. This keeps our pricing lower and your data safer."
   - "I subscribed on iOS but want to use Notemage on my Windows laptop. Will my subscription work?" → "Yes. Sign in with the same account on both. Your subscription is tied to your account, not your device."

6. **Create a `/download` landing page**

   `apps/web/app/download/page.tsx`:

   - Big hero with "Download Notemage"
   - Two cards: App Store badge (link), Windows download button (direct `.exe` link)
   - Brief "installing on Windows" instructions
   - Links to support for troubleshooting

7. **Update the main landing page (`app/page.tsx`)** with download CTAs alongside the existing waitlist CTA (or replacing it, depending on your launch timeline)

8. **Remove all remaining references to `/subscribe`, `/checkout`, `/billing`** that aren't core auth routes

   Grep for `checkout`, `subscribe`, `billing` in `apps/web/` and update or remove each reference.

9. **Test the flows**

   - On plain web browser: click "Upgrade to Pro" on pricing page → verify interstitial opens → verify both download CTAs work
   - On iOS WebView: click "Upgrade to Pro" → verify IAP sheet opens → verify purchase completes and entitlement refreshes
   - On Windows Electron: click "Upgrade to Pro" → verify Paddle checkout opens in default browser → verify purchase → verify app polls and picks up the new tier

### Verification

- [ ] `/pricing` page has no Stripe-dependent code
- [ ] `UpgradeButton` component routes correctly per platform
- [ ] Download interstitial appears for plain-web users who try to upgrade
- [ ] iOS WebView users can purchase via IAP from the pricing page
- [ ] Windows Electron users can purchase via MoR checkout from the pricing page
- [ ] `/download` page has working links to both stores / the `.exe`
- [ ] FAQ answers the "where do I subscribe" question clearly
- [ ] UpsellToast routes through the same platform-aware logic
- [ ] No references to `/subscribe` or `/checkout` remain in the codebase

### Gotchas

- **Don't hide the pricing page on iOS/Windows** — users may want to compare tiers before upgrading. Keep it visible; just route the CTAs to the native flow.
- **The interstitial shouldn't block casual browsing** — only trigger it when the user actually clicks Upgrade, not just visits `/pricing`
- **Ensure `bridge.isNative()` is reliable** — if the bridge fails to load, users see the interstitial instead of the native flow. Better to show the interstitial than fail silently.
- **Analytics event tracking** — wire up "upgrade clicked" events to distinguish native vs. interstitial flows. This tells you how many web visitors are bouncing at the download gate.

---

## Phase 9 — CI/CD Pipelines

### Goal

Set up automated build and release pipelines for both the iOS shell (via EAS or local Xcode) and the Windows Electron shell (via GitHub Actions + Azure Trusted Signing). Ensure every tagged release produces a signed, installable artifact ready for users.

### Prerequisites

- Phases 1–3 complete (both shells buildable locally)
- Apple Developer Program active
- GitHub account with a repository for the monorepo
- Azure account for Trusted Signing setup

### Context You Need (Beyond Standing)

**iOS CI/CD options:**

1. **EAS Build** (Expo's cloud service):
   - Free tier: 30 builds/month, sequential
   - Handles signing certificates, provisioning profiles, TestFlight submission
   - Submits directly to TestFlight from CI
   - Recommended for teams without a macOS build machine

2. **GitHub Actions macOS runners**:
   - Free for public repos, ~$0.08/min for private
   - Requires you to manage signing certs manually (upload as encrypted secrets)
   - More control, more setup pain

**Use EAS Build for Phase 9.** Stays free during launch (you won't hit 30 builds/month), and it handles the submission to TestFlight automatically. Revisit if you outgrow the free tier.

**Windows CI/CD:**
- GitHub Actions `windows-latest` runners build the Electron `.exe`
- Free: 2000 minutes/month for private repos, unlimited for public — more than enough
- Code signing via Azure Trusted Signing (certificate lives in Azure, CI pulls it via OIDC, no hardware token needed)
- Artifact uploaded to GitHub Releases
- `electron-updater` checks GitHub Releases on app startup

**Why Azure Trusted Signing over buying a cert:**
- Traditional EV certs ($300–500/year) now require a USB hardware token (YubiKey) which is impossible to use in CI
- OV certs ($75–200/year) don't have hardware token requirement but SmartScreen treats them with suspicion until reputation builds
- Azure Trusted Signing is a 2024+ service: ~$10/month, no hardware token, fully automatable, inherits trust from Microsoft's root CA
- Cheapest reliable option for a small team

### Implementation Steps

1. **Set up EAS Build for iOS**

   ```bash
   cd apps/mobile
   npx eas-cli login
   npx eas build:configure
   ```

   Generates `eas.json` with build profiles (development, preview, production).

2. **Configure `eas.json` profiles**

   ```json
   {
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal"
       },
       "production": {
         "autoIncrement": true
       }
     },
     "submit": {
       "production": {
         "ios": {
           "appleId": "your@email.com",
           "ascAppId": "1234567890",
           "appleTeamId": "XXXXXXX"
         }
       }
     }
   }
   ```

3. **Trigger a test EAS build**

   ```bash
   eas build --platform ios --profile production
   ```

   Uploads the repo, builds on EAS's Mac runners, produces a signed `.ipa`. Takes 15–30 minutes for the first build.

4. **Set up EAS Submit to push to TestFlight**

   ```bash
   eas submit --platform ios --latest
   ```

   Submits the latest build to TestFlight for internal testing.

5. **Create the Windows GitHub Actions workflow**

   `.github/workflows/build-desktop.yml`:

   ```yaml
   name: Build Windows App

   on:
     push:
       tags:
         - 'desktop-v*'

   jobs:
     build:
       runs-on: windows-latest
       steps:
         - uses: actions/checkout@v4

         - uses: pnpm/action-setup@v4
           with:
             version: 9

         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: pnpm

         - run: pnpm install --frozen-lockfile

         - name: Build Electron app
           run: pnpm --filter desktop dist
           env:
             GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
             AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
             AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
             AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}

         - name: Upload to GitHub Releases
           uses: softprops/action-gh-release@v2
           with:
             files: apps/desktop/release/*.exe
             tag_name: ${{ github.ref_name }}
   ```

6. **Set up Azure Trusted Signing**

   - Create an Azure account (if you don't have one)
   - Enable the Trusted Signing service (~$10/month)
   - Create a Code Signing Account
   - Create a Certificate Profile (Public Trust for code signing)
   - Grant the GitHub Actions service principal access via OIDC federation
   - Configure `apps/desktop/package.json` `build.win.signtoolOptions` to use Azure Trusted Signing

7. **Configure `electron-builder` to sign with Azure Trusted Signing**

   Add to `apps/desktop/package.json`:

   ```json
   "build": {
     "win": {
       "signtoolOptions": {
         "signingHashAlgorithms": ["sha256"],
         "rfc3161TimeStampServer": "http://timestamp.acs.microsoft.com"
       },
       "sign": "./scripts/sign-with-azure.js"
     }
   }
   ```

   Create `apps/desktop/scripts/sign-with-azure.js` that calls the Azure Trusted Signing CLI.

8. **Test the full pipeline**

   - Tag a commit: `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`
   - Watch GitHub Actions run the workflow
   - Verify `.exe` is produced and uploaded to GitHub Releases
   - Install the `.exe` on a Windows machine — verify no SmartScreen warning (or only a minor one that disappears after first few installs as reputation builds)
   - Verify `electron-updater` detects the release on app startup

9. **Set up the iOS build pipeline triggered from GitHub Actions (optional)**

   ```yaml
   name: Build iOS

   on:
     push:
       tags:
         - 'mobile-v*'

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
           with:
             version: 9
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: pnpm
         - run: pnpm install --frozen-lockfile
         - name: Trigger EAS Build
           run: pnpm --filter mobile exec eas build --platform ios --non-interactive --auto-submit
           env:
             EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
   ```

10. **Document the release process**

    Create `docs/release.md` with step-by-step instructions: how to tag, what the tag naming convention is, where to find the builds, how to promote from TestFlight to App Store.

### Verification

- [ ] `eas build --profile production` produces a signed `.ipa` for iOS
- [ ] `eas submit` uploads the `.ipa` to TestFlight successfully
- [ ] The TestFlight build is installable on a physical iPad
- [ ] GitHub Actions workflow runs on `desktop-v*` tag push
- [ ] Windows `.exe` is built, signed with Azure Trusted Signing, uploaded to GitHub Releases
- [ ] Signed `.exe` installs cleanly on Windows 10 and 11 without SmartScreen blocking
- [ ] `electron-updater` detects newer versions on app startup
- [ ] Auto-update downloads and installs the new version silently (or with user prompt)
- [ ] Release notes appear correctly in GitHub Releases

### Gotchas

- **Azure Trusted Signing takes 1–2 days to provision** — start the signup early
- **OIDC federation between GitHub Actions and Azure** — requires creating a federated identity credential in Azure AD, trickier than it sounds, but there are well-documented recipes
- **The first signed `.exe` still triggers SmartScreen** — reputation has to build. Submit the first release to Microsoft for early SmartScreen reputation if possible. Or expect a few users to click through "More info → Run anyway" during the first week.
- **EAS Build caching** — if you don't configure caching, builds take 15+ minutes each. Enable remote versioning and dep caching in `eas.json`.
- **Version number mismatch between iOS and Windows** — decide whether they share a version or diverge. Same version is simpler; diverging is more honest if you ship hotfixes on one platform.
- **TestFlight requires app metadata** — name, description, screenshots, keywords. Fill these in App Store Connect before your first EAS submit, or the submission bounces.

---

## Phase 10 — Launch Prep: TestFlight, Windows Download Page, App Store Submission

### Goal

Get the iOS app into TestFlight beta testing, publish the Windows `.exe` for public download from `notemage.app/download`, and submit the iOS app to App Store review. This phase ends with "the product is live."

### Prerequisites

- Phases 1–9 complete
- Pricing finalized in App Store Connect (products live, not in draft)
- Marketing assets ready: app icon, screenshots, app description, keywords
- Privacy policy and terms pages shipped (they are, per the earlier Legal phase)

### Context You Need (Beyond Standing)

**App Store review pitfalls to avoid:**
- **4.2 Minimum Functionality:** if the reviewer sees a thin wrapper around a website, they reject. Phase 2 mitigated this with push, share, biometric, Pencil, deep links — make sure all of these actually work during review.
- **3.1 Payments:** if the iOS app has any mention of web subscription or external payment, it gets rejected. The whole point of the MoR split is to keep those conversations separate. Double-check that no "Buy on web for cheaper" text leaks into the iOS build.
- **5.1.1 Data Collection:** the app privacy questionnaire on App Store Connect must match what the app actually does. Lying gets you auto-rejected when Apple scans the binary.
- **2.5.4 Background Modes:** we don't use background processing, so this shouldn't be an issue, but verify the Info.plist doesn't declare background modes we don't use.

**TestFlight flow:**
- Build uploaded via EAS → appears in TestFlight within ~30 min
- Internal testers (up to 100 people who are on your Apple Developer team): instant access, no review
- External testers (up to 10,000 people): Apple reviews the TestFlight build once, then subsequent builds go live instantly for external testers
- Use internal first (you and 2–3 friends), fix issues, then open to external

**Windows launch flow:**
- There is no "review" — you just publish the `.exe` and people download it
- First install triggers SmartScreen warning until reputation builds (might take a week of installs)
- Auto-update kicks in after first install

### Implementation Steps

1. **Fill in App Store Connect metadata**

   - App name, subtitle, description, keywords
   - Screenshots: 6.7" iPhone (tall), 12.9" iPad (tall), marketing URL
   - App privacy: fill in the questionnaire truthfully (you collect email, name, device ID for push, usage data; you use these for app functionality and analytics)
   - Age rating: 4+ (Notemage has no objectionable content)
   - Copyright, contact info

2. **Create the first TestFlight build**

   ```bash
   cd apps/mobile
   eas build --profile production
   # Wait for build to complete
   eas submit --platform ios --latest
   ```

   Check App Store Connect → TestFlight → Notemage → wait for processing (15–30 min).

3. **Add internal testers**

   Yourself + 2–3 close friends who own iPads. They receive a TestFlight email, install TestFlight, install Notemage.

4. **Run the internal beta for at least a week**

   Collect feedback. Fix critical bugs. Ship more EAS builds. Testers get updates automatically.

5. **Open external TestFlight**

   - Add an external testing group
   - Invite waitlist users (or a subset — maybe the first 50 who signed up)
   - First external build triggers a short TestFlight beta review — usually <24h
   - After approval, external testers install and test

6. **Fix any issues from external testing**

7. **Submit to the App Store for review**

   - In App Store Connect, click "Submit for Review"
   - Reviewer gets instructions: how to create an account, how to use the AI features, how to trigger an IAP test purchase with their demo account
   - Review typically takes 1–3 days for new apps
   - Expect at least one bounce — budget for two rounds of feedback

8. **Handle the typical review bounces**

   Common reasons:
   - Reviewer couldn't find how to upgrade → clarify in the reviewer notes
   - Privacy disclosure mismatch → update the questionnaire
   - Crash on launch → fix and resubmit

9. **Ship the Windows app**

   - Tag `desktop-v1.0.0` → GitHub Actions builds and signs → uploaded to GitHub Releases
   - Update `apps/web/app/download/page.tsx` with the GitHub Release asset URL
   - Announce via waitlist email (or whatever marketing channel you're using)

10. **Post-launch monitoring**

    - Sentry (if enabled) for error tracking
    - RevenueCat dashboard for subscription metrics
    - Vercel logs for backend errors
    - App Store Connect for iOS crash reports
    - GitHub Issues or Feedback button for user reports

### Verification

- [ ] TestFlight build is installable by internal testers
- [ ] Internal testers can log in, use core features, trigger IAP purchase (sandbox)
- [ ] External TestFlight group approved by Apple reviewer
- [ ] Waitlist users successfully install via external TestFlight
- [ ] App Store submission accepted (may require multiple rounds)
- [ ] App visible in App Store search and download works
- [ ] First IAP purchase on production App Store fires webhook and updates backend
- [ ] Windows `.exe` downloadable from `notemage.app/download`
- [ ] Windows app installs, runs, and can make a Paddle/Lemon Squeezy purchase
- [ ] Auto-update for the Windows app works (ship a v1.0.1 a few days after v1.0.0 to verify)

### Gotchas

- **Apple takes review seriously with first-time apps** — expect scrutiny. Be ready to explain every feature, especially AI-related ones (they ask about model, prompts, content policies)
- **IAP testing during review uses Apple's sandbox** — the reviewer won't actually charge their card, but the IAP flow must work with sandbox accounts
- **Marketing URL must be a real landing page, not just a waitlist** — Apple wants to see a product pitch. Your current landing page should work if it's post-waitlist.
- **App Store review notes are worth writing carefully** — say "here's a test account, here's how to upgrade, here's where the AI features are accessed" to speed up review
- **Windows SmartScreen reputation doesn't transfer across version numbers** — once v1.0.0 builds reputation, v1.0.1 inherits it. But if you change signing certs, you start over.
- **EAS Build quotas** — free tier has 30 builds/month. If you're iterating fast during review, you might hit the cap. Upgrade to paid ($19-99/month) if needed.
- **Don't launch on a Friday** — issues that crop up over the weekend are harder to fix and support

---

## Appendix: Open Questions and Future Work

### Pricing (TBD)

Exact prices for Pro and Plus are not yet decided. Placeholder ranges:
- Pro: $9.99–$14.99/mo, $89–$129/yr
- Plus: $19.99–$24.99/mo, $179–$229/yr

Decision points before Phase 6:
- Monthly vs annual split (20% annual discount is typical)
- Student discount via SheerID (~5–10% of revenue but helps positioning)
- Launch discount (early-bird 20% off for first 500 subscribers?)

### Free-Tier Retention Hook (TBD)

The open question from the strategic discussion: **what does a free user actually do for 10 minutes before bouncing?** Without a retention hook, the free tier is useless as a funnel and the whole freemium strategy collapses. Candidate hooks:
- Pre-built templates (Cornell notes, cheat sheet, flashcard decks)
- Manual flashcards + spaced repetition (competes directly with Anki)
- PDF import + manual annotation
- Exam calendar / study planner

This decision must be made before launch marketing starts (earlier phase track).

### Admin Dashboard Subscription Data Pipeline

The existing admin dashboard (`app/api/admin/*`) currently reads subscription stats from Stripe-derived data. Post-Phase 4, that pipeline is dead. Rebuild the admin views to read from the new `Subscription` model and MoR/IAP webhook data. Not critical for launch — can be deferred to a post-launch phase.

### Post-Launch Expansion

Ideas for "Phase 11+" once the product is live:
- Android app (React Native shell, similar to iOS but with Google Play IAP)
- macOS standalone native features (keyboard shortcuts, menu bar, etc.)
- Linux Electron build (small community, minimal extra work)
- Advanced cowork features (live video/audio for study groups)
- Cross-device sync improvements

---

## Quick Reference: What to Read Per Phase

If you're starting a fresh conversation to work on Phase N, minimum required reading:

- **All phases:** "Standing Context" + "Standing Architecture" sections at the top
- **Phase 0:** self-contained, just the Phase 0 section
- **Phase 1:** Phase 0 must be done, Phase 1 section
- **Phase 2:** Phase 1 must be done, Phase 2 section
- **Phase 3:** Phase 0 must be done, Phase 3 section (parallel to 1/2)
- **Phase 4:** Phase 0 must be done, Phase 4 section
- **Phase 5:** Phase 4 must be done, Phase 5 section
- **Phase 6:** Phases 2, 4, 5 must be done, Phase 6 section
- **Phase 7:** Phases 3, 4, 5 must be done, Phase 7 section
- **Phase 8:** Phases 6 or 7 (at least one) done, Phase 8 section
- **Phase 9:** Phases 2 and 3 done, Phase 9 section
- **Phase 10:** All previous phases done, Phase 10 section

Each phase section has its own "Prerequisites" callout at the top for double-checking.
