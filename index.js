require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.use(cookieParser());
app.use(express.json());

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions',
        pruneSessionInterval: 60 * 60
    }),
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'your_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
}));

app.use(cors({
    origin: process.env.API_CLIENT_URL,
    credentials: true,
}));

const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);
const uploadRoutes = require('./upload');
app.use('/api/upload', uploadRoutes);
const profilePicRoutes = require('./profilePic');
app.use('/api/user', profilePicRoutes);
const videoRoutes = require('./videos');
app.use('/api/video', videoRoutes)

app.listen(PORT, () => {
    console.log(`✅ Auth backend running on port ${PORT}`);
});
