const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbApi } = require('./db');
const {
    saveMessageImage,
    saveUserAvatar,
    saveStoryImage,
    avatarExists,
    messageImageExists,
    storyImageExists
} = require('./media');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const JWT_SECRET = process.env.JWT_SECRET || 'pulse-diploma-secret-change-in-production';
const userConnections = new Map();

app.set('trust proxy', 1);

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname)));

function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader) return authHeader.split(' ')[1];
    if (req.query.token) return req.query.token;
    return null;
}

function authenticateToken(req, res, next) {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ error: 'Токен отсутствует' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Неверный или просроченный токен' });
        }
        req.user = user;
        next();
    });
}

function verifyWsToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function broadcastToChatParticipants(chatId, payload) {
    const chat = dbApi.getChatById(chatId);
    if (!chat) return;

    chat.participants.forEach((userId) => {
        const ws = userConnections.get(userId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    });
}

function sendMessageToChat({ chatId, senderId, text, messageType = 'text', image }) {
    if (!dbApi.isUserInChat(senderId, chatId)) {
        return { error: 'Нет доступа к чату' };
    }

    if (messageType === 'image') {
        if (!image) return { error: 'Изображение не передано' };
        const message = dbApi.addMessage({ chatId, senderId, text: '', messageType: 'image' });
        try {
            saveMessageImage(message.id, image);
        } catch (err) {
            return { error: err.message };
        }
        const full = dbApi.getMessages(chatId).find((m) => m.id === message.id);
        const payload = { type: 'new_message', message: full };
        broadcastToChatParticipants(chatId, payload);
        notifyDelivered(senderId, chatId, message.id);
        return { message: full };
    }

    if (!text || !text.trim()) {
        return { error: 'Сообщение не может быть пустым' };
    }

    const message = dbApi.addMessage({ chatId, senderId, text });
    const full = dbApi.getMessages(chatId).find((m) => m.id === message.id);
    const payload = { type: 'new_message', message: full };
    broadcastToChatParticipants(chatId, payload);
    notifyDelivered(senderId, chatId, full.id);
    return { message: full };
}

function notifyDelivered(senderId, chatId, messageId) {
    const senderWs = userConnections.get(senderId);
    if (senderWs?.readyState === WebSocket.OPEN) {
        senderWs.send(JSON.stringify({
            type: 'message_delivered',
            chatId,
            messageId
        }));
    }
}

function notifyMessagesRead(senderId, chatId, messageIds, readerId) {
    const senderWs = userConnections.get(senderId);
    if (senderWs?.readyState === WebSocket.OPEN) {
        senderWs.send(JSON.stringify({
            type: 'messages_read',
            chatId,
            messageIds,
            readerId
        }));
    }
}

function broadcastUserStatus(userId, isOnline) {
    const user = dbApi.getUserById(userId);
    if (!user) return;

    userConnections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: isOnline ? 'user_online' : 'user_offline',
                userId,
                username: user.username,
                fullname: user.fullname
            }));
        }
    });
}

