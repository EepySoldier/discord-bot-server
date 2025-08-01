const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadToR2 } = require('./uploadToR2');
const db = require('./db');
const fs = require('fs/promises');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, 'uploads/'),
    filename: (_, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    fileFilter: (_, file, cb) => {
        cb(null, file.mimetype === 'video/mp4');
    }
});

router.post('/video', (req, res, next) => {
    upload.single('video')(req, res, err => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { file } = req;
    const title = req.body.title || file.originalname;

    try {
        const r2Key = `videos/${file.filename}`;
        const fileUrl = await uploadToR2(file.path, r2Key, file.mimetype);
        await fs.unlink(file.path);

        await db.query(`
            INSERT INTO videos (uploader_id, access_code_id, title, file_url)
            VALUES ($1, $2, $3, $4)
        `, [user.id, 'b393c6d8-3012-4829-bf2f-47c46adcac94', title, fileUrl]);

        res.status(201).json({ success: true, fileUrl });
    } catch {
        res.status(500).json({ error: 'Upload failed' });
    }
});

module.exports = router;
