import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const DCA_TASK_NAME = 'dca-hourly-check';

export async function registerDcaTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(DCA_TASK_NAME);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(DCA_TASK_NAME, {
    minimumInterval: 60 * 60, // 1 hour in seconds
  });
}

export async function unregisterDcaTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(DCA_TASK_NAME);
  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(DCA_TASK_NAME);
  }
}
