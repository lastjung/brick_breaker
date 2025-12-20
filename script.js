const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const PADDLE_WIDTH = 100; // Slightly smaller for narrower canvas
const PADDLE_HEIGHT = window.innerWidth < 1280 ? 40 : 15; // Thicker on mobile
const BALL_RADIUS = 8;
const BRICK_ROW_COUNT = 8; // More rows for taller canvas
const BRICK_COLUMN_COUNT = 7; // Fewer columns for narrower canvas
const BRICK_PADDING = 10;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 35;
const BRICK_WIDTH = (canvas.width - (BRICK_OFFSET_LEFT * 2) - (BRICK_PADDING * (BRICK_COLUMN_COUNT - 1))) / BRICK_COLUMN_COUNT;
const BRICK_HEIGHT = 24;

// Game variables
let score = 0;
let lives = 3;
let level = 1;
let gameRunning = false;
let isPaused = false;
let isMuted = localStorage.getItem('brickBreakerMuted') === 'true';
let highScore = parseInt(localStorage.getItem('brickBreakerHighScore')) || 0;
let animationId;
let ballOnPaddle = true; // New flag for manual start
let levelTransitionActive = false;
let levelTransitionTimer = 0;

// Sound Manager
const SoundManager = {
    audioCtx: null,

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.audioCtx || isMuted) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    },

    playPaddleHit() {
        this.playTone(440, 'square', 0.1, 0.1); // A4
    },

    playBrickHit() {
        this.playTone(880, 'sine', 0.1, 0.1); // A5
    },

    playWallHit() {
        this.playTone(220, 'triangle', 0.1, 0.1); // A3
    },

    playLifeLoss() {
        this.playTone(110, 'sawtooth', 0.5, 0.2); // A2
        setTimeout(() => this.playTone(55, 'sawtooth', 0.5, 0.2), 200); // A1
    },

    playWin() {
        this.playTone(523.25, 'square', 0.1, 0.1); // C5
        setTimeout(() => this.playTone(659.25, 'square', 0.1, 0.1), 100); // E5
        setTimeout(() => this.playTone(783.99, 'square', 0.2, 0.1), 200); // G5
        setTimeout(() => this.playTone(1046.50, 'square', 0.4, 0.1), 300); // C6
    },

    playGameOver() {
        this.playTone(300, 'sawtooth', 0.3, 0.2);
        setTimeout(() => this.playTone(200, 'sawtooth', 0.3, 0.2), 200);
        setTimeout(() => this.playTone(100, 'sawtooth', 0.5, 0.2), 400);
    },

    playLevelUp() {
        this.playTone(440, 'sine', 0.2, 0.1);
        setTimeout(() => this.playTone(880, 'sine', 0.4, 0.1), 200);
    }
};

// Paddle
const paddle = {
    x: canvas.width / 2 - PADDLE_WIDTH / 2,
    y: canvas.height - 40,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    dx: 10, // Max speed (reduced by 20% from 12)
    vx: 0,  // Velocity
    friction: 0.88,
    acceleration: 1.6, // reduced by 20% from 2
    color: '#0ff'
};

// Ball array and state
let balls = [];
const BALL_INIT_SPEED = 5;
const ballTemplate = {
    radius: BALL_RADIUS,
    color: '#fff'
};

function createBall(x, y, dx = 0, dy = 0) {
    return {
        x: x,
        y: y,
        dx: dx,
        dy: dy,
        radius: BALL_RADIUS,
        speed: parseInt(document.getElementById('speedSlider').value) || BALL_INIT_SPEED,
        color: '#fff',
        trail: [] // Position history for motion trail
    };
}

// Bricks
let bricks = [];
const brickColors = ['#ff0055', '#ff5500', '#ffaa00', '#ffff00', '#00ff55', '#00aaff', '#0055ff', '#5500ff'];

