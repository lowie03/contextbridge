// handoff.js — turn a saved conversation into the text you paste into the next AI.
// Works without any AI: it only assembles text from what's already saved.

// Upper limit for pasted message history, so the handoff stays pasteable.
const HANDOFF_MAX_CHARS = 60000;

const CONTINUE_INSTRUCTIONS = `Please don't summarize this back to me. Acknowledge where we are in one or two sentences, then either suggest the next step or give me two options to choose from, and continue from there.`;

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Is this message ContextBridge's own (a brief prompt or a brief reply)?
function isInternalMessage(conversation, id) {
  if ((conversation.internalIds || []).includes(id)) return true;
  return conversation.messages[id]?.text.includes(BRIEF_MARKER) ?? false;
}

// Turn a list of message IDs into real messages, skipping ContextBridge's own.
function realMessages(conversation, ids) {
  return ids
    .filter((id) => !isInternalMessage(conversation, id))
    .map((id) => conversation.messages[id])
    .filter(Boolean);
}

// Messages that come after the brief in the conversation.
function messagesSinceBrief(conversation) {
  const index = conversation.order.indexOf(conversation.brief.messageId);
  if (index === -1) return [];
  return realMessages(conversation, conversation.order.slice(index + 1));
}

// Format messages as a transcript, keeping the newest ones if it gets too long.
function formatTranscript(messages, maxChars) {
  const lines = [];
  let used = 0;
  let omitted = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const line = `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.text}`;

    if (used + line.length > maxChars && lines.length > 0) {
      omitted = i + 1; // this message and everything before it won't fit
      break;
    }
    lines.unshift(line);
    used += line.length + 2;
  }

  const note = omitted
    ? `(The ${pluralize(omitted, "earliest message")} ${omitted === 1 ? "was" : "were"} left out to save space.)\n\n`
    : "";
  return note + lines.join("\n\n");
}

// Returns { text, summary }: the handoff itself, and a short description for the panel.
function buildHandoff(conversation) {
  const intro = `I'm continuing a project I was working on with another AI assistant (${conversation.provider}), which hit its usage limit.`;

  // Case 1 and 2: there is a brief.
  if (conversation.brief) {
    const briefBlock = `--- HANDOFF BRIEF ---\n${conversation.brief.text}\n--- END OF BRIEF ---`;
    const since = messagesSinceBrief(conversation);

    if (since.length === 0) {
      return {
        text: `${intro} Below is a brief of the work so far.\n\n${CONTINUE_INSTRUCTIONS}\n\n${briefBlock}`,
        summary: "the brief (it's up to date).",
      };
    }

    const recent = formatTranscript(since, HANDOFF_MAX_CHARS);
    return {
      text: `${intro} Below is a brief of the work, followed by the messages we exchanged after the brief was written. The later messages are newer: where they disagree with the brief, they win.

${CONTINUE_INSTRUCTIONS}

${briefBlock}

--- MESSAGES SINCE THE BRIEF (${since.length}) ---
${recent}
--- END OF MESSAGES ---`,
      summary: `the brief + ${pluralize(since.length, "newer message")}.`,
    };
  }

  // Case 3: no brief, so send the saved conversation itself.
  const all = realMessages(conversation, conversation.order);
  if (all.length === 0) return { text: "", summary: "nothing yet." };

  const transcript = formatTranscript(all, HANDOFF_MAX_CHARS);
  return {
    text: `${intro} There's no summary, so below is our conversation itself. Read it to understand the project, the decisions we made, and where we stopped.

${CONTINUE_INSTRUCTIONS}

--- CONVERSATION ---
${transcript}
--- END OF CONVERSATION ---`,
    summary: `the saved conversation (${pluralize(all.length, "message")}), no brief.`,
  };
}
