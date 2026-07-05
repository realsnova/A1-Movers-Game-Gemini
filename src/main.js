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
        caught: [], // { id, region, words: [wordId...], evolvedStage: 0 }
        wordStats: {}, // { wordId: { correct, wrong, box, lastSeen, correctDays } }
        gold: 0,
        badges: [], // ['animals', ...]
        unlockedRegions: ['animals'],
        items: [],
        consumables: { potion_hint: 0 },
        equippedHat: null,
        equippedBg: null,
        soundEnabled: true,
        lastLogin: "",       // "YYYY-MM-DD" 格式
        streak: 0,           // 連續登入天數
        shinyCaught: [],     // 異色寶可夢 id
        shinyNextBattle: false, // 下場野戰是否遇異色
        storySeen: [],
        saveVersion: 5
    },

    pendingEndingStory: false,
    pendingEvolutions: [], // 進化佇列
    hasTTSEnglish: true,   // TTS 英文語音是否可用

    currentRegion: null,
    studyWords: [],
    studyIndex: 0,
    
    battleState: {
        words: [],
        currentIndex: 0,
        monster: null,
        isGym: false,
        isShiny: false,
        timer: null,
        timeLeft: 20,
        gymCorrect: 0,
        spellingTarget: "",
        spellingAnswer: [],
        letterBtnsMap: {},
        answering: false // 防狂點鎖定
    },

    init() {
        this.loadState();
        this.migrateState();
        this.applyEquipment();
        this.renderMap();
        this.updateTopBar();
        this.updateSoundIcon();
        this.detectTTS();
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
                if (!Array.isArray(this.state.shinyCaught)) this.state.shinyCaught = [];
                if (typeof this.state.streak !== 'number') this.state.streak = 0;
            } catch (e) {
                console.error("存檔損壞，備份後重置。");
                localStorage.setItem('A1MoversState_backup', saved);
                // 重置 state 回預設值（已由宣告時初始化）
            }
        }
    },

    // 存檔遷移：補齊舊版存檔缺少的欄位
    migrateState() {
        // 遷移 wordStats：補齊 box/lastSeen/correctDays，移除舊的 nextReview
        Object.keys(this.state.wordStats).forEach(id => {
            const s = this.state.wordStats[id];
            if (typeof s.box !== 'number') s.box = 1;
            if (s.box > 3) s.box = 3; // 從舊版 max=5 降回 max=3
            if (!s.lastSeen) s.lastSeen = "";
            if (!Array.isArray(s.correctDays)) s.correctDays = [];
            delete s.nextReview; // 移除舊的時間戳欄位
        });
        // 遷移 caught：從 wordId 單字綁定轉為 words 多字綁定
        this.state.caught.forEach(c => {
            if (!Array.isArray(c.words)) {
                c.words = c.wordId ? [c.wordId] : [];
                delete c.wordId;
            }
            if (typeof c.evolvedStage !== 'number') c.evolvedStage = 0;
        });
        // 遷移 lastLogin：從舊的 timestamp 轉為日期字串
        if (typeof this.state.lastLogin === 'number' && this.state.lastLogin > 0) {
            const d = new Date(this.state.lastLogin);
            this.state.lastLogin = d.toISOString().slice(0, 10);
        }
        this.saveState();
    },

    saveState() {
        this.state.saveVersion = 5;
        localStorage.setItem('A1MoversState', JSON.stringify(this.state));
        this.updateTopBar();
    },

    resetProgress() {
        if (confirm('確定要重置所有進度嗎？這將會清除所有已解鎖的徽章與收集到的寶可夢，且無法復原！\n(如果您想保留進度，請先點擊「備份進度」)')) {
            localStorage.removeItem('A1MoversState');
            window.location.reload();
        }
    },

    downloadSaveFile() {
        const dataStr = JSON.stringify(this.state, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `A1_Movers_Save_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("進度已成功備份下載！請妥善保存該檔案。");
    },

    handleSaveFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedState = JSON.parse(e.target.result);
                if (importedState && typeof importedState === 'object') {
                    if (confirm('確定要讀取此進度檔嗎？目前的進度將會被覆蓋！')) {
                        localStorage.setItem('A1MoversState', JSON.stringify(importedState));
                        alert('讀取成功！遊戲即將重新載入。');
                        window.location.reload();
                    }
                } else {
                    alert('無效的存檔格式！');
                }
            } catch (err) {
                alert('讀取失敗，存檔可能已損毀！');
                console.error(err);
            }
        };
        reader.readAsText(file);
        // Reset input
        event.target.value = '';
    },

    replayIntro() {
        this.state.storySeen = [];
        this.saveState();
        location.reload();
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
        if (screenId !== 'title' && screenId !== 'story' && screenId !== 'intro-cinematic') {
            document.getElementById('top-bar').classList.remove('hidden');
        } else {
            document.getElementById('top-bar').classList.add('hidden');
        }
        
        if (screenId === 'pokedex') this.renderPokedex();
        if (screenId === 'shop') this.renderShop();
        if (screenId === 'dashboard') this.renderDashboard();
        // 進入地圖時檢查每日登入與進化
        if (screenId === 'map') {
            this.renderMap();
            this.checkDailyLogin();
            this.checkAllEvolutions();
        }
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
            
            // 移除這裡自動播放 BGM 的邏輯，避免在不需要 BGM 的主頁/地圖也播音樂
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

    // TTS 英文語音偵測
    detectTTS() {
        const checkVoices = () => {
            const voices = speechSynthesis.getVoices();
            this.hasTTSEnglish = voices.some(v => v.lang.startsWith('en'));
            // 若無英文語音，禁用發音按鈕
            if (!this.hasTTSEnglish) {
                document.querySelectorAll('[onclick*="studyPlayAudio"]').forEach(b => {
                    b.style.opacity = 0.4;
                    b.title = '此裝置無英文語音';
                });
            }
        };
        if (speechSynthesis.getVoices().length > 0) {
            checkVoices();
        } else {
            speechSynthesis.addEventListener('voiceschanged', checkVoices, { once: true });
        }
    },

    // === 每日登入獎勵（Phase 3）===
    checkDailyLogin() {
        const today = this.SRS.today();
        if (this.state.lastLogin === today) return; // 今天已領過
        
        // 計算連續登入
        if (this.state.lastLogin) {
            const lastDate = new Date(this.state.lastLogin);
            const todayDate = new Date(today);
            const diffDays = Math.round((todayDate - lastDate) / 86400000);
            if (diffDays === 1) {
                this.state.streak++;
            } else {
                this.state.streak = 1;
            }
        } else {
            this.state.streak = 1;
        }
        
        this.state.gold += 10;
        // 連續 3 天以上：下場野戰必遇異色
        if (this.state.streak >= 3) {
            this.state.shinyNextBattle = true;
        }
        this.state.lastLogin = today;
        this.saveState();
        
        // 顯示每日獎勵彈窗
        this.showDailyRewardPopup();
    },

    showDailyRewardPopup() {
        const popup = document.getElementById('screen-daily-reward');
        if (!popup) return;
        document.getElementById('daily-reward-streak').innerText = `🔥 連續登入 ${this.state.streak} 天`;
        document.getElementById('daily-reward-gold').innerText = '+10 💰';
        const shinyMsg = document.getElementById('daily-reward-shiny');
        if (this.state.streak >= 3) {
            shinyMsg.innerText = '✨ 下場野戰將遇到異色寶可夢！';
            shinyMsg.classList.remove('hidden');
        } else {
            shinyMsg.classList.add('hidden');
        }
        popup.classList.remove('hidden');
    },

    closeDailyReward() {
        document.getElementById('screen-daily-reward').classList.add('hidden');
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
            this.isReplayingIntro = false;
            this.showScreen('intro-cinematic');
            this.playIntroSequence();
        } else {
            this.showScreen('map');
        }
        
        if (speechSynthesis.getVoices().length === 0) {
            speechSynthesis.addEventListener('voiceschanged', () => {});
        }
    },

    isReplayingIntro: false,
    replayIntro() {
        this.preWarmAudio();
        this.isReplayingIntro = true;
        this.showScreen('intro-cinematic');
        this.playIntroSequence();
    },

    introInterval: null,
    playIntroSequence() {
        const textElement = document.getElementById('cinematic-text');
        const container = document.getElementById('screen-intro-cinematic');
        
        // 確保 BGM 從頭開始播放 (因為之前可能被暫停了)
        const bgm = document.getElementById('bgm');
        if (bgm && this.state.soundEnabled) {
            bgm.currentTime = 0;
            bgm.volume = 0.4;
            bgm.play().catch(e => {});
        }
        
        // 12 個場景的圖與文案 (與 INTRO_IMAGES 陣列對應: 0~11)
        // 播放速度放慢三倍：每句停留 6 秒 (1秒fade-out, 5秒顯示)，總長約 72 秒
        const script = [
            { text: "在古老的洛德賽特亞 (Erdrea) 大陸中心...", scene: 0 },
            { text: "矗立著散發生命光輝的『單字世界樹』...", scene: 1 },
            { text: "傳說中，名為「卡比獸」的巨型精靈總是在樹下安詳地沉睡著...", scene: 2 },
            
            { text: "然而，名為「文盲」的黑暗之力突然籠罩天空...", scene: 3 },
            { text: "狂風驟雨襲來，知識的光芒正一點一滴地消退...", scene: 4 },
            { text: "曾經快樂的「皮卡丘」與「伊布」驚恐地望著變異的天空...", scene: 5 },
            
            { text: "失去語言力量保護的守護精靈們...", scene: 6 },
            { text: "就連強大的「噴火龍」也抵擋不住這股黑暗的侵蝕...", scene: 7 },
            { text: "最終紛紛被封印成了冰冷的石板卡片...", scene: 8 },
            
            { text: "直到，被選召的年輕勇者來到了這個世界...", scene: 9 },
            { text: "身旁跟著帥氣的「路卡利歐」，拔出了那把發光的語言之劍...", scene: 10 },
            { text: "踏上解救寶可夢的史詩冒險吧！", scene: 11 }
        ];
        let line = 0;
        
        // 初始第一張圖
        if (typeof INTRO_IMAGES !== 'undefined' && INTRO_IMAGES[0]) {
            container.style.backgroundImage = `url('${INTRO_IMAGES[0]}')`;
        }
        
        const showNextLine = () => {
            if (line >= script.length) {
                // 等待最後一句播完，給一點時間讓結尾 BGM 放完再切
                setTimeout(() => this.skipIntro(), 4000);
                return;
            }
            textElement.style.opacity = 0;
            setTimeout(() => {
                const currentData = script[line];
                textElement.innerText = currentData.text;
                
                // 切換背景圖
                if (typeof INTRO_IMAGES !== 'undefined' && INTRO_IMAGES[currentData.scene]) {
                    container.style.backgroundImage = `url('${INTRO_IMAGES[currentData.scene]}')`;
                }
                
                textElement.style.opacity = 1;
                line++;
            }, 1000); // 配合變慢的節奏，Fade-out wait 改為 1000ms
        };
        
        showNextLine();
        this.introInterval = setInterval(showNextLine, 6000); // 放慢三倍：6 秒換一句
    },

    skipIntro() {
        if (this.introInterval) {
            clearInterval(this.introInterval);
            this.introInterval = null;
        }
        const layer = document.getElementById('intro-sprites-layer');
        if (layer) layer.innerHTML = ''; // Clear sprites
        
        // BUG4 修復：開場 BGM 在劇情結束後停止播放
        const bgm = document.getElementById('bgm');
        if (bgm) {
            // 平滑淡出 (Fade out) 而非直接切斷
            let vol = bgm.volume;
            const fade = setInterval(() => {
                if (vol > 0.05) {
                    vol -= 0.05;
                    bgm.volume = vol;
                } else {
                    clearInterval(fade);
                    bgm.pause();
                    bgm.currentTime = 0;
                }
            }, 100);
        }
        if (!this.state.storySeen.includes('intro')) {
            this.state.storySeen.push('intro');
            this.saveState();
        }
        
        if (this.isReplayingIntro) {
            this.showScreen('title');
        } else {
            this.showScreen('map');
        }
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
        
        const btnGym = document.getElementById('btn-gym');
        
        if (regionKey === 'mixed') {
            document.getElementById('mixed-chapters').classList.remove('hidden');
            const allMixedWords = WORDS_ALL.filter(w => w.topic === 'mixed');
            const ch1 = allMixedWords.slice(0, 42).filter(w => (this.state.wordStats[w.id]?.correct || 0) > 0).length;
            const ch2 = allMixedWords.slice(42, 84).filter(w => (this.state.wordStats[w.id]?.correct || 0) > 0).length;
            const ch3 = allMixedWords.slice(84).filter(w => (this.state.wordStats[w.id]?.correct || 0) > 0).length;
            const gymUnlocked = (ch1 >= 30 && ch2 >= 30 && ch3 >= 30);
            if (gymUnlocked) {
                btnGym.innerText = '🏛️ 挑戰超夢道館';
                btnGym.style.opacity = 1;
                btnGym.disabled = false;
            } else {
                btnGym.innerText = `🔒 道館 (每章需答對30字, 目前:${ch1},${ch2},${ch3})`;
                btnGym.style.opacity = 0.5;
                btnGym.disabled = true;
            }
        } else {
            document.getElementById('mixed-chapters').classList.add('hidden');
            const caughtInRegion = this.state.caught.filter(c => c.region === regionKey).length;
            if (caughtInRegion >= 6) {
                btnGym.innerText = "🏛️ 挑戰道館";
                btnGym.style.opacity = 1;
                btnGym.disabled = false;
            } else {
                btnGym.innerText = `🏛️ 道館 (需收服 ${caughtInRegion}/6)`;
                btnGym.style.opacity = 0.5;
                btnGym.disabled = true;
            }
        }

        this.showScreen('map'); 
        document.getElementById('screen-region-menu').classList.remove('hidden');
    },

    getWordsForRegion(regionKey) {
        if (regionKey === 'mixed') {
            const words = WORDS_ALL.filter(w => w.topic === regionKey);
            const chSelect = document.getElementById('mixed-chapter-select');
            const ch = parseInt(chSelect ? chSelect.value : "1") || 1;
            if (ch === 1) return words.slice(0, 42);
            if (ch === 2) return words.slice(42, 84);
            return words.slice(84);
        }
        return WORDS_ALL.filter(w => w.topic === regionKey);
    },

    // === SRS 間隔重複系統（Leitner 3 盒）===
    SRS: {
        today() {
            const d = new Date();
            const tzOffset = d.getTimezoneOffset() * 60000;
            return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
        },
        grade(state, id, isCorrect) {
            if (!state.wordStats[id]) {
                state.wordStats[id] = { correct: 0, wrong: 0, box: 1, lastSeen: "", correctDays: [] };
            }
            const s = state.wordStats[id];
            const today = this.today();
            s.lastSeen = today;
            if (isCorrect) {
                s.correct++;
                s.box = Math.min(3, s.box + 1);
                if (!s.correctDays.includes(today)) {
                    s.correctDays.push(today);
                    if (s.correctDays.length > 5) s.correctDays = s.correctDays.slice(-5);
                }
            } else {
                s.wrong++;
                s.box = 1;
            }
        },
        isDue(state, id) {
            const s = state.wordStats[id];
            if (!s) return true; // 新字
            if (s.box === 1) return true;
            if (!s.lastSeen) return true;
            const today = new Date(this.today());
            const last = new Date(s.lastSeen);
            const diffDays = Math.round((today - last) / 86400000);
            if (s.box === 2) return diffDays >= 1;
            if (s.box === 3) return diffDays >= 3;
            return true;
        },
        buildQuiz(state, regionWords, n) {
            // 智慧組卷：錯題優先 → 新字 → 到期複習 → 最少答對
            const result = [];
            const used = new Set();
            const pick = (arr, max) => {
                let count = 0;
                for (const w of arr) {
                    if (result.length >= n || count >= max) break;
                    if (used.has(w.id)) continue;
                    result.push(w);
                    used.add(w.id);
                    count++;
                }
            };
            // 1. 錯題（box=1 且 wrong > correct）
            const wrongWords = regionWords.filter(w => {
                const s = state.wordStats[w.id];
                return s && s.box === 1 && s.wrong > s.correct;
            }).sort((a, b) => (state.wordStats[b.id].wrong - state.wordStats[b.id].correct) - (state.wordStats[a.id].wrong - state.wordStats[a.id].correct));
            pick(wrongWords, 2);
            // 2. 新字（correct = 0）
            const newWords = regionWords.filter(w => {
                const s = state.wordStats[w.id];
                return !s || s.correct === 0;
            }).sort(() => 0.5 - Math.random());
            pick(newWords, 3);
            // 3. 到期複習字
            const dueWords = regionWords.filter(w => {
                const s = state.wordStats[w.id];
                return s && s.correct > 0 && this.isDue(state, w.id);
            }).sort(() => 0.5 - Math.random());
            pick(dueWords, n);
            // 4. 不足時補答對次數最少的
            if (result.length < n) {
                const remaining = regionWords.filter(w => !used.has(w.id))
                    .sort((a, b) => ((state.wordStats[a.id]?.correct || 0) - (state.wordStats[b.id]?.correct || 0)));
                pick(remaining, n);
            }
            return result.sort(() => 0.5 - Math.random());
        }
    },

    // --- Study ---
    startStudy() {
        let regionWords = this.getWordsForRegion(this.currentRegion);
        if (regionWords.length === 0) {
            alert("此區域沒有單字！");
            return;
        }
        // 排序：新字與到期字優先
        regionWords.sort((a, b) => {
            let sa = this.state.wordStats[a.id];
            let sb = this.state.wordStats[b.id];
            let pa = sa ? sa.box : 0;
            let pb = sb ? sb.box : 0;
            return pa - pb;
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
        
        if (wordObj.sentence && wordObj.sentence_zh) {
            document.getElementById('study-sentence').innerHTML = `${wordObj.sentence}<br><small>${wordObj.sentence_zh}</small>`;
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
        if (!this.state.soundEnabled || !this.hasTTSEnglish) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 0.85;
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
        this.battleState.answering = false;
        
        let pool = this.getWordsForRegion(this.currentRegion);
        let count = isGym ? (this.currentRegion === 'mixed' ? 20 : 10) : 5;
        
        if (pool.length < count) {
            alert("此區域單字數量不足，無法戰鬥！");
            return;
        }

        // 使用 SRS 智慧組卷（野戰），道館仍為隨機
        if (isGym) {
            let shuffled = [...pool].sort(() => 0.5 - Math.random());
            this.battleState.words = shuffled.slice(0, count);
        } else {
            this.battleState.words = this.SRS.buildQuiz(this.state, pool, count);
        }
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
        
        // 異色寶可夢處理
        this.battleState.isShiny = false;
        let spriteId = this.battleState.monster.chain[0];
        if (!isGym && this.state.shinyNextBattle) {
            this.battleState.isShiny = true;
            this.state.shinyNextBattle = false;
            this.saveState();
            document.getElementById('battle-sprite').src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${spriteId}.png`;
        } else {
            document.getElementById('battle-sprite').src = SPRITE_BASE + spriteId + ".png";
        }
        // sprite 載入失敗 fallback
        document.getElementById('battle-sprite').onerror = function() { this.style.display='none'; this.parentElement.innerText='👾'; };
        
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

        // === Phase 4 題型智慧過濾 ===
        // 判斷各題型是否可用
        const canSpell = /^[a-z]{3,8}$/.test(wordObj.word); // 拼字題：僅限純小寫 3-8 字母
        const hasEmoji = !!wordObj.emoji;
        const poolEmoji = this.getWordsForRegion(this.currentRegion).filter(w => w.id !== wordObj.id && w.emoji);
        const canListen = this.hasTTSEnglish && hasEmoji && poolEmoji.length >= 2; // 聽音題：需要 emoji 與 TTS
        const canFill = !!wordObj.sentence; // 填空題：需要例句

        // 建立可用題型列表
        let availableTypes = [0]; // A 看圖選字永遠可用
        if (canListen) availableTypes.push(1);
        if (canSpell) availableTypes.push(2);
        if (canFill) availableTypes.push(3);
        
        let type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        if (type === 3) {
            // Smart Blanking Logic（使用正確欄位 sentence）
            const escapedWord = wordObj.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const wordRegex = new RegExp("\\b" + escapedWord + "(s|es|d|ed|ing)?\\b", "gi");
            let sentence = wordObj.sentence.replace(wordRegex, "_____$1"); // 修正：保留字尾變化
            
            if (sentence === wordObj.sentence) {
                // 多字詞整詞挖空
                sentence = wordObj.sentence.replace(new RegExp(escapedWord, "gi"), "_____");
            }

            if (sentence === wordObj.sentence) {
                // 挖空失敗，降級為看圖選字
                this.renderTypeA(wordObj);
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
                // Type A, B, D: Eliminate one wrong answer (依靠 dataset.id)
                const wordObj = this.battleState.words[this.battleState.currentIndex];
                let wrongBtns = Array.from(opts).filter(b => b.dataset.id && b.dataset.id !== wordObj.id && b.style.visibility !== 'hidden');
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
        let opts = [correctWord];
        let pool = this.getWordsForRegion(this.currentRegion);
        
        if (correctWord.distractors && correctWord.distractors.length > 0) {
            let dWords = [];
            for (let d of correctWord.distractors) {
                let found = WORDS_ALL.find(w => w.word === d);
                if (found) dWords.push(found);
            }
            if (prop === 'emoji') dWords = dWords.filter(w => w.emoji);
            dWords = dWords.filter(w => w.id !== correctWord.id);
            dWords.sort(() => 0.5 - Math.random());
            opts.push(...dWords.slice(0, count - 1));
        }
        
        if (opts.length < count) {
            if (prop === 'emoji') pool = pool.filter(w => w.emoji);
            pool = pool.filter(w => !opts.some(o => o.id === w.id));
            pool.sort(() => 0.5 - Math.random());
            opts.push(...pool.slice(0, count - opts.length));
        }
        
        return opts.sort(() => 0.5 - Math.random());
    },

    renderTypeA(wordObj) {
        // 無 emoji 時顯示中文字卡
        const displayContent = wordObj.emoji 
            ? `<div class="emoji-large">${wordObj.emoji}</div>` 
            : `<div style="font-size:2.5rem; background:#fff; padding:20px; border-radius:12px; border:3px solid var(--primary); color:#333;">${wordObj.zh}</div>`;
        document.getElementById('battle-question-content').innerHTML = `${displayContent}<div style="font-size:1.2rem; margin-top:10px;">這指的是哪個單字？</div>`;
        document.getElementById('battle-options').classList.remove('hidden');
        
        const opts = this.generateOptions(wordObj, 'word', 4);
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn pixel-text';
            btn.dataset.id = opt.id;
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
            btn.dataset.id = opt.id;
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
        document.getElementById('battle-question-content').innerHTML = `<div style="font-size: 1.2rem; line-height:1.5;">${precomputedSentence}<br><small style="color:#666;">${wordObj.sentence_zh}</small></div>`;
        document.getElementById('battle-options').classList.remove('hidden');
        
        const opts = this.generateOptions(wordObj, 'word', 3);
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn pixel-text';
            btn.dataset.id = opt.id;
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
        // 防狂點鎖定
        if (this.battleState.answering) return;
        this.battleState.answering = true;
        
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
        
        // 使用 SRS 系統更新單字狀態
        this.SRS.grade(this.state, wordObj.id, isCorrect);

        if (isCorrect) {
            card.style.backgroundColor = 'transparent'; // Let glassmorphism shine
            document.getElementById('game-container').classList.add('correct-flash');
            setTimeout(() => document.getElementById('game-container').classList.remove('correct-flash'), 600);
            
            this.play8BitSound('correct');
            this.playTTS(wordObj.word); // 答對自動朗讀
            if (this.battleState.isGym) this.battleState.gymCorrect++;
            
            // Monster hit animation
            sprite.style.transform = 'translate(10px, 10px) scale(0.9)';
            setTimeout(() => sprite.style.transform = 'translate(-10px, -10px) scale(1.05)', 100);
            setTimeout(() => sprite.style.transform = 'translate(0, 0) scale(1)', 200);

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
        } else {
            card.style.backgroundColor = 'transparent';
            document.getElementById('game-container').classList.add('shake');
            setTimeout(() => document.getElementById('game-container').classList.remove('shake'), 600);
            
            this.play8BitSound('wrong');
            
            if (document.getElementById('battle-spelling').classList.contains('hidden') === false) {
                document.getElementById('spelling-answer').innerText = this.battleState.spellingTarget;
                document.getElementById('spelling-answer').style.color = 'var(--danger)';
            }
        }
        
        this.state.gold += isCorrect ? 2 : 0;
        this.saveState();
        
        setTimeout(() => {
            if (document.getElementById('spelling-answer')) {
                document.getElementById('spelling-answer').style.color = 'var(--text-color)';
            }
            this.battleState.answering = false;
            this.battleState.currentIndex++;
            this.nextBattleQuestion();
        }, 1200); // 稍微延長一點時間讓特效跑完
    },

    // === 進化系統（Phase 3 重寫）===
    // 檢查所有已收服寶可夢的進化條件
    checkAllEvolutions() {
        this.pendingEvolutions = [];
        this.state.caught.forEach(c => {
            if (!c.words || c.words.length === 0) return;
            const rKey = c.region;
            if (!MONSTERS.regions[rKey]) return;
            const allMonsters = MONSTERS.regions[rKey].monsters;
            // 找到 chain 中包含此 caught.id 的怪獸資料
            const m = allMonsters.find(x => x.chain && x.chain.includes(c.id));
            if (!m) return;
            const baseId = m.chain[0];
            
            // Stage 0→1：所有綁定單字 box ≥ 2
            if (c.evolvedStage === 0 && m.chain.length > 1) {
                const allBox2 = c.words.every(wid => {
                    const s = this.state.wordStats[wid];
                    return s && s.box >= 2;
                });
                if (allBox2) {
                    this.pendingEvolutions.push({
                        caught: c, monster: m,
                        fromId: c.id, toId: m.chain[1],
                        fromName: m.names[0], toName: m.names[1] || m.names[0],
                        newStage: 1
                    });
                }
            }
            // Stage 1→2：所有綁定單字 correctDays.length ≥ 3
            if (c.evolvedStage === 1 && m.chain.length > 2) {
                const allDays3 = c.words.every(wid => {
                    const s = this.state.wordStats[wid];
                    return s && s.correctDays && s.correctDays.length >= 3;
                });
                if (allDays3) {
                    this.pendingEvolutions.push({
                        caught: c, monster: m,
                        fromId: c.id, toId: m.chain[2],
                        fromName: m.names[1] || m.names[0], toName: m.names[2] || m.names[1],
                        newStage: 2
                    });
                }
            }
        });
        // 逐一播放進化動畫
        if (this.pendingEvolutions.length > 0) {
            this.playNextEvolution();
        }
    },

    playNextEvolution() {
        if (this.pendingEvolutions.length === 0) return;
        const evo = this.pendingEvolutions.shift();
        
        // 更新資料
        evo.caught.evolvedStage = evo.newStage;
        evo.caught.id = evo.toId;
        this.saveState();
        
        // 顯示進化動畫 overlay
        const overlay = document.getElementById('screen-evolution');
        if (!overlay) { this.playNextEvolution(); return; }
        
        const spriteEl = document.getElementById('evo-sprite');
        const textEl = document.getElementById('evo-text');
        spriteEl.src = SPRITE_BASE + evo.fromId + '.png';
        spriteEl.onerror = function() { this.style.display='none'; };
        textEl.innerText = '';
        overlay.classList.remove('hidden');
        
        const closeBtn = document.getElementById('evo-close-btn');
        if (closeBtn) closeBtn.style.display = 'none'; // 動畫期間隱藏按鈕
        
        // 閃爍動畫 3 次 → 換圖 → 音效 → 文字
        let flashCount = 0;
        const flashInterval = setInterval(() => {
            spriteEl.style.filter = flashCount % 2 === 0 ? 'brightness(5)' : 'brightness(1)';
            flashCount++;
            if (flashCount >= 6) {
                clearInterval(flashInterval);
                spriteEl.style.filter = 'brightness(1)';
                spriteEl.src = SPRITE_BASE + evo.toId + '.png';
                this.play8BitSound('win');
                textEl.innerText = `🌟 ${evo.fromName} 進化成 ${evo.toName}！`;
                if (closeBtn) closeBtn.style.display = 'inline-block'; // 動畫結束顯示按鈕
            }
        }, 300);
    },

    closeEvolution() {
        document.getElementById('screen-evolution').classList.add('hidden');
        // 繼續播放佇列中的下一個進化
        if (this.pendingEvolutions.length > 0) {
            setTimeout(() => this.playNextEvolution(), 500);
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
        // 綁定本場戰鬥的所有單字（最多 5 個）
        const boundWords = this.battleState.words.map(w => w.id).slice(0, 5);
        
        const baseId = m.chain[0];
        if (!this.state.caught.some(c => c.id === baseId || (m.chain.length > 1 && c.id === m.chain[1]) || (m.chain.length > 2 && c.id === m.chain[2]))) {
            this.state.caught.push({
                id: baseId,
                region: this.currentRegion,
                words: boundWords,
                evolvedStage: 0
            });
            // 異色寶可夢記錄
            if (this.battleState.isShiny) {
                this.state.shinyCaught.push(baseId);
            }
        }
        this.state.gold += 10;
        this.saveState();
        
        const spriteUrl = this.battleState.isShiny
            ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${baseId}.png`
            : SPRITE_BASE + baseId + ".png";
        document.getElementById('capture-sprite').src = spriteUrl;
        document.getElementById('capture-name').innerText = (this.battleState.isShiny ? '✨ ' : '') + m.names[0].toUpperCase();
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
            this.showEpicEnding();
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
            // 檢查是否已收服（包含已進化的 id）
            const isCaught = this.state.caught.find(c => {
                if (!m.chain) return c.id === baseId;
                return m.chain.includes(c.id);
            });
            const isShiny = this.state.shinyCaught.includes(baseId);
            
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
                displayId = isCaught.id; // 使用進化後的 id
                // 顯示綁定的第一個單字
                const firstWordId = Array.isArray(isCaught.words) ? isCaught.words[0] : null;
                const wordObj = firstWordId ? WORDS_ALL.find(w => w.id === firstWordId) : null;
                nameHtml = `<div class="pixel-text" style="color:var(--primary); font-size:1rem; margin-top:8px;">${wordObj ? wordObj.word : m.names ? m.names[0] : '???'}</div>
                            <div style="color:#666; font-size:0.8rem;">${wordObj ? wordObj.zh : ''}</div>
                            ${isCaught.evolvedStage > 0 ? '<div style="color:gold; font-size:0.8rem;">🌟</div>' : ''}
                            ${isShiny ? '<div style="font-size:0.8rem;">✨ 異色</div>' : ''}`;
            } else {
                // Silhouette
                imgStyle += ' filter: brightness(0); opacity: 0.5;';
            }

            const imgEl = document.createElement('img');
            imgEl.src = SPRITE_BASE + displayId + '.png';
            imgEl.setAttribute('style', imgStyle);
            imgEl.onerror = function() { this.style.display='none'; this.parentElement.insertAdjacentHTML('afterbegin', '<div style="font-size:3rem;">👾</div>'); };
            box.appendChild(imgEl);
            box.insertAdjacentHTML('beforeend', nameHtml);
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
    
    // --- Dashboard（Phase 4 重寫：分區精熟度）---
    renderDashboard() {
        const statsDiv = document.getElementById('dashboard-stats');
        let totalAll = WORDS_ALL.length;
        let learnedAll = Object.keys(this.state.wordStats).filter(k => this.state.wordStats[k].correct > 0).length;
        
        let html = `
            <div style="margin-bottom:16px; padding:12px; background:rgba(212,175,55,0.1); border-radius:8px;">
                <p>📊 <b>總覽</b></p>
                <p>🎯 學習進度：${learnedAll} / ${totalAll} 字</p>
                <p>🏆 獲得徽章：${this.state.badges.length} / 10</p>
                <p>🎒 收服寶可夢：${this.state.caught.length}</p>
                <p>🔥 連續登入：${this.state.streak} 天</p>
            </div>
            <h4 style="color:var(--primary); margin-bottom:8px;">各區域精熟度</h4>
        `;
        
        REGION_KEYS.forEach(key => {
            const regionWords = this.getWordsForRegion(key);
            if (key === 'mixed') return; // 冠軍之路包含所有字，跳過避免重複
            const total = regionWords.length;
            let masterySum = 0;
            let learnedCount = 0;
            regionWords.forEach(w => {
                const s = this.state.wordStats[w.id];
                if (s && s.correct > 0) {
                    learnedCount++;
                    // 精熟度加權：box1=0, box2=0.5, box3=1
                    if (s.box === 2) masterySum += 0.5;
                    else if (s.box >= 3) masterySum += 1;
                }
            });
            const masteryPct = total > 0 ? Math.round((masterySum / total) * 100) : 0;
            const barColor = masteryPct >= 80 ? '#4caf50' : masteryPct >= 40 ? '#ff9800' : '#f44336';
            const hasBadge = this.state.badges.includes(key) ? ' 🏅' : '';
            
            html += `
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                        <span>${REGION_NAMES[key]}${hasBadge}</span>
                        <span>${learnedCount}/${total} 字 | ${masteryPct}%</span>
                    </div>
                    <div style="width:100%; height:12px; background:#e0e0e0; border-radius:6px; overflow:hidden;">
                        <div style="width:${masteryPct}%; height:100%; background:${barColor}; transition:width 0.5s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += `<button class="big-btn mt-4" onclick="Game.exportProgress()" style="max-width:250px;">📋 匯出學習紀錄</button>`;
        statsDiv.innerHTML = html;
    },

    // 匯出學習紀錄到剪貼簿
    exportProgress() {
        let text = 'A1 Movers 單字冒險 — 學習紀錄\n';
        text += `匯出日期：${this.SRS.today()}\n`;
        text += `徽章：${this.state.badges.length}/10 | 收服：${this.state.caught.length} | 連續登入：${this.state.streak} 天\n\n`;
        text += '單字 | 中文 | 盒別 | 答對 | 答錯\n';
        text += '---|---|---|---|---\n';
        WORDS_ALL.forEach(w => {
            const s = this.state.wordStats[w.id];
            if (s && s.correct > 0) {
                text += `${w.word} | ${w.zh} | Box ${s.box} | ${s.correct} | ${s.wrong}\n`;
            }
        });
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert('✅ 學習紀錄已複製到剪貼簿！');
            }).catch(() => {
                this.showExportFallback(text);
            });
        } else {
            this.showExportFallback(text);
        }
    },

    showExportFallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed; top:10%; left:10%; width:80%; height:60%; z-index:9999; font-size:12px;';
        document.body.appendChild(ta);
        ta.select();
        alert('請手動全選複製 (Ctrl+A → Ctrl+C)，然後關閉此視窗。');
        ta.addEventListener('blur', () => ta.remove());
    },

    // === 史詩結局動畫 (Phase 6) ===
    showEpicEnding() {
        this.preWarmAudio();
        this.play8BitSound('win');
        const container = document.getElementById('screen-epic-ending');
        if (!container) return this.showScreen('map'); // fallback
        
        container.classList.remove('hidden');
        document.getElementById('screen-title').classList.add('hidden');
        document.getElementById('screen-map').classList.add('hidden');
        
        const grid = document.getElementById('epic-badge-grid');
        grid.innerHTML = '';
        
        // 播放徽章閃爍進場
        let delay = 0;
        REGION_KEYS.forEach((key, index) => {
            setTimeout(() => {
                const badge = document.createElement('div');
                badge.className = 'epic-badge';
                badge.innerHTML = `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" style="width:40px;height:40px;">`;
                badge.style.animation = 'menuPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                grid.appendChild(badge);
                this.play8BitSound('correct');
            }, delay);
            delay += 300;
        });
        
        // 全部出現後展示文字
        setTimeout(() => {
            document.getElementById('epic-ending-text').classList.remove('hidden');
            document.getElementById('epic-ending-text').style.animation = 'menuPop 1s ease';
            this.play8BitSound('win');
            
            // 讓玩家點擊離開
            container.onclick = () => {
                container.classList.add('hidden');
                document.getElementById('epic-ending-text').classList.add('hidden');
                container.onclick = null;
                this.showScreen('map');
            };
        }, delay + 800);
    }
};


// Initialize immediately
Game.init();