// Level Patterns
const levels = [
    // Level 1: Simple Rows
    (c, r) => r < 3 ? 1 : 0,
    // Level 2: Checkerboard
    (c, r) => (c + r) % 2 === 0 ? 1 : 0,
    // Level 3: Pyramid
    (c, r) => r >= c && r < BRICK_ROW_COUNT - c ? 1 : 0,
    // Level 4: Columns
    (c, r) => c % 2 === 0 ? 1 : 0,
    // Level 5: Diamond
    (c, r) => {
        const midC = Math.floor(BRICK_COLUMN_COUNT / 2);
        const midR = Math.floor(BRICK_ROW_COUNT / 2) - 1;
        const dist = Math.abs(c - midC) + Math.abs(r - midR);
        return dist <= 3 ? 1 : 0;
    },
    // Level 6: Cross (X)
    (c, r) => {
        return (c === r || c === (BRICK_ROW_COUNT - 1 - r)) ? 1 : 0;
    },
    // Level 7: Nested Frame
    (c, r) => {
        const border = (c === 0 || c === BRICK_COLUMN_COUNT - 1 || r === 0 || r === 4);
        const center = (c >= 2 && c <= 4 && r >= 2 && r <= 2);
        return (border || center) ? 1 : 0;
    },
    // Level 8: Vertical Pipes
    (c, r) => (c % 3 !== 1 && r < 5) ? 1 : 0,
    // Level 9: Dense Canopy
    (c, r) => r < 5 ? 1 : 0,
    // Level 10: The Maze
    (c, r) => (c + r) % 3 === 0 || (c * r) % 4 === 1 ? 1 : 0
];

const BRICK_TYPES = {
    NORMAL: 0,
    STEEL: 1,
    EXPLOSIVE: 2,
    MOVING: 3
};

function initBricks(levelIndex) {
    bricks = [];
    activeBricks = 0;

    let pattern;
    if (levelIndex <= levels.length) {
        pattern = levels[levelIndex - 1];
    } else {
        // Procedural Generator for Levels > 10
        // Seeds a pseudo-random generator with level index for deterministic pattern per level
        const seed = levelIndex * 1234.567;
        pattern = (c, r) => {
            const val = Math.sin(seed + c * 0.5 + r * 0.8) * 10000;
            const pseudoRand = val - Math.floor(val);
            // Symmetrical pattern
            const symC = c >= BRICK_COLUMN_COUNT / 2 ? BRICK_COLUMN_COUNT - 1 - c : c;
            const symVal = Math.sin(seed + symC * 0.5 + r * 0.8) * 10000;
            const symRand = symVal - Math.floor(symVal);
            return symRand > 0.4 && r < 6 ? 1 : 0;
        };
    }

    for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
        bricks[c] = [];
        for (let r = 0; r < BRICK_ROW_COUNT; r++) {
            let status = pattern(c, r);
            let type = BRICK_TYPES.NORMAL;
            let hp = 1;
            let vx = 0;

            if (status === 1) {
                // Introduce special bricks
                const rand = Math.random();
                if (levelIndex >= 2 && rand < 0.15) {
                    type = BRICK_TYPES.STEEL;
                    hp = 2 + Math.floor(levelIndex / 5);
                } else if (levelIndex >= 3 && rand < 0.1) {
                    type = BRICK_TYPES.EXPLOSIVE;
                } else if (levelIndex >= 4 && rand < 0.1) {
                    type = BRICK_TYPES.MOVING;
                    vx = (Math.random() - 0.5) * 4;
                }
                activeBricks++;
            }

            bricks[c][r] = {
                x: 0,
                y: 0,
                status: status,
                type: type,
                hp: hp,
                maxHp: hp,
                vx: vx,
                color: brickColors[r % brickColors.length]
            };
        }
    }
}

// Particles
let particles = [];
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 2;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8;
        this.color = color;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.02;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
        this.size *= 0.95;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(x, y, color) {
    const count = 10;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(p => p.draw());
}

function triggerHitEffect() {
    const container = document.querySelector('.canvas-wrapper');
    container.classList.remove('shake-hit');
    void container.offsetWidth; // Force reflow
    container.classList.add('shake-hit');
}

// Power-ups
let powerUps = [];
let fireBallActive = false;
let paddleExpanded = false;
const POWERUP_TYPES = {
    MULTI_BALL: { color: '#fff', label: '🎾' },
    PADDLE_EXPAND: { color: '#0ff', label: '↔️' },
    FIRE_BALL: { color: '#ff0055', label: '🔥' }
};

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 30;
        this.height = 30;
        this.speed = 3;
        this.color = POWERUP_TYPES[type].color;
        this.label = POWERUP_TYPES[type].label;
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        // Draw crystal/glass box
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height, 5);
        } else {
            ctx.rect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
        ctx.fill();
        ctx.stroke();

        // Draw icon
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.label, this.x, this.y);
        ctx.restore();
    }
}

