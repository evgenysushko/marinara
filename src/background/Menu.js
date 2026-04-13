import M from '../Messages';
import { SingletonPage, PageHost } from './SingletonPage';

const menuHandlers = new Map();
let menuGeneration = 0;
let earlyMenuClicks = [];

function runHandler(handler, info, tab) {
  try {
    let result = handler(info, tab);
    if (result && typeof result.then === 'function') {
      result.catch(error => console.error(error));
    }
  } catch (e) {
    console.error(e);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let handler = menuHandlers.get(info.menuItemId);
  if (handler) {
    runHandler(handler, info, tab);
  } else {
    earlyMenuClicks.push({ info, tab });
  }
});

class Menu
{
  constructor(contexts, ...groups) {
    this.contexts = contexts;
    this.groups = groups;
  }

  apply() {
    let gen = ++menuGeneration;
    chrome.contextMenus.removeAll(() => {
      if (gen !== menuGeneration) return;
      menuHandlers.clear();

      let separatorCount = 0;

      let firstGroup = true;
      for (let group of this.groups) {
        let firstItem = true;
        for (let item of group.items) {
          if (!item.visible) {
            continue;
          }

          if (firstItem && !firstGroup) {
            chrome.contextMenus.create({
              id: `separator-${separatorCount++}`,
              type: 'separator',
              contexts: this.contexts
            });
          }

          firstGroup = false;
          firstItem = false;

          if (item instanceof ParentMenu) {
            chrome.contextMenus.create({
              id: item.id,
              title: item.title,
              contexts: this.contexts
            });

            for (let child of item.children) {
              if (!child.visible) {
                continue;
              }

              chrome.contextMenus.create({
                id: child.id,
                title: child.title,
                contexts: this.contexts,
                parentId: item.id
              });
              menuHandlers.set(child.id, () => child.run());
            }
          } else {
            chrome.contextMenus.create({
              id: item.id,
              title: item.title,
              contexts: this.contexts
            });
            menuHandlers.set(item.id, () => item.run());
          }
        }
      }

      // Replay context menu clicks that arrived before handlers were ready (cold-start).
      let pending = earlyMenuClicks;
      earlyMenuClicks = [];
      for (let { info, tab } of pending) {
        let handler = menuHandlers.get(info.menuItemId);
        if (handler) {
          runHandler(handler, info, tab);
        }
      }
    });
  }
}

class MenuGroup
{
  constructor(...items) {
    this.items = items;
  }

}

class ParentMenu
{
  constructor(...children) {
    this.children = children;
  }

  get title() {
    return '';
  }

  get visible() {
    return false;
  }
}

class RestartTimerParentMenu extends ParentMenu
{
  constructor(...children) {
    super(...children);
  }

  get id() {
    return 'restart-timer';
  }

  get title() {
    return M.restart_timer;
  }

  get visible() {
    return true;
  }
}

class Action
{
  get title() {
    return '';
  }

  get visible() {
    return false;
  }

  run() {
  }
}

class StartFocusingAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'start-focusing';
  }

  get title() {
    return M.start_focusing;
  }

  get visible() {
    return true;
  }

  run() {
    this.timer.startFocus();
  }
}

class StartShortBreakAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'start-short-break';
  }

  get title() {
    return this.timer.hasLongBreak ? M.start_short_break : M.start_break;
  }

  get visible() {
    return true;
  }

  run() {
    this.timer.startShortBreak();
  }
}

class StartLongBreakAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'start-long-break';
  }

  get title() {
    return M.start_long_break;
  }

  get visible() {
    return this.timer.hasLongBreak;
  }

  run() {
    this.timer.startLongBreak();
  }
}

class StopTimerAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'stop-timer';
  }

  get title() {
    return M.stop_timer;
  }

  get visible() {
    return this.timer.isRunning || this.timer.isPaused;
  }

  run() {
    this.timer.stop();
  }
}

class PauseTimerAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'pause-timer';
  }

  get title() {
    return M.pause_timer;
  }

  get visible() {
    return this.timer.isRunning;
  }

  run() {
    this.timer.pause();
  }
}

class ResumeTimerAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'resume-timer';
  }

  get title() {
    return M.resume_timer;
  }

  get visible() {
    return this.timer.isPaused;
  }

  run() {
    this.timer.resume();
  }
}

class PomodoroHistoryAction extends Action
{
  get id() {
    return 'pomodoro-history';
  }

  get title() {
    return M.pomodoro_history;
  }

  get visible() {
    return true;
  }

  async run() {
    let manifest = chrome.runtime.getManifest();
    let url = chrome.runtime.getURL(`${manifest.options_page}#/history`);
    let page = await SingletonPage.show(url, PageHost.Tab);
    page.focus();
  }
}

class StartPomodoroCycleAction extends Action
{
  constructor(timer) {
    super();
    this.timer = timer;
  }

  get id() {
    return 'start-pomodoro-cycle';
  }

  get title() {
    if (this.timer.isRunning || this.timer.isPaused) {
      return M.restart_pomodoro_cycle;
    } else {
      return M.start_pomodoro_cycle;
    }
  }

  get visible() {
    return this.timer.hasLongBreak;
  }

  run() {
    this.timer.startCycle();
  }
}

class PomodoroMenuSelector
{
  constructor(timer, inactive, active) {
    this.timer = timer;
    this.inactive = inactive;
    this.active = active;
  }

  apply() {
    let menu = (this.timer.isRunning || this.timer.isPaused) ? this.active : this.inactive;
    menu.apply();
  }
}

function createPomodoroMenu(timer) {
  let pause = new PauseTimerAction(timer);
  let resume = new ResumeTimerAction(timer);
  let stop = new StopTimerAction(timer);

  let startCycle = new StartPomodoroCycleAction(timer);
  let startFocus = new StartFocusingAction(timer);
  let startShortBreak = new StartShortBreakAction(timer);
  let startLongBreak = new StartLongBreakAction(timer);
  let viewHistory = new PomodoroHistoryAction();

  let inactive = new Menu(['action'],
    new MenuGroup(
      startCycle,
      startFocus,
      startShortBreak,
      startLongBreak
    ),
    new MenuGroup(
      viewHistory
    )
  );

  let active = new Menu(['action'],
    new MenuGroup(
      pause,
      resume,
      stop,
      new RestartTimerParentMenu(
        startFocus,
        startShortBreak,
        startLongBreak
      ),
      startCycle
    ),
    new MenuGroup(
      viewHistory
    )
  );

  return new PomodoroMenuSelector(timer, inactive, active);
}

export {
  createPomodoroMenu
};
