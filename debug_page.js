const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on('jsdomError', e => console.error('PAGE ERROR:', e.message));
virtualConsole.on('log', m => console.log('PAGE LOG:', m));
virtualConsole.on('error', m => console.error('PAGE CONSOLE ERROR:', m));
JSDOM.fromFile('index.html', { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole }).then(dom => {
    console.log('JSDOM loaded.');
});
