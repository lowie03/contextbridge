# ContextBridge

**Don't lose your AI work when the chat stops.**

ContextBridge is a Chrome extension for ChatGPT. While you chat, it keeps a running brief of your work on your own computer. When ChatGPT says the chat is full or you've hit a limit, it hands you a ready-to-paste handoff, so another AI (Claude, Gemini, or a new ChatGPT chat) can pick up exactly where you stopped, without you explaining everything again.

## The problem

You spend an hour with an AI building something: explaining requirements, making decisions, fixing bugs. Then the chat hits its limit. The next AI knows nothing, and you have to reconstruct the whole project from memory.

## What it does

- **Saves your conversation as you chat**, locally in your browser.
- **Keeps a brief up to date in the background**, written by Chrome's built-in AI (Gemini Nano) on your own computer. It never appears in your chat and uses none of your ChatGPT messages.
- **Watches for limits.** When ChatGPT shows "Chat memory full" or a limit warning, the ContextBridge tab turns red and the panel opens with your handoff ready.
- **Builds a complete handoff**: the brief plus any messages it doesn't include yet, with instructions so the next AI continues the work instead of summarizing it back to you.
- **Optional detailed brief from ChatGPT**, if you want a higher-quality brief before switching (uses one message).

## Install

ContextBridge isn't on the Chrome Web Store yet. To try it:

1. Download this repository: **Code → Download ZIP**, then unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped `contextbridge` folder.
5. Open or refresh a chat on chatgpt.com. The ContextBridge tab appears on the right edge of the page.

## How to use it

- **Hover the tab** to see the status. The ring shows how up to date your brief is.
- **Click the tab** to open the panel: preview the brief, update it, or copy your handoff.
- **When a limit appears**, the panel opens by itself. Click **Copy handoff** and paste it into your next AI.

## Privacy

- Your conversations and briefs are stored **only in your browser**, on your computer.
- Background briefs are written by **Chrome's on-device AI**. Your chats are not sent to any server by ContextBridge.
- ContextBridge has no account, no backend and no analytics.

## Limitations

- **ChatGPT only** for now. Claude and Gemini support is in progress.
- **Desktop Chrome only.** Extensions don't run in the ChatGPT apps or on mobile.
- **Background briefs need a computer that can run Chrome's built-in AI.** Without it, the handoff still includes every saved message, just without a summary.
- **Usage-limit detection hasn't been confirmed against a real usage-limit banner yet.** "Chat memory full" detection is confirmed.
- Limit detection reads ChatGPT's **English** wording.
- ContextBridge reads ChatGPT's page, so a ChatGPT redesign can break it until it's updated.

## How it works

| Part | Role |
|---|---|
| `adapters/chatgpt.js` | Everything specific to ChatGPT's page: reading messages, the message box, limit banners |
| `content.js` | Watches the page and saves messages as they appear |
| `storage.js` | Saves conversations in `chrome.storage.local`, one change at a time |
| `localbrief.js` + `background.js` | Keep the brief updated with Chrome's built-in AI (Prompt API) |
| `brief.js` | Asks ChatGPT for a detailed brief on request |
| `handoff.js` | Assembles the text you copy |
| `panel.js` | The edge tab and panel, isolated in a Shadow DOM |

Built with Manifest V3, content scripts, Shadow DOM, a service worker, `chrome.storage` and the Prompt API.

