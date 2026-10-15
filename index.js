// Custom entry point — CommonJS require() guarantees execution order.
// TaskManager.defineTask must run before expo-router/entry starts the app.

require('react-native-get-random-values');

const TaskManager      = require('expo-task-manager');
const BackgroundTask   = require('expo-background-task');

const DCA_TASK_NAME = 'dca-hourly-check';

TaskManager.defineTask(DCA_TASK_NAME, async () => {
  const { logBotRun, logBotEvent } = require('@/lib/log-store');
  const {
    sendDcaRunNotification,
    sendLocalNotification,
    getNotificationsEnabled,
    getNotificationPermission,
  } = require('@/lib/notifications');

  try {
    const { getConfig, getPrivateKey } = require('@/lib/config-store');
    const { runDailyDca }              = require('@/lib/dca-runner');

    const [config, pk] = await Promise.all([getConfig(), getPrivateKey()]);

    if (!config.safeAddress || !pk) {
      await logBotEvent('background', 'skipped', 'Bot not configured (missing Safe address or key)');
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await runDailyDca(config, pk);
    console.log('[DCA Task]', JSON.stringify(result));
    await logBotRun('background', result);

    // Best-effort notification. A failure here must NEVER fail the task —
    // the trades have already been committed on-chain by this point.
    try { await sendDcaRunNotification(result); }
    catch (e) { console.warn('[DCA Task] notification failed:', e); }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[DCA Task] Error:', err);
    try { await logBotEvent('background', 'error', String(err && err.message ? err.message : err), { stack: err && err.stack }); }
    catch { /* swallow logging error */ }

    // Surface catastrophic failures to the user so they don't silently miss
    // days of DCA activity — guarded by the same opt-in checks.
    try {
      if (await getNotificationsEnabled() && (await getNotificationPermission()) === 'granted') {
        await sendLocalNotification(
          '❌ DCA run failed',
          'The hourly task crashed. Open the app to see details.',
          { variant: 'error' },
        );
      }
    } catch { /* swallow */ }

    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Start expo-router AFTER defineTask is registered
require('expo-router/entry');
