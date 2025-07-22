const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);

        const { rows } = await db.query(
            `INSERT INTO users (email, username, password_hash, role)
             VALUES ($1, $2, $3, 'user')
                 RETURNING id, email, username, role, created_at`,
            [email, username, hashed]
        );

        req.session.user = {
            id: rows[0].id,
            email: rows[0].email,
            username: rows[0].username,
            role: rows[0].role,
        };

        res.status(201).json(req.session.user);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email or username already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        const { rows } = await db.query(
            `SELECT * FROM users WHERE email = $1 OR username = $1`,
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
        };
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
