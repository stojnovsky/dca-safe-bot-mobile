import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { Address, Hex } from 'viem';
import {
  deploySafe,
  formatEth,
  formatUsdc,
  generateSigner,
  getEthBalance,
  getUsdcBalance,
  predictSafeAddress,
  type Signer,
} from '@/lib/safe-deploy';
import {
  clearOnboardingDraft,
  getConfig,
  getOnboardingDraft,
  getPrivateKey,
  saveConfig,
  saveOnboardingDraft,
  savePrivateKey,
} from '@/lib/config-store';
import { privateKeyToAccount } from 'viem/accounts';
import { registerDcaTask } from '@/tasks/dca-task';
import { DEFAULT_RPC, ONBOARDING_MIN_ETH_WEI, ONBOARDING_MIN_USDC } from '@/lib/constants';

type Step = 'welcome' | 'backup' | 'fund' | 'deploying' | 'done';

const POLL_INTERVAL_MS = 5_000;

// Random uint256 used as the CREATE2 salt nonce so each install gets a unique Safe.
function randomSaltNonce(): bigint {
  const bytes = new Uint8Array(32);
  // crypto.getRandomValues is polyfilled at app entry (react-native-get-random-values).
  globalThis.crypto.getRandomValues(bytes);
  let hex = '0x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt(hex);
}

