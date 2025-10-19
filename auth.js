export class AuthManager {
    constructor() {
        this.currentUser = null;
        this.loadCurrentUser();
    }

    loadCurrentUser() {
        const user = localStorage.getItem('currentUser');
        if (user) {
            this.currentUser = JSON.parse(user);
        }
    }

    register(username, password, confirmPassword) {
        if (!username || !password || !confirmPassword) {
            throw new Error('All fields are required');
        }

        if (password !== confirmPassword) {
            throw new Error('Passwords do not match');
        }

        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        const users = this.getUsers();

        if (users[username]) {
            throw new Error('Username already exists');
        }

        const hashedPassword = this.hashPassword(password);
        users[username] = {
            username,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        localStorage.setItem('users', JSON.stringify(users));
        return true;
    }

    login(username, password) {
        if (!username || !password) {
            throw new Error('Username and password are required');
        }

        const users = this.getUsers();
        const user = users[username];

        if (!user) {
            throw new Error('Invalid username or password');
        }

        const hashedPassword = this.hashPassword(password);

        if (user.password !== hashedPassword) {
            throw new Error('Invalid username or password');
        }

        this.currentUser = {
            username: user.username,
            createdAt: user.createdAt
        };

        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
        return this.currentUser;
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getUsers() {
        const users = localStorage.getItem('users');
        return users ? JSON.parse(users) : {};
    }

    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
}
