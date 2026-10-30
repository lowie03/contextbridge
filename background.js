// background.js — the extension's service worker. Runs Chrome's built-in AI.

const LOCAL_SYSTEM_PROMPT = `You maintain a running handoff brief of a conversation between a user and an AI assistant.
You will receive the current brief (which may be empty) and new messages from the conversation.
Write an updated brief that includes what the new messages add or change.

Use these sections:
Goal: what the user is trying to achieve.
Done so far: completed work.
Decisions: what was decided. If a decision changed, keep only the latest version.
Current status: where things stand right now.
Open issues: errors, questions, unfinished work.
Next steps: the most useful next actions.
Key details: names, versions, settings, file names.

Keep it under 500 words. State each fact once. Plain text only. Output only the brief.`;

const ENGLISH = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "local-brief") return false;

  runLocalBrief(message).then(sendResponse, (err) => sendResponse({ error: err.message }));
  return true; // keeps sendResponse usable until the async work finishes
});

async function runLocalBrief({ previousBrief, transcript }) {
  if (typeof LanguageModel === "undefined") return { error: "unsupported" };

  const availability = await LanguageModel.availability(ENGLISH);
  if (availability !== "available") return { error: availability };

  const params = await LanguageModel.params();
  const session = await LanguageModel.create({
    ...ENGLISH,
    temperature: 0.3, // lower = steadier, more factual summaries
    topK: params.defaultTopK,
    initialPrompts: [{ role: "system", content: LOCAL_SYSTEM_PROMPT }],
  });

  try {
    const prompt = `CURRENT BRIEF:\n${previousBrief || "(none yet)"}\n\nNEW MESSAGES:\n${transcript}\n\nWrite the updated brief.`;

    // Refuse input the model can't hold, instead of letting it fail halfway.
    if (session.measureInputUsage && session.inputQuota) {
      const needed = await session.measureInputUsage(prompt);
      if (needed > session.inputQuota - session.inputUsage) return { error: "too-long" };
    }

    console.log(`[ContextBridge] writing local brief from ${transcript.length} characters of new messages`);
    const text = await session.prompt(prompt);
    return { text: text.trim() };
  } finally {
    session.destroy(); // free the model's memory
  }
}
