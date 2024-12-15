import {
	initOutboundWebsocketProxyServer,
	addSocketOptionsSupportToWebSocketClass,
} from './outbound-ws-to-tcp-proxy.js';
import { addTCPServerToWebSocketServerClass } from './inbound-tcp-to-ws-proxy.js';
import { findFreePorts } from './utils.js';

export async function withNetworking(
	phpModuleArgs = {}
) {
	const [inboundProxyWsServerPort, outboundProxyWsServerPort] =
		await findFreePorts(2);

	const outboundNetworkProxyServer = await initOutboundWebsocketProxyServer(
		outboundProxyWsServerPort
	);

	return {
		...phpModuleArgs,
		outboundNetworkProxyServer,
		websocket: {
			...(phpModuleArgs['websocket'] || {}),
			url: (_, host, port) => {
				const query = new URLSearchParams({
					host,
					port,
				}).toString();
				return `ws://127.0.0.1:${outboundProxyWsServerPort}/?${query}`;
			},
			subprotocol: 'binary',
			decorator: addSocketOptionsSupportToWebSocketClass,
			serverDecorator: addTCPServerToWebSocketServerClass.bind(
				null,
				inboundProxyWsServerPort
			),
		},
	};
}