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
- **Emergencies, Lockouts, & Extra Supplies MUST BE VERIFIED:** If a guest reports a physical emergency, a lockout, or requests extra supplies (like fresh towels), DO NOT say that someone will come by shortly or remotely pop any locks, as staff is not on-hand all the time. Instead, you MUST ask them to confirm their phone number OR their last name and room number. Wait for them to provide it. Only AFTER they provide it, tell them: "Thank you. I have sent an alert to management. They will text or contact you shortly to get this sorted out for you!"
- **Booking Inquiries:** DO NOT hand off to John; simply direct them to book on our main website!

Local Directory (Tier 1 Knowledge):
- Dining & Watering Holes: Always provide direct Google Maps links to ANY restaurant or bar you recommend. When they click the link, it should take them directly to that specific place on Google Maps. For "watering holes" or bars, suggest a few different options (such as The Limberlost, Nottingham Bar, etc.) rather than just one, and provide Google Maps links for each.
- Rentals: A SXS Rental (ATV/Snowmobile), Good Days Marina (Boat).
- Supplies: Bayside Bait & Tackle (Fuel/ice), Walmart.
- Trails: Marl Lake Trail.
- Boat Ramps & General Tourism: You can list local boat ramps. You MUST also send all guests the link to the Houghton Lake Area Tourism Bureau: https://www.visithoughtonlake.com/

Instructions: If asked about Live Weather, Ice Thickness (DNR), or current trail conditions, you MUST use your search tools to get real-time info.
`;

app.post('/api/chat', async (req, res) => {
  try {
    const { history, message, guestToken } = req.body;
    
    // In actual production, we would lookup guestToken in Airtable here
    // and append their preferences to the system prompt.

    // 1. Kick off non-blocking background Intent Analyzer to extract context and alert John (Zero Latency!)
    classifyAndNotifyOwner(history, message, guestToken).catch(e => console.error("Webhook error:", e));

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
// Uses a tiny, fast AI call to extract context from the chat history and trigger structured JSON to Make.com
async function classifyAndNotifyOwner(historyArray, currentMessage, guestToken) {
  if (!process.env.MAKE_WEBHOOK_URL) return;
  if (!currentMessage || currentMessage.length < 5) return;

  const formattedHistory = historyArray.map(msg => `${msg.role.toUpperCase()}: ${msg.text}`).join('\n');

  const prompt = `You are a silent data-extraction tool analyzing a conversation between a hotel guest and an AI concierge.
  Review the chat history. Did the guest report a physical emergency, a lockout, or request extra supplies AND explicitly supply a phone number OR their last name and room number for verification?
  
  If NO (or if they haven't provided any identifying details yet), reply with exactly the word NO.
  
  If YES, extract their details and respond with ONLY a valid JSON object matching this schema:
  {
    "is_emergency_or_supply_request": true,
    "guest_name": "Extracted name or 'Unknown'",
    "room_number": "Extracted room number or 'Unknown'",
    "verification_phone_number": "Extracted phone number or 'Unknown'",
    "issue_description": "Brief summary of what they need"
  }
  
  Chat History:
  ${formattedHistory}
  GUEST'S LATEST MESSAGE: ${currentMessage}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt
  });

  const text = response.text.trim();
  if (text === "NO" || text.includes('"NO"')) return;

  try {
    // Strip markdown formatting if Gemini wrapped it in \`\`\`json
    const cleanJson = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const payload = JSON.parse(cleanJson);
    payload.guestToken = guestToken || 'unknown';
    payload.original_message = currentMessage;

    console.log(`🚨 ALERT TRIGGERED: Sending structured JSON payload to Make.com:`, payload);
    await fetch(process.env.MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Failed to parse or send background webhook JSON:", e);
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
