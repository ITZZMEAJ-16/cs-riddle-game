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
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.JWT_SECRET || 'secure_competition_secret_998877'));

// CONNECT TO THE ONLINE SUPABASE CLOUD DATABASE
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
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
        console.log("  Supabase Cloud Database Connected & Table Initialized.");
    } catch (err) {
        console.error("  Cloud DB Connection Failure:", err);
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

app.post('/api/start', (req, res) => {
    const { name, regNo } = req.body;
    if (!name || !regNo) return res.status(400).json({ success: false });
    res.cookie('player_level', '1', { signed: true, httpOnly: true });
    res.cookie('player_name', name, { signed: true, httpOnly: true });
    res.cookie('player_reg', regNo, { signed: true, httpOnly: true });
    return res.json({ success: true, redirect: '/level1/' });
});

app.get('/api/hidden-packet-stream', (req, res) => {
    res.json({ message: "Monitoring...", hidden_flag: "packet_captured" });
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

// READ DIRECTLY FROM THE WORLDWIDE CLOUD MATRIX
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
                <h2 style="color:#58a6ff; border-bottom:1px solid #30363d; padding-bottom:10px;">  LIVE COMPETITION LEADERBOARD (CLOUD PERSISTENT)</h2>
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

app.use(checkProgress);
app.use(express.static(path.join(__dirname, 'public')));

// SAVE WINNER DATA TO THE CLOUD DATABASE
app.get('/victory', async (req, res) => {
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
            console.log(`  Saved ${name} securely to Supabase Cloud.`);
        } catch (err) {
            console.error(err);
        }
                 
        res.send("<body style='background:#0d1117; color:#56d364; font-family:monospace; text-align:center; padding:100px;'><h1>  CONGRATULATIONS CONQUEROR!</h1><p style='color:#c9d1d9;'>Your run has been permanently logged in the database cloud.</p></body>");
    } else {
        res.redirect('/level1/');
    }
});

app.listen(PORT, () => {
    console.log(`  Core Online at: http://localhost:${PORT}`);
});