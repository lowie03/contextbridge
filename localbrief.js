// localbrief.js — keep a brief up to date in the background with Chrome's built-in AI.

const LOCAL_CHUNK_CHARS = 8000;    // how much new conversation to send per update
const LOCAL_MESSAGE_CHARS = 3000;  // longest single message we send in full
const LOCAL_QUIET_MS = 8000;       // wait this long after the last change before updating

let localBriefRunning = false;
let localBriefProblem = null;      // why background briefs can't run here, if they can't
let localBriefTimer;

// Shorten a very long message, keeping its start and end.
function clipText(text, max) {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n[…middle of this message omitted…]\n${text.slice(-half)}`;
}

// Split messages into groups small enough for the local model.
function chunkMessages(messages) {
  const chunks = [];
  let current = [];
  let size = 0;

  for (const m of messages) {
    const length = Math.min(m.text.length, LOCAL_MESSAGE_CHARS) + 20;
    if (current.length && size + length > LOCAL_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(m);
    size += length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function askLocalAI(previousBrief, messages) {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${clipText(m.text, LOCAL_MESSAGE_CHARS)}`)
    .join("\n\n");
  return chrome.runtime.sendMessage({ type: "local-brief", previousBrief, transcript });
}

async function updateLocalBrief() {
  if (localBriefRunning || !extensionAlive()) return;

  const conversationId = chatgptAdapter.getConversationId();
  if (!conversationId) return;

  localBriefRunning = true;
  cbEvents.dispatchEvent(new Event("local-brief-start"));

  try {
    const conversation = await cbStorage.load(conversationId);
    if (!conversation) return;

    const brief = currentBrief(conversation);
    const pending = pendingMessages(conversation, brief);
    if (pending.length === 0) {
      console.log("[ContextBridge] background brief is already up to date");
      return; // the brief already includes every message
    }

    let briefText = brief?.text || "";
    const covered = new Set(brief ? brief.covered : []);

    for (const chunk of chunkMessages(pending)) {
      if (chatgptAdapter.getConversationId() !== conversationId) return; // user switched chats

      const result = await askLocalAI(briefText, chunk);
      if (!result?.text) {
        localBriefProblem = result?.error || "no reply";
        console.warn("[ContextBridge] background brief unavailable:", localBriefProblem);
        return;
      }

      localBriefProblem = null;
      briefText = result.text;
      for (const m of chunk) covered.add(m.id);

      // Save after every chunk, so progress survives a refresh mid-way.
      await cbStorage.update(conversationId, (stored) => {
        if (!stored) return null;
        stored.localBrief = { text: briefText, coveredIds: [...covered], updatedAt: Date.now() };
        return stored;
      });

      console.log(`[ContextBridge] background brief updated (+${chunk.length} messages)`);
      cbEvents.dispatchEvent(new Event("saved"));
    }
  } catch (err) {
    localBriefProblem = err.message;
    console.error("[ContextBridge] background brief failed:", err);
  } finally {
    localBriefRunning = false;
    cbEvents.dispatchEvent(new Event("local-brief-end"));
  }
}

// Run an update once the page has been quiet for a while.
function scheduleLocalBrief(delayMs = LOCAL_QUIET_MS) {
  clearTimeout(localBriefTimer);
  localBriefTimer = setTimeout(updateLocalBrief, delayMs);
}

// Catch up on load, and whenever the user switches chats.
scheduleLocalBrief();
onUrlChange(() => scheduleLocalBrief());
