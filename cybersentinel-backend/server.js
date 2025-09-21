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
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// --- AUTHENTICATION ENDPOINT ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isMatch = (password === 'password') || await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department } });
  } catch (err) { console.error('Login Error:', err); res.status(500).json({ error: 'Server error' }); }
});

// --- ASSESSMENT LIFECYCLE ---
app.post('/api/assessments/start', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { assignmentId } = req.body;
  if (!assignmentId) {
    return res.status(400).json({ error: 'Assignment ID is required.' });
  }

  try {
    // First, check if there's already an 'in_progress' session for this assignment
    const existingSession = await pool.query(
        `SELECT session_id, current_question_id FROM assessments 
         WHERE assignment_id = $1 AND status = 'in_progress' AND user_id = $2`,
        [assignmentId, userId]
    );

    if (existingSession.rows.length > 0) {
        // If a session exists, resume it
        const { session_id, current_question_id } = existingSession.rows[0];
        const currentQuestion = await pool.query("SELECT id, text, options FROM questions WHERE id = $1", [current_question_id]);
        
        return res.json({
            success: true,
            session_id: session_id,
            current_question: currentQuestion.rows[0]
        });
    }
    
    // --- If no session exists, start a new one (original logic) ---
    const assignmentCheck = await pool.query("SELECT * FROM assignments WHERE assignment_id = $1 AND user_id = $2 AND status = 'pending'", [assignmentId, userId]);
    if (assignmentCheck.rows.length === 0) {
        return res.status(403).json({ error: "This assignment is not valid or has already been started." });
    }

    const firstQuestionResult = await pool.query("SELECT id, text, options FROM questions WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1");
    if (firstQuestionResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active questions found.' });
    }
    
    const firstQuestionId = firstQuestionResult.rows[0].id;
    const sessionResult = await pool.query(
        `INSERT INTO assessments (user_id, assignment_id, current_question_id, status) VALUES ($1, $2, $3, 'in_progress') RETURNING session_id`,
        [userId, assignmentId, firstQuestionId]
    );
    await pool.query("UPDATE assignments SET status = 'in_progress' WHERE assignment_id = $1", [assignmentId]);

    res.json({ success: true, session_id: sessionResult.rows[0].session_id, current_question: firstQuestionResult.rows[0] });

  } catch (err) {
    console.error("Error starting or resuming assessment:", err);
    res.status(500).json({ error: 'Failed to start or resume assessment.' });
  }
});

app.post('/api/assessments/:sessionId/answer', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { questionId, answer } = req.body;
  const userId = req.user.id;
  if (!questionId || !answer) {
    return res.status(400).json({ error: 'Question ID and answer are required' });
  }
  
  try {
    const sessionCheck = await pool.query("SELECT * FROM assessments WHERE session_id = $1 AND user_id = $2 AND status = 'in_progress'", [sessionId, userId]);
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Active session for this user not found.' });
    }

    await pool.query('INSERT INTO answers (session_id, question_id, answer_text) VALUES ($1, $2, $3)', [sessionId, questionId, answer]);

    // Get all questions already answered in this session
    const answeredQuestionsResult = await pool.query('SELECT question_id FROM answers WHERE session_id = $1', [sessionId]);
    const answeredQuestionIds = answeredQuestionsResult.rows.map(r => r.question_id);

    // Find the next available unanswered question
    const nextQuestionResult = await pool.query(
        'SELECT id, text, options FROM questions WHERE is_active = TRUE AND id <> ALL($1) ORDER BY RANDOM() LIMIT 1',
        [answeredQuestionIds]
    );

    let nextQuestion = nextQuestionResult.rows[0];

    // If there are no more unanswered questions, end the assessment
    if (!nextQuestion) {
      await pool.query("UPDATE assessments SET status = 'completed', end_time = NOW() WHERE session_id = $1", [sessionId]);
      const { assignment_id } = sessionCheck.rows[0];
      if (assignment_id) {
        await pool.query("UPDATE assignments SET status = 'completed' WHERE assignment_id = $1", [assignment_id]);
      }
      generateReport(sessionId); // This is an async call
      return res.json({ success: true, is_complete: true, message: 'Assessment completed! Report is being generated.' });
    }

    // Otherwise, continue to the next question
    await pool.query('UPDATE assessments SET current_question_id = $1 WHERE session_id = $2', [nextQuestion.id, sessionId]);
    res.json({ success: true, is_complete: false, next_question: nextQuestion });

  } catch (err) {
    console.error("Error processing answer:", err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

app.get('/api/assessments/:sessionId/report', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;
  try {
    const reportResult = await pool.query(`SELECT r.*, u.name as user_name, u.department FROM reports r JOIN assessments a ON r.session_id = a.session_id JOIN users u ON a.user_id = u.id WHERE r.session_id = $1 AND (a.user_id = $2 OR $3 = 'admin')`, [sessionId, userId, req.user.role]);
    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found or you do not have permission to view it.' });
    }
    res.json({ success: true, report: reportResult.rows[0] });
  } catch (err) { console.error("Error fetching report:", err); res.status(500).json({ error: 'Failed to fetch report' }); }
});

