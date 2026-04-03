# OpenChat

<p align="center">
  <img width="128" height="128" alt="openchat logo" src="https://github.com/user-attachments/assets/d3f37dc0-eb81-4be8-b95f-50c5729661c6" />
</p>

<video src="https://github.com/user-attachments/assets/0e104172-2586-4b7c-b5f9-00b96da2e81c" width="320" height="240" controls></video>


### An open format for sharing conversation histories across different AI chat UIs.

Just talk to your chat client as you would normally, OpenChat will sync the conversation in the background, letting you swap in and out of different clients while maintaining your entire conversation history.

## How It Works

### Browser Extension

A browser extension that captures requests when you're on supported platforms (i.e. `chatgpt.com` or `claude.ai`) and saves your conversation history locally in the browser.

### MCP (optional)

An MCP server that opens a local HTTP server to get the latest conversation history from the browser extension. It exposes the conversations as markdown formatted MCP Resources that you can directly reference inside your coding agent's terminal session. 

You can also use the MCP server on any client that supports it, like Claude Desktop or Open WebUI.

## Setup

> Note: We're early. Once the extension is published to the Chrome Web Store you can download it from there.

- Download the latest release of the extension from the releases page
- Install the extension in Chrome (go to `chrome://extensions/`, turn on "Developer mode" and click `Load unpacked` and select the extension file you just downloaded)

You're good to go! OpenChat will automatically intercept requests to `chatgpt.com` and `claude.ai` and save the conversation history to your browser's local storage. You can pin the extension to the toolbar and click its icon to view your entire conversation history.

### MCP Server

If you want to pull conversations into your terminal agents, you can use the MCP server.

The command to run the MCP server is `npx @p0u4a/openchat`. You can add this to your agent's config.

#### For Claude Code

```
claude mcp add --transport stdio openchat -- "npx @p0u4a/openchat" 
```

#### For Codex

```
codex mcp add openchat -- npx -y @p0u4a/openchat
```

## Supported Platforms

- ChatGPT
- Claude
- Claude Desktop
- Claude Code
- Codex


## TODO

- [ ] Configurable Sync storage
- [ ] Gemini Support?
- [ ] Ollama Support?
