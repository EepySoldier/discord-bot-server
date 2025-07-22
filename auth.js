const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    const email = req.body.email?.toLowerCase();
    const username = req.body.username;
    const usernameLower = username?.toLowerCase();
    const { password } = req.body;

    if (!email || !username || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const taken = await db.query(
            `SELECT 1 FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2`,
            [email, usernameLower]
        );

        if (taken.rows.length > 0) {
            return res.status(400).json({ error: 'Email or username already exists' });
        }

        const hashed = await bcrypt.hash(password, 10);

        const { rows } = await db.query(
            `INSERT INTO users (email, username, password_hash, role)
             VALUES ($1, $2, $3, 'user')
                 RETURNING id, email, username, role, created_at, profile_pic_url`,
            [email, username, hashed]
        );

        const user = rows[0];

        req.session.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            created_at: user.created_at,
            profile_pic_url: user.profile_pic_url,
        };

        req.session.save();

        res.status(201).json(req.session.user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const emailOrUsername = req.body.emailOrUsername?.toLowerCase();
    const { password } = req.body;

    if (!emailOrUsername || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        const { rows } = await db.query(
            `SELECT id, email, username, role, created_at, profile_pic_url, password_hash FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1`,
            [emailOrUsername]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid password' });

        req.session.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            created_at: user.created_at,
            profile_pic_url: user.profile_pic_url,
        };

        req.session.save();

        res.json(req.session.user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ message: 'Logged out' });
    });
});

// Check session
router.get('/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json(req.session.user);
});

module.exports = router;
