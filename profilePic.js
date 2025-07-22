// routes/profilePic.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToR2, uploadClient, DeleteObjectCommand } = require('./uploadToR2');
const db = require('./db');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `profile_${req.session.user.id}_${Date.now()}${ext}`;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'));
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // max 5MB
});

router.post('/profile-pic', upload.single('profilePic'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const userId = req.session.user.id;

        const result = await db.query('SELECT profile_pic_url FROM users WHERE id = $1', [userId]);
        const oldUrl = result.rows[0]?.profile_pic_url;

        if (oldUrl && oldUrl.includes(process.env.R2_PUBLIC_DOMAIN)) {
            const oldKey = oldUrl.replace(`${process.env.R2_PUBLIC_DOMAIN}/`, '');
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: oldKey
            });

            try {
                await uploadClient.send(deleteCommand);
            } catch (err) {
                console.warn(`⚠️ Failed to delete old pic: ${oldKey}`, err.message);
            }
        }

        // 3. Upload the new one
        const r2Key = `profile-pics/${file.filename}`;
        const fileUrl = await uploadToR2(file.path, r2Key, file.mimetype);

        // 4. Update DB with new pic URL
        await db.query('UPDATE users SET profile_pic_url = $1 WHERE id = $2', [fileUrl, userId]);

        req.session.user.profile_pic_url = fileUrl;
        req.session.save();
        // 5. Clean up local file
        fs.unlinkSync(file.path);

        res.json({ success: true, profilePicUrl: fileUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});

module.exports = router;
