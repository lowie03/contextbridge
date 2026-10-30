// brief.js — ask the AI for a handoff brief and save its reply.
const BRIEF_MARKER = "CONTEXTBRIDGE HANDOFF BRIEF";

const BRIEF_PROMPT = `Please write a handoff brief of our work in this conversation, so another AI assistant can continue it without me re-explaining anything.

Start your reply with this exact line: ${BRIEF_MARKER}

Then use these sections:
1. Project goal: what I'm trying to achieve.
2. What has been done: completed work, in order.
3. Changes and decisions: what we changed or decided, and why. If something was changed later, give only the latest version.
4. Current status: exactly where things stand right now.
5. Open issues: errors, unanswered questions, unfinished work.
6. Next steps: the most useful things to do next.
7. Key details: names, versions, settings, file names, and the latest version of any code still in use.
8. Attachments: any files or images I shared that the next assistant will need me to upload again.

Keep it under about 800 words, not counting code that is still in use.
State each fact once. Don't repeat it in later sections.
Leave out tests, small talk, and problems that were already resolved, unless they affect the work.

Be specific and factual. Write it for an assistant that has never seen this conversation. Don't add anything after the brief.`;

// Wait until a new assistant reply containing the marker stops changing.
async function waitForBriefReply(adapter, idsBefore, timeoutMs = 180000) {
  const start = Date.now();
  let lastText = "";
  let stableSince = Date.now();

  while (Date.now() - start < timeoutMs) {
    await sleep(500);

    const reply = adapter
      .readMessages()
      .find((m) => m.role === "assistant" && !idsBefore.has(m.id) && m.text.includes(BRIEF_MARKER));

    if (!reply) continue; // ChatGPT hasn't started the brief yet

    if (reply.text !== lastText) {
      lastText = reply.text; // still streaming: reset the "unchanged" clock
      stableSince = Date.now();
      continue;
    }

    // Done if ChatGPT says so, or if the text hasn't changed for 4 seconds.
    if (reply.complete || Date.now() - stableSince > 4000) return reply;
  }

  throw new Error("ContextBridge: timed out waiting for the brief");
}

async function requestBrief() {
  const adapter = chatgptAdapter;
  const conversationId = adapter.getConversationId();
  if (!conversationId) throw new Error("ContextBridge: open a conversation first");

  // Never overwrite something the user has typed.
  if (adapter.composerHasText()) {
    throw new Error("your message box has a draft. Send or clear it first, then try again.");
  }

  // Remember which messages already exist, so we can spot the new ones.
  const idsBefore = new Set(adapter.readMessages().map((m) => m.id));

  adapter.typeIntoComposer(BRIEF_PROMPT);
  await adapter.sendMessage();
  console.log("[ContextBridge] brief requested, waiting for the reply...");

  const reply = await waitForBriefReply(adapter, idsBefore);

  // Everything after the marker line is the brief itself.
  const briefText = reply.text.slice(reply.text.indexOf(BRIEF_MARKER) + BRIEF_MARKER.length).trim();

  // The prompt we sent is the new user message just before the reply.
  const promptMessage = adapter
    .readMessages()
    .find((m) => m.role === "user" && !idsBefore.has(m.id));

  await cbStorage.update(conversationId, (stored) => {
    stored = stored || cbStorage.blank(conversationId, adapter.name);
    stored.brief = { text: briefText, messageId: reply.id, createdAt: Date.now() };

    // Remember ContextBridge's own messages so the handoff can leave them out later.
    const internal = new Set(stored.internalIds || []);
    internal.add(reply.id);
    if (promptMessage) internal.add(promptMessage.id);
    stored.internalIds = [...internal];

    return stored;
  });

  console.log(`[ContextBridge] brief saved (${briefText.length} characters)`);
  return briefText;
}
