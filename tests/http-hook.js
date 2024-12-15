
import http from 'http'
import https from 'https'

// 保存原始的 http.request 和 https.request 方法
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;

// 重写 http.request 和 https.request 方法
http.request = function(options, callback) {
    console.log(`HTTP Request:${options.host} ${options.port} ${options.path}`, );
    return originalHttpRequest.call(http, options, callback);
};

https.request = function(options, callback) {
    console.log('HTTPS Request:', options);
    return originalHttpsRequest.call(https, options, callback);
};
