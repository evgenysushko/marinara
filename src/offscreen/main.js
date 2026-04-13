import createTimerSound from '../TimerSound';

// --- Notification sound playback (migrated from public/offscreen.js) ---

async function playAudio(file) {
  const url = chrome.runtime.getURL(file.replace(/^\//, ''));
  const audio = new Audio(url);
  audio.volume = 1;

  return new Promise((resolve, reject) => {
    const onEnded = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      resolve();
    };

    const onError = event => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      reject(event?.error || new Error('Failed to play audio.'));
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(onError);
    }
  });
}

// --- Timer sound playback ---

let currentTimerSound = null;

async function handleTimerSound(message) {
  switch (message.action) {
    case 'start': {
      // Close any existing timer sound.
      if (currentTimerSound) {
        await currentTimerSound.close();
        currentTimerSound = null;
      }
      currentTimerSound = await createTimerSound(message.timerSound);
      if (currentTimerSound) {
        await currentTimerSound.start();
      }
      break;
    }
    case 'stop': {
      if (currentTimerSound) {
        await currentTimerSound.stop();
      }
      break;
    }
    case 'resume': {
      if (currentTimerSound) {
        await currentTimerSound.start();
      }
      break;
    }
    case 'close': {
      if (currentTimerSound) {
        await currentTimerSound.close();
        currentTimerSound = null;
      }
      break;
    }
  }
}

// --- Message listener ---

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === 'offscreen-play-audio') {
    return playAudio(message.file)
      .then(() => ({ ok: true }))
      .catch(error => {
        console.error(error);
        return { error: String(error) };
      });
  }

  if (message.type === 'timer-sound') {
    return handleTimerSound(message)
      .then(() => ({ ok: true }))
      .catch(error => {
        console.error('Timer sound error:', error);
        return { error: String(error) };
      });
  }
});
