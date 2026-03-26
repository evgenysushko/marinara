import { PomodoroTimer, Phase } from './Timer';
import Chrome from '../Chrome';
import { createPomodoroMenu } from './Menu';
import { History } from './History';
import StorageManager from './StorageManager';
import { SettingsSchema, PersistentSettings } from './Settings';
import { HistoryService, SoundsService, SettingsService, PomodoroService, OptionsService } from './Services';
import { BadgeObserver, TimerSoundObserver, ExpirationSoundObserver, NotificationObserver, HistoryObserver, CountdownObserver, MenuObserver } from './Observers';
import { ServiceBroker } from '../Service';
import * as Alarms from './Alarms';
import { PersistenceObserver, loadState, restoreTimer, ALARM_NAME } from './TimerPersistence';

async function run() {
  chrome.runtime.onUpdateAvailable.addListener(() => {
    // We must listen to (but do nothing with) the onUpdateAvailable event in order to
    // defer updating the extension until the next time Chrome is restarted. We do not want
    // the extension to automatically reload on update since a Pomodoro might be running.
    // See https://developer.chrome.com/apps/runtime#event-onUpdateAvailable.
  });

  let settingsManager = new StorageManager(new SettingsSchema(), Chrome.storage.sync);
  let settings = await PersistentSettings.create(settingsManager);
  let timer = new PomodoroTimer(settings);
  let history = new History();

  // Restore timer state from previous SW instance.
  let restoreResult = null;
  try {
    let saved = await loadState();
    if (saved) {
      restoreResult = await restoreTimer(timer, saved);
    }
  } catch (e) {
    console.error('Failed to restore timer state:', e);
  }

  // Attach all observers (PersistenceObserver first so state is saved before other side effects).
  timer.observe(new PersistenceObserver(timer));
  let menu = createPomodoroMenu(timer);
  timer.observe(new HistoryObserver(history));
  timer.observe(new BadgeObserver());
  timer.observe(new NotificationObserver(timer, settings, history));
  timer.observe(new ExpirationSoundObserver(settings));
  timer.observe(new TimerSoundObserver(settings));
  timer.observe(new CountdownObserver(settings));
  timer.observe(new MenuObserver(menu));

  menu.apply();
  settingsManager.on('change', () => menu.apply());

  Alarms.install(timer, settingsManager);
  chrome.action.onClicked.addListener(() => {
    if (timer.isRunning) {
      timer.pause();
    } else if (timer.isPaused) {
      timer.resume();
    } else {
      timer.start();
    }
  });

  ServiceBroker.register(new HistoryService(history));
  ServiceBroker.register(new SoundsService());
  ServiceBroker.register(new SettingsService(settingsManager));
  ServiceBroker.register(new PomodoroService(timer));
  ServiceBroker.register(new OptionsService());

  // Listen for timer expiration alarm (safety net).
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== ALARM_NAME) {
      return;
    }
    // If timer already expired or was stopped, this is a no-op.
    if (timer.isRunning && timer.remaining <= 0) {
      timer.timer.setExpireTimeout(0);
    }
  });

  // Emit synthetic events for restored state so all observers update.
  if (restoreResult === 'running') {
    timer.emit('tick', timer.status);
  } else if (restoreResult === 'paused') {
    timer.emit('pause', timer.status);
  } else if (restoreResult === 'expired') {
    // Fire the expire sequence: increment pomodoros, set advanceTimer, notify observers.
    if (timer.phase === Phase.Focus) {
      timer.pomodoros++;
    }
    timer.advanceTimer = true;
    timer.emit('expire', timer.status);
  }
}

run();
