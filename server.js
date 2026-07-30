import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.JWT_SECRET || 'secure_competition_secret_998877'));

// 🚀 NODEMAILER SMTP TRANSPORTER (Gmail Service)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,      
        pass: process.env.EMAIL_PASS       
    }
});

// 🌐 CLOUD SUPABASE POOL CONNECTION
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Auto-initialize databases structures
async function initDatabase() {
    try {
        // Create the core tracking, registration, and OTP schemas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS participants (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                name TEXT,
                email TEXT UNIQUE,
                completion_time TEXT
            );
            CREATE TABLE IF NOT EXISTS security_otps (
                email TEXT PRIMARY KEY,
                otp_code TEXT,
                name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Cloud Database Verification Architecture & Paid Whitelist Ready.");
    } catch (err) {
        console.error("🚨 Cloud DB Initialization Fault:", err);
    }
}
initDatabase();

const RIDDLE_ANSWERS = {
    1: "4815162342",      
    2: "console_ninja",   
    3: "admin_override",  
    4: "packet_captured",  
    5: "hidden_in_plain_sight", 
    6: "i",        
    7: "deadbeef",        
    8: "root_access_granted" 
};

const checkProgress = (req, res, next) => {
    const requestedPath = req.path;
    const match = requestedPath.match(/\/level(\d+)/);
    if (match) {
        const requestedLevel = parseInt(match[1], 10);
        const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 0;
        if (currentProgress === 0) return res.redirect('/');
        if (requestedLevel > currentProgress) return res.status(403).send("Access Denied");
    }
    next();
};

// 🛫 PHASE 1: STRICT VERIFICATION AND OTP PIPELINE
app.post('/api/start', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: "Parameters incomplete." });

    const cleanEmail = email.trim().toLowerCase();

    try {
        // 🛡️ SECURITY STEP: Query the cloud database to check if the email has paid status
        const checkPaidUser = await pool.query("SELECT email FROM participants WHERE email = $1", [cleanEmail]);
        
        if (checkPaidUser.rows.length === 0) {
            // Reject completely if the email is missing from the list
            return res.status(403).json({ 
                success: false, 
                message: "Access Denied: This email address is not registered as a paid competitor." 
            });
        }

        // Email validated! Proceed to generate a secure verification key
        const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

        await pool.query(
            "INSERT INTO security_otps (email, otp_code, name) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET otp_code = $2, name = $3, created_at = CURRENT_TIMESTAMP",
            [cleanEmail, generatedOTP, name]
        );

        await transporter.sendMail({
            from: `"Enigma System Core" <${process.env.EMAIL_USER}>`,
            to: cleanEmail,
            subject: '[THE ENIGMA] Paid Registration Gate Verification Token',
            html: `
                <div style="font-family:monospace; background:#0d1117; color:#58a6ff; padding:30px; border:1px solid #30363d; border-radius:6px;">
                    <h2 style="color:#58a6ff; border-bottom:1px solid #30363d; padding-bottom:10px;">🔐 PAID GATEWAY ACCESS VERIFIED</h2>
                    <p style="color:#c9d1d9;">Competitor Identity Match: <strong>${name}</strong></p>
                    <p style="color:#c9d1d9;">Input the following runtime security token code directly into the setup console layout window to mount Level 1:</p>
                    <h1 style="color:#56d364; letter-spacing:6px; font-size:38px; background:#161b22; padding:15px; display:inline-block; border-radius:4px;">${generatedOTP}</h1>
                    <p style="color:#8b949e; font-size:11px; margin-top:20px;">If you did not initiate this system loop sequence request, contact your administrator context panel.</p>
                </div>
            `
        });

        return res.json({ success: true, step: "otp_verification_pending" });

    } catch (err) {
        console.error("System Core Security Error:", err);
        return res.status(500).json({ success: false, message: "Internal cloud communication routing fault." });
    }
});

