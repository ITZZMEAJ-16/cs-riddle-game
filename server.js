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
let gameStarted = false; // Global flag to control game state
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
        // Drop and recreate the table to ensure the new schema is applied.
        // This is safe before the competition starts.
        await pool.query(`DROP TABLE IF EXISTS leaderboard;`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                name TEXT,
                reg_no TEXT UNIQUE NOT NULL,
                level_reached INT DEFAULT 1,
                last_update_time TIMESTAMPTZ DEFAULT NOW()
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
    { email: "uthraja2006@gmail.com", password: "0574", name: "Uthraja J", regNo: "011" },
    { email: "irfanhabeebk2005@gmail.com", password: "6621", name: "Irfan Habeeb K", regNo: "012" },
    { email: "harikrishnan0709@gmail.com", password: "9091", name: "Harikrishnan S", regNo: "013" }
];

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = participants.find(p => p.email === email && p.password === password);

    if (user) {
        const userId = participants.indexOf(user); 
        const deadline = Date.now() + 60 * 60 * 1000; // 1 hour from now
        
        try {
            // Add user to leaderboard on login, or update their login time if they already exist.
            await pool.query(
                `INSERT INTO leaderboard (name, reg_no, level_reached, last_update_time) VALUES ($1, $2, 1, NOW())
                 ON CONFLICT (reg_no) DO UPDATE SET last_update_time = NOW(), level_reached = GREATEST(leaderboard.level_reached, 1)`,
                [user.name, user.regNo]
            );
        } catch (err) {
            console.error("Error inserting user into leaderboard on login:", err);
        }
        res.cookie('user_id', userId, COOKIE_OPTIONS);
        res.cookie('player_level', '1', COOKIE_OPTIONS);
        res.cookie('player_name', user.name, COOKIE_OPTIONS);
        res.cookie('player_reg', user.regNo, COOKIE_OPTIONS);
        res.cookie('deadline', deadline.toString(), COOKIE_OPTIONS);
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

app.get('/api/hidden-packet-stream', checkAuth, (req, res) => { // This seems to be a level-specific endpoint
    res.json({ message: "Monitoring...", hidden_flag: "packet_captured" });
});

app.post('/api/submit-answer', checkAuth, async (req, res) => {
    const deadline = req.signedCookies.deadline ? parseInt(req.signedCookies.deadline, 10) : null;

    if (deadline && Date.now() > deadline) {
        return res.status(403).json({ success: false, message: "Time's up! You have exceeded the 1-hour limit." });
    }

    const { answer } = req.body;
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    const regNo = req.signedCookies.player_reg;
    const correctAnswer = RIDDLE_ANSWERS[currentProgress];
    
    if (answer && answer.trim().toLowerCase() === correctAnswer.toLowerCase()) {
        const nextLevel = currentProgress + 1;
        res.cookie('player_level', nextLevel.toString(), COOKIE_OPTIONS);

        // Update leaderboard with new progress
        if (regNo) {
            try {
                await pool.query(
                    "UPDATE leaderboard SET level_reached = $1, last_update_time = NOW() WHERE reg_no = $2",
                    [nextLevel, regNo]
                );
            } catch (err) {
                console.error("Error updating leaderboard:", err);
            }
        }
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
            // Final update to ensure completion is logged, though submit-answer should have handled it.
            await pool.query(
                "UPDATE leaderboard SET level_reached = $1, last_update_time = NOW() WHERE reg_no = $2",
                [currentProgress, regNo]
            );
            console.log(`🏆 ${name} has completed all levels!`);
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

app.post('/admin/start-game', adminAuth, (req, res) => {
    if (!gameStarted) {
        gameStarted = true;
        console.log('🏁 The game has been started by an admin.');
        res.send('Game started successfully!');
    } else {
        res.send('The game has already started.');
    }
});

app.get('/admin/leaderboard', adminAuth, async (req, res) => {
    try {
        const result = await pool.query("SELECT name, reg_no, level_reached, to_char(last_update_time, 'YYYY-MM-DD HH24:MI:SS') as time FROM leaderboard ORDER BY level_reached DESC, last_update_time ASC");
        let rows = result.rows.map((player, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${player.name}</td>
                <td>${player.reg_no}</td>
                <td>${player.level_reached > Object.keys(RIDDLE_ANSWERS).length ? 'Finished' : player.level_reached -1}</td>
                <td>${player.time}</td>
            </tr>
        `).join('');

        res.send(`
            <body style='background:#0d1117; color:#c9d1d9; font-family:monospace; padding: 20px;'>
                <h1>Leaderboard</h1>
                <form action="/admin/start-game" method="POST" style="margin-bottom: 20px;">
                    <button type="submit" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Start Game</button>
                </form>
                <table border="1" style="width:100%; border-collapse: collapse;">
                    <tr style="background:#161b22;"><th>Rank</th><th>Name</th><th>Reg No</th><th>Level Cleared</th><th>Last Update</th></tr>
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