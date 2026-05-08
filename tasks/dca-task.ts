import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const DCA_TASK_NAME = 'dca-hourly-check';

export async function registerDcaTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(DCA_TASK_NAME);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(DCA_TASK_NAME, {
    minimumInterval: 60 * 60, // hint only — iOS decides when to actually run
  });
}

export async function unregisterDcaTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(DCA_TASK_NAME);
  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(DCA_TASK_NAME);
  }
}

export async function isDcaTaskRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(DCA_TASK_NAME);
}

/**
 * `Available`  — iOS will run the task whenever it decides
 * `Restricted` — Background App Refresh is off in iOS Settings
 * `Denied`     — user denied background processing for this app
 */
export async function getBackgroundTaskStatus(): Promise<BackgroundTask.BackgroundTaskStatus> {
  return BackgroundTask.getStatusAsync();
}

/**
 * Forces the OS to invoke the registered task immediately. Only works in
 * **debug** builds (Xcode-signed `expo run:ios`); returns `false` in release.
 */
export async function runDcaTaskNow(): Promise<boolean> {
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}
