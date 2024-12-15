'use strict';

import * as dns from 'dns';
import * as util from 'node:util';
import * as net from 'net';
import * as http from 'http';
import {Client} from 'ssh2';
import {WebSocketServer } from 'ws';
import {debugLog} from './utils.js';
import {readFileSync} from 'fs';
import TunnelManager from "./ssh-tunnel/tunnel-manager.js";

function log(...args) {
    debugLog('[WS Server]', ...args);
}

const lookup = util.promisify(dns.lookup);

function prependByte(
    chunk,
    byte
) {
    if (typeof chunk === 'string') {
        chunk = String.fromCharCode(byte) + chunk;
    } else if (
        chunk instanceof ArrayBuffer ||
        'byteLength' in chunk /* for Node.js */
    ) {
        const buffer = new Uint8Array((chunk).byteLength + 1);
        buffer[0] = byte;
        buffer.set(new Uint8Array(chunk), 1);
        chunk = buffer.buffer;
    } else {
        log({chunk});
        throw new Error('Unsupported chunk type: ' + typeof chunk);
    }
    return chunk;
}

/**
 * Send a chunk of data to the remote server.
 */
export const COMMAND_CHUNK = 0x01;
/**
 * Set a TCP socket option.
 */
export const COMMAND_SET_SOCKETOPT = 0x02;

/**
 * Adds support for TCP socket options to WebSocket class.
 *
 * Socket options are implemented by adopting a specific data transmission
 * protocol between WS client and WS server The first byte
 * of every message is a command type, and the remaining bytes
 * are the actual data.
 *
 * @param  WebSocketConstructor
 * @returns Decorated constructor
 */
export function addSocketOptionsSupportToWebSocketClass(
    WebSocketConstructor
) {
    return class PHPWasmWebSocketConstructor extends WebSocketConstructor {
        // @ts-ignore
        send(chunk, callback) {
            return this.sendCommand(COMMAND_CHUNK, chunk, callback);
        }

        setSocketOpt(
            optionClass,
            optionName,
            optionValue
        ) {
            return this.sendCommand(
                COMMAND_SET_SOCKETOPT,
                new Uint8Array([optionClass, optionName, optionValue]).buffer,
                () => undefined
            );
        }

        sendCommand(
            commandType,
            chunk,
            callback
        ) {
            return (WebSocketConstructor.prototype.send).call(
                this,
                prependByte(chunk, commandType),
                callback
            );
        }
    };
}

export function initOutboundWebsocketProxyServer(
    listenPort,
    listenHost = '127.0.0.1'
) {
    log(`Binding the WebSockets server to ${listenHost}:${listenPort}...`);
    const webServer = http.createServer((request, response) => {
        response.writeHead(403, {'Content-Type': 'text/plain'});
        response.write(
            '403 Permission Denied\nOnly websockets are allowed here.\n'
        );
        response.end();
    });
    return new Promise((resolve) => {
        webServer.listen(listenPort, listenHost, function () {
            const wsServer = new WebSocketServer({server: webServer});
            wsServer.on('connection', onWsConnect);
            resolve(webServer);
        });
    });
}

// 配置 SSH 隧道的信息
const sshConfig = {
    algorithms: {
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'], // 选择较快的加密算法
    },
    compress: true, // 启用压缩
    keepaliveInterval: 10000, // 每10秒发送一次 Keep-Alive 数据
};
// 创建 TunnelManager 实例
const tunnelManager = new TunnelManager(sshConfig);

// Handle new WebSocket client
async function onWsConnect(client, request) {
    const clientAddr = client?._socket?.remoteAddress || client.url;
    const clientLog = function (...args) {
        log(' ' + clientAddr + ': ', ...args);
    };

    clientLog(
        'WebSocket connection from : ' +
        clientAddr +
        ' at URL ' +
        (request ? request.url : client.upgradeReq.url)
    );
    clientLog(
        'Version ' +
        client.protocolVersion +
        ', subprotocol: ' +
        client.protocol
    );

    // Parse the search params (the host doesn't matter):
    const reqUrl = new URL(`ws://0.0.0.0` + request.url);
    const reqTargetPort = Number(reqUrl.searchParams.get('port'));
    const reqTargetHost = reqUrl.searchParams.get('host');
    if (!reqTargetPort || !reqTargetHost) {
        clientLog('Missing host or port information');
        client.close(3000);
        return;
    }

    // eslint-disable-next-line prefer-const
    let target;
    const recvQueue = [];

    function flushMessagesQueue() {
        while (recvQueue.length > 0) {
            const msg = recvQueue.pop();
            const commandType = msg[0];
            clientLog('flushing', {commandType}, msg);
            if (commandType === COMMAND_CHUNK) {
                target.write(msg.slice(1));
            } else if (commandType === COMMAND_SET_SOCKETOPT) {
                const SOL_SOCKET = 1;
                const SO_KEEPALIVE = 9;

                const IPPROTO_TCP = 6;
                const TCP_NODELAY = 1;
                if (msg[1] === SOL_SOCKET && msg[2] === SO_KEEPALIVE) {
                    target.setKeepAlive(msg[3]);
                } else if (msg[1] === IPPROTO_TCP && msg[2] === TCP_NODELAY) {
                    target.setNoDelay(msg[3]);
                }
            } else {
                clientLog('Unknown command type: ' + commandType);
                process.exit();
            }
        }
    }

    client.on('message', function (msg) {
        // clientLog('PHP -> network buffer:', msg);
        recvQueue.unshift(msg);
        if (target) {
            flushMessagesQueue();
        }
    });
    client.on('close', function (code, reason) {
        clientLog(
            'WebSocket client disconnected: ' + code + ' [' + reason + ']'
        );
        if (target) {
            target.end();
        }
    });
    client.on('error', function (a) {
        clientLog('WebSocket client error: ' + a);
        if (target) {
            target.end();
        }
    });

    // Resolve the target host to an IP address if it isn't one already
    let reqTargetIp;
    if (net.isIP(reqTargetHost) === 0) {
        clientLog('resolving ' + reqTargetHost + '... ');
        try {
            const resolution = await lookup(reqTargetHost);
            reqTargetIp = resolution.address;
            clientLog('resolved ' + reqTargetHost + ' -> ' + reqTargetIp);
        } catch (e) {
            clientLog("can't resolve " + reqTargetHost + ' due to:', e);
            // Send empty binary data to notify requester that connection was
            // initiated
            client.send([]);
            client.close(3000);
            return;
        }
    } else {
        reqTargetIp = reqTargetHost;
    }
    clientLog(
        'Opening a socket connection to ' + reqTargetIp + ':' + reqTargetPort
    );

    try {
        // 通过 TunnelManager 获取 SSH 隧道
        const sshStream = await tunnelManager.getTunnel(reqTargetIp, reqTargetPort);
        target = sshStream;

        target.on('data', function (data) {
            try {
                client.send(data);
            } catch (e) {
                clientLog('客户端已关闭，清理目标连接');
                target.end();
            }
        });

        target.on('close', function () {
            clientLog('目标连接已断开');
            client.close();
        });

        target.on('error', function (e) {
            clientLog('目标连接错误', e);
            target.end();
            client.close(3000);
        });

        clientLog('通过共享的 SSH 隧道连接到目标');
        flushMessagesQueue();
    } catch (err) {
        clientLog('SSH 隧道错误:', err);
        client.send([]);
        client.close(3000);
    }
}
