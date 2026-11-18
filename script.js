'use strict';

(function () {
    /* ============================================================
       ИНИЦИАЛИЗАЦИЯ
       ============================================================ */
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    // Логический размер игрового поля
    const GAME_W = 960;
    const GAME_H = 540;

    // Retina — рендерим в 2× разрешении для чёткости на мобиле
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GAME_W * dpr;
    canvas.height = GAME_H * dpr;
    ctx.scale(dpr, dpr);

    // Все игровые расчёты — в логическом пространстве 960×540
    const W = GAME_W;
    const H = GAME_H;

    const scoreEl = document.getElementById('score');
    const highscoreEl = document.getElementById('highscore');
    const livesEl = document.getElementById('lives');
    const coinsEl = document.getElementById('coins');
    const levelNumEl = document.getElementById('levelNum');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayText = document.getElementById('overlayText');
    const overlayHint = document.getElementById('overlayHint');
    const startBtn = document.getElementById('startBtn');
    const soundBtn = document.getElementById('soundBtn');

    /* ============================================================
       КОНСТАНТЫ
       ============================================================ */
    const GRAVITY = 0.85;
    const MAX_FALL = 18;
    const MOVE_ACCEL = 0.9;
    const MAX_SPEED = 5.6;
    const GROUND_FRICTION = 0.8;
    const AIR_FRICTION = 0.94;
    const JUMP_POWER = -15.2;
    const STORAGE_KEY = 'superMarioHighScore';
    const SOUND_KEY = 'superMarioSound';
    const STEP = 1000 / 60;
    const GROUND_Y = 480;
    const TOTAL_LEVELS = 2;

    /* ============================================================
       СОСТОЯНИЕ
       ============================================================ */
    let state = 'menu';
    let score = 0;
    let coinsCollected = 0;
    let lives = 3;
    let currentLevel = 1;
    let highScore = loadHighScore();
    let cameraX = 0;
    let timer = 0;
    let level = null;
    let player = null;
    let particles = [];
    let popups = [];
    let birds = [];
    const keys = { left: false, right: false, jump: false };

    /* ============================================================
       ЗВУК
       ============================================================ */
    let audioCtx = null;
    let soundEnabled = loadSoundSetting();
    let musicInterval = null;
    let musicNoteIndex = 0;

    const MELODY = [
        { f: 523, d: 0.22 }, { f: 659, d: 0.22 }, { f: 784, d: 0.22 }, { f: 659, d: 0.22 },
        { f: 587, d: 0.22 }, { f: 698, d: 0.22 }, { f: 880, d: 0.22 }, { f: 698, d: 0.22 },
        { f: 523, d: 0.44 }, { f: 0, d: 0.28 },
        { f: 659, d: 0.22 }, { f: 784, d: 0.22 }, { f: 1047, d: 0.44 }, { f: 784, d: 0.22 },
        { f: 0, d: 0.28 }
    ];

    function loadSoundSetting() {
        try {
            const v = localStorage.getItem(SOUND_KEY);
            return v === null ? true : v === '1';
        } catch (e) { return true; }
    }
    function saveSoundSetting() {
        try { localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0'); } catch (e) {}
    }

    function initAudio() {
        if (!audioCtx) {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                audioCtx = new AC();
            } catch (e) { return; }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(function () {});
        }
    }

    function playTone(freq, duration, type, volume, startAt) {
        if (!soundEnabled || !audioCtx) return;
        const t = audioCtx.currentTime + (startAt || 0);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume || 0.08, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + duration + 0.05);
    }

    function playSlide(fromFreq, toFreq, duration, type, volume) {
        if (!soundEnabled || !audioCtx) return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(fromFreq, t);
        osc.frequency.exponentialRampToValueAtTime(toFreq, t + duration);
        gain.gain.setValueAtTime(volume || 0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + duration + 0.05);
    }

    function sfxJump() { playSlide(320, 720, 0.13, 'square', 0.07); }
    function sfxCoin() { playTone(988, 0.07, 'square', 0.09, 0); playTone(1319, 0.15, 'square', 0.09, 0.06); }
    function sfxStomp() { playSlide(280, 80, 0.16, 'square', 0.11); }
    function sfxHurt() { playSlide(500, 100, 0.4, 'sawtooth', 0.1); }
    function sfxGameOver() {
        playTone(392, 0.2, 'triangle', 0.09, 0);
        playTone(330, 0.2, 'triangle', 0.09, 0.2);
        playTone(262, 0.35, 'triangle', 0.09, 0.42);
    }
    function sfxLevelComplete() {
        [523, 659, 784, 1047, 1319].forEach((f, i) => playTone(f, 0.18, 'triangle', 0.09, i * 0.12));
    }
    function sfxWin() {
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => playTone(f, 0.22, 'triangle', 0.1, i * 0.14));
    }

    function startMusic() {
        stopMusic();
        if (!soundEnabled || !audioCtx) return;
        musicNoteIndex = 0;
        musicInterval = setInterval(function () {
            if (!soundEnabled || state !== 'playing') return;
            const note = MELODY[musicNoteIndex % MELODY.length];
            if (note.f > 0) playTone(note.f, note.d, 'triangle', 0.035, 0);
            musicNoteIndex++;
        }, 220);
    }
    function stopMusic() {
        if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
    }

    function updateSoundBtn() {
        soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
        soundBtn.classList.toggle('muted', !soundEnabled);
    }

    soundBtn.addEventListener('click', function (e) {
        e.preventDefault();
        soundEnabled = !soundEnabled;
        saveSoundSetting();
        updateSoundBtn();
        if (!soundEnabled) stopMusic();
        else {
            initAudio();
            if (state === 'playing') startMusic();
        }
    });

    /* ============================================================
       РЕКОРДЫ
       ============================================================ */
    function loadHighScore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const value = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(value) ? value : 0;
        } catch (e) { return 0; }
    }
    function saveHighScore(v) {
        try { localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) {}
    }
    function commitHighScore() {
        if (score > highScore) {
            highScore = score;
            saveHighScore(highScore);
        }
        updateHUD();
    }

    /* ============================================================
       HUD
       ============================================================ */
    function updateHUD() {
        scoreEl.textContent = score;
        highscoreEl.textContent = highScore;
        livesEl.textContent = lives;
        coinsEl.textContent = coinsCollected;
        levelNumEl.textContent = currentLevel + '/' + TOTAL_LEVELS;
    }
    function addScore(points) { score += points; updateHUD(); }

    /* ============================================================
       УТИЛИТЫ
       ============================================================ */
    function overlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
            a.y < b.y + b.h && a.y + a.h > b.y;
    }
    function circleRectOverlap(cx, cy, r, rect) {
        const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
        const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
        const dx = cx - nx, dy = cy - ny;
        return dx * dx + dy * dy < r * r;
    }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function roundRectPath(x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawStar(cx, cy, outerR, innerR, points, color) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const sx = cx + Math.cos(angle) * r;
            const sy = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.9) * 6,
                life: 1,
                size: 3 + Math.random() * 3,
                color
            });
        }
    }
    function spawnPopup(x, y, text, color) {
        popups.push({ x, y, text, color, life: 1, vy: -1.3 });
    }

    /* ============================================================
       УРОВНИ
       ============================================================ */
    function createLevel(num) {
        return num === 1 ? createLevel1() : createLevel2();
    }

    function createLevel1() {
        const platforms = [
            { x: 0, y: 480, w: 900, h: 60, type: 'ground' },
            { x: 1000, y: 480, w: 700, h: 60, type: 'ground' },
            { x: 1800, y: 480, w: 600, h: 60, type: 'ground' },
            { x: 2500, y: 480, w: 1300, h: 60, type: 'ground' },
            { x: 300, y: 380, w: 130, h: 24, type: 'brick' },
            { x: 520, y: 310, w: 130, h: 24, type: 'brick' },
            { x: 760, y: 250, w: 110, h: 24, type: 'brick' },
            { x: 1130, y: 370, w: 150, h: 24, type: 'brick' },
            { x: 1380, y: 290, w: 130, h: 24, type: 'brick' },
            { x: 1900, y: 380, w: 150, h: 24, type: 'brick' },
            { x: 2130, y: 300, w: 130, h: 24, type: 'brick' },
            { x: 2650, y: 370, w: 160, h: 24, type: 'brick' },
            { x: 2920, y: 300, w: 130, h: 24, type: 'brick' },
            { x: 3150, y: 380, w: 140, h: 24, type: 'brick' }
        ];
        const coinPositions = [
            [340, 340], [385, 340], [560, 265], [605, 265], [800, 205],
            [1150, 325], [1200, 325], [1250, 325], [1420, 245], [1470, 245],
            [1950, 335], [2000, 335], [2170, 255], [2220, 255],
            [2600, 430], [2650, 430], [2700, 325], [2760, 325],
            [2960, 255], [3010, 255], [3200, 335], [3250, 335]
        ];
        const enemyData = [
            { x: 620, minX: 520, maxX: 860 },
            { x: 1200, minX: 1050, maxX: 1350 },
            { x: 1600, minX: 1420, maxX: 1680 },
            { x: 2000, minX: 1850, maxX: 2350 },
            { x: 2700, minX: 2550, maxX: 2950 },
            { x: 3150, minX: 3000, maxX: 3350 }
        ];
        return buildLevelObject(3800, platforms, coinPositions, enemyData);
    }

    function createLevel2() {
        const platforms = [
            { x: 0, y: 480, w: 800, h: 60, type: 'ground' },
            { x: 950, y: 480, w: 550, h: 60, type: 'ground' },
            { x: 1700, y: 480, w: 600, h: 60, type: 'ground' },
            { x: 2450, y: 480, w: 450, h: 60, type: 'ground' },
            { x: 3050, y: 480, w: 650, h: 60, type: 'ground' },
            { x: 3900, y: 480, w: 600, h: 60, type: 'ground' },
            { x: 4700, y: 480, w: 500, h: 60, type: 'ground' },
            { x: 300, y: 400, w: 120, h: 24, type: 'brick' },
            { x: 500, y: 320, w: 120, h: 24, type: 'brick' },
            { x: 700, y: 260, w: 100, h: 24, type: 'brick' },
            { x: 900, y: 340, w: 130, h: 24, type: 'brick' },
            { x: 1100, y: 300, w: 140, h: 24, type: 'brick' },
            { x: 1350, y: 240, w: 120, h: 24, type: 'brick' },
            { x: 1650, y: 360, w: 120, h: 24, type: 'brick' },
            { x: 1900, y: 290, w: 140, h: 24, type: 'brick' },
            { x: 2100, y: 230, w: 120, h: 24, type: 'brick' },
            { x: 2400, y: 340, w: 120, h: 24, type: 'brick' },
            { x: 2600, y: 280, w: 140, h: 24, type: 'brick' },
            { x: 2900, y: 360, w: 120, h: 24, type: 'brick' },
            { x: 3150, y: 290, w: 150, h: 24, type: 'brick' },
            { x: 3400, y: 230, w: 120, h: 24, type: 'brick' },
            { x: 3650, y: 320, w: 130, h: 24, type: 'brick' },
            { x: 3950, y: 380, w: 120, h: 24, type: 'brick' },
            { x: 4150, y: 290, w: 140, h: 24, type: 'brick' },
            { x: 4400, y: 220, w: 120, h: 24, type: 'brick' },
            { x: 4650, y: 340, w: 130, h: 24, type: 'brick' },
            { x: 4900, y: 290, w: 140, h: 24, type: 'brick' }
        ];
        const coinPositions = [
            [340, 360], [380, 360], [540, 280], [580, 280], [740, 220],
            [940, 300], [980, 300], [1140, 260], [1180, 260], [1390, 200],
            [1690, 320], [1940, 250], [1980, 250], [2140, 190], [2180, 190],
            [2440, 300], [2640, 240], [2680, 240], [2940, 320],
            [3190, 250], [3230, 250], [3440, 190], [3690, 280],
            [3990, 340], [4190, 250], [4230, 250], [4440, 180], [4480, 180],
            [4690, 300], [4940, 250], [4980, 250]
        ];
        const enemyData = [
            { x: 550, minX: 500, maxX: 750 },
            { x: 700, minX: 0, maxX: 800 },
            { x: 1100, minX: 950, maxX: 1500 },
            { x: 1400, minX: 950, maxX: 1500 },
            { x: 1900, minX: 1700, maxX: 2300 },
            { x: 2200, minX: 1700, maxX: 2300 },
            { x: 2700, minX: 2450, maxX: 2900 },
            { x: 3300, minX: 3050, maxX: 3700 },
            { x: 3600, minX: 3050, maxX: 3700 },
            { x: 4200, minX: 3900, maxX: 4500 },
            { x: 4450, minX: 3900, maxX: 4500 },
            { x: 4900, minX: 4700, maxX: 5200 }
        ];
        return buildLevelObject(5200, platforms, coinPositions, enemyData);
    }

    function buildLevelObject(worldWidth, platforms, coinPositions, enemyData) {
        const coins = coinPositions.map(function (pos, i) {
            return { x: pos[0], y: pos[1], r: 12, collected: false, phase: i * 0.7 };
        });
        const enemies = enemyData.map(function (e, i) {
            return {
                x: e.x, y: 440, w: 40, h: 40,
                vx: i % 2 === 0 ? -1.3 : 1.3,
                minX: e.minX, maxX: e.maxX,
                alive: true, animTime: i
            };
        });
        return {
            worldWidth, flagX: worldWidth - 200,
            platforms, coins, enemies
        };
    }

    function createPlayer() {
        return {
            x: 60, y: 380, w: 38, h: 52,
            vx: 0, vy: 0,
            onGround: false, facing: 1,
            invincible: 0, animTime: 0, jumpHeld: false
        };
    }

    /* ============================================================
       ФИЗИКА
       ============================================================ */
    function moveAndCollide(ent) {
        ent.x += ent.vx;
        for (let i = 0; i < level.platforms.length; i++) {
            const p = level.platforms[i];
            if (overlap(ent, p)) {
                if (ent.vx > 0) ent.x = p.x - ent.w;
                else if (ent.vx < 0) ent.x = p.x + p.w;
                ent.vx = 0;
            }
        }
        ent.y += ent.vy;
        ent.onGround = false;
        for (let i = 0; i < level.platforms.length; i++) {
            const p = level.platforms[i];
            if (overlap(ent, p)) {
                if (ent.vy > 0) {
                    ent.y = p.y - ent.h;
                    ent.vy = 0;
                    ent.onGround = true;
                } else if (ent.vy < 0) {
                    ent.y = p.y + p.h;
                    ent.vy = 0;
                }
            }
        }
    }

    /* ============================================================
       ОБНОВЛЕНИЕ
       ============================================================ */
    function update() {
        if (state !== 'playing') return;
        updatePlayer();
        updateEnemies();
        updateCoins();
        updateParticles();
        updatePopups();
        updateCamera();
        checkGoal();
    }

    function updatePlayer() {
        if (keys.left && !keys.right) { player.vx -= MOVE_ACCEL; player.facing = -1; }
        else if (keys.right && !keys.left) { player.vx += MOVE_ACCEL; player.facing = 1; }
        else {
            player.vx *= player.onGround ? GROUND_FRICTION : AIR_FRICTION;
            if (Math.abs(player.vx) < 0.1) player.vx = 0;
        }
        player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);

        if (keys.jump && player.onGround && !player.jumpHeld) {
            player.vy = JUMP_POWER;
            player.onGround = false;
            sfxJump();
        }
        player.jumpHeld = keys.jump;

        player.vy += GRAVITY;
        if (player.vy > MAX_FALL) player.vy = MAX_FALL;

        moveAndCollide(player);

        if (player.onGround && Math.abs(player.vx) > 0.5) {
            player.animTime += Math.abs(player.vx) * 0.15;
        } else if (player.onGround) {
            player.animTime = 0;
        }

        if (player.invincible > 0) player.invincible--;
        if (player.y > H + 120) loseLife();
    }

    function updateEnemies() {
        for (let i = 0; i < level.enemies.length; i++) {
            const e = level.enemies[i];
            if (!e.alive) continue;
            e.x += e.vx;
            if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
            if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
            e.animTime += 0.15;

            if (player.invincible <= 0 && overlap(player, e)) {
                const prevBottom = player.y + player.h - player.vy;
                const stomping = player.vy > 0 && prevBottom <= e.y + 14;
                if (stomping) {
                    e.alive = false;
                    player.vy = -11;
                    addScore(100);
                    sfxStomp();
                    spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#8b4513', 14);
                    spawnPopup(e.x + e.w / 2, e.y - 10, '+100', '#ffffff');
                } else {
                    loseLife();
                    return;
                }
            }
        }
    }

    function updateCoins() {
        for (let i = 0; i < level.coins.length; i++) {
            const c = level.coins[i];
            if (c.collected) continue;
            if (circleRectOverlap(c.x, c.y, c.r, player)) {
                c.collected = true;
                coinsCollected++;
                addScore(50);
                sfxCoin();
                spawnParticles(c.x, c.y, '#ffd700', 12);
                spawnPopup(c.x, c.y - 20, '+50', '#ffd700');
            }
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3;
            p.life -= 0.03;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updatePopups() {
        for (let i = popups.length - 1; i >= 0; i--) {
            const p = popups[i];
            p.y += p.vy;
            p.vy *= 0.96;
            p.life -= 0.02;
            if (p.life <= 0) popups.splice(i, 1);
        }
    }

    function updateCamera() {
        const target = player.x + player.w / 2 - W / 2;
        cameraX = clamp(target, 0, level.worldWidth - W);
    }

    function checkGoal() {
        if (player.x + player.w >= level.flagX) winGame();
    }

    /* ============================================================
       ИГРОВОЙ ПОТОК
       ============================================================ */
    function startGame() {
        initAudio();
        score = 0;
        coinsCollected = 0;
        lives = 3;
        currentLevel = 1;
        cameraX = 0;
        timer = 0;
        particles = [];
        popups = [];
        level = createLevel(currentLevel);
        player = createPlayer();
        keys.left = keys.right = keys.jump = false;
        state = 'playing';
        document.body.classList.add('playing');
        hideOverlay();
        updateHUD();
        startMusic();
    }

    function loadLevel(num) {
        currentLevel = num;
        level = createLevel(num);
        player = createPlayer();
        cameraX = 0;
        particles = [];
        popups = [];
        keys.left = keys.right = keys.jump = false;
        state = 'playing';
        document.body.classList.add('playing');
        hideOverlay();
        updateHUD();
        startMusic();
    }

    function loseLife() {
        if (state !== 'playing') return;
        lives--;
        updateHUD();
        sfxHurt();
        spawnParticles(player.x + player.w / 2, player.y + player.h / 2, '#e52521', 16);
        if (lives <= 0) gameOver();
        else respawn();
    }

    function respawn() {
        player.x = 60;
        player.y = 380;
        player.vx = 0;
        player.vy = 0;
        player.invincible = 100;
        player.jumpHeld = true;
        cameraX = 0;
        keys.jump = false;
    }

    function gameOver() {
        state = 'gameover';
        document.body.classList.remove('playing');
        stopMusic();
        sfxGameOver();
        commitHighScore();
        showOverlay('Игра окончена',
            'Ваш счёт: ' + score + '<br>Уровень: ' + currentLevel,
            'Повторить попытку',
            'Соберитесь с силами и попробуйте снова!');
    }

    function winGame() {
        addScore(500);
        stopMusic();

        if (currentLevel < TOTAL_LEVELS) {
            state = 'levelcomplete';
            document.body.classList.remove('playing');
            sfxLevelComplete();
            showOverlay('Уровень ' + currentLevel + ' пройден!',
                'Бонус: +500<br>Общий счёт: ' + score,
                'Следующий уровень →',
                'Готовы к новым испытаниям?');
        } else {
            state = 'win';
            document.body.classList.remove('playing');
            sfxWin();
            commitHighScore();
            showOverlay('Победа!',
                'Вы прошли все уровни!<br>Итоговый счёт: ' + score,
                'Играть снова',
                'Монет собрано: ' + coinsCollected);
        }
    }

    function nextLevel() {
        initAudio();
        loadLevel(currentLevel + 1);
    }

    function showOverlay(title, text, buttonLabel, hint) {
        overlayTitle.textContent = title;
        overlayText.innerHTML = text;
        overlayHint.textContent = hint || '';
        startBtn.textContent = buttonLabel;
        overlay.classList.remove('hidden');
    }
    function hideOverlay() { overlay.classList.add('hidden'); }

    /* ============================================================
       ДЕКОРАЦИИ
       ============================================================ */
    const clouds = [
        { x: 100, y: 80, s: 1.0 }, { x: 480, y: 140, s: 0.75 }, { x: 860, y: 70, s: 1.2 },
        { x: 1300, y: 120, s: 0.9 }, { x: 1750, y: 80, s: 1.1 }, { x: 2250, y: 140, s: 0.8 },
        { x: 2750, y: 90, s: 1.0 }, { x: 3250, y: 130, s: 0.9 }, { x: 3800, y: 100, s: 1.0 },
        { x: 4300, y: 120, s: 0.85 }, { x: 4800, y: 90, s: 1.1 }
    ];
    const mountains = [
        { x: 100, w: 400, h: 200 }, { x: 550, w: 450, h: 240 }, { x: 1050, w: 380, h: 180 },
        { x: 1500, w: 500, h: 260 }, { x: 2050, w: 400, h: 200 }, { x: 2500, w: 450, h: 230 },
        { x: 3000, w: 420, h: 210 }, { x: 3500, w: 480, h: 250 }, { x: 4000, w: 430, h: 220 },
        { x: 4500, w: 470, h: 245 }, { x: 5000, w: 440, h: 215 }
    ];
    const hills = [
        { x: 150, w: 320, h: 150 }, { x: 700, w: 260, h: 110 }, { x: 1300, w: 380, h: 180 },
        { x: 2000, w: 300, h: 130 }, { x: 2700, w: 350, h: 160 }, { x: 3400, w: 280, h: 120 },
        { x: 4000, w: 340, h: 155 }, { x: 4600, w: 300, h: 135 }
    ];
    const bushes = [
        { x: 200, w: 100 }, { x: 560, w: 80 }, { x: 1150, w: 120 }, { x: 1650, w: 90 },
        { x: 2150, w: 100 }, { x: 2800, w: 110 }, { x: 3300, w: 90 }, { x: 3900, w: 105 },
        { x: 4500, w: 95 }, { x: 4950, w: 100 }
    ];
    const flowers = [
        { x: 180, c: '#ff5e5e' }, { x: 250, c: '#ffd93d' }, { x: 420, c: '#ff5e5e' },
        { x: 550, c: '#b78aff' }, { x: 720, c: '#ffd93d' }, { x: 1050, c: '#ff5e5e' },
        { x: 1250, c: '#ffd93d' }, { x: 1520, c: '#b78aff' }, { x: 1720, c: '#ff5e5e' },
        { x: 1950, c: '#ffd93d' }, { x: 2200, c: '#b78aff' }, { x: 2450, c: '#ff5e5e' },
        { x: 2650, c: '#ffd93d' }, { x: 2850, c: '#b78aff' }, { x: 3080, c: '#ff5e5e' },
        { x: 3300, c: '#ffd93d' }, { x: 3900, c: '#ff5e5e' }, { x: 4100, c: '#ffd93d' },
        { x: 4450, c: '#b78aff' }, { x: 4800, c: '#ff5e5e' }
    ];

    function initBirds() {
        birds = [];
        for (let i = 0; i < 5; i++) {
            birds.push({
                x: Math.random() * 2000,
                y: 40 + Math.random() * 100,
                speed: 0.5 + Math.random() * 0.5,
                phase: Math.random() * Math.PI * 2,
                size: 0.6 + Math.random() * 0.5
            });
        }
    }

    function drawSky() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#2d5f9c');
        grad.addColorStop(0.35, '#5b9bd5');
        grad.addColorStop(0.7, '#a4d3f0');
        grad.addColorStop(1, '#dff0fc');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let i = 0; i < 4; i++) {
            const y = 200 + i * 60 + Math.sin(timer * 0.005 + i) * 10;
            ctx.fillRect(0, y, W, 30);
        }
    }

    function drawSun(x, y) {
        const glow = ctx.createRadialGradient(x, y, 20, x, y, 180);
        glow.addColorStop(0, 'rgba(255, 250, 200, 0.95)');
        glow.addColorStop(0.3, 'rgba(255, 240, 160, 0.4)');
        glow.addColorStop(0.7, 'rgba(255, 220, 120, 0.12)');
        glow.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 180, y - 180, 360, 360);
        ctx.beginPath();
        ctx.arc(x, y, 44, 0, Math.PI * 2);
        ctx.fillStyle = '#fff8d0';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 34, 0, Math.PI * 2);
        const coreGrad = ctx.createRadialGradient(x - 8, y - 8, 4, x, y, 34);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(1, '#fff3a0');
        ctx.fillStyle = coreGrad;
        ctx.fill();
    }

    function drawMountains() {
        const span = W + 800;
        for (let i = 0; i < mountains.length; i++) {
            const m = mountains[i];
            let px = (m.x - cameraX * 0.15) % span;
            if (px < -600) px += span;
            if (px > W + 600) px -= span;
            const peakX = px + m.w / 2;
            const peakY = GROUND_Y - m.h;

            const mtnGrad = ctx.createLinearGradient(px, peakY, px, GROUND_Y);
            mtnGrad.addColorStop(0, '#7f9dbe');
            mtnGrad.addColorStop(0.5, '#5a7a9e');
            mtnGrad.addColorStop(1, '#3d5a7a');
            ctx.beginPath();
            ctx.moveTo(px, GROUND_Y);
            ctx.lineTo(peakX, peakY);
            ctx.lineTo(px + m.w, GROUND_Y);
            ctx.closePath();
            ctx.fillStyle = mtnGrad;
            ctx.fill();

            const capH = m.h * 0.32;
            ctx.beginPath();
            ctx.moveTo(peakX - m.w * 0.16, peakY + capH);
            ctx.lineTo(peakX - m.w * 0.05, peakY + capH * 0.3);
            ctx.lineTo(peakX, peakY);
            ctx.lineTo(peakX + m.w * 0.05, peakY + capH * 0.3);
            ctx.lineTo(peakX + m.w * 0.16, peakY + capH);
            ctx.lineTo(peakX + m.w * 0.1, peakY + capH * 0.7);
            ctx.lineTo(peakX, peakY + capH * 0.95);
            ctx.lineTo(peakX - m.w * 0.1, peakY + capH * 0.7);
            ctx.closePath();
            const snowGrad = ctx.createLinearGradient(0, peakY, 0, peakY + capH);
            snowGrad.addColorStop(0, '#ffffff');
            snowGrad.addColorStop(1, '#d4e4f0');
            ctx.fillStyle = snowGrad;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(px, GROUND_Y);
            ctx.lineTo(peakX, peakY);
            ctx.lineTo(peakX, GROUND_Y);
            ctx.closePath();
            ctx.fillStyle = 'rgba(30, 55, 90, 0.45)';
            ctx.fill();
        }
    }

    function drawClouds() {
        const span = W + 600;
        for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            let px = (c.x - cameraX * 0.3) % span;
            if (px < -300) px += span;
            if (px > W + 300) px -= span;
            drawCloud(px, c.y, c.s);
        }
    }

    function drawCloud(x, y, s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(140, 170, 200, 0.55)';
        ctx.beginPath();
        ctx.arc(0, 6, 30, 0, Math.PI * 2);
        ctx.arc(34, 12, 26, 0, Math.PI * 2);
        ctx.arc(-34, 12, 24, 0, Math.PI * 2);
        ctx.arc(10, -10, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.arc(34, 6, 26, 0, Math.PI * 2);
        ctx.arc(-34, 6, 24, 0, Math.PI * 2);
        ctx.arc(10, -16, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(10, -20, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawBirds() {
        for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            b.x += b.speed;
            if (b.x > 5600) b.x = -100;
            b.phase += 0.08;
            let px = b.x - cameraX * 0.4;
            const span = 5600;
            while (px < -100) px += span;
            while (px > W + 100) px -= span;
            if (px < -50 || px > W + 50) continue;
            const wingY = Math.sin(b.phase) * 4;
            ctx.strokeStyle = 'rgba(40, 60, 90, 0.5)';
            ctx.lineWidth = 1.8 * b.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px - 8 * b.size, b.y + wingY);
            ctx.quadraticCurveTo(px - 3 * b.size, b.y - 3 * b.size, px, b.y);
            ctx.quadraticCurveTo(px + 3 * b.size, b.y - 3 * b.size, px + 8 * b.size, b.y + wingY);
            ctx.stroke();
            ctx.lineCap = 'butt';
        }
    }

    function drawHills() {
        const span = W + 700;
        for (let i = 0; i < hills.length; i++) {
            const h = hills[i];
            let px = (h.x - cameraX * 0.55) % span;
            if (px < -400) px += span;
            if (px > W + 400) px -= span;
            drawHill(px, GROUND_Y, h.w, h.h);
        }
    }

    function drawHill(x, baseY, w, h) {
        const grad = ctx.createLinearGradient(x, baseY - h, x, baseY);
        grad.addColorStop(0, '#8fd48f');
        grad.addColorStop(0.5, '#5aad5a');
        grad.addColorStop(1, '#2f7a2f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY);
        ctx.quadraticCurveTo(x, baseY - h * 1.5, x + w / 2, baseY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.beginPath();
        ctx.moveTo(x - w / 2, baseY);
        ctx.quadraticCurveTo(x - w * 0.2, baseY - h * 1.3, x - w * 0.05, baseY - h * 0.7);
        ctx.lineTo(x - w * 0.05, baseY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(30, 80, 30, 0.35)';
        for (let i = 0; i < 10; i++) {
            const dx = ((i * 47) % w) - w / 2;
            const dy = baseY - h * 0.4 - ((i * 31) % (h * 0.55));
            ctx.beginPath();
            ctx.arc(x + dx, dy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBushes() {
        for (let i = 0; i < bushes.length; i++) {
            const b = bushes[i];
            if (b.x + b.w < cameraX - 60 || b.x > cameraX + W + 60) continue;
            const cx = b.x + b.w / 2;
            const y = GROUND_Y;
            ctx.fillStyle = 'rgba(20, 60, 20, 0.55)';
            ctx.beginPath();
            ctx.arc(cx - b.w * 0.28, y - 8, b.w * 0.3, 0, Math.PI * 2);
            ctx.arc(cx + b.w * 0.28, y - 8, b.w * 0.3, 0, Math.PI * 2);
            ctx.arc(cx, y - 18, b.w * 0.34, 0, Math.PI * 2);
            ctx.fill();

            const bushGrad = ctx.createRadialGradient(cx, y - 25, 5, cx, y - 10, b.w * 0.5);
            bushGrad.addColorStop(0, '#6fd06f');
            bushGrad.addColorStop(0.6, '#4caf50');
            bushGrad.addColorStop(1, '#2d7a2d');
            ctx.fillStyle = bushGrad;
            ctx.beginPath();
            ctx.arc(cx - b.w * 0.28, y - 10, b.w * 0.3, 0, Math.PI * 2);
            ctx.arc(cx + b.w * 0.28, y - 10, b.w * 0.3, 0, Math.PI * 2);
            ctx.arc(cx, y - 20, b.w * 0.34, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(220, 255, 220, 0.6)';
            ctx.beginPath();
            ctx.arc(cx - b.w * 0.08, y - 28, b.w * 0.1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawFlowers() {
        for (let i = 0; i < flowers.length; i++) {
            const f = flowers[i];
            if (f.x < cameraX - 40 || f.x > cameraX + W + 40) continue;
            const sway = Math.sin(timer * 0.03 + i) * 2;
            const y = GROUND_Y - 12;
            ctx.strokeStyle = '#2d7a2d';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(f.x, y + 12);
            ctx.quadraticCurveTo(f.x + sway * 0.5, y + 6, f.x + sway, y);
            ctx.stroke();
            for (let p = 0; p < 5; p++) {
                const angle = (p / 5) * Math.PI * 2;
                const px = f.x + sway + Math.cos(angle) * 4;
                const py = y + Math.sin(angle) * 4;
                ctx.fillStyle = f.c;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#ffeb3b';
            ctx.beginPath();
            ctx.arc(f.x + sway, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* ============================================================
       ПЛАТФОРМЫ
       ============================================================ */
    function drawPlatforms() {
        for (let i = 0; i < level.platforms.length; i++) {
            const p = level.platforms[i];
            if (p.x + p.w < cameraX - 60 || p.x > cameraX + W + 60) continue;
            if (p.type === 'ground') drawGround(p);
            else drawBrick(p);
        }
    }

    function drawGround(p) {
        const dirtGrad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        dirtGrad.addColorStop(0, '#a07546');
        dirtGrad.addColorStop(0.3, '#8b6030');
        dirtGrad.addColorStop(1, '#5a3818');
        ctx.fillStyle = dirtGrad;
        ctx.fillRect(p.x, p.y, p.w, p.h);

        ctx.fillStyle = 'rgba(50, 30, 10, 0.4)';
        for (let bx = p.x + 6; bx < p.x + p.w - 6; bx += 24) {
            for (let by = p.y + 22; by < p.y + p.h - 6; by += 18) {
                const r = ((bx * 13 + by * 7) % 5);
                if (r < 3) ctx.fillRect(bx, by, 10 + r * 2, 6 + (r % 2) * 3);
            }
        }

        ctx.fillStyle = 'rgba(30, 18, 6, 0.7)';
        for (let bx = p.x + 20; bx < p.x + p.w - 20; bx += 80) {
            ctx.beginPath();
            ctx.ellipse(bx, p.y + 34, 5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const grassGrad = ctx.createLinearGradient(0, p.y, 0, p.y + 18);
        grassGrad.addColorStop(0, '#8ce68c');
        grassGrad.addColorStop(0.5, '#5cb85c');
        grassGrad.addColorStop(1, '#2d7a2d');
        ctx.fillStyle = grassGrad;
        ctx.fillRect(p.x, p.y, p.w, 18);

        ctx.fillStyle = '#6fd06f';
        for (let bx = p.x; bx < p.x + p.w; bx += 8) {
            const gh = 6 + ((bx * 7) % 8);
            ctx.beginPath();
            ctx.moveTo(bx, p.y);
            ctx.lineTo(bx + 4, p.y - gh);
            ctx.lineTo(bx + 8, p.y);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        for (let bx = p.x + 4; bx < p.x + p.w; bx += 14) {
            ctx.fillRect(bx, p.y + 1, 3, 1);
        }
        ctx.fillStyle = 'rgba(30, 18, 6, 0.55)';
        ctx.fillRect(p.x, p.y + 18, p.w, 2);
    }

    function drawBrick(p) {
        const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        grad.addColorStop(0, '#e08238');
        grad.addColorStop(0.4, '#c96a1b');
        grad.addColorStop(1, '#8a3d0a');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x, p.y, p.w, p.h);

        ctx.fillStyle = 'rgba(255, 200, 120, 0.55)';
        ctx.fillRect(p.x, p.y, p.w, 4);

        ctx.strokeStyle = 'rgba(50, 15, 0, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + p.h / 2);
        ctx.lineTo(p.x + p.w, p.y + p.h / 2);
        for (let bx = p.x; bx < p.x + p.w; bx += 26) {
            ctx.moveTo(bx, p.y);
            ctx.lineTo(bx, p.y + p.h / 2);
        }
        for (let bx = p.x + 13; bx < p.x + p.w; bx += 26) {
            ctx.moveTo(bx, p.y + p.h / 2);
            ctx.lineTo(bx, p.y + p.h);
        }
        ctx.stroke();

        ctx.fillStyle = 'rgba(20, 8, 0, 0.5)';
        ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);
        ctx.strokeStyle = 'rgba(30, 10, 0, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
    }

    /* ============================================================
       МОНЕТЫ, ВРАГИ, ФЛАГ
       ============================================================ */
    function drawCoins() {
        for (let i = 0; i < level.coins.length; i++) {
            const c = level.coins[i];
            if (c.collected) continue;
            if (c.x < cameraX - 40 || c.x > cameraX + W + 40) continue;
            const scaleX = Math.abs(Math.cos(timer * 0.07 + c.phase));
            const sx = Math.max(0.15, scaleX);

            ctx.save();
            ctx.globalAlpha = 0.5 * sx;
            const glow = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 24);
            glow.addColorStop(0, 'rgba(255, 235, 120, 1)');
            glow.addColorStop(1, 'rgba(255, 200, 50, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.scale(sx, 1);
            const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, c.r);
            grad.addColorStop(0, '#fff8c0');
            grad.addColorStop(0.45, '#ffd700');
            grad.addColorStop(0.85, '#e0a800');
            grad.addColorStop(1, '#a07800');
            ctx.beginPath();
            ctx.arc(0, 0, c.r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#7a5500';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, c.r * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = '#ffe870';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#c9920a';
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.ellipse(-c.r * 0.35, -c.r * 0.42, c.r * 0.22, c.r * 0.15, -0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawEnemies() {
        for (let i = 0; i < level.enemies.length; i++) {
            const e = level.enemies[i];
            if (!e.alive) continue;
            if (e.x + e.w < cameraX - 60 || e.x > cameraX + W + 60) continue;
            const cx = e.x + e.w / 2;
            const dir = e.vx > 0 ? 1 : -1;
            const walkPhase = e.animTime;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.beginPath();
            ctx.ellipse(cx, GROUND_Y - 2, 22, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            const bob = Math.sin(walkPhase) * 1.5;
            const footLift1 = Math.max(0, Math.sin(walkPhase)) * 4;
            const footLift2 = Math.max(0, Math.sin(walkPhase + Math.PI)) * 4;

            ctx.fillStyle = '#2a1505';
            ctx.beginPath();
            ctx.ellipse(cx - 12, e.y + e.h - 5 + footLift1, 11, 7, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 12, e.y + e.h - 5 + footLift2, 11, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#5a3010';
            ctx.beginPath();
            ctx.ellipse(cx - 12, e.y + e.h - 6 + footLift1, 9, 4, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 12, e.y + e.h - 6 + footLift2, 9, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            const bodyGrad = ctx.createRadialGradient(cx - 6, e.y + 12 + bob, 4, cx, e.y + 20 + bob, 24);
            bodyGrad.addColorStop(0, '#c07840');
            bodyGrad.addColorStop(0.5, '#8b4513');
            bodyGrad.addColorStop(1, '#3a1a05');
            ctx.beginPath();
            ctx.ellipse(cx, e.y + 18 + bob, e.w / 2, 19, 0, 0, Math.PI * 2);
            ctx.fillStyle = bodyGrad;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(20, 8, 0, 0.7)';
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 200, 160, 0.25)';
            ctx.beginPath();
            ctx.ellipse(cx - 8, e.y + 10 + bob, 8, 5, -0.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(cx - 8 + dir * 2, e.y + 15 + bob, 6.5, 8, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 8 + dir * 2, e.y + 15 + bob, 6.5, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(20, 8, 0, 0.6)';
            ctx.stroke();

            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(cx - 8 + dir * 4, e.y + 16 + bob, 3.8, 0, Math.PI * 2);
            ctx.arc(cx + 8 + dir * 4, e.y + 16 + bob, 3.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx - 8 + dir * 4 - 1.2, e.y + 14.5 + bob, 1.2, 0, Math.PI * 2);
            ctx.arc(cx + 8 + dir * 4 - 1.2, e.y + 14.5 + bob, 1.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#2a1505';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx - 14, e.y + 6 + bob);
            ctx.lineTo(cx - 3, e.y + 10 + bob);
            ctx.moveTo(cx + 14, e.y + 6 + bob);
            ctx.lineTo(cx + 3, e.y + 10 + bob);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(20, 8, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 6, e.y + 27 + bob);
            ctx.quadraticCurveTo(cx, e.y + 30 + bob, cx + 6, e.y + 27 + bob);
            ctx.stroke();
            ctx.lineCap = 'butt';

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx - 5, e.y + 26 + bob);
            ctx.lineTo(cx - 3, e.y + 30 + bob);
            ctx.lineTo(cx - 1, e.y + 26 + bob);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + 5, e.y + 26 + bob);
            ctx.lineTo(cx + 3, e.y + 30 + bob);
            ctx.lineTo(cx + 1, e.y + 26 + bob);
            ctx.fill();
        }
    }

    function drawFlag() {
        const x = level.flagX;
        if (x < cameraX - 200 || x > cameraX + W + 200) return;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(x + 5, GROUND_Y + 1, 22, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        const poleGrad = ctx.createLinearGradient(x, 0, x + 12, 0);
        poleGrad.addColorStop(0, '#5a5a5a');
        poleGrad.addColorStop(0.4, '#f0f0f0');
        poleGrad.addColorStop(0.7, '#c8c8c8');
        poleGrad.addColorStop(1, '#7a7a7a');
        ctx.fillStyle = poleGrad;
        ctx.fillRect(x, 140, 12, 340);

        const ballGrad = ctx.createRadialGradient(x + 2, 132, 2, x + 6, 140, 14);
        ballGrad.addColorStop(0, '#fff8c0');
        ballGrad.addColorStop(0.5, '#ffd700');
        ballGrad.addColorStop(1, '#b8860b');
        ctx.beginPath();
        ctx.arc(x + 6, 138, 13, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#7a5500';
        ctx.stroke();

        const wave = Math.sin(timer * 0.08) * 6;
        const wave2 = Math.sin(timer * 0.08 + 1) * 5;
        ctx.beginPath();
        ctx.moveTo(x + 12, 160);
        ctx.quadraticCurveTo(x + 50, 168 + wave, x + 95, 178 + wave2);
        ctx.lineTo(x + 95, 230 + wave2);
        ctx.quadraticCurveTo(x + 50, 222 + wave, x + 12, 214);
        ctx.closePath();
        const flagGrad = ctx.createLinearGradient(x, 170, x + 95, 230);
        flagGrad.addColorStop(0, '#5de08c');
        flagGrad.addColorStop(0.5, '#2ecc71');
        flagGrad.addColorStop(1, '#0d8a3d');
        ctx.fillStyle = flagGrad;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0a5a28';
        ctx.stroke();

        drawStar(x + 52, 195 + wave, 13, 5.5, 5, 'rgba(255, 255, 255, 0.95)');
        drawStar(x + 52, 195 + wave, 10, 4, 5, '#ffd700');
    }

    /* ============================================================
       ПЕРСОНАЖ
       ============================================================ */
    function drawPlayer() {
        if (!player) return;
        if (player.invincible > 0 && Math.floor(timer / 4) % 2 === 0) return;

        const w = player.w;
        const h = player.h;
        const walkPhase = player.animTime;
        const walking = player.onGround && Math.abs(player.vx) > 0.5;
        const inAir = !player.onGround;

        const legSwing = walking ? Math.sin(walkPhase) * 6 : 0;
        const armSwing = walking ? Math.sin(walkPhase + Math.PI) * 5 : 0;
        const airBend = inAir ? (player.vy < 0 ? -3 : 2) : 0;

        if (player.onGround) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(player.x + w / 2, player.y + h + 2, 20, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.save();
        ctx.translate(player.x + w / 2, player.y);
        ctx.scale(player.facing, 1);
        ctx.translate(-w / 2, 0);

        const hipY = h - 22;
        const legW = 13;

        ctx.save();
        ctx.translate(6 + legSwing, 0);
        const pantsGradL = ctx.createLinearGradient(0, hipY, 0, h - 10);
        pantsGradL.addColorStop(0, '#2a54c4');
        pantsGradL.addColorStop(1, '#173b8a');
        ctx.fillStyle = pantsGradL;
        roundRectPath(0, hipY, legW, h - hipY - 10 + airBend, 3);
        ctx.fill();
        const bootGradL = ctx.createLinearGradient(0, h - 12, 0, h);
        bootGradL.addColorStop(0, '#6b3a1a');
        bootGradL.addColorStop(1, '#2a1205');
        ctx.fillStyle = bootGradL;
        roundRectPath(-2, h - 11 + airBend, legW + 8, 11, 4);
        ctx.fill();
        ctx.fillStyle = '#1a0a02';
        roundRectPath(-2, h - 3 + airBend, legW + 8, 3, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 220, 180, 0.4)';
        ctx.fillRect(1, h - 9 + airBend, legW - 2, 2);
        ctx.restore();

        ctx.save();
        ctx.translate(w - legW - 6 - legSwing, 0);
        const pantsGradR = ctx.createLinearGradient(0, hipY, 0, h - 10);
        pantsGradR.addColorStop(0, '#3d6dd4');
        pantsGradR.addColorStop(1, '#1e4ba8');
        ctx.fillStyle = pantsGradR;
        roundRectPath(0, hipY, legW, h - hipY - 10 + airBend, 3);
        ctx.fill();
        const bootGradR = ctx.createLinearGradient(0, h - 12, 0, h);
        bootGradR.addColorStop(0, '#8b4a2a');
        bootGradR.addColorStop(1, '#3a1a08');
        ctx.fillStyle = bootGradR;
        roundRectPath(-2, h - 11 + airBend, legW + 8, 11, 4);
        ctx.fill();
        ctx.fillStyle = '#1a0a02';
        roundRectPath(-2, h - 3 + airBend, legW + 8, 3, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 220, 180, 0.55)';
        ctx.fillRect(1, h - 9 + airBend, legW - 2, 2.5);
        ctx.restore();

        const bodyTop = h - 40;
        const bodyBot = h - 20;
        const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyBot);
        bodyGrad.addColorStop(0, '#4a7fe8');
        bodyGrad.addColorStop(0.5, '#2b5fd9');
        bodyGrad.addColorStop(1, '#183e8a');
        ctx.fillStyle = bodyGrad;
        roundRectPath(4, bodyTop, w - 8, bodyBot - bodyTop + 4, 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        roundRectPath(6, bodyTop + 1, 4, bodyBot - bodyTop, 2);
        ctx.fill();

        const shirtTop = h - 44;
        const shirtBot = h - 32;
        const shirtGrad = ctx.createLinearGradient(0, shirtTop, 0, shirtBot);
        shirtGrad.addColorStop(0, '#ff5045');
        shirtGrad.addColorStop(0.6, '#e52521');
        shirtGrad.addColorStop(1, '#a01510');
        ctx.fillStyle = shirtGrad;
        roundRectPath(3, shirtTop, w - 6, shirtBot - shirtTop + 4, 3);
        ctx.fill();

        ctx.fillStyle = '#2b5fd9';
        ctx.fillRect(8, shirtTop, 5, shirtBot - shirtTop + 4);
        ctx.fillRect(w - 13, shirtTop, 5, shirtBot - shirtTop + 4);

        for (let i = 0; i < 2; i++) {
            const bx = i === 0 ? 10.5 : w - 10.5;
            const by = shirtTop + 5;
            const btnGrad = ctx.createRadialGradient(bx - 0.5, by - 0.5, 0.5, bx, by, 3);
            btnGrad.addColorStop(0, '#fff3a0');
            btnGrad.addColorStop(1, '#b8860b');
            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.save();
        ctx.translate(-1, shirtTop + 4 + armSwing);
        ctx.rotate(-0.15);
        const armL = ctx.createLinearGradient(0, 0, 0, 14);
        armL.addColorStop(0, '#e52521');
        armL.addColorStop(1, '#a01510');
        ctx.fillStyle = armL;
        roundRectPath(0, 0, 7, 12, 3);
        ctx.fill();
        const gloveL = ctx.createRadialGradient(3, 12, 1, 3.5, 14, 6);
        gloveL.addColorStop(0, '#ffffff');
        gloveL.addColorStop(1, '#d0d0d0');
        ctx.fillStyle = gloveL;
        ctx.beginPath();
        ctx.arc(3.5, 14, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 120, 120, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(w - 6, shirtTop + 4 - armSwing);
        ctx.rotate(0.15);
        const armR = ctx.createLinearGradient(0, 0, 0, 14);
        armR.addColorStop(0, '#ff5045');
        armR.addColorStop(1, '#b81a12');
        ctx.fillStyle = armR;
        roundRectPath(0, 0, 7, 12, 3);
        ctx.fill();
        const gloveR = ctx.createRadialGradient(3, 12, 1, 3.5, 14, 6);
        gloveR.addColorStop(0, '#ffffff');
        gloveR.addColorStop(0.7, '#f0f0f0');
        gloveR.addColorStop(1, '#c0c0c0');
        ctx.fillStyle = gloveR;
        ctx.beginPath();
        ctx.arc(3.5, 14, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 120, 120, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(2, 12.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const headX = 5;
        const headY = h - 60;
        const headW = w - 10;
        const headH = 18;

        ctx.fillStyle = '#e8b87a';
        ctx.fillRect(headX + headW / 2 - 4, headY + headH - 2, 8, 4);

        const faceGrad = ctx.createRadialGradient(
            headX + headW * 0.35, headY + headH * 0.4, 2,
            headX + headW * 0.5, headY + headH * 0.5, headW * 0.8
        );
        faceGrad.addColorStop(0, '#ffe4c0');
        faceGrad.addColorStop(0.6, '#ffd0a0');
        faceGrad.addColorStop(1, '#d99860');
        ctx.fillStyle = faceGrad;
        ctx.beginPath();
        ctx.ellipse(headX + headW / 2, headY + headH / 2, headW / 2, headH / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 240, 200, 0.5)';
        ctx.beginPath();
        ctx.ellipse(headX + headW * 0.75, headY + headH * 0.35, 2, 4, -0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#e8a868';
        ctx.beginPath();
        ctx.ellipse(headX + headW - 1, headY + headH * 0.5, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        const noseX = headX + headW - 3;
        const noseY = headY + headH * 0.55;
        const noseGrad = ctx.createRadialGradient(noseX - 1, noseY - 1, 0.5, noseX, noseY, 5);
        noseGrad.addColorStop(0, '#ffe4c0');
        noseGrad.addColorStop(1, '#d99860');
        ctx.fillStyle = noseGrad;
        ctx.beginPath();
        ctx.ellipse(noseX, noseY, 4.5, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 130, 100, 0.35)';
        ctx.beginPath();
        ctx.ellipse(headX + headW * 0.4, headY + headH * 0.72, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        const eyeX = headX + headW * 0.65;
        const eyeY = headY + headH * 0.38;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a3a6a';
        ctx.beginPath();
        ctx.arc(eyeX + 0.5, eyeY + 0.3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a1a3a';
        ctx.beginPath();
        ctx.arc(eyeX + 0.7, eyeY + 0.4, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeX - 0.5, eyeY - 0.8, 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#5a2d0c';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(eyeX - 2.5, eyeY - 5);
        ctx.quadraticCurveTo(eyeX + 0.5, eyeY - 6.5, eyeX + 3, eyeY - 5);
        ctx.stroke();
        ctx.lineCap = 'butt';

        const mustY = noseY + 4.5;
        ctx.fillStyle = '#3a1f0a';
        ctx.beginPath();
        ctx.moveTo(noseX - 12, mustY + 1);
        ctx.quadraticCurveTo(noseX - 10, mustY - 3, noseX - 4, mustY - 1);
        ctx.quadraticCurveTo(noseX + 1, mustY + 1, noseX + 4, mustY - 1);
        ctx.quadraticCurveTo(noseX + 8, mustY - 3, noseX + 10, mustY + 1);
        ctx.lineTo(noseX + 9, mustY + 4);
        ctx.quadraticCurveTo(noseX + 4, mustY + 3, noseX, mustY + 4);
        ctx.quadraticCurveTo(noseX - 4, mustY + 3, noseX - 9, mustY + 4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(120, 70, 30, 0.9)';
        ctx.beginPath();
        ctx.ellipse(noseX - 5, mustY + 0.5, 3.5, 1, -0.2, 0, Math.PI * 2);
        ctx.ellipse(noseX + 4, mustY + 0.5, 3.5, 1, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#7a2a10';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(noseX - 3, mustY + 5);
        ctx.quadraticCurveTo(noseX, mustY + 7, noseX + 3, mustY + 5);
        ctx.stroke();

        const capY = headY - 3;
        const capH = headH * 0.75;
        const capGrad = ctx.createLinearGradient(0, capY, 0, capY + capH);
        capGrad.addColorStop(0, '#ff5045');
        capGrad.addColorStop(0.5, '#e52521');
        capGrad.addColorStop(1, '#a01510');
        ctx.fillStyle = capGrad;
        ctx.beginPath();
        ctx.moveTo(headX - 1, capY + capH);
        ctx.quadraticCurveTo(headX - 1, capY - 2, headX + headW * 0.5, capY - 2);
        ctx.quadraticCurveTo(headX + headW + 1, capY - 2, headX + headW + 1, capY + capH);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.ellipse(headX + headW * 0.4, capY + 2, 5, 2, -0.3, 0, Math.PI * 2);
        ctx.fill();

        const brimGrad = ctx.createLinearGradient(0, capY + capH - 2, 0, capY + capH + 3);
        brimGrad.addColorStop(0, '#e52521');
        brimGrad.addColorStop(1, '#8a1208');
        ctx.fillStyle = brimGrad;
        ctx.beginPath();
        ctx.ellipse(headX + headW * 0.7, capY + capH + 0.5, headW * 0.42, 3.5, 0, 0, Math.PI);
        ctx.fill();

        const embX = headX + headW * 0.42;
        const embY = capY + capH * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(embX, embY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a1208';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#e52521';
        ctx.font = 'bold 6px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('M', embX, embY + 0.5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.restore();
    }

    /* ============================================================
       ЧАСТИЦЫ, ОЧКИ, ВИНЬЕТКА
       ============================================================ */
    function drawParticles() {
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }

    function drawPopups() {
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
        for (let i = 0; i < popups.length; i++) {
            const p = popups[i];
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(p.text, p.x, p.y);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    /* ============================================================
       РЕНДЕР
       ============================================================ */
    function render() {
        drawSky();
        drawSun(W - 130, 90);
        drawMountains();
        drawBirds();
        drawClouds();
        drawHills();

        if (level) {
            ctx.save();
            ctx.translate(-Math.round(cameraX), 0);
            drawBushes();
            drawFlowers();
            drawPlatforms();
            drawFlag();
            drawCoins();
            drawEnemies();
            drawParticles();
            drawPlayer();
            drawPopups();
            ctx.restore();
        }

        drawVignette();
    }

    /* ============================================================
       ЦИКЛ
       ============================================================ */
    let lastTime = 0;
    let accumulator = 0;

    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let delta = timestamp - lastTime;
        lastTime = timestamp;
        if (delta > 120) delta = 120;
        accumulator += delta;
        while (accumulator >= STEP) {
            timer++;
            update();
            accumulator -= STEP;
        }
        render();
        requestAnimationFrame(loop);
    }

    /* ============================================================
       КЛАВИАТУРА (десктоп)
       ============================================================ */
    const keyMap = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'jump', KeyW: 'jump', Space: 'jump'
    };

    window.addEventListener('keydown', function (e) {
        const action = keyMap[e.code];
        if (action) {
            e.preventDefault();
            keys[action] = true;
        }
        if (e.code === 'Enter') {
            if (state === 'levelcomplete') { e.preventDefault(); nextLevel(); }
            else if (state !== 'playing') { e.preventDefault(); startGame(); }
        }
    });

    window.addEventListener('keyup', function (e) {
        const action = keyMap[e.code];
        if (action) { e.preventDefault(); keys[action] = false; }
    });

    window.addEventListener('blur', function () {
        keys.left = keys.right = keys.jump = false;
    });

    startBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (state === 'levelcomplete') nextLevel();
        else startGame();
    });

    /* ============================================================
       МОБИЛЬНОЕ УПРАВЛЕНИЕ (мультитач, вибро, preventDefault)
       ============================================================ */
    function vibrate(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms); } catch (e) {}
        }
    }

    function bindTouchButton(btn, action) {
        let pressed = false;

        function press(e) {
            if (e) e.preventDefault();
            if (pressed) return;
            pressed = true;
            initAudio();
            keys[action] = true;
            btn.classList.add('active');
            vibrate(8);
        }

        function release(e) {
            if (e) e.preventDefault();
            if (!pressed) return;
            pressed = false;
            keys[action] = false;
            btn.classList.remove('active');
        }

        btn.addEventListener('touchstart', press, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
        btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    bindTouchButton(document.getElementById('btnLeft'), 'left');
    bindTouchButton(document.getElementById('btnRight'), 'right');
    bindTouchButton(document.getElementById('btnJump'), 'jump');

    /* ============================================================
       ГЛОБАЛЬНЫЕ БЛОКИРОВКИ (для мобилы)
       ============================================================ */
    // Запрет контекстного меню по долгому нажатию
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // Запрет двойного тапа = зум
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
        const now = Date.now();
        if (now - lastTouchEnd < 300) e.preventDefault();
        lastTouchEnd = now;
    }, { passive: false });

    // Запрет случайного скролла при свайпах по канвасу
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    // Авто-пауза при сворачивании вкладки
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            keys.left = keys.right = keys.jump = false;
            stopMusic();
        } else if (state === 'playing' && soundEnabled) {
            startMusic();
        }
    });

    // Запрет pinch-zoom через жесты (Safari)
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
    document.addEventListener('gestureend', function (e) { e.preventDefault(); });

    /* ============================================================
       СТАРТ
       ============================================================ */
    updateSoundBtn();
    level = createLevel(1);
    player = createPlayer();
    initBirds();
    updateHUD();
    requestAnimationFrame(loop);
})();