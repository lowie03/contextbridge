// utils.js — small helpers shared by every part of the extension.

// Keep checking a condition until it returns something, or give up after a timeout.
function waitFor(check, timeoutMs = 5000, intervalMs = 100) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const result = check();
      if (result) {
        clearInterval(timer);
        resolve(result);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for condition"));
      }
    }, intervalMs);
  });
}

// Lets the parts of the extension announce things ("saved", "limit") to each other.
const cbEvents = new EventTarget();

// False once the extension has been reloaded or removed while this page stayed open.
function extensionAlive() {
  return Boolean(chrome.runtime?.id);
}

// Pause for a number of milliseconds.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Call `callback` whenever the page URL changes, including in-page navigation.
function onUrlChange(callback, intervalMs = 500) {
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      callback(location.href);
    }
  }, intervalMs);
}