function createPowerUp(x, y) {
    console.log(`Dropping power-up at ${x}, ${y}`);
    const rand = Math.random();
    let type;
    if (rand < 0.33) type = 'MULTI_BALL';
    else if (rand < 0.66) type = 'PADDLE_EXPAND';
    else type = 'FIRE_BALL';

    powerUps.push(new PowerUp(x, y, type));
}

function updatePowerUps() {
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        p.update();

        // Paddle collection
        if (p.y + p.height / 2 >= paddle.y && p.y - p.height / 2 <= paddle.y + paddle.height &&
            p.x + p.width / 2 >= paddle.x && p.x - p.width / 2 <= paddle.x + paddle.width) {
            console.log(`Collected power-up: ${p.type}`);
            applyPowerUp(p.type);
            powerUps.splice(i, 1);
            continue;
        }

        // Off screen
        if (p.y - p.height / 2 > canvas.height) {
            powerUps.splice(i, 1);
        }
    }
}

function drawPowerUps() {
    powerUps.forEach(p => p.draw());
}

function applyPowerUp(type) {
    console.log(`Applying power-up: ${type}`);
    SoundManager.playLevelUp(); // Use level up sound for collection for now

    if (type === 'MULTI_BALL') {
        const sourceBall = balls.length > 0 ? balls[0] : createBall(canvas.width / 2, canvas.height - 50);
        if (balls.length === 0) balls.push(sourceBall);

        balls.push(createBall(sourceBall.x, sourceBall.y, sourceBall.dx * 0.8 || 2, -(Math.abs(sourceBall.dy) || 5)));
        balls.push(createBall(sourceBall.x, sourceBall.y, -sourceBall.dx * 0.8 || -2, -(Math.abs(sourceBall.dy) || 5)));

        balls.forEach(b => {
            if (b.dx === 0) b.dx = b.speed * (Math.random() > 0.5 ? 1 : -1);
            if (b.dy === 0) b.dy = -b.speed;
        });
    } else if (type === 'PADDLE_EXPAND') {
        if (!paddleExpanded) {
            paddleExpanded = true;
            paddle.width *= 1.5;
            setTimeout(() => {
                paddle.width = PADDLE_WIDTH;
                paddleExpanded = false;
            }, 10000);
        }
    } else if (type === 'FIRE_BALL') {
        if (!fireBallActive) {
            fireBallActive = true;
            balls.forEach(b => b.color = '#ff0055');
            setTimeout(() => {
                fireBallActive = false;
                balls.forEach(b => b.color = '#fff');
            }, 10000);
        }
    }
}

// Mobile Optimization: Hide controls if screen is small
function checkMobileLayout() {
    const controls = document.getElementById('controls');
    if (window.innerWidth < 1280) {
        if (controls) {
            // Use a class to hide instead of removing to allow toggling back on desktop resize if needed,
            // but 'display: none !important' via JS style value should work. 
            // Let's try setting visibility and height too.
            controls.style.cssText = 'display: none !important; height: 0 !important; visibility: hidden !important;';
        }
        paddle.height = 40;
    } else {
        if (controls) {
            controls.style.display = 'flex';
            controls.style.visibility = 'visible';
            controls.style.height = 'auto';
        }
        paddle.height = 15;
    }
}

// Check on load and resize
window.addEventListener('load', checkMobileLayout);
window.addEventListener('resize', checkMobileLayout);

// Ensure we run it immediately in case load already fired
if (document.readyState === 'complete') {
    checkMobileLayout();
}

// Input handling
let rightPressed = false;
let leftPressed = false;

document.addEventListener('keydown', keyDownHandler, false);
document.addEventListener('keyup', keyUpHandler, false);
// Use global pointer move for better tracking even outside canvas
window.addEventListener('pointermove', mouseMoveHandler, false);

// PREVENT SCROLLING GLOBALLY
document.addEventListener('touchmove', function (e) {
    e.preventDefault();
}, { passive: false });

