# Building MeditFin for Android

This project is an **Expo SDK 55** app. The `android/` directory is **not committed** (see `.gitignore`); it is generated locally with `expo prebuild` or produced in the cloud with **EAS Build**.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** | LTS (e.g. 20.x) — same as iOS development |
| **JDK** | **17** (Android Gradle Plugin expects JDK 17; use `JAVA_HOME` pointing at a JDK 17 install) |
| **Android Studio** | Latest stable — installs Android SDK, platform tools, and emulators |
| **Android SDK** | Via Android Studio → SDK Manager: install **Android 15 (API 35)** platform (matches `compileSdkVersion` / `targetSdkVersion` in `app.json`) |
| **Environment** | Add `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to your shell; ensure `platform-tools` is on `PATH` so `adb` works |

Optional but recommended:

- A physical **Android device** with USB debugging enabled (background work is easier to validate than on some emulators).

---

## 1. Install dependencies

From the repository root:

```bash
npm install
```

---

## 2. Generate the native Android project (local dev)

This creates `android/` from `app.json` and Expo plugins (e.g. `expo-router`, `expo-background-task`).

```bash
npm run prebuild:android
```

Or, to regenerate from scratch (wipes an existing `android/` folder):

```bash
npx expo prebuild --platform android --clean
```

**Note:** `android/` is gitignored. Each clone needs its own prebuild (or you rely entirely on EAS and never commit native sources).

---

## 3. Run on an emulator

1. Open **Android Studio** → **Device Manager** → create/start a virtual device (API 34+ is fine).
2. From the project root:

```bash
npm run android
```

This runs `expo run:android`, which builds the debug APK and installs it on the running emulator (or a connected device).

---

## 4. Run on a physical device (USB)

1. Enable **Developer options** → **USB debugging** on the phone.
2. Connect USB and accept the debugging prompt.
3. Confirm the device is visible:

```bash
adb devices
```

4. Run:

```bash
npm run android-device
```

(`expo run:android --device` — picks a connected device; use `--device <id>` if several are listed.)

---

## 5. Release builds with EAS (recommended)

Install and log in:

```bash
npm install -g eas-cli
eas login
```

The project already has an `extra.eas.projectId` in `app.json`. From the repo root:

| Goal | Command |
|------|---------|
| **Play Store bundle (AAB)** | `npm run build:android` — uses `eas.json` → `production` → `android.buildType: "app-bundle"` |
| **Installable APK (testing)** | `eas build --platform android --profile preview` — uses `preview` profile with `buildType: "apk"` |

After the build finishes, download the **.aab** or **.apk** from the Expo dashboard and install or upload to Play Console.

**Signing:** EAS can create and store a keystore for you on first Android production build (follow the CLI prompts). For Play Console you will need the upload key / app signing flow documented by Google.

---

## 6. Android-specific configuration (already in repo)

| Topic | What we did |
|-------|-------------|
| **Application ID** | `com.dcasafebot.app` (`android.package` in `app.json`) — change only if you ship under a different id |
| **Cleartext HTTP** | `usesCleartextTraffic: true` — needed for the default historical prices base URL (`http://prices.skyscraper.pro` in `lib/constants.ts`). For production, prefer **HTTPS** for that API and then you can turn cleartext off |
| **SDK levels** | `expo-build-properties`: `minSdkVersion` 26, `compileSdkVersion` / `targetSdkVersion` 35 |
| **Icon** | Adaptive icon uses `./assets/icon.png` with background `#030712` |

Background scheduling uses **expo-background-task** / WorkManager; exact timing is **not** wall-clock hourly — same class of constraints as on iOS.

---

## 7. Troubleshooting

### `Failed to resolve the Android SDK path` / `spawn adb ENOENT`

Expo looks for the SDK under **`~/Library/Android/sdk`** on macOS. If that folder does not exist, or `adb` is not on your `PATH`, you get these errors.

1. **Install [Android Studio](https://developer.android.com/studio)** and complete the first-run wizard so it downloads the **Android SDK**.
2. In Android Studio: **Settings / Preferences → Languages & Frameworks → Android SDK**. Copy the **Android SDK Location** (often `~/Library/Android/sdk`; yours may differ).
3. Add to your shell config (`~/.zshrc` on macOS), then **open a new terminal** or run `source ~/.zshrc`:

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   # If your SDK path from step 2 is different, use that path instead.
   export PATH="$PATH:$ANDROID_HOME/platform-tools"
   ```

4. Confirm:

   ```bash
   echo $ANDROID_HOME
   ls "$ANDROID_HOME/platform-tools/adb"
   adb version
   ```

5. Run again: `npm run android`

If `~/Library/Android/sdk` still does not exist after installing Android Studio, open **SDK Manager** in Android Studio and install at least one **SDK Platform** (e.g. Android 15 / API 35) so the directory is created.

### Other issues

| Symptom | What to try |
|---------|-------------|
| `SDK location not found` (generic) | Same as above: set **`ANDROID_HOME`** to the path shown in Android Studio’s SDK settings, and add **`$ANDROID_HOME/platform-tools`** to **`PATH`**. |
| Gradle / JDK errors | Ensure **JDK 17** is active (`java -version`). Android Studio can install an embedded JBR; point `JAVA_HOME` there if needed. |
| `expo run:android` cannot find device | `adb kill-server && adb start-server`, unlock phone, re-authorize USB debugging. |
| Metro connection issues on device | Shake device → Dev settings → configure bundler IP, or use `npx expo start` and scan QR for dev client workflow. |
| Cleartext / network errors | Confirm the prices API URL in **Settings**; if you use plain HTTP, keep `usesCleartextTraffic` or switch the server to HTTPS. |

---

## 8. iOS vs Android parity

- **Secrets:** `expo-secure-store` maps to the Android Keystore / encrypted storage — not the iOS Keychain, but same API in JS.
- **SQLite / positions:** Same `expo-sqlite` database file on device.
- **Scripts quick reference**

| Script | Action |
|--------|--------|
| `npm run android` | Debug build + run (emulator or default device) |
| `npm run prebuild:android` | Generate/update `android/` |
| `npm run build:android` | EAS production Android (AAB) |

For day-to-day app behavior, see the main [README](../README.md) and [howto.md](../howto.md).
