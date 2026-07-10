const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;
const titleScreen = document.getElementById('screen-title');
console.log('Inner HTML length:', titleScreen.innerHTML.length);
console.log('Buttons:', titleScreen.querySelectorAll('button').length);
const startBtn = titleScreen.querySelector('button');
if (startBtn) {
    console.log('Start Btn Text:', startBtn.textContent);
    console.log('Start Btn Classes:', startBtn.className);
}
