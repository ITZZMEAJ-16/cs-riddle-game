import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';



dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Trust proxy headers on Render
}
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.JWT_SECRET || 'secure_competition_secret_998877'));

// --- Database ---
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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
        console.log("✅ Supabase Cloud Database Connected & Tables Initialized.");
    } catch (err) {
        console.error("🚨 Cloud DB Connection Failure:", err);
    }
}
initDatabase();

// --- Email ---


// --- Constants ---
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

const COOKIE_OPTIONS = {
    signed: true,
    httpOnly: true,
    secure: IS_PROD
};


// --- Auth Middleware ---
const checkAuth = (req, res, next) => {
    if (!req.signedCookies.user_id) {
        // Allow access to the root page (login/register)
        if (req.path === '/' || req.path === '/index.html') {
            return next();
        }
        return res.redirect('/');
    }
    next();
};

const checkProgress = (req, res, next) => {
    const requestedPath = req.path;
    const match = requestedPath.match(/^\/level(\d+)/);

    if (match) {
        const requestedLevel = parseInt(match[1], 10);
        const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 0;
        if (requestedLevel > currentProgress) {
            return res.status(403).send("Access Denied: Level not unlocked.");
        }
    }
    next();
};


// --- API Routes (Public) ---
// --- HARDCODED CREDENTIALS FOR MULTIPLE USERS ---
// You can add more participants to this list
const participants = [
    { email: "user1@example.com", password: "password1", name: "Participant One", regNo: "001" },
    { email: "user2@example.com", password: "password2", name: "Participant Two", regNo: "002" },
    { email: "user3@example.com", password: "password3", name: "Participant Three", regNo: "003" }
];

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = participants.find(p => p.email === email && p.password === password);

    if (user) {
        const userId = participants.indexOf(user); 

        res.cookie('user_id', userId, COOKIE_OPTIONS);
        res.cookie('player_level', '1', COOKIE_OPTIONS);
        res.cookie('player_name', user.name, COOKIE_OPTIONS);
        res.cookie('player_reg', user.regNo, COOKIE_OPTIONS);

        res.json({ success: true, redirect: '/level1/' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }
});

// --- Static assets ---
// Serve public files before authentication
app.use(express.static(path.join(__dirname, 'public')));


// --- Protected Routes ---
app.get('/level:level', checkAuth, checkProgress, (req, res) => {
    const level = req.params.level;
    res.sendFile(path.join(__dirname, 'public', `level${level}`, 'index.html'));
});

app.get('/api/hidden-packet-stream', checkAuth, (req, res) => {
    res.json({ message: "Monitoring...", hidden_flag: "packet_captured" });
});

app.post('/api/submit-answer', checkAuth, (req, res) => {
    const { answer } = req.body;
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    const correctAnswer = RIDDLE_ANSWERS[currentProgress];
    
    if (answer && answer.trim().toLowerCase() === correctAnswer.toLowerCase()) {
        const nextLevel = currentProgress + 1;
        res.cookie('player_level', nextLevel.toString(), COOKIE_OPTIONS);
        return res.json({ success: true, nextLevel: nextLevel === 9 ? '/victory' : `/level${nextLevel}/` });
    } else {
        return res.json({ success: false, message: "Incorrect key string." });
    }
});

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
            res.send("<body style='background:#0d1117; color:#56d364; font-family:monospace; text-align:center; padding:100px;'><h1>🎉 CONGRATULATIONS CONQUEROR!</h1><p style='color:#c9d1d9;'>Your run has been permanently logged in the database cloud.</p></body>");
        } catch (err) {
            console.error(err);
            res.status(500).send("Error saving to leaderboard.");
        }
    } else {
        res.redirect('/level1/');
    }
});

// --- Admin ---
app.get('/admin/leaderboard', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leaderboard ORDER BY id ASC");
        let rows = result.rows.map((player, idx) => `...`).join(''); // Truncated for brevity
        res.send(`...`); // Truncated for brevity
    } catch (err) {
        res.status(500).send("Database load error.");
    }
});


// --- Server ---
app.listen(PORT, () => {
    console.log(`🚀 Core Online at: http://localhost:${PORT}`);
});