export default function OnboardingScreen() {
  const [step,          setStep]          = useState<Step>('welcome');
  const [rpcUrl,        setRpcUrl]        = useState<string>(DEFAULT_RPC);
  const [signer,        setSigner]        = useState<Signer | null>(null);
  const [saltNonce,     setSaltNonce]     = useState<bigint | null>(null);
  const [safeAddress,   setSafeAddress]   = useState<Address | null>(null);
  const [ethBalance,    setEthBalance]    = useState<bigint>(0n);
  const [usdcBalance,   setUsdcBalance]   = useState<bigint>(0n);
  const [deployError,   setDeployError]   = useState<string | null>(null);
  const [deployTx,      setDeployTx]      = useState<Hex | null>(null);
  const [busy,          setBusy]          = useState(false);
  const [acknowledged,  setAcknowledged]  = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 1. Bootstrap: resume an in-progress wizard if one exists, otherwise
  //      generate a fresh signer + predicted Safe address.
  useEffect(() => {
    (async () => {
      const cfg = await getConfig();
      const rpc = cfg.rpcUrl || DEFAULT_RPC;
      setRpcUrl(rpc);

      // Resume case: a draft + saved key from a previous unfinished session.
      const draft = await getOnboardingDraft();
      const savedPk = (await getPrivateKey()) as Hex | null;
      if (draft && savedPk) {
        try {
          const account = privateKeyToAccount(savedPk);
          if (account.address.toLowerCase() === draft.signerAddress.toLowerCase()) {
            setSigner({ privateKey: savedPk, address: account.address });
            setSaltNonce(BigInt(draft.saltNonce));
            setSafeAddress(draft.safeAddress as Address);
            setStep('fund'); // skip welcome + backup — they've already been through it
            return;
          }
        } catch { /* fall through to fresh generation */ }
      }

      // Fresh setup
      const s     = generateSigner();
      const nonce = randomSaltNonce();
      try {
        const predicted = await predictSafeAddress(s.address, nonce, rpc);
        setSigner(s);
        setSaltNonce(nonce);
        setSafeAddress(predicted);
      } catch (e) {
        Alert.alert(
          'Network error',
          `Could not reach Base RPC to prepare your Safe: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    })();
  }, []);

  // ── Funding poll: refresh signer ETH + Safe USDC every 5s while step==='fund' ──
  const refreshBalances = useCallback(async () => {
    if (!signer || !safeAddress) return;
    try {
      const [eth, usdc] = await Promise.all([
        getEthBalance(signer.address, rpcUrl),
        getUsdcBalance(safeAddress,  rpcUrl),
      ]);
      setEthBalance(eth);
      setUsdcBalance(usdc);
    } catch {
      // Silently retry on the next tick.
    }
  }, [signer, safeAddress, rpcUrl]);

  useEffect(() => {
    if (step !== 'fund') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    refreshBalances();
    pollRef.current = setInterval(refreshBalances, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [step, refreshBalances]);

  // ── Address utilities ──────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  // Called when the user advances past the backup screen. Persists the signer
  // key and draft so we can resume if the app is killed before deployment.
  const onBackupContinue = useCallback(async () => {
    if (!signer || safeAddress === null || saltNonce === null) return;
    try {
      await savePrivateKey(signer.privateKey);
      await saveOnboardingDraft({
        saltNonce:     saltNonce.toString(10),
        safeAddress,
        signerAddress: signer.address,
      });
      setStep('fund');
    } catch (e) {
      Alert.alert('Could not save key', e instanceof Error ? e.message : String(e));
    }
  }, [signer, safeAddress, saltNonce]);

  // ── Deploy flow ────────────────────────────────────────────────────────────
  const onDeploy = async () => {
    if (!signer || !safeAddress || saltNonce === null) return;
    setBusy(true);
    setDeployError(null);
    setStep('deploying');
    try {
      const { safeAddress: deployed, txHash } = await deploySafe(
        signer.privateKey,
        saltNonce,
        rpcUrl,
      );

      // Sanity check: the on-chain address must match what we predicted.
      if (deployed.toLowerCase() !== safeAddress.toLowerCase()) {
        throw new Error(
          `Predicted ${safeAddress} but deployed ${deployed}. Funds may need to be moved.`,
        );
      }

      await saveConfig({ safeAddress: deployed });
      await clearOnboardingDraft();
      setDeployTx(txHash);

      // Hourly task may have been unregistered before because there was no config.
      registerDcaTask().catch(() => {});

      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeployError(msg);
      setStep('fund'); // back to the funding screen so the user can retry / top up gas
    } finally {
      setBusy(false);
    }
  };

  const onClose = () => {
    if (step === 'deploying') return; // never close mid-deploy
    if (step === 'fund') {
      // The signer key + draft are already persisted. The wizard will resume
      // here the next time the user opens it, so closing is safe.
      Alert.alert(
        'Continue later?',
        'Your signer key and predicted Safe address are saved. Re-open setup from Portfolio to finish funding and deploy.',
        [
          { text: 'Stay here', style: 'cancel' },
          { text: 'Close',     onPress: () => router.back() },
        ],
      );
      return;
    }
    if (step === 'backup' && signer) {
      Alert.alert(
        'Cancel setup?',
        'Your generated key has not been saved yet. Cancelling now will discard it.',
        [
          { text: 'Keep setting up', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ],
      );
      return;
    }
    router.back();
  };

  // ── Step renderers ─────────────────────────────────────────────────────────
  const ethOk  = ethBalance  >= ONBOARDING_MIN_ETH_WEI;
  const usdcOk = usdcBalance >= ONBOARDING_MIN_USDC;
  const canDeploy = ethOk && usdcOk && !!signer && !!safeAddress && !busy;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.headerClose}>{step === 'done' ? '' : '✕'}</Text>
        </TouchableOpacity>
        <StepIndicator step={step} />
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 'welcome'   && <WelcomeStep onContinue={() => setStep('backup')} />}
        {step === 'backup'    && (
          <BackupStep
            signer={signer}
            acknowledged={acknowledged}
            onToggleAck={() => setAcknowledged((v) => !v)}
            onCopy={copyToClipboard}
            onContinue={onBackupContinue}
            onBack={() => setStep('welcome')}
          />
        )}
        {step === 'fund'      && (
          <FundStep
            signer={signer}
            safeAddress={safeAddress}
            ethBalance={ethBalance}
            usdcBalance={usdcBalance}
            ethOk={ethOk}
            usdcOk={usdcOk}
            deployError={deployError}
            onCopy={copyToClipboard}
            onDeploy={onDeploy}
            onBack={() => setStep('backup')}
            canDeploy={canDeploy}
          />
        )}
        {step === 'deploying' && <DeployingStep />}
        {step === 'done'      && (
          <DoneStep
            safeAddress={safeAddress!}
            txHash={deployTx}
            onFinish={() => router.replace('/(tabs)/portfolio')}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const order: Step[] = ['welcome', 'backup', 'fund', 'deploying', 'done'];
  const current = order.indexOf(step);
  return (
    <View style={styles.dots}>
      {order.map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
            i <  current && styles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <View>
      <Text style={styles.h1}>Set up your DCA vault</Text>
      <Text style={styles.p}>
        To run automated dollar-cost-averaging, MeditFin needs a{' '}
        <Text style={styles.strong}>Safe</Text> account on Base and a dedicated{' '}
        <Text style={styles.strong}>signer key</Text> that lives on this device.
      </Text>

      <View style={styles.card}>
        <Step n={1} title="Generate a signer">
          A new random private key is created on this phone and stored in the iOS Keychain.
        </Step>
        <Step n={2} title="Fund two addresses">
          Send ETH to the signer (for gas) and USDC to your future Safe (for DCA buys).
        </Step>
        <Step n={3} title="Deploy your Safe">
          The signer deploys a 1-of-1 Safe on Base. You keep custody — MeditFin never sees your funds.
        </Step>
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningTxt}>
          You will be shown the signer's private key.{'\n'}
          Back it up before continuing — it controls your Safe.
        </Text>
      </View>

      <PrimaryButton label="Get started" onPress={onContinue} />
    </View>
  );
}

function BackupStep(props: {
  signer:        Signer | null;
  acknowledged:  boolean;
  onToggleAck:   () => void;
  onCopy:        (s: string, label: string) => void;
  onContinue:    () => void;
  onBack:        () => void;
}) {
  const { signer, acknowledged, onToggleAck, onCopy, onContinue, onBack } = props;
  return (
    <View>
      <Text style={styles.h1}>Back up your signer key</Text>
      <Text style={styles.p}>
        Save this private key somewhere safe (password manager, encrypted note).
        If you lose your phone, this is the only way to recover the funds that
        live in your Safe.
      </Text>

      <Text style={styles.label}>Signer address</Text>
      <AddressBox
        value={signer?.address ?? ''}
        onCopy={(v) => onCopy(v, 'Signer address')}
        loading={!signer}
      />

      <Text style={[styles.label, { marginTop: 12 }]}>Private key</Text>
      <AddressBox
        value={signer?.privateKey ?? ''}
        onCopy={(v) => onCopy(v, 'Private key')}
        loading={!signer}
        secret
      />

      <TouchableOpacity style={styles.ackRow} onPress={onToggleAck} activeOpacity={0.7}>
        <View style={[styles.checkbox, acknowledged && styles.checkboxOn]}>
          {acknowledged && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.ackTxt}>
          I have backed up my private key. I understand losing it means losing access to my Safe.
        </Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <SecondaryButton label="Back" onPress={onBack} />
        <View style={{ width: 10 }} />
        <PrimaryButton label="Continue" onPress={onContinue} disabled={!acknowledged || !signer} />
      </View>
    </View>
  );
}

function FundStep(props: {
  signer:       Signer | null;
  safeAddress:  Address | null;
  ethBalance:   bigint;
  usdcBalance:  bigint;
  ethOk:        boolean;
  usdcOk:       boolean;
  deployError:  string | null;
  canDeploy:    boolean;
  onCopy:       (s: string, label: string) => void;
  onDeploy:     () => void;
  onBack:       () => void;
}) {
  const {
    signer, safeAddress, ethBalance, usdcBalance,
    ethOk, usdcOk, deployError, canDeploy, onCopy, onDeploy, onBack,
  } = props;

  const minEthStr  = formatEth(ONBOARDING_MIN_ETH_WEI, 4);
  const minUsdcStr = formatUsdc(ONBOARDING_MIN_USDC, 2);

  return (
    <View>
      <Text style={styles.h1}>Fund your addresses</Text>
      <Text style={styles.p}>
        Send funds to both addresses below. Your Safe address is reserved on-chain
        via CREATE2 — USDC sent there is safe even before the Safe is deployed.
      </Text>

      {/* Signer / gas */}
      <FundCard
        title="Signer · for gas"
        chip="Base · ETH"
        chipColor="#3b82f6"
        address={signer?.address ?? ''}
        onCopy={(v) => onCopy(v, 'Signer address')}
        balance={`${formatEth(ethBalance)} ETH`}
        threshold={`Need ≥ ${minEthStr} ETH`}
        ok={ethOk}
        instruction="Send native ETH on the Base network. You only need to do this once — gas is shared across all DCA buys."
      />

      {/* Safe / dca capital */}
      <FundCard
        title="Safe · DCA capital"
        chip="Base · USDC"
        chipColor="#22c55e"
        address={safeAddress ?? ''}
        onCopy={(v) => onCopy(v, 'Safe address')}
        balance={`${formatUsdc(usdcBalance)} USDC`}
        threshold={`Need ≥ ${minUsdcStr} USDC`}
        ok={usdcOk}
        instruction="Send USDC on the Base network. The bot will deduct your daily DCA amount from here every day."
      />

      <View style={styles.hint}>
        <Text style={styles.hintTxt}>
          Balances refresh every 5 seconds. You can leave this screen open while the transfer confirms.
        </Text>
      </View>

      {deployError && (
        <View style={styles.error}>
          <Text style={styles.errorTxt}>{deployError}</Text>
        </View>
      )}

      <View style={styles.row}>
        <SecondaryButton label="Back" onPress={onBack} />
        <View style={{ width: 10 }} />
        <PrimaryButton label="Deploy Safe" onPress={onDeploy} disabled={!canDeploy} />
      </View>
    </View>
  );
}

function DeployingStep() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={[styles.h1, { marginTop: 24 }]}>Deploying your Safe…</Text>
      <Text style={styles.p}>
        Submitting createProxyWithNonce on Base. This usually takes 2-5 seconds.
        Don't close the app.
      </Text>
    </View>
  );
}

function DoneStep({
  safeAddress, txHash, onFinish,
}: {
  safeAddress: Address;
  txHash:      Hex | null;
  onFinish:    () => void;
}) {
  return (
    <View>
      <View style={styles.successBadge}>
        <Text style={styles.successBadgeTxt}>✓</Text>
      </View>
      <Text style={[styles.h1, { textAlign: 'center' }]}>You're all set</Text>
      <Text style={[styles.p, { textAlign: 'center' }]}>
        Your Safe is live on Base. MeditFin will run a daily DCA buy automatically.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Your Safe address</Text>
        <Text selectable style={styles.mono}>{safeAddress}</Text>
        {txHash && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://basescan.org/tx/${txHash}`)}
            style={{ marginTop: 8 }}
          >
            <Text style={styles.link}>View deployment on BaseScan ↗</Text>
          </TouchableOpacity>
        )}
      </View>

      <PrimaryButton label="Open portfolio" onPress={onFinish} />
    </View>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberTxt}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{children}</Text>
      </View>
    </View>
  );
}

