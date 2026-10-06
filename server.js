const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Allow JSON requests containing images
app.use(express.json({ limit: "15mb" }));

app.use(express.static(__dirname));

app.post("/api/chat", async (req, res) => {
  try {
    const contents = (req.body.messages || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const parts = [];

        // Add text
        if (m.content) {
          parts.push({
            text: String(m.content)
          });
        }

        // Add uploaded image
        if (m.image && typeof m.image === "string") {
          const match = m.image.match(
            /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
          );

          if (match) {
            parts.push({
              inline_data: {
                mime_type: match[1],
                data: match[2]
              }
            });
          }
        }

        return {
          role: m.role === "assistant" ? "model" : "user",
          parts
        };
      });

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: contents
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      throw new Error("Gemini API returned an error");
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "No answer returned.";

    res.json({ answer });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      answer: "Could not connect to the AI service."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI server running on port ${PORT}`);
});
