const canvas = document.getElementById('game-canvas');
const messageUI = document.getElementById('message');
const powerBarIndicator = document.getElementById('power-bar-indicator');
const actionTextUI = document.getElementById('action-text');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialInstructions = document.getElementById('tutorial-instructions');
const startGameBtn = document.getElementById('start-game-btn');
const playerScoreMarkersUI = document.getElementById('player-score-markers');
const opponentScoreMarkersUI = document.getElementById('opponent-score-markers');

// --- Sound Manager ---
// To use local sounds, create an 'sounds' folder next to your index.html
// and place your audio files inside it with the names specified below.
const soundManager = {
    sounds: {},
    bgmVolume: 0.4,
    init() {
        const soundPath = 'sounds/';
        this.sounds.click = new Howl({ src: [`${soundPath}click.wav`], volume: 0.6 });
        this.sounds.throw = new Howl({ src: [`${soundPath}throw.mp3`], volume: 0.5 });
        this.sounds.impactHit = new Howl({ src: [`${soundPath}impact-hit.mp3`] });
        this.sounds.impactMiss = new Howl({ src: [`${soundPath}impact-miss.mp3`], volume: 0.8 });
        this.sounds.score = new Howl({ src: [`${soundPath}score.mp3`] });
        this.sounds.win = new Howl({ src: [`${soundPath}win.mp3`] });
        this.sounds.lose = new Howl({ src: [`${soundPath}lose.mp3`] });
        this.sounds.bgm = new Howl({
            src: [`${soundPath}bgm.mp3`],
            loop: true,
            volume: this.bgmVolume
        });
    },
    play(soundName) {
        // Play sound if it exists and the library is ready.
        // Howler handles browser audio unlocking on the first user interaction.
        if (this.sounds[soundName]) {
            this.sounds[soundName].play();
        }
    }
};
soundManager.init();

// --- Device Detection & Text Helpers ---
const IS_TOUCH_DEVICE = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function getInstructionText(desktopText) {
    if (!IS_TOUCH_DEVICE) {
        return desktopText;
    }
    return desktopText.replace(/Click/g, 'Tap');
}

// --- Renderer and Scene ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraLookAtTarget = new THREE.Vector3(0, 0, 0);

// --- Responsive Camera Settings ---
const cameraSettings = {
    landscape: {
        originalPos: new THREE.Vector3(0, 8, 12),
        turn: { y: 4, z: 1 },
        orbitRadius: 9
    },
    portrait: {
        originalPos: new THREE.Vector3(0, 12, 18),
        turn: { y: 6, z: 4 },
        orbitRadius: 12
    }
};
let currentCameraSettings = cameraSettings.landscape; // Default
const originalCameraPos = new THREE.Vector3(); // Will be set by updateLayout

// --- Lighting (Subway Style) ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const spotlights = [];
function createSpotlight(x, z) {
    const spotLight = new THREE.SpotLight(0xffffee, 0.8, 30, Math.PI * 0.15, 0.5);
    spotLight.position.set(x, 12, z);
    spotLight.originalPos = spotLight.position.clone();
    spotLight.originalAngle = spotLight.angle;
    spotLight.castShadow = true;
    scene.add(spotLight);
    scene.add(spotLight.target); // Add target to the scene to make it transformable
    spotlights.push(spotLight);
}
createSpotlight(-5, 0);
createSpotlight(5, 0);

// --- Textures ---
const textureLoader = new THREE.TextureLoader();
const floorTexture = textureLoader.load('https://threejs.org/examples/textures/hardwood2_roughness.jpg');
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10);

// --- Ground (Subway Platform) ---
const groundMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8, metalness: 0.1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Impact Effect ---
const shockwaveGeometry = new THREE.RingGeometry(0.1, 1, 32);
const shockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0 });
const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
shockwave.rotation.x = -Math.PI / 2;
shockwave.visible = false;
scene.add(shockwave);

// --- Confetti Effect ---
let confettiSystem;
const confettiParticles = [];

function createPointTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width / 2
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new THREE.CanvasTexture(canvas);
}