function AddressBox({
  value, onCopy, loading, secret,
}: {
  value:    string;
  onCopy:   (v: string) => void;
  loading?: boolean;
  secret?:  boolean;
}) {
  return (
    <View style={[styles.addrBox, secret && styles.addrBoxSecret]}>
      {loading ? (
        <Text style={styles.addrLoading}>Generating…</Text>
      ) : (
        <Text selectable style={styles.mono}>{value}</Text>
      )}
      <TouchableOpacity
        onPress={() => onCopy(value)}
        disabled={loading}
        style={styles.copyBtn}
      >
        <Text style={styles.copyTxt}>Copy</Text>
      </TouchableOpacity>
    </View>
  );
}

function FundCard(props: {
  title:        string;
  chip:         string;
  chipColor:    string;
  address:      string;
  balance:      string;
  threshold:    string;
  ok:           boolean;
  instruction:  string;
  onCopy:       (v: string) => void;
}) {
  const { title, chip, chipColor, address, balance, threshold, ok, instruction, onCopy } = props;
  return (
    <View style={styles.fundCard}>
      <View style={styles.fundHead}>
        <Text style={styles.fundTitle}>{title}</Text>
        <View style={[styles.chip, { borderColor: chipColor }]}>
          <Text style={[styles.chipTxt, { color: chipColor }]}>{chip}</Text>
        </View>
      </View>

      <Text style={styles.fundInstr}>{instruction}</Text>

      <AddressBox value={address} onCopy={onCopy} loading={!address} />

      <View style={styles.balanceRow}>
        <Text style={[styles.balanceVal, ok && styles.balanceValOk]}>{balance}</Text>
        <View style={styles.balanceMeta}>
          <Text style={styles.balanceThresh}>{threshold}</Text>
          <Text style={[styles.balanceStatus, ok ? styles.balanceStatusOk : styles.balanceStatusPending]}>
            {ok ? '● Funded' : '○ Waiting'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PrimaryButton({
  label, onPress, disabled,
}: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label, onPress, disabled,
}: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.secondaryBtn, disabled && styles.secondaryBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.secondaryBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#030712' },
  header:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#111827',
  },
  headerClose:    { color: '#9ca3af', fontSize: 22, width: 24, textAlign: 'center' },
  dots:           { flexDirection: 'row', gap: 6 },
  dot:            { width: 6,  height: 6, borderRadius: 3, backgroundColor: '#1f2937' },
  dotActive:      { width: 18, backgroundColor: '#3b82f6' },
  dotDone:        { backgroundColor: '#1e40af' },
  content:        { padding: 20, paddingBottom: 60 },
  center:         { alignItems: 'center', paddingTop: 60 },

  h1:             { fontSize: 22, color: '#fff', fontWeight: '700', marginBottom: 10 },
  p:              { fontSize: 14, color: '#9ca3af', lineHeight: 21, marginBottom: 18 },
  strong:         { color: '#fff', fontWeight: '600' },
  label:          { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  mono:           { color: '#e5e7eb', fontFamily: 'Menlo', fontSize: 12, lineHeight: 18 },

  card:           {
    backgroundColor: '#0b1220', borderColor: '#1f2937', borderWidth: 1, borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  stepRow:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stepNumber:     {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#1e3a8a',
    alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1,
  },
  stepNumberTxt:  { color: '#bfdbfe', fontSize: 12, fontWeight: '700' },
  stepTitle:      { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  stepBody:       { color: '#9ca3af', fontSize: 13, lineHeight: 19 },

  warning:        { backgroundColor: '#3f1d1d', borderRadius: 10, padding: 12, marginBottom: 16 },
  warningTxt:     { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
  hint:           { backgroundColor: '#0b1220', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#1f2937' },
  hintTxt:        { color: '#6b7280', fontSize: 12, lineHeight: 18 },
  error:          { backgroundColor: '#7f1d1d', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorTxt:       { color: '#fee2e2', fontSize: 13 },

  addrBox:        {
    backgroundColor: '#0b1220', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#1f2937',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  addrBoxSecret:  { borderColor: '#7f1d1d' },
  addrLoading:    { color: '#6b7280', fontStyle: 'italic', flex: 1 },
  copyBtn:        { backgroundColor: '#1f2937', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  copyTxt:        { color: '#93c5fd', fontSize: 11, fontWeight: '600' },

  ackRow:         { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, marginBottom: 22 },
  checkbox:       {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#374151',
    marginRight: 10, marginTop: 1, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn:     { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkboxMark:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  ackTxt:         { color: '#d1d5db', fontSize: 13, flex: 1, lineHeight: 19 },

  fundCard:       {
    backgroundColor: '#0b1220', borderColor: '#1f2937', borderWidth: 1, borderRadius: 12,
    padding: 14, marginBottom: 14,
  },
  fundHead:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fundTitle:      { color: '#fff', fontSize: 15, fontWeight: '600' },
  fundInstr:      { color: '#9ca3af', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  chip:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  chipTxt:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

  balanceRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  balanceVal:     { color: '#9ca3af', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  balanceValOk:   { color: '#34d399' },
  balanceMeta:    { alignItems: 'flex-end' },
  balanceThresh:  { color: '#6b7280', fontSize: 11 },
  balanceStatus:  { fontSize: 11, marginTop: 2, fontWeight: '600' },
  balanceStatusOk:      { color: '#34d399' },
  balanceStatusPending: { color: '#f59e0b' },

  row:            { flexDirection: 'row' },

  primaryBtn:     { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4, flex: 1 },
  primaryBtnDisabled: { backgroundColor: '#1e3a8a', opacity: 0.6 },
  primaryBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn:   { backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4, flex: 1 },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnTxt:{ color: '#d1d5db', fontWeight: '600', fontSize: 15 },

  successBadge:   {
    alignSelf: 'center', width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#064e3b', alignItems: 'center', justifyContent: 'center', marginBottom: 18, marginTop: 12,
  },
  successBadgeTxt: { color: '#34d399', fontSize: 32, fontWeight: '700' },
  link:           { color: '#60a5fa', fontSize: 13 },
});
