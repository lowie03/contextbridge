// adapters/chatgpt.js
const chatgptAdapter = {
  name: "ChatGPT",

  matches: (url) => url.hostname === "chatgpt.com",

  getConversationId() {
    // URLs look like /c/<id>, or /g/<gpt>/c/<id> inside custom GPTs.
    const match = location.pathname.match(/\/c\/([\w-]+)/);
    return match ? match[1] : null; // null on the "new chat" page
  },

  // ---------- Reading messages ----------

  // Try the current page structure first, fall back to the older one.
  readMessages() {
    const messages = this.readFromUnitKeys();
    if (messages.length > 0) return messages;
    return this.readFromAuthorRole();
  },

  // Current structure: data-content-search-unit-key="fallback-turn-4:1:assistant"
  readFromUnitKeys() {
    const nodes = document.querySelectorAll("[data-content-search-unit-key]");
    const messages = [];

    for (const node of nodes) {
      const key = node.getAttribute("data-content-search-unit-key");
      const match = key.match(/turn-(\d+):(\d+):(user|assistant)$/);
      if (!match) continue;

      const [, turn, , role] = match;

      // Best ID: the real message ID (assistant messages have one).
      const messageId = node
        .querySelector("[data-chatgpt-selection-message-id]")
        ?.getAttribute("data-chatgpt-selection-message-id");

      // Next best: the permanent turn key from the wrapper above, plus the role.
      const turnKey = node.closest("[data-turn-key]")?.getAttribute("data-turn-key");

      // ChatGPT marks a finished turn with data-talvt-turn-state="complete".
      const turnState = node
        .closest("[data-talvt-turn-state]")
        ?.getAttribute("data-talvt-turn-state");

      messages.push({
        id: messageId || (turnKey ? `${turnKey}:${role}` : key),
        turn: Number(turn), // display order only — not stable, never use as an ID
        role,
        text: this.cleanText(node.innerText),
        complete: turnState === "complete",
      });
    }
    return messages;
  },

  // Remove screen-reader labels like "ChatGPT said:" / "You said:".
  cleanText(raw) {
    return raw.replace(/^\s*(ChatGPT said:|You said:)\s*/, "").trim();
  },

  // Older structure, kept as a backup in case OpenAI switches back.
  readFromAuthorRole() {
    const nodes = document.querySelectorAll("[data-message-author-role]");
    return Array.from(nodes).map((node, index) => ({
      id: node.getAttribute("data-message-id") || `idx-${index}`,
      turn: index,
      role: node.getAttribute("data-message-author-role"),
      text: node.innerText.trim(),
    }));
  },

  // ---------- Typing and sending ----------

  getComposer() {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector('form [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector("form textarea")
    );
  },

  // The bar around the message box: + button, Think, mic, Send.
  getComposerArea() {
    let area = this.getComposer();
    for (let i = 0; i < 6 && area?.parentElement; i++) area = area.parentElement;
    return area;
  },

  getSendButton() {
    return (
      this.getComposerArea()?.querySelector('button[aria-label="Send"]') ||
      document.querySelector('[data-testid="send-button"]') ||
      document.querySelector("#composer-submit-button")
    );
  },

  typeIntoComposer(text) {
    const el = this.getComposer();
    if (!el) throw new Error("ContextBridge: message box not found");

    el.focus();

    if (el.isContentEditable) {
      // Rich editor: insert text the way a real keyboard/paste would.
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } else {
      // Plain <textarea>: set the value, then announce the change.
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setValue.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },

  // True if the user has typed something in the message box.
  composerHasText() {
    const el = this.getComposer();
    if (!el) return false;
    const text = el.isContentEditable ? el.innerText : el.value;
    return text.trim().length > 0;
  },

  pressEnter() {
    this.getComposer()?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );
  },

  // Click Send if we can find it; otherwise fall back to pressing Enter.
  async sendMessage() {
    try {
      const button = await waitFor(() => {
        const b = this.getSendButton();
        return b && !b.disabled ? b : null;
      }, 3000);
      button.click();
    } catch {
      this.pressEnter();
    }
  },

  // ---------- Limit detection ----------

  // Look for ChatGPT's limit banners near the message box. Returns { kind, text } or null.
  detectLimit() {
    const candidates = document.querySelectorAll(
      'form[data-chatgpt-composer] [role="status"], form[data-chatgpt-composer] [role="alert"]'
    );

    for (const el of candidates) {
      // Never treat text inside a chat message as a banner, even if it quotes one.
      if (el.closest("[data-turn-key], [data-content-search-unit-key]")) continue;

      const text = el.innerText.trim();
      if (!text) continue;
      const kind = this.classifyLimitText(text);
      if (kind) return { kind, text: text.slice(0, 300) };
    }
    return null;
  },

  // Decide what kind of limit a banner describes, from its wording.
  classifyLimitText(text) {
    const t = text.toLowerCase();

    // Confirmed from a real banner: "Chat memory full".
    if (/chat memory full|conversation is too long|maximum (conversation|chat) length/.test(t)) {
      return "chat-full";
    }

    // Not yet confirmed against a real banner. Adjust when we capture one.
    if (/usage limit|limit (reached|resets)|(hit|reached) (the|your) .*limit|try again (after|in|at)/.test(t)) {
      return "usage-limit";
    }
    if (/messages? (left|remaining)|limit soon|close to (the|your) limit/.test(t)) {
      return "warning";
    }

    return null;
  },
};