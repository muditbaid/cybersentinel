-- CyberSentinel Database Schema
-- Run this script to set up the PostgreSQL database

-- Create database (run this manually first)
-- CREATE DATABASE cybersentinel;

-- Connect to cybersentinel database and run the following:

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'employee')),
    department VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
    id VARCHAR(100) PRIMARY KEY,
    text TEXT NOT NULL,
    options JSONB NOT NULL,
    category VARCHAR(50),
    next_logic JSONB,
    patterns JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assessments table (sessions)
CREATE TABLE IF NOT EXISTS assessments (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    current_question_id VARCHAR(100) REFERENCES questions(id),
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Answers table
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES assessments(session_id),
    question_id VARCHAR(100) REFERENCES questions(id),
    answer_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES assessments(session_id),
    overall_score INTEGER NOT NULL,
    category_scores JSONB NOT NULL,
    behavioral_patterns JSONB DEFAULT '{}',
    psychological_factors JSONB DEFAULT '{}',
    executive_summary TEXT,
    recommendations JSONB DEFAULT '[]',
    strengths JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
    assignment_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    due_date DATE NOT NULL,
    assessment_type VARCHAR(50) DEFAULT 'standard',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample users
INSERT INTO users (email, password_hash, name, role, department) VALUES
('admin@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin User', 'admin', 'IT Security'),
('john@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'John Doe', 'employee', 'Finance'),
('sarah@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Sarah Chen', 'employee', 'HR'),
('mike@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Mike Rodriguez', 'employee', 'IT'),
('lisa@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Lisa Park', 'employee', 'Marketing')
ON CONFLICT (email) DO NOTHING;

-- Insert sample questions
INSERT INTO questions (id, text, options, category, next_logic, patterns, tags) VALUES
('industry-sector', 'Which industry sector best describes your organization?', 
 '["Finance & Banking", "Healthcare", "Technology", "Manufacturing", "Government", "Education", "Other"]', 
 'behavioral', 
 '{"Finance & Banking": "finance-role", "Healthcare": "healthcare-role", "Technology": "tech-role", "Manufacturing": "manufacturing-role", "Government": "government-role", "Education": "education-role", "Other": "general-role"}',
 '{"roleRisk": {"Finance & Banking": 2, "Healthcare": 3, "Technology": 1, "Manufacturing": 2, "Government": 4, "Education": 2, "Other": 1}}',
 '["industry", "role-branching"]'),

('comfort-level', 'How comfortable are you with technology?', 
 '["Very comfortable", "Somewhat comfortable", "Not very comfortable", "Not at all comfortable"]', 
 'behavioral', 
 'tech-usage',
 '{"techComfort": {"Very comfortable": 0, "Somewhat comfortable": 1, "Not very comfortable": 2, "Not at all comfortable": 3}}',
 '["comfort", "baseline"]'),

('tech-usage', 'Which devices do you use for work?', 
 '["Company laptop only", "Company laptop + personal phone", "Personal laptop", "Multiple devices", "Tablet only"]', 
 'technical', 
 'device-security',
 '{"deviceSecurity": {"Company laptop only": 0, "Company laptop + personal phone": 1, "Personal laptop": 2, "Multiple devices": 1, "Tablet only": 2}}',
 '["devices", "security"]'),

('device-security', 'How do you secure your work devices?', 
 '["Strong password + 2FA", "Strong password only", "Weak password", "No password", "Not sure"]', 
 'technical', 
 'password-habits',
 '{"deviceSecurity": {"Strong password + 2FA": 0, "Strong password only": 1, "Weak password": 2, "No password": 3, "Not sure": 2}}',
 '["security", "authentication"]'),

('password-habits', 'How do you manage your passwords?', 
 '["Password manager", "Remember in browser", "Write them down", "Use same password everywhere", "Not sure"]', 
 'behavioral', 
 'phishing-awareness',
 '{"passwordHygiene": {"Password manager": 0, "Remember in browser": 1, "Write them down": 2, "Use same password everywhere": 3, "Not sure": 2}}',
 '["passwords", "hygiene"]'),

('phishing-awareness', 'How would you handle a suspicious email?', 
 '["Delete immediately", "Report to IT", "Click to investigate", "Forward to colleagues", "Not sure"]', 
 'behavioral', 
 'urgency-response',
 '{"phishingAwareness": {"Delete immediately": 0, "Report to IT": 0, "Click to investigate": 3, "Forward to colleagues": 2, "Not sure": 2}}',
 '["phishing", "awareness"]'),

('urgency-response', 'How do you handle urgent requests from management?', 
 '["Verify via phone first", "Act immediately if from known sender", "Check with IT first", "Always act immediately", "Depends on the request"]', 
 'psychological', 
 'authority-trust',
 '{"urgencyResponse": {"Verify via phone first": 0, "Act immediately if from known sender": 2, "Check with IT first": 1, "Always act immediately": 3, "Depends on the request": 1}}',
 '["urgency", "social-engineering"]'),

('authority-trust', 'How much do you trust requests from authority figures?', 
 '["Always verify first", "Trust if from known sender", "Trust if urgent", "Always trust authority", "Depends on the situation"]', 
 'psychological', 
 'curiosity',
 '{"authorityTrust": {"Always verify first": 0, "Trust if from known sender": 1, "Trust if urgent": 2, "Always trust authority": 3, "Depends on the situation": 1}}',
 '["authority", "trust"]'),

('curiosity', 'How do you handle unexpected links or attachments?', 
 '["Never click", "Click if from trusted source", "Click if interesting", "Always click", "Ask IT first"]', 
 'psychological', 
 'risk-perception',
 '{"curiosity": {"Never click": 0, "Click if from trusted source": 1, "Click if interesting": 3, "Always click": 4, "Ask IT first": 0}}',
 '["curiosity", "clicking"]'),

('risk-perception', 'How do you perceive cybersecurity risks?', 
 '["Very high risk", "Moderate risk", "Low risk", "Not a concern", "Not sure"]', 
 'psychological', 
 null,
 '{"riskPerception": {"Very high risk": 0, "Moderate risk": 1, "Low risk": 2, "Not a concern": 3, "Not sure": 2}}',
 '["risk", "perception"]')
ON CONFLICT (id) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
CREATE INDEX IF NOT EXISTS idx_answers_session_id ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active);
