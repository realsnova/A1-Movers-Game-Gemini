const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";

const REGION_NAMES = {
    'animals': '新手草原',
    'food': '美食村',
    'body': '身體迷宮',
    'school': '學園城',
    'sports': '運動競技場',
    'home_family': '家園小鎮',
    'weather_world': '天氣高塔',
    'places_transport': '城市大道',
    'time_numbers': '時光神殿',
    'mixed': '冠軍之路'
};

const REGION_KEYS = Object.keys(REGION_NAMES);

const SHOP_ITEMS = [
    { id: 'hat_red', name: '探險家紅帽', price: 100, type: 'hat', icon: '🧢' },
    { id: 'hat_crown', name: '冠軍皇冠', price: 500, type: 'hat', icon: '👑' },
    { id: 'bg_night', name: '星空背景', price: 200, type: 'bg', color: '#1a1a2e' },
    { id: 'bg_gold', name: '黃金殿堂', price: 1000, type: 'bg', color: '#fff8e1' },
    { id: 'potion_hint', name: '提示藥水', price: 20, type: 'consumable', icon: '🧪', desc: '戰鬥中使用，直接消除一個錯誤選項或給予提示' }
];

let audioCtx = null;

const Game = {
    state: {
        caught: [], // { id, region, wordId, evolvedStage }
        wordStats: {}, // { wordId: { correct, wrong, nextReview, box } }
        gold: 0,
        badges: [], // ['animals', ...]
        unlockedRegions: ['animals'],
        items: [], // Includes hats, backgrounds
        consumables: { potion_hint: 0 },
        equippedHat: null,
        equippedBg: null,
        soundEnabled: true,
        lastLogin: 0,
        storySeen: []
    },

    pendingEndingStory: false,

    currentRegion: null,
    studyWords: [],
    studyIndex: 0,
    
    battleState: {
        words: [],
        currentIndex: 0,
        monster: null,
        isGym: false,
        timer: null,
        timeLeft: 20,
        gymCorrect: 0,
        spellingTarget: "",
        spellingAnswer: [],
        letterBtnsMap: {} // keep track of letter buttons for backspace
    },

    init() {
        this.loadState();
        this.applyEquipment();
        this.renderMap();
        this.updateTopBar();
        this.checkDailyLogin();
        this.updateSoundIcon();
        twemoji.parse(document.body);
    },

    loadState() {
        const saved = localStorage.getItem('A1MoversState');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state = Object.assign({}, this.state, parsed);
                if (!Array.isArray(this.state.unlockedRegions)) this.state.unlockedRegions = ['animals'];
                if (!Array.isArray(this.state.badges)) this.state.badges = [];
                if (!Array.isArray(this.state.items)) this.state.items = [];
                if (!Array.isArray(this.state.storySeen)) this.state.storySeen = [];
                if (!this.state.consumables) this.state.consumables = { potion_hint: 0 };
            } catch (e) {
                console.error("Save file corrupted, resetting.");
            }
        }
    },

    saveState() {
        localStorage.setItem('A1MoversState', JSON.stringify(this.state));
        this.updateTopBar();
    },

    resetProgress() {
        if (confirm("確定要重置所有進度嗎？金幣與寶可夢都會消失！")) {
            localStorage.removeItem('A1MoversState');
            location.reload();
        }
    },

    updateTopBar() {
        document.getElementById('stat-caught').innerText = `🔴 ${this.state.caught.length}`;
        document.getElementById('stat-words').innerText = `📖 ${Object.keys(this.state.wordStats).filter(k => this.state.wordStats[k].correct > 0).length}`;
        document.getElementById('stat-gold').innerText = `💰 ${this.state.gold}`;
        document.getElementById('stat-badges').innerText = `🎖️ ${this.state.badges.length}`;
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById('screen-' + screenId).classList.remove('hidden');
        if (screenId !== 'title' && screenId !== 'story') {
            document.getElementById('top-bar').classList.remove('hidden');
        } else {
            document.getElementById('top-bar').classList.add('hidden');
        }
        
        if (screenId === 'pokedex') this.renderPokedex();
        if (screenId === 'shop') this.renderShop();
        if (screenId === 'dashboard') this.renderDashboard();
    },

    play8BitSound(type) {
        if (!this.state.soundEnabled) return;
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // High quality DQ-style synths
        const now = audioCtx.currentTime;
        
        if (type === 'correct') {
            // Magical chime (major chord harp/bell)
            const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            freqs.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                gain.gain.setValueAtTime(0, now + (i * 0.05));
                gain.gain.linearRampToValueAtTime(0.15, now + (i * 0.05) + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.05) + 0.6);
                
                osc.start(now + (i * 0.05));
                osc.stop(now + (i * 0.05) + 1);
            });
        } else if (type === 'wrong') {
            // Sword slash / physical hit (noise burst)
            const bufferSize = audioCtx.sampleRate * 0.2; 
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1000, now);
            filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            
            noise.start(now);
        } else if (type === 'win') {
            // Level Up / Victory fanfare (brass-like synth)
            const freqs = [440, 554.37, 659.25, 880];
            freqs.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 2000;
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                
                const t = now + (i * 0.15);
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
                
                osc.start(t);
                osc.stop(t + 1);
            });
        }
    },

    preWarmAudio() {
        if (!this.state.soundEnabled) return;
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.value = 0;
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.01);
            
            const bgm = document.getElementById('bgm');
            if (bgm && bgm.paused) {
                bgm.volume = 0.3;
                bgm.play().catch(e => console.log('BGM play blocked'));
            }
        } catch (e) {}
    },

    toggleSound() {
        this.state.soundEnabled = !this.state.soundEnabled;
        this.updateSoundIcon();
        this.saveState();
        
        const bgm = document.getElementById('bgm');
        if (bgm) {
            if (this.state.soundEnabled) {
                bgm.volume = 0.3;
                bgm.play().catch(e => {});
            } else {
                bgm.pause();
            }
        }
    },

    updateSoundIcon() {
        document.getElementById('btn-sound-toggle').innerText = this.state.soundEnabled ? '🔊' : '🔇';
    },

    checkDailyLogin() {
        const today = new Date().toDateString();
        const last = new Date(this.state.lastLogin).toDateString();
        if (today !== last) {
            this.state.gold += 50;
            this.state.lastLogin = Date.now();
            this.saveState();
            alert("每日登入獎勵：獲得 50 💰！");
        }
    },

    applyEquipment() {
        if (this.state.equippedBg) {
            const bgItem = SHOP_ITEMS.find(i => i.id === this.state.equippedBg);
            if (bgItem) document.getElementById('game-container').style.backgroundColor = bgItem.color;
        } else {
            document.getElementById('game-container').style.backgroundColor = 'var(--bg-color)';
        }
    },

    // --- Story & Adventure ---
    startAdventure() {
        this.preWarmAudio();
        if (!this.state.storySeen.includes('intro')) {
            this.showScreen('intro-cinematic');
            this.playIntroSequence();
        } else {
            this.showScreen('map');
        }
        
        if (speechSynthesis.getVoices().length === 0) {
            speechSynthesis.addEventListener('voiceschanged', () => {});
        }
    },

    introInterval: null,
    playIntroSequence() {
        const textElement = document.getElementById('cinematic-text');
        const script = [
            "在古老的洛德賽特亞 (Erdrea) 大陸中心...",
            "矗立著散發著生命光輝的『單字世界樹』...",
            "傳說中，掌握了遠古語言力量的勇者...",
            "能夠喚醒沉睡在世界各地的奇幻生物...",
            "如今，黑暗的文盲之力逐漸吞噬大地...",
            "世界樹的光芒正在消退...",
            "被選召的年輕勇者啊...",
            "拿起你的語言之劍...",
            "踏上收服寶可夢的冒險吧！"
        ];
        let line = 0;
        
        const showNextLine = () => {
            if (line >= script.length) {
                this.skipIntro();
                return;
            }
            textElement.style.opacity = 0;
            setTimeout(() => {
                textElement.innerText = script[line];
                textElement.style.opacity = 1;
                line++;
            }, 1000); // Wait for fade out before changing text
        };
        
        showNextLine();
        this.introInterval = setInterval(showNextLine, 4000);
    },

    skipIntro() {
        if (this.introInterval) {
            clearInterval(this.introInterval);
            this.introInterval = null;
        }
        if (!this.state.storySeen.includes('intro')) {
            this.state.storySeen.push('intro');
            this.saveState();
        }
        this.showScreen('map');
    },

    showStory(title, text, callback) {
        document.getElementById('story-title').innerText = title;
        document.getElementById('story-text').innerText = text;
        this.showScreen('story');
        this.endStoryCallback = callback;
    },

    endStory() {
        if (this.endStoryCallback) this.endStoryCallback();
    },

    // --- Map ---
    renderMap() {
        const grid = document.getElementById('map-grid');
        grid.innerHTML = '';
        try {
            REGION_KEYS.forEach((key, index) => {
                const node = document.createElement('div');
                const isUnlocked = this.state.unlockedRegions.includes(key);
                node.className = 'map-node pixel-text ' + (isUnlocked ? 'unlocked' : '');
                
                let html = `<h3>${REGION_NAMES[key]}</h3>`;
                if (isUnlocked) {
                    html += `<span>🔓 已解鎖</span>`;
                    if (this.state.badges.includes(key)) html += `<br><span>🎖️ 已獲得徽章</span>`;
                    node.onclick = () => this.openRegionMenu(key);
                } else {
                    html += `<span>🔒 需打敗前一道館</span>`;
                    node.onclick = () => alert("請先通過前面的道館獲得徽章！");
                }
                node.innerHTML = html;
                grid.appendChild(node);
            });
        } catch (e) {
            grid.innerHTML = `<div style="color:red; background:white; padding:20px;">渲染地圖失敗: ${e.message}</div>`;
        }
    },

    openRegionMenu(regionKey) {
        this.preWarmAudio();
        this.currentRegion = regionKey;
        document.getElementById('menu-region-name').innerText = REGION_NAMES[regionKey];
        
        const caughtInRegion = this.state.caught.filter(c => c.region === regionKey).length;
        const btnGym = document.getElementById('btn-gym');
        if (caughtInRegion >= 6 || this.currentRegion === 'mixed') {
            btnGym.innerText = "🏛️ 挑戰道館";
            btnGym.style.opacity = 1;
            btnGym.disabled = false;
        } else {
            btnGym.innerText = `🏛️ 道館 (需收服 ${caughtInRegion}/6)`;
            btnGym.style.opacity = 0.5;
            btnGym.disabled = true;
        }

        this.showScreen('map'); 
        document.getElementById('screen-region-menu').classList.remove('hidden');
    },

    getWordsForRegion(regionKey) {
        if (regionKey === 'mixed') return WORDS_ALL;
        return WORDS_ALL.filter(w => w.topic === regionKey);
    },

    // --- Study ---
    startStudy() {
        let regionWords = this.getWordsForRegion(this.currentRegion);
        if (regionWords.length === 0) {
            alert("此區域沒有單字！");
            return;
        }
        regionWords.sort((a, b) => {
            let sa = this.state.wordStats[a.id] || { correct: 0, nextReview: 0 };
            let sb = this.state.wordStats[b.id] || { correct: 0, nextReview: 0 };
            if (sa.nextReview < sb.nextReview) return -1;
            if (sa.nextReview > sb.nextReview) return 1;
            return sa.correct - sb.correct;
        });
        this.studyWords = regionWords;
        this.studyIndex = 0;
        this.renderStudyCard();
        this.showScreen('study');
    },

    renderStudyCard() {
        const wordObj = this.studyWords[this.studyIndex];
        
        // Update Progress
        const progressEl = document.getElementById('study-progress-text');
        if (progressEl) {
            progressEl.innerText = `進度: ${this.studyIndex + 1}/${this.studyWords.length}`;
        }

        document.getElementById('study-emoji').innerText = wordObj.emoji || '❓';
        document.getElementById('study-word').innerText = wordObj.word;
        document.getElementById('study-zh').innerText = wordObj.zh;
        
        if (wordObj.example && wordObj.example_zh) {
            document.getElementById('study-sentence').innerHTML = `${wordObj.example}<br><small>${wordObj.example_zh}</small>`;
        } else {
            document.getElementById('study-sentence').innerHTML = '';
        }
        twemoji.parse(document.getElementById('study-emoji'));
    },

    studyNext() {
        this.studyIndex = (this.studyIndex + 1) % this.studyWords.length;
        this.renderStudyCard();
    },

    studyPrev() {
        this.studyIndex = (this.studyIndex - 1 + this.studyWords.length) % this.studyWords.length;
        this.renderStudyCard();
    },

    studyPlayAudio() {
        const wordObj = this.studyWords[this.studyIndex];
        this.playTTS(wordObj.word);
    },

    playTTS(text) {
        if (!this.state.soundEnabled) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        speechSynthesis.speak(u);
    },

    // --- Battle & Gym ---
    startBattle() {
        this.setupBattle(false);
    },

    startGym() {
        this.setupBattle(true);
    },

    setupBattle(isGym) {
        document.getElementById('screen-region-menu').classList.add('hidden');
        this.battleState.isGym = isGym;
        this.battleState.gymCorrect = 0;
        
        let pool = this.getWordsForRegion(this.currentRegion);
        let count = isGym ? (this.currentRegion === 'mixed' ? 20 : 10) : 5;
        
        if (pool.length < count) {
            alert("此區域單字數量不足，無法戰鬥！");
            return;
        }

        let shuffled = [...pool].sort(() => 0.5 - Math.random());
        this.battleState.words = shuffled.slice(0, count);
        this.battleState.currentIndex = 0;
        
        // Pick monster
        const regionMonsters = MONSTERS.regions[this.currentRegion] ? MONSTERS.regions[this.currentRegion].monsters : MONSTERS.regions['animals'].monsters;
        
        if (isGym) {
            this.battleState.monster = MONSTERS.regions[this.currentRegion]?.boss || regionMonsters[0];
        } else {
            let uncaught = regionMonsters.filter(m => !this.state.caught.some(c => c.id === m.chain[0]));
            if (uncaught.length === 0) uncaught = regionMonsters;
            this.battleState.monster = uncaught[Math.floor(Math.random() * uncaught.length)];
        }
        
        document.getElementById('battle-sprite').src = SPRITE_BASE + this.battleState.monster.chain[0] + ".png";
        
        if (isGym) {
            document.getElementById('gym-timer-container').classList.remove('hidden');
            document.getElementById('gym-timer').classList.remove('hidden');
        } else {
            document.getElementById('gym-timer-container').classList.add('hidden');
            document.getElementById('gym-timer').classList.add('hidden');
        }
        
        this.showScreen('battle');
        this.nextBattleQuestion();
    },

    nextBattleQuestion() {
        const total = this.battleState.words.length;
        if (this.battleState.currentIndex >= total) {
            this.endBattle();
            return;
        }

        // Initialize/Update Monster HP Bar
        const remaining = total - this.battleState.currentIndex;
        const pct = (remaining / total) * 100;
        const hpBar = document.getElementById('monster-hp-bar');
        if (hpBar) {
            hpBar.style.width = pct + '%';
            if (pct <= 30) {
                hpBar.style.backgroundColor = 'var(--danger)';
            } else if (pct <= 60) {
                hpBar.style.backgroundColor = '#ff9800';
            } else {
                hpBar.style.backgroundColor = '#4caf50';
            }
        }
        document.getElementById('battle-progress-text').innerText = `剩餘: ${remaining}/${total} 題`;
        
        // Check Potion availability and Enable
        const btnPotion = document.getElementById('btn-use-potion');
        btnPotion.disabled = false;
        if (this.state.consumables.potion_hint > 0) {
            btnPotion.classList.remove('hidden');
            btnPotion.innerText = `🧪 提示藥水 (剩餘: ${this.state.consumables.potion_hint})`;
        } else {
            btnPotion.classList.add('hidden');
        }

        const btnHint = document.getElementById('btn-spelling-hint');
        if (btnHint) btnHint.disabled = false;

        const wordObj = this.battleState.words[this.battleState.currentIndex];
        
        document.getElementById('battle-options').innerHTML = '';
        document.getElementById('battle-options').classList.add('hidden');
        document.getElementById('battle-spelling').classList.add('hidden');

        // Determine Type: 0=A, 1=B, 2=C, 3=D
        let type = Math.floor(Math.random() * 4);
        if (type === 3 && !wordObj.example) type = Math.floor(Math.random() * 3);
        
        if (type === 3) {
            // Smart Blanking Logic
            const wordRegex = new RegExp("\\b" + wordObj.word + "(s|es|d|ed|ing)?\\b", "gi");
            let sentence = wordObj.example.replace(wordRegex, "_____");
            
            if (sentence === wordObj.example) {
                // Try with hyphen escape
                sentence = wordObj.example.replace(new RegExp(wordObj.word.replace("-", "\\-"), "gi"), "_____");
            }

            if (sentence === wordObj.example) {
                // Blanking completely failed! Fallback to Type A or B safely.
                type = Math.floor(Math.random() * 2);
                if (type === 0) this.renderTypeA(wordObj);
                else this.renderTypeB(wordObj);
            } else {
                this.renderTypeD(wordObj, sentence);
            }
        } else {
            if (type === 0) this.renderTypeA(wordObj);
            else if (type === 1) this.renderTypeB(wordObj);
            else if (type === 2) this.renderTypeC(wordObj);
        }

        if (this.battleState.isGym) {
            this.startTimer();
        }
    },

    useHintPotion() {
        if (this.state.consumables.potion_hint > 0) {
            this.state.consumables.potion_hint--;
            this.saveState();
            const btnPotion = document.getElementById('btn-use-potion');
            btnPotion.innerText = `🧪 提示藥水 (剩餘: ${this.state.consumables.potion_hint})`;
            if (this.state.consumables.potion_hint === 0) btnPotion.classList.add('hidden');

            // Apply effect based on visible question type
            const opts = document.getElementById('battle-options').querySelectorAll('button');
            if (opts.length > 0) {
                // Type A, B, D: Eliminate one wrong answer
                const wordObj = this.battleState.words[this.battleState.currentIndex];
                let wrongBtns = Array.from(opts).filter(b => b.onclick && b.innerText !== wordObj.word && !b.classList.contains('emoji-large'));
                if (opts[0].classList.contains('emoji-large')) {
                     wrongBtns = Array.from(opts).filter(b => b.innerText !== (wordObj.emoji||'❓'));
                }
                wrongBtns = wrongBtns.filter(b => b.style.visibility !== 'hidden');
                if (wrongBtns.length > 0) {
                    wrongBtns[0].style.visibility = 'hidden';
                }
            } else if (!document.getElementById('battle-spelling').classList.contains('hidden')) {
                // Type C: Provide correct letter
                this.spellingHint(true); // Free hint
            }
        }
    },

    generateOptions(correctWord, prop, count) {
        let pool = this.getWordsForRegion(this.currentRegion);
        let opts = [correctWord];
        pool = pool.filter(w => w.id !== correctWord.id);
        pool.sort(() => 0.5 - Math.random());
        opts.push(...pool.slice(0, count - 1));
        return opts.sort(() => 0.5 - Math.random());
    },

    renderTypeA(wordObj) {
        document.getElementById('battle-question-content').innerHTML = `<div class="emoji-large">${wordObj.emoji || '❓'}</div><div style="font-size:1.2rem; margin-top:10px;">這指的是哪個單字？</div>`;
        document.getElementById('battle-options').classList.remove('hidden');
        
        const opts = this.generateOptions(wordObj, 'word', 4);
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn pixel-text';
            btn.innerText = opt.word;
            btn.onclick = () => this.checkAnswer(opt.id === wordObj.id, wordObj);
            document.getElementById('battle-options').appendChild(btn);
        });
        twemoji.parse(document.getElementById('battle-question-content'));
    },

    renderTypeB(wordObj) {
        document.getElementById('battle-question-content').innerHTML = `<div style="font-size:1.2rem; margin-bottom:10px;">聽音選圖</div><button class="big-btn" onclick="Game.playTTS('${wordObj.word}')">🔊 播放</button>`;
        document.getElementById('battle-options').classList.remove('hidden');
        
        const opts = this.generateOptions(wordObj, 'emoji', 4);
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn emoji-large';
            btn.style.fontSize = '40px';
            btn.innerText = opt.emoji || '❓';
            btn.onclick = () => this.checkAnswer(opt.id === wordObj.id, wordObj);
            document.getElementById('battle-options').appendChild(btn);
        });
        twemoji.parse(document.getElementById('battle-options'));
        this.playTTS(wordObj.word);
    },

    renderTypeC(wordObj) {
        document.getElementById('battle-question-content').innerHTML = `<div style="font-size:1.2rem;">請拼出：${wordObj.zh}</div>`;
        document.getElementById('battle-spelling').classList.remove('hidden');
        
        this.battleState.spellingTarget = wordObj.word.replace(/\s+/g, '').toLowerCase();
        this.battleState.spellingAnswer = [];
        this.battleState.letterBtnsMap = {};
        
        this.updateSpellingUI(wordObj);
    },

    updateSpellingUI(wordObj) {
        const word = wordObj ? wordObj.word.replace(/\s+/g, '').toLowerCase() : this.battleState.spellingTarget;
        document.getElementById('spelling-answer').innerText = this.battleState.spellingAnswer.join('');
        
        const lettersDiv = document.getElementById('spelling-letters');
        if (wordObj) {
            lettersDiv.innerHTML = '';
            let chars = word.split('').sort(() => 0.5 - Math.random());
            chars.forEach((c, i) => {
                const btn = document.createElement('button');
                btn.className = 'small-btn pixel-text';
                btn.style.fontSize = '1.5rem';
                btn.innerText = c;
                btn.id = 'spell-btn-' + i;
                btn.onclick = () => this.spellingClick(c, i);
                lettersDiv.appendChild(btn);
            });
        }
    },

    spellingClick(c, btnIndex) {
        this.battleState.spellingAnswer.push(c);
        this.battleState.letterBtnsMap[this.battleState.spellingAnswer.length - 1] = btnIndex; // Map answer index to btn index
        document.getElementById('spell-btn-' + btnIndex).style.visibility = 'hidden';
        document.getElementById('spelling-answer').innerText = this.battleState.spellingAnswer.join('');
        
        if (this.battleState.spellingAnswer.length === this.battleState.spellingTarget.length) {
            const isCorrect = this.battleState.spellingAnswer.join('') === this.battleState.spellingTarget;
            const wordObj = this.battleState.words[this.battleState.currentIndex];
            this.checkAnswer(isCorrect, wordObj);
        }
    },

    spellingBackspace() {
        if (this.battleState.spellingAnswer.length > 0) {
            const ansIndex = this.battleState.spellingAnswer.length - 1;
            const btnIndex = this.battleState.letterBtnsMap[ansIndex];
            this.battleState.spellingAnswer.pop();
            delete this.battleState.letterBtnsMap[ansIndex];
            
            if (btnIndex !== undefined) {
                document.getElementById('spell-btn-' + btnIndex).style.visibility = 'visible';
            }
            document.getElementById('spelling-answer').innerText = this.battleState.spellingAnswer.join('');
        }
    },

    spellingClear() {
        this.battleState.spellingAnswer = [];
        this.battleState.letterBtnsMap = {};
        const btns = document.getElementById('spelling-letters').querySelectorAll('button');
        btns.forEach(b => b.style.visibility = 'visible');
        this.updateSpellingUI();
    },

    spellingHint(free = false) {
        if (free || this.state.gold >= 5) {
            if (!free) {
                this.state.gold -= 5;
                this.updateTopBar();
            }
            
            // Get the correct character at the current length
            const targetChar = this.battleState.spellingTarget[this.battleState.spellingAnswer.length];
            if (!targetChar) return;

            // find and click the first matching char that is still visible
            const btns = Array.from(document.getElementById('spelling-letters').querySelectorAll('button'));
            const targetBtn = btns.find(b => b.innerText === targetChar && b.style.visibility !== 'hidden');
            if (targetBtn) targetBtn.click();
        } else {
            alert("金幣不足！需要 5 💰");
        }
    },

    renderTypeD(wordObj, precomputedSentence) {
        document.getElementById('battle-question-content').innerHTML = `<div style="font-size: 1.2rem; line-height:1.5;">${precomputedSentence}<br><small style="color:#666;">${wordObj.example_zh}</small></div>`;
        document.getElementById('battle-options').classList.remove('hidden');
        
        const opts = this.generateOptions(wordObj, 'word', 3);
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn pixel-text';
            btn.innerText = opt.word;
            btn.onclick = () => this.checkAnswer(opt.id === wordObj.id, wordObj);
            document.getElementById('battle-options').appendChild(btn);
        });
    },

    startTimer() {
        clearInterval(this.battleState.timer);
        this.battleState.timeLeft = 20;
        const timerBar = document.getElementById('gym-timer-bar');
        timerBar.style.width = '100%';
        timerBar.style.backgroundColor = 'var(--primary)';
        document.getElementById('gym-timer').innerText = `⏳ 20s`;
        
        this.battleState.timer = setInterval(() => {
            this.battleState.timeLeft--;
            document.getElementById('gym-timer').innerText = `⏳ ${this.battleState.timeLeft}s`;
            const pct = (this.battleState.timeLeft / 20) * 100;
            timerBar.style.width = pct + '%';
            
            if (this.battleState.timeLeft <= 5) {
                timerBar.style.backgroundColor = 'var(--danger)';
                // Optional: tick sound
                if(this.state.soundEnabled) this.play8BitSound('wrong'); 
            } else if (this.battleState.timeLeft <= 10) {
                timerBar.style.backgroundColor = '#ff9800'; // Orange
            }

            if (this.battleState.timeLeft <= 0) {
                clearInterval(this.battleState.timer);
                const wordObj = this.battleState.words[this.battleState.currentIndex];
                this.checkAnswer(false, wordObj);
            }
        }, 1000);
    },

    checkAnswer(isCorrect, wordObj) {
        clearInterval(this.battleState.timer);
        const card = document.getElementById('battle-question-box');
        const sprite = document.getElementById('battle-sprite');
        
        // Block clicks
        const opts = document.getElementById('battle-options').querySelectorAll('button');
        opts.forEach(b => b.disabled = true);
        const spellBtns = document.getElementById('spelling-letters').querySelectorAll('button');
        spellBtns.forEach(b => b.disabled = true);
        document.getElementById('btn-use-potion').disabled = true;
        const btnHint = document.getElementById('btn-spelling-hint');
        if (btnHint) btnHint.disabled = true;
        
        // Update stats
        if (!this.state.wordStats[wordObj.id]) {
            this.state.wordStats[wordObj.id] = { correct: 0, wrong: 0, nextReview: 0, box: 1 };
        }
        let stat = this.state.wordStats[wordObj.id];

        if (isCorrect) {
            card.style.backgroundColor = '#c8e6c9';
            this.play8BitSound('correct');
            if (this.battleState.isGym) this.battleState.gymCorrect++;
            
            // Monster hit animation
            sprite.style.transform = 'translate(10px, 10px)';
            setTimeout(() => sprite.style.transform = 'translate(-10px, -10px)', 100);
            setTimeout(() => sprite.style.transform = 'translate(0, 0)', 200);

            // Temporarily update HP bar early for effect
            const total = this.battleState.words.length;
            const remaining = total - (this.battleState.currentIndex + 1);
            const pct = (remaining / total) * 100;
            const hpBar = document.getElementById('monster-hp-bar');
            if (hpBar) {
                hpBar.style.width = pct + '%';
                if (pct <= 30) hpBar.style.backgroundColor = 'var(--danger)';
                else if (pct <= 60) hpBar.style.backgroundColor = '#ff9800';
            }

            stat.correct++;
            stat.box = Math.min(5, stat.box + 1);
            stat.nextReview = Date.now() + (stat.box * 86400000);
            this.checkEvolution(wordObj.id);
        } else {
            card.style.backgroundColor = '#ffcdd2';
            card.style.transform = 'translate(10px, 0)';
            setTimeout(() => card.style.transform = 'translate(-10px, 0)', 100);
            setTimeout(() => card.style.transform = 'translate(0, 0)', 200);
            this.play8BitSound('wrong');
            
            if (document.getElementById('battle-spelling').classList.contains('hidden') === false) {
                document.getElementById('spelling-answer').innerText = this.battleState.spellingTarget;
                document.getElementById('spelling-answer').style.color = 'red';
            }
            
            stat.wrong++;
            stat.box = 1;
            stat.nextReview = Date.now();
        }
        
        this.saveState();
        
        setTimeout(() => {
            card.style.backgroundColor = 'white';
            if (document.getElementById('spelling-answer')) {
                document.getElementById('spelling-answer').style.color = 'black';
            }
            this.battleState.currentIndex++;
            this.nextBattleQuestion();
        }, 1000);
    },

    checkEvolution(wordId) {
        const stat = this.state.wordStats[wordId];
        if (stat.correct >= 3) {
            const caught = this.state.caught.find(c => c.wordId === wordId);
            if (caught && caught.evolvedStage === 0) {
                const rKey = caught.region;
                if (!MONSTERS.regions[rKey]) return;
                const m = MONSTERS.regions[rKey].monsters.find(x => x.chain[0] === caught.id);
                if (m && m.chain.length > 1) {
                    caught.evolvedStage = 1;
                    caught.id = m.chain[1];
                    setTimeout(() => {
                        alert(`🌟 太棒了！與「${wordId}」連結的寶可夢進化了！\n趕快到圖鑑看看！`);
                    }, 500);
                }
            }
        }
    },

    endBattle() {
        if (this.battleState.isGym) {
            const required = this.currentRegion === 'mixed' ? 16 : 8;
            if (this.battleState.gymCorrect >= required) {
                this.triggerGymWin();
            } else {
                alert(`挑戰失敗！答對 ${this.battleState.gymCorrect} 題，需要 ${required} 題。`);
                this.showScreen('map');
            }
        } else {
            this.triggerCapture();
        }
    },

    triggerCapture() {
        this.play8BitSound('win');
        const m = this.battleState.monster;
        const wordObj = this.battleState.words[Math.floor(Math.random() * this.battleState.words.length)];
        
        if (!this.state.caught.some(c => c.id === m.chain[0] || (m.chain.length>1 && c.id === m.chain[1]))) {
            this.state.caught.push({
                id: m.chain[0],
                region: this.currentRegion,
                wordId: wordObj.id,
                evolvedStage: 0
            });
        }
        this.state.gold += 10;
        this.saveState();
        
        document.getElementById('capture-sprite').src = SPRITE_BASE + m.chain[0] + ".png";
        document.getElementById('capture-name').innerText = m.names[0].toUpperCase();
        document.getElementById('capture-title').innerText = "收服成功！";
        document.getElementById('capture-rewards').innerText = "獲得 10 💰";
        this.showScreen('capture');
    },

    triggerGymWin() {
        this.play8BitSound('win');
        if (!this.state.badges.includes(this.currentRegion)) {
            this.state.badges.push(this.currentRegion);
            this.state.gold += 100;
            
            const currIdx = REGION_KEYS.indexOf(this.currentRegion);
            if (currIdx >= 0 && currIdx < REGION_KEYS.length - 1) {
                const nextRegion = REGION_KEYS[currIdx + 1];
                if (!this.state.unlockedRegions.includes(nextRegion)) {
                    this.state.unlockedRegions.push(nextRegion);
                }
            }
            this.saveState();
        }

        document.getElementById('capture-sprite').src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
        document.getElementById('capture-name').innerText = REGION_NAMES[this.currentRegion] + " 徽章";
        document.getElementById('capture-title').innerText = "道館挑戰勝利！";
        document.getElementById('capture-rewards').innerText = "獲得 100 💰 與 徽章！";
        this.showScreen('capture');
        
        if (this.currentRegion === 'mixed' && !this.state.storySeen.includes('ending')) {
            this.pendingEndingStory = true;
        }
    },

    closeCapture() {
        if (this.pendingEndingStory) {
            this.pendingEndingStory = false;
            this.state.storySeen.push('ending');
            this.saveState();
            this.showStory("恭喜通關！", "你已經精通了所有單字，成為了真正的單字大師！\n遊戲尚未結束，你可以繼續捕捉寶可夢、購買外觀，或在道館刷新紀錄！", null);
        } else {
            this.showScreen('map');
        }
    },

    // --- Pokedex ---
    renderPokedex() {
        const grid = document.getElementById('pokedex-grid');
        grid.innerHTML = '';
        
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))';
        grid.style.gap = '16px';
        grid.style.width = '100%';
        grid.style.padding = '16px';

        let totalMonsters = 0;
        let caughtIds = this.state.caught.map(c => c.id);
        
        // Flatten all monsters to show full grid
        const allM = [];
        REGION_KEYS.forEach(k => {
            if (MONSTERS.regions[k]) {
                if (MONSTERS.regions[k].monsters) {
                    allM.push(...MONSTERS.regions[k].monsters);
                }
                if (MONSTERS.regions[k].boss) {
                    allM.push(MONSTERS.regions[k].boss);
                }
            }
        });

        // Deduplicate
        const uniqueM = [];
        allM.forEach(m => {
            const id = m.chain ? m.chain[0] : m.id;
            if (!uniqueM.find(x => (x.chain && x.chain[0] === id) || (x.id === id))) {
                uniqueM.push(m);
            }
        });

        uniqueM.forEach(m => {
            const baseId = m.chain ? m.chain[0] : m.id;
            const isCaught = this.state.caught.find(c => c.id === baseId || (m.chain && m.chain.length > 1 && c.id === m.chain[1]));
            
            const box = document.createElement('div');
            box.style.display = 'flex';
            box.style.flexDirection = 'column';
            box.style.alignItems = 'center';
            box.style.background = 'white';
            box.style.padding = '10px';
            box.style.borderRadius = '12px';
            box.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            
            let displayId = baseId;
            let imgStyle = 'width:80px; height:80px; image-rendering:pixelated;';
            let nameHtml = `<div class="pixel-text" style="color:#ccc; font-size:1rem; margin-top:8px;">???</div>`;
            
            if (isCaught) {
                displayId = isCaught.id; // Could be evolved
                const wordObj = WORDS_ALL.find(w => w.id === isCaught.wordId);
                nameHtml = `<div class="pixel-text" style="color:var(--primary); font-size:1rem; margin-top:8px;">${wordObj ? wordObj.word : '???'}</div>
                            <div style="color:#666; font-size:0.8rem;">${wordObj ? wordObj.zh : ''}</div>
                            ${isCaught.evolvedStage > 0 ? '<div style="color:gold; font-size:0.8rem;">🌟</div>' : ''}`;
            } else {
                // Silhouette
                imgStyle += ' filter: brightness(0); opacity: 0.5;';
            }

            box.innerHTML = `
                <img src="${SPRITE_BASE}${displayId}.png" style="${imgStyle}">
                ${nameHtml}
            `;
            grid.appendChild(box);
        });
    },

    // --- Shop ---
    renderShop() {
        document.getElementById('shop-gold-display').innerText = `💰 ${this.state.gold}`;
        const grid = document.getElementById('shop-items');
        grid.innerHTML = '';

        SHOP_ITEMS.forEach(item => {
            const isOwned = item.type !== 'consumable' && this.state.items.includes(item.id);
            const isEquipped = (this.state.equippedHat === item.id) || (this.state.equippedBg === item.id);
            let ownedText = isOwned ? '已擁有' : '💰 ' + item.price;
            if (item.type === 'consumable') {
                ownedText = `💰 ${item.price} (擁有: ${this.state.consumables[item.id] || 0})`;
            }
            
            const box = document.createElement('div');
            box.className = 'study-card';
            box.style.minWidth = '0';
            box.style.padding = '16px';
            
            box.innerHTML = `
                <div style="font-size: 3rem;">${item.icon ? item.icon : '🖼️'}</div>
                <h3 class="pixel-text" style="font-size:1rem; margin:8px 0;">${item.name}</h3>
                ${item.desc ? `<p style="font-size:0.8rem; color:#666; margin-bottom:8px;">${item.desc}</p>` : ''}
                <p class="pixel-text text-success" style="font-size: 0.9rem;">${ownedText}</p>
            `;
            
            const btn = document.createElement('button');
            btn.className = 'small-btn pixel-text';
            if (isEquipped) {
                btn.innerText = '已裝備';
                btn.disabled = true;
                btn.style.opacity = 0.5;
            } else if (isOwned) {
                btn.innerText = '裝備';
                btn.onclick = () => this.equipItem(item);
            } else {
                btn.innerText = '購買';
                btn.onclick = () => this.buyItem(item);
            }
            
            box.appendChild(btn);
            grid.appendChild(box);
        });
    },

    buyItem(item) {
        if (this.state.gold >= item.price) {
            this.state.gold -= item.price;
            if (item.type === 'consumable') {
                this.state.consumables[item.id] = (this.state.consumables[item.id] || 0) + 1;
            } else {
                this.state.items.push(item.id);
            }
            this.saveState();
            this.renderShop();
            alert(`成功購買 ${item.name}！`);
        } else {
            alert('金幣不足！');
        }
    },

    equipItem(item) {
        if (item.type === 'hat') this.state.equippedHat = item.id;
        if (item.type === 'bg') {
            this.state.equippedBg = item.id;
            this.applyEquipment();
        }
        this.saveState();
        this.renderShop();
    },
    
    // --- Dashboard ---
    renderDashboard() {
        const statsDiv = document.getElementById('dashboard-stats');
        let total = WORDS_ALL.length;
        let learned = Object.keys(this.state.wordStats).filter(k => this.state.wordStats[k].correct > 0).length;
        let mastered = Object.keys(this.state.wordStats).filter(k => this.state.wordStats[k].correct >= 3).length;
        
        let html = `
            <p>🎯 學習進度：${learned} / ${total} 字</p>
            <p>🌟 精通單字：${mastered} 字</p>
            <p>🏆 獲得徽章：${this.state.badges.length} / 10</p>
            <p>🎒 收服寶可夢：${this.state.caught.length}</p>
        `;
        statsDiv.innerHTML = html;
    }
};

// Initialize immediately
Game.init();