function createConfetti() {
    const particleCount = 500;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const palette = [new THREE.Color(0xffd700), new THREE.Color(0x4a7de1), new THREE.Color(0xe12a2a), new THREE.Color(0xffffff)];

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 1] = 15 + Math.random() * 5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 25;

        const color = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        confettiParticles.push({
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02, // x drift
                -0.05 - Math.random() * 0.05, // y velocity
                (Math.random() - 0.5) * 0.02  // z drift
            ),
            landed: false
        });
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.5,
        map: createPointTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false // Prevents transparent particles from occluding each other incorrectly
    });
    confettiSystem = new THREE.Points(particles, material);
    confettiSystem.visible = false;
    scene.add(confettiSystem);
}

function updateConfetti() {
    if (!confettiSystem || !confettiSystem.visible) return;
    const positions = confettiSystem.geometry.attributes.position.array;

    for (let i = 0; i < confettiParticles.length; i++) {
        const particle = confettiParticles[i];
        if (particle.landed) continue;

        positions[i * 3]     += particle.velocity.x;
        positions[i * 3 + 1] += particle.velocity.y;
        positions[i * 3 + 2] += particle.velocity.z;

        // Settle on the floor
        if (positions[i * 3 + 1] <= 0) {
            positions[i * 3 + 1] = 0.01; // Use a small positive value to avoid z-fighting with the floor
            particle.landed = true;
        }
    }
    confettiSystem.geometry.attributes.position.needsUpdate = true;
}

// --- Game Constants ---
const TILE_HEIGHT = 0.1;
const TILE_Y_REST = 0.05; // y-position when on the ground (center of tile)
const TILE_WIDTH = 1.5;
const WIN_SCORE = 5;

// --- Tile Creation ---
function createDdakji(color) {
    const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4 });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(TILE_WIDTH, TILE_HEIGHT, TILE_WIDTH), material);
    tile.originalColor = material.color.clone();
    tile.castShadow = true;
    return tile;
}

const playerTile = createDdakji(0x4a7de1);
playerTile.position.set(0, TILE_Y_REST, 4);
scene.add(playerTile);

const opponentTile = createDdakji(0xe12a2a);
opponentTile.position.set(0, TILE_Y_REST, -4);
scene.add(opponentTile);

// --- Game State & Power Bar ---
let gameState = 'TUTORIAL'; // Start in tutorial mode
let playerScore = 0, opponentScore = 0;
let gameOverTween;

const powerBar = {
    tween: null,
    indicator: document.getElementById('power-bar-indicator'),
    // Configuration for power levels. Order matters: from best to worst.
    config: [
        { quality: 'super', threshold: 1, feedbackClass: 'hit-super' },
        { quality: 'great', threshold: 4, feedbackClass: 'hit-great' },
        { quality: 'good', threshold: 20, feedbackClass: 'hit-good' },
        { quality: 'poor', threshold: 50, feedbackClass: 'hit-poor' } // Threshold of 50 covers the entire bar
    ],

    start() {
        this.indicator.className = 'power-bar-indicator'; // Reset visual feedback
        this.indicator.style.left = '0%';
        this.tween = gsap.to(this.indicator, {
            left: 'calc(100% - 4px)', // Adjust for indicator width
            duration: 1.2,
            ease: 'none',
            yoyo: true,
            repeat: -1
        });
    },

    stop() {
        if (this.tween) this.tween.pause();

        // Calculate the indicator's position as a percentage (0-100)
        const parentWidth = this.indicator.parentElement.offsetWidth;
        const percentage = (this.indicator.offsetLeft / (parentWidth - 4)) * 100;
        const distanceFromCenter = Math.abs(percentage - 50);

        let result = {};

        // Find the matching quality based on the distance from the center
        for (const level of this.config) {
            if (distanceFromCenter <= level.threshold) {
                result.quality = level.quality;
                result.feedbackClass = level.feedbackClass;
                break;
            }
        }

        // Strength is calculated as a linear falloff from the center.
        // A direct hit in the center is 100% (1.0), and it decreases from there.
        // We use Math.max to ensure strength never goes below zero.
        result.strength = Math.max(0, 1 - (distanceFromCenter / 50));
        
        // Special case for 'super' to guarantee max strength
        if (result.quality === 'super') {
            result.strength = 1.0;
        }

        this.indicator.classList.add(result.feedbackClass);

        return { strength: result.strength, quality: result.quality };
    }
};

