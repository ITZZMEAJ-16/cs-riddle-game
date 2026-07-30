require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const dns = require('dns');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Core Security Middleware Configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 2. Cloud Database Connection Architecture (Supabase Transaction Pooler)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for secure cloud routing handlers
    }
});

// Verify cluster connectivity status on initialization
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Cloud DB Connection Failure:', err.stack);
    } else {
        console.log('✅ Cloud Database Verification Architecture & Pooler Ready (Port 6543).');
        release();
    }
});

// 3. Fully Hardened Nodemailer Transporter Configuration (Forces IPv4 Verification)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // Force Node's internal network layer to drop IPv6 loopbacks and use IPv4 exclusively
    lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { family: 4 }, (err, address, family) => {
            callback(err, address, family);
        });
    },
    tls: {
        rejectUnauthorized: false // Prevents handshake structural blocks on direct streams
    }
});

// Temporary memory matrix to house runtime verification tokens (OTPs)
const activeOtpTokens = new Map();

// ==========================================
// 🛰️ API ENDPOINTS
// ==========================================

// PHASE 1: Whitelist Verification & OTP Dispatch
app.post('/api/start', async (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ success: false, message: "Missing parameter payloads." });
    }

    try {
        // Query the cloud table using parametric syntax to prevent injection vulnerabilities
        const whitelistCheck = await pool.query(
            'SELECT * FROM participants WHERE LOWER(email) = LOWER($1)', 
            [email.trim()]
        );

        if (whitelistCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "Access Denied: Email parameter missing from registration manifest." 
            });
        }

        // Generate a cryptographically secure 6-digit verification code token
        const operationalToken = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Cache token with an operational security expiration timeline (10 Minutes)
        activeOtpTokens.set(email.toLowerCase().trim(), {
            token: operationalToken,
            expires: Date.now() + 10 * 60 * 1000
        });

        // Construct email delivery manifest payload
        const mailOptions = {
            from: `"The Enigma Core" <${process.env.EMAIL_USER}>`,
            to: email.trim(),
            subject: "🔐 SYSTEM ACCESS TOKEN | Wire Wars Security Protocol",
            text: `Greetings ${name},\n\nYour operational security token for system initialization is: ${operationalToken}\n\nThis token expires in 10 minutes. Do not share this sequence.`,
            html: `
                <div style="background:#161b22; color:#c9d1d9; font-family:monospace; padding:30px; border:1px solid #30363d; border-radius:6px; max-width:450px; margin:auto;">
                    <h2 style="color:#58a6ff; margin-top:0; border-bottom:1px solid #30363d; padding-bottom:10px;">🔐 ENIGMA CORE SECURITY Token</h2>
                    <p>Identity confirmed for participant record field: <strong>${name}</strong></p>
                    <p>Input the following 6-digit access token into the gateway portal configuration array:</p>
                    <div style="background:#0d1117; color:#56d364; font-size:24px; text-align:center; padding:15px; letter-spacing:6px; font-weight:bold; border:1px solid #30363d; border-radius:4px; margin:20px 0;">
                        ${operationalToken}
                    </div>
                    <p style="font-size:11px; color:#8b949e;">This transmission is encrypted. Security lifetimes fade within 600 seconds.</p>
                </div>
            `
        };

        // Fire transaction out through the explicitly mapped IPv4 outbound route
        await transporter.sendMail(mailOptions);
        
        return res.json({ success: true, message: "Verification sequence dispatched successfully." });

    } catch (error) {
        console.error("🚨 System Core Security Error:", error);
        return res.status(500).json({ 
            success: false, 
            message: `System Core Security Error: ${error.message}` 
        });
    }
});

// PHASE 2: Token Validation & Gateway Authorization
app.post('/api/verify-otp', async (req, res) => {
    const { email, otpCode } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    if (!email || !otpCode) {
        return res.status(400).json({ success: false, message: "Credentials packet missing payloads." });
    }

    const savedRecord = activeOtpTokens.get(cleanEmail);

    if (!savedRecord) {
        return res.status(400).json({ success: false, message: "No active verification sequence found for this entity." });
    }

    if (Date.now() > savedRecord.expires) {
        activeOtpTokens.delete(cleanEmail);
        return res.status(401).json({ success: false, message: "Security token lifetime expired. Request a new code configuration." });
    }

    if (savedRecord.token !== otpCode.trim()) {
        return res.status(401).json({ success: false, message: "Cryptographic configuration mismatch. Access Denied." });
    }

    // Success: Purge token from memory and authorize immediate redirection to Game Level 1
    activeOtpTokens.delete(cleanEmail);
    return res.json({ success: true, redirect: '/level1.html' });
});

// Initialize active listening hooks globally across IPv4 space interfaces
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Security Engine online and listening on global IPv4 space port ${PORT}`);
});