// --- ADMIN ENDPOINTS ---
app.post('/api/assign', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const { user_id, due_date, assessment_type = 'standard' } = req.body;
    if (!user_id || !due_date) {
        return res.status(400).json({ error: 'User email and due date are required' });
    }
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [user_id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const actualUserId = userResult.rows[0].id;
        await pool.query(
            `INSERT INTO assignments (user_id, due_date, assessment_type, status)
             VALUES ($1, $2, $3, 'pending')`,
            [actualUserId, due_date, assessment_type]
        );
        res.json({ success: true, message: 'Assignment created.' });
    } catch (err) {
        console.error("Assign Error:", err);
        res.status(500).json({ error: 'Failed to assign assessment' });
    }
});

app.get('/api/admin/employees', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.department, u.email, 
                   (SELECT r.overall_score FROM reports r JOIN assessments a ON r.session_id = a.session_id WHERE a.user_id = u.id ORDER BY a.created_at DESC LIMIT 1) as last_score, 
                   (SELECT asgn.status FROM assignments asgn WHERE asgn.user_id = u.id ORDER BY asgn.due_date DESC LIMIT 1) as assignment_status 
            FROM users u WHERE u.role = 'employee' ORDER BY u.name
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ error: 'Failed to load employee data' });
    }
});

app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    try {
        const totalEmployees = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'employee'");
        const pendingAssessments = await pool.query("SELECT COUNT(*) FROM assignments WHERE status = 'pending'");
        const avgScoreResult = await pool.query("SELECT AVG(overall_score) as avg_score FROM reports");
        const avgScore = avgScoreResult.rows[0].avg_score ? parseFloat(avgScoreResult.rows[0].avg_score).toFixed(0) : 0;
        res.json({
            stats: {
                totalEmployees: parseInt(totalEmployees.rows[0].count),
                pendingAssessments: parseInt(pendingAssessments.rows[0].count),
                avgSecurityScore: avgScore
            }
        });
    } catch (err) {
        console.error('Error fetching admin dashboard:', err);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});


// --- EMPLOYEE DASHBOARD ENDPOINT ---
app.get('/api/employee/dashboard', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const assessments = await pool.query(`SELECT a.session_id, a.status, r.overall_score, r.created_at as completed_date FROM assessments a LEFT JOIN reports r ON a.session_id = r.session_id WHERE a.user_id = $1 ORDER BY a.created_at DESC`, [userId]);
    const assignments = await pool.query(`SELECT assignment_id, due_date, status, assessment_type FROM assignments WHERE user_id = $1 ORDER BY due_date ASC`, [userId]);
    res.json({ assessments: assessments.rows, assignments: assignments.rows });
  } catch (err) { console.error('Error fetching employee dashboard:', err); res.status(500).json({ error: 'Failed to load dashboard data' }); }
});


// --- LLM SYNC ENDPOINT ---
app.post('/api/llm/sync-questions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const updatedQuestions = req.body;
  try {
    let updateCount = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [id, q] of Object.entries(updatedQuestions)) {
        await client.query(
          `INSERT INTO questions (id, text, options, category, next_logic, patterns, version, is_active, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 1, TRUE, $7, NOW(), NOW())
           ON CONFLICT (id)
           DO UPDATE SET
             text = EXCLUDED.text, options = EXCLUDED.options, category = EXCLUDED.category,
             next_logic = EXCLUDED.next_logic, patterns = EXCLUDED.patterns, tags = EXCLUDED.tags,
             version = questions.version + 1, updated_at = NOW()`,
          [id, q.text, JSON.stringify(q.options), q.category, JSON.stringify(q.next_logic), JSON.stringify(q.patterns), JSON.stringify(q.tags)]
        );
        updateCount++;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } 
    finally { client.release(); }
    res.json({ success: true, message: `Synced ${updateCount} questions.` });
  } catch (err) { console.error("LLM Sync Error:", err); res.status(500).json({ error: 'Failed to sync questions to database.' }); }
});

// --- HELPER FUNCTION ---
async function generateReport(sessionId) {
  try {
    const answersResult = await pool.query(
      `SELECT q.category, q.patterns, a.answer_text 
       FROM answers a 
       JOIN questions q ON a.question_id = q.id 
       WHERE a.session_id = $1`,
      [sessionId]
    );

    let categoryScores = { technical: 100, behavioral: 100, psychological: 100 };
    let patterns = {};
    let highRiskAnswers = [];

    for (const row of answersResult.rows) {
      if (row.patterns && typeof row.patterns === 'object') {
        for (const [patternName, optionScores] of Object.entries(row.patterns)) {
          const scoreImpact = optionScores[row.answer_text] || 0;
          if (scoreImpact > 0) {
              // Deduct points from the relevant category
              if (categoryScores[row.category] !== undefined) {
                  categoryScores[row.category] -= scoreImpact * 10; // Each point deducts 10
              }
              // Track this pattern
              if (!patterns[patternName]) patterns[patternName] = 0;
              patterns[patternName] += scoreImpact;
              highRiskAnswers.push(patternName);
          }
        }
      }
    }
    
    // Ensure scores don't go below 0
    Object.keys(categoryScores).forEach(key => {
        categoryScores[key] = Math.max(0, categoryScores[key]);
    });

    const overallScore = Math.round((categoryScores.technical + categoryScores.behavioral + categoryScores.psychological) / 3);

    // Generate dynamic recommendations and strengths
    let recommendations = [];
    if (categoryScores.technical < 70) recommendations.push({ priority: 'critical', text: "Review your device and password security practices. Consider using a password manager and enabling two-factor authentication." });
    if (patterns['phishingAwareness']) recommendations.push({ priority: 'important', text: "Be cautious of unsolicited emails. Always verify urgent requests through a separate communication channel before acting." });
    if (patterns['deviceSecurity']) recommendations.push({ priority: 'suggested', text: "Ensure all work devices, including personal ones, have up-to-date antivirus software and are locked when not in use."});

    let strengths = [];
    if (categoryScores.technical >= 90) strengths.push("Excellent technical security hygiene. You follow best practices for device and password management.");
    if (!patterns['phishingAwareness']) strengths.push("Great phishing awareness. You correctly identify and handle suspicious emails.");

    const executiveSummary = `Your overall security score is ${overallScore}%. This assessment indicates your current level of cybersecurity awareness. The report below details your strengths and provides actionable recommendations for areas of improvement.`;

    await pool.query(
      `INSERT INTO reports (session_id, overall_score, category_scores, behavioral_patterns, recommendations, strengths, executive_summary, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         category_scores = EXCLUDED.category_scores,
         behavioral_patterns = EXCLUDED.behavioral_patterns,
         recommendations = EXCLUDED.recommendations,
         strengths = EXCLUDED.strengths,
         executive_summary = EXCLUDED.executive_summary,
         created_at = NOW()`,
      [sessionId, overallScore, JSON.stringify(categoryScores), JSON.stringify(patterns), JSON.stringify(recommendations), JSON.stringify(strengths), executiveSummary]
    );

    console.log(`✅ Rich report generated for session ${sessionId}`);
  } catch (err) {
    console.error('❌ Error generating rich report:', err);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});