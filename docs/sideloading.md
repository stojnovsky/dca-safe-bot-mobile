# iOS Sideloading Guide

Install the DCA Bot on your iPhone without the App Store.

---

## Prerequisites

- Mac with Xcode installed ([App Store](https://apps.apple.com/app/xcode/id497799835))
- iPhone plugged in via USB
- Free Apple ID (no paid developer account required for both options)

---

## Option 1 — Xcode Direct Install (simplest)

> Certificate expires every **7 days**. Re-run the install command to refresh.

### Setup (one-time)

1. Open Xcode → **Settings** → **Accounts** → add your Apple ID
2. After install, on iPhone go to **Settings → General → VPN & Device Management** → tap your developer certificate → **Trust**

### Install

```bash
cd dca-safe-bot-mobile
npx expo run:ios --device
```

Xcode signs the app with your free Apple ID and pushes it directly to the connected iPhone.

### Re-install after 7 days

Plug in iPhone and run the same command:

```bash
npx expo run:ios --device
```

---

## Option 2 — EAS Build + AltStore (auto-refresh)

Build a signed `.ipa` locally, then use AltStore to install and auto-refresh it every 7 days via Wi-Fi.

### Setup (one-time)

1. Install [AltStore](https://altstore.io) on your Mac and iPhone (follow their guide)
2. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login        # free Expo account
   eas build:configure
   ```

### Build

```bash
cd dca-safe-bot-mobile
eas build --platform ios --profile development --local
# outputs a .ipa file
```

### Install

Drag the `.ipa` into AltStore on your Mac — it installs over USB/Wi-Fi and auto-renews the certificate every 7 days as long as AltStore is running on your Mac.

---

## Option 3 — Apple Developer Account (permanent, $99/yr)

With a paid [Apple Developer](https://developer.apple.com/programs/) account the certificate is valid for **1 year** and background tasks are fully unrestricted.

```bash
# Build for ad-hoc distribution
eas build --platform ios --profile preview
```

Install the `.ipa` via Xcode, Apple Configurator 2, or AltStore — no re-signing needed for a year.

---

## Comparison

| | Option 1 (Xcode) | Option 2 (AltStore) | Option 3 (Developer) |
|---|---|---|---|
| Cost | Free | Free | $99/yr |
| Certificate validity | 7 days | 7 days (auto-renewed) | 1 year |
| Re-signing | Manual (USB) | Automatic (Wi-Fi) | Not needed |
| Background tasks | Full support | Full support | Full support |
| Setup difficulty | Easy | Medium | Easy |

**Recommendation:** Option 1 for quick testing, Option 2 for daily use without an Apple Developer account.

---

## Troubleshooting

### `xcrun: error: SDK "iphoneos" cannot be located`

Xcode CLI tools are active but the full Xcode SDK is not selected:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

### `No iOS devices available in Simulator.app`

No simulator runtime is installed. Open Xcode → **Settings (⌘,)** → **Platforms** → click **+** → select iOS → download (~5 GB). Then retry.

### `Untrusted Developer` on iPhone

Go to **Settings → General → VPN & Device Management** → tap your Apple ID under Developer App → tap **Trust**.

### App crashes on launch after 7 days

Certificate expired. Reconnect iPhone via USB and re-run:

```bash
npx expo run:ios --device
```
