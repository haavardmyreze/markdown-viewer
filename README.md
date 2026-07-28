# Quiet Reader

A calm, typography-focused document viewer. Opens Markdown, PDF, CSV, images, and code in one consistent reading surface — with contents, search, comments, an AI assistant, and a presentation mode (laser pointer + ink annotation) built in.

Press the **Present** button in the toolbar (or `L` for laser, `D` to draw) to fade the chrome away and present a document; `Esc` exits. The command palette is on `Ctrl Space`.

## Run locally

```bash
npm install
npm run dev
```

## Document library

Add Markdown files to the `library/` folder in this project:

```
markdown-viewer/library/
  welcome.md
  your-guide.md
  guides/naming-conventions.md
```

Every `.md` file is picked up automatically and listed in the **Library** menu — no configuration or file picker needed. Titles come from the document's first `#` heading.

Subfolders are supported. Files named `README.md` or starting with `_` are ignored.

You can still use **Load Markdown** to open a one-off file from disk.

### Deep links

Open a library document directly:

```
http://localhost:5173/?doc=welcome
http://localhost:5173/?doc=guides/naming-conventions
```

The last opened library document is remembered in the browser.

## Firefox extension

The extension is a thin redirect layer: it opens markdown in the hosted viewer at [usd-pipeline-k7aa.vercel.app](https://usd-pipeline-k7aa.vercel.app/). Deploying the web app updates the reader for everyone without reinstalling the add-on.

```bash
npm run build:firefox-extension
```

For a one-file install package:

```bash
npm run package:firefox-extension
```

This creates:

```
markdown-viewer/dist-firefox-extension/
markdown-viewer/release/firefox-extension/quiet-reader-markdown.xpi
```

Install the `.xpi` in Firefox:

1. Open `about:addons`
2. Click the gear icon
3. Choose **Install Add-on From File…**
4. Select `release/firefox-extension/quiet-reader-markdown.xpi`

For development (reload on every restart), you can still use temporary install:

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Choose `dist-firefox-extension/manifest.json`

### Signed builds (optional, permanent install)

To produce a Mozilla-signed package for unlisted distribution:

1. Create API credentials at [addons.mozilla.org](https://addons.mozilla.org/developers/addon/api/key/)
2. Set environment variables:
   - `WEB_EXT_API_KEY`
   - `WEB_EXT_API_SECRET`
3. Run:

```bash
npm run sign:firefox-extension
```

Signed output is written to `release/firefox-extension-signed/`.

Extension behavior:

- Auto-redirects `.md` / `.markdown` pages to `https://usd-pipeline-k7aa.vercel.app/?src=...`
- For local `file://` markdown, the extension reads the file and passes the content to the viewer (web pages cannot fetch `file://` URLs directly)
- Adds right-click actions:
  - **Open Markdown in Quiet Reader** (for markdown links)
  - **Open This Page in Quiet Reader** (for markdown pages)
- Toolbar button opens the hosted viewer home page

Change the viewer URL in `extension/viewer-url.js` if you deploy to a different host.

## Windows launcher (Open with)

Use the scripts in `launcher/` to open local files in the hosted viewer from Explorer.

```powershell
cd markdown-viewer/launcher
powershell -ExecutionPolicy Bypass -File .\Register-ViewerAssociations.ps1
```

Then set **Open with → Quiet Reader → Always** for the file types you want. See `launcher/README.md` for details.

## Ask about this document

Open a document and click **Ask** in the reader toolbar to chat about the current file, powered by Anthropic's Claude API.

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/)
2. Run the app with `npm run dev` or `npm run preview` (Claude requests go through a built-in proxy to avoid browser CORS blocks)
3. In connection settings, paste your API key, pick a model (default **Claude 3.5 Haiku**), and click **Test connection**

Your API key is stored in the browser's local storage on this machine only. Static hosting without a proxy cannot reach the Claude API from the browser — use the dev or preview server, or configure your own reverse proxy to `https://api.anthropic.com`.

**Context mode:** the complete document is sent once per chat session and reused for follow-up questions.

**Prompt caching (Claude):** The document system prompt is marked for Anthropic prompt caching, so follow-up questions in the same session reuse cached context when the prompt is unchanged (especially in full-document mode). In dev mode, cache hit/miss stats are logged to the browser console.
