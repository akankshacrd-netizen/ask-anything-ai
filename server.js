const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3.2:1b",
        messages: req.body.messages,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error("Ollama returned an error");
    }

    const data = await response.json();

    res.json({
      answer: data.message.content
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      answer: "Could not connect to Ollama."
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI website running at http://localhost:${PORT}`);
});