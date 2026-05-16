# MeditFin — How to use and test

This guide focuses on **day-to-day usage** and **how to verify** that Simulation, Portfolio, Settings, onboarding, and background execution behave as expected. For project overview and architecture, see [`README.md`](README.md).

## Disclaimer

**MeditFin is “vibe coded”** — built iteratively with AI-assisted development and human review, not as audited financial infrastructure. It is provided **strictly as-is**, **without warranty of any kind** (express or implied), including merchantability, fitness for a particular purpose, or non-infringement. **Do not use it with funds you cannot afford to lose.** You alone are responsible for keys, Safe configuration, chain interactions, taxes, and compliance. By running this software you accept all risks.

---

## First launch: wallet setup

### Option A — Setup wizard (recommended for new users)

1. Open the **Portfolio** tab.
2. If no Safe is configured, tap **Start setup** to open the onboarding flow.
3. Follow the steps: back up the **signer private key**, fund the **signer** with **Base ETH** (gas) and the **predicted Safe** with **USDC**, then **Deploy Safe**.
4. When finished, the app saves the Safe address and signer key and returns you to Portfolio.

### Option B — Manual configuration

1. Open **Settings**.
2. Enter **Safe Address** (Base), **Bot Private Key** (signer EOA stored in secure storage), and **RPC URL** if not using the default.
3. Set **DCA Strategy** (daily USDC for ETH/BTC, profit threshold %).
4. Optionally set **Prices API** base URL for historical prices used in Simulation / charts.
5. Tap **Save Settings**.
6. Use **Verify Safe on-chain** to confirm owners/threshold match expectations.

---

## Tab-by-tab usage

### Simulation

- Adjust **Strategy Parameters** and tap **Run Simulation**.
- Choose a **period** (90d … All) to slice historical data.
- **Sync history** (if shown in your build) fills the local SQLite cache from your configured prices API; without data, the app will prompt you to sync.
- Review summary cards, the **portfolio chart**, and either **Daily Coins / Leaves** or a **table** of positions depending on Display settings.
- Nothing here touches your real Safe; it is offline backtesting on cached prices.

### Portfolio

- Shows live balances when a Safe address and RPC work (WETH, cbBTC, USDC in the Safe).
- **Refresh** pulls latest config and recomputes the chart when history exists.
- **Run DCA Now** executes one full bot cycle on-chain: sells profitable positions, then daily buys (ETH + BTC in **one batched Safe transaction** when both legs run the same day).
- Same gamification / table toggle as in Settings (**Gamify positions**, **Leaves vs Coins**).

### Settings

- **Safe Wallet** — Safe address, bot key, RPC; **Verify Safe on-chain**.
- **DCA Strategy** — daily amounts and take-profit %.
- **Prices API** — backend URL for historical OHLC used by Simulation and portfolio timeline.
- **Background Bot** — registers iOS background processing (~hourly lower bound; actual timing is OS-dependent). Requires **Background App Refresh** and a real device for realistic behavior.
- **Display**
  - **Gamify positions** — coins/leaves vs plain table.
  - **Style** — **Coins** or **Leaves** (when gamification is on).
  - **Show Logs tab** — exposes the **Logs** tab (off by default).

### Logs (optional)

Enable **Show Logs tab** in Settings. Entries include manual runs and background runs: status, counts, expandable details and BaseScan-friendly transaction info where applicable.

---

## How to test

### 1. Simulation (no wallet required)

1. Open **Simulation**.
2. Run with default parameters; if you see “No price data”, sync historical prices (if available in UI) or ensure `Prices API` in Settings points at a reachable server and try again.
3. Change period and strategy values; confirm the chart and position list / coins update.
4. Toggle **Gamify positions** and **Leaves** in Settings and confirm Simulation UI switches between table and tokens.

### 2. Safe + manual DCA (integration test)

**Requirements:** Safe on Base with enough **USDC** for both daily amounts, signer with **ETH on Base** for gas, bot key as Safe owner with threshold met for `execTransaction`.

1. Complete onboarding or manual Settings.
2. **Portfolio → Run DCA Now**.
3. Confirm:
   - Success message lists buys/sells or skipped reasons (e.g. insufficient USDC).
   - **Portfolio** positions update after **Refresh**.
   - On BaseScan, the Safe shows the expected transaction(s); when both ETH and BTC buy on the same day, they should appear as **one** Safe execution batched via MultiSend.

### 3. Background task (iOS)

1. In **Settings**, turn **Hourly background check** **ON** (task registers on app launch as well, but the toggle reflects registration).
2. Confirm **Registered: Yes** and **iOS status: Available** when Background App Refresh allows it.
3. **Debug only:** tap **Run Background Task Now (debug)**. This only works in **development** builds (`expo run:ios`), not typical release/TestFlight builds.
4. After a run, open **Logs** (if enabled) or trigger another manual run and compare timestamps.

Expect **imprecise** scheduling: iOS may defer processing based on battery, focus, and usage—not wall-clock hourly.

### 4. Settings persistence

1. Toggle **Show Logs tab**, **Gamify positions**, and **Style**; navigate away and force-quit the app.
2. Relaunch and confirm toggles and tabs match expectations.

---

## Troubleshooting (quick)

| Symptom | Things to check |
|--------|------------------|
| Build fails after dependency changes | `npm install --legacy-peer-deps`; `npx expo install --fix`; clean `ios/` with `expo prebuild --clean -p ios` if needed. |
| No historical prices | **Prices API** URL, device network, HTTP vs HTTPS (ATS); server must allow your device. |
| Background never runs | Real device, Background App Refresh on, low power mode off; task is best-effort on iOS. |
| “Trigger failed” on debug button | Use a **debug** build; release builds cannot force-trigger the worker. |
| Second buy failed before (fixed in code) | Both daily buys are batched in one Safe tx when both assets run; update to latest `lib/swap.ts` / `lib/dca-runner.ts`. |

---

## Related docs

- [`README.md`](README.md) — product description, architecture, security.
- [`docs/sideloading.md`](docs/sideloading.md) — installing on device outside the App Store.

---


## Prerequisites

- **macOS**, **Xcode**, **Node 20+**, **npm**
- **CocoaPods** if you touch native iOS (`pod install`)
- An **iPhone** (recommended for background tasks) or the **iOS Simulator**; for **Android**, a device or emulator with USB debugging (see [`docs/ANDROID_BUILD.md`](docs/ANDROID_BUILD.md))

Install dependencies from the repo root:

```bash
npm install --legacy-peer-deps
```

---

## Run the app from the source

| Goal | Command |
|------|---------|
| Metro only | `npm start` |
| iOS Simulator (build + launch) | `npm run ios` or `npx expo run:ios` |
| Physical iPhone (USB) | `npm run ios-device` or `npx expo run:ios --device` |
| Android (after `npm run prebuild:android`) | `npm run android` or `npx expo run:android` |

Full Android / JDK / EAS checklist: **[`docs/ANDROID_BUILD.md`](docs/ANDROID_BUILD.md)**.

After changing native config (`app.json`, plugins), regenerate native projects when needed:

```bash
npx expo prebuild --clean -p ios
# or Android:
npx expo prebuild --clean -p android
```

Then open `ios/*.xcworkspace` in Xcode or run `npm run ios` again; for Android use Android Studio or `npm run android`.

---