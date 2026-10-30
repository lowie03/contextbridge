// content.js
console.log("[ContextBridge] loaded on", location.href);

async function captureNow() {
  const conversationId = chatgptAdapter.getConversationId();
  if (!conversationId) return; // new-chat page, nothing to save yet

  const captured = chatgptAdapter.readMessages();
  if (captured.length === 0) return;

  try {
    const saved = await cbStorage.update(conversationId, (stored) => {
      stored = stored || cbStorage.blank(conversationId, chatgptAdapter.name);
      if (!mergeMessages(stored, captured)) return null; // nothing new, skip saving
      stored.updatedAt = Date.now();
      return stored;
    });

    if (saved) {
      console.log(
        `[ContextBridge] saved ${saved.order.length} messages (${captured.length} visible on screen)`
      );
      cbEvents.dispatchEvent(new Event("saved"));
    }
  } catch (err) {
    console.error("[ContextBridge] capture failed:", err);
  }
}

// What the last check saw on the page, so repeated checks don't hit storage.
let lastLimitSeen = null;

async function checkLimit() {
  const conversationId = chatgptAdapter.getConversationId();
  if (!conversationId) return;

  const found = chatgptAdapter.detectLimit();

  // Nothing changed on the page since the last check: skip the storage work.
  const seen = `${conversationId}:${found?.kind || "none"}`;
  if (seen === lastLimitSeen) return;
  lastLimitSeen = seen;

  try {
    const saved = await cbStorage.update(conversationId, (stored) => {
      if (!stored && !found) return null; // nothing to record
      stored = stored || cbStorage.blank(conversationId, chatgptAdapter.name);
      const current = stored.limit || null;

      if (found) {
        if (current?.kind === found.kind) return null; // already recorded
        stored.limit = { ...found, detectedAt: Date.now() };
        return stored;
      }

      // The banner is gone. Usage limits and warnings pass; a full chat stays full.
      if (current && current.kind !== "chat-full") {
        delete stored.limit;
        return stored;
      }
      return null;
    });

    if (saved) {
      console.log(`[ContextBridge] limit status: ${saved.limit?.kind || "cleared"}`, saved.limit?.text || "");
      cbEvents.dispatchEvent(new Event("limit"));
    }
  } catch (err) {
    lastLimitSeen = null; // let the next check try again
    console.error("[ContextBridge] limit check failed:", err);
  }
}

function runChecks() {
  if (!extensionAlive()) {
    observer.disconnect(); // stop watching the page; this copy of the extension is orphaned
    console.warn("[ContextBridge] The extension was reloaded. Refresh this page to reconnect.");
    return;
  }
  captureNow();
  checkLimit();
}

let debounceTimer;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runChecks, 1000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

// Check once shortly after load, in case the page is already showing a banner and doesn't change.
setTimeout(runChecks, 1500);

// Safety net: banners can appear through style changes the observer doesn't report.
const limitPoll = setInterval(() => {
  if (!extensionAlive()) {
    clearInterval(limitPoll);
    return;
  }
  checkLimit();
}, 3000);
