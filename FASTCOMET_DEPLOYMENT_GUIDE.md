# 🚀 FastComet Deployment Guide for Generational Investing

## Complete Step-by-Step Instructions

### Phase 1: Create MySQL Database in cPanel

1. **Log into your FastComet cPanel**
   - URL: Usually `yourdomain.com/cpanel` or `cpanel.yourdomain.com`
   - Use credentials provided by FastComet

2. **Create MySQL Database**
   - Navigate to **"MySQL® Databases"** in cPanel
   - Under **"Create New Database"**:
     - Database Name: `generational_investing`
     - Click **"Create Database"**
   - **IMPORTANT**: Note the full database name (usually `username_generational_investing`)

3. **Create Database User**
   - Scroll to **"MySQL Users"** section
   - Under **"Add New User"**:
     - Username: `gen_user`
     - Password: Generate a strong password (SAVE THIS!)
     - Click **"Create User"**
   - **IMPORTANT**: Note the full username (usually `username_gen_user`)

4. **Add User to Database**
   - Scroll to **"Add User To Database"** section
   - Select the user you just created
   - Select the database you just created
   - Click **"Add"**
   - On privileges page, select **"ALL PRIVILEGES"**
   - Click **"Make Changes"**

5. **Note Your Database Credentials**
   ```
   DB_HOST: localhost (or IP provided by FastComet)
   DB_PORT: 3306
   DB_USER: username_gen_user
   DB_PASSWORD: [password you created]
   DB_NAME: username_generational_investing
   ```

### Phase 2: Import Database Schema

1. **Access phpMyAdmin**
   - In cPanel, click **"phpMyAdmin"**
   - Select your database from the left sidebar

2. **Import Schema**
   - Click the **"SQL"** tab
   - Copy and paste this schema:

```sql
-- Users table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Companies table
CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  market_cap DECIMAL(20, 2),
  exchange VARCHAR(50),
  next_earnings_date DATE,
  sector VARCHAR(100),
  industry VARCHAR(100),
  is_wonderful TINYINT(1) DEFAULT 0,
  research_score INT,
  anti_fragile_score INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_ticker (ticker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account balances table
CREATE TABLE account_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  balance_cad DECIMAL(15, 2) DEFAULT 0,
  balance_usd DECIMAL(15, 2) DEFAULT 0,
  cash_balance_usd DECIMAL(15, 2) DEFAULT 0,
  month INT NOT NULL,
  year INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_account_period (user_id, account_type, month, year),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock trades table
CREATE TABLE stock_trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  company_id INT,
  ticker VARCHAR(20) NOT NULL,
  trade_type VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  trade_date DATE NOT NULL,
  is_open TINYINT(1) DEFAULT 1,
  cost_basis_adjustment DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_ticker (ticker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Option trades table
CREATE TABLE option_trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  company_id INT,
  ticker VARCHAR(20) NOT NULL,
  strategy_type VARCHAR(50) NOT NULL,
  strike_price DECIMAL(10, 2) NOT NULL,
  strike_price_2 DECIMAL(10, 2),
  strike_price_3 DECIMAL(10, 2),
  strike_price_4 DECIMAL(10, 2),
  premium DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL,
  expiration_date DATE NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  trade_date DATE NOT NULL,
  is_open TINYINT(1) DEFAULT 1,
  close_date DATE,
  close_price DECIMAL(10, 2),
  profit_loss DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_ticker (ticker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cost basis adjustments table
CREATE TABLE cost_basis_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_trade_id INT NOT NULL,
  adjustment_type VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  adjustment_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stock_trade_id) REFERENCES stock_trades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

3. **Click "Go"** to execute the schema

### Phase 3: Upload Application Files

#### Option A: Using File Manager (Easiest)

1. **Prepare Files Locally**
   - I'll provide you with a deployment package
   - Download it to your computer

2. **Access File Manager in cPanel**
   - Navigate to **"File Manager"**
   - Go to your domain's directory (usually `public_html/yourdomain` or `public_html`)

3. **Upload Files**
   - Click **"Upload"**
   - Select the ZIP file I'll provide
   - After upload, right-click the ZIP and select **"Extract"**

#### Option B: Using FTP/SFTP

1. **Get SFTP Credentials from FastComet**
   - Check your welcome email or contact support

2. **Connect Using FileZilla or Similar**
   - Host: Your FastComet server
   - Username: Your cPanel username
   - Password: Your cPanel password
   - Port: 21 (FTP) or 22 (SFTP)

3. **Upload These Directories**:
   - `src/` - Application source code
   - `public/` - Static files
   - `node_modules/` - Dependencies
   - `package.json` - Package configuration
   - `.env` - Environment variables (create this)
   - `server.js` - Server entry point

### Phase 4: Configure Environment Variables

1. **Create `.env` File**
   - In File Manager, navigate to your application directory
   - Click **"+ File"** to create new file
   - Name it `.env`
   - Edit the file and add:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_cpanel_username_gen_user
DB_PASSWORD=your_database_password_here
DB_NAME=your_cpanel_username_generational_investing

# JWT Secret (generate a random string)
JWT_SECRET=your-random-secret-key-at-least-32-characters-long

# Server Configuration
PORT=3000
NODE_ENV=production
```

