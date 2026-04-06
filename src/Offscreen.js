import Mutex from './Mutex';

const OFFSCREEN_URL = 'modules/offscreen.html';
const mutex = new Mutex();

async function ensureOffscreen() {
  return mutex.exclusive(async () => {
    if (!chrome.offscreen) {
      throw new Error('Offscreen API not available.');
    }

    const hasDocument = chrome.offscreen.hasDocument
      ? await chrome.offscreen.hasDocument()
      : false;

    if (!hasDocument) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play timer and notification sounds.'
      });
    }
  });
}

export { ensureOffscreen };
