const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const avatarsDir = path.join(dataDir, 'avatars');
const storiesDir = path.join(dataDir, 'stories');

[dataDir, uploadsDir, avatarsDir, storiesDir].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const MAX_IMAGE_BYTES = 900000;

function saveBase64Image(base64, targetPath) {
    if (!base64 || typeof base64 !== 'string') {
        throw new Error('Нет данных изображения');
    }

    const match = base64.match(/^data:image\/(\w+);base64,(.+)$/);
    const raw = match ? match[2] : base64;
    const buffer = Buffer.from(raw, 'base64');

    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('Изображение слишком большое (макс. ~900 КБ)');
    }

    fs.writeFileSync(targetPath, buffer);
    return targetPath;
}

function saveMessageImage(messageId, base64) {
    const filePath = path.join(uploadsDir, `${messageId}.jpg`);
    saveBase64Image(base64, filePath);
    return filePath;
}

function saveUserAvatar(userId, base64) {
    const filePath = path.join(avatarsDir, `${userId}.jpg`);
    saveBase64Image(base64, filePath);
    return filePath;
}

function avatarExists(userId) {
    return fs.existsSync(path.join(avatarsDir, `${userId}.jpg`));
}

function messageImageExists(messageId) {
    return fs.existsSync(path.join(uploadsDir, `${messageId}.jpg`));
}

function saveStoryImage(storyId, base64) {
    const filePath = path.join(storiesDir, `${storyId}.jpg`);
    saveBase64Image(base64, filePath);
    return filePath;
}

function storyImageExists(storyId) {
    return fs.existsSync(path.join(storiesDir, `${storyId}.jpg`));
}

module.exports = {
    saveMessageImage,
    saveUserAvatar,
    saveStoryImage,
    avatarExists,
    messageImageExists,
    storyImageExists,
    uploadsDir,
    avatarsDir,
    storiesDir
};
