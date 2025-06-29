require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const client = new Client({ authStrategy: new LocalAuth() });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const chatHistory = {};
const messageCount = {};

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp Web client ready!'));

client.on('message', async msg => {
  // Skip groups and broadcasts
  if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') return;

  const incoming = msg.body.trim();
  const contact = await msg.getContact();
  const senderName = contact.pushname || contact.number;
  const senderId = msg.from;

  // ❌ Don't respond to known/saved contacts
  if (contact.isMyContact) return;

  console.log(`📩 Message from ${senderName}: ${incoming}`);

  // Repetition check
  if (!messageCount[senderId]) messageCount[senderId] = {};
  messageCount[senderId][incoming] = (messageCount[senderId][incoming] || 0) + 1;

  if (messageCount[senderId][incoming] > 2) {
    await msg.reply(`Hi ${senderName}, as per RBI Fair Practice Code Section 6(c), repeated or threatening messages are not permitted.\n\nThanks`);
    return;
  }

  // Session state for sender
  if (!chatHistory[senderId]) {
    chatHistory[senderId] = {
      stage: 'start',
      bankConfirmed: false,
      askedForFile: false,
      fileSent: false,
      greeted: false
    };
  }

  const session = chatHistory[senderId];

  // Greeting detection
  const politeTriggers = ['hi', 'hello', 'hey', '🙏', '👍'];
  if (incoming.length < 5 || politeTriggers.includes(incoming.toLowerCase())) {
    let greeting = `Hi ${senderName}, I'm currently unavailable. If urgent, please contact my legal representative at 9667100653 or 9667889580.`;
    if (!session.greeted) {
      greeting += `\n\nThanks, Sagar Sharma`;
      session.greeted = true;
    }
    await msg.reply(greeting);
    return;
  }

  // Threat detection
  const threatKeywords = /visit|field|outside|house|apartment|legal|police|court|final notice|last warning|come to your (?:home|office)/i;
  if (threatKeywords.test(incoming)) {
    await msg.reply(`Hi ${senderName}, as per RBI Fair Practice Code Section 6(d), unauthorized visits to my home or workplace are not allowed. Please communicate through legal channels only.\n\nThanks`);
    return;
  }

  // Bank name detection
  const bankRegex = /(poonawala|bajaj|icici|axis|kotak|hdfc|sbi|rbl|idfc)/i;
  if (!session.bankConfirmed && bankRegex.test(incoming)) {
    session.bankConfirmed = true;
    session.askedForFile = true;
    await msg.reply(`Thanks ${senderName}, would you like to view the document supporting my financial hardship and legal authorization?`);
    return;
  }

  // Intent detection to send PDF
  const intentRegex = /\b(yes|okay|ok|sure|send|share|pls|please|ya|yeah|yup|show me|share it)\b/i;
  if (session.askedForFile && !session.fileSent && intentRegex.test(incoming.toLowerCase())) {
    const medReport = path.join(__dirname, 'files', 'Sister_Medical_Report.pdf');
    const loaDoc = path.join(__dirname, 'files', 'LOA.pdf');

    try {
      if (fs.existsSync(medReport)) {
        await msg.reply(MessageMedia.fromFilePath(medReport));
      }
      if (fs.existsSync(loaDoc)) {
        await msg.reply(MessageMedia.fromFilePath(loaDoc));
      }

      await msg.reply(
        `Due to my sister’s critical medical condition, I’ve been under financial stress. I was maintaining a good credit history until this emergency. Please contact my authorized representative for further discussion. Hope for a fair settlement.\n\nThanks`
      );

      session.fileSent = true;
      return;
    } catch (err) {
      console.error("❌ File send error:", err);
      await msg.reply("Sorry, I was unable to send the document at this time.");
      return;
    }
  }

  // Ask for bank name if unknown
  if (session.stage === 'start') {
    await msg.reply(`Hi ${senderName}, may I know which bank you're representing?`);
    session.stage = 'asked_bank';
    return;
  }

  // GPT fallback for uncategorized messages
  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: 'system',
          content: `You are helping Sagar Sharma respond to recovery agents. He has authorized legal representatives to handle his case due to a medical emergency. Be brief, polite, assertive. If a document was already offered or sent, do not resend. Respond with RBI guidelines if threatened.`
        },
        { role: 'user', content: incoming }
      ]
    });
    const reply = chat.choices[0].message.content.trim();
    await msg.reply(reply);
  } catch (err) {
    console.error("❌ GPT Error:", err.message);
    await msg.reply("I'm currently unavailable. If urgent, please contact 9667100653 or 9667889580.\n\nThanks");
  }
});

client.initialize();
