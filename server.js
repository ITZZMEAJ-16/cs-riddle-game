import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser(process.env.JWT_SECRET || 'fallback_secret_key_54321'));

// 🔑 THE SECURE VERIFICATION KEYS
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

// 🛡️ PROGRESS GUARD
const checkProgress = (req, res, next) => {
    const requestedPath = req.path;
    const match = requestedPath.match(/\/level(\d+)/);
    
    if (match) {
        const requestedLevel = parseInt(match[1], 10);
        const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
        
        if (requestedLevel > currentProgress) {
            return res.status(403).send("<h1>403 Access Denied</h1><p>Solve the previous levels first.</p>");
        }
    }
    next();
};

app.post('/api/start', (req, res) => {
    res.cookie('player_level', '1', { signed: true, httpOnly: true });
    return res.json({ success: true, redirect: '/level1/' });
});

app.get('/api/hidden-packet-stream', (req, res) => {
    res.json({ message: "Keep monitoring network metrics...", hidden_flag: "packet_captured" });
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
        return res.json({ success: false, message: "Incorrect answer. Try again!" });
    }
});

app.use(checkProgress);
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/victory', (req, res) => {
    const currentProgress = req.signedCookies.player_level ? parseInt(req.signedCookies.player_level, 10) : 1;
    if (currentProgress >= 9) {
        res.send("<body style='background:#0d1117; color:#58a6ff; font-family:monospace; text-align:center; padding:100px;'><h1>🎉 ULTIMATE ENIGMA CONQUERED!</h1><p>You successfully scaled all 8 structural engineering layers.</p></body>");
    } else {
        res.redirect('/level1/');
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Enigma Core Active at: http://localhost:${PORT}`);
});