import M from '../Messages';
import { SingletonPage, PageHost } from './SingletonPage';

const menuHandlers = new Map();
let menuGeneration = 0;

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let handler = menuHandlers.get(info.menuItemId);
  if (!handler) {
    return;
  }

  try {
    let result = handler(info, tab);
    if (result && typeof result.then === 'function') {
      result.catch(error => console.error(error));
    }
  } catch (e) {
    console.error(e);
  }
});

class Menu
{
  constructor(contexts, ...groups) {
    this.contexts = contexts;
    this.groups = groups;
  }

  addGroup(group) {
    this.groups.push(group);
  }

  apply() {
    let gen = ++menuGeneration;
    chrome.contextMenus.removeAll(() => {
      if (gen !== menuGeneration) return;
      menuHandlers.clear();

      let idCounter = 0;
      const nextId = prefix => `marinara-${prefix}-${Math.random().toString(16).slice(2)}-${idCounter++}`;

      let firstGroup = true;
      for (let group of this.groups) {
        let firstItem = true;
        for (let item of group.items) {
          if (!item.visible) {
            continue;
          }

          if (firstItem && !firstGroup) {
            chrome.contextMenus.create({
              id: nextId('separator'),
              type: 'separator',
              contexts: this.contexts
            });
          }

          firstGroup = false;
          firstItem = false;

          if (item instanceof ParentMenu) {
            let id = nextId('parent');
            chrome.contextMenus.create({
              id,
              title: item.title,
              contexts: this.contexts
            });

            for (let child of item.children) {
              if (!child.visible) {
                continue;
              }

              let childId = nextId('child');
              chrome.contextMenus.create({
                id: childId,
                title: child.title,
                contexts: this.contexts,
                parentId: id
              });
              menuHandlers.set(childId, () => child.run());
            }
          } else {
            let itemId = nextId('item');
            chrome.contextMenus.create({
              id: itemId,
              title: item.title,
              contexts: this.contexts
            });
            menuHandlers.set(itemId, () => item.run());
          }
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

  addItem(item) {
    this.items.push(item);
  }
}

class ParentMenu
{
  constructor(...children) {
    this.children = children;
  }

  addChild(child) {
    this.children.push(child);
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
