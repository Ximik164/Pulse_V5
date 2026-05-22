class App {
    constructor() {
        this.currentScreen = 'screen-main';
        this.allUsersCache = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.applySettings();
        this.showScreen('screen-main');
    }

    bindEvents() {
        document.getElementById('sidebar-toggle').addEventListener('click', () => this.toggleSidebar());
        document.getElementById('sidebar-overlay').addEventListener('click', () => this.toggleSidebar());

        document.getElementById('sidebar-profile').addEventListener('click', () => {
            this.showScreen('screen-profile');
            this.toggleSidebar();
        });

        document.getElementById('create-group').addEventListener('click', () => {
            this.showCreateGroupModal();
            this.toggleSidebar();
        });

        document.getElementById('contacts').addEventListener('click', () => {
            this.showContacts();
            this.toggleSidebar();
        });

        document.getElementById('settings').addEventListener('click', () => {
            this.showSettings();
            this.toggleSidebar();
        });

        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());

        document.getElementById('pick-custom-sound')?.addEventListener('click', () => {
            document.getElementById('custom-sound-input')?.click();
        });
        document.getElementById('custom-sound-input')?.addEventListener('change', (e) => {
            this.handleCustomSoundUpload(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('test-custom-sound')?.addEventListener('click', () => {
            NotificationSound.play(true);
        });
        document.getElementById('reset-custom-sound')?.addEventListener('click', () => {
            NotificationSound.clear();
            NotificationSound.updateSettingsUi();
            this.showToast('Сброшен стандартный звук');
        });

        document.getElementById('search-toggle').addEventListener('click', () => {
            this.showContacts();
            setTimeout(() => document.getElementById('contacts-search')?.focus(), 200);
        });

        document.getElementById('contacts-search')?.addEventListener('input', (e) => {
            this.filterContactsList(e.target.value);
        });

        document.getElementById('invite-to-group')?.addEventListener('click', () => {
            this.showInviteModal();
        });

        document.getElementById('app-modal-overlay')?.addEventListener('click', () => this.closeModal());
    }

    showScreen(screenId) {
        document.querySelectorAll('.content-container').forEach((screen) => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    }

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('active');
    }

    openModal(html) {
        document.getElementById('app-modal-content').innerHTML = html;
        document.getElementById('app-modal').classList.add('active');
    }

    closeModal() {
        document.getElementById('app-modal').classList.remove('active');
        document.getElementById('app-modal-content').innerHTML = '';
    }

    async fetchUsers(query = '') {
        const url = query.trim()
            ? `${Api.getBase()}/api/users/search?q=${encodeURIComponent(query.trim())}`
            : `${Api.getBase()}/api/users`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${auth.getToken()}` }
        });

        if (!response.ok) throw new Error('users load failed');
        return response.json();
    }

    renderUserPickerList(container, users, selectedIds, chatParticipantIds = []) {
        container.innerHTML = '';

        if (!users.length) {
            container.innerHTML = '<p class="empty-state">Пользователи не найдены</p>';
            return;
        }

        users.forEach((user) => {
            const inChat = chatParticipantIds.includes(user.id);
            const checked = selectedIds.has(user.id);
            const row = document.createElement('label');
            row.className = 'user-picker-item';
            row.innerHTML = `
                <input type="checkbox" value="${user.id}" ${checked ? 'checked' : ''} ${inChat ? 'disabled' : ''}>
                <span class="user-picker-info">
                    <strong>${this.escape(user.fullname || user.username)}</strong>
                    <small>@${user.username}${inChat ? ' · уже в группе' : ''}</small>
                </span>
            `;
            container.appendChild(row);
        });
    }

    async showCreateGroupModal() {
        try {
            const users = await this.fetchUsers();
            const selected = new Set();

            this.openModal(`
                <h3>Создать группу</h3>
                <input type="text" id="modal-group-name" class="modal-input" placeholder="Название группы" maxlength="80">
                <p class="modal-hint">Пригласите участников:</p>
                <input type="text" id="modal-user-search" class="modal-input" placeholder="Поиск пользователей...">
                <div class="user-picker-list" id="modal-user-list"></div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" id="modal-cancel">Отмена</button>
                    <button type="button" class="btn-primary" id="modal-create-group">Создать</button>
                </div>
            `);

            const list = document.getElementById('modal-user-list');
            this.renderUserPickerList(list, users, selected);

            document.getElementById('modal-cancel').onclick = () => this.closeModal();

            document.getElementById('modal-user-search').addEventListener('input', async (e) => {
                const found = await this.fetchUsers(e.target.value);
                this.renderUserPickerList(list, found, selected);
            });

            list.addEventListener('change', () => {
                list.querySelectorAll('input[type=checkbox]:checked').forEach((cb) => {
                    selected.add(cb.value);
                });
                list.querySelectorAll('input[type=checkbox]:not(:checked)').forEach((cb) => {
                    selected.delete(cb.value);
                });
            });

            document.getElementById('modal-create-group').onclick = async () => {
                const name = document.getElementById('modal-group-name').value.trim();
                if (!name) {
                    this.showToast('Введите название группы', 'error');
                    return;
                }

                const participants = [...selected];
                await this.submitCreateGroup(name, participants);
            };
        } catch (error) {
            console.error('Create group modal error:', error);
            this.showToast('Ошибка загрузки пользователей', 'error');
        }
    }

    async submitCreateGroup(name, participants) {
        try {
            const response = await fetch(`${Api.getBase()}/api/chats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${auth.getToken()}`
                },
                body: JSON.stringify({ name, type: 'group', participants })
            });

            if (response.ok) {
                const newChat = await response.json();
                this.closeModal();
                this.showToast(`Группа создана${participants.length ? `, приглашено: ${participants.length}` : ''}`);
                await chatManager.loadChats();
                chatManager.openChat(newChat);
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Ошибка создания группы', 'error');
            }
        } catch (error) {
            this.showToast('Ошибка соединения', 'error');
        }
    }

    async showInviteModal() {
        const chat = chatManager.currentChat;
        if (!chat || chat.type !== 'group') return;

        try {
            const users = await this.fetchUsers();
            const selected = new Set();
            const participants = chat.participants || [];

            this.openModal(`
                <h3>Пригласить в «${this.escape(chat.name)}»</h3>
                <input type="text" id="modal-user-search" class="modal-input" placeholder="Поиск пользователей...">
                <div class="user-picker-list" id="modal-user-list"></div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" id="modal-cancel">Отмена</button>
                    <button type="button" class="btn-primary" id="modal-invite">Пригласить</button>
                </div>
            `);

            const list = document.getElementById('modal-user-list');
            this.renderUserPickerList(list, users, selected, participants);

            document.getElementById('modal-cancel').onclick = () => this.closeModal();

            document.getElementById('modal-user-search').addEventListener('input', async (e) => {
                const found = await this.fetchUsers(e.target.value);
                this.renderUserPickerList(list, found, selected, participants);
            });

            list.addEventListener('change', () => {
                list.querySelectorAll('input[type=checkbox]:checked:not(:disabled)').forEach((cb) => {
                    selected.add(cb.value);
                });
                list.querySelectorAll('input[type=checkbox]:not(:checked)').forEach((cb) => {
                    selected.delete(cb.value);
                });
            });

            document.getElementById('modal-invite').onclick = async () => {
                const userIds = [...selected];
                if (!userIds.length) {
                    this.showToast('Выберите пользователей', 'error');
                    return;
                }

                const response = await fetch(`${Api.getBase()}/api/chats/${chat.id}/members`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${auth.getToken()}`
                    },
                    body: JSON.stringify({ userIds })
                });

                if (response.ok) {
                    const data = await response.json();
                    this.closeModal();
                    this.showToast(`Приглашено: ${data.added?.length || 0}`);
                    chatManager.currentChat = data.chat;
                    await chatManager.loadChats();
                } else {
                    const err = await response.json();
                    this.showToast(err.error || 'Ошибка', 'error');
                }
            };
        } catch (error) {
            this.showToast('Ошибка загрузки', 'error');
        }
    }

    showToast(text, type = 'success') {
        const div = document.createElement('div');
        div.className = type === 'error' ? 'toast-error' : 'toast-success';
        div.textContent = text;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    escape(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    async showContacts() {
        this.showScreen('screen-contacts');
        const list = document.getElementById('contacts-list');
        const searchInput = document.getElementById('contacts-search');
        if (searchInput) searchInput.value = '';

        list.innerHTML = '<li class="empty-state">Загрузка...</li>';

        try {
            await auth.refreshCurrentUser();
            this.allUsersCache = await this.fetchUsers();
            this.renderContactsList(this.allUsersCache);
        } catch (error) {
            console.error('Contacts error:', error);
            list.innerHTML = '<li class="empty-state">Ошибка загрузки контактов</li>';
        }
    }

    renderContactsList(users) {
        const list = document.getElementById('contacts-list');
        list.innerHTML = '';

        if (!users.length) {
            list.innerHTML = '<li class="empty-state">Никого не найдено. Зарегистрируйте второго пользователя для теста.</li>';
            return;
        }

        const currentId = auth.getCurrentUser()?.id;

        users.forEach((user) => {
            const item = document.createElement('li');
            item.className = 'contact-item';
            item.dataset.search = `${user.fullname} ${user.username} ${user.email}`.toLowerCase();

            const photo = Avatar.createElement(user, 'chat-item-photo contact-avatar');
            const isSelf = user.id === currentId;

            item.appendChild(photo);
            const info = document.createElement('div');
            info.className = 'chat-item-info';
            info.innerHTML = `
                    <div class="chat-item-header">
                        <span class="name">${this.escape(user.fullname || user.username)}${isSelf ? ' <span class="contact-you">(вы)</span>' : ''}</span>
                        <span class="contact-status ${user.isOnline ? 'online' : 'offline'}">
                            ${user.isOnline ? 'в сети' : 'офлайн'}
                        </span>
                    </div>
                    <div class="chat-item-message"><p>@${user.username}</p></div>
            `;
            item.appendChild(info);

            const btn = document.createElement('button');
            btn.className = 'btn-small';
            btn.type = 'button';
            btn.textContent = isSelf ? 'Профиль' : 'Написать';
            btn.addEventListener('click', () => {
                if (isSelf) {
                    this.showScreen('screen-profile');
                } else {
                    chatManager.startPrivateChat(user.id);
                }
            });
            item.appendChild(btn);

            list.appendChild(item);
        });
    }

    filterContactsList(query) {
        const q = query.trim().toLowerCase();
        if (!q) {
            this.renderContactsList(this.allUsersCache);
            return;
        }

        const filtered = this.allUsersCache.filter((u) =>
            `${u.fullname} ${u.username} ${u.email}`.toLowerCase().includes(q)
        );
        this.renderContactsList(filtered);
    }

    showSettings() {
        this.showScreen('screen-settings');
        const settings = this.getSettings();
        document.getElementById('setting-dark-theme').checked = settings.darkTheme;
        document.getElementById('setting-sounds').checked = settings.sounds;
        document.getElementById('setting-enter-send').checked = settings.enterSend;
        NotificationSound?.updateSettingsUi();
    }

    async handleCustomSoundUpload(file) {
        if (!file) return;
        try {
            const { dataUrl, name } = await NotificationSound.loadFile(file);
            NotificationSound.save(dataUrl, name);
            NotificationSound.updateSettingsUi();
            const soundsOn = document.getElementById('setting-sounds');
            if (soundsOn) soundsOn.checked = true;
            this.showToast(`Звук «${name}» загружен. Нажмите «Сохранить».`);
            NotificationSound.play(true);
        } catch (error) {
            this.showToast(error.message || 'Не удалось загрузить звук', 'error');
        }
    }

    getSettings() {
        return window.Theme?.getSettings() ?? { darkTheme: true, sounds: false, enterSend: true };
    }

    saveSettings() {
        const settings = {
            darkTheme: document.getElementById('setting-dark-theme').checked,
            sounds: document.getElementById('setting-sounds').checked,
            enterSend: document.getElementById('setting-enter-send').checked
        };
        localStorage.setItem('pulse-settings', JSON.stringify(settings));
        this.applySettings();
        this.showToast('Настройки сохранены');
    }

    applySettings() {
        window.Theme?.apply();
    }

    updateAdminMenu() {
        const isAdmin = auth.getCurrentUser()?.isAdmin;
        const item = document.getElementById('sidebar-admin');
        if (item) item.style.display = isAdmin ? 'flex' : 'none';
    }
}

let auth, chatManager, storiesManager, adminPanel, app;

function initPulseApp() {
    window.Theme?.init();
    auth = new Auth();
    chatManager = new ChatManager();
    storiesManager = new StoriesManager();
    adminPanel = new AdminPanel();
    app = new App();

    window.auth = auth;
    window.chatManager = chatManager;
    window.storiesManager = storiesManager;
    window.adminPanel = adminPanel;
    window.app = app;

    auth.checkAuth();
    app.updateAdminMenu();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPulseApp);
} else {
    initPulseApp();
}
