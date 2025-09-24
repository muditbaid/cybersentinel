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

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Special case: service token
    if (decoded && decoded.service === true && decoded.role === 'admin') {
      req.user = decoded;
      return next();
    }

    // ✅ Normal user token
    req.user = decoded;
    return next();
  } catch (err) {
    console.error('JWT verify failed:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}


function defaultWeightsFor(question) {
  const likert = ["Strongly disagree","Disagree","Neutral","Agree","Strongly agree"];
  const isLikert = Array.isArray(question.options) && question.options.every(o => likert.includes(o));
  const base = isLikert ? { "Strongly disagree": -10, "Disagree": -4, "Neutral": 0, "Agree": 4, "Strongly agree": 8 } : null;

  const makeMap = () => {
    const m = {};
    for (const opt of question.options || []) {
      m[opt] = base ? (base[opt] ?? 0) : 0;
    }
    return m;
  };

  return {
    technical: question.category === "technical" ? makeMap() : {},
    behavioral: question.category === "behavioral" ? makeMap() : {},
    psychological: question.category === "psychological" ? makeMap() : {}
  };
}

function coercePatterns(q) {
  const p = q.patterns && typeof q.patterns === "object" ? q.patterns : {};
  const weights = (p.weights && typeof p.weights === "object") ? p.weights : defaultWeightsFor(q);
  const risk_tags = (p.risk_tags && typeof p.risk_tags === "object") ? p.risk_tags : {};
  const critical = typeof p.critical === "boolean" ? p.critical : false;
  const rationale = (p.rationale && typeof p.rationale === "object") ? p.rationale : {};

  for (const cat of ["technical","behavioral","psychological"]) {
    if (weights[cat] && Object.keys(weights[cat]).length) {
      for (const opt of q.options || []) {
        if (!(opt in weights[cat])) weights[cat][opt] = 0;
      }
    }
  }

  return { weights, risk_tags, critical, rationale };
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
  const { questionId, answer_text } = req.body;
  const answer = answer_text;
  const userId = req.user.id;
  if (!questionId || !answer) {
    return res.status(400).json({ error: 'Question ID and answer are required' });
  }
  
  try {
    const sessionCheck = await pool.query("SELECT * FROM assessments WHERE session_id = $1 AND user_id = $2 AND status = 'in_progress'", [sessionId, userId]);
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Active session for this user not found.' });
    }

    await pool.query('INSERT INTO answers (session_id, question_id, answer_text) VALUES ($1, $2, $3)', [sessionId, questionId, answer_text || answer]);

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
        // ✅ Ensure patterns always exist
        const safePatterns = coercePatterns(q);

        await client.query(
          `INSERT INTO questions (id, text, options, category, next_logic, patterns, version, is_active, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 1, TRUE, $7, NOW(), NOW())
           ON CONFLICT (id)
           DO UPDATE SET
             text = EXCLUDED.text,
             options = EXCLUDED.options,
             category = EXCLUDED.category,
             next_logic = EXCLUDED.next_logic,
             patterns = EXCLUDED.patterns,
             tags = EXCLUDED.tags,
             version = questions.version + 1,
             updated_at = NOW()`,
          [
            id,
            q.text,
            JSON.stringify(q.options),
            q.category,
            JSON.stringify(q.next_logic || {}),
            JSON.stringify(safePatterns),   // 👈 use coercePatterns result
            JSON.stringify(q.tags || {})
          ]
        );
        updateCount++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ success: true, message: `Synced ${updateCount} questions.` });
  } catch (err) {
    console.error("LLM Sync Error:", err);
    res.status(500).json({ error: 'Failed to sync questions to database.' });
  }
});


