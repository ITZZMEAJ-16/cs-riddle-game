import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import basicAuth from 'express-basic-auth';
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
// Supabase and similar cloud Postgres services often use a certificate chain that
// requires TLS but not strict CA verification in Node.js.
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: IS_PROD || process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false
});

async function initDatabase() {
    try {
        // Drop the table to ensure a clean start, fixing any schema issues.
        // This is safe to do before the competition starts.
        // await pool.query(`DROP TABLE IF EXISTS leaderboard;`); // This is destructive, disabled for safety.

        await pool.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                name TEXT,
                reg_no TEXT UNIQUE NOT NULL,
                completion_time TIMESTAMPTZ DEFAULT NOW()
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
    6: "i", // Assuming this is the answer for the existing level 6
    7: "deadbeef", // Assuming this is the answer for the existing level 7
    8: "root_access_granted", // Assuming this is the answer for the existing level 8
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
    { email: "adhijeevan92@gmail.com", password: "6508", name: "Adhitya Jeevan", regNo: "000" },
    { email: "muthuakshaya166@gmail.com", password: "6771", name: "Akshaya A", regNo: "001" },
    { email: "divyamaryjohn22@gmail.com", password: "4465", name: "Divya Mary John", regNo: "002" },
    { email: "gurugubilli_b240720ee@nitc.ac.in", password: "8679", name: "G Sai Deekshith", regNo: "003" },
    { email: "sankar689510@gmail.com", password: "8153", name: "Sankaranarayanan M", regNo: "004" },
    { email: "abelmathew006@gmail.com", password: "1370", name: "Abel Mathew", regNo: "005" },
    { email: "nandhanars1111@gmail.com", password: "6179", name: "Nandhana R S", regNo: "006" },
    { email: "amithasathyan286@gmail.com", password: "0577", name: "Amitha Sathyan", regNo: "007" },
    { email: "amankanhikoth04@gmail.com", password: "4103", name: "Aman K", regNo: "008" },
    { email: "lachulakshmipriya99@gmail.com", password: "0678", name: "Lakshmi Priya", regNo: "009" },
    { email: "meenuks156@gmail.com", password: "2291", name: "Meenu K S", regNo: "010" },
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
        return res.json({ success: true, nextLevel: nextLevel > Object.keys(RIDDLE_ANSWERS).length ? '/victory' : `/level${nextLevel}/` });
    } else {
        return res.json({ success: false, message: "Incorrect key string." });
    }
});

app.get('/victory', checkAuth, async (req, res) => {
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    const name = req.signedCookies.player_name;
    const regNo = req.signedCookies.player_reg;
    
    if (currentProgress > Object.keys(RIDDLE_ANSWERS).length && name && regNo) {
        try {
            await pool.query(
                "INSERT INTO leaderboard (name, reg_no) VALUES ($1, $2) ON CONFLICT (reg_no) DO NOTHING",
                [name, regNo]
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
// Basic Auth for the admin route
const adminUsers = {};
if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
    adminUsers[process.env.ADMIN_USER] = process.env.ADMIN_PASSWORD;
}

const adminAuth = basicAuth({
    users: adminUsers,
    challenge: true,
    realm: 'AdminArea',
});

app.get('/admin/leaderboard', adminAuth, async (req, res) => {
    try {
        const result = await pool.query("SELECT name, reg_no, to_char(completion_time, 'YYYY-MM-DD HH24:MI:SS') as time FROM leaderboard ORDER BY completion_time ASC");
        let rows = result.rows.map((player, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${player.name}</td>
                <td>${player.reg_no}</td>
                <td>${player.time}</td>
            </tr>
        `).join('');

        res.send(`
            <body style='background:#0d1117; color:#c9d1d9; font-family:monospace; padding: 20px;'>
                <h1>Leaderboard</h1>
                <table border="1" style="width:100%; border-collapse: collapse;">
                    <tr style="background:#161b22;"><th>Rank</th><th>Name</th><th>Reg No</th><th>Completion Time</th></tr>
                    ${rows}
                </table>
            </body>
        `);
    } catch (err) {
        console.error("Leaderboard Error:", err);
        res.status(500).send("Database load error.");
    }
});


// --- Server ---
app.listen(PORT, () => {
    console.log(`🚀 Core Online at: http://localhost:${PORT}`);
});