// Touch handling for mobile
canvas.addEventListener('touchstart', touchHandler, { passive: false });
canvas.addEventListener('touchmove', touchHandler, { passive: false });

function touchHandler(e) {
    e.preventDefault(); // Prevent scrolling
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const touch = e.touches[0];
    const relativeX = (touch.clientX - rect.left) * scaleX;

    if (relativeX > 0 && relativeX < canvas.width) {
        paddle.x = relativeX - paddle.width / 2;

        // Clamp paddle
        if (paddle.x < 0) paddle.x = 0;
        if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;
    }
}

function togglePause() {
    if (!gameRunning) return;
    isPaused = !isPaused;
    document.getElementById('pauseOverlay').style.display = isPaused ? 'flex' : 'none';
    if (!isPaused) {
        requestAnimationFrame(draw);
    }
}

function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('brickBreakerMuted', isMuted);
    updateMuteUI();
}

function updateMuteUI() {
    const btn = document.getElementById('muteBtn');
    if (btn) {
        btn.innerText = isMuted ? "Unmute" : "Mute";
        btn.style.background = isMuted ? "#555" : "";
    }
}

// Manual launch listeners
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        const gameOverVisible = document.getElementById('gameOverScreen').style.display === 'flex';
        const victoryVisible = document.getElementById('victoryScreen').style.display === 'flex';
        if (gameOverVisible || victoryVisible) {
            startGame();
        } else {
            launchBall();
        }
    }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') toggleMute();
});
document.getElementById('muteBtn').addEventListener('click', toggleMute);
canvas.addEventListener('click', launchBall);
document.getElementById('startHint').addEventListener('click', launchBall);

// Global resume to be safe
window.addEventListener('click', () => {
    SoundManager.init();
    if (SoundManager.audioCtx) SoundManager.audioCtx.resume();
}, { once: true });

function launchBall() {
    if (ballOnPaddle && gameRunning && balls.length > 0) {
        ballOnPaddle = false;
        document.getElementById('startHint').style.display = 'none';

        // Ensure AudioContext is active on user interaction (fixes Autoplay Policy issues)
        SoundManager.init();
        if (SoundManager.audioCtx) {
            SoundManager.audioCtx.resume().then(() => {
                console.log("AudioContext resumed");
            });
        }

        // Randomize start direction slightly for the main ball
        const mainBall = balls[0];
        mainBall.dx = mainBall.speed * (Math.random() > 0.5 ? 1 : -1);
        mainBall.dy = -mainBall.speed;
    }
}

function keyDownHandler(e) {
    if (e.key === 'Right' || e.key === 'ArrowRight') rightPressed = true;
    else if (e.key === 'Left' || e.key === 'ArrowLeft') leftPressed = true;
}

function keyUpHandler(e) {
    if (e.key === 'Right' || e.key === 'ArrowRight') rightPressed = false;
    else if (e.key === 'Left' || e.key === 'ArrowLeft') leftPressed = false;
}

function mouseMoveHandler(e) {
    if (document.pointerLockElement === canvas) {
        // Pointer Lock Mode: Use relative movement
        paddle.x += e.movementX;
    } else {
        // Standard Mode: Use absolute position
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const relativeX = (e.clientX - rect.left) * scaleX;
        paddle.x = relativeX - paddle.width / 2;
    }

    // Clamp paddle position (common for both modes)
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;
}

// Pointer Lock Implementation
const captureBtn = document.getElementById('captureBtn');

captureBtn.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        canvas.requestPointerLock();
    } else {
        document.exitPointerLock();
    }
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
        captureBtn.innerText = "Release Mouse";
        captureBtn.style.background = "var(--primary-color)";
        captureBtn.style.color = "#000";
    } else {
        captureBtn.innerText = "Capture Mouse";
        captureBtn.style.background = ""; // Reset to default
        captureBtn.style.color = "";
    }
});

// Drawing functions
function drawBalls() {
    balls.forEach(ball => {
        // Draw Trail
        ball.trail.forEach((pos, index) => {
            const alpha = (index / ball.trail.length) * 0.3;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, ball.radius * (0.5 + 0.5 * index / ball.trail.length), 0, Math.PI * 2);
            ctx.fillStyle = ball.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
            ctx.closePath();
        });
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = ball.color;
        ctx.closePath();
        ctx.shadowBlur = 0;
    });
}

