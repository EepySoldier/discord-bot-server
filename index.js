require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const db = require('./db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: 'https://discord-bot-client-production.up.railway.app', // your React app origin
    credentials: true,
}));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecretkeydfghdfgjdghfdasfgvsedrfgh',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }, // true if https
}));

// Serve static videos
app.use('/videos', express.static(path.join(__dirname, 'videos')));

app.get('/api/videos', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const sortOrder = req.query.sort === 'asc' ? 'ASC' : 'DESC';
        const result = await db.query(
            `SELECT * FROM videos ORDER BY upload_date ${sortOrder}`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});




// Discord OAuth2 config
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://discord-bot-server-production.up.railway.app/auth/discord/callback';
const DISCORD_API_BASE = 'https://discord.com/api';

// Redirect user to Discord OAuth page
app.get('/auth/discord', (req, res) => {
    const discordAuthUrl =
        `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code&scope=${encodeURIComponent('identify guilds')}`;
    res.redirect(discordAuthUrl);
});

// OAuth callback route
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("No code provided");

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post(`${DISCORD_API_BASE}/oauth2/token`, new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            scope: 'identify guilds',
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token } = tokenResponse.data;

        // Get user info
        const userResponse = await axios.get(`${DISCORD_API_BASE}/users/@me`, {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        const discordUser = userResponse.data;
        req.session.user = discordUser;

        // Save user to database if not exists
        const { rows } = await db.query('SELECT id FROM users WHERE discord_user_id = $1', [discordUser.id]);

        if (rows.length === 0) {
            await db.query(
                'INSERT INTO users (discord_user_id, username) VALUES ($1, $2)',
                [discordUser.id, discordUser.username]
            );
        }

        // Redirect back to frontend
        res.redirect('https://discord-bot-client-production.up.railway.app');
    } catch (err) {
        console.error('Discord OAuth error:', err.response?.data || err.message);
        res.status(500).send('OAuth error');
    }
});


// Endpoint to get logged-in user info
app.get('/api/user', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ message: 'Logged out' });
    });
});

app.get('/api/servers/owned', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { rows } = await db.query(
            `SELECT * FROM servers WHERE owner_id = $1`,
            [req.session.user.id],
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch owned servers' });
    }
});

app.post('/api/servers/:discordServerId/create-code', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    const discordServerId = req.params.discordServerId;

    try {
        // Generate unique code
        let accessCode;
        do {
            accessCode = crypto.randomBytes(3).toString('hex').toUpperCase();
            const { rows } = await db.query('SELECT 1 FROM servers WHERE access_code = $1', [accessCode]);
            if (rows.length === 0) break;
        } while (true);

        // Update the server access_code
        await db.query(
            'UPDATE servers SET access_code = $1 WHERE discord_server_id = $2',
            [accessCode, discordServerId]
        );

        res.json({ access_code: accessCode });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create code' });
    }
});

app.post('/api/servers/join', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { access_code } = req.body;
    if (!access_code) return res.status(400).json({ error: 'Access code required' });

    try {
        const { rows: userRows } = await db.query('SELECT id FROM users WHERE discord_user_id = $1', [req.session.user.id]);
        if (!userRows.length) return res.status(403).json({ error: 'User not found' });

        const userId = userRows[0].id;

        // Find server with this access code
        const { rows: serverRows } = await db.query('SELECT id FROM servers WHERE access_code = $1', [access_code]);
        if (serverRows.length === 0) return res.status(404).json({ error: 'Invalid server code' });

        const serverId = serverRows[0].id;

        // Check if user already joined
        const { rows: existing } = await db.query(
            'SELECT * FROM user_servers WHERE user_id = $1 AND server_id = $2',
            [userId, serverId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Already joined this server' });
        }

        // Insert join record
        await db.query(
            'INSERT INTO user_servers (user_id, server_id, is_owner) VALUES ($1, $2, false)',
            [userId, serverId]
        );

        res.json({ message: 'Successfully joined the server' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to join server' });
    }
});

app.get('/api/servers/joined', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { rows: userRows } = await db.query('SELECT id FROM users WHERE discord_user_id = $1', [req.session.user.id]);
        if (!userRows.length) return res.json([]);

        const userId = userRows[0].id;

        const { rows } = await db.query(
            `SELECT s.discord_server_id, s.name, s.access_code FROM servers s
            JOIN user_servers us ON s.id = us.server_id
            WHERE us.user_id = $1`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch joined servers' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
});
