/** Адрес API: всегда Node-сервер на порту 3000 */
const Api = {
    SERVER_PORT: 3000,

    getBase() {
        const { protocol, hostname, port, origin } = window.location;

        if (protocol === 'file:') {
            return `http://127.0.0.1:${this.SERVER_PORT}`;
        }

        if (port === String(this.SERVER_PORT)) {
            return origin;
        }

        const host = hostname === 'localhost' || hostname === '127.0.0.1' ? hostname : '127.0.0.1';
        return `http://${host}:${this.SERVER_PORT}`;
    },

    wsHost() {
        try {
            return new URL(this.getBase()).host;
        } catch {
            return `127.0.0.1:${this.SERVER_PORT}`;
        }
    },

    url(path) {
        const base = this.getBase().replace(/\/$/, '');
        return `${base}${path.startsWith('/') ? path : `/${path}`}`;
    },

    isPageOnServer() {
        return window.location.port === String(this.SERVER_PORT);
    },

    async checkHealth() {
        try {
            const r = await fetch(this.url('/health'), { cache: 'no-store' });
            return r.ok;
        } catch {
            return false;
        }
    },

    async request(path, options = {}) {
        let response;
        try {
            response = await fetch(this.url(path), options);
        } catch (err) {
            const hint = window.location.protocol === 'file:'
                ? 'Не открывайте index.html файлом. Запустите npm start и зайдите на http://localhost:3000'
                : `Сервер не отвечает на ${this.getBase()}. Запустите: npm start`;
            throw new Error(`${hint}\n(${err.message || 'fetch failed'})`);
        }

        const text = await response.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(
                    'Ответ не от Pulse (возможно, другой сайт на этом порту).\n' +
                    'Закройте лишние серверы, выполните npm start и откройте http://localhost:3000'
                );
            }
        }
        return { response, data };
    }
};

window.Api = Api;
