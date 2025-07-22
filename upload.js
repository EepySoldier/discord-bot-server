const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadToR2 } = require('./uploadToR2'); // your R2 uploader
const db = require('./db');

const router = express.Router();

// Configure multer to use disk storage temporarily
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
        cb(null, name);
    }
});

const upload = multer({ storage });

router.post('/video', upload.single('video'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    const file = req.file;
    const title = req.body.title || file.originalname;

    try {
        const r2Key = `videos/${file.filename}`;
        const fileUrl = await uploadToR2(file.path, r2Key, file.mimetype);

        await db.query(`
            INSERT INTO videos (uploader_id, access_code_id, title, file_url)
            VALUES ($1, NULL, $2, $3)
        `, [req.session.user.id, title, fileUrl]);

        res.status(201).json({ success: true, fileUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

module.exports = router;
