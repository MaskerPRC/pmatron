import {app, BrowserWindow, protocol, ipcMain} from 'electron'
import path from 'path'
import fs from 'fs'
import {
    createNodeFsMountHandler,
    getPHPLoaderModule,
} from '@php-wasm/node';

import {
    withNetworking
} from './networking/with-networking.js'
import {
    PHP,
    PHPRequestHandler,
    setPhpIniEntries,
    proxyFileSystem,
    loadPHPRuntime,
} from '@php-wasm/universal';
import {wordPressRewriteRules, getFileNotFoundActionForWordPress} from '@wp-playground/wordpress';
import {rootCertificates} from 'tls';
import compressible from 'compressible';


function shouldCompress( _, res ) {
    const types = res.getHeader( 'content-type' );
    const type = Array.isArray( types ) ? types[ 0 ] : types;
    return type && compressible( type );
}

// Configuration for the PHP environment
const environment = {
    php: {
        version: '8.3',
    },
    server: {
        scheme: 'phpapp',
        host: 'localhost',
        path: path.resolve('./phpMyAdmin'),
        mount: '/phpMyAdmin',
        debug: false,
    }
};

// Create preload script content
const preloadScript = `
    const { contextBridge, ipcRenderer } = require('electron');

    contextBridge.exposeInMainWorld('api', {
        updateConfig: (credentials) => ipcRenderer.send('update-config', credentials),
        onUpdateSuccess: (callback) => ipcRenderer.on('update-config-success', callback)
    });
`;

export async function loadNodeRuntime(
    phpVersion,
    options = {}
) {
    const emscriptenOptions = {
        quit: function (code, error) {
            throw error;
        },
        ...(options.emscriptenOptions || {}),
    };
    return await loadPHPRuntime(
        await getPHPLoaderModule(phpVersion),
        await withNetworking(emscriptenOptions)
    );
}

// Initialize PHP instance with necessary configurations
async function getPHPInstance(isPrimary, requestHandler) {
    const id = await loadNodeRuntime(environment.php.version);
    const php = new PHP(id);
    php.requestHandler = requestHandler;

    await setPhpIniEntries(php, {
        memory_limit: '2048M',
        disable_functions: 'openssl_random_pseudo_bytes',
        allow_url_fopen: '1',
        'openssl.cafile': '/internal/shared/ca-bundle.crt',
    });

    return {php, runtimeId: id};
}

// Convert request body to bytes
const requestBodyToBytes = async (request) => {
    return Buffer.from(await request.arrayBuffer());
}

// Initialize PHP handler
async function initializePHPHandler() {
    const requestHandler = new PHPRequestHandler({
        phpFactory: async ({isPrimary, requestHandler: reqHandler}) => {
            const {php} = await getPHPInstance(isPrimary, reqHandler);
            if (!isPrimary) {
                proxyFileSystem(await requestHandler.getPrimaryPhp(), php, [
                    '/tmp',
                    requestHandler.documentRoot,
                ]);
            }
            if (reqHandler) {
                php.requestHandler = reqHandler;
            }
            return php;
        },
        documentRoot: environment.server.mount,
        absoluteUrl: `${environment.server.scheme}://${environment.server.host}`,
        rewriteRules: wordPressRewriteRules,
        getFileNotFoundAction: getFileNotFoundActionForWordPress,
    });

    const php = await requestHandler.getPrimaryPhp();
    php.mkdir(environment.server.mount);
    php.mount(environment.server.mount, createNodeFsMountHandler(environment.server.path));
    php.chdir(environment.server.mount);
    php.writeFile('/internal/shared/ca-bundle.crt', rootCertificates.join('\n'));


    return php;
}

// Create temporary preload script file
const preloadPath = path.resolve("./src/preload.js");
fs.writeFileSync(preloadPath, preloadScript);

