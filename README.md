# CyberSentinel - Corporate Security Assessment Platform

A comprehensive, adaptive security assessment platform that provides personalized cybersecurity evaluations for corporate employees. The system uses conversational AI to assess behavioral patterns, psychological factors, and technical security practices.

## 🚀 Features

- **Adaptive Assessment**: Questions adapt based on industry, role, and previous answers
- **Behavioral Analysis**: Identifies psychological triggers like urgency, authority, and curiosity
- **Role-Specific Questions**: Tailored assessments for Finance, Healthcare, IT, HR, and other sectors
- **Real-time Scoring**: Dynamic risk assessment with category-based scoring
- **Admin Dashboard**: Comprehensive management interface for administrators
- **Employee Dashboard**: Personalized view for employees with assessment history
- **Report Generation**: Detailed security reports with actionable recommendations
- **LLM Integration**: Automatic question updates using Google Gemini AI

## 🏗️ Architecture

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla JS with Tailwind CSS)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **AI Integration**: Google Gemini API for question generation
- **Authentication**: JWT-based authentication

## 📋 Prerequisites

Before running the project, ensure you have:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **PostgreSQL** (v12 or higher) - [Download here](https://www.postgresql.org/download/)
3. **Python** (for frontend server) - Usually pre-installed on most systems
4. **Git** - [Download here](https://git-scm.com/)

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd CyberSentinel
```

### 2. Database Setup

#### Install PostgreSQL
- Download and install PostgreSQL from the official website
- During installation, remember the password you set for the `postgres` user

#### Create Database
```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create database
CREATE DATABASE cybersentinel;

# Exit psql
\q
```

#### Run Database Schema
```bash
# Run the schema script
psql -U postgres -d cybersentinel -f database-schema.sql
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/cybersentinel

# JWT Secret (generate a strong secret for production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=5000

# Google Gemini AI API Key (optional, for question updates)
GEMINI_API_KEY=your-gemini-api-key-here

# Admin JWT Token (get this from /api/auth/login response)
ADMIN_JWT_TOKEN=your-admin-jwt-token-here
```

**Important**: Replace `your_password` with your actual PostgreSQL password.

### 4. Install Dependencies

#### Backend Dependencies
```bash
cd cybersentinel-backend
npm install
```

#### Frontend Dependencies
```bash
cd ..
npm install
```

### 5. Start the Application

#### Option 1: Start Both Services (Recommended)

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
cd cybersentinel-backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm start
```

#### Option 2: Manual Start

**Backend:**
```bash
cd cybersentinel-backend
node server.js
```

**Frontend:**
```bash
python -m http.server 3000
```

### 6. Access the Application

- **Frontend**: http://localhost:3000/cybersentinel.html
- **Backend API**: http://localhost:5000

## 🔐 Demo Credentials

The application comes with pre-configured demo users:

| Role | Email | Password | Department |
|------|-------|----------|------------|
| Admin | admin@company.com | password | IT Security |
| Employee | john@company.com | password | Finance |
| Employee | sarah@company.com | password | HR |
| Employee | mike@company.com | password | IT |
| Employee | lisa@company.com | password | Marketing |

## 📊 Usage

### For Administrators

1. **Login** with admin credentials
2. **Dashboard** - View employee statistics and risk overview
3. **Assign Assessments** - Create new assessment assignments
4. **Monitor Progress** - Track completion status and scores

### For Employees

1. **Login** with employee credentials
2. **Dashboard** - View assigned assessments and past reports
3. **Take Assessment** - Complete adaptive security assessments
4. **View Reports** - Access detailed security reports and recommendations

### Assessment Flow

1. **Industry Selection** - Choose your organization's sector
2. **Role Identification** - Specify your job function
3. **Adaptive Questions** - Answer questions tailored to your role
4. **Behavioral Analysis** - System analyzes psychological patterns
5. **Report Generation** - Receive personalized security recommendations

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login

### Assessments
- `POST /api/assessments/start` - Start new assessment
- `POST /api/assessments/:sessionId/answer` - Submit answer
- `GET /api/assessments/:sessionId/report` - Get assessment report

### Admin
- `POST /api/assign` - Assign assessment to user
- `GET /api/sync-questions-from-llm` - Sync questions from LLM

### Questions
- `GET /api/questions/latest` - Get latest question set

## 🤖 LLM Integration

The system includes automatic question updates using Google Gemini AI:

```bash
# Update questions from LLM
cd cybersentinel-backend
node ../update-questions-from-llm.js
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify PostgreSQL is running
   - Check DATABASE_URL in .env file
   - Ensure database exists

2. **Port Already in Use**
   - Change PORT in .env file
   - Kill existing processes using the port

3. **Module Not Found**
   - Run `npm install` in both frontend and backend directories
   - Check Node.js version compatibility

4. **CORS Issues**
   - Ensure backend is running on port 5000
   - Check frontend is accessing correct API URL

### Logs

- Backend logs: Check terminal running `npm run dev`
- Database logs: Check PostgreSQL logs
- Frontend errors: Check browser console

## 📁 Project Structure

```
CyberSentinel/
├── cybersentinel.html          # Main frontend application
├── server.js                   # Backend server (moved to root for convenience)
├── update-questions-from-llm.js # LLM integration script
├── database-schema.sql         # Database setup script
├── package.json               # Frontend dependencies
├── cybersentinel-backend/
│   ├── server.js              # Backend server (alternative location)
│   ├── package.json           # Backend dependencies
│   └── node_modules/          # Backend dependencies
├── node_modules/              # Frontend dependencies
└── README.md                  # This file
```

## 🚀 Deployment

### Production Considerations

1. **Environment Variables**
   - Use strong, unique JWT secrets
   - Set up proper database credentials
   - Configure production database URL

2. **Security**
   - Enable HTTPS
   - Set up proper CORS policies
   - Implement rate limiting
   - Use environment-specific configurations

3. **Database**
   - Set up production PostgreSQL instance
   - Configure connection pooling
   - Implement backup strategies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the troubleshooting section

---

**CyberSentinel** - Empowering organizations with adaptive cybersecurity assessments.
