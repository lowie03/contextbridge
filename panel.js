// panel.js — the ContextBridge edge tab and panel, inside a shadow root.
(function () {
  // How many new messages after a brief it takes for the ring to drain almost empty.
  const DRAIN_AFTER = 20;

  // ---------- Build the UI ----------
  const host = document.createElement("div");
  host.id = "contextbridge-host";
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2147483647;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        --bg: #1f1f1f;
        --fg: #ececec;
        --muted: #8a8a8a;
        --border: #3a3a3a;
        --brand: #6366f1;
        --amber: #f5a524;
        --red: #ef4444;
        --track: rgba(140, 140, 140, 0.25);
      }
      @media (prefers-color-scheme: light) {
        :host {
          --bg: #ffffff;
          --fg: #1a1a1a;
          --muted: #777777;
          --border: #dddddd;
        }
      }

      button {
        font: inherit;
        cursor: pointer;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        padding: 8px 12px;
      }
      button:disabled { opacity: 0.5; cursor: default; }
      button.primary { background: var(--brand); border-color: var(--brand); color: #ffffff; }

      /* ---------- The edge tab ---------- */
      .tab {
        display: flex;
        align-items: center;
        padding: 6px 8px 6px 6px;
        border-radius: 16px 0 0 16px;
        border-right: none;
        box-shadow: -4px 4px 14px rgba(0, 0, 0, 0.25);
      }
      .tab svg {
        width: 30px;
        height: 30px;
        display: block;
        flex-shrink: 0;
      }
      .label {
        max-width: 0;
        opacity: 0;
        overflow: hidden;
        white-space: nowrap;
        transition: max-width 0.25s ease, opacity 0.2s ease, margin 0.25s ease;
      }
      .tab:hover .label,
      .tab:focus-visible .label {
        max-width: 280px;
        opacity: 1;
        margin: 0 8px 0 6px;
      }

      /* The freshness ring */
      .track { fill: none; stroke: var(--track); stroke-width: 2.5; }
      .ring {
        fill: none;
        stroke: var(--ring-color);
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-dasharray: 0 100;
        transform: rotate(-90deg);
        transform-box: fill-box;
        transform-origin: center;
        transition: stroke-dasharray 0.5s ease, stroke 0.3s ease;
      }

      /* The bridge glyph */
      .arc { fill: none; stroke: var(--glyph); stroke-width: 2.2; stroke-linecap: round; }
      .pier { fill: var(--glyph); }

      /* Brief freshness states */
      .tab[data-state="idle"]    { --glyph: var(--muted); --ring-color: var(--muted); }
      .tab[data-state="saving"]  { --glyph: var(--brand); --ring-color: var(--brand); }
      .tab[data-state="ready"]   { --glyph: var(--brand); --ring-color: var(--brand); }
      .tab[data-state="stale"]   { --glyph: var(--brand); --ring-color: var(--amber); }
      .tab[data-state="working"] { --glyph: var(--brand); --ring-color: var(--brand); }
      .tab[data-state="working"] .ring { animation: spin 1s linear infinite; }

      /* Limit alerts: listed after the states above so they win */
      .tab[data-alert="chat-full"],
      .tab[data-alert="usage-limit"] { --ring-color: var(--red); border-color: var(--red); }
      .tab[data-alert="warning"] { --ring-color: var(--red); animation: alert-glow 1.6s ease-in-out infinite; }

      @keyframes spin {
        from { transform: rotate(-90deg); }
        to   { transform: rotate(270deg); }
      }
      @keyframes alert-glow {
        0%, 100% { box-shadow: -4px 4px 14px rgba(0, 0, 0, 0.25), 0 0 0 0 rgba(239, 68, 68, 0.6); }
        50%      { box-shadow: -4px 4px 14px rgba(0, 0, 0, 0.25), 0 0 0 6px rgba(239, 68, 68, 0); }
      }

      @media (prefers-reduced-motion: reduce) {
        .label, .ring { transition: none; }
        .tab[data-state="working"] .ring,
        .tab[data-alert="warning"] { animation: none; }
      }

      /* ---------- The panel ---------- */
      .panel {
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        width: 380px;
        max-width: calc(100vw - 70px);
        max-height: 80vh;
        overflow-y: auto;
        background: var(--bg);
        color: var(--fg);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        padding: 14px;
      }
      .panel[hidden] { display: none; }
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .close { border: none; padding: 2px 8px; font-size: 18px; }
      .alert {
        margin: 0 0 10px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--red);
        line-height: 1.4;
      }
      .alert[hidden] { display: none; }
      .status { color: var(--muted); margin: 0 0 10px; line-height: 1.4; }
      .preview {
        max-height: 260px;
        overflow-y: auto;
        white-space: pre-wrap;
        font: 12px/1.5 ui-monospace, Menlo, monospace;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px;
        margin: 0 0 10px;
      }
      .preview[hidden] { display: none; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .setting {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.4;
        cursor: pointer;
      }
      .setting input { margin: 2px 0 0; accent-color: var(--brand); cursor: pointer; }
    </style>

    <button class="tab" data-state="idle" data-alert="none" aria-label="ContextBridge">
      <span class="label">ContextBridge</span>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle class="track" cx="18" cy="18" r="15.9155" />
        <circle class="ring" cx="18" cy="18" r="15.9155" />
        <path class="arc" d="M12 21 Q18 12 24 21" />
        <circle class="pier" cx="12" cy="21" r="2.2" />
        <circle class="pier" cx="24" cy="21" r="2.2" />
      </svg>
    </button>

    <div class="panel" hidden>
      <div class="header">
        <strong>ContextBridge</strong>
        <button class="close" aria-label="Close">×</button>
      </div>
      <p class="alert" role="alert" hidden></p>
      <p class="status"></p>
      <pre class="preview" hidden></pre>
      <div class="actions">
        <button class="update">Update now</button>
        <button class="ask" title="ChatGPT writes a detailed brief. Uses one message.">Ask ChatGPT</button>
        <button class="copy primary" hidden>Copy handoff</button>
      </div>
      <label class="setting">
        <input type="checkbox" class="auto-brief" />
        <span>Ask ChatGPT for a brief automatically when it warns about a limit. Uses one message.</span>
      </label>
    </div>
  `;

  const $ = (selector) => root.querySelector(selector);
  const tab = $(".tab");
  const tabLabel = $(".label");
  const ring = $(".ring");
  const panel = $(".panel");
  const alertEl = $(".alert");
  const statusEl = $(".status");
  const preview = $(".preview");
  const updateBtn = $(".update");
  const askBtn = $(".ask");
  const copyBtn = $(".copy");
  const autoBriefBox = $(".auto-brief");

  let working = false;        // true while ChatGPT is writing a brief
  let localUpdating = false;  // true while the background brief is updating
  let currentHandoff = "";
  let autoOpenedFor = "";     // so the panel only pops open once per limit
  let autoBriefedFor = "";    // so each warning triggers at most one automatic brief

  // ---------- Helpers ----------
  function setStatus(text) {
    statusEl.textContent = text;
  }

  function timeAgo(timestamp) {
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
  }

  function sourceLabel(brief) {
    return brief.source === "local" ? "on your computer" : "by ChatGPT";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
  }

  // ---------- Work out the current state ----------
  async function loadState() {
    const conversationId = chatgptAdapter.getConversationId();
    if (!conversationId) return { kind: "idle", limit: null };

    const conversation = await cbStorage.load(conversationId);

    // The user switched chats while we were loading; a newer refresh owns the display.
    if (chatgptAdapter.getConversationId() !== conversationId) return null;

    const count = conversation?.order.length || 0;
    const limit = conversation?.limit || null;
    const brief = conversation ? currentBrief(conversation) : null;

    if (!brief) return { kind: "saving", conversationId, conversation, count, limit, brief: null };

    const newSince = pendingMessages(conversation, brief).length;
    return {
      kind: newSince > 0 ? "stale" : "ready",
      conversationId,
      conversation,
      count,
      brief,
      newSince,
      needsRefresh: newSince >= DRAIN_AFTER,
      limit,
    };
  }

  // Limits that stop ChatGPT from replying, so it can't write a new brief.
  function isBlocked(limit) {
    return limit?.kind === "chat-full" || limit?.kind === "usage-limit";
  }

  // How full the ring should be, from 0 (empty) to 1 (full).
  function ringFill(state) {
    if (working) return 0.25; // a short arc that spins
    switch (state.kind) {
      case "ready": return 1;
      case "stale": return Math.max(0.1, 1 - state.newSince / DRAIN_AFTER);
      default:      return 0; // idle or no brief yet: empty ring
    }
  }

  function limitTabText(limit) {
    switch (limit.kind) {
      case "chat-full":   return "This chat is full · copy your handoff";
      case "usage-limit": return "Limit reached · copy your handoff";
      case "warning":     return "Limit close · your handoff is ready";
    }
  }

  function limitPanelText(limit) {
    switch (limit.kind) {
      case "chat-full":
        return "ChatGPT says this chat is full, so it can't continue here. Copy the handoff and paste it into your next AI.";
      case "usage-limit":
        return "ChatGPT's usage limit is reached. Your handoff is ready to copy.";
      case "warning":
        return "ChatGPT warned that you're close to a limit. Your handoff is ready to copy whenever you need it.";
    }
  }

  function tabText(state) {
    if (working) return "ChatGPT is writing a brief…";
    if (state.limit) return limitTabText(state.limit);
    if (localUpdating && state.kind !== "idle") return "Updating brief…";
    switch (state.kind) {
      case "idle":   return "ContextBridge · open a chat";
      case "saving": return `${plural(state.count, "message")} saved · no brief yet`;
      case "ready":  return "Brief ready · up to date";
      case "stale":  return state.needsRefresh
        ? "Brief is out of date · update recommended"
        : `Brief is ${plural(state.newSince, "message")} behind`;
    }
  }

  function panelText(state) {
    switch (state.kind) {
      case "idle":
        return "Open a conversation to prepare a handoff.";
      case "saving":
        return `${plural(state.count, "message")} saved. No brief yet: ContextBridge writes one on your computer shortly after ChatGPT replies.`;
      case "ready":
        return `Brief ready · covers every message so far. Written ${timeAgo(state.brief.createdAt)} ${sourceLabel(state.brief)}; it updates by itself when new messages arrive.`;
      case "stale":
        return `Brief updated ${timeAgo(state.brief.createdAt)} ${sourceLabel(state.brief)}, with ${plural(state.newSince, "new message")} since. It updates on its own shortly, or click Update now.`;
    }
  }

  function problemText() {
    if (!localBriefProblem) return "";
    return ` Background briefs aren't working on this computer right now (${localBriefProblem}), but Copy still includes every message.`;
  }

  // ---------- Draw the state on screen ----------
  function render(state) {
    if (!state) return;

    // The tab
    tab.dataset.state = working ? "working" : state.kind;
    tab.dataset.alert = state.limit?.kind || "none";
    tabLabel.textContent = tabText(state);
    tab.setAttribute("aria-label", `ContextBridge: ${tabLabel.textContent}`);
    ring.style.strokeDasharray = `${ringFill(state) * 100} 100`;

    // The limit alert inside the panel
    if (state.limit) {
      alertEl.textContent = limitPanelText(state.limit);
      alertEl.hidden = false;
    } else {
      alertEl.hidden = true;
    }

    // Open the panel by itself the first time a limit appears in this chat.
    if (state.limit) {
      const key = `${state.conversationId}:${state.limit.kind}`;
      if (autoOpenedFor !== key) {
        autoOpenedFor = key;
        panel.hidden = false;
      }
    }

    // The handoff: works with or without a brief.
    const handoff = state.conversation
      ? buildHandoff(state.conversation)
      : { text: "", summary: "" };
    currentHandoff = handoff.text;
    copyBtn.hidden = working || !handoff.text;

    // The buttons
    const hasPending = state.kind === "stale" || (state.kind === "saving" && state.count > 0);
    updateBtn.disabled = working || localUpdating || !hasPending;
    updateBtn.textContent = localUpdating ? "Updating…" : "Update now";
    askBtn.disabled = working || state.kind === "idle" || isBlocked(state.limit);

    // The brief preview
    if (state.brief) {
      preview.textContent = state.brief.text;
      preview.hidden = false;
    } else {
      preview.hidden = true;
    }

    if (!working) {
      const includes = handoff.text ? ` Copy includes ${handoff.summary}` : "";
      setStatus(panelText(state) + includes + problemText());
    }
  }

  async function refresh() {
    if (!extensionAlive()) {
      setStatus("ContextBridge was updated. Refresh this page to reconnect.");
      updateBtn.disabled = true;
      askBtn.disabled = true;
      copyBtn.hidden = true;
      return;
    }
    try {
      const state = await loadState();
      render(state);
      maybeAutoBrief(state);
    } catch (err) {
      setStatus(`Couldn't load saved data: ${err.message}`);
    }
  }

  // ---------- Asking ChatGPT for a brief ----------
  async function runBrief(automatic) {
    working = true;
    await refresh();
    setStatus(
      automatic
        ? "ChatGPT warned about a limit, so ContextBridge is asking it for a brief now..."
        : "Asking ChatGPT for a detailed brief... This can take a minute."
    );

    let error = null;
    try {
      await requestBrief();
    } catch (err) {
      error = err;
    }

    working = false;
    await refresh(); // always redraw from what's actually saved

    if (error) {
      setStatus(`Couldn't get a brief from ChatGPT: ${error.message}`);
    } else if (automatic) {
      setStatus("ChatGPT wrote a brief before the limit. Copy it whenever you need it.");
    } else {
      setStatus("ChatGPT's brief is ready. Copy it and paste it into your next AI.");
    }
  }

  // Ask ChatGPT for a brief by itself when it warns about a limit, if the user turned that on.
  async function maybeAutoBrief(state) {
    if (!state || working || state.limit?.kind !== "warning") return;

    const key = `${state.conversationId}:${state.limit.detectedAt}`;
    if (autoBriefedFor === key) return; // already handled this warning
    if (state.kind === "ready") return; // the brief is already up to date
    if (chatgptAdapter.detectLimit()?.kind !== "warning") return; // only react to a warning on screen right now

    const settings = await cbSettings.get();
    if (!settings.autoBriefOnWarning) return;

    autoBriefedFor = key;

    if (chatgptAdapter.composerHasText()) {
      setStatus(
        "ChatGPT warned about a limit, but your message box has a draft, so ContextBridge didn't ask it for a brief. Send or clear it, then click Ask ChatGPT."
      );
      return;
    }

    runBrief(true);
  }

  // ---------- Interactions ----------
  tab.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refresh();
  });

  $(".close").addEventListener("click", () => {
    panel.hidden = true;
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") panel.hidden = true;
  });

  updateBtn.addEventListener("click", () => updateLocalBrief());

  askBtn.addEventListener("click", () => runBrief(false));

  copyBtn.addEventListener("click", async () => {
    await copyText(currentHandoff);
    copyBtn.textContent = "Copied ✓";
    setTimeout(() => (copyBtn.textContent = "Copy handoff"), 2000);
  });

  // The setting: load the saved value, save whenever it's changed.
  cbSettings.get().then((settings) => {
    autoBriefBox.checked = settings.autoBriefOnWarning;
  });
  autoBriefBox.addEventListener("change", () => {
    cbSettings.set({ autoBriefOnWarning: autoBriefBox.checked });
  });

  // ---------- Stay up to date ----------
  cbEvents.addEventListener("saved", () => {
    if (!working) refresh();
  });

  cbEvents.addEventListener("limit", () => {
    if (!working) refresh();
  });

  cbEvents.addEventListener("local-brief-start", () => {
    localUpdating = true;
    if (!working) refresh();
  });

  cbEvents.addEventListener("local-brief-end", () => {
    localUpdating = false;
    if (!working) refresh();
  });

  onUrlChange(() => {
    if (!working) refresh();
  });

  setInterval(() => {
    if (!working) refresh(); // keeps "3 min ago" accurate
  }, 60000);

  refresh();
})();
