const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateUpdatedQuestions() {
  // *** THIS PROMPT HAS BEEN UPDATED ***
  const prompt = `
    You are a cybersecurity training expert. Generate a series of corporate security assessment questions.
    
    IMPORTANT CONSTRAINTS:
    1. For the "category" field of each question, you MUST use ONLY one of the following three values: 'technical', 'behavioral', or 'psychological'.
    2. The entire output MUST be ONLY valid JSON, in the format: { "question-id": { "text": "...", "options": ["..."], "category": "...", ... } }
    3. Do not include any text or markdown formatting before or after the JSON object.

    Focus on emerging threats like AI-powered phishing, deepfake voice scams, and supply chain attacks.
    Include at least 3 new questions specifically targeting remote workers.
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("🧠 Calling Gemini 1.5 Flash API with improved prompt...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    let jsonString = rawText.trim();
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonString = jsonMatch[1].trim();

    const updatedQuestions = JSON.parse(jsonString);
    await syncQuestionsToAPI(updatedQuestions);
    console.log(`✅ Successfully generated and synced ${Object.keys(updatedQuestions).length} questions.`);

  } catch (error) {
    console.error("❌ Error updating questions:", error.message);
    process.exit(1);
  }
}

async function syncQuestionsToAPI(questions) {
  try {
    const adminToken = process.env.ADMIN_JWT_TOKEN;
    if (!adminToken) throw new Error('ADMIN_JWT_TOKEN is not set in .env file.');
    
    console.log("📡 Syncing questions to backend...");

    const response = await axios.post('http://localhost:5000/api/llm/sync-questions', questions, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
      timeout: 20000 // Increased timeout for potentially larger AI response
    });

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

generateUpdatedQuestions();