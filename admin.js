class AdminPanel {
    constructor() {
        this.apiBase = window.Api?.getBase() || window.location.origin;
        this.usersCache = [];
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('sidebar-admin')?.addEventListener('click', () => {
            this.open();
            window.app?.toggleSidebar();
        });
        document.getElementById('back-from-admin')?.addEventListener('click', () => {
            window.app?.showScreen('screen-main');
        });
    }

    async open() {
        if (!auth.getCurrentUser()?.isAdmin) {
            window.app?.showToast('Нет прав администратора', 'error');
            return;
        }

        window.app?.showScreen('screen-admin');
        const panel = document.getElementById('admin-panel');
        panel.innerHTML = '<p class="empty-state">Загрузка...</p>';

        try {
            const response = await fetch(`${this.apiBase}/api/admin/dashboard`, {
                headers: { Authorization: `Bearer ${auth.getToken()}` }
            });

            if (!response.ok) throw new Error('forbidden');

            const data = await response.json();
            this.usersCache = data.userList || [];
            this.renderDashboard(data);
        } catch (error) {
            console.error('Admin panel error:', error);
            panel.innerHTML = '<p class="empty-state">Ошибка загрузки админ-панели</p>';
        }
    }

    renderDashboard(data) {
        const panel = document.getElementById('admin-panel');
        const totalUsers = data.users || 0;
        const onlinePct = totalUsers
            ? Math.round((data.onlineUsers / totalUsers) * 100)
            : 0;

        panel.innerHTML = `
            <div class="admin-dashboard">
                <div class="admin-hero">
                    <h4><i class="fa-solid fa-shield-halved"></i> Панель администратора</h4>
                    <p>Управление пользователями и статистика Pulse</p>
                </div>

                <div class="admin-stats admin-stats-grid">
                    <div class="admin-stat-card">
                        <i class="fa-solid fa-users admin-stat-icon"></i>
                        <span>${totalUsers}</span>
                        <p>Пользователей</p>
                    </div>
                    <div class="admin-stat-card accent">
                        <i class="fa-solid fa-circle admin-stat-icon online"></i>
                        <span>${data.onlineUsers}</span>
                        <p>Онлайн (${onlinePct}%)</p>
                    </div>
                    <div class="admin-stat-card">
                        <i class="fa-solid fa-comments admin-stat-icon"></i>
                        <span>${data.chats}</span>
                        <p>Чатов</p>
                    </div>
                    <div class="admin-stat-card">
                        <i class="fa-solid fa-envelope admin-stat-icon"></i>
                        <span>${data.messages}</span>
                        <p>Сообщений</p>
                    </div>
                    <div class="admin-stat-card">
                        <i class="fa-solid fa-clock admin-stat-icon"></i>
                        <span>${data.stories}</span>
                        <p>Историй (24ч)</p>
                    </div>
                </div>

                <div class="admin-toolbar">
                    <div class="search-box admin-search">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" id="admin-user-search" class="search-input" placeholder="Поиск: имя, @логин, email">
                    </div>
                    <span class="admin-user-count" id="admin-user-count"></span>
                </div>

                <ul class="admin-user-list" id="admin-user-list"></ul>

                <div class="admin-danger-zone">
                    <h5><i class="fa-solid fa-triangle-exclamation"></i> Опасная зона</h5>
                    <p>Сброс удалит всех пользователей, чаты и сообщения. Останутся только demo и admin.</p>
                    <button type="button" class="btn-danger admin-reset-btn" id="admin-reset-db">
                        <i class="fa-solid fa-database"></i> Сбросить базу данных
                    </button>
                </div>
            </div>
        `;

        document.getElementById('admin-reset-db').addEventListener('click', () => this.resetDatabase());
        document.getElementById('admin-user-search').addEventListener('input', (e) => {
            this.renderUserList(this.filterUsers(e.target.value));
        });

        this.renderUserList(this.usersCache);
    }

    filterUsers(query) {
        const q = query.trim().toLowerCase();
        if (!q) return this.usersCache;
        return this.usersCache.filter((u) =>
            `${u.fullname} ${u.username} ${u.email}`.toLowerCase().includes(q)
        );
    }

    renderUserList(users) {
        const list = document.getElementById('admin-user-list');
        const countEl = document.getElementById('admin-user-count');
        if (!list) return;

        if (countEl) countEl.textContent = `${users.length} из ${this.usersCache.length}`;

        list.innerHTML = '';
        if (!users.length) {
            list.innerHTML = '<li class="empty-state">Пользователи не найдены</li>';
            return;
        }

        const currentId = auth.getCurrentUser()?.id;

        users.forEach((user) => {
            const li = document.createElement('li');
            li.className = 'admin-user-item';

            const avatar = Avatar.createElement(user, 'admin-user-avatar');
            const canDelete = user.id !== currentId &&
                user.id !== 'demo-user-id' &&
                user.id !== 'admin-user-id';

            const meta = document.createElement('div');
            meta.className = 'admin-user-meta';
            meta.innerHTML = `
                <strong>${this.escape(user.fullname || user.username)}</strong>
                <p>@${this.escape(user.username)} · ${user.isOnline ? '<span class="contact-status online">в сети</span>' : '<span class="contact-status offline">офлайн</span>'}${user.isAdmin ? ' · <span class="admin-badge">админ</span>' : ''}</p>
                <small>${this.escape(user.email)}</small>
            `;

            li.appendChild(avatar);
            li.appendChild(meta);

            if (canDelete) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-danger btn-small';
                btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                btn.title = 'Удалить пользователя';
                btn.addEventListener('click', () => this.deleteUser(user));
                li.appendChild(btn);
            } else {
                const badge = document.createElement('span');
                badge.className = 'admin-protected';
                badge.textContent = 'защищён';
                li.appendChild(badge);
            }

            list.appendChild(li);
        });
    }

    async resetDatabase() {
        if (!confirm('Удалить ВСЕХ пользователей кроме demo и admin? Все чаты и сообщения будут сброшены.')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/admin/reset`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${auth.getToken()}` }
            });

            if (response.ok) {
                window.app?.showToast('База сброшена. Войдите: admin / admin123');
                localStorage.removeItem('pulse-settings');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                location.reload();
            } else {
                const err = await response.json();
                window.app?.showToast(err.error || 'Ошибка', 'error');
            }
        } catch {
            window.app?.showToast('Запустите в терминале: npm run reset-data', 'error');
        }
    }

    async deleteUser(user) {
        if (!confirm(`Удалить пользователя ${user.fullname} (@${user.username})?`)) return;

        try {
            const response = await fetch(`${this.apiBase}/api/admin/users/${user.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${auth.getToken()}` }
            });

            if (response.ok) {
                window.app?.showToast('Пользователь удалён');
                this.open();
            } else {
                const err = await response.json();
                window.app?.showToast(err.error || 'Ошибка', 'error');
            }
        } catch (error) {
            window.app?.showToast('Ошибка соединения', 'error');
        }
    }

    escape(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
}
