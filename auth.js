class Auth {
    constructor() {
        this.currentUser = null;
        this.apiBase = window.Api?.getBase() || window.location.origin;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('show-register').addEventListener('click', () => this.toggleForms());
        document.getElementById('show-login').addEventListener('click', () => this.toggleForms());
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('register-btn').addEventListener('click', () => this.register());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('edit-profile-btn').addEventListener('click', () => this.editProfile());
        document.getElementById('profile-avatar').addEventListener('click', () => {
            document.getElementById('avatar-input').click();
        });
        document.getElementById('avatar-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.uploadAvatar(e.target.files[0]);
            e.target.value = '';
        });

        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        document.getElementById('register-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.register();
        });
    }

    toggleForms() {
        const loginForm = document.querySelector('.auth-form:not(.register-form)');
        const registerForm = document.querySelector('.register-form');
        const loginVisible = loginForm.style.display !== 'none';
        loginForm.style.display = loginVisible ? 'none' : 'block';
        registerForm.style.display = loginVisible ? 'block' : 'none';
    }

    async login() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            alert('Заполните все поля');
            return;
        }

        try {
            const { response, data } = await Api.request('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                this.setSession(data.token, data.user);
            } else {
                const msg = data?.error || 'Ошибка авторизации';
                alert(msg + '\n\nДля admin: логин admin, пароль admin123\n(сначала npm run reset-data и перезапуск сервера)');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message || this.connectionErrorMessage());
        }
    }

    connectionErrorMessage() {
        if (window.location.protocol === 'file:') {
            return 'Откройте приложение через http://localhost:3000\n(сначала npm start), а не через файл index.html.';
        }
        return 'Ошибка соединения с сервером.\n\nЗапустите в терминале: npm start\nОткройте: http://localhost:3000';
    }

    async register() {
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const fullname = document.getElementById('register-fullname').value.trim();

        if (!username || !email || !password || !fullname) {
            alert('Заполните все поля');
            return;
        }

        if (username.length < 3) {
            alert('Имя пользователя — минимум 3 символа');
            return;
        }

        if (password.length < 6) {
            alert('Пароль — минимум 6 символов');
            return;
        }

        try {
            const { response, data } = await Api.request('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, fullname })
            });

            if (response.ok) {
                this.setSession(data.token, data.user);
                alert('Аккаунт успешно создан!');
            } else {
                alert(data.error || 'Ошибка регистрации');
            }
        } catch (error) {
            console.error('Register error:', error);
            alert(error.message || this.connectionErrorMessage());
        }
    }

    setSession(token, user) {
        this.currentUser = user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        this.showMainApp();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (token && user) {
            try {
                this.currentUser = JSON.parse(user);
                this.showMainApp();
            } catch {
                this.logout();
            }
        } else {
            this.showAuth();
        }
    }

    showAuth() {
        document.getElementById('auth-screen').classList.add('active');
        document.getElementById('main-screen').classList.remove('active');
    }

    showMainApp() {
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('main-screen').classList.add('active');
        this.updateUserInfo();
        window.app?.updateAdminMenu();

        setTimeout(() => {
            if (window.chatManager) {
                window.chatManager.loadChats();
                window.chatManager.startConnectionMonitor();
                this.openGeneralChat();
            }
            if (window.storiesManager) {
                window.storiesManager.loadStories();
            }
        }, 100);
    }

    async openGeneralChat() {
        try {
            const response = await fetch(`${this.apiBase}/api/chats`, {
                headers: { Authorization: `Bearer ${this.getToken()}` }
            });

            if (response.ok) {
                const userChats = await response.json();
                const generalChat = userChats.find((chat) => chat.id === 'general-chat');
                if (generalChat) {
                    chatManager.openChat(generalChat);
                }
            }
        } catch (error) {
            console.error('Error opening general chat:', error);
        }
    }

    renderAvatarElement(el, user) {
        window.Avatar?.apply(el, user, true);
    }

    async refreshCurrentUser() {
        try {
            const response = await fetch(`${this.apiBase}/api/users/profile`, {
                headers: { Authorization: `Bearer ${this.getToken()}` }
            });
            if (response.ok) {
                this.currentUser = await response.json();
                localStorage.setItem('user', JSON.stringify(this.currentUser));
                this.updateUserInfo();
            }
        } catch (error) {
            console.error('Refresh profile error:', error);
        }
    }

    async uploadAvatar(file) {
        try {
            const image = await ChatManager.compressImageFile(file, 400, 0.85);
            const response = await fetch(`${this.apiBase}/api/users/profile/avatar`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({ image })
            });

            if (response.ok) {
                this.currentUser = await response.json();
                localStorage.setItem('user', JSON.stringify(this.currentUser));
                this.updateUserInfo();
                window.app?.showToast('Фото профиля обновлено');
                if (window.app?.allUsersCache?.length) {
                    window.app.showContacts();
                }
            } else {
                const err = await response.json();
                window.app?.showToast(err.error || 'Ошибка', 'error');
            }
        } catch (error) {
            console.error('Avatar upload error:', error);
            window.app?.showToast('Не удалось загрузить фото', 'error');
        }
    }

    updateUserInfo() {
        if (!this.currentUser) return;

        this.renderAvatarElement(document.getElementById('profile-avatar'), this.currentUser);
        this.renderAvatarElement(document.getElementById('sidebar-avatar'), this.currentUser);
        document.getElementById('profile-fullname').textContent = this.currentUser.fullname || this.currentUser.username;
        document.getElementById('profile-username').textContent = `@${this.currentUser.username}`;
        document.getElementById('sidebar-fullname').textContent = this.currentUser.fullname || this.currentUser.username;
        document.getElementById('sidebar-username').textContent = `@${this.currentUser.username}`;
        document.getElementById('profile-phone').textContent = this.currentUser.phone || 'Не указан';
        document.getElementById('profile-bio').textContent = this.currentUser.bio || 'Информация отсутствует';

        const statusElement = document.getElementById('profile-status');
        if (this.currentUser.isOnline) {
            statusElement.textContent = 'в сети';
            statusElement.className = 'status-online';
        } else {
            statusElement.textContent = 'не в сети';
            statusElement.className = 'status-offline';
        }
    }

    async editProfile() {
        const newFullname = prompt('Введите ваше имя:', this.currentUser.fullname || '');
        if (newFullname === null) return;

        const newBio = prompt('О себе:', this.currentUser.bio || '');
        if (newBio === null) return;

        const newPhone = prompt('Телефон:', this.currentUser.phone || '');
        if (newPhone === null) return;

        try {
            const response = await fetch(`${this.apiBase}/api/users/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({
                    fullname: newFullname,
                    bio: newBio,
                    phone: newPhone
                })
            });

            if (response.ok) {
                const updatedProfile = await response.json();
                this.currentUser = { ...this.currentUser, ...updatedProfile };
                localStorage.setItem('user', JSON.stringify(this.currentUser));
                this.updateUserInfo();
                window.app?.showToast('Профиль обновлён');
            } else {
                alert('Ошибка обновления профиля');
            }
        } catch (error) {
            console.error('Profile update error:', error);
            alert('Ошибка соединения');
        }
    }

    logout() {
        if (!confirm('Выйти из аккаунта?')) return;

        if (window.chatManager) {
            window.chatManager.disconnectWebSocket();
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.currentUser = null;
        this.showAuth();
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    }

    getToken() {
        return localStorage.getItem('token');
    }

    getCurrentUser() {
        return this.currentUser;
    }
}
