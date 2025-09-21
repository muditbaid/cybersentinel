# CyberSentinel - Quick Start Guide

Since you already have a PostgreSQL schema, here's how to get the project running quickly:

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
# Install backend dependencies
cd cybersentinel-backend
npm install

# Install frontend dependencies  
cd ..
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```bash
# Database Configuration (update with your actual credentials)
DATABASE_URL=postgresql://username:password@localhost:5432/your_database_name

# JWT Secret (generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=5000

# Optional: Google Gemini AI API Key
GEMINI_API_KEY=your-gemini-api-key-here
```

### 3. Start the Application

**Terminal 1 - Backend:**
```bash
cd cybersentinel-backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm start
```

### 4. Access the Application

- **Frontend**: http://localhost:3000/cybersentinel.html
- **Backend API**: http://localhost:5000

## 🔧 Database Schema Compatibility

The application expects these tables based on your data model:

### Required Tables:
- `users` (id, name, email, company_id, created_at)
- `assessments` (id, user_id, industry, job_role, started_at, completed_at, status)
- `answers` (id, session_id, question_id, answer_text, timestamp)
- `reports` (id, session_id, overall_score, technical_score, behavioral_score, psychological_score, risk_level, generated_at, json_data)
- `questions` (id, text, options, category, next_logic, patterns, industry_tags, role_tags, active_version)

### Schema Mapping:
The application uses these field mappings:
- `AssessmentSession` → `assessments` table
- `Answer` → `answers` table  
- `Report` → `reports` table
- `Question` → `questions` table

## 🔐 Demo Users

The application includes these demo users (you can add them to your database):

```sql
-- Insert demo users (with hashed password 'password')
INSERT INTO users (email, password_hash, name, role, department) VALUES
('admin@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin User', 'admin', 'IT Security'),
('john@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'John Doe', 'employee', 'Finance'),
('sarah@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Sarah Chen', 'employee', 'HR'),
('mike@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Mike Rodriguez', 'employee', 'IT'),
('lisa@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Lisa Park', 'employee', 'Marketing');
```

## 🎯 Sample Questions

Add some sample questions to get started:

```sql
INSERT INTO questions (id, text, options, category, next_logic, patterns, industry_tags, role_tags, active_version) VALUES
('industry-sector', 'Which industry sector best describes your organization?', 
 '["Finance & Banking", "Healthcare", "Technology", "Manufacturing", "Government", "Education", "Other"]', 
 'behavioral', 
 '{"Finance & Banking": "finance-role", "Healthcare": "healthcare-role", "Technology": "tech-role", "Manufacturing": "manufacturing-role", "Government": "government-role", "Education": "education-role", "Other": "general-role"}',
 '{"roleRisk": {"Finance & Banking": 2, "Healthcare": 3, "Technology": 1, "Manufacturing": 2, "Government": 4, "Education": 2, "Other": 1}}',
 '["industry", "role-branching"]', '[]', 1),
('comfort-level', 'How comfortable are you with technology?', 
 '["Very comfortable", "Somewhat comfortable", "Not very comfortable", "Not at all comfortable"]', 
 'behavioral', 
 'tech-usage',
 '{"techComfort": {"Very comfortable": 0, "Somewhat comfortable": 1, "Not very comfortable": 2, "Not at all comfortable": 3}}',
 '["comfort", "baseline"]', '[]', 1);
```

## 🐛 Troubleshooting

### Common Issues:

1. **Database Connection Error**
   - Check your `DATABASE_URL` in `.env`
   - Ensure PostgreSQL is running
   - Verify database exists

2. **Table Not Found**
   - Check table names match the expected schema
   - Verify column names and types

3. **Authentication Issues**
   - Ensure users table has `password_hash` column
   - Check JWT_SECRET is set

### Quick Test:

```bash
# Test database connection
psql -d your_database_name -c "SELECT * FROM users LIMIT 1;"

# Test backend API
curl http://localhost:5000/api/questions/latest
```

## 📱 Usage

1. **Login** with demo credentials
2. **Admin**: Assign assessments, view team dashboard
3. **Employee**: Take assessments, view reports
4. **Assessment**: Adaptive questions based on role/industry
5. **Reports**: Detailed security analysis and recommendations

## 🔄 Next Steps

1. Customize questions for your organization
2. Add your company's users
3. Configure industry-specific question flows
4. Set up automated question updates with LLM integration

---

**Ready to go!** The application should now be running with your existing PostgreSQL schema.
