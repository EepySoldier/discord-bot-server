const express = require('express');
const db = require('./db');

const router = express.Router();

router.get('/fetchAll', async (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { rows: codes } = await db.query(`
            SELECT access_code_id
            FROM access_code_members
            WHERE user_id = $1
        `, [userId]);

        const codeIds = codes.map(r => r.access_code_id);
        if (codeIds.length === 0) return res.json([]);

        const { rows: videos } = await db.query(`
            SELECT
                v.id,
                v.title,
                v.file_url,
                v.uploaded_at,
                u.username AS uploader,
                (SELECT COUNT(*) FROM video_views WHERE video_id = v.id)        AS views,
                (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id)        AS likes,
                EXISTS (
                    SELECT 1 FROM video_likes
                    WHERE video_id = v.id AND user_id = $2
                )                                                              AS liked_by_me
            FROM videos v
                     JOIN users u ON u.id = v.uploader_id
            WHERE v.access_code_id = ANY($1::uuid[])
            ORDER BY v.uploaded_at DESC
        `, [codeIds, userId]);

        res.json(videos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

router.get('/fetchByUser/:userId', async (req, res) => {
    const { userId } = req.params;
    const viewerId = req.session.user?.id;
    if (!viewerId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { rows: videos } = await db.query(`
            SELECT
                v.id,
                v.title,
                v.file_url,
                v.uploaded_at,
                u.username AS uploader,
                (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS views,
                (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS likes,
                EXISTS (
                    SELECT 1 FROM video_likes
                    WHERE video_id = v.id AND user_id = $1
                ) AS liked_by_me
            FROM videos v
                     JOIN users u ON u.id = v.uploader_id
            WHERE v.uploader_id = $2
            ORDER BY v.uploaded_at DESC
        `, [viewerId, userId]);

        res.json(videos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user videos' });
    }
});

router.post('/:videoId/view', async (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { videoId } = req.params;

    try {
        await db.query(`
            INSERT INTO video_views (user_id, video_id)
            VALUES ($1, $2)
                ON CONFLICT (user_id, video_id) DO NOTHING
        `, [userId, videoId]);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record view' });
    }
});

router.post('/:videoId/like', async (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { videoId } = req.params;

    try {
        const { rowCount } = await db.query(`
            DELETE FROM video_likes
            WHERE user_id = $1 AND video_id = $2
        `, [userId, videoId]);

        if (rowCount === 0) {
            await db.query(`
                INSERT INTO video_likes (user_id, video_id)
                VALUES ($1, $2)
            `, [userId, videoId]);
            return res.json({ liked: true });
        }

        res.json({ liked: false });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

router.get('/liked', async (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { rows } = await db.query(`
      SELECT
        v.id, v.title, v.file_url, v.uploaded_at,
        u.username AS uploader,
        (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS views,
        (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS likes,
        TRUE AS liked_by_me
      FROM videos v
      JOIN users u ON u.id = v.uploader_id
      JOIN video_likes l ON l.video_id = v.id
      WHERE l.user_id = $1
      ORDER BY l.liked_at DESC
    `, [userId]);

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch liked clips' });
    }
});

module.exports = router;
