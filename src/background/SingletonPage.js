import Chrome from '../Chrome';
import Enum from './Enum';

const PageHost = new Enum({
  Tab: 0,
  Window: 1
});

function storageKey(url) {
  let pathname = new URL(url).pathname.replace(/\/$/, '').toLowerCase();
  return `singleton:${pathname}`;
}

class SingletonPage
{
  static async show(url, host, properties = {}) {
    let key = storageKey(url);

    let result = await chrome.storage.session.get(key);
    let existingTabId = result[key];
    if (existingTabId != null) {
      try {
        await Chrome.tabs.update(existingTabId, { url });
        return new SingletonPage(existingTabId, key);
      } catch {
        await chrome.storage.session.remove(key);
      }
    }

    // Page does not exist, so create it.
    let tabId;
    if (host === PageHost.Tab) {
      let tab = await Chrome.tabs.create({ url, active: false, ...properties });
      tabId = tab.id;
    } else if (host === PageHost.Window) {
      let window = await Chrome.windows.create({ url, type: 'popup', ...properties });
      tabId = window.tabs[0].id;
    } else {
      throw new Error('Invalid page host.');
    }

    await chrome.storage.session.set({ [key]: tabId });
    return new SingletonPage(tabId, key);
  }

  constructor(tabId, sKey) {
    this.tabId = tabId;

    const self = this;
    chrome.tabs.onRemoved.addListener(function removed(id) {
      if (id === self.tabId) {
        chrome.tabs.onRemoved.removeListener(removed);
        self.tabId = null;
        if (sKey) {
          chrome.storage.session.remove(sKey);
        }
      }
    });
  }

  focus() {
    if (!this.tabId) {
      return;
    }

    const focusWindow = tab => chrome.windows.update(tab.windowId, { focused: true });
    const focusTab = id => {
      try {
        chrome.tabs.update(id, { active: true, highlighted: true }, focusWindow);
      } catch (e) {
        // Firefox doesn't currently allow setting highlighted for chrome.tabs.update()
        // TODO: File a FF bug for this
        chrome.tabs.update(id, { active: true }, focusWindow);
      }
    };

    focusTab(this.tabId);
  }

  close() {
    if (!this.tabId) {
      return;
    }

    chrome.tabs.remove(this.tabId, () => {});
  }
}

export {
  PageHost,
  SingletonPage
};