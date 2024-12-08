
    const { contextBridge, ipcRenderer } = require('electron');
    const jQuery = require('jquery');
    
    // Make jQuery available globally
    window.jQuery = jQuery;
    window.$ = jQuery;
    
    // Add other required globals
    window.AJAX = {
        cache: true
    };
