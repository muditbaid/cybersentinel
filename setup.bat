@echo off
echo ========================================
echo CyberSentinel Setup Script
echo ========================================
echo.

echo [1/6] Checking prerequisites...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

where psql >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: PostgreSQL is not installed. Please install PostgreSQL first.
    pause
    exit /b 1
)

echo ✓ Prerequisites check passed
echo.

echo [2/6] Installing backend dependencies...
cd cybersentinel-backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
cd ..
echo ✓ Backend dependencies installed
echo.

echo [3/6] Installing frontend dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)
echo ✓ Frontend dependencies installed
echo.

echo [4/6] Setting up environment file...
if not exist .env (
    echo Creating .env file...
    echo # Database Configuration > .env
    echo DATABASE_URL=postgresql://postgres:password@localhost:5432/cybersentinel >> .env
    echo. >> .env
    echo # JWT Secret >> .env
    echo JWT_SECRET=your-super-secret-jwt-key-change-this-in-production >> .env
    echo. >> .env
    echo # Server Configuration >> .env
    echo PORT=5000 >> .env
    echo. >> .env
    echo # Google Gemini AI API Key >> .env
    echo GEMINI_API_KEY=your-gemini-api-key-here >> .env
    echo. >> .env
    echo # Admin JWT Token >> .env
    echo ADMIN_JWT_TOKEN=your-admin-jwt-token-here >> .env
    echo ✓ .env file created
) else (
    echo ✓ .env file already exists
)
echo.

echo [5/6] Database setup...
echo Please ensure PostgreSQL is running and enter your postgres password when prompted.
echo.
psql -U postgres -c "CREATE DATABASE cybersentinel;" 2>nul
if %errorlevel% neq 0 (
    echo Database might already exist, continuing...
)
psql -U postgres -d cybersentinel -f database-schema.sql
if %errorlevel% neq 0 (
    echo ERROR: Failed to set up database schema
    echo Please run: psql -U postgres -d cybersentinel -f database-schema.sql
    pause
    exit /b 1
)
echo ✓ Database setup completed
echo.

echo [6/6] Setup completed successfully!
echo.
echo ========================================
echo Next Steps:
echo ========================================
echo 1. Update the .env file with your actual PostgreSQL password
echo 2. Start the backend: cd cybersentinel-backend && npm run dev
echo 3. Start the frontend: npm start
echo 4. Open http://localhost:3000/cybersentinel.html
echo.
echo Demo Credentials:
echo - Admin: admin@company.com / password
echo - Employee: john@company.com / password
echo.
pause
