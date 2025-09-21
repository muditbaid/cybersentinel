const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user; // { id, email, role }
    next();
  });
}

// --- AUTHENTICATION ENDPOINT ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ASSESSMENT LIFECYCLE ---

// Start a new assessment
app.post('/api/assessments/start', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Get first question (e.g., "comfort-level" or "industry-sector")
    const firstQuestionResult = await pool.query(
      'SELECT id FROM questions WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1'
    );

    if (firstQuestionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active questions found' });
    }

    const firstQuestionId = firstQuestionResult.rows[0].id;

    // Create new assessment session
    const sessionResult = await pool.query(
      `INSERT INTO assessments (user_id, current_question_id, status)
       VALUES ($1, $2, 'in_progress')
       RETURNING session_id, current_question_id, status`,
      [userId, firstQuestionId]
    );

    const session = sessionResult.rows[0];

    // Fetch the question object to return
    const questionResult = await pool.query(
      'SELECT id, text, options, category, next_logic, patterns FROM questions WHERE id = $1 AND is_active = TRUE',
      [firstQuestionId]
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Starting question not found' });
    }

    res.json({
      success: true,
      session_id: session.session_id,
      current_question: questionResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start assessment' });
  }
});

// Submit an answer and get next question
app.post('/api/assessments/:sessionId/answer', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { questionId, answer } = req.body;
  const userId = req.user.id;

  if (!questionId || !answer) {
    return res.status(400).json({ error: 'Question ID and answer are required' });
  }

  try {
    // Verify session belongs to user
    const sessionCheck = await pool.query(
      'SELECT * FROM assessments WHERE session_id = $1 AND user_id = $2 AND status = $3',
      [sessionId, userId, 'in_progress']
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    // Save answer
    await pool.query(
      'INSERT INTO answers (session_id, question_id, answer_text) VALUES ($1, $2, $3)',
      [sessionId, questionId, answer]
    );

    // Fetch current question's next_logic
    const questionResult = await pool.query(
      'SELECT next_logic FROM questions WHERE id = $1 AND is_active = TRUE',
      [questionId]
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    let nextQuestionId = null;
    const nextLogic = questionResult.rows[0].next_logic;

    // For MVP, assume next_logic is a string (ID of next question)
    // In advanced version, you'd evaluate function logic server-side
    if (typeof nextLogic === 'string') {
      nextQuestionId = nextLogic;
    } else if (nextLogic && typeof nextLogic === 'object') {
      // Simple key-value lookup based on answer (e.g., { "Finance": "finance-q1", "IT": "it-q1" })
      nextQuestionId = nextLogic[answer] || nextLogic.default;
    }

    // If no next question, mark assessment as complete
    if (!nextQuestionId) {
      await pool.query(
        'UPDATE assessments SET status = $1, end_time = NOW() WHERE session_id = $2',
        ['completed', sessionId]
      );

      // Trigger report generation (async)
      generateReport(sessionId);

      return res.json({
        success: true,
        is_complete: true,
        message: 'Assessment completed. Report is being generated.'
      });
    }

    // Update session with next question
    await pool.query(
      'UPDATE assessments SET current_question_id = $1 WHERE session_id = $2',
      [nextQuestionId, sessionId]
    );

    // Fetch next question
    const nextQuestionResult = await pool.query(
      'SELECT id, text, options, category, next_logic, patterns FROM questions WHERE id = $1 AND is_active = TRUE',
      [nextQuestionId]
    );

    if (nextQuestionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Next question not found' });
    }

    res.json({
      success: true,
      is_complete: false,
      next_question: nextQuestionResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// Get a report by session ID
app.get('/api/assessments/:sessionId/report', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;

  try {
    // Verify report belongs to user
    const reportResult = await pool.query(
      `SELECT r.*, u.name as user_name, u.department
       FROM reports r
       JOIN assessments a ON r.session_id = a.session_id
       JOIN users u ON a.user_id = u.id
       WHERE r.session_id = $1 AND u.id = $2`,
      [sessionId, userId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({
      success: true,
      report: reportResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// --- ADMIN ENDPOINTS ---

// Assign an assessment to a user
app.post('/api/assign', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { user_id, due_date, assessment_type = 'standard' } = req.body;

  if (!user_id || !due_date) {
    return res.status(400).json({ error: 'User ID and due date are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO assignments (user_id, due_date, assessment_type)
       VALUES ($1, $2, $3)
       RETURNING assignment_id, user_id, due_date, assessment_type`,
      [user_id, due_date, assessment_type]
    );

    res.json({
      success: true,
      assignment: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign assessment' });
  }
});

// --- LLM SYNC ENDPOINT ---

// This endpoint can be called by your update-questions-from-llm.js script
app.get('/api/sync-questions-from-llm', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Call your LLM service (as defined in your original script)
    const updatedQuestions = await fetchLatestQuestionsFromLLM(); // Your existing function

    // Upsert questions into DB
    for (const [id, questionData] of Object.entries(updatedQuestions)) {
      await pool.query(
        `INSERT INTO questions (id, text, options, category, next_logic, patterns, version, is_active, tags, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id)
         DO UPDATE SET
           text = EXCLUDED.text,
           options = EXCLUDED.options,
           category = EXCLUDED.category,
           next_logic = EXCLUDED.next_logic,
           patterns = EXCLUDED.patterns,
           version = questions.version + 1,
           is_active = EXCLUDED.is_active,
           tags = EXCLUDED.tags,
           updated_at = NOW()`,
        [
          id,
          questionData.text,
          JSON.stringify(questionData.options),
          questionData.category || null,
          JSON.stringify(questionData.next || null),
          JSON.stringify(questionData.patterns || {}),
          1, // Initial version, incremented on update
          true, // Set new questions as active
          JSON.stringify(questionData.tags || [])
        ]
      );
    }

    res.json({
      success: true,
      message: 'Questions synced successfully',
      count: Object.keys(updatedQuestions).length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync questions' });
  }
});

// --- HELPER FUNCTION (Placeholder) ---

async function fetchLatestQuestionsFromLLM() {
  // In production, call your LLM service here
  // For now, return a static object
  return {
    "comfort-level": {
      text: "How comfortable are you with technology?",
      options: ["Very", "Somewhat", "Not at all"],
      next: "tech-usage",
      category: "behavioral"
    },
    "tech-usage": {
      text: "Which devices do you use for work?",
      options: ["Company laptop", "Personal phone", "Personal laptop", "Tablet"],
      next: "public-wifi",
      category: "technical",
      patterns: {
        "deviceSecurity": {
          "Company laptop": 0,
          "Personal phone": 1,
          "Personal laptop": 2,
          "Tablet": 1
        }
      }
    }
    // Add more as needed
  };
}

// --- REPORT GENERATION HELPER (Simplified) ---

async function generateReport(sessionId) {
  try {
    // Fetch all answers for this session
    const answersResult = await pool.query(
      `SELECT q.id, q.patterns, a.answer_text
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       WHERE a.session_id = $1`,
      [sessionId]
    );

    // Initialize pattern scores
    let patterns = {};

    // Aggregate scores based on patterns
    for (let row of answersResult.rows) {
      if (!row.patterns) continue;
      const patternObj = JSON.parse(row.patterns);
      const answer = row.answer_text;

      for (const [patternName, optionScores] of Object.entries(patternObj)) {
        if (!patterns[patternName]) patterns[patternName] = 0;
        patterns[patternName] += optionScores[answer] || 0;
      }
    }

    // Calculate scores (simplified)
    const technicalScore = Math.max(0, Math.min(100, 80 - (patterns.deviceSecurity || 0) * 5));
    const behavioralScore = Math.max(0, Math.min(100, 75 - (patterns.oversharing || 0) * 4));
    const psychologicalScore = Math.max(0, Math.min(100, 85 - (patterns.urgencyResponse || 0) * 6));
    const overallScore = Math.round((technicalScore + behavioralScore + psychologicalScore) / 3);

    // Insert report
    await pool.query(
      `INSERT INTO reports (session_id, overall_score, category_scores, behavioral_patterns, psychological_factors, executive_summary, recommendations, strengths)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        overallScore,
        JSON.stringify({ technical: technicalScore, behavioral: behavioralScore, psychological: psychologicalScore }),
        JSON.stringify(patterns),
        JSON.stringify({}), // Placeholder for psychological factors
        'Summary generated by system.', // Placeholder
        JSON.stringify([]), // Placeholder for recommendations
        JSON.stringify(['Good device hygiene']) // Placeholder for strengths
      ]
    );

    console.log(`✅ Report generated for session ${sessionId}`);
  } catch (err) {
    console.error('❌ Error generating report:', err);
  }
}

// --- GET LATEST QUESTIONS (for frontend) ---

app.get('/api/questions/latest', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, text, options, category, next_logic, patterns FROM questions WHERE is_active = TRUE'
    );

    const questions = {};
    result.rows.forEach(row => {
      questions[row.id] = {
        text: row.text,
        options: JSON.parse(row.options),
        category: row.category,
        next: JSON.parse(row.next_logic), // Could be string or object
        patterns: JSON.parse(row.patterns)
      };
    });

    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- NEW: Get admin stats ---
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
  }

  try {
      // Total employees (excluding admins)
      const totalEmployees = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['employee']);

      // Pending assessments (not completed)
      const pendingAssessments = await pool.query(`
          SELECT COUNT(*) FROM assignments 
          WHERE completed = FALSE AND assessment_type = 'standard'
      `);

      // Average security score
      const avgScore = await pool.query(`
          SELECT AVG(r.overall_score) as avg_score
          FROM reports r
          JOIN assessments a ON r.session_id = a.session_id
          JOIN users u ON a.user_id = u.id
          WHERE u.role = 'employee'
      `);

      res.json({
          success: true,
          stats: {
              totalEmployees: parseInt(totalEmployees.rows[0].count),
              pendingAssessments: parseInt(pendingAssessments.rows[0].count),
              avgSecurityScore: parseFloat(avgScore.rows[0].avg_score) || 0
          }
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// --- NEW: Get employee list for assignment ---
app.get('/api/admin/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
  }

  try {
      const result = await pool.query(`
          SELECT 
              u.id,
              u.name,
              u.department,
              u.email,
              r.overall_score as last_score,
              a.due_date as next_due_date,
              a.completed as is_completed
          FROM users u
          LEFT JOIN assessments a ON a.user_id = u.id AND a.status = 'in_progress'
          LEFT JOIN reports r ON r.session_id IN (
              SELECT session_id FROM assessments 
              WHERE user_id = u.id 
              ORDER BY end_time DESC LIMIT 1
          )
          WHERE u.role = 'employee'
          ORDER BY u.name
      `);

      const employees = result.rows.map(row => ({
          id: row.id,
          name: row.name,
          department: row.department,
          email: row.email,
          lastScore: row.last_score,
          nextDueDate: row.next_due_date,
          isCompleted: row.is_completed
      }));

      res.json({
          success: true,
          employees
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load employee data' });
  }
});

// --- NEW: Get admin stats and employee list ---
app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
  }

  try {
      // Get total employees
      const totalEmployees = await pool.query(
          'SELECT COUNT(*) FROM users WHERE role = $1',
          ['employee']
      );

      // Get pending assessments
      const pendingAssessments = await pool.query(
          `SELECT COUNT(*) FROM assignments 
           WHERE completed = FALSE AND assessment_type = 'standard'`
      );

      // Get average security score
      const avgScore = await pool.query(
          `SELECT AVG(r.overall_score) as avg_score
           FROM reports r
           JOIN assessments a ON r.session_id = a.session_id
           JOIN users u ON a.user_id = u.id
           WHERE u.role = 'employee'`
      );

      // Get employee list with last score and status
      const employees = await pool.query(
          `SELECT 
              u.id,
              u.name,
              u.department,
              u.email,
              r.overall_score as last_score,
              a.due_date as next_due_date,
              a.completed as is_completed
           FROM users u
           LEFT JOIN assessments a ON a.user_id = u.id AND a.status = 'in_progress'
           LEFT JOIN reports r ON r.session_id = (
               SELECT session_id FROM assessments 
               WHERE user_id = u.id 
               ORDER BY end_time DESC LIMIT 1
           )
           WHERE u.role = 'employee'
           ORDER BY u.name`
      );

      res.json({
          success: true,
          stats: {
              totalEmployees: parseInt(totalEmployees.rows[0].count),
              pendingAssessments: parseInt(pendingAssessments.rows[0].count),
              avgSecurityScore: parseFloat(avgScore.rows[0].avg_score) || 0
          },
          employees: employees.rows.map(emp => ({
              id: emp.id,
              name: emp.name,
              department: emp.department,
              email: emp.email,
              lastScore: emp.last_score,
              nextDueDate: emp.next_due_date,
              isCompleted: emp.is_completed
          }))
      });
  } catch (err) {
      console.error('Error fetching admin dashboard:', err);
      res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// --- NEW: Get employee dashboard data ---
app.get('/api/employee/dashboard', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.id;

      // Get user's assessments
      const assessments = await pool.query(
          `SELECT 
              a.session_id,
              a.start_time,
              a.status,
              r.overall_score,
              r.generated_at as completed_date
           FROM assessments a
           LEFT JOIN reports r ON r.session_id = a.session_id
           WHERE a.user_id = $1
           ORDER BY a.start_time DESC`,
          [userId]
      );

      // Get assignments
      const assignments = await pool.query(
          `SELECT 
              assignment_id,
              due_date,
              completed,
              assessment_type
           FROM assignments 
           WHERE user_id = $1
           ORDER BY due_date ASC`,
          [userId]
      );

      res.json({
          success: true,
          assessments: assessments.rows.map(row => ({
              sessionId: row.session_id,
              startTime: row.start_time,
              status: row.status,
              overallScore: row.overall_score,
              completedDate: row.completed_date
          })),
          assignments: assignments.rows.map(row => ({
              id: row.assignment_id,
              dueDate: row.due_date,
              completed: row.completed,
              type: row.assessment_type
          }))
      });
  } catch (err) {
      console.error('Error fetching employee dashboard:', err);
      res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// --- NEW: Assign assessment endpoint (you already have this, but ensure it exists) ---
app.post('/api/assign', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
  }

  const { user_id, due_date, assessment_type = 'standard' } = req.body;

  if (!user_id || !due_date) {
      return res.status(400).json({ error: 'User ID and due date are required' });
  }

  try {
      // Get user ID from email (since frontend sends email)
      const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [user_id]);
      if (userResult.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
      }

      const actualUserId = userResult.rows[0].id;

      const result = await pool.query(
          `INSERT INTO assignments (user_id, due_date, assessment_type)
           VALUES ($1, $2, $3)
           RETURNING assignment_id, user_id, due_date, assessment_type`,
          [actualUserId, due_date, assessment_type]
      );

      res.json({
          success: true,
          assignment: result.rows[0]
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to assign assessment' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});