function addScoreMarker(isPlayer) {
    const marker = document.createElement('div');
    marker.className = 'score-marker';
    if (isPlayer) {
        marker.classList.add('player');
        playerScoreMarkersUI.appendChild(marker);
    } else {
        marker.classList.add('opponent');
        opponentScoreMarkersUI.appendChild(marker);
    }
}
function resetScoreboard() {
    playerScoreMarkersUI.innerHTML = '';
    opponentScoreMarkersUI.innerHTML = '';
}

function handleClick() {
    if (gameState === 'TUTORIAL') return; // Ignore game clicks while tutorial is active

    if (gameState === 'WAITING_FOR_INPUT') {
        soundManager.play('click');
        gameState = 'POWERING_UP';
        messageUI.textContent = getInstructionText('Click again to throw!');
        powerBar.start();
    } else if (gameState === 'POWERING_UP') {
        const throwData = powerBar.stop(); // Gets {strength, quality}
        playerThrow(throwData);
    } else if (gameState === 'GAME_OVER') {
        soundManager.play('click');
        resetGame();
    }
}

// --- Game Logic ---
function showActionText(text) {
    actionTextUI.textContent = text;
    gsap.fromTo(actionTextUI, 
        { opacity: 1, scale: 0.5 }, 
        { opacity: 0, scale: 1.5, duration: 1.5, ease: 'power2.out' }
    );
}

function playShockwave(position) {
    shockwave.position.copy(position);
    shockwave.position.y = 0.01; // Just above the ground
    shockwave.visible = true;
    shockwave.scale.set(1, 1, 1);
    shockwave.material.opacity = 0.8;

    gsap.to(shockwave.scale, { x: 15, y: 15, z: 15, duration: 0.7, ease: 'power2.out' });
    gsap.to(shockwave.material, { opacity: 0, duration: 0.8, ease: 'power1.in', onComplete: () => shockwave.visible = false });
}


function playerThrow(throwData) { // Takes the object {strength, quality}
    gameState = 'PLAYER_THROWING';
    messageUI.textContent = '...';
    handleTurn(playerTile, opponentTile, throwData.strength, true, throwData.quality);
}

function opponentTurn() {
    gameState = 'OPPONENT_THROWING';
    messageUI.textContent = 'Opponent is throwing...';
    // Opponent strength is randomized
    const strength = 0.6 + Math.random() * 0.4; // Varies from 60% to 100%
    setTimeout(() => handleTurn(opponentTile, playerTile, strength, false), 1000);
}

