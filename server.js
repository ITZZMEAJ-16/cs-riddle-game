import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.JWT_SECRET || 'secure_competition_secret_998877'));

// 🌐 CONNECT TO THE ONLINE SUPABASE CLOUD DATABASE
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for cloud hosting platforms
});

// Auto-initialize the cloud table structure on startup
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                name TEXT,
                reg_no TEXT UNIQUE,
                completion_time TEXT
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                verification_token TEXT,
                is_verified BOOLEAN DEFAULT FALSE,
                name TEXT,
                reg_no TEXT
            )
        `);
        console.log("✅ Supabase Cloud Database Connected & Tables Initialized.");
    } catch (err) {
        console.error("🚨 Cloud DB Connection Failure:", err);
    }
}
initDatabase();

// Nodemailer transport
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

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

const checkAuth = (req, res, next) => {
    if (!req.signedCookies.user_id) {
        return res.redirect('/');
    }
    next();
}

app.post('/api/register', async (req, res) => {
    const { email, password, name, regNo } = req.body;
    if (!email || !password || !name || !regNo) {
        return res.status(400).json({ success: false, message: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const result = await pool.query(
            "INSERT INTO users (email, password, verification_token, name, reg_no) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [email, hashedPassword, verificationToken, name, regNo]
        );

        const verificationLink = `http://localhost:${PORT}/api/verify?token=${verificationToken}`;
        
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'Verify your email address',
            html: `Please click this link to verify your email: <a href="${verificationLink}">${verificationLink}</a>`
        });

        res.json({ success: true, message: 'Registration successful. Please check your email to verify your account.' });
    } catch (error) {
        if (error.code === '23505') { // unique_violation
            return res.status(400).json({ success: false, message: 'Email already exists.' });
        }
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/verify', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send('Invalid verification token.');
    }

    try {
        const result = await pool.query("SELECT * FROM users WHERE verification_token = $1", [token]);
        if (result.rows.length === 0) {
            return res.status(400).send('Invalid verification token.');
        }

        const user = result.rows[0];
        await pool.query("UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1", [user.id]);

        res.send('Email verified successfully! You can now <a href="/">login</a>.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});


app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }

        const user = result.rows[0];
        if (!user.is_verified) {
            return res.status(400).json({ success: false, message: 'Please verify your email first.' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }

        res.cookie('user_id', user.id, { signed: true, httpOnly: true });
        res.cookie('player_level', '1', { signed: true, httpOnly: true });
        res.cookie('player_name', user.name, { signed: true, httpOnly: true });
        res.cookie('player_reg', user.reg_no, { signed: true, httpOnly: true });

        res.json({ success: true, redirect: '/level1/' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


app.get('/api/hidden-packet-stream', (req, res) => {
    res.json({ message: "Monitoring...", hidden_flag: "packet_captured" });
});

app.post('/api/submit-answer', checkAuth, (req, res) => {
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

// 📊 READ DIRECTLY FROM THE WORLDWIDE CLOUD MATRIX
app.get('/admin/leaderboard', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leaderboard ORDER BY id ASC");
        let rows = result.rows.map((player, idx) => `
            <tr style="border-bottom: 1px solid #30363d;">
                <td style="padding:12px;">${idx + 1}</td>
                <td style="padding:12px; color:#58a6ff;">${player.name}</td>
                <td style="padding:12px;">${player.reg_no}</td>
                <td style="padding:12px; color:#56d364;">${player.completion_time}</td>
            </tr>
        `).join('');

        res.send(`
            <body style="background:#0d1117; color:#c9d1d9; font-family:monospace; padding:50px;">
                <h2 style="color:#58a6ff; border-bottom:1px solid #30363d; padding-bottom:10px;">🏆 LIVE COMPETITION LEADERBOARD (CLOUD PERSISTENT)</h2>
                <table style="width:100%; border-collapse:collapse; text-align:left; background:#161b22; border:1px solid #30363d;">
                    <thead style="background:#21262d;">
                        <tr>
                            <th style="padding:12px;">Rank</th>
                            <th style="padding:12px;">Name</th>
                            <th style="padding:12px;">Registration ID</th>
                            <th style="padding:12px;">Completion Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; opacity:0.5;">Waiting for completions...</td></tr>'}</tbody>
                </table>
                <script>setTimeout(() => { window.location.reload(); }, 5000);</script>
            </body>
        `);
    } catch (err) {
        res.status(500).send("Database load error.");
    }
});

app.use(checkAuth);
app.use(checkProgress);
app.use(express.static(path.join(__dirname, 'public')));

// 🏆 SAVE WINNER DATA TO THE CLOUD DATABASE
app.get('/victory', checkAuth, async (req, res) => {
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    const name = req.signedCookies.player_name;
    const regNo = req.signedCookies.player_reg;
    
    if (currentProgress >= 9 && name) {
        try {
            const timeString = new Date().toLocaleTimeString();
            await pool.query(
                "INSERT INTO leaderboard (name, reg_no, completion_time) VALUES ($1, $2, $3) ON CONFLICT (reg_no) DO NOTHING",
                [name, regNo, timeString]
            );
            console.log(`💾 Saved ${name} securely to Supabase Cloud.`);
        } catch (err) {
            console.error(err);
        }
        
        res.send("<body style='background:#0d1117; color:#56d364; font-family:monospace; text-align:center; padding:100px;'><h1>🎉 CONGRATULATIONS CONQUEROR!</h1><p style='color:#c9d1d9;'>Your run has been permanently logged in the database cloud.</p></body>");
    } else {
        res.redirect('/level1/');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Core Online at: http://localhost:${PORT}`);
});