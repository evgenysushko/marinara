import Chrome from '../Chrome';
import { Phase, TimerState } from './Timer';

const STORAGE_KEY = 'timerState';
const ALARM_NAME = 'timer-expire';

const PHASES = [Phase.Focus, Phase.ShortBreak, Phase.LongBreak];
const TIMER_STATES = [TimerState.Stopped, TimerState.Running, TimerState.Paused];

function saveState(state) {
  return Chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function clearState() {
  return Chrome.storage.local.set({ [STORAGE_KEY]: null });
}

async function loadState() {
  let result = await Chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

class PersistenceObserver {
  constructor(pomodoroTimer) {
    this.pomodoroTimer = pomodoroTimer;
  }

  _save(status, timerState) {
    let state = {
      phase: +status.phase,
      state: +timerState,
      pomodoros: this.pomodoroTimer.pomodoros,
      checkpointElapsed: status.checkpointElapsed,
      checkpointStartAt: status.checkpointStartAt,
      duration: status.duration,
      advanceTimer: this.pomodoroTimer.advanceTimer
    };
    return saveState(state);
  }

  onStart(status) {
    let expirationTime = Date.now() + status.remaining * 1000;
    Chrome.alarms.create(ALARM_NAME, { when: expirationTime });
    this._save(status, TimerState.Running);
  }

  onPause(status) {
    Chrome.alarms.clear(ALARM_NAME);
    this._save(status, TimerState.Paused);
  }

  onResume(status) {
    let expirationTime = Date.now() + status.remaining * 1000;
    Chrome.alarms.create(ALARM_NAME, { when: expirationTime });
    this._save(status, TimerState.Running);
  }

  onStop() {
    Chrome.alarms.clear(ALARM_NAME);
    clearState();
  }

  onExpire() {
    Chrome.alarms.clear(ALARM_NAME);
    clearState();
  }

  onTick() {
    // No-op: ticks don't change persisted state.
  }
}

async function restoreTimer(timer, saved) {
  let phase = PHASES[saved.phase];
  let timerState = TIMER_STATES[saved.state];

  if (!phase || !timerState || timerState === TimerState.Stopped) {
    return null;
  }

  // Set phase (creates inner Timer via _updateTimer).
  timer._phase = phase;
  timer._updateTimer();

  // Override duration from saved state (settings may have changed).
  timer.timer.duration = saved.duration;
  timer.pomodoros = saved.pomodoros;
  timer.advanceTimer = saved.advanceTimer;

  let innerTimer = timer.timer;

  if (timerState === TimerState.Running) {
    let elapsed = saved.checkpointElapsed + (Date.now() - saved.checkpointStartAt) / 1000;

    if (elapsed >= saved.duration) {
      // Timer expired while SW was dead.
      innerTimer.checkpointElapsed = saved.duration;
      innerTimer.checkpointStartAt = Date.now();
      innerTimer.state = TimerState.Stopped;
      return 'expired';
    }

    innerTimer.state = TimerState.Running;
    innerTimer.checkpointElapsed = saved.checkpointElapsed;
    innerTimer.checkpointStartAt = saved.checkpointStartAt;
    innerTimer.setExpireTimeout(saved.duration - elapsed);
    innerTimer.setTickInterval(innerTimer.tick);
    return 'running';
  }

  if (timerState === TimerState.Paused) {
    innerTimer.state = TimerState.Paused;
    innerTimer.checkpointElapsed = saved.checkpointElapsed;
    return 'paused';
  }

  return null;
}

export {
  PersistenceObserver,
  loadState,
  clearState,
  restoreTimer,
  ALARM_NAME
};
