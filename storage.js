// storage.js — all saving and loading lives here, nowhere else.
const cbStorage = {
  _queue: Promise.resolve(),

  key(conversationId) {
    return `conv:${conversationId}`;
  },

  blank(conversationId, provider) {
    return {
      conversationId,
      provider,
      url: location.href,
      createdAt: Date.now(),
      messages: {},
      order: [],
    };
  },

  async load(conversationId) {
    const key = this.key(conversationId);
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  },

  async save(conversation) {
    await chrome.storage.local.set({ [this.key(conversation.conversationId)]: conversation });
  },

  // Load → change → save, strictly one at a time.
  // `change` receives the stored conversation (or null) and returns
  // the conversation to save, or null to skip saving.
  update(conversationId, change) {
    const run = this._queue.then(async () => {
      const current = await this.load(conversationId);
      const next = await change(current);
      if (next) await this.save(next);
      return next;
    });
    this._queue = run.catch(() => {}); // one failed update must not block the rest
    return run;
  },
};

// Merge freshly captured messages into the stored conversation.
// Returns true if anything changed.
function mergeMessages(stored, captured) {
  let changed = false;
  const now = Date.now();

  const firstKnown = captured.find((m) => stored.messages[m.id]);
  let insertAt = firstKnown ? stored.order.indexOf(firstKnown.id) : stored.order.length;

  for (const msg of captured) {
    const existing = stored.messages[msg.id];

    if (!existing) {
      stored.messages[msg.id] = {
        id: msg.id,
        role: msg.role,
        text: msg.text,
        firstSeen: now,
        updatedAt: now,
      };
      stored.order.splice(insertAt, 0, msg.id);
      changed = true;
    } else if (existing.text !== msg.text) {
      existing.text = msg.text;
      existing.updatedAt = now;
      changed = true;
    }

    insertAt = stored.order.indexOf(msg.id) + 1;
  }

  return changed;
}

// User settings, stored separately from conversations.
const cbSettings = {
  defaults: { autoBriefOnWarning: false },

  async get() {
    const result = await chrome.storage.local.get("settings");
    return { ...this.defaults, ...(result.settings || {}) };
  },

  async set(changes) {
    const current = await this.get();
    await chrome.storage.local.set({ settings: { ...current, ...changes } });
  },
};
