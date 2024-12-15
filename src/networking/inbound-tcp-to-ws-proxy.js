import { createServer } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { debugLog } from './utils.js';
function log(...args) {
	debugLog('[TCP Server]', ...args);
}

export function addTCPServerToWebSocketServerClass(
	wsListenPort,
	WSServer
) {
	return class PHPWasmWebSocketServer extends WSServer {
		constructor(options, callback) {
			const requestedPort = options.port;
			options.port = wsListenPort;
			listenTCPToWSProxy({
				tcpListenPort: requestedPort,
				wsConnectPort: wsListenPort,
			});
			super(options, callback);
		}
	};
}

export function listenTCPToWSProxy(options) {
	options = {
		wsConnectHost: '127.0.0.1',
		...options,
	};
	const { tcpListenPort, wsConnectHost, wsConnectPort } = options;
	const server = createServer();
	server.on('connection', function handleConnection(tcpSource) {
		const inBuffer = [];

		const wsTarget = new WebSocket(
			`ws://${wsConnectHost}:${wsConnectPort}/`
		);
		wsTarget.binaryType = 'arraybuffer';
		function wsSend(data) {
			wsTarget.send(new Uint8Array(data));
		}

		wsTarget.addEventListener('open', function () {
			log('Outbound WebSocket connection established');
			while (inBuffer.length > 0) {
				wsSend(inBuffer.shift());
			}
		});
		wsTarget.addEventListener('message', (e) => {
			log(
				'WS->TCP message:',
				new TextDecoder().decode(e.data)
			);
			// @ts-ignore-next-line
			tcpSource.write(Buffer.from(e.data));
		});
		wsTarget.addEventListener('close', () => {
			log('WebSocket connection closed');
			tcpSource.end();
		});

		tcpSource.on('data', function (data) {
			log('TCP->WS message:', data);
			if (wsTarget.readyState === WebSocket.OPEN) {
				while (inBuffer.length > 0) {
					wsSend(inBuffer.shift());
				}
				wsSend(data);
			} else {
				inBuffer.push(data);
			}
		});
		tcpSource.once('close', function () {
			log('TCP connection closed');
			wsTarget.close();
		});
		tcpSource.on('error', function () {
			log('TCP connection error');
			wsTarget.close();
		});
	});
	server.listen(tcpListenPort, function () {
		log('TCP server listening');
	});
}
