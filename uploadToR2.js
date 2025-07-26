const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const uploadClient = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
});

function getContentType(filename, mimetype = '') {
    const ext = path.extname(filename).toLowerCase();

    switch (true) {
        case ext === '.mp4':
        case mimetype.startsWith('video/'):
            return 'video/mp4';
        case ['.jpg', '.jpeg'].includes(ext):
        case mimetype === 'image/jpeg':
            return 'image/jpeg';
        case ext === '.png':
        case mimetype === 'image/png':
            return 'image/png';
        case ext === '.gif':
        case mimetype === 'image/gif':
            return 'image/gif';
        default:
            return mimetype || 'application/octet-stream';
    }
}

async function uploadToR2(localPath, r2Key, mimetype) {
    const fileStream = fs.createReadStream(localPath);
    const contentType = getContentType(r2Key, mimetype);

    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileStream,
        ContentType: contentType
    });

    await uploadClient.send(command);
    return `${process.env.R2_PUBLIC_DOMAIN}/${r2Key}`;
}

module.exports = {
    uploadToR2,
    uploadClient,
    DeleteObjectCommand
};
