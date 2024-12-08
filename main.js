import { app, BrowserWindow, protocol } from 'electron'
import  path from 'path'
import {loadNodeRuntime, createNodeFsMountHandler} from '@php-wasm/node';
import {
    PHP,
    PHPRequestHandler,
    setPhpIniEntries,
    proxyFileSystem
} from '@php-wasm/universal';
import {wordPressRewriteRules, getFileNotFoundActionForWordPress} from '@wp-playground/wordpress';

// Configuration for the PHP environment
const environment = {
    php: {
        version: '8.3',
    },
    server: {
        scheme: 'phpapp', // Custom protocol scheme
        host: 'localhost',
        path: path.resolve('./phpMyAdmin'),
        mount: '/phpMyAdmin',
        debug: true,
    }
};

// Initialize PHP instance with necessary configurations
async function getPHPInstance(isPrimary, requestHandler) {
    const id = await loadNodeRuntime(environment.php.version);
    const php = new PHP(id);
    php.requestHandler = requestHandler;

    await setPhpIniEntries(php, {
        memory_limit: '2048M',
        disable_functions: 'openssl_random_pseudo_bytes',
        allow_url_fopen: '1',
    });

    return {php, runtimeId: id};
}

// Convert request body to bytes
const requestBodyToBytes = async (request) => {
    const buffer = Buffer.from(await request.arrayBuffer());
    return buffer;
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

    // Mount filesystem
    php.mkdir(environment.server.mount);
    php.mount(environment.server.mount, createNodeFsMountHandler(environment.server.path));
    php.chdir(environment.server.mount);

    return php;
}
// Register custom protocol
protocol.registerSchemesAsPrivileged([
    { scheme: environment.server.scheme, privileges: { standard: true, secure: true } }
]);


async function createWindow() {
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Initialize PHP handler
    const php = await initializePHPHandler();

    // Register protocol handler
    protocol.handle(environment.server.scheme, async (request) => {
        try {
            // Parse request information
            const url = new URL(request.url);
            const headers = {};
            request.headers.forEach((value, key) => {
                headers[key.toLowerCase()] = value;
            });

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

            // Return response
            return new Response(response.bytes, {
                status: response.httpStatusCode,
                headers: response.headers
            });
        } catch (error) {
            console.error('Error handling request:', error);
            return new Response('Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    });

    // Load initial page
    await win.loadURL(`${environment.server.scheme}://${environment.server.host}/`);

    if (environment.server.debug) {
        win.webContents.openDevTools();
    }
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
