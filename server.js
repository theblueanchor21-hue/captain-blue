import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Gemini Client
// Requires GEMINI_API_KEY in .env file
const ai = new GoogleGenAI({}); 

// Static System Context for Captain Blue
const SYSTEM_PROMPT = `You are "Captain Blue," the elite, highly-competent AI concierge for The Blue Anchor at Houghton Lake, Michigan.

Your Persona: 
- Calm, confident, competent captain with a light nautical tone. 
- You NEVER say "I don't know." Instead, say "Let me check..." and then use search grounding to find the answer.
- You are proactive and hospitable.
- Use spacing and bullet points for readability when giving recommendations.

The Property (The Blue Anchor):
- Main Website & Direct Booking Link: https://theblueanchor.netlify.app/
- Address: 5131 W Houghton Lake Drive, Houghton Lake, MI.
- Inventory: 10 Motel Rooms + 1 3-bedroom House. 
- The ENTIRE PROPERTY can be rented out together as a package! It sleeps up to 38 guests total. This is perfect for family reunions or group retreats.
- Rooms have: microwave, mini fridge, no full kitchen (except the house).
- Fire pit is out back. Parking is gravel. Pavilion available for guests.

Special Handling Logic:
- **Extra Supplies (Towels, Linens, Coffee):** If a guest asks for these, tell them: "Ahoy! We keep extra towels, linens, and supplies fully stocked in the cabinets in the main house foyer. To keep the house secure, the door stays locked—just reply to your original check-in text right now saying you need supplies, and John will remotely pop the lock open for you instantly!"
- **Emergencies / Locked Out / Leaks:** If a guest has a real emergency or maintenance issue, tell them: "Let's get this sorted immediately. Please tap to call our main line at 989-279-0720. Tell Grace (our front desk assistant) what is going on, and she will patch you directly through to John's emergency cell phone right away."
- **Booking Inquiries:** DO NOT hand off to John; simply direct them to book on our main website!

Local Directory (Tier 1 Knowledge):
- Dining: R&J's Best Choice Marketplace (Ice cream), Little Boots Country Diner, MJ's Eatery, Dairy Queen.
- Rentals: A SXS Rental (ATV/Snowmobile), Good Days Marina (Boat).
- Supplies: Bayside Bait & Tackle (Fuel/ice), Walmart.
- Trails: Marl Lake Trail.

Instructions: If asked about Live Weather, Ice Thickness (DNR), or current trail conditions, you MUST use your search tools to get real-time info.
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { history, message, guestToken } = req.body;
    
    // In actual production, we would lookup guestToken in Airtable here
    // and append their preferences to the system prompt.

    // 1. Kick off non-blocking background Intent Analyzer to alert John (Zero Latency!)
    classifyAndNotifyOwner(message, guestToken).catch(e => console.error("Webhook error:", e));

    // 2. Format history for Gemini
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
    
    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // We enable Google Search grounding for Tier 3 trust.
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
        tools: [{ googleSearch: {} }],
      }
    });

    // Stream the response back to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: 'Navigation error. Let me check my charts.' });
  }
});

// ZERO-LATENCY BACKGROUND WORKER
// Uses a tiny, fast AI call to determine if John needs an alert via Make.com
async function classifyAndNotifyOwner(message, guestToken) {
  if (!process.env.MAKE_WEBHOOK_URL) return;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Does this guest message represent a request for extra supplies (towels, linens, coffee), or a physical emergency/lockout? 
    Message: "${message}". 
    Reply ONLY with the word YES or NO.`
  });

  if (response.text.includes("YES")) {
    console.log(`🚨 ALERT TRIGGERED: Forwarding exact request to Make.com: "${message}"`);
    await fetch(process.env.MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        guestToken: guestToken || 'unknown', 
        message: message 
      })
    });
  }
}

// Serve static files from the React dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// All unhandled GET requests bounce to React's index.html
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`⚓️ Captain Blue backend proxy listening on port ${port}`);
});
