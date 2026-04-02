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

// MV3: Register event listeners synchronously before any async work.
// Chrome only delivers events to listeners registered in the first turn of the event loop.
// Handlers are wired up during async setup; events arriving before that are queued.
chrome.runtime.onUpdateAvailable.addListener(() => {
  // Defer updating the extension until Chrome restarts, so a running Pomodoro isn't interrupted.
});

let alarmHandler = null;
const earlyAlarms = [];
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarmHandler) {
    alarmHandler(alarm);
  } else {
    earlyAlarms.push(alarm);
  }
});

let clickHandler = null;
chrome.action.onClicked.addListener(() => {
  if (clickHandler) clickHandler();
});

async function run() {
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

  // Must await — Alarms.onAlarm() references module-level `settings` variable
  // that is set inside install() via `settings = await settingsManager.get()`.
  await Alarms.install(settingsManager);

  // Wire up alarm handler (consolidates autostart + timer-expire).
  alarmHandler = (alarm) => {
    Alarms.onAlarm(alarm, timer);
    if (alarm.name === ALARM_NAME && timer.isRunning && timer.remaining <= 0) {
      timer.timer.setExpireTimeout(0);
    }
  };

  // Replay any alarms that fired during async setup.
  for (const alarm of earlyAlarms) {
    alarmHandler(alarm);
  }
  earlyAlarms.length = 0;

  // Wire up click handler.
  clickHandler = () => {
    if (timer.isRunning) timer.pause();
    else if (timer.isPaused) timer.resume();
    else timer.start();
  };

  ServiceBroker.register(new HistoryService(history));
  ServiceBroker.register(new SoundsService());
  ServiceBroker.register(new SettingsService(settingsManager));
  ServiceBroker.register(new PomodoroService(timer));
  ServiceBroker.register(new OptionsService());

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
