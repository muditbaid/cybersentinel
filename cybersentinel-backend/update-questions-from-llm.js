// update-questions-from-llm.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
require('dotenv').config();

// Initialize Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateUpdatedQuestions() {
  const prompt = `
    You are a cybersecurity training expert. Update the following corporate security assessment questions to reflect emerging threats in 2024.
    Focus on AI-powered phishing, deepfake voice scams, and supply chain attacks.
    Return JSON in the exact format of the original question database.
    Include at least 3 new questions targeting remote workers.
    Keep existing question IDs where possible.

    IMPORTANT: Return ONLY valid JSON. Do not wrap in markdown or add any explanation.

    Example format:
    {
      "question-id": {
        "text": "Question text?",
        "options": ["Option1", "Option2", ...],
        "category": "technical|behavioral|psychological",
        "next": "next-question-id" OR function logic (as object),
        "patterns": { "patternName": { "Option1": score, ... } },
        "tags": ["tag1", "tag2"] // e.g., "remote-work", "ai-phishing"
      }
    }
  `;

  try {
    // Use Gemini 2.5 Flash-Lite — fastest, cheapest, perfect for this task
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      // Optional: Add safety settings if needed
      // safetySettings: [
      //   { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      // ]
    });

    console.log("🧠 Calling Gemini 2.5 Flash-Lite API...");

    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    // Log raw output for debugging (optional)
    // console.log("Raw LLM Output:", rawText);

    // Gemini sometimes wraps JSON in ```json ... ``` — let’s extract it
    let jsonString = rawText.trim();
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1].trim();
    }

    // Parse the JSON
    let updatedQuestions;
    try {
      updatedQuestions = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(`Failed to parse LLM output as JSON. Raw output:\n${jsonString}`);
    }

    // Validate it's an object
    if (typeof updatedQuestions !== 'object' || updatedQuestions === null) {
      throw new Error("LLM did not return a valid JSON object.");
    }

    // Sync to your backend
    await syncQuestionsToAPI(updatedQuestions);

    console.log(`✅ Successfully updated ${Object.keys(updatedQuestions).length} questions.`);
  } catch (error) {
    console.error("❌ Error updating questions:", error.response?.data || error.message || error);
    process.exit(1); // Exit with error code for cron jobs
  }
}

async function syncQuestionsToAPI(questions) {
  try {
    const adminToken = process.env.ADMIN_JWT_TOKEN;
    if (!adminToken) {
      throw new Error('ADMIN_JWT_TOKEN is not set in .env file. Get it from /api/auth/login response.');
    }

    console.log("📡 Syncing questions to backend...");

    const response = await axios.get('http://localhost:5000/api/sync-questions-from-llm', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      timeout: 10000 // 10s timeout
    });

    if (response.data.success) {
      console.log('✅ Sync successful:', response.data.message);
    } else {
      throw new Error('Sync API returned failure: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Sync API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Run the function
generateUpdatedQuestions();