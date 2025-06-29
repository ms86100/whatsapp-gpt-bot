const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");

const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/gupshup-webhook", async (req, res) => {
  try {
    const incomingMsg = req.body.payload.payload.text;
    const from = req.body.payload.sender.phone;

    console.log("From:", from);
    console.log("Message:", incomingMsg);

    const chat = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: incomingMsg }],
    });

    const reply = chat.choices[0].message.content;

    res.json({
      output: [{ type: "text", value: reply }]
    });

  } catch (err) {
    console.error("Error:", err);
    res.json({
      output: [{ type: "text", value: "An error occurred. Please try again later." }]
    });
  }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));