function drawPaddle() {
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
    ctx.fillStyle = paddle.color;
    ctx.fill();
    ctx.shadowBlur = 20;
    ctx.shadowColor = paddle.color;
    ctx.closePath();
    ctx.shadowBlur = 0;
}

let activeBricks = 0;

function drawBricks() {
    for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
        for (let r = 0; r < BRICK_ROW_COUNT; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                // Update position for moving bricks
                if (b.type === BRICK_TYPES.MOVING) {
                    b.x += b.vx;
                    if (b.x <= BRICK_OFFSET_LEFT || b.x + BRICK_WIDTH >= canvas.width - BRICK_OFFSET_LEFT) {
                        b.vx = -b.vx;
                    }
                } else {
                    b.x = (c * (BRICK_WIDTH + BRICK_PADDING)) + BRICK_OFFSET_LEFT;
                    b.y = (r * (BRICK_HEIGHT + BRICK_PADDING)) + BRICK_OFFSET_TOP;
                }

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(b.x, b.y, BRICK_WIDTH, BRICK_HEIGHT, 4);
                } else {
                    ctx.rect(b.x, b.y, BRICK_WIDTH, BRICK_HEIGHT);
                }

                // Color and visual logic
                let fillColor = b.color;
                let strokeColor = '#fff';
                let glowBlur = 10;
                let label = '';

                if (b.type === BRICK_TYPES.STEEL) {
                    fillColor = '#888'; // Metallic
                    strokeColor = '#ddd';
                    glowBlur = 5;
                    label = b.hp;
                } else if (b.type === BRICK_TYPES.EXPLOSIVE) {
                    fillColor = '#ffaa00'; // Orange/Bomb
                    strokeColor = '#ff0';
                    glowBlur = 20;
                    label = '💣';
                }

                ctx.fillStyle = fillColor;
                ctx.fill();
                ctx.shadowBlur = glowBlur;
                ctx.shadowColor = fillColor;
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1;
                ctx.stroke();

                // Text overlay
                if (label) {
                    ctx.fillStyle = b.type === BRICK_TYPES.EXPLOSIVE ? '#000' : '#fff';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, b.x + BRICK_WIDTH / 2, b.y + BRICK_HEIGHT / 2);
                }

                ctx.closePath();
                ctx.shadowBlur = 0;
            }
        }
    }
}

function collisionDetection() {
    for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
        for (let r = 0; r < BRICK_ROW_COUNT; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                balls.forEach(ball => {
                    if (ball.x > b.x && ball.x < b.x + BRICK_WIDTH && ball.y > b.y && ball.y < b.y + BRICK_HEIGHT) {
                        if (!fireBallActive) {
                            ball.dy = -ball.dy;
                        }

                        // Handle Durability
                        b.hp--;
                        if (b.hp <= 0) {
                            b.status = 0;
                            activeBricks--;
                            score++;
                            updateHighScore();

                            // Handle Explosive
                            if (b.type === BRICK_TYPES.EXPLOSIVE) {
                                explodeAt(c, r);
                            }

                            SoundManager.playBrickHit();
                            createParticles(b.x + BRICK_WIDTH / 2, b.y + BRICK_HEIGHT / 2, b.color);
                            triggerHitEffect();

                            // Power-up chance
                            if (Math.random() < 0.15) {
                                createPowerUp(b.x + BRICK_WIDTH / 2, b.y + BRICK_HEIGHT / 2);
                            }
                        } else {
                            // Hit steel but not broken
                            SoundManager.playWallHit(); // Metallic sound
                            createParticles(ball.x, ball.y, '#fff');
                        }

                        document.getElementById('score').innerText = score;
                    }
                });
            }
        }
    }

    if (activeBricks <= 0) {
        levelUp();
    }
}

function explodeAt(col, row) {
    // Destroy adjacent bricks
    for (let i = col - 1; i <= col + 1; i++) {
        for (let j = row - 1; j <= row + 1; j++) {
            if (i >= 0 && i < BRICK_COLUMN_COUNT && j >= 0 && j < BRICK_ROW_COUNT) {
                const target = bricks[i][j];
                if (target.status === 1) {
                    target.hp = 0;
                    target.status = 0;
                    activeBricks--;
                    score++;
                    createParticles(target.x + BRICK_WIDTH / 2, target.y + BRICK_HEIGHT / 2, '#ffff00');
                }
            }
        }
    }
    triggerHitEffect();
}

function levelUp() {
    level++;
    SoundManager.playLevelUp();
    document.getElementById('levelSelect').value = level;

    // Increase base speed on sliders for UI feedback
    const speedSlider = document.getElementById('speedSlider');
    speedSlider.value = parseInt(speedSlider.value) + 1;
    document.getElementById('speedDisplay').innerText = speedSlider.value;

    initBricks(level);
    resetBall();
    levelTransitionActive = true;
    levelTransitionTimer = 90; // ~1.5s
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBricks();
    updateParticles();
    drawParticles();
    updatePowerUps();
    drawPowerUps();
    drawBalls();
    drawPaddle();
    collisionDetection();

    if (levelTransitionActive) {
        drawLevelTransition();
        levelTransitionTimer--;
        if (levelTransitionTimer <= 0) levelTransitionActive = false;
    }

    if (ballOnPaddle && balls.length > 0) {
        // Lock main ball to paddle
        const ball = balls[0];
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius - 2;
    } else {
        // Ball movement and collision for all balls
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];

            // Wall collision
            if (ball.x + ball.dx > canvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
                ball.dx = -ball.dx;
                SoundManager.playWallHit();
            }

            // Ceiling collision
            if (ball.y + ball.dy < ball.radius) {
                ball.dy = -ball.dy;
                SoundManager.playWallHit();
            }
            // Paddle collision
            else if (ball.dy > 0 && ball.y + ball.radius >= paddle.y && ball.y < paddle.y + paddle.height / 2) {
                if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
                    SoundManager.playPaddleHit();
                    ball.y = paddle.y - ball.radius;
                    let collidePoint = ball.x - (paddle.x + paddle.width / 2);
                    collidePoint = collidePoint / (paddle.width / 2);
                    let angle = collidePoint * (Math.PI / 3);
                    let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                    if (speed < 4) speed = 4;
                    ball.dx = speed * Math.sin(angle);
                    ball.dy = -speed * Math.cos(angle);
                }
            }

            // Move ball
            ball.x += ball.dx;
            ball.y += ball.dy;

            // Update trail
            ball.trail.push({ x: ball.x, y: ball.y });
            if (ball.trail.length > 10) {
                ball.trail.shift();
            }

            // Check if ball is off screen
            if (ball.y - ball.radius > canvas.height) {
                balls.splice(i, 1);

                // If no balls left, lose a life
                if (balls.length === 0) {
                    lives--;
                    document.getElementById('livesSelect').value = lives;
                    SoundManager.playLifeLoss();

                    const container = document.querySelector('.canvas-wrapper');
                    container.classList.add('flash-red');
                    container.classList.add('shake');

                    setTimeout(() => {
                        container.classList.remove('flash-red');
                        container.classList.remove('shake');
                    }, 600);

                    if (!lives) {
                        gameOver();
                        return;
                    } else {
                        resetBall();
                    }
                }
            }
        }
    }

    // Paddle movement logic (Keyboard)
    if (rightPressed) {
        paddle.vx += paddle.acceleration;
    } else if (leftPressed) {
        paddle.vx -= paddle.acceleration;
    }

    // Apply friction
    paddle.vx *= paddle.friction;
    if (Math.abs(paddle.vx) < 0.1) paddle.vx = 0;

    // Clamp speed to paddle.dx (Max speed set by slider)
    if (paddle.vx > paddle.dx) paddle.vx = paddle.dx;
    if (paddle.vx < -paddle.dx) paddle.vx = -paddle.dx;

    paddle.x += paddle.vx;

    // Clamp to walls
    if (paddle.x < 0) {
        paddle.x = 0;
        paddle.vx = 0;
    } else if (paddle.x + paddle.width > canvas.width) {
        paddle.x = canvas.width - paddle.width;
        paddle.vx = 0;
    }

    if (gameRunning && !isPaused) {
        animationId = requestAnimationFrame(draw);
    }
}

function resetBall() {
    ballOnPaddle = true;
    document.getElementById('startHint').style.display = 'flex';
    balls = [createBall(canvas.width / 2, canvas.height - 50)];
    paddle.x = canvas.width / 2 - paddle.width / 2;
    paddle.vx = 0;
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    document.getElementById('finalScore').innerText = score;
    document.getElementById('gameOverScreen').style.display = 'flex';
    SoundManager.playGameOver();
    console.log("Game Over");
    updateHighScore();
}

function updateHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('brickBreakerHighScore', highScore);
        updateHighScoreDisplay();
        document.getElementById('highScore').classList.add('new-best');
    }
}

function updateHighScoreDisplay() {
    document.getElementById('highScore').innerText = highScore;
}

function drawLevelTransition() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, canvas.height / 2 - 50, canvas.width, 100);

    ctx.font = 'bold 40px Outfit, sans-serif';
    ctx.fillStyle = '#0ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0ff';
    ctx.fillText(`LEVEL ${level}`, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;
}

function gameWin() {
    // Not used in infinite levels, but kept for completeness or max level cap
    gameRunning = false;
    cancelAnimationFrame(animationId);
    document.getElementById('victoryScore').innerText = score;
    document.getElementById('victoryScreen').style.display = 'flex';
    SoundManager.playWin();
    console.log("You Win");
}

function startGame() {
    console.log("Starting Game");
    score = 0;
    lives = parseInt(document.getElementById('livesSelect').value) || 3;
    // Ensure we start at level 1 if the input is empty or invalid, but respect user choice if set
    // User requested "Game start level 1", so we might want to force reset or just ensure default is 1.
    // If user explicitly changed it, we keep it. If it's a restart, maybe they want to keep the level?
    // Let's ensure the input has a value.
    let inputLevel = parseInt(document.getElementById('levelSelect').value);
    if (!inputLevel || inputLevel < 1) {
        inputLevel = 1;
        document.getElementById('levelSelect').value = 1;
    }
    level = inputLevel;

    // UI Update
    updateMuteUI();
    updateHighScoreDisplay();
    document.getElementById('highScore').classList.remove('new-best');

    paddle.dx = parseInt(document.getElementById('paddleSpeedSlider').value); // Use paddle slider value

    document.getElementById('score').innerText = score;
    document.getElementById('livesSelect').value = lives;
    document.getElementById('levelSelect').value = level;
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('victoryScreen').style.display = 'none';

    // Ensure audio context is ready (must be resumed on user gesture usually)
    SoundManager.init();
    if (SoundManager.audioCtx && SoundManager.audioCtx.state === 'suspended') {
        SoundManager.audioCtx.resume();
    }

    initBricks(level);
    resetBall();

    if (!gameRunning) {
        gameRunning = true;
        draw();
    }
}

// Event listeners for buttons
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('victoryRestartBtn').addEventListener('click', startGame);

const speedSlider = document.getElementById('speedSlider');
speedSlider.addEventListener('input', (e) => updateSpeed(parseInt(e.target.value)));

const levelInput = document.getElementById('levelSelect');
levelInput.addEventListener('change', (e) => {
    let newLevel = parseInt(e.target.value);
    if (newLevel < 1) newLevel = 1;
    level = newLevel;
    initBricks(level);
    // Optional: Reset ball if desired, but user asked for "mid-game change", so maybe keep ball?
    // But if bricks appear on top of ball, it's bad. Let's reset ball for safety.
    resetBall();
});

const livesInput = document.getElementById('livesSelect');
livesInput.addEventListener('change', (e) => {
    let newLives = parseInt(e.target.value);
    if (newLives < 1) newLives = 1;
    lives = newLives;
});

const paddleSpeedSlider = document.getElementById('paddleSpeedSlider');
paddleSpeedSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    paddle.dx = val;
    document.getElementById('paddleSpeedDisplay').innerText = val;
});

function updateSpeed(newSpeed) {
    balls.forEach(ball => {
        ball.speed = newSpeed;
        if (!ballOnPaddle && (ball.dx !== 0 || ball.dy !== 0)) {
            const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            const scale = ball.speed / currentSpeed;
            ball.dx *= scale;
            ball.dy *= scale;
        }
    });
    document.getElementById('speedDisplay').innerText = newSpeed;
}

// Start the game initially
initBricks(level);
startGame();
