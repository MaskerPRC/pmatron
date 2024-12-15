'use strict';
import { performance, PerformanceObserver } from 'perf_hooks';

import * as dns from 'dns';
import * as util from 'node:util';
import * as net from 'net';
import * as http from 'http';
import {WebSocketServer } from 'ws';
import {debugLog} from './utils.js';
import {readFileSync} from 'fs';
import TunnelManager from "./ssh-tunnel/tunnel-manager.js";
import { logger } from '@php-wasm/logger';

function log(...args) {
    debugLog('[WS Server]', ...args);
}
// 设置 PerformanceObserver
const perfObserver = new PerformanceObserver((items) => {
    items.getEntries().forEach((entry) => {
        logger.info(`Performance Measure: ${entry.name} - ${entry.duration.toFixed(2)} ms`);
    });
    performance.clearMarks();
});
perfObserver.observe({ entryTypes: ['measure'] });

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

export function addSocketOptionsSupportToWebSocketClass(WebSocketConstructor) {
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

export function initOutboundWebsocketProxyServer(listenPort, listenHost = '127.0.0.1') {
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
const tunnelManager = new TunnelManager(sshConfig, 10); // 例如允许10个并发SSH连接

// Handle new WebSocket client
async function onWsConnect(client, request) {
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const clientAddr = client?._socket?.remoteAddress || client.url;
    const clientLog = function (...args) {
        log(`[${connectionId}] ` + clientAddr + ': ', ...args);
    };

    // 标记连接开始
    performance.mark(`${connectionId}-connection-start`);

    clientLog(
        'WebSocket 连接来自: ' +
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

    // 解析查询参数
    performance.mark(`${connectionId}-parse-params-start`);
    const reqUrl = new URL(`ws://0.0.0.0` + request.url);
    const reqTargetPort = Number(reqUrl.searchParams.get('port'));
    const reqTargetHost = reqUrl.searchParams.get('host');
    if (!reqTargetPort || !reqTargetHost) {
        clientLog('缺少主机或端口信息');
        client.close(3000);
        // 标记连接结束
        performance.mark(`${connectionId}-connection-end`);
        // 测量总连接时间
        try {
            performance.measure(`${connectionId}-total-connection`, `${connectionId}-connection-start`, `${connectionId}-connection-end`);
        } catch (e) {
            log(`[${connectionId}] Performance Measure Error:`, e.message);
        }
        return;
    }
    performance.mark(`${connectionId}-parse-params-end`);
    // 测量解析参数时间
    try {
        performance.measure(`${connectionId}-parse-params`, `${connectionId}-parse-params-start`, `${connectionId}-parse-params-end`);
    } catch (e) {
        log(`[${connectionId}] Performance Measure Error:`, e.message);
    }

    let target;

    // 简化消息处理，移除队列
    function handleMessage(msg) {
        const commandType = msg[0];
        clientLog('处理消息', { commandType }, msg);
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
            clientLog('未知的命令类型: ' + commandType);
            process.exit();
        }
    }

    client.on('message', function (msg) {
        handleMessage(msg);
    });

    client.on('close', function (code, reason) {
        clientLog(
            'WebSocket 客户端断开连接: ' + code + ' [' + reason + ']'
        );
        if (target) {
            target.end();
        }
    });

    client.on('error', function (a) {
        clientLog('WebSocket 客户端错误: ' + a);
        if (target) {
            target.end();
        }
    });

    // 解析目标主机和端口
    performance.mark(`${connectionId}-dns-lookup-start`);
    let reqTargetIp;
    if (net.isIP(reqTargetHost) === 0) {
        clientLog('正在解析 ' + reqTargetHost + '... ');
        try {
            const resolution = await lookup(reqTargetHost);
            reqTargetIp = resolution.address;
            clientLog('解析 ' + reqTargetHost + ' -> ' + reqTargetIp);
        } catch (e) {
            clientLog("无法解析 " + reqTargetHost + '，原因:', e);
            // 发送空二进制数据通知请求者连接已发起
            client.send([]);
            client.close(3000);
            // 标记连接结束
            performance.mark(`${connectionId}-connection-end`);
            // 测量总连接时间
            try {
                performance.measure(`${connectionId}-total-connection`, `${connectionId}-connection-start`, `${connectionId}-connection-end`);
            } catch (e) {
                log(`[${connectionId}] Performance Measure Error:`, e.message);
            }
            return;
        }
    } else {
        reqTargetIp = reqTargetHost;
    }
    performance.mark(`${connectionId}-dns-lookup-end`);
    // 测量 DNS 解析时间
    try {
        performance.measure(`${connectionId}-dns-lookup`, `${connectionId}-dns-lookup-start`, `${connectionId}-dns-lookup-end`);
    } catch (e) {
        log(`[${connectionId}] Performance Measure Error:`, e.message);
    }
    clientLog(
        '正在打开到 ' + reqTargetIp + ':' + reqTargetPort + ' 的连接'
    );

    try {
        performance.mark(`${connectionId}-get-tunnel-start`);
        // 通过 TunnelManager 获取 SSH 隧道
        const sshStream = await tunnelManager.getTunnel(reqTargetIp, reqTargetPort);
        target = sshStream;
        performance.mark(`${connectionId}-get-tunnel-end`);
        // 测量获取隧道时间
        try {
            performance.measure(`${connectionId}-get-tunnel`, `${connectionId}-get-tunnel-start`, `${connectionId}-get-tunnel-end`);
        } catch (e) {
            log(`[${connectionId}] Performance Measure Error:`, e.message);
        }

        // 设置事件监听器
        performance.mark(`${connectionId}-setup-events-start`);
        target.on('data', function (data) {
            performance.mark(`${connectionId}-data-received-start`);
            try {
                client.send(data);
            } catch (e) {
                clientLog('客户端已关闭，清理目标连接');
                target.end();
            }
            performance.mark(`${connectionId}-data-received-end`);
            // 测量数据接收时间
            try {
                performance.measure(`${connectionId}-data-received`, `${connectionId}-data-received-start`, `${connectionId}-data-received-end`);
            } catch (e) {
                log(`[${connectionId}] Performance Measure Error:`, e.message);
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
        performance.mark(`${connectionId}-setup-events-end`);
        // 测量设置事件监听器时间
        try {
            performance.measure(`${connectionId}-setup-events`, `${connectionId}-setup-events-start`, `${connectionId}-setup-events-end`);
        } catch (e) {
            log(`[${connectionId}] Performance Measure Error:`, e.message);
        }

        clientLog('通过共享的 SSH 隧道连接到目标');
    } catch (err) {
        clientLog('SSH 隧道错误:', err);
        client.send([]);
        client.close(3000);
    }

    // 标记连接结束
    performance.mark(`${connectionId}-connection-end`);
    // 测量总连接时间
    try {
        performance.measure(`${connectionId}-total-connection`, `${connectionId}-connection-start`, `${connectionId}-connection-end`);
    } catch (e) {
        log(`[${connectionId}] Performance Measure Error:`, e.message);
    }
}

