/** Единый рендер аватаров по всему приложению */
const Avatar = {
    base() {
        return window.Api?.getBase() || window.location?.origin || '';
    },

    initials(user) {
        if (!user) return '?';
        const name = user.fullname || user.username || '';
        if (!name) return '?';
        return name
            .split(' ')
            .filter(Boolean)
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    },

    src(avatarUrl, bust = false) {
        if (!avatarUrl) return null;
        const url = `${this.base()}${avatarUrl}`;
        return bust ? `${url}?t=${Date.now()}` : url;
    },

    apply(el, user, bust = false) {
        if (!el) return;
        if (user?.avatarUrl) {
            el.innerHTML = `<img src="${this.src(user.avatarUrl, bust)}" alt="">`;
            el.classList.add('has-image');
        } else {
            el.textContent = this.initials(user);
            el.classList.remove('has-image');
        }
    },

    createElement(user, className = 'avatar') {
        const el = document.createElement('div');
        el.className = className + (user?.avatarUrl ? ' has-image' : '');
        this.apply(el, user);
        return el;
    }
};

window.Avatar = Avatar;
