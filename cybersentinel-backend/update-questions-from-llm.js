const track = process.argv[2] || 'corporate';

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
require('dotenv').config();
const { jsonrepair } = require('jsonrepair');


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const crypto = require('crypto');


function makeStableId(text) {
  // Hash the question text → consistent ID
  return 'q-' + crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
}

async function generateUpdatedQuestions(track='corporate') {
  // *** THIS PROMPT HAS BEEN UPDATED ***
  const prompt = `
    You are a cybersecurity training expert. You are a cybersecurity training expert. 
    Generate a series of ${track === 'personal' ? 'personal/home-user' : 'corporate'} security assessment questions.

    OUTPUT RULES:
    1) Respond ONLY with a single valid JSON object. Do not include markdown, comments, or extra text.
    2) Each question MUST follow this shape:
    {
      "text": "...",
      "options": ["..."],
      "category": "technical" | "behavioral" | "psychological",
      "patterns": {
        "weights": {
          "technical": { "<option>": <number>, ... },
          "behavioral": { "<option>": <number>, ... },
          "psychological": { "<option>": <number>, ... }
        },
        "risk_tags": { "<tagName>": { "<option>": <int>, ... } },
        "critical": <true|false>,
        "rationale": { "<option>": "<short explanation>", ... }
      }
      "tags": { "track": "${track}" }
    }

    3) Scoring guidance (use consistently):
    - Very risky option (e.g. clicking malicious link, disabling security): -10 to -12
    - Risky option: -4 to -8
    - Neutral option: 0
    - Partially safe option: +2 to +5
    - Very safe / best practice option: +8 to +10
    - Only assign numbers within these bands.
    - IMPORTANT: Every option MUST appear in the weights for at least one category. 
      Do not leave any option without a weight. 
      If an option is irrelevant to a category, assign 0 explicitly.

    4) Risk tags:
    - Use tags like phishingAwareness, deviceSecurity, identity, vendorRisk, remoteWork.
    - Increment tag (1 or 2) only for risky/very risky options.

    5) At least 3 questions must target remote workers.

    6) Focus on emerging threats: AI-powered phishing, deepfake voice scams, supply chain attacks, remote security.

    EXAMPLE (follow this style exactly):
    {
      "q-example1": {
        "text": "When you receive a suspicious email asking you to reset your password, what do you do?",
        "options": ["Click the link immediately", "Ignore the email", "Report to IT/Security", "Verify the sender via phone"],
        "category": "behavioral",
        "patterns": {
          "weights": {
            "technical": {},
            "behavioral": {
              "Click the link immediately": -12,
              "Ignore the email": -2,
              "Report to IT/Security": 10,
              "Verify the sender via phone": 8
            },
            "psychological": {}
          },
          "risk_tags": {
            "phishingAwareness": {
              "Click the link immediately": 2,
              "Ignore the email": 1
            }
          },
          "critical": true,
          "rationale": {
            "Click the link immediately": "This directly exposes credentials to phishing.",
            "Ignore the email": "Ignoring suspicious emails may allow attacks to continue unnoticed."
          }
        }
      }
    }
    NOW generate at least 15 more questions in this JSON format (with unique IDs).
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log("🧠 Calling Gemini 2.5 Flash API with improved prompt...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    let jsonString = rawText.trim();
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonString = jsonMatch[1].trim();
    function validateQuestions(qs) {
      const errs = [];
      const must = ["text", "options", "category", "patterns"];
      const CATS = new Set(["technical","behavioral","psychological"]);
    
      for (const [qid, q] of Object.entries(qs)) {
        // Required fields
        for (const k of must) if (!(k in q)) errs.push(`${qid}: missing "${k}"`);
    
        // Category gate
        if (q.category && !CATS.has(q.category)) {
          errs.push(`${qid}: invalid category "${q.category}"`);
        }
    
        // Options basic checks
        if (!Array.isArray(q.options) || q.options.length < 2) {
          errs.push(`${qid}: options must be an array of >= 2`);
        }
    
        // Patterns shape
        const p = q.patterns || {};
        if (!p.weights || typeof p.weights !== "object") errs.push(`${qid}: patterns.weights missing`);
        if (!p.risk_tags || typeof p.risk_tags !== "object") errs.push(`${qid}: patterns.risk_tags missing`);
        if (typeof p.critical !== "boolean") errs.push(`${qid}: patterns.critical must be boolean`);
        if (!p.rationale || typeof p.rationale !== "object") errs.push(`${qid}: patterns.rationale missing`);
    
        // Ensure every option has weights when a category map is provided
        if (p.weights && typeof p.weights === "object") {
          for (const c of ["technical","behavioral","psychological"]) {
            if (p.weights[c] && Object.keys(p.weights[c]).length) {
              for (const opt of q.options) {
                if (!(opt in p.weights[c])) {
                  console.warn(`ℹ️ Auto-filling 0 for missing weight: ${qid} -> weights.${c}["${opt}"]`);
                  p.weights[c][opt] = 0; // neutral
                }
              }
            }
          }
        }        
      }
    
      if (errs.length) {
        const msg = "Validation failed:\n" + errs.map(e => "- " + e).join("\n");
        throw new Error(msg);
      }
    }
    
    let updatedQuestions;
    try {
      updatedQuestions = JSON.parse(jsonString);
    } catch (err) {
      console.warn("⚠️ JSON parse failed, trying repair...");
      updatedQuestions = JSON.parse(jsonrepair(jsonString));
    }
    validateQuestions(updatedQuestions);
    await syncQuestionsToAPI(updatedQuestions);
    console.log(`✅ Successfully generated and synced ${Object.keys(updatedQuestions).length} questions.`);

  } catch (error) {
    console.error("❌ Error updating questions:", error.message);
    process.exit(1);
  }
}

async function syncQuestionsToAPI(questions) {
  try {
    const stableQuestions = {};

    for (const [qid, q] of Object.entries(questions)) {
      // Replace any random question-001 with deterministic hash
      const newId = makeStableId(q.text);
      stableQuestions[newId] = { ...q, tags: { ...(q.tags || {}), track }};
    }

    const adminToken = process.env.ADMIN_JWT_TOKEN;
    if (!adminToken) throw new Error('ADMIN_JWT_TOKEN is not set in .env file.');

    console.log("📡 Syncing questions to backend...");

    const response = await axios.post(
      'http://localhost:5000/api/llm/sync-questions',
      stableQuestions,
      { headers: { 'Authorization': `Bearer ${adminToken}` }, timeout: 20000 }
    );

    if (response.data.success) {
      console.log('✅ Sync successful:', response.data.message);
    } else {
      throw new Error('Sync API returned failure: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    const errorData = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('❌ Sync API Error:', errorData);
    throw error;
  }
}

generateUpdatedQuestions(track);