function handleTurn(attacker, defender, strength, isPlayerTurn, quality = null) {
    // To prevent clipping when resetting rotation, we lift, rotate, then lower the tile.
    // This creates a small "readying" animation before the throw.
    const liftHeight = (TILE_WIDTH / 2) + TILE_Y_REST; // Calculate safe height to clear the floor during rotation.
    const setupTl = gsap.timeline();
    setupTl.to(attacker.position, { y: liftHeight, duration: 0.15, ease: 'power1.out' })
        .to(attacker.rotation, { x: 0, y: 0, z: 0, duration: 0.2, ease: 'none' })
        .to(attacker.position, { y: TILE_Y_REST, duration: 0.15, ease: 'power1.in' });

    // --- Camera & Text ---
    // Animate camera to focus on the defender
    gsap.to(camera.position, {
        x: 0,
        y: currentCameraSettings.turn.y,
        z: isPlayerTurn ? currentCameraSettings.turn.z : -currentCameraSettings.turn.z,
        duration: 0.8,
        ease: 'power2.inOut'
    });
    gsap.to(cameraLookAtTarget, {
        x: 0,
        y: TILE_Y_REST,
        z: defender.position.z,
        duration: 0.8,
        ease: 'power2.inOut'
    });

    // Show action text based on strength
    let useSlowMo = false;
    if (isPlayerTurn && quality) { // Only show text for player's quality
        if (quality === 'super') {
            showActionText('Super Slam!');
            useSlowMo = true;
        } else if (quality === 'great') {
            showActionText('Great!');
        } else if (quality === 'good') {
            showActionText('Good');
        } else {
            showActionText('Poor');
        }
    }

    const tl = gsap.timeline({
        delay: setupTl.duration(), // Start throw animation after setup is complete
        onComplete: () => {
            // On impact effects
            playShockwave(defender.position);
            gsap.to(camera.position, { x: '+=0.1', y: '+=0.1', duration: 0.05, yoyo: true, repeat: 5 }); // Camera shake
            if (useSlowMo) {
                gsap.globalTimeline.timeScale(1); // Reset time scale on impact
            }

            const success = Math.random() < strength;

            if (success) {
                soundManager.play('impactHit');
                // SUCCESS: Defender tile is flipped
                const flipHeight = TILE_WIDTH / 2;
                gsap.to(defender.position, { y: TILE_Y_REST + flipHeight, duration: 0.15, ease: 'power2.out' });
                gsap.to(attacker.position, { y: TILE_Y_REST + (flipHeight * 3) + TILE_HEIGHT * 2, duration: 0.2, ease: 'power2.out' });

                gsap.to(defender.rotation, { x: `+=${Math.PI}`, duration: 0.4, ease: 'back.out(1.7)', delay: 0.1 });
                gsap.to(defender.position, { y: TILE_Y_REST, duration: 0.3, ease: 'bounce.out', delay: 0.2 });

                // Attacker reaction
                const attackerFlipStrength = Math.random() * strength;
                if (attackerFlipStrength > 0.5) {
                    // Full flip
                    gsap.to(attacker.rotation, { x: `+=${Math.PI}`, duration: 0.4, ease: 'back.out(1.7)', delay: 0.15 });
                } else {
                    // Partial flip (wobble)
                    gsap.to(attacker.rotation, { x: `+=${Math.PI * attackerFlipStrength}`, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.inOut', delay: 0.15 });
                }


                if (isPlayerTurn) {
                    playerScore++;
                    messageUI.textContent = 'FLIPPED!';
                } else {
                    opponentScore++;
                    messageUI.textContent = 'OPPONENT FLIPPED!';
                }
                setTimeout(() => soundManager.play('score'), 300); // Play score sound shortly after impact
                addScoreMarker(isPlayerTurn);
            } else {
                soundManager.play('impactMiss');
                // MISS: Defender tile just jiggles
                gsap.to(defender.position, { y: 0.4, duration: 0.05, ease: 'power2.out' });
                gsap.to(attacker.position, { y: 0.4 + TILE_HEIGHT, duration: 0.05, ease: 'power2.out' });

                const jiggleDirection = isPlayerTurn ? '+=0.1' : '-=0.1';
                gsap.to(defender.position, { x: jiggleDirection, duration: 0.05, yoyo: true, repeat: 4, ease: 'power2.inOut', delay: 0.05 });
                gsap.to(defender.position, { y: TILE_Y_REST, duration: 0.3, ease: 'bounce.out', delay: 0.2 });

                messageUI.textContent = isPlayerTurn ? 'MISSED!' : 'OPPONENT MISSED!';
            }

            // Attacker lands on top of defender
            gsap.to(attacker.position, { x: 0, y: TILE_Y_REST + TILE_HEIGHT, duration: 0.3, ease: 'bounce.out', delay: success ? 0.4 : 0.2 });

            // Set up the next turn
            setTimeout(() => {
                const winner = checkWinCondition();
                if (winner) {
                    gameOver(winner === 'player');
                } else {
                    if (isPlayerTurn) {
                        gsap.to(attacker.position, { x: 0, y: TILE_Y_REST, z: 4, duration: 0.5 });
                        opponentTurn();
                    } else {
                        gsap.to(attacker.position, { x: 0, y: TILE_Y_REST, z: -4, duration: 0.5 });
                        gameState = 'WAITING_FOR_INPUT';
                        messageUI.textContent = getInstructionText('Click to start power bar');

                        // Reset camera to original position for the next player turn
                        gsap.to(camera.position, { x: originalCameraPos.x, y: originalCameraPos.y, z: originalCameraPos.z, duration: 1, ease: 'power2.inOut' });
                        gsap.to(cameraLookAtTarget, { x: 0, y: 0, z: 0, duration: 1, ease: 'power2.inOut' });
                    }
                }
            }, 2000);
        }
    });

    // Throw animation timeline
    const slamZ = defender.position.z;
    const throwDuration = isPlayerTurn ? (0.8 - (strength * 0.4)) : 0.8;

    // Anticipation
    tl.to(attacker.position, { z: isPlayerTurn ? '+=0.5' : '-=0.5', y: '+=0.2', duration: 0.3, ease: 'power1.in' })
      .to(attacker.rotation, { x: isPlayerTurn ? -Math.PI / 8 : Math.PI / 8, duration: 0.3, ease: 'power1.in' }, "<")
      .add(() => soundManager.play('throw'))
      // The Throw
      .to(attacker.position, { y: 2.5, duration: throwDuration * 0.3, ease: 'power1.out' })
      .to(attacker.rotation, { y: Math.random() * 10 - 5, x: Math.PI * 2, duration: throwDuration, ease: 'power1.inOut' }, "<")
      .to(attacker.position, { z: slamZ, duration: throwDuration * 0.7, ease: 'power2.in' })
      // Slow-mo trigger just before impact
      .add(() => {
          if (useSlowMo) {
              gsap.globalTimeline.timeScale(0.25);
          }
      }, "-=0.2")
      .to(attacker.position, { y: TILE_Y_REST + TILE_HEIGHT, duration: 0.1, ease: 'power4.in' }); // Slam
}

function checkWinCondition() {
    if (playerScore >= WIN_SCORE) return 'player';
    if (opponentScore >= WIN_SCORE) return 'opponent';
    return null;
}

function createShatterEffect(tile) {
    const SHARD_COUNT = 30;

    // Hide the original tile immediately
    tile.visible = false;

    for (let i = 0; i < SHARD_COUNT; i++) {
        // Clone material for each shard so they can fade independently
        const shardMaterial = tile.material.clone();
        shardMaterial.transparent = true;

        const shardSize = Math.random() * 0.25 + 0.05;
        const shardGeometry = new THREE.BoxGeometry(shardSize, TILE_HEIGHT, shardSize);
        const shard = new THREE.Mesh(shardGeometry, shardMaterial);

        shard.position.copy(tile.position);
        scene.add(shard);

        const duration = 1.5 + Math.random() * 1.0;

        // Animate the shard flying outwards and falling
        gsap.to(shard.position, {
            duration: duration,
            x: shard.position.x + (Math.random() - 0.5) * 8,
            y: -1, // Fall below the floor
            z: shard.position.z + (Math.random() - 0.5) * 8,
            ease: 'power2.out',
        });

        // Animate random tumbling
        gsap.to(shard.rotation, {
            duration: duration,
            x: (Math.random() - 0.5) * 20,
            y: (Math.random() - 0.5) * 20,
            z: (Math.random() - 0.5) * 20,
            ease: 'none'
        });

        // Animate fade out and cleanup
        gsap.to(shard.material, {
            duration: duration,
            opacity: 0,
            ease: 'power2.in',
            onComplete: () => {
                // Clean up Three.js objects to prevent memory leaks
                scene.remove(shard);
                shard.geometry.dispose();
                shard.material.dispose();
            }
        });
    }
}

function gameOver(playerWon) {
    gameState = 'GAME_OVER';
    const message = playerWon ? 'YOU WIN!' : 'YOU LOSE!';
    showActionText(message);
    messageUI.textContent = getInstructionText('Click to Play Again');

    // Fade down BGM to make win/loss sounds more prominent
    if (soundManager.sounds.bgm && soundManager.sounds.bgm.playing()) {
        soundManager.sounds.bgm.fade(soundManager.bgmVolume, 0.1, 1000);
    }

    const winnerTile = playerWon ? playerTile : opponentTile;
    const loserTile = playerWon ? opponentTile : playerTile;

    if (playerWon) {
        soundManager.play('win');
        // --- WIN STATE ---
        confettiSystem.visible = true;
        gsap.to(confettiSystem.material, { opacity: 1, duration: 1 });
        spotlights.forEach(light => {
            gsap.to(light, { intensity: 1.5, duration: 1 });
            gsap.to(light.color, { r: 1, g: 0.9, b: 0.8, duration: 1 });
        });
    } else {
        soundManager.play('lose');
        // --- LOSE STATE ---        
        createShatterEffect(loserTile);

        // Dramatic lighting on the winner
        gsap.to(ambientLight, { intensity: 0.1, duration: 1.5 });
        spotlights.forEach((light, index) => {
            if (index === 0) { // Use the first spotlight as our hero light
                gsap.to(light.position, { x: winnerTile.position.x, y: 8, z: winnerTile.position.z, duration: 1.5, ease: 'power2.inOut' });
                // Animate the target to point directly at the winner tile
                gsap.to(light.target.position, { x: winnerTile.position.x, y: winnerTile.position.y, z: winnerTile.position.z, duration: 1.5, ease: 'power2.inOut' });
                gsap.to(light, { intensity: 2.0, angle: Math.PI * 0.1, duration: 1.5 });
                gsap.to(light.color, { r: 0.8, g: 0.9, b: 1.0, duration: 1.5 }); // Cold light
            } else {
                gsap.to(light, { intensity: 0, duration: 1.5 }); // Turn off other lights
            }
        });
    }

    const orbitTarget = winnerTile.position;
    const orbit = { angle: 0 };

    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(cameraLookAtTarget);

    const camTl = gsap.timeline();
    camTl.to(camera.position, {
        x: orbitTarget.x,
        y: orbitTarget.y + 3,
        z: orbitTarget.z + 6,
        duration: 1.5,
        ease: 'power3.inOut'
    }).to(cameraLookAtTarget, {
        x: orbitTarget.x,
        y: orbitTarget.y,
        z: orbitTarget.z,
        duration: 1.5,
        ease: 'power3.inOut'
    }, "<");

    gameOverTween = gsap.to(orbit, { // This tween now only handles the orbit
        angle: Math.PI * 2,
        duration: 5,
        ease: 'none',
        repeat: -1,
        delay: 1.5, // Start after the zoom-in
        onUpdate: () => {
            const radius = currentCameraSettings.orbitRadius;
            camera.position.x = orbitTarget.x + Math.sin(orbit.angle) * radius;
            camera.position.z = orbitTarget.z + Math.cos(orbit.angle) * radius;
            camera.lookAt(orbitTarget);
        }
    });
}

function resetGame() {
    playerScore = 0;
    opponentScore = 0;
    resetScoreboard();

    if (gameOverTween) gameOverTween.kill();
    // Fade BGM volume back to normal
    if (soundManager.sounds.bgm && soundManager.sounds.bgm.playing()) {
        soundManager.sounds.bgm.fade(0.1, soundManager.bgmVolume, 1000);
    }
    gsap.globalTimeline.timeScale(1);

    if (confettiSystem) {
        gsap.to(confettiSystem.material, {
            opacity: 0,
            duration: 0.5,
            onComplete: () => {
                confettiSystem.visible = false;
                // Reset confetti positions and state for the next game
                const positions = confettiSystem.geometry.attributes.position.array;
                for (let i = 0; i < confettiParticles.length; i++) {
                    confettiParticles[i].landed = false;
                    positions[i * 3 + 1] = 15 + Math.random() * 5; // Reset y position
                }
                confettiSystem.geometry.attributes.position.needsUpdate = true;
            }
        });
    }

    spotlights.forEach(light => {
        gsap.to(light, { intensity: 0.8, angle: light.originalAngle, duration: 1 });
        gsap.to(light.position, { x: light.originalPos.x, y: light.originalPos.y, z: light.originalPos.z, duration: 1 });
        gsap.to(light.target.position, { x: 0, y: 0, z: 0, duration: 1 }); // Reset target position
        gsap.to(light.color, { r: 1, g: 1, b: 0.933, duration: 1 });
    });
    gsap.to(ambientLight, { intensity: 0.2, duration: 1 });

    gsap.to(actionTextUI, { opacity: 0, duration: 0.2 });

    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(cameraLookAtTarget);
    // Reset camera
    gsap.to(camera.position, { x: originalCameraPos.x, y: originalCameraPos.y, z: originalCameraPos.z, duration: 1, ease: 'power2.inOut' });
    gsap.to(cameraLookAtTarget, { x: 0, y: 0, z: 0, duration: 1, ease: 'power2.inOut' });

    // Reset tiles
    playerTile.visible = true;
    opponentTile.visible = true;

    const liftHeight = (TILE_WIDTH / 2) + TILE_Y_REST;
    const totalDuration = 0.8;
    const resetTl = gsap.timeline();

    // 1. Lift tiles, move to start positions, and reset rotation all while safely in the air.
    resetTl.to(playerTile.position, { y: liftHeight, x: 0, z: 4, duration: totalDuration / 2, ease: 'power2.out' }, 0);
    resetTl.to(opponentTile.position, { y: liftHeight, x: 0, z: -4, duration: totalDuration / 2, ease: 'power2.out' }, 0);
    resetTl.to([playerTile.rotation, opponentTile.rotation], { x: 0, y: 0, z: 0, duration: totalDuration / 2, ease: 'none' }, 0);

    // 2. Lower both tiles back to the ground.
    resetTl.to([playerTile.position, opponentTile.position], { y: TILE_Y_REST, duration: totalDuration / 2, ease: 'bounce.out' });

    gsap.to(playerTile.material.color, { r: playerTile.originalColor.r, g: playerTile.originalColor.g, b: playerTile.originalColor.b, duration: 0.5 });
    gsap.to(opponentTile.material.color, { r: opponentTile.originalColor.r, g: opponentTile.originalColor.g, b: opponentTile.originalColor.b, duration: 0.5 });

    gameState = 'WAITING_FOR_INPUT';
    messageUI.textContent = getInstructionText('Click to start power bar');
}

document.addEventListener('click', handleClick); // Main game loop click
startGameBtn.addEventListener('click', startGame); // Specific button for tutorial

// --- Render Loop ---
function animate() {
    requestAnimationFrame(animate);
    updateConfetti();
    camera.lookAt(cameraLookAtTarget);
    renderer.render(scene, camera);
}

// --- Tutorial Logic ---
function showTutorial() {
    const action = IS_TOUCH_DEVICE ? 'Tap' : 'Click';

    tutorialInstructions.innerHTML = `
        1. <b>${action}</b> the screen to start the power bar.<br><br>
        2. <b>${action} again</b> to stop the indicator.<br><br>
        Aim for the bright center for a <b>Super Slam!</b>
    `;
    // The overlay is visible by default in CSS, no need to show it here.
}

function startGame() {
    soundManager.play('click');
    // Start background music on the first real interaction
    if (soundManager.sounds.bgm && !soundManager.sounds.bgm.playing()) {
        soundManager.sounds.bgm.play();
    }

    // Fade out the tutorial overlay
    gsap.to(tutorialOverlay, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
            tutorialOverlay.style.display = 'none';
        }
    });
    
    // Transition to the first game state
    gameState = 'WAITING_FOR_INPUT';
    messageUI.textContent = getInstructionText('Click to start power bar');
}


// --- Layout and Resize ---
function updateLayout() {
    const aspect = window.innerWidth / window.innerHeight;
    const isPortrait = aspect < 1;
    currentCameraSettings = isPortrait ? cameraSettings.portrait : cameraSettings.landscape;
    originalCameraPos.copy(currentCameraSettings.originalPos);

    // If the game is in a state where the camera should be at its default position,
    // smoothly transition it. This avoids jarring camera jumps on resize during gameplay.
    if (gameState === 'WAITING_FOR_INPUT') {
        gsap.killTweensOf(camera.position);
        gsap.to(camera.position, {
            x: originalCameraPos.x,
            y: originalCameraPos.y,
            z: originalCameraPos.z,
            duration: 0.5,
            ease: 'power2.inOut'
        });
    }
    // The camera position during other states (throwing, game over) is handled by their
    // own animations, which will now use the updated `currentCameraSettings`.
}

// --- Window Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateLayout();
});

createConfetti();
updateLayout(); // Set initial layout based on aspect ratio
camera.position.copy(originalCameraPos); // Set initial camera position
showTutorial(); // Show the tutorial on initial load
animate();
