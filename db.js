const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { avatarExists, messageImageExists, storyImageExists } = require('./media');

const dataDir = path.join(__dirname, 'data');
const storePath = path.join(dataDir, 'store.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const emptyStore = () => ({
    users: [],
    chats: [],
    participants: [],
    messages: [],
    stories: []
});

function ensureStoreShape() {
    if (!store.stories) store.stories = [];
    store.messages.forEach((m) => {
        if (!m.message_type) m.message_type = 'text';
        if (!m.read_by) m.read_by = [];
    });
}

let store = emptyStore();

function loadStore() {
    try {
        if (fs.existsSync(storePath)) {
            store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            ensureStoreShape();
        } else {
            store = emptyStore();
            saveStore();
        }
    } catch (error) {
        console.error('Ошибка чтения БД, создаём новую:', error.message);
        store = emptyStore();
        saveStore();
    }
}

function saveStore() {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function reloadStore() {
    loadStore();
    ensureStoreShape();
}

function generateId() {
    return `${Date.now()}${Math.random().toString(36).slice(2, 11)}`;
}

function mapUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        fullname: row.fullname,
        phone: row.phone || '',
        bio: row.bio || '',
        isOnline: Boolean(row.is_online),
        lastSeen: row.last_seen,
        createdAt: row.created_at,
        avatarUrl: avatarExists(row.id) ? `/api/avatars/${row.id}` : null,
        role: row.role || 'user',
        isAdmin: (row.role || 'user') === 'admin'
    };
}

function formatMessage(row) {
    const user = store.users.find((u) => u.id === row.sender_id);
    const isImage = row.message_type === 'image';
    return {
        id: row.id,
        text: row.text || '',
        chatId: row.chat_id,
        senderId: row.sender_id,
        timestamp: row.timestamp,
        messageType: row.message_type || 'text',
        imageUrl: isImage && messageImageExists(row.id) ? `/api/media/${row.id}` : null,
        readBy: row.read_by || [],
        sender: user ? mapSender(user) : (row.sender_id === 'system' || row.sender_id === 'support' ? {
            id: row.sender_id,
            username: row.sender_id,
            fullname: row.sender_id === 'support' ? 'Поддержка' : 'Система'
        } : null)
    };
}

function mapSender(user) {
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        fullname: user.fullname,
        avatarUrl: avatarExists(user.id) ? `/api/avatars/${user.id}` : null
    };
}

function getChatMemberUsers(chatId) {
    return getParticipants(chatId)
        .map((id) => {
            const row = store.users.find((u) => u.id === id);
            return row ? mapUser(row) : null;
        })
        .filter(Boolean);
}

function getParticipants(chatId) {
    return store.participants
        .filter((p) => p.chat_id === chatId)
        .map((p) => p.user_id);
}

function addParticipant(chatId, userId) {
    const exists = store.participants.some(
        (p) => p.chat_id === chatId && p.user_id === userId
    );
    if (!exists) {
        store.participants.push({ chat_id: chatId, user_id: userId });
        saveStore();
    }
}

