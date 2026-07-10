const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('³æ¦r«_ÀI_Gemini.html', 'utf-8');
const virtualConsole = new JSDOM('').window.console;
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'file:///C:/Users/Snova/Documents/Antigravity/Snova/Cambridge_A1_mover/%E5%96%AE%E5%AD%97%E5%86%92%E9%9A%AA_Gemini.html', virtualConsole });
console.log('Local version loaded without syntax error.');
