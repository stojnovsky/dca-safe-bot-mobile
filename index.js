// Custom entry point — CommonJS require() guarantees execution order.
// TaskManager.defineTask must run before expo-router/entry starts the app.

require('react-native-get-random-values');

const TaskManager      = require('expo-task-manager');
const BackgroundTask   = require('expo-background-task');

const DCA_TASK_NAME = 'dca-hourly-check';

TaskManager.defineTask(DCA_TASK_NAME, async () => {
  try {
    const { getConfig, getPrivateKey } = require('@/lib/config-store');
    const { runDailyDca }              = require('@/lib/dca-runner');

    const [config, pk] = await Promise.all([getConfig(), getPrivateKey()]);

    if (!config.safeAddress || !pk) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await runDailyDca(config, pk);
    console.log('[DCA Task]', JSON.stringify(result));

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[DCA Task] Error:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Start expo-router AFTER defineTask is registered
require('expo-router/entry');