function getLastMessage(chatId) {
    const msgs = store.messages
        .filter((m) => m.chat_id === chatId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const row = msgs[0];
    if (!row) return null;

    const preview = row.message_type === 'image' ? '📷 Фото' : (row.text || '');
    const user = store.users.find((u) => u.id === row.sender_id);
    return {
        text: preview,
        timestamp: row.timestamp,
        senderId: row.sender_id,
        sender: user ? mapSender(user) : (row.sender_id === 'support' ? {
            id: 'support',
            username: 'support',
            fullname: 'Поддержка'
        } : row.sender_id === 'system' ? {
            id: 'system',
            username: 'system',
            fullname: 'Система'
        } : null)
    };
}

function seedDatabase() {
    let demo = store.users.find((u) => u.username === 'demo');
    let demoId = demo?.id;

    if (!demo) {
        demoId = 'demo-user-id';
        demo = {
            id: demoId,
            username: 'demo',
            email: 'demo@example.com',
            password: bcrypt.hashSync('demo123', 10),
            fullname: 'Демо Пользователь',
            phone: '+7 (999) 123-45-67',
            bio: 'Демонстрационный аккаунт для дипломного проекта',
            is_online: 0,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            role: 'user'
        };
        store.users.push(demo);
    }

    let admin = store.users.find((u) => u.username === 'admin');
    if (!admin) {
        store.users.push({
            id: 'admin-user-id',
            username: 'admin',
            email: 'admin@pulse.local',
            password: bcrypt.hashSync('admin123', 10),
            fullname: 'Администратор',
            phone: '',
            bio: 'Панель управления системой',
            is_online: 0,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            role: 'admin'
        });
        addParticipant('general-chat', 'admin-user-id');
    } else if (!admin.role) {
        admin.role = 'admin';
    }

    store.users.forEach((u) => {
        if (!u.role) u.role = 'user';
    });

    let general = store.chats.find((c) => c.id === 'general-chat');
    if (!general) {
        store.chats.push({
            id: 'general-chat',
            name: 'Общий чат',
            type: 'group',
            created_by: 'system',
            created_at: new Date().toISOString()
        });
        store.messages.push({
            id: generateId(),
            chat_id: 'general-chat',
            sender_id: 'system',
            text: 'Добро пожаловать в Pulse! Это общий чат для всех пользователей.',
            timestamp: new Date().toISOString(),
            message_type: 'text',
            read_by: []
        });
    }

    store.users.forEach((u) => addParticipant('general-chat', u.id));
    saveStore();
}

loadStore();
seedDatabase();

function ensureAdminAccount() {
    let admin = store.users.find((u) => u.username === 'admin');
    if (!admin) {
        store.users.push({
            id: 'admin-user-id',
            username: 'admin',
            email: 'admin@pulse.local',
            password: bcrypt.hashSync('admin123', 10),
            fullname: 'Администратор',
            phone: '',
            bio: 'Панель управления системой',
            is_online: 0,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            role: 'admin'
        });
        addParticipant('general-chat', 'admin-user-id');
        dbApi.ensureSupportChat('admin-user-id');
        saveStore();
        console.log('Создан администратор: admin / admin123');
    } else if (admin.role !== 'admin') {
        admin.role = 'admin';
        saveStore();
    }
}

ensureAdminAccount();

const dbApi = {
    generateId,

    getUserById(id) {
        return mapUser(store.users.find((u) => u.id === id));
    },

    getUserByUsername(username) {
        return store.users.find((u) => u.username === username) || null;
    },

    getUserByEmail(email) {
        return store.users.find((u) => u.email === email) || null;
    },

    getUserWithPasswordByUsername(username) {
        return store.users.find((u) => u.username === username) || null;
    },

    getAllUsers(excludeUserId) {
        return store.users
            .filter((u) => u.id !== excludeUserId)
            .sort((a, b) => (a.fullname || '').localeCompare(b.fullname || '', 'ru'))
            .map(mapUser);
    },

    searchUsers(query, excludeUserId) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return dbApi.getAllUsers(excludeUserId);

        return store.users
            .filter((u) => u.id !== excludeUserId)
            .filter((u) =>
                u.username.toLowerCase().includes(q) ||
                u.fullname.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q)
            )
            .sort((a, b) => (a.fullname || '').localeCompare(b.fullname || '', 'ru'))
            .map(mapUser);
    },

    createUser({ username, email, password, fullname }) {
        const id = generateId();
        const now = new Date().toISOString();
        store.users.push({
            id,
            username,
            email,
            password,
            fullname,
            phone: '',
            bio: '',
            is_online: 0,
            last_seen: now,
            created_at: now,
            role: 'user'
        });
        addParticipant('general-chat', id);
        dbApi.ensureSupportChat(id);
        saveStore();
        return dbApi.getUserById(id);
    },

    updateUser(id, { fullname, bio, phone }) {
        const user = store.users.find((u) => u.id === id);
        if (!user) return null;
        if (fullname !== undefined) user.fullname = fullname;
        if (bio !== undefined) user.bio = bio;
        if (phone !== undefined) user.phone = phone;
        saveStore();
        return dbApi.getUserById(id);
    },

    purgeExpiredStories() {
        const now = Date.now();
        const before = store.stories.length;
        store.stories = store.stories.filter((s) => new Date(s.expires_at).getTime() > now);
        if (store.stories.length !== before) saveStore();
    },

    getActiveStories() {
        dbApi.purgeExpiredStories();
        return store.stories
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map((story) => {
                const user = store.users.find((u) => u.id === story.user_id);
                return {
                    id: story.id,
                    userId: story.user_id,
                    text: story.text || '',
                    hasImage: Boolean(story.has_image),
                    imageUrl: story.has_image && storyImageExists(story.id)
                        ? `/api/stories/${story.id}/image`
                        : null,
                    createdAt: story.created_at,
                    expiresAt: story.expires_at,
                    author: user ? {
                        id: user.id,
                        username: user.username,
                        fullname: user.fullname,
                        avatarUrl: avatarExists(user.id) ? `/api/avatars/${user.id}` : null
                    } : null
                };
            });
    },

    addStory({ userId, text, hasImage }) {
        dbApi.purgeExpiredStories();
        const id = generateId();
        const created = new Date();
        const expires = new Date(created.getTime() + 24 * 60 * 60 * 1000);
        store.stories.push({
            id,
            user_id: userId,
            text: text || '',
            has_image: Boolean(hasImage),
            created_at: created.toISOString(),
            expires_at: expires.toISOString()
        });
        saveStore();
        return id;
    },

    getStoryById(storyId) {
        return store.stories.find((s) => s.id === storyId) || null;
    },

    markMessagesRead(chatId, readerId) {
        const bySender = {};
        let changed = false;

        store.messages
            .filter((m) => m.chat_id === chatId && m.sender_id !== readerId)
            .forEach((m) => {
                if (!m.read_by) m.read_by = [];
                if (!m.read_by.includes(readerId)) {
                    m.read_by.push(readerId);
                    if (!bySender[m.sender_id]) bySender[m.sender_id] = [];
                    bySender[m.sender_id].push(m.id);
                    changed = true;
                }
            });

        if (changed) saveStore();
        return bySender;
    },

    setUserOnline(id, isOnline) {
        const user = store.users.find((u) => u.id === id);
        if (!user) return;
        user.is_online = isOnline ? 1 : 0;
        user.last_seen = new Date().toISOString();
        saveStore();
    },

    getChatsForUser(userId) {
        dbApi.ensureSupportChat(userId);

        const chatIds = new Set(
            store.participants
                .filter((p) => p.user_id === userId)
                .map((p) => p.chat_id)
        );

        return [...chatIds]
            .map((chatId) => {
                const chat = store.chats.find((c) => c.id === chatId);
                if (!chat) return null;
                const memberUsers = getChatMemberUsers(chat.id);
                const peerUser = chat.type === 'private'
                    ? memberUsers.find((u) => u.id !== userId) || null
                    : null;
                return {
                    id: chat.id,
                    name: chat.type === 'private' && peerUser
                        ? (peerUser.fullname || peerUser.username)
                        : chat.name,
                    type: chat.type,
                    participants: getParticipants(chat.id),
                    memberUsers,
                    peerUser,
                    createdBy: chat.created_by,
                    createdAt: chat.created_at,
                    lastMessage: getLastMessage(chat.id)
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const ta = a.lastMessage?.timestamp || a.createdAt;
                const tb = b.lastMessage?.timestamp || b.createdAt;
                return new Date(tb) - new Date(ta);
            });
    },

    ensureSupportChat(userId) {
        const supportId = `support-${userId}`;
        if (store.chats.find((c) => c.id === supportId)) return supportId;

        store.chats.push({
            id: supportId,
            name: 'Техподдержка Pulse',
            type: 'private',
            created_by: 'system',
            created_at: new Date().toISOString()
        });
        addParticipant(supportId, userId);
        store.messages.push({
            id: generateId(),
            chat_id: supportId,
            sender_id: 'support',
            text: 'Здравствуйте! Чем могу помочь?',
            timestamp: new Date().toISOString(),
            message_type: 'text',
            read_by: []
        });
        saveStore();
        return supportId;
    },

    getChatById(chatId) {
        const chat = store.chats.find((c) => c.id === chatId);
        if (!chat) return null;
        const memberUsers = getChatMemberUsers(chatId);
        return {
            id: chat.id,
            name: chat.name,
            type: chat.type,
            participants: getParticipants(chatId),
            memberUsers,
            createdBy: chat.created_by,
            createdAt: chat.created_at,
            lastMessage: getLastMessage(chatId)
        };
    },

    getChatMembers(chatId) {
        if (!store.chats.find((c) => c.id === chatId)) return null;
        return getChatMemberUsers(chatId);
    },

    isUserInChat(userId, chatId) {
        return store.participants.some(
            (p) => p.chat_id === chatId && p.user_id === userId
        );
    },

    createGroupChat({ name, createdBy, participantIds = [] }) {
        const id = generateId();
        const now = new Date().toISOString();
        store.chats.push({
            id,
            name,
            type: 'group',
            created_by: createdBy,
            created_at: now
        });
        new Set([createdBy, ...participantIds.filter(Boolean)]).forEach((uid) => addParticipant(id, uid));
        saveStore();
        return dbApi.getChatById(id);
    },

    addMembersToGroup(chatId, requesterId, userIds = []) {
        const chat = store.chats.find((c) => c.id === chatId);
        if (!chat || chat.type !== 'group') {
            return { error: 'Это не групповой чат' };
        }
        if (!dbApi.isUserInChat(requesterId, chatId)) {
            return { error: 'Нет доступа к группе' };
        }

        const added = [];
        userIds.forEach((uid) => {
            if (!uid || uid === requesterId) return;
            if (!store.users.find((u) => u.id === uid)) return;
            if (!dbApi.isUserInChat(uid, chatId)) {
                addParticipant(chatId, uid);
                added.push(uid);
            }
        });

        if (added.length) saveStore();
        return { chat: dbApi.getChatById(chatId), added };
    },

    deleteUser(userId) {
        if (userId === 'demo-user-id' || userId === 'admin-user-id') {
            return { error: 'Нельзя удалить системного пользователя' };
        }

        const exists = store.users.find((u) => u.id === userId);
        if (!exists) return { error: 'Пользователь не найден' };

        store.users = store.users.filter((u) => u.id !== userId);
        store.participants = store.participants.filter((p) => p.user_id !== userId);
        store.stories = store.stories.filter((s) => s.user_id !== userId);
        store.messages = store.messages.filter((m) => m.sender_id !== userId);
        saveStore();
        return { ok: true };
    },

    getAdminDashboard() {
        dbApi.purgeExpiredStories();
        const online = store.users.filter((u) => u.is_online).length;
        const stats = dbApi.getStats();
        return {
            ...stats,
            onlineUsers: online,
            userList: store.users.map((u) => ({
                ...mapUser(u),
                email: u.email,
                createdAt: u.created_at
            }))
        };
    },

    findPrivateChat(userA, userB) {
        const chat = store.chats.find((c) => {
            if (c.type !== 'private' || c.id.startsWith('support-')) return false;
            const parts = getParticipants(c.id);
            return parts.length === 2 && parts.includes(userA) && parts.includes(userB);
        });
        return chat ? dbApi.getChatById(chat.id) : null;
    },

    createPrivateChat({ userA, userB }) {
        const existing = dbApi.findPrivateChat(userA, userB);
        if (existing) return existing;

        const userBInfo = dbApi.getUserById(userB);
        const id = generateId();
        const now = new Date().toISOString();
        const name = userBInfo?.fullname || userBInfo?.username || 'Личный чат';

        store.chats.push({
            id,
            name,
            type: 'private',
            created_by: userA,
            created_at: now
        });
        addParticipant(id, userA);
        addParticipant(id, userB);
        saveStore();
        return dbApi.getChatById(id);
    },

    canUserAccessMessage(userId, messageId) {
        const row = store.messages.find((m) => m.id === messageId);
        if (!row) return false;
        return dbApi.isUserInChat(userId, row.chat_id);
    },

    getMessages(chatId, limit = 200) {
        return store.messages
            .filter((m) => m.chat_id === chatId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .slice(-limit)
            .map(formatMessage);
    },

    addMessage({ chatId, senderId, text, messageType = 'text' }) {
        const id = generateId();
        const timestamp = new Date().toISOString();
        const trimmed = (text || '').trim();
        const isImage = messageType === 'image';

        store.messages.push({
            id,
            chat_id: chatId,
            sender_id: senderId,
            text: isImage ? '📷 Фото' : trimmed,
            timestamp,
            message_type: isImage ? 'image' : 'text',
            read_by: []
        });
        saveStore();
        return formatMessage(store.messages.find((m) => m.id === id));
    },

    getStats() {
        dbApi.purgeExpiredStories();
        return {
            users: store.users.length,
            chats: store.chats.length,
            messages: store.messages.length,
            stories: store.stories.length
        };
    },

    resetToDemoAndAdmin() {
        const now = new Date().toISOString();
        store.users = [
            {
                id: 'demo-user-id',
                username: 'demo',
                email: 'demo@example.com',
                password: bcrypt.hashSync('demo123', 10),
                fullname: 'Демо Пользователь',
                phone: '+7 (999) 123-45-67',
                bio: 'Демонстрационный аккаунт',
                is_online: 0,
                last_seen: now,
                created_at: now,
                role: 'user'
            },
            {
                id: 'admin-user-id',
                username: 'admin',
                email: 'admin@pulse.local',
                password: bcrypt.hashSync('admin123', 10),
                fullname: 'Администратор',
                phone: '',
                bio: 'Панель управления',
                is_online: 0,
                last_seen: now,
                created_at: now,
                role: 'admin'
            }
        ];
        store.chats = [
            { id: 'general-chat', name: 'Общий чат', type: 'group', created_by: 'system', created_at: now },
            { id: 'support-demo-user-id', name: 'Техподдержка Pulse', type: 'private', created_by: 'system', created_at: now },
            { id: 'support-admin-user-id', name: 'Техподдержка Pulse', type: 'private', created_by: 'system', created_at: now }
        ];
        store.participants = [
            { chat_id: 'general-chat', user_id: 'demo-user-id' },
            { chat_id: 'general-chat', user_id: 'admin-user-id' },
            { chat_id: 'support-demo-user-id', user_id: 'demo-user-id' },
            { chat_id: 'support-admin-user-id', user_id: 'admin-user-id' }
        ];
        store.messages = [
            {
                id: generateId(),
                chat_id: 'general-chat',
                sender_id: 'system',
                text: 'Добро пожаловать в Pulse!',
                timestamp: now,
                message_type: 'text',
                read_by: []
            },
            {
                id: generateId(),
                chat_id: 'support-demo-user-id',
                sender_id: 'support',
                text: 'Здравствуйте! Чем могу помочь?',
                timestamp: now,
                message_type: 'text',
                read_by: []
            },
            {
                id: generateId(),
                chat_id: 'support-admin-user-id',
                sender_id: 'support',
                text: 'Здравствуйте! Чем могу помочь?',
                timestamp: now,
                message_type: 'text',
                read_by: []
            }
        ];
        store.stories = [];
        saveStore();
        reloadStore();
        return true;
    },

    reloadFromDisk() {
        reloadStore();
    }
};

module.exports = { dbApi, reloadStore };