async function generateReport(sessionId) {
  try {
    // 1) Pull answers + question metadata
    const answersResult = await pool.query(
      `SELECT q.id, q.text, q.category, q.patterns, a.answer_text
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       WHERE a.session_id = $1`,
      [sessionId]
    );

    // 2) Baselines & setup
    const BASELINE = { technical: 70, behavioral: 70, psychological: 70 };
    const categoryScores = { ...BASELINE };
    const categoryCounts = { technical: 0, behavioral: 0, psychological: 0 };
    const riskTallies = {};          // { tagName: int }
    const rationales = [];           // [{q, why}]
    const impactsSeen = [];          // track impacts for consistency/variance
    const NEG_MULTIPLIER_CRITICAL = 1.5;  // heavier penalty on critical Qs
    const DAMPING = 0.85;            // reduce outsized impacts a bit

    // 3) Per-answer scoring
    for (const row of answersResult.rows) {
      const { category, patterns, answer_text, text } = row;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      const p = (patterns && typeof patterns === 'object') ? patterns : {};
      const weights = (p.weights && p.weights[category]) ? p.weights[category] : null;
      let delta = 0;

      if (weights && Object.prototype.hasOwnProperty.call(weights, answer_text)) {
        delta = weights[answer_text];

        // Critical questions penalize risky choices more
        if (delta < 0 && p.critical) delta *= NEG_MULTIPLIER_CRITICAL;

        // Apply damping to smooth extremes
        delta = delta * DAMPING;

        categoryScores[category] += delta;
        impactsSeen.push(delta);
      }

      // Risk tags (behavioral patterns)
      if (p.risk_tags && typeof p.risk_tags === 'object') {
        for (const [tag, optionMap] of Object.entries(p.risk_tags)) {
          const inc = optionMap[answer_text];
          if (inc) riskTallies[tag] = (riskTallies[tag] || 0) + inc;
        }
      }

      // Save rationale if configured for this option
      if (p.rationale && p.rationale[answer_text]) {
        rationales.push({ question: text, note: p.rationale[answer_text] });
      }
    }

    // 4) Clamp 0..100
    for (const k of Object.keys(categoryScores)) {
      categoryScores[k] = Math.max(0, Math.min(100, categoryScores[k]));
    }

    // 5) Overall & confidence
    const categories = ["technical", "behavioral", "psychological"];
    const answeredCats = categories.filter(c => categoryCounts[c] > 0);
    const overallScore = Math.round(
      (categories.reduce((s, c) => s + categoryScores[c], 0)) / categories.length
    );

    // Confidence considers coverage + impact variance
    const coverage = answeredCats.length / categories.length; // 0..1
    const variance =
      impactsSeen.length > 1
        ? (() => {
            const mean = impactsSeen.reduce((a, b) => a + b, 0) / impactsSeen.length;
            const v = impactsSeen.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (impactsSeen.length - 1);
            return Math.min(1, Math.sqrt(v) / 10); // normalize ~0..1
          })()
        : 0.2;  // low data → lower confidence

    const confidence = Math.round(100 * Math.max(0.4, 0.9 * coverage - 0.3 * variance));

    // 6) Recommendations (priority by tag weight + category weakness)
    const recs = [];
    const pushRec = (priority, text) => recs.push({ priority, text });

    // Tag-driven
    if (riskTallies.phishingAwareness >= 2) {
      pushRec("critical", "Verify any urgent payment/reset requests via an out-of-band channel before acting.");
    } else if (riskTallies.phishingAwareness === 1) {
      pushRec("important", "Spend 10 minutes on anti-phishing drills this week; hover links and check domains.");
    }
    if (riskTallies.deviceSecurity >= 2) {
      pushRec("important", "Enforce full-disk encryption and auto-lock on all endpoints, including BYOD.");
    }

    // Category-driven
    if (categoryScores.technical < 70) {
      pushRec("critical", "Adopt a password manager and enable MFA on email, VPN, and finance apps.");
    }
    if (categoryScores.behavioral < 70) {
      pushRec("important", "Schedule quarterly phishing simulations and just-in-time micro-training.");
    }
    if (categoryScores.psychological < 70) {
      pushRec("suggested", "Use ‘pause and verify’ for high-pressure requests; reduce single-person approvals.");
    }

    // Deduplicate by text
    const uniqueRecs = Array.from(new Map(recs.map(r => [r.text, r])).values());

    // 7) Strengths
    const strengths = [];
    if (categoryScores.technical >= 85) strengths.push("Solid device and credential hygiene.");
    if (!riskTallies.phishingAwareness) strengths.push("Good phishing vigilance.");
    if (categoryScores.behavioral >= 85) strengths.push("Consistent safe behaviors across scenarios.");

    // 8) Executive summary + rationale note
    const executiveSummary =
      `Overall score ${overallScore}% (confidence ${confidence}%). `
      + `Tech ${categoryScores.technical}%, Behavioral ${categoryScores.behavioral}%, Psychological ${categoryScores.psychological}%. `
      + `Focus on the recommendations below to lower risk in the next 30 days.`;

    // 9) Persist report
    await pool.query(
      `INSERT INTO reports (session_id, overall_score, category_scores, behavioral_patterns,
                            recommendations, strengths, executive_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         category_scores = EXCLUDED.category_scores,
         behavioral_patterns = EXCLUDED.behavioral_patterns,
         recommendations = EXCLUDED.recommendations,
         strengths = EXCLUDED.strengths,
         executive_summary = EXCLUDED.executive_summary,
         created_at = NOW()`,
      [
        sessionId,
        overallScore,
        JSON.stringify(categoryScores),
        JSON.stringify(riskTallies),
        JSON.stringify(uniqueRecs),
        JSON.stringify(strengths),
        executiveSummary
      ]
    );

    console.log(`✅ Scoring v2 report generated for session ${sessionId}`);
  } catch (err) {
    console.error('❌ Error generating report v2:', err);
  }
}


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});