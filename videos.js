const express = require('express');
const db = require('./db');

const router = express.Router();

router.get('/fetchAll', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Get all access codes the user belongs to
        const { rows: codes } = await db.query(`
            SELECT access_code_id
            FROM access_code_members
            WHERE user_id = $1
        `, [req.session.user.id]);

        const codeIds = codes.map(row => row.access_code_id);
        if (codeIds.length === 0) return res.json([]);

        // Get videos only for matching access codes
        const { rows: videos } = await db.query(`
            SELECT v.id, v.title, v.file_url, v.uploaded_at, u.username AS uploader
            FROM videos v
            JOIN users u ON u.id = v.uploader_id
            WHERE v.access_code_id = ANY($1::uuid[])
            ORDER BY v.uploaded_at DESC
        `, [codeIds]);

        res.json(videos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

router.get('/fetchByUser/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const { rows: videos } = await db.query(`
            SELECT v.id, v.title, v.file_url, v.uploaded_at, u.username AS uploader
            FROM videos v
            JOIN users u ON u.id = v.uploader_id
            WHERE v.uploader_id = $1
            ORDER BY v.uploaded_at DESC
        `, [userId]);

        res.json(videos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user videos' });
    }
});

module.exports = router;