// 🔑 PHASE 2: AUTHENTICATE INTERACTIVE OTP SECURITY CODES
app.post('/api/verify-otp', async (req, res) => {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) return res.status(400).json({ success: false, message: "Parameters incomplete." });

    const cleanEmail = email.trim().toLowerCase();

    try {
        const result = await pool.query("SELECT * FROM security_otps WHERE email = $1", [cleanEmail]);
        
        if (result.rows.length > 0 && result.rows[0].otp_code === otpCode.trim()) {
            const userData = result.rows[0];
            await pool.query("DELETE FROM security_otps WHERE email = $1", [cleanEmail]);

            res.cookie('player_level', '1', { signed: true, httpOnly: true });
            res.cookie('player_name', userData.name, { signed: true, httpOnly: true });
            res.cookie('player_email', userData.email, { signed: true, httpOnly: true });

            return res.json({ success: true, redirect: '/level1/' });
        } else {
            return res.status(400).json({ success: false, message: "Incorrect token code value." });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: "Verification processing fault." });
    }
});

app.post('/api/submit-answer', (req, res) => {
    const { answer } = req.body;
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    const correctAnswer = RIDDLE_ANSWERS[currentProgress];
    
    if (answer && answer.trim().toLowerCase() === correctAnswer.toLowerCase()) {
        const nextLevel = currentProgress + 1;
        res.cookie('player_level', nextLevel.toString(), { signed: true, httpOnly: true });
        return res.json({ success: true, nextLevel: nextLevel === 9 ? '/victory' : `/level${nextLevel}/` });
    } else {
        return res.json({ success: false, message: "Incorrect key string." });
    }
});

app.get('/api/hidden-packet-stream', (req, res) => {
    res.json({ message: "Monitoring...", hidden_flag: "packet_captured" });
});

app.get('/admin/leaderboard', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leaderboard ORDER BY id ASC");
        let rows = result.rows.map((player, idx) => `
            <tr style="border-bottom: 1px solid #30363d;">
                <td style="padding:12px;">${idx + 1}</td>
                <td style="padding:12px; color:#58a6ff;">${player.name}</td>
                <td style="padding:12px;">${player.email}</td>
                <td style="padding:12px; color:#56d364;">${player.completion_time}</td>
            </tr>
        `).join('');

        res.send(`
            <body style="background:#0d1117; color:#c9d1d9; font-family:monospace; padding:50px;">
                <h2 style="color:#58a6ff; border-bottom:1px solid #30363d; padding-bottom:10px;">🏆 LIVE COMPETITION LEADERBOARD</h2>
                <table style="width:100%; border-collapse:collapse; text-align:left; background:#161b22; border:1px solid #30363d;">
                    <thead style="background:#21262d;">
                        <tr><th style="padding:12px;">Rank</th><th style="padding:12px;">Name</th><th style="padding:12px;">Email Address</th><th style="padding:12px;">Completion Timestamp</th></tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; opacity:0.5;">Waiting for runs...</td></tr>'}</tbody>
                </table>
                <script>setTimeout(() => { window.location.reload(); }, 5000);</script>
            </body>
        `);
    } catch (err) { res.status(500).send("Database load error."); }
});

app.use(checkProgress);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/victory', async (req, res) => {
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    const name = req.signedCookies.player_name;
    const email = req.signedCookies.player_email;
    
    if (currentProgress >= 9 && name) {
        try {
            const timeString = new Date().toLocaleTimeString();
            await pool.query(
                "INSERT INTO leaderboard (name, email, completion_time) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
                [name, email, timeString]
            );
        } catch (err) {}
        res.send("<body style='background:#0d1117; color:#56d364; font-family:monospace; text-align:center; padding:100px;'><h1>🎉 CONGRATULATIONS CONQUEROR!</h1></body>");
    } else { res.redirect('/level1/'); }
});

app.listen(PORT, () => { console.log(`🚀 Core Active on Port: ${PORT}`); });