const originalFetch = global.fetch;

global.fetch = async function(...args) {
    console.log('Fetch Request:', args);
    return originalFetch.apply(this, args);
};
