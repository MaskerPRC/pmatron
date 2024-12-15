import { Client } from 'ssh2';

class TunnelManager {
    constructor(sshConfig) {
        this.sshConfig = sshConfig;
        this.client = new Client();
        this.clientReady = false;
        this.clientConnecting = false;
        this.connectingPromise = null;
        this.connect();
    }

    connect() {
        if (this.clientConnecting) {
            return this.connectingPromise;
        }
        this.clientConnecting = true;
        this.connectingPromise = new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                console.log('共享的 SSH 连接已建立');
                this.clientReady = true;
                this.clientConnecting = false;
                resolve();
            }).on('error', (err) => {
                console.error('共享 SSH 连接错误:', err);
                this.clientConnecting = false;
                reject(err);
            }).connect(this.sshConfig);
        });
        return this.connectingPromise;
    }

    async getTunnel(host, port) {
        if (!this.clientReady) {
            await this.connect();
        }
        return new Promise((resolve, reject) => {
            this.client.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
                if (err) {
                    return reject(err);
                }
                resolve(stream);
            });
        });
    }

    close() {
        if (this.clientReady) {
            this.client.end();
            this.clientReady = false;
        }
    }
}

export default TunnelManager;
