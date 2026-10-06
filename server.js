const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(
  express.json({
    limit: "30mb"
  })
);

app.use(express.static(__dirname));

app.post("/api/chat", async (req, res) => {

  try {

    const incoming = req.body.messages || [];

    const contents = incoming
      .filter(m =>
        m.role === "user" ||
        m.role === "assistant"
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

            const match =
              file.data.match(
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

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key":
            process.env.GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      console.error("Gemini error:", data);

      return res.status(500).json({
        answer:
          "The AI service is temporarily unavailable."
      });

    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") ||
      "No answer returned.";

    res.json({
      answer
    });

  } catch (error) {

    console.error("Server error:", error);

    res.status(500).json({
      answer:
        "Could not connect to the AI service."
    });

  }

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
