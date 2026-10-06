# Ask Anything AI

A simple ChatGPT-style website.

## Run it
Open `index.html` in a browser for the interface.

## Connect real AI
The frontend sends:
POST /api/chat
JSON: { "messages": [{"role":"user","content":"..."}] }

Your backend should return:
{ "answer": "..." }

Keep your AI API key on the server — never put a secret API key in `index.html`.

## Suggested structure
ask-anything-ai/
  index.html
  README.md

You can deploy the frontend on Vercel, Netlify, GitHub Pages, etc. A server/serverless function is needed for the `/api/chat` endpoint.
