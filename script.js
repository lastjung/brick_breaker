const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const PADDLE_WIDTH = 100; // Slightly smaller for narrower canvas
const PADDLE_HEIGHT = 15;
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
let animationId;
let ballOnPaddle = true; // New flag for manual start

// Sound Manager
const SoundManager = {
    audioCtx: null,

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.audioCtx) return;
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
    dx: 15,
    color: '#0ff'
};

// Ball
const ball = {
    x: canvas.width / 2,
    y: canvas.height - 50,
    dx: 0,
    dy: 0,
    radius: BALL_RADIUS,
    speed: 5, // Initial speed set to 5
    color: '#fff'
};

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
    (c, r) => r >= c && r < BRICK_ROW_COUNT - c ? 1 : 0, // Simplified pyramid
    // Level 4: Columns
    (c, r) => c % 2 === 0 ? 1 : 0
];

function initBricks(levelIndex) {
    bricks = [];
    const pattern = levels[(levelIndex - 1) % levels.length];

    for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
        bricks[c] = [];
        for (let r = 0; r < BRICK_ROW_COUNT; r++) {
            bricks[c][r] = {
                x: 0,
                y: 0,
                status: pattern(c, r),
                color: brickColors[r % brickColors.length]
            };
        }
    }
}

// Input handling
let rightPressed = false;
let leftPressed = false;

document.addEventListener('keydown', keyDownHandler, false);
document.addEventListener('keyup', keyUpHandler, false);
// Use global pointer move for better tracking even outside canvas
window.addEventListener('pointermove', mouseMoveHandler, false);
// Manual launch listeners
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') launchBall();
});
canvas.addEventListener('click', launchBall);
document.getElementById('startHint').addEventListener('click', launchBall);

function launchBall() {
    if (ballOnPaddle && gameRunning) {
        ballOnPaddle = false;
        document.getElementById('startHint').style.display = 'none';
        // SoundManager.init(); // Initialize audio context on user interaction - moved to startGame

        // Randomize start direction slightly
        ball.dx = ball.speed * (Math.random() > 0.5 ? 1 : -1);
        ball.dy = -ball.speed;
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
function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.shadowBlur = 15;
    ctx.shadowColor = ball.color;
    ctx.closePath();
    ctx.shadowBlur = 0;
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

function drawBricks() {
    for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
        for (let r = 0; r < BRICK_ROW_COUNT; r++) {
            if (bricks[c][r].status === 1) {
                const brickX = (c * (BRICK_WIDTH + BRICK_PADDING)) + BRICK_OFFSET_LEFT;
                const brickY = (r * (BRICK_HEIGHT + BRICK_PADDING)) + BRICK_OFFSET_TOP;
                bricks[c][r].x = brickX;
                bricks[c][r].y = brickY;

                ctx.beginPath();
                ctx.roundRect(brickX, brickY, BRICK_WIDTH, BRICK_HEIGHT, 4);
                ctx.fillStyle = bricks[c][r].color;
                ctx.fill();
                ctx.shadowBlur = 10;
                ctx.shadowColor = bricks[c][r].color;
                ctx.closePath();
                ctx.shadowBlur = 0;
            }
        }
    }
}

function collisionDetection() {
    let activeBricks = 0;
    for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
        for (let r = 0; r < BRICK_ROW_COUNT; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                activeBricks++;
                if (ball.x > b.x && ball.x < b.x + BRICK_WIDTH && ball.y > b.y && ball.y < b.y + BRICK_HEIGHT) {
                    ball.dy = -ball.dy;
                    b.status = 0;
                    score++;
                    SoundManager.playBrickHit();
                    document.getElementById('score').innerText = score;
                    activeBricks--;
                }
            }
        }
    }

    if (activeBricks === 0) {
        levelUp();
    }
}

function levelUp() {
    level++;
    SoundManager.playLevelUp();
    document.getElementById('levelSelect').value = level;

    // Increase base speed
    ball.speed += 1;

    initBricks(level);
    resetBall();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBricks();
    drawBall();
    drawPaddle();
    collisionDetection();

    if (ballOnPaddle) {
        // Lock ball to paddle
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius - 2;
    } else {
        // Ball movement
        if (ball.x + ball.dx > canvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
            ball.dx = -ball.dx;
            SoundManager.playWallHit();
        }

        // Ceiling collision
        else if (ball.y + ball.dy < ball.radius) {
            ball.dy = -ball.dy;
            SoundManager.playWallHit();
        }
        // Paddle collision
        else if (ball.dy > 0 && ball.y + ball.radius >= paddle.y && ball.y < paddle.y + paddle.height / 2) {
            if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
                // Ball hit paddle
                SoundManager.playPaddleHit();

                // Reset ball position to top of paddle to prevent sticking
                ball.y = paddle.y - ball.radius;

                let collidePoint = ball.x - (paddle.x + paddle.width / 2);
                collidePoint = collidePoint / (paddle.width / 2);

                let angle = collidePoint * (Math.PI / 3); // Max 60 degrees

                let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                if (speed < 4) speed = 4;

                ball.dx = speed * Math.sin(angle);
                ball.dy = -speed * Math.cos(angle);
            }
        }

        // Check if ball is completely off screen (bottom)
        if (ball.y - ball.radius > canvas.height) {
            lives--;
            document.getElementById('livesSelect').value = lives;
            SoundManager.playLifeLoss();

            // Visual feedback
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

        ball.x += ball.dx;
        ball.y += ball.dy;
    }

    // Paddle movement
    if (rightPressed && paddle.x < canvas.width - paddle.width) {
        paddle.x += paddle.dx;
    } else if (leftPressed && paddle.x > 0) {
        paddle.x -= paddle.dx;
    }

    if (gameRunning) {
        animationId = requestAnimationFrame(draw);
    }
}

function resetBall() {
    ballOnPaddle = true;
    document.getElementById('startHint').style.display = 'flex';
    ball.x = canvas.width / 2;
    ball.y = canvas.height - 50;
    ball.dx = 0;
    ball.dy = 0;
    paddle.x = canvas.width / 2 - PADDLE_WIDTH / 2;
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    document.getElementById('finalScore').innerText = score;
    document.getElementById('gameOverScreen').style.display = 'flex';
    SoundManager.playGameOver();
    console.log("Game Over");
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

    ball.speed = parseInt(document.getElementById('speedSlider').value); // Use slider value
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
    ball.speed = newSpeed;
    document.getElementById('speedDisplay').innerText = ball.speed;

    // If ball is moving, update its velocity vector while preserving direction
    if (!ballOnPaddle && (ball.dx !== 0 || ball.dy !== 0)) {
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        const scale = ball.speed / currentSpeed;
        ball.dx *= scale;
        ball.dy *= scale;
    }
}

// Start the game initially
initBricks(level);
startGame();
