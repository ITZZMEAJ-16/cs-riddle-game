require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

// ==========================================
// 🛰️ API ENDPOINTS
// ==========================================

// Open Access Gateway: Instantly passes any user through
app.post('/api/start', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    // Return the clean directory path for Level 1
    return res.json({ 
        success: true, 
        message: "Access granted. Welcome to the system.",
        redirect: '/level1/' 
    });
});

// Initialize active listening hooks globally across IPv4 space interfaces
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Security Engine online and listening on global IPv4 space port ${PORT}`);
});