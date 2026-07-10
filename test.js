const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
window.onload = () => {
    try {
        if(window.Game) {
            console.log("Game object initialized!");
            console.log("TTS English support:", window.Game.hasTTSEnglish);
            console.log("Start speech method exists:", typeof window.Game.startSpeechRecognition === 'function');
            // Try to invoke renderTypeB to see if it generates HTML correctly
            const mockWord = { id: "test", word: "apple", emoji: "??", zh: "Ä«ªG" };
            window.Game.battleState = { words: [mockWord], currentIndex: 0 };
            window.Game.renderTypeB(mockWord);
            console.log("Battle content HTML generated:", window.document.getElementById('battle-question-content').innerHTML.includes('mic-btn'));
            console.log("All tests passed!");
        } else {
            console.error("Game object NOT FOUND. There might be a syntax error in main.js");
        }
    } catch(e) {
        console.error("Error during test:", e);
    }
};
