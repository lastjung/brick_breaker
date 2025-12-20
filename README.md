# Neon Brick Breaker 🧱✨

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen?style=for-the-badge&logo=gamepad)](https://lastjung.github.io/brick_breaker/)

A stylish, neon-themed Brick Breaker game created by Gemini 3 Pro and Antigravity.

## Key Features 🚀

### 1. Stunning Neon Design
- Features vibrant neon colors and glow effects for a modern, sleek visual experience.
- High-contrast dark mode design reduces eye strain and enhances immersion.

### 2. Full Mobile Optimization (iOS/Android)
- **Thick Mobile Paddle**: The paddle automatically expands to 40px on mobile screens (below 1280px) for better touch control.
- **Viewport Locking**: Prevents screen scrolling or bouncing, providing a native-app-like feel.
- **Responsive Layout**: Automatically hides non-essential UI (like control panels) to maximize the game area on smaller screens.

### 3. Procedural Audio with Web Audio API
- **Dynamic Sound Synthesis**: Instead of using static audio files, the game generates sound in real-time using the **Web Audio API OscillatorNode**.
- **Real-time Envelopes**: Implements `exponentialRampToValueAtTime` to create smooth volume decays (gain envelopes), mirroring the feel of classic 8-bit hardware.
- **Context Management**: Features an intelligent `SoundManager` that handles browser autoplay policies, ensuring audio context resumption only upon user interaction.
- **Unique Timbre Mapping**: Uses different waveforms (Sine, Square, Triangle, Sawtooth) to distinguish between hits, wall bounces, and level progression.

### 4. Custom Settings & Infinite Levels
- **Slider Controls**: Adjust ball speed and paddle movement speed in real-time during gameplay.
- **Level & Life Management**: Manually set starting levels and lives directly from the HUD.
- **Endless Patterns**: Diverse brick patterns like checkerboards, pyramids, and columns appear as you progress.

## Controls 🎮

- **Start**: Click the screen or press the `Space` key.
- **Paddle Movement**:
  - **PC**: Move the mouse or use keyboard arrow keys (`←`, `→`).
  - **Mobile**: Touch and swipe near the paddle.
- **Mouse Capture Mode**: Click the 'Capture Mouse' button to lock your cursor for more precise, professional control. (Press `Esc` to release.)

## Tech Stack 🛠

- **Structure**: HTML5 Semantic Elements
- **Styling**: CSS3 (Flexbox, Grid, Animations, Glassmorphism)
- **Logic**: Vanilla JavaScript
- **Graphics**: HTML5 Canvas API
- **Audio**: Web Audio API (Dynamic Oscillators)

---
*This project was developed with the support of AI Pair Programming from Google DeepMind.*
