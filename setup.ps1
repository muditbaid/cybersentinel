# CyberSentinel Setup Script (PowerShell)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CyberSentinel Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check PostgreSQL
try {
    $psqlVersion = psql --version
    Write-Host "✓ PostgreSQL found: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: PostgreSQL is not installed. Please install PostgreSQL first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Prerequisites check passed" -ForegroundColor Green
Write-Host ""

# Install backend dependencies
Write-Host "[2/6] Installing backend dependencies..." -ForegroundColor Yellow
Set-Location "cybersentinel-backend"
try {
    npm install
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to install backend dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Set-Location ".."
Write-Host ""

# Install frontend dependencies
Write-Host "[3/6] Installing frontend dependencies..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to install frontend dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ""

# Create .env file
Write-Host "[4/6] Setting up environment file..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    @"
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/cybersentinel

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=5000

# Google Gemini AI API Key
GEMINI_API_KEY=your-gemini-api-key-here

# Admin JWT Token
ADMIN_JWT_TOKEN=your-admin-jwt-token-here
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "✓ .env file created" -ForegroundColor Green
} else {
    Write-Host "✓ .env file already exists" -ForegroundColor Green
}
Write-Host ""

# Database setup
Write-Host "[5/6] Database setup..." -ForegroundColor Yellow
Write-Host "Please ensure PostgreSQL is running and enter your postgres password when prompted." -ForegroundColor Yellow
Write-Host ""

try {
    # Try to create database (ignore if it exists)
    psql -U postgres -c "CREATE DATABASE cybersentinel;" 2>$null
    Write-Host "Database creation attempted" -ForegroundColor Yellow
} catch {
    Write-Host "Database might already exist, continuing..." -ForegroundColor Yellow
}

try {
    psql -U postgres -d cybersentinel -f database-schema.sql
    Write-Host "✓ Database setup completed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to set up database schema" -ForegroundColor Red
    Write-Host "Please run manually: psql -U postgres -d cybersentinel -f database-schema.sql" -ForegroundColor Yellow
    Read-Host "Press Enter to continue anyway"
}
Write-Host ""

Write-Host "[6/6] Setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "1. Update the .env file with your actual PostgreSQL password" -ForegroundColor White
Write-Host "2. Start the backend: cd cybersentinel-backend && npm run dev" -ForegroundColor White
Write-Host "3. Start the frontend: npm start" -ForegroundColor White
Write-Host "4. Open http://localhost:3000/cybersentinel.html" -ForegroundColor White
Write-Host ""
Write-Host "Demo Credentials:" -ForegroundColor Yellow
Write-Host "- Admin: admin@company.com / password" -ForegroundColor White
Write-Host "- Employee: john@company.com / password" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
