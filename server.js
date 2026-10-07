const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());

app.use(
  express.json({
    limit: "35mb"
  })
);

app.use(express.static(__dirname));

const CHAT_MODEL = "gemini-3.8-flash";
const LIVE_MODEL = "gemini-3.8-live";

const SYSTEM_INSTRUCTION = `
You are Ask Anything AI, a helpful, accurate and concise AI assistant.

Rules:
- Answer the user's actual question directly.
- Never invent facts, sources, numbers, events, or capabilities.
- If you are uncertain, clearly say that you are uncertain.
- For calculations, carefully verify the result before answering.
- Use information from attached images and PDFs when provided.
- Do not claim to have seen or read something that was not provided.
- Keep normal answers reasonably concise unless the user asks for detail.
- In voice conversations, speak naturally and avoid unnecessary formatting.
`;

function requireKey(res) {
  if (!GEMINI_API_KEY) {
    res.status(500).json({
      error: "GEMINI_API_KEY is not configured on the server."
    });
    return false;
  }

  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(status) {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

/* ---------------- NORMAL CHAT ---------------- */

app.post("/api/chat", async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const incoming = Array.isArray(req.body.messages)
      ? req.body.messages
      : [];

    const contents = incoming
      .filter(
        m =>
          m &&
          (m.role === "user" || m.role === "assistant")
      )
      .map(m => {
        const parts = [];

        if (m.content) {
          parts.push({
            text: String(m.content)
          });
        }

        if (
          m.role === "user" &&
          Array.isArray(m.attachments)
        ) {
          for (const file of m.attachments) {
            if (
              !file ||
              typeof file.data !== "string"
            ) {
              continue;
            }

            const match = file.data.match(
              /^data:([^;]+);base64,(.+)$/
            );

            if (!match) continue;

            const mimeType = match[1];
            const base64Data = match[2];

            if (
              mimeType.startsWith("image/") ||
              mimeType === "application/pdf"
            ) {
              parts.push({
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              });
            }
          }
        }

        return {
          role:
            m.role === "assistant"
              ? "model"
              : "user",
          parts
        };
      });

    if (!contents.length) {
      return res.status(400).json({
        answer: "Please enter a message."
      });
    }

    const body = {
      system_instruction: {
        parts: [
          {
            text: SYSTEM_INSTRUCTION
          }
        ]
      },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    };

    let lastData = null;
    let lastStatus = 500;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();

        const timeout = setTimeout(
          () => controller.abort(),
          45000
        );

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY
            },
            body: JSON.stringify(body),
            signal: controller.signal
          }
        );

        clearTimeout(timeout);

        const data = await response.json();

        lastData = data;
        lastStatus = response.status;

        if (response.ok) {
          const answer =
            data.candidates?.[0]?.content?.parts
              ?.map(part => part.text || "")
              .join("")
              .trim() ||
            "No answer returned.";

          return res.json({
            answer
          });
        }

        if (!isRetryable(response.status)) {
          break;
        }

        await sleep(400 * (attempt + 1));
      } catch (error) {
        if (attempt === 2) {
          console.error("Gemini request error:", error);
        } else {
          await sleep(400 * (attempt + 1));
        }
      }
    }

    console.error(
      "Gemini final error:",
      lastStatus,
      lastData
    );

    return res.status(503).json({
      answer:
        "The AI service is temporarily unavailable. Please try again."
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      answer:
        "Could not connect to the AI service."
    });
  }
});

/* ---------------- GEMINI LIVE TOKEN ---------------- */

app.post("/api/live-token", async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const now = Date.now();

    const expireTime =
      new Date(
        now + 30 * 60 * 1000
      ).toISOString();

    const newSessionExpireTime =
      new Date(
        now + 60 * 1000
      ).toISOString();

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model: LIVE_MODEL,
            config: {
              responseModalities: ["AUDIO"],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              sessionResumption: {}
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Live token error:",
        data
      );

      return res.status(500).json({
        error:
          "Could not create a Live voice session."
      });
    }

    res.json({
      token: data.name
    });
  } catch (error) {
    console.error(
      "Live token server error:",
      error
    );

    res.status(500).json({
      error:
        "Could not start voice mode."
    });
  }
});

/* ---------------- HEALTH ---------------- */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    chatModel: CHAT_MODEL,
    liveModel: LIVE_MODEL
  });
});

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `AI server running on port ${PORT}`
    );
  }
);
