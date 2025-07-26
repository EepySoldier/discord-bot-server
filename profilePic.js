const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToR2, uploadClient, DeleteObjectCommand } = require('./uploadToR2');
const db = require('./db');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `profile_${req.session.user.id}_${Date.now()}${ext}`;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    fileFilter: (_, file, cb) => {
        cb(null, file.mimetype.startsWith('image/'));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/profile-pic', upload.single('profilePic'), async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const { id } = user;
        const result = await db.query('SELECT profile_pic_url FROM users WHERE id = $1', [id]);
        const oldUrl = result.rows[0]?.profile_pic_url;

        if (oldUrl?.includes(process.env.R2_PUBLIC_DOMAIN)) {
            const oldKey = oldUrl.replace(`${process.env.R2_PUBLIC_DOMAIN}/`, '');
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: oldKey
            });
            try {
                await uploadClient.send(deleteCommand);
            } catch {}
        }

        const r2Key = `profile-pics/${file.filename}`;
        const fileUrl = await uploadToR2(file.path, r2Key, file.mimetype);

        await db.query('UPDATE users SET profile_pic_url = $1 WHERE id = $2', [fileUrl, id]);

        user.profile_pic_url = fileUrl;
        req.session.save();
        fs.unlinkSync(file.path);

        res.json({ success: true, profilePicUrl: fileUrl });
    } catch {
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});

module.exports = router;
