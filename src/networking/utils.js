import * as net from 'net';
import { logger } from '@php-wasm/logger';

export function debugLog(message, ...args) {
	if (process.env['DEV'] && !process.env['TEST']) {
		logger.log(message, ...args);
	}
}

export async function findFreePorts(n) {
	const serversPromises = [];
	for (let i = 0; i < n; i++) {
		serversPromises.push(listenOnRandomPort());
	}

	const servers = await Promise.all(serversPromises);
	const ports = [];
	for (const server of servers) {
		const address = server.address();
		ports.push(address.port);
		server.close();
	}

	return ports;
}

function listenOnRandomPort() {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.listen(0, () => {
			resolve(server);
		});
	});
}
