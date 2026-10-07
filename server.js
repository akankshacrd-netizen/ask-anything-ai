const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CHAT_MODEL = "gemini-3.8-flash";
const LIVE_MODEL = "gemini-3.8-live";

app.use(cors());

app.use(
  express.json({
    limit: "30mb"
  })
);

app.use(express.static(__dirname));


// ======================================================
// SYSTEM INSTRUCTION
// ======================================================

const SYSTEM_INSTRUCTION = `
You are Ask Anything AI, a fast, accurate and friendly AI assistant.

Answer the user's question directly and clearly.

Rules:
- Be accurate and useful.
- Explain complicated things simply.
- Do not unnecessarily repeat the question.
- Use short paragraphs and lists when helpful.
- For coding, provide working code and clear steps.
- For school questions, explain the reasoning.
- If you are unsure, say so rather than inventing facts.
`;


// ======================================================
// NORMAL AI CHAT
// ======================================================

app.post("/api/chat", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        answer: "AI service is not configured."
      });
    }

    const incoming = Array.isArray(req.body.messages)
      ? req.body.messages
      : [];

    const contents = [];

    // Add system instruction as the first user/model context
    contents.push({
      role: "user",
      parts: [
        {
          text: SYSTEM_INSTRUCTION
        }
      ]
    });

    contents.push({
      role: "model",
      parts: [
        {
          text: "Understood."
        }
      ]
    });


    for (const message of incoming) {
      if (
        !message ||
        (message.role !== "user" && message.role !== "assistant")
      ) {
        continue;
      }

      const parts = [];

      if (message.content) {
        parts.push({
          text: String(message.content)
        });
      }


      // --------------------------------------------------
      // IMAGE + PDF ATTACHMENTS
      // --------------------------------------------------

      if (
        message.role === "user" &&
        Array.isArray(message.attachments)
      ) {
        for (const file of message.attachments) {
          if (
            !file ||
            typeof file.data !== "string"
          ) {
            continue;
          }

          const match = file.data.match(
            /^data:([^;]+);base64,(.+)$/
          );

          if (!match) {
            continue;
          }

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


      if (parts.length > 0) {
        contents.push({
          role:
            message.role === "assistant"
              ? "model"
              : "user",
          parts
        });
      }
    }


    if (contents.length <= 2) {
      return res.status(400).json({
        answer: "Please enter a message."
      });
    }


    // --------------------------------------------------
    // GEMINI REQUEST
    // --------------------------------------------------

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents
        })
      }
    );


    const data = await response.json();


    if (!response.ok) {
      console.error(
        "Gemini chat error:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        answer:
          data.error?.message ||
          "The AI service is temporarily unavailable."
      });
    }


    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim() ||
      "No answer returned.";


    res.json({
      answer
    });

  } catch (error) {
    console.error(
      "Chat server error:",
      error
    );

    res.status(500).json({
      answer:
        "Could not connect to the AI service."
    });
  }
});


// ======================================================
// GEMINI LIVE EPHEMERAL TOKEN
// ======================================================
//
// IMPORTANT:
// We intentionally create a BASIC ephemeral token here.
// The browser sends the Live model/configuration after
// connecting. This avoids the liveConnectConstraints
// error that appeared in your Render logs.
// ======================================================

app.post("/api/live-token", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error:
          "GEMINI_API_KEY is not configured."
      });
    }


    const now = Date.now();


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

          expireTime: new Date(
            now + 30 * 60 * 1000
          ).toISOString(),

          newSessionExpireTime: new Date(
            now + 60 * 1000
          ).toISOString()
        })
      }
    );


    const data = await response.json();


    if (!response.ok) {
      console.error(
        "Gemini Live token error:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        error:
          data.error?.message ||
          "Could not create a Live voice session."
      });
    }


    if (!data.name) {
      console.error(
        "Gemini Live returned no token:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        error:
          "Gemini did not return a Live voice token."
      });
    }


    console.log(
      "Gemini Live token created successfully."
    );


    res.json({
      token: data.name,
      model: LIVE_MODEL
    });

  } catch (error) {
    console.error(
      "Live token server error:",
      error
    );

    res.status(500).json({
      error:
        "Could not create a Live voice session."
    });
  }
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Ask Anything AI",
    chatModel: CHAT_MODEL,
    liveModel: LIVE_MODEL
  });
});


// ======================================================
// START SERVER
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `AI server running on port ${PORT}`
    );

    console.log(
      `Chat model: ${CHAT_MODEL}`
    );

    console.log(
      `Live model: ${LIVE_MODEL}`
    );
  }
);