2. **IMPORTANT**: Replace the placeholders with your actual values
3. **Save the file**

### Phase 5: Setup Node.js Application in cPanel

1. **Access Node.js Setup**
   - In cPanel, find **"Setup Node.js App"** under Software section
   - Click on it

2. **Create Application**
   - Click **"Create Application"** button
   - Fill in the form:
     - **Node.js version**: Select latest stable (16.x, 18.x, or 20.x)
     - **Application mode**: Production
     - **Application root**: Path to your app (e.g., `generational-investing`)
     - **Application URL**: Your domain or subdomain
     - **Application startup file**: `server.js`
     - **Passenger log file**: Leave default

3. **Environment Variables**
   - After creating the app, you'll see environment variables section
   - Add these variables (same as .env file):
     - DB_HOST
     - DB_PORT
     - DB_USER
     - DB_PASSWORD
     - DB_NAME
     - JWT_SECRET
     - PORT
     - NODE_ENV

4. **Click "Create"**

### Phase 6: Install Dependencies

1. **In Node.js App Interface**
   - You should see your newly created application
   - Look for **"NPM Install"** or **"Run NPM Install"** button
   - Click it to install all dependencies

2. **Alternative: SSH Method**
   - If FastComet provides SSH access:
   ```bash
   ssh your_username@your_server.fastcomet.com
   cd ~/generational-investing
   npm install --production
   ```

### Phase 7: Start the Application

1. **Start Application**
   - In the Node.js App interface
   - Look for **"Start"** or **"Restart"** button
   - Click it

2. **Check Status**
   - Status should show "Running" with a green indicator
   - If there are errors, check the logs

3. **View Logs**
   - Click on **"View Logs"** or **"Open Logs"**
   - Check for any error messages

### Phase 8: Configure Domain/Subdomain

1. **Add Domain (if not already added)**
   - In cPanel, go to **"Domains"** or **"Subdomains"**
   - Add your domain/subdomain
   - Point document root to your app directory

2. **SSL Certificate**
   - In cPanel, go to **"SSL/TLS Status"**
   - Enable AutoSSL for your domain
   - Wait a few minutes for certificate to be issued

3. **Configure Reverse Proxy (if needed)**
   - FastComet usually handles this automatically
   - If not, contact support to configure reverse proxy

### Phase 9: Test Your Application

1. **Access Your Website**
   - Visit: `https://yourdomain.com`
   - You should see the login screen

2. **Register Test Account**
   - Click "Register"
   - Create a test account
   - Login and verify all features work

3. **Test Database Connection**
   - Try adding a company
   - Add account balances
   - Record a stock trade
   - Check if data persists after refresh

### Phase 10: Troubleshooting

#### App Won't Start

1. **Check Node.js Version**
   - Ensure compatible version (16.x or higher)

2. **Check Logs**
   - Look for error messages
   - Common issues:
     - Missing dependencies
     - Database connection failed
     - Port conflicts

3. **Verify .env File**
   - Ensure all values are correct
   - No extra spaces or quotes

#### Database Connection Failed

1. **Verify Database Credentials**
   - Test connection in phpMyAdmin
   - Ensure user has privileges

2. **Check DB_HOST**
   - Try `localhost`
   - Try `127.0.0.1`
   - Contact FastComet for correct host

#### 502 Bad Gateway or 503 Error

1. **App Not Running**
   - Restart the Node.js app
   - Check logs for crash reason

2. **Reverse Proxy Issue**
   - Contact FastComet support
   - They need to configure proxy properly

#### Can't Access Website

1. **Check DNS**
   - Ensure domain points to FastComet
   - Can take 24-48 hours to propagate

2. **Check Application URL**
   - Verify it matches your domain in Node.js app settings

### Phase 11: Maintenance

#### Updating Application

1. **Stop Application**
   - In Node.js App interface, click "Stop"

2. **Upload New Files**
   - Replace changed files via File Manager or FTP

3. **Restart Application**
   - Click "Restart" in Node.js App interface

#### Database Backup

1. **In phpMyAdmin**
   - Select your database
   - Click "Export"
   - Choose "Quick" export method
   - Click "Go"
   - Save the SQL file

2. **Schedule Regular Backups**
   - FastComet may offer automatic backups
   - Check cPanel backup options

#### Monitoring

1. **Check Logs Regularly**
   - Review application logs for errors
   - Monitor database size

2. **Performance Monitoring**
   - Check response times
   - Monitor memory usage in Node.js app interface

---

## Support Contacts

**FastComet Support**:
- Live Chat: Available 24/7 in cPanel
- Email: support@fastcomet.com
- Phone: 1-855-818-9717

**Common Questions to Ask Support**:
1. "How do I access SSH for my hosting account?"
2. "What is the correct DB_HOST value for MySQL?"
3. "Can you help configure reverse proxy for my Node.js app?"
4. "How do I increase Node.js memory limit?"

---

## Additional Resources

- FastComet Node.js Tutorials: https://www.fastcomet.com/tutorials/nodejs
- FastComet Knowledge Base: https://www.fastcomet.com/tutorials
- Node.js Documentation: https://nodejs.org/docs

---

**Need Help?** Contact me or FastComet's 24/7 support team!
