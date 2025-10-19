export class WebRTCManager {
    constructor(signalingUrl, username) {
        this.signalingUrl = signalingUrl;
        this.username = username;
        this.roomId = null;
        this.localStream = null;
        this.screenStream = null;
        this.peers = new Map();
        this.dataChannels = new Map();
        this.ws = null;

        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.onRemoteStream = null;
        this.onRemoveStream = null;
        this.onDataChannel = null;
    }

    async connect(roomId) {
        this.roomId = roomId;

        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.signalingUrl);

            this.ws.onopen = () => {
                this.ws.send(JSON.stringify({
                    type: 'join',
                    roomId: this.roomId,
                    username: this.username
                }));
                resolve();
            };

            this.ws.onerror = (error) => {
                reject(error);
            };

            this.ws.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                await this.handleSignalingMessage(message);
            };
        });
    }

    async handleSignalingMessage(message) {
        const { type, from, roomId: msgRoomId, ...data } = message;

        switch (type) {
            case 'user-joined':
                await this.createPeerConnection(from, true);
                break;

            case 'offer':
                await this.handleOffer(from, data.offer);
                break;

            case 'answer':
                await this.handleAnswer(from, data.answer);
                break;

            case 'ice-candidate':
                await this.handleIceCandidate(from, data.candidate);
                break;

            case 'user-left':
                this.removePeer(from);
                break;
        }
    }

    async createPeerConnection(peerId, createOffer) {
        const peerConnection = new RTCPeerConnection(this.configuration);

        this.peers.set(peerId, peerConnection);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        const dataChannel = peerConnection.createDataChannel('data', {
            ordered: true
        });

        this.setupDataChannel(peerId, dataChannel);

        peerConnection.ondatachannel = (event) => {
            this.setupDataChannel(peerId, event.channel);
        };

        peerConnection.ontrack = (event) => {
            if (this.onRemoteStream) {
                this.onRemoteStream(peerId, event.streams[0]);
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice-candidate',
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'failed') {
                this.removePeer(peerId);
            }
        };

        if (createOffer) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.sendSignal({
                type: 'offer',
                to: peerId,
                offer: offer
            });
        }

        return peerConnection;
    }

    setupDataChannel(peerId, channel) {
        this.dataChannels.set(peerId, channel);

        channel.onopen = () => {
            console.log(`Data channel opened with ${peerId}`);
        };

        channel.onmessage = (event) => {
            if (this.onDataChannel) {
                this.onDataChannel(peerId, event.data);
            }
        };

        channel.onerror = (error) => {
            console.error(`Data channel error with ${peerId}:`, error);
        };
    }

    async handleOffer(peerId, offer) {
        const peerConnection = await this.createPeerConnection(peerId, false);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.sendSignal({
            type: 'answer',
            to: peerId,
            answer: answer
        });
    }

    async handleAnswer(peerId, answer) {
        const peerConnection = this.peers.get(peerId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    async handleIceCandidate(peerId, candidate) {
        const peerConnection = this.peers.get(peerId);
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    sendSignal(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                ...message,
                roomId: this.roomId,
                from: this.username
            }));
        }
    }

    sendData(data, targetPeer = null) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);

        if (targetPeer) {
            const channel = this.dataChannels.get(targetPeer);
            if (channel && channel.readyState === 'open') {
                channel.send(message);
            }
        } else {
            this.dataChannels.forEach((channel) => {
                if (channel.readyState === 'open') {
                    channel.send(message);
                }
            });
        }
    }

    async startLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            return this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

            this.screenStream.getVideoTracks()[0].onended = () => {
                this.stopScreenShare();
            };

            this.replaceTrack(this.screenStream.getVideoTracks()[0]);
            return this.screenStream;
        } catch (error) {
            console.error('Error sharing screen:', error);
            throw error;
        }
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;

            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                this.replaceTrack(videoTrack);
            }
        }
    }

    replaceTrack(newTrack) {
        this.peers.forEach((peerConnection) => {
            const sender = peerConnection.getSenders().find(s =>
                s.track && s.track.kind === newTrack.kind
            );
            if (sender) {
                sender.replaceTrack(newTrack);
            }
        });
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                return videoTrack.enabled;
            }
        }
        return false;
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return audioTrack.enabled;
            }
        }
        return false;
    }

    removePeer(peerId) {
        const peerConnection = this.peers.get(peerId);
        if (peerConnection) {
            peerConnection.close();
            this.peers.delete(peerId);
        }

        const dataChannel = this.dataChannels.get(peerId);
        if (dataChannel) {
            dataChannel.close();
            this.dataChannels.delete(peerId);
        }

        if (this.onRemoveStream) {
            this.onRemoveStream(peerId);
        }
    }

    disconnect() {
        this.peers.forEach((_, peerId) => {
            this.removePeer(peerId);
        });

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
