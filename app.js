import { AuthManager } from './auth.js';
import { WebRTCManager } from './webrtc.js';
import { WhiteboardManager } from './whiteboard.js';
import { CryptoManager } from './crypto.js';

class RTCCollabApp {
    constructor() {
        this.authManager = new AuthManager();
        this.webrtcManager = null;
        this.whiteboardManager = null;
        this.cryptoManager = new CryptoManager();

        this.currentRoom = null;
        this.participants = new Map();
        this.sharedFiles = [];
        this.pendingFileTransfers = new Map();

        this.initializeUI();
        this.checkAuthentication();
    }

    initializeUI() {
        document.getElementById('show-register').addEventListener('click', () => {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('register-form').classList.remove('hidden');
            document.getElementById('auth-error').textContent = '';
        });

        document.getElementById('show-login').addEventListener('click', () => {
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('auth-error').textContent = '';
        });

        document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
        document.getElementById('register-btn').addEventListener('click', () => this.handleRegister());
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        document.getElementById('send-message').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        document.getElementById('toggle-video').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggle-audio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('share-screen').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('end-call').addEventListener('click', () => this.endCall());

        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());

        document.getElementById('select-file').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.shareFile(e.target.files[0]);
            }
        });
    }

    checkAuthentication() {
        if (this.authManager.isAuthenticated()) {
            this.showApp();
        } else {
            this.showAuth();
        }
    }

    handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            this.authManager.login(username, password);
            this.showApp();
        } catch (error) {
            document.getElementById('auth-error').textContent = error.message;
        }
    }

    handleRegister() {
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm').value;

        try {
            this.authManager.register(username, password, confirmPassword);
            document.getElementById('auth-error').textContent = '';
            document.getElementById('auth-error').style.color = 'var(--success-color)';
            document.getElementById('auth-error').textContent = 'Registration successful! Please login.';

            setTimeout(() => {
                document.getElementById('register-form').classList.add('hidden');
                document.getElementById('login-form').classList.remove('hidden');
                document.getElementById('auth-error').textContent = '';
            }, 1500);
        } catch (error) {
            document.getElementById('auth-error').style.color = 'var(--danger-color)';
            document.getElementById('auth-error').textContent = error.message;
        }
    }

    handleLogout() {
        if (this.webrtcManager) {
            this.webrtcManager.disconnect();
        }
        this.authManager.logout();
        this.showAuth();
    }

    showAuth() {
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    }

    showApp() {
        const user = this.authManager.getCurrentUser();
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('user-name').textContent = user.username;
        document.getElementById('join-call-modal').classList.remove('hidden');
    }

    async createRoom() {
        const roomId = this.generateRoomId();
        await this.joinRoomWithId(roomId);
    }

    async joinRoom() {
        const roomId = document.getElementById('room-input').value.trim();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }
        await this.joinRoomWithId(roomId);
    }

    async joinRoomWithId(roomId) {
        try {
            this.currentRoom = roomId;
            document.getElementById('room-id').textContent = `Room: ${roomId}`;
            document.getElementById('join-call-modal').classList.add('hidden');

            await this.cryptoManager.generateKey();

            const signalingUrl = this.getSignalingUrl();
            const user = this.authManager.getCurrentUser();

            this.webrtcManager = new WebRTCManager(signalingUrl, user.username);

            this.webrtcManager.onRemoteStream = (peerId, stream) => {
                this.addRemoteVideo(peerId, stream);
                this.addParticipant(peerId);
            };

            this.webrtcManager.onRemoveStream = (peerId) => {
                this.removeRemoteVideo(peerId);
                this.removeParticipant(peerId);
            };

            this.webrtcManager.onDataChannel = async (peerId, data) => {
                await this.handleDataChannelMessage(peerId, data);
            };

            await this.webrtcManager.connect(roomId);

            const localStream = await this.webrtcManager.startLocalStream();
            document.getElementById('local-video').srcObject = localStream;

            this.initializeWhiteboard();

            this.addParticipant(user.username, true);
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room: ' + error.message);
        }
    }

    getSignalingUrl() {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (supabaseUrl) {
            return supabaseUrl.replace('https://', 'wss://') + '/functions/v1/signaling';
        }
        return 'ws://localhost:8080';
    }

    initializeWhiteboard() {
        const canvas = document.getElementById('whiteboard');
        this.whiteboardManager = new WhiteboardManager(canvas);

        this.whiteboardManager.onDrawAction = (action) => {
            this.webrtcManager.sendData({
                type: 'whiteboard',
                action: action
            });
        };

        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.whiteboardManager.setTool(btn.dataset.tool);
            });
        });

        document.getElementById('color-picker').addEventListener('change', (e) => {
            this.whiteboardManager.setColor(e.target.value);
        });

        document.getElementById('clear-canvas').addEventListener('click', () => {
            this.whiteboardManager.clear();
        });
    }

    addRemoteVideo(peerId, stream) {
        const existingVideo = document.getElementById(`video-${peerId}`);
        if (existingVideo) return;

        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${peerId}`;

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsinline = true;
        video.srcObject = stream;

        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = peerId;

        videoContainer.appendChild(video);
        videoContainer.appendChild(label);

        document.getElementById('video-grid').appendChild(videoContainer);
    }

    removeRemoteVideo(peerId) {
        const videoContainer = document.getElementById(`video-${peerId}`);
        if (videoContainer) {
            videoContainer.remove();
        }
    }

    toggleVideo() {
        if (this.webrtcManager) {
            const enabled = this.webrtcManager.toggleVideo();
            const btn = document.getElementById('toggle-video');
            btn.classList.toggle('active', enabled);
        }
    }

    toggleAudio() {
        if (this.webrtcManager) {
            const enabled = this.webrtcManager.toggleAudio();
            const btn = document.getElementById('toggle-audio');
            btn.classList.toggle('active', enabled);
        }
    }

    async toggleScreenShare() {
        if (!this.webrtcManager) return;

        const btn = document.getElementById('share-screen');

        if (this.webrtcManager.screenStream) {
            this.webrtcManager.stopScreenShare();
            btn.classList.remove('active');
        } else {
            try {
                await this.webrtcManager.startScreenShare();
                btn.classList.add('active');
            } catch (error) {
                console.error('Error sharing screen:', error);
                alert('Failed to share screen');
            }
        }
    }

    endCall() {
        if (this.webrtcManager) {
            this.webrtcManager.disconnect();
        }
        document.getElementById('join-call-modal').classList.remove('hidden');
        document.getElementById('room-id').textContent = '';
        document.getElementById('video-grid').innerHTML = `
            <div class="video-container">
                <video id="local-video" autoplay muted playsinline></video>
                <div class="video-label">You</div>
            </div>
        `;
        this.participants.clear();
        this.updateParticipantsList();
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));

        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    }

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message || !this.webrtcManager) return;

        const user = this.authManager.getCurrentUser();

        const encryptedMessage = await this.cryptoManager.encrypt({
            type: 'chat',
            sender: user.username,
            message: message,
            timestamp: new Date().toISOString()
        });

        this.webrtcManager.sendData(encryptedMessage);

        this.addChatMessage(user.username, message, new Date());

        input.value = '';
    }

    addChatMessage(sender, message, timestamp) {
        const chatMessages = document.getElementById('chat-messages');

        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        const senderSpan = document.createElement('div');
        senderSpan.className = 'sender';
        senderSpan.textContent = sender;

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = this.formatTime(timestamp);
        senderSpan.appendChild(timestampSpan);

        const messageText = document.createElement('div');
        messageText.textContent = message;

        messageDiv.appendChild(senderSpan);
        messageDiv.appendChild(messageText);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async shareFile(file) {
        if (!this.webrtcManager || file.size > 10 * 1024 * 1024) {
            alert('File is too large. Maximum size is 10MB');
            return;
        }

        try {
            const encryptedFile = await this.cryptoManager.encryptFile(file);

            const chunks = this.chunkArray(encryptedFile.data, 16384);
            const fileId = this.generateFileId();

            this.webrtcManager.sendData({
                type: 'file-start',
                fileId: fileId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                totalChunks: chunks.length,
                iv: encryptedFile.iv
            });

            chunks.forEach((chunk, index) => {
                setTimeout(() => {
                    this.webrtcManager.sendData({
                        type: 'file-chunk',
                        fileId: fileId,
                        chunkIndex: index,
                        chunk: Array.from(chunk)
                    });
                }, index * 100);
            });

            this.addFileToList({
                name: file.name,
                size: file.size,
                type: file.type,
                file: file
            });
        } catch (error) {
            console.error('Error sharing file:', error);
            alert('Failed to share file');
        }
    }

    async handleDataChannelMessage(peerId, dataString) {
        try {
            const data = JSON.parse(dataString);

            if (data.type === 'chat') {
                const decrypted = await this.cryptoManager.decrypt(data);
                this.addChatMessage(
                    decrypted.sender,
                    decrypted.message,
                    new Date(decrypted.timestamp)
                );
            } else if (data.type === 'whiteboard') {
                this.whiteboardManager.handleRemoteAction(data.action);
            } else if (data.type === 'file-start') {
                this.pendingFileTransfers.set(data.fileId, {
                    fileName: data.fileName,
                    fileType: data.fileType,
                    fileSize: data.fileSize,
                    totalChunks: data.totalChunks,
                    iv: data.iv,
                    chunks: []
                });
            } else if (data.type === 'file-chunk') {
                const transfer = this.pendingFileTransfers.get(data.fileId);
                if (transfer) {
                    transfer.chunks[data.chunkIndex] = new Uint8Array(data.chunk);

                    if (transfer.chunks.filter(c => c).length === transfer.totalChunks) {
                        await this.completeFileTransfer(data.fileId);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling data channel message:', error);
        }
    }

    async completeFileTransfer(fileId) {
        const transfer = this.pendingFileTransfers.get(fileId);
        if (!transfer) return;

        const allChunks = transfer.chunks.flat();
        const dataArray = new Uint8Array(allChunks.length);
        let offset = 0;
        transfer.chunks.forEach(chunk => {
            dataArray.set(chunk, offset);
            offset += chunk.length;
        });

        const encryptedPackage = {
            iv: transfer.iv,
            data: Array.from(dataArray),
            type: transfer.fileType,
            name: transfer.fileName,
            size: transfer.fileSize
        };

        const blob = await this.cryptoManager.decryptFile(encryptedPackage);

        this.addFileToList({
            name: transfer.fileName,
            size: transfer.fileSize,
            type: transfer.fileType,
            blob: blob
        });

        this.pendingFileTransfers.delete(fileId);
    }

    addFileToList(fileInfo) {
        const filesList = document.getElementById('files-list');

        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const fileInfoDiv = document.createElement('div');
        fileInfoDiv.className = 'file-info';

        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = fileInfo.name;

        const fileSize = document.createElement('div');
        fileSize.className = 'file-size';
        fileSize.textContent = this.formatFileSize(fileInfo.size);

        fileInfoDiv.appendChild(fileName);
        fileInfoDiv.appendChild(fileSize);

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'file-download';
        downloadBtn.textContent = 'Download';
        downloadBtn.addEventListener('click', () => {
            const blob = fileInfo.blob || fileInfo.file;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileInfo.name;
            a.click();
            URL.revokeObjectURL(url);
        });

        fileItem.appendChild(fileInfoDiv);
        fileItem.appendChild(downloadBtn);

        filesList.appendChild(fileItem);
    }

    addParticipant(username, isLocal = false) {
        this.participants.set(username, { username, isLocal });
        this.updateParticipantsList();
    }

    removeParticipant(username) {
        this.participants.delete(username);
        this.updateParticipantsList();
    }

    updateParticipantsList() {
        const participantsList = document.getElementById('participants-list');
        participantsList.innerHTML = '';

        this.participants.forEach((participant) => {
            const item = document.createElement('div');
            item.className = 'participant-item';

            const avatar = document.createElement('div');
            avatar.className = 'participant-avatar';
            avatar.textContent = participant.username.charAt(0).toUpperCase();

            const info = document.createElement('div');
            info.className = 'participant-info';

            const name = document.createElement('div');
            name.className = 'participant-name';
            name.textContent = participant.username;

            const status = document.createElement('div');
            status.className = 'participant-status';
            status.textContent = participant.isLocal ? 'You' : 'Connected';

            info.appendChild(name);
            info.appendChild(status);

            item.appendChild(avatar);
            item.appendChild(info);

            participantsList.appendChild(item);
        });
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    generateFileId() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    formatTime(date) {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

new RTCCollabApp();
