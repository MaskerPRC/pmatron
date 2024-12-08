import path from 'path';
import express from 'express';
import {loadNodeRuntime, createNodeFsMountHandler} from '@php-wasm/node';
import {
    PHP,
    PHPRequestHandler,
    setPhpIniEntries,
    proxyFileSystem
} from '@php-wasm/universal';
import {wordPressRewriteRules, getFileNotFoundActionForWordPress} from '@wp-playground/wordpress';
import {rootCertificates} from 'tls';
import compressible from 'compressible';
import compression from 'compression';

function shouldCompress( _, res ) {
    const types = res.getHeader( 'content-type' );
    const type = Array.isArray( types ) ? types[ 0 ] : types;
    return type && compressible( type );
}

// 配置环境变量
const environment = {
    php: {
        version: '8.3', // 指定 PHP 版本
    },
    server: {
        host: 'localhost',
        port: 3043,
        path: path.resolve('./phpMyAdmin'), // 文档根目录
        mount: '/phpMyAdmin', // 挂载根目录
        debug: true, // 是否启用调试
    }
};

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

const requestBodyToBytes = async (req) => {
    return await new Promise((resolve) => {
        const body = [];
        req.on('data', (chunk) => {
            body.push(chunk);
        });
        req.on('end', () => {
            resolve(Buffer.concat(body));
        });
    });
}

async function handleRequest() {
    const requestHandler = new PHPRequestHandler({
        phpFactory: async ({isPrimary, requestHandler: reqHandler}) => {
            const {php} = await getPHPInstance(isPrimary, reqHandler);
            if (!isPrimary) {
                proxyFileSystem(await requestHandler.getPrimaryPhp(), php, [
                    '/tmp',
                    requestHandler.documentRoot,
                    '/internal/shared',
                ]);
            }
            if (reqHandler) {
                php.requestHandler = reqHandler;
            }

            return php;
        },
        documentRoot: environment.server.mount,
        absoluteUrl: `http://${environment.server.host}:${environment.server.port}`,
        rewriteRules: wordPressRewriteRules,
        getFileNotFoundAction: getFileNotFoundActionForWordPress,
    });
    const php = await requestHandler.getPrimaryPhp();

    // 挂载文件系统
    php.mkdir(environment.server.mount);
    php.mount(environment.server.mount, createNodeFsMountHandler(environment.server.path));
    php.chdir(environment.server.mount);
    php.writeFile('/internal/shared/ca-bundle.crt', rootCertificates.join('\n'));

    return php;
}

((async ()=>{
    const php = await handleRequest();

    const app = express();
    app.use( compression( { filter: shouldCompress } ) );
    app.use( '/', async ( req, res ) => {
        try {
            const requestHeaders = {};
            if (req.rawHeaders && req.rawHeaders.length) {
                for (let i = 0; i < req.rawHeaders.length; i += 2) {
                    requestHeaders[req.rawHeaders[i].toLowerCase()] = req.rawHeaders[i + 1];
                }
            }

            const data = {
                url: req.url,
                headers: requestHeaders,
                method: req.method,
                body: await requestBodyToBytes(req),
            };

            const resp = await php.requestHandler.request( data );

            // 输出调试信息
            if (environment.server.debug) {
                // console.log('Request:', request);
                // console.log('Response:', responseFromPhp);
            }

            res.statusCode = resp.httpStatusCode;
            Object.keys( resp.headers ).forEach( ( key ) => {
                res.setHeader( key, resp.headers[ key ] );
            } );
            res.end( resp.bytes );
        } catch (error) {
            console.error('Error handling request:', error);
            res.statusCode = 500;
            res.end('Internal Server Error');
        }
    });

    // 启动服务器
    app.listen(environment.server.port, () => {
        console.log(`\nPHP server is listening on ${environment.server.host}:${environment.server.port}\n`);
        console.error(`Open "\x1b[33mhttp://${environment.server.host}:${environment.server.port} ${environment.server.mount}\x1b[0m" in your browser...`);
    });

})())
