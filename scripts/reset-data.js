/**
 * Оставляет только demo и admin, очищает остальные данные.
 * ВАЖНО: сначала остановите сервер (Ctrl+C в терминале с npm start)!
 * Или запустите файл СБРОС-И-ЗАПУСК.bat в корне проекта.
 */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
const storePath = path.join(dataDir, 'store.json');

function removeDirFiles(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((file) => {
        fs.unlinkSync(path.join(dir, file));
    });
}

function reset() {
    const demo = {
        id: 'demo-user-id',
        username: 'demo',
        email: 'demo@example.com',
        password: bcrypt.hashSync('demo123', 10),
        fullname: 'Демо Пользователь',
        phone: '+7 (999) 123-45-67',
        bio: 'Демонстрационный аккаунт',
        is_online: 0,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        role: 'user'
    };

    const admin = {
        id: 'admin-user-id',
        username: 'admin',
        email: 'admin@pulse.local',
        password: bcrypt.hashSync('admin123', 10),
        fullname: 'Администратор',
        phone: '',
        bio: 'Панель управления',
        is_online: 0,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        role: 'admin'
    };

    const now = new Date().toISOString();
    const store = {
        users: [demo, admin],
        chats: [
            {
                id: 'general-chat',
                name: 'Общий чат',
                type: 'group',
                created_by: 'system',
                created_at: now
            },
            {
                id: 'support-demo-user-id',
                name: 'Техподдержка Pulse',
                type: 'private',
                created_by: 'system',
                created_at: now
            },
            {
                id: 'support-admin-user-id',
                name: 'Техподдержка Pulse',
                type: 'private',
                created_by: 'system',
                created_at: now
            }
        ],
        participants: [
            { chat_id: 'general-chat', user_id: 'demo-user-id' },
            { chat_id: 'general-chat', user_id: 'admin-user-id' },
            { chat_id: 'support-demo-user-id', user_id: 'demo-user-id' },
            { chat_id: 'support-admin-user-id', user_id: 'admin-user-id' }
        ],
        messages: [
            {
                id: `${Date.now()}welcome`,
                chat_id: 'general-chat',
                sender_id: 'system',
                text: 'Добро пожаловать в Pulse!',
                timestamp: now,
                message_type: 'text',
                read_by: []
            },
            {
                id: `${Date.now()}support1`,
                chat_id: 'support-demo-user-id',
                sender_id: 'support',
                text: 'Здравствуйте! Чем могу помочь?',
                timestamp: now,
                message_type: 'text',
                read_by: []
            },
            {
                id: `${Date.now()}support2`,
                chat_id: 'support-admin-user-id',
                sender_id: 'support',
                text: 'Здравствуйте! Чем могу помочь?',
                timestamp: now,
                message_type: 'text',
                read_by: []
            }
        ],
        stories: []
    };

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');

    removeDirFiles(path.join(dataDir, 'uploads'));
    removeDirFiles(path.join(dataDir, 'stories'));
    removeDirFiles(path.join(dataDir, 'avatars'));

    console.log('Готово! Остались только:');
    console.log('  demo / demo123');
    console.log('  admin / admin123');
    console.log('Перезапустите сервер: npm start');
}

reset();
