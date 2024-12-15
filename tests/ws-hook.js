// wsInterceptor.mjs
import WebSocket from 'ws';

// 保存原始的 WebSocket 构造函数
const OriginalWebSocket = WebSocket;

// 创建一个自定义的 WebSocket 构造函数
class InterceptedWebSocket extends OriginalWebSocket {
    constructor(address, protocols, options) {
        super(address, protocols, options);

        // 监听连接打开事件
        this.on('open', () => {
            console.log(`WebSocket连接已打开: ${address}`);
            // 您可以在这里添加自定义逻辑，如记录连接信息
        });

        // 监听消息接收事件
        this.on('message', (data) => {
            console.log(`WebSocket接收到消息: ${data}`);
            // 您可以在这里添加自定义逻辑，如处理或记录消息
        });

        // 监听连接关闭事件
        this.on('close', (code, reason) => {
            console.log(`WebSocket连接已关闭: ${address}, 代码: ${code}, 原因: ${reason}`);
            // 您可以在这里添加自定义逻辑，如清理资源
        });

        // 监听错误事件
        this.on('error', (error) => {
            console.error(`WebSocket错误: ${error}`);
            // 您可以在这里添加自定义逻辑，如错误处理
        });
    }

    // 重写 send 方法，以便在发送消息时执行自定义逻辑
    send(data, options, callback) {
        console.log(`WebSocket发送消息: ${data}`);
        // 您可以在这里修改数据或执行其他操作

        // 调用原始的 send 方法
        super.send(data, options, callback);
    }
}

// 定义一个函数来替换全局的 WebSocket
export async function hookWebSocket() {
    globalThis.WebSocket = InterceptedWebSocket;

    // 如果 ws 模块已经被导入过，则需要替换其默认导出
    try {
        const wsModule = await import('ws');
        if (wsModule.default) {
            wsModule.default = InterceptedWebSocket;
        }
    } catch (err) {
        console.warn('ws 模块尚未被导入，稍后可能需要重新拦截。');
    }
}