// Register custom protocol
protocol.registerSchemesAsPrivileged([
    {
        scheme: environment.server.scheme,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true
        }
    }
]);
async function createWindow() {

    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: preloadPath,
            webSecurity: false, // Note: In production, consider security implications
            allowRunningInsecureContent: true
        }
    });

    // Initialize PHP handler
    const php = await initializePHPHandler();

    // Content Security Policy middleware
    const cspMiddleware = (headers) => {
        const csp = [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${environment.server.scheme}://${environment.server.host}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            `connect-src 'self' ${environment.server.scheme}://${environment.server.host}`,
        ].join('; ');

        headers['Content-Security-Policy'] = csp;
        return headers;
    };

    // Register protocol handler
    protocol.handle(environment.server.scheme, async (request) => {
        try {
            const url = new URL(request.url);
            const headers = {};
            request.headers.forEach((value, key) => {
                headers[key.toLowerCase()] = value;
            });

            // Handle static files (including JavaScript files)
            if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg')) {
                const filePath = path.join(environment.server.path, url.pathname);
                try {
                    let contentType = 'text/plain';
                    if (url.pathname.endsWith('.js')) {
                        contentType = 'application/javascript';
                    } else if (url.pathname.endsWith('.css')) {
                        contentType = 'text/css';
                    } else if (url.pathname.endsWith('.html')) {
                        contentType = 'text/html';
                        if (url.pathname.endsWith('login.html')) {
                            const content = fs.readFileSync("D:\\workplace\\electron\\pmatron\\src\\login.html");
                            return new Response(content, {
                                headers: {
                                    'Content-Type': contentType,
                                    'Access-Control-Allow-Origin': '*'
                                }
                            });
                        }
                    } else if (url.pathname.endsWith('.png')) {
                        contentType = 'image/png';
                    } else if (url.pathname.endsWith('.jpg')) {
                        contentType = 'image/jpeg';
                    }
                    const content = fs.readFileSync(filePath);
                    return new Response(content, {
                        headers: {
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                } catch (err) {
                    console.error('Static file error:', err);
                }
            }

            // Prepare request data for PHP
            const requestData = {
                url: url.pathname + url.search,
                headers: headers,
                method: request.method,
                body: await requestBodyToBytes(request),
            };

            // Process request through PHP handler
            const response = await php.requestHandler.request(requestData);

            if (environment.server.debug) {
                console.log('Request:', {
                    url: url.toString(),
                    method: request.method,
                    headers: headers
                });
                console.log('Response:', {
                    status: response.httpStatusCode,
                    headers: response.headers
                });
            }

            // Apply security headers and return response
            const finalHeaders = cspMiddleware({...response.headers});
            return new Response(response.bytes, {
                status: response.httpStatusCode,
                headers: finalHeaders
            });
        } catch (error) {
            console.error('Error handling request:', error);
            return new Response('Internal Server Error', {
                status: 500,
                headers: {'Content-Type': 'text/plain'}
            });
        }
    });

    // Load initial page
    await win.loadURL(`${environment.server.scheme}://${environment.server.host}/login.html`);

    if (environment.server.debug) {
    }
    win.webContents.openDevTools();

    // Cleanup preload script on window close
    win.on('closed', () => {
        try {
            fs.unlinkSync(preloadPath);
        } catch (err) {
            console.error('Error cleaning up preload script:', err);
        }
    });

    // 监听来自渲染进程的更新配置请求
    ipcMain.on('update-config', (event, { hostname, username, password }) => {
        try {
            const configFilePath = path.join(environment.server.path, 'config.inc.php');
            let configContent = fs.readFileSync(configFilePath, 'utf-8');

            configContent = configContent.replace(/\$cfg\['Servers'\]\[\$i\]\['host'\] = '.*?';/, `$cfg['Servers'][$i]['host'] = '${hostname}';`);
            configContent = configContent.replace(/\$cfg\['Servers'\]\[\$i\]\['user'\] = '.*?';/, `$cfg['Servers'][$i]['user'] = '${username}';`);
            configContent = configContent.replace(/\$cfg\['Servers'\]\[\$i\]\['password'\] = '.*?';/, `$cfg['Servers'][$i]['password'] = '${password}';`);

            fs.writeFileSync(configFilePath, configContent, 'utf-8');

            // 通知渲染进程更新成功
            event.sender.send('update-config-success');

            // 更新完成后跳转至根页面
            win.loadURL(`${environment.server.scheme}://${environment.server.host}/`);
        } catch (err) {
            console.error('Error updating config:', err);
            // 可根据需要通知页面更新失败
        }
    });
}

app.whenReady().then(async () => {
    await createWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

