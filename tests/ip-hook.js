
import net from 'net'
import dgram from 'dgram'

// 保存原始方法
const originalCreateConnection = net.createConnection;
const originalConnect = net.connect;
const originalCreateServer = net.createServer;
const originalCreateSocket = dgram.createSocket;

// 重写 net.createConnection
net.createConnection = function(...args) {
    console.log('net.createConnection called with:', args);
    return originalCreateConnection.apply(net, args);
};

// 重写 net.connect
net.connect = function(...args) {
    console.log('net.connect called with:', args);
    return originalConnect.apply(net, args);
};

// 重写 net.createServer
net.createServer = function(...args) {
    console.log('net.createServer called with:', args);
    return originalCreateServer.apply(net, args);
};

// 重写 dgram.createSocket
dgram.createSocket = function(...args) {
    console.log('dgram.createSocket called with:', args);
    const socket = originalCreateSocket.apply(dgram, args);

    // 拦截 socket 的 send 方法
    const originalSend = socket.send;
    socket.send = function(...sendArgs) {
        console.log('dgram.send called with:', sendArgs);
        return originalSend.apply(socket, sendArgs);
    };

    // 拦截 socket 的 bind 方法
    const originalBind = socket.bind;
    socket.bind = function(...bindArgs) {
        console.log('dgram.bind called with:', bindArgs);
        return originalBind.apply(socket, bindArgs);
    };

    return socket;
};