wss.on('connection', (ws) => {
    let currentUserId = null;

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);

            switch (data.type) {
                case 'authenticate': {
                    const decoded = verifyWsToken(data.token);
                    if (!decoded) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Неверный токен' }));
                        return;
                    }

                    const user = dbApi.getUserById(decoded.userId);
                    if (!user) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Пользователь не найден' }));
                        return;
                    }

                    currentUserId = user.id;
                    userConnections.set(user.id, ws);
                    dbApi.setUserOnline(user.id, true);

                    ws.send(JSON.stringify({
                        type: 'authenticated',
                        userId: user.id,
                        user: {
                            id: user.id,
                            username: user.username,
                            fullname: user.fullname
                        }
                    }));

                    broadcastUserStatus(user.id, true);
                    break;
                }

                case 'send_message': {
                    if (!currentUserId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Не авторизован' }));
                        return;
                    }

                    const result = sendMessageToChat({
                        chatId: data.chatId,
                        senderId: currentUserId,
                        text: data.text,
                        messageType: data.messageType || 'text',
                        image: data.image
                    });

                    if (result.error) {
                        ws.send(JSON.stringify({ type: 'error', message: result.error }));
                        return;
                    }

                    ws.send(JSON.stringify({ type: 'message_sent', message: result.message }));
                    break;
                }

                case 'request_messages': {
                    if (!currentUserId || !data.chatId) return;
                    if (!dbApi.isUserInChat(currentUserId, data.chatId)) return;

                    ws.send(JSON.stringify({
                        type: 'chat_messages',
                        chatId: data.chatId,
                        messages: dbApi.getMessages(data.chatId)
                    }));
                    break;
                }

                case 'mark_read': {
                    if (!currentUserId || !data.chatId) break;
                    if (!dbApi.isUserInChat(currentUserId, data.chatId)) break;

                    const bySender = dbApi.markMessagesRead(data.chatId, currentUserId);
                    Object.entries(bySender).forEach(([senderId, messageIds]) => {
                        notifyMessagesRead(senderId, data.chatId, messageIds, currentUserId);
                    });
                    break;
                }

                case 'typing': {
                    if (!currentUserId || !data.chatId) break;
                    if (!dbApi.isUserInChat(currentUserId, data.chatId)) break;

                    const typingUser = dbApi.getUserById(currentUserId);
                    const chat = dbApi.getChatById(data.chatId);
                    if (!chat || !typingUser) break;

                    chat.participants.forEach((userId) => {
                        if (userId === currentUserId) return;
                        const peerWs = userConnections.get(userId);
                        if (peerWs?.readyState === WebSocket.OPEN) {
                            peerWs.send(JSON.stringify({
                                type: 'user_typing',
                                chatId: data.chatId,
                                userId: currentUserId,
                                fullname: typingUser.fullname || typingUser.username
                            }));
                        }
                    });
                    break;
                }

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;

                default:
                    break;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    });

    ws.on('close', () => {
        if (!currentUserId) return;

        userConnections.delete(currentUserId);
        dbApi.setUserOnline(currentUserId, false);
        broadcastUserStatus(currentUserId, false);
    });
});

// --- Auth ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, fullname } = req.body;

        if (!username || !email || !password || !fullname) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'Имя пользователя — минимум 3 символа' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
        }
        if (dbApi.getUserByUsername(username)) {
            return res.status(400).json({ error: 'Имя пользователя уже занято' });
        }
        if (dbApi.getUserByEmail(email)) {
            return res.status(400).json({ error: 'Email уже используется' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = dbApi.createUser({
            username,
            email,
            password: hashedPassword,
            fullname
        });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Пользователь создан',
            token,
            user: { ...user, isOnline: true }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }

        const user = dbApi.getUserWithPasswordByUsername(username);
        if (!user) {
            return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
        }

        dbApi.setUserOnline(user.id, true);
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        const profile = dbApi.getUserById(user.id);

        res.json({ token, user: { ...profile, isOnline: true } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// --- Users ---

app.get('/api/users', authenticateToken, (req, res) => {
    res.json(dbApi.getAllUsers(req.user.userId));
});

app.get('/api/users/search', authenticateToken, (req, res) => {
    res.json(dbApi.searchUsers(req.query.q, req.user.userId));
});

app.get('/api/users/profile', authenticateToken, (req, res) => {
    const user = dbApi.getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
});

app.put('/api/users/profile', authenticateToken, (req, res) => {
    const updated = dbApi.updateUser(req.user.userId, req.body);
    if (!updated) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(updated);
});

app.put('/api/users/profile/avatar', authenticateToken, (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ error: 'Изображение не передано' });
        saveUserAvatar(req.user.userId, image);
        res.json(dbApi.getUserById(req.user.userId));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/avatars/:userId', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'avatars', `${req.params.userId}.jpg`);
    if (!avatarExists(req.params.userId)) {
        return res.status(404).end();
    }
    res.sendFile(filePath);
});

app.get('/api/media/:messageId', authenticateToken, (req, res) => {
    const { messageId } = req.params;
    if (!dbApi.canUserAccessMessage(req.user.userId, messageId) || !messageImageExists(messageId)) {
        return res.status(404).end();
    }
    res.sendFile(path.join(__dirname, 'data', 'uploads', `${messageId}.jpg`));
});

app.get('/api/stories', authenticateToken, (req, res) => {
    res.json(dbApi.getActiveStories());
});

app.post('/api/stories', authenticateToken, (req, res) => {
    try {
        const { text, image } = req.body;
        if (!text?.trim() && !image) {
            return res.status(400).json({ error: 'Добавьте текст или фото' });
        }

        const storyId = dbApi.addStory({
            userId: req.user.userId,
            text: text?.trim() || '',
            hasImage: Boolean(image)
        });

        if (image) saveStoryImage(storyId, image);

        const stories = dbApi.getActiveStories();
        const created = stories.find((s) => s.id === storyId);
        res.status(201).json(created);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/stories/:storyId/image', authenticateToken, (req, res) => {
    const story = dbApi.getStoryById(req.params.storyId);
    if (!story || !storyImageExists(req.params.storyId)) {
        return res.status(404).end();
    }
    res.sendFile(path.join(__dirname, 'data', 'stories', `${req.params.storyId}.jpg`));
});

function requireAdmin(req, res, next) {
    const user = dbApi.getUserById(req.user.userId);
    if (!user?.isAdmin) {
        return res.status(403).json({ error: 'Доступ только для администратора' });
    }
    next();
}

app.get('/api/users/:userId', authenticateToken, (req, res) => {
    const user = dbApi.getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
});

// --- Chats ---

app.get('/api/chats', authenticateToken, (req, res) => {
    res.json(dbApi.getChatsForUser(req.user.userId));
});

app.post('/api/chats', authenticateToken, (req, res) => {
    const { name, type = 'group', participants = [] } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Название чата обязательно' });
    }

    const chat = dbApi.createGroupChat({
        name: name.trim(),
        createdBy: req.user.userId,
        participantIds: participants
    });

    res.status(201).json(chat);
});

app.get('/api/chats/:chatId/members', authenticateToken, (req, res) => {
    const { chatId } = req.params;
    if (!dbApi.isUserInChat(req.user.userId, chatId)) {
        return res.status(403).json({ error: 'Нет доступа к чату' });
    }
    const members = dbApi.getChatMembers(chatId);
    if (!members) return res.status(404).json({ error: 'Чат не найден' });
    res.json(members);
});

app.post('/api/chats/:chatId/members', authenticateToken, (req, res) => {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || !userIds.length) {
        return res.status(400).json({ error: 'Выберите пользователей' });
    }

    const result = dbApi.addMembersToGroup(req.params.chatId, req.user.userId, userIds);
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    res.json(result);
});

app.post('/api/chats/private', authenticateToken, (req, res) => {
    const { targetUserId } = req.body;

    if (!targetUserId) {
        return res.status(400).json({ error: 'Укажите пользователя' });
    }
    if (targetUserId === req.user.userId) {
        return res.status(400).json({ error: 'Нельзя создать чат с самим собой' });
    }
    if (!dbApi.getUserById(targetUserId)) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const chat = dbApi.createPrivateChat({
        userA: req.user.userId,
        userB: targetUserId
    });

    res.status(201).json(chat);
});

app.get('/api/chats/:chatId/messages', authenticateToken, (req, res) => {
    const { chatId } = req.params;

    if (!dbApi.isUserInChat(req.user.userId, chatId)) {
        return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    res.json(dbApi.getMessages(chatId));
});

app.post('/api/chats/:chatId/messages', authenticateToken, (req, res) => {
    const { chatId } = req.params;
    const { text, messageType, image } = req.body;

    const result = sendMessageToChat({
        chatId,
        senderId: req.user.userId,
        text,
        messageType,
        image
    });

    if (result.error) {
        return res.status(403).json({ error: result.error });
    }

    res.status(201).json(result.message);
});

app.get('/api/admin/dashboard', authenticateToken, requireAdmin, (req, res) => {
    res.json(dbApi.getAdminDashboard());
});

app.post('/api/admin/reset', authenticateToken, requireAdmin, (req, res) => {
    try {
        dbApi.resetToDemoAndAdmin();
        dbApi.reloadFromDisk();
        res.json({ message: 'База сброшена. Остались demo и admin. Перезайдите в аккаунт.' });
    } catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({ error: 'Ошибка сброса' });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, (req, res) => {
    if (req.params.userId === req.user.userId) {
        return res.status(400).json({ error: 'Нельзя удалить себя' });
    }

    const result = dbApi.deleteUser(req.params.userId);
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Пользователь удалён' });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        ...dbApi.getStats()
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Pulse запущен: http://localhost:${PORT}`);
    console.log('Демо: demo / demo123');
    console.log('Админ: admin / admin123');
    console.log('База данных: data/store.json');
});
