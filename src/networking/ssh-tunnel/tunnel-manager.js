// TunnelManager.js
import { Client } from 'ssh2';

class TunnelManager {
    constructor(sshConfig, maxConnections = 5) {
        this.sshConfig = sshConfig;
        this.maxConnections = maxConnections;
        this.clients = [];
        this.availableClients = [];
        this.initializeClients();
    }

    initializeClients() {
        for (let i = 0; i < this.maxConnections; i++) {
            const client = new Client();
            const clientPromise = new Promise((resolve, reject) => {
                client.on('ready', () => {
                    console.log(`共享的 SSH 连接 ${i + 1} 已建立`);
                    this.availableClients.push(client);
                    resolve(client);
                }).on('error', (err) => {
                    console.error(`共享 SSH 连接 ${i + 1} 错误:`, err);
                    reject(err);
                }).connect(this.sshConfig);
            });
            this.clients.push(clientPromise);
        }
    }

    async getTunnel(host, port) {
        while (this.availableClients.length === 0) {
            // 等待直到有可用的 SSH 客户端
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const client = this.availableClients.shift();
        try {
            const stream = await new Promise((resolve, reject) => {
                client.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
                    if (err) return reject(err);
                    resolve(stream);
                });
            });
            // 在使用完成后将客户端放回可用列表
            stream.on('close', () => {
                this.availableClients.push(client);
            });
            return stream;
        } catch (err) {
            this.availableClients.push(client);
            throw err;
        }
    }

    async close() {
        for (const clientPromise of this.clients) {
            try {
                const client = await clientPromise;
                client.end();
            } catch (err) {
                console.error('关闭 SSH 客户端时出错:', err);
            }
        }
    }
}

export default TunnelManager;
