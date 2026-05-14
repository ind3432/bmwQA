# BMW · AI Configurator

Scan-to-build configurator that turns six taps into a one-of-one BMW render. Designed for the
QR-code-on-a-poster flow: phone scans → opens site → six questions → AI image in ~30 s.

## Stack

- Static HTML/CSS/JS frontend (`public/index.html`) — no framework, mobile-first.
- A single Vercel serverless function (`api/generate.ts`) proxies the Gemini 2.5 Flash Image API.
  The API key lives **only on the server**, read from the `GEMINI_API_KEY` env var. It is never
  shipped to the browser.
- Gallery is persisted in `localStorage` (per-device, as designed).

## Local setup

1. Get a free Gemini key at <https://aistudio.google.com/apikey>.
2. Create a local env file:

   ```bash
   cp .env.example .env.local
   # then edit .env.local and paste your key
   ```

3. Run the dev server (uses `vercel dev` so the function runs locally):

   ```bash
   npm install
   npm run dev
   ```

   Open <http://localhost:3000>.

## Deploy to Vercel

```bash
vercel              # first time: link + create project
vercel env add GEMINI_API_KEY    # set the key on Production + Preview
npm run deploy      # vercel deploy --prod
```

After deploying, point your QR code at the production URL.

## Design notes

- BMW: Bebas Neue display type, brand blue gradient, BMW tri-stripe accent, M-color highlights.
- Apple: frosted glass nav, spring easing on all transitions, generous whitespace, pill-shaped
  buttons, ambient gradient orbs, focus-visible rings, `prefers-reduced-motion` support.
- Mobile-first: 44px+ touch targets, safe-area insets, sticky frosted header, single-column
  options on small screens.

## Security

- `GEMINI_API_KEY` is server-side only. The browser calls `/api/generate`, which calls Gemini.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` are
  set in `vercel.json`.
- Prompt length is capped at 2000 chars in the function.
- `.env.local` is git-ignored.
