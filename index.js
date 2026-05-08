// Custom entry point — CommonJS require() guarantees execution order.
// TaskManager.defineTask must run before expo-router/entry starts the app.

require('react-native-get-random-values');

const TaskManager      = require('expo-task-manager');
const BackgroundTask   = require('expo-background-task');

const DCA_TASK_NAME = 'dca-hourly-check';

TaskManager.defineTask(DCA_TASK_NAME, async () => {
  const { logBotRun, logBotEvent } = require('@/lib/log-store');

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

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[DCA Task] Error:', err);
    try { await logBotEvent('background', 'error', String(err && err.message ? err.message : err), { stack: err && err.stack }); }
    catch { /* swallow logging error */ }
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Start expo-router AFTER defineTask is registered
require('expo-router/entry');
