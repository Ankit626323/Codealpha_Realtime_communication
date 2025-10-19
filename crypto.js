export class CryptoManager {
    constructor() {
        this.key = null;
    }

    async generateKey() {
        this.key = await window.crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );
        return this.key;
    }

    async exportKey() {
        if (!this.key) {
            await this.generateKey();
        }
        const exported = await window.crypto.subtle.exportKey('jwk', this.key);
        return JSON.stringify(exported);
    }

    async importKey(keyData) {
        const jwk = JSON.parse(keyData);
        this.key = await window.crypto.subtle.importKey(
            'jwk',
            jwk,
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );
        return this.key;
    }

    async encrypt(data) {
        if (!this.key) {
            await this.generateKey();
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(JSON.stringify(data));

        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            this.key,
            dataBuffer
        );

        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedData))
        };
    }

    async decrypt(encryptedPackage) {
        if (!this.key) {
            throw new Error('No encryption key available');
        }

        const iv = new Uint8Array(encryptedPackage.iv);
        const data = new Uint8Array(encryptedPackage.data);

        const decryptedData = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            this.key,
            data
        );

        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decryptedData);
        return JSON.parse(jsonString);
    }

    async encryptFile(file) {
        if (!this.key) {
            await this.generateKey();
        }

        const arrayBuffer = await file.arrayBuffer();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            this.key,
            arrayBuffer
        );

        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedData)),
            name: file.name,
            type: file.type,
            size: file.size
        };
    }

    async decryptFile(encryptedPackage) {
        if (!this.key) {
            throw new Error('No encryption key available');
        }

        const iv = new Uint8Array(encryptedPackage.iv);
        const data = new Uint8Array(encryptedPackage.data);

        const decryptedData = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            this.key,
            data
        );

        return new Blob([decryptedData], { type: encryptedPackage.type });
    }
}
