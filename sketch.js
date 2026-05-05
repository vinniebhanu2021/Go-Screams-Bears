let gameState = "start";
let mic;
let amp;
let analyser;
let audioReady = false;

let player;
let obstacles = [];
let particles = [];
let clouds = [];
let shrubs = [];
let pillars = [];
let score = 0;
let highScore = 0;
let scrollX = 0;
let obstacleTimer = 0;
let difficultyTimer = 0;
let speed = 7;
let jumpQueued = false;
let lastJumpAt = 0;
let micLevelSmooth = 0;
let pitchSmooth = 0;
let flashAlpha = 0;
let skylineSeed = [];
let voiceCharge = 0;
let ambientLevel = 0.01;
let micDebugPeak = 0;
let micPermissionDenied = false;

const BASE_W = 1365;
const BASE_H = 768;
const GROUND_Y = 520;
const VOICE_LEVEL_THRESHOLD = 0.028;
const VOICE_PITCH_THRESHOLD = 155;
const JUMP_COOLDOWN = 260;

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Barlow Condensed");
  angleMode(DEGREES);
  imageMode(CENTER);
  highScore = Number(localStorage.getItem("screamBearsHighScore") || 0);
  resetWorld();
}

function resetWorld() {
  player = {
    x: width * 0.2,
    y: GROUND_Y,
    vy: 0,
    w: 106,
    h: 120,
    legPhase: 0,
    airborne: false,
    landingBounce: 0
  };

  score = 0;
  speed = 7;
  obstacleTimer = 65;
  difficultyTimer = 0;
  flashAlpha = 0;
  jumpQueued = false;
  voiceCharge = 0;
  ambientLevel = 0.01;
  micDebugPeak = 0;
  obstacles = [];
  particles = [];
  clouds = [];
  shrubs = [];
  pillars = [];
  skylineSeed = [];

  for (let i = 0; i < 7; i++) {
    clouds.push({
      x: random(width),
      y: random(60, 190),
      w: random(110, 220),
      s: random(0.12, 0.28)
    });
  }

  for (let i = 0; i < 5; i++) {
    shrubs.push({
      x: 450 + i * 210 + random(-40, 40),
      scale: random(0.75, 1.2),
      flowers: floor(random(9, 16))
    });
  }

  for (let i = 0; i < 4; i++) {
    pillars.push({
      x: 780 + i * 330 + random(-50, 40),
      h: random(58, 90)
    });
  }

  for (let i = 0; i < 10; i++) {
    skylineSeed.push({
      x: 180 + i * 90,
      h: random(90, 160)
    });
  }
}

function draw() {
  resizeIfNeeded();
  background(7, 16, 28);
  drawSky();
  drawCampus();
  drawGround();

  if (gameState === "play") {
    updateAudio();
    updateGame();
  } else {
    updateAudio();
  }

  drawWorldEntities();
  drawHud();

  if (gameState === "start") {
    drawStartOverlay();
  } else if (gameState === "gameover") {
    drawGameOverOverlay();
  }

  if (flashAlpha > 0.5) {
    noStroke();
    fill(255, 95, 60, flashAlpha);
    rect(0, 0, width, height);
    flashAlpha *= 0.9;
  }
}

function resizeIfNeeded() {
  if (width !== windowWidth || height !== windowHeight) {
    resizeCanvas(windowWidth, windowHeight);
    player.x = width * 0.2;
  }
}

function updateGame() {
  scrollX += speed;
  difficultyTimer++;
  obstacleTimer--;
  speed = min(17, 7 + difficultyTimer * 0.0022);

  if (obstacleTimer <= 0) {
    spawnObstacle();
    obstacleTimer = max(42, 102 - speed * 4 - random(0, 18));
  }

  let gravity = 0.86;
  if (player.airborne) {
    player.vy += gravity;
    player.y += player.vy;
  }

  if (player.y >= GROUND_Y) {
    if (player.airborne) {
      player.landingBounce = 9;
      burstDust(player.x - 12, GROUND_Y + 8, 8);
    }
    player.y = GROUND_Y;
    player.vy = 0;
    player.airborne = false;
  }

  if (player.landingBounce > 0) {
    player.landingBounce *= 0.82;
  }

  maybeQueueVoiceJump();

  if (jumpQueued && millis() - lastJumpAt > JUMP_COOLDOWN && !player.airborne) {
    doJump();
  }
  jumpQueued = false;

  player.legPhase += speed * 0.14;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    let obstacle = obstacles[i];
    obstacle.x -= speed;
    if (obstacle.type === "bush") {
      obstacle.spin += 2;
    }
    if (!obstacle.passed && obstacle.x + obstacle.w * 0.5 < player.x) {
      obstacle.passed = true;
      score++;
      highScore = max(highScore, score);
      localStorage.setItem("screamBearsHighScore", highScore);
    }
    if (obstacle.x < -200) {
      obstacles.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g;
    p.life -= 1;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  if (frameCount % 3 === 0 && !player.airborne) {
    particles.push({
      x: player.x - 30 + random(-5, 5),
      y: GROUND_Y + 10,
      vx: random(-2.6, -0.8),
      vy: random(-1.2, -0.2),
      g: 0.05,
      size: random(6, 11),
      life: 18,
      color: color(193, 140, 88, 170)
    });
  }

  checkCollisions();
}

function drawWorldEntities() {
  drawFarShrubs();

  for (let obstacle of obstacles) {
    drawObstacle(obstacle);
  }

  for (let p of particles) {
    noStroke();
    fill(p.color);
    ellipse(p.x, p.y, p.size, p.size * 0.8);
  }

  drawPlayer(player.x, player.y + sin(player.legPhase * 2.2) * player.landingBounce * 0.25);
}

function doJump() {
  player.airborne = true;
  player.vy = -18.5;
  lastJumpAt = millis();
  burstDust(player.x + 10, GROUND_Y + 8, 12);
}

function maybeQueueVoiceJump() {
  let dynamicThreshold = max(VOICE_LEVEL_THRESHOLD, ambientLevel * 2.6);
  let strongVoice = micLevelSmooth > dynamicThreshold;
  let highPitch = pitchSmooth > VOICE_PITCH_THRESHOLD;
  let veryStrongVoice = micLevelSmooth > dynamicThreshold * 1.45;
  let suddenSpike = micLevelSmooth > ambientLevel + 0.03;

  if (strongVoice) {
    voiceCharge = min(8, voiceCharge + 1);
  } else {
    voiceCharge = max(0, voiceCharge - 1.3);
  }

  if ((strongVoice && highPitch) || veryStrongVoice || suddenSpike || voiceCharge >= 4) {
    jumpQueued = true;
    voiceCharge = 0;
  }
}

function checkCollisions() {
  let px = player.x - 26;
  let py = player.y - player.h + 16;
  let pw = 64;
  let ph = player.h - 10;

  for (let obstacle of obstacles) {
    let ox = obstacle.x - obstacle.w * 0.5 + 8;
    let oy = GROUND_Y - obstacle.h + obstacle.hitTop;
    let ow = obstacle.w - 16;
    let oh = obstacle.h - obstacle.hitTop;

    if (rectOverlap(px, py, pw, ph, ox, oy, ow, oh)) {
      flashAlpha = 80;
      gameState = "gameover";
      highScore = max(highScore, score);
      localStorage.setItem("screamBearsHighScore", highScore);
      burstDust(player.x + 10, player.y - 40, 28, color(255, 120, 80, 180));
      return;
    }
  }
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function spawnObstacle() {
  let type = random() < 0.68 ? "bush" : random() < 0.5 ? "sign" : "pillar";
  if (type === "bush") {
    obstacles.push({
      type,
      x: width + 160,
      y: GROUND_Y + 12,
      w: random(74, 110),
      h: random(60, 82),
      hitTop: 22,
      spin: random(360),
      passed: false,
      flowerCount: floor(random(8, 14))
    });
  } else if (type === "sign") {
    obstacles.push({
      type,
      x: width + 180,
      y: GROUND_Y - 10,
      w: 122,
      h: 118,
      hitTop: 34,
      passed: false
    });
  } else {
    obstacles.push({
      type,
      x: width + 180,
      y: GROUND_Y,
      w: 68,
      h: random(86, 108),
      hitTop: 10,
      passed: false
    });
  }
}

function burstDust(x, y, count, burstColor) {
  let dustColor = burstColor || color(214, 178, 133, 190);
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: random(-3, 3),
      vy: random(-2.5, 0.5),
      g: 0.09,
      size: random(6, 13),
      life: random(14, 28),
      color: dustColor
    });
  }
}

function updateAudio() {
  let level = audioReady && amp ? amp.getLevel() : 0;
  micLevelSmooth = lerp(micLevelSmooth, level, 0.18);
  micDebugPeak = max(micDebugPeak * 0.96, micLevelSmooth);

  if (audioReady) {
    if (frameCount < 180 && micLevelSmooth > 0.001) {
      ambientLevel = lerp(ambientLevel, micLevelSmooth, 0.08);
    } else {
      ambientLevel = lerp(ambientLevel, min(ambientLevel, micLevelSmooth), 0.02);
    }
  }

  let detectedPitch = 0;
  if (audioReady && analyser) {
    detectedPitch = detectPitch();
  }
  pitchSmooth = lerp(pitchSmooth, detectedPitch, detectedPitch > 0 ? 0.16 : 0.08);
  if (pitchSmooth < 1) {
    pitchSmooth = 0;
  }
}

function detectPitch() {
  if (!analyser) {
    return 0;
  }

  let bufferLength = analyser.fftSize;
  let buffer = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(buffer);

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = sqrt(rms / buffer.length);
  if (rms < 0.015) {
    return 0;
  }

  let bestOffset = -1;
  let bestCorrelation = 0;
  let sampleRate = getAudioContext().sampleRate;
  let minSamples = floor(sampleRate / 900);
  let maxSamples = floor(sampleRate / 80);

  for (let offset = minSamples; offset <= maxSamples; offset++) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i++) {
      correlation += 1 - abs(buffer[i] - buffer[i + offset]);
    }
    correlation /= buffer.length - offset;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestCorrelation > 0.9 && bestOffset !== -1) {
    return sampleRate / bestOffset;
  }
  return 0;
}

function drawSky() {
  for (let y = 0; y < height; y += 2) {
    let t = map(y, 0, height, 0, 1);
    let c = lerpColor(color(56, 149, 237), color(163, 214, 255), t * 0.62);
    stroke(c);
    line(0, y, width, y);
  }

  noStroke();
  fill(255, 255, 255, 26);
  ellipse(width * 0.74, 95, 180, 80);
  ellipse(width * 0.62, 82, 150, 60);

  for (let cloud of clouds) {
    cloud.x -= cloud.s;
    if (cloud.x < -cloud.w) {
      cloud.x = width + random(60, 180);
      cloud.y = random(60, 190);
    }
    drawCloud(cloud.x, cloud.y, cloud.w);
  }
}

function drawCloud(x, y, w) {
  noStroke();
  fill(255, 255, 255, 220);
  ellipse(x, y, w * 0.42, w * 0.24);
  ellipse(x - w * 0.15, y + 12, w * 0.34, w * 0.2);
  ellipse(x + w * 0.12, y + 8, w * 0.32, w * 0.18);
}

function drawCampus() {
  let lawnTop = GROUND_Y - 165;

  noStroke();
  fill(74, 142, 52);
  rect(0, lawnTop, width, GROUND_Y - lawnTop + 4);

  for (let i = 0; i < skylineSeed.length; i++) {
    let s = skylineSeed[i];
    drawTree(s.x - (scrollX * 0.15) % (width + 200), lawnTop + 6, 0.85);
    drawTree(s.x + 520 - (scrollX * 0.15) % (width + 200), lawnTop + 6, 1.05);
  }

  let buildingW = min(width * 0.64, 920);
  let buildingX = width * 0.5 - buildingW * 0.5;
  let buildingY = GROUND_Y - 295;
  let brickH = 184;

  noStroke();
  fill(135, 63, 36);
  rect(buildingX, buildingY + 82, buildingW, brickH);
  fill(155, 74, 47, 90);
  for (let i = 0; i < 12; i++) {
    rect(buildingX + i * (buildingW / 12) + 4, buildingY + 82, 8, brickH);
  }

  drawMainRoof(buildingX, buildingY + 50, buildingW, 52);
  drawCentralPortico(buildingX + buildingW * 0.39, buildingY + 74, buildingW * 0.22, 168);
  drawCupola(buildingX + buildingW * 0.5, buildingY - 26, 88, 118);

  drawWindowRows(buildingX + 24, buildingY + 108, buildingW - 48, 3, 14);

  let flagX = buildingX + 62;
  stroke(60);
  strokeWeight(3);
  line(flagX, buildingY + 62, flagX, buildingY + 150);
  noStroke();
  fill(212, 32, 50);
  rect(flagX + 2, buildingY + 72, 30, 16);
  fill(255);
  rect(flagX + 2, buildingY + 77, 30, 2);
  rect(flagX + 2, buildingY + 83, 30, 2);
  fill(42, 72, 159);
  rect(flagX + 2, buildingY + 72, 12, 10);
}

function drawMainRoof(x, y, w, h) {
  fill(67, 66, 67);
  quad(x - 8, y + h, x + 20, y, x + w - 20, y, x + w + 8, y + h);
  fill(86, 83, 84);
  rect(x + 24, y + h - 2, w - 48, 10);

  for (let i = 0; i < 4; i++) {
    fill(111, 58, 36);
    rect(x + 110 + i * 170, y + 4, 18, 42);
    fill(95, 54, 38);
    rect(x + 106 + i * 170, y - 2, 26, 8, 3);
  }
}

function drawCentralPortico(x, y, w, h) {
  fill(226, 220, 209);
  triangle(x - 26, y + 28, x + w + 26, y + 28, x + w * 0.5, y - 12);
  rect(x - 18, y + 28, w + 36, 16);
  for (let i = 0; i < 5; i++) {
    let cx = x + 10 + i * (w / 4.2);
    fill(238, 234, 224);
    rect(cx, y + 42, 18, h - 56, 6);
    fill(220, 214, 201);
    rect(cx + 2, y + 42, 4, h - 56);
  }
  fill(240, 236, 228);
  rect(x + 12, y + h - 18, w - 24, 18);
  fill(95, 63, 45);
  rect(x + w * 0.43, y + h - 82, 34, 64, 4);
  fill(255, 240, 212);
  ellipse(x + w * 0.5, y + h - 54, 8, 8);
}

function drawCupola(cx, y, w, h) {
  fill(239, 236, 227);
  rect(cx - w * 0.25, y + 40, w * 0.5, 52);
  rect(cx - w * 0.12, y + 8, w * 0.24, 34);
  rect(cx - w * 0.06, y - 10, w * 0.12, 18);
  rect(cx - w * 0.18, y + 92, w * 0.36, 10);
}

function drawWindowRows(x, y, w, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let wx = x + c * (w / cols);
      let wy = y + r * 52;
      fill(239, 238, 230);
      rect(wx, wy, 20, 28, 2);
      fill(87, 110, 128);
      rect(wx + 2, wy + 2, 16, 24, 1);
      fill(230, 225, 216);
      rect(wx + 8, wy, 2, 28);
      rect(wx, wy + 12, 20, 2);
    }
  }
}

function drawTree(x, y, scaleAmount) {
  push();
  translate(((x % (width + 260)) + width + 260) % (width + 260) - 100, y);
  scale(scaleAmount);
  noStroke();
  fill(98, 66, 42);
  rect(0, 58, 18, 72, 8);
  fill(160, 82, 42, 220);
  ellipse(12, 40, 74, 58);
  fill(106, 148, 48, 230);
  ellipse(-10, 56, 68, 54);
  fill(176, 82, 55, 210);
  ellipse(34, 58, 66, 50);
  fill(72, 130, 44, 215);
  ellipse(14, 18, 84, 66);
  pop();
}

function drawGround() {
  let walkTop = GROUND_Y + 10;
  noStroke();
  fill(171, 121, 69);
  rect(0, walkTop, width, 76);

  for (let i = -1; i < width / 110 + 2; i++) {
    let x = (i * 112) - (scrollX % 112);
    fill(191, 143, 88);
    quad(x, walkTop, x + 116, walkTop, x + 100, walkTop + 38, x - 10, walkTop + 36);
    fill(123, 85, 44, 80);
    rect(x - 4, walkTop + 34, 108, 5);
  }

  fill(3, 11, 22);
  rect(0, GROUND_Y + 84, width, height - (GROUND_Y + 84));

  for (let y = GROUND_Y + 84; y < height; y += 2) {
    let t = map(y, GROUND_Y + 84, height, 0, 1);
    stroke(lerpColor(color(8, 22, 42), color(4, 8, 16), t));
    line(0, y, width, y);
  }

  noStroke();
  fill(34, 193, 255);
  rect(width * 0.29, GROUND_Y + 140, width * 0.42, 2);
}

function drawFarShrubs() {
  for (let shrub of shrubs) {
    let x = ((shrub.x - scrollX * 0.45) % (width + 340) + width + 340) % (width + 340) - 60;
    drawShrub(x, GROUND_Y + 14, shrub.scale, shrub.flowers);
  }
  for (let pillar of pillars) {
    let x = ((pillar.x - scrollX * 0.7) % (width + 420) + width + 420) % (width + 420) - 70;
    drawPillar(x, GROUND_Y + 8, pillar.h);
  }
}

function drawObstacle(obstacle) {
  drawObstacleWarning(obstacle);

  if (obstacle.type === "bush") {
    drawShrub(obstacle.x, obstacle.y, obstacle.w / 92, obstacle.flowerCount);
  } else if (obstacle.type === "sign") {
    drawSign(obstacle.x, obstacle.y);
  } else {
    drawPillar(obstacle.x, obstacle.y + 8, obstacle.h);
  }
}

function drawShrub(x, y, s, flowers) {
  push();
  translate(x, y);
  scale(s);
  stroke(255, 218, 96);
  strokeWeight(3);
  fill(28, 88, 36);
  ellipse(0, 0, 84, 44);
  noStroke();
  fill(41, 116, 46);
  ellipse(-22, -6, 42, 32);
  ellipse(16, -8, 48, 34);
  ellipse(0, -12, 54, 36);
  for (let i = 0; i < flowers; i++) {
    let fx = sin(i * 47 + frameCount * 0.2) * 22 + random(-2, 2);
    let fy = cos(i * 61) * 10 + random(-1, 3);
    fill(i % 2 === 0 ? color(255, 56, 56) : color(255, 206, 48));
    ellipse(fx, fy, 6, 6);
  }
  pop();
}

function drawPillar(x, y, h) {
  push();
  translate(x, y);
  stroke(255, 214, 87);
  strokeWeight(3);
  fill(149, 143, 139);
  rect(-22, -h, 44, h, 6);
  noStroke();
  fill(176, 171, 167);
  for (let i = 0; i < h / 10; i++) {
    rect(-20, -h + i * 10 + 2, 40, 2);
  }
  fill(104, 98, 95);
  rect(-28, -h - 12, 56, 14, 5);
  pop();
}

function drawSign(x, y) {
  push();
  translate(x, y);
  stroke(255, 214, 87);
  strokeWeight(3);
  fill(78, 54, 42);
  rect(-48, -18, 10, 82, 4);
  rect(40, -18, 10, 82, 4);
  noStroke();
  fill(135, 17, 25);
  rect(-60, -28, 120, 54, 9);
  fill(170, 30, 30);
  rect(-54, -22, 108, 42, 6);
  fill(252, 233, 209);
  textAlign(CENTER, CENTER);
  textFont("Anton");
  textSize(14);
  text("BRIDGEWATER", 0, -6);
  textSize(10);
  text("STATE", 0, 10);
  pop();
}

function drawObstacleWarning(obstacle) {
  let baseY = GROUND_Y + 42;
  let markerY = GROUND_Y - obstacle.h - 18;

  push();
  translate(obstacle.x, 0);
  noStroke();
  fill(255, 90, 50, 90);
  ellipse(0, baseY, obstacle.w + 34, 18);

  fill(255, 198, 57, 220);
  rect(-obstacle.w * 0.42, GROUND_Y + 18, obstacle.w * 0.84, 8, 4);
  fill(30, 30, 30, 180);
  for (let i = -2; i <= 2; i++) {
    rect(i * 16 - 6, GROUND_Y + 18, 8, 8, 2);
  }

  fill(255, 84, 54);
  ellipse(0, markerY, 28, 28);
  fill(255);
  textAlign(CENTER, CENTER);
  textFont("Anton");
  textSize(20);
  text("!", 0, markerY + 1);
  pop();
}

function drawPlayer(x, y) {
  let bob = player.airborne ? 0 : sin(player.legPhase * 2) * 3;
  let armSwing = sin(player.legPhase * 13) * 26;
  let legSwing = sin(player.legPhase * 13) * 34;

  push();
  translate(x, y + bob);

  stroke(62, 32, 18);
  strokeWeight(10);
  drawLimb(-6, -18, 18, 26, legSwing);
  drawLimb(18, -16, 18, 28, -legSwing);
  drawLowerLeg(6, 8, 28, 24, -legSwing * 0.9);
  drawLowerLeg(28, 10, 28, 26, legSwing * 0.85);

  stroke(62, 32, 18);
  strokeWeight(8);
  drawLimb(14, -74, 10, 22, -armSwing);
  drawLimb(44, -70, 8, 22, armSwing);
  drawLowerLeg(18, -48, 18, 16, armSwing * 0.8);
  drawLowerLeg(48, -46, 16, 14, -armSwing * 0.7);

  noStroke();
  fill(96, 200, 255);
  ellipse(22, -56, 64, 68);
  fill(58, 82, 116);
  rect(-1, -48, 50, 42, 12);
  fill(22, 48, 88);
  rect(-2, -54, 10, 36, 7);
  rect(36, -54, 10, 40, 7);
  fill(60, 85, 120);
  quad(-8, -54, -20, -36, -12, -30, 2, -48);

  fill(123, 77, 42);
  ellipse(24, -98, 62, 56);
  fill(145, 89, 49);
  ellipse(0, -112, 18, 18);
  ellipse(32, -116, 18, 18);
  fill(235, 206, 165);
  ellipse(30, -88, 28, 22);
  fill(235, 206, 165);
  ellipse(44, -92, 22, 18);
  fill(48);
  ellipse(28, -100, 6, 8);
  ellipse(43, -97, 6, 8);
  fill(255);
  ellipse(26, -101, 2.2, 2.2);
  ellipse(41, -98, 2.2, 2.2);
  fill(67, 42, 25);
  ellipse(52, -90, 11, 10);
  stroke(67, 42, 25);
  strokeWeight(2);
  noFill();
  arc(40, -82, 18, 12, 10, 160);

  drawShoe(8, 34, -8);
  drawShoe(36, 37, 10);
  pop();
}

function drawLimb(x, y, len, widthAmount, swing) {
  push();
  translate(x, y);
  rotate(swing);
  line(0, 0, 0, len);
  pop();
}

function drawLowerLeg(x, y, len, footOffset, swing) {
  push();
  translate(x, y);
  rotate(swing);
  line(0, 0, 0, len);
  pop();
}

function drawShoe(x, y, angleAmount) {
  push();
  translate(x, y);
  rotate(angleAmount);
  noStroke();
  fill(25, 70, 138);
  ellipse(0, 0, 30, 16);
  fill(255);
  rect(-10, 2, 20, 4, 2);
  pop();
}

function drawHud() {
  let scaleFactor = min(width / BASE_W, height / BASE_H);
  let pad = 24 * scaleFactor;

  push();
  textAlign(LEFT, TOP);
  textFont("Anton");
  textSize(54 * scaleFactor);
  stroke(16, 20, 28);
  strokeWeight(8 * scaleFactor);
  fill(255);
  text("SCORE: " + score, pad, pad);

  textSize(26 * scaleFactor);
  strokeWeight(5 * scaleFactor);
  fill(255, 232, 116);
  text("HIGH SCORE: " + highScore, pad + 2, pad + 68 * scaleFactor);
  pop();

  drawMicPanel(width - 290 * scaleFactor, 26 * scaleFactor, scaleFactor);

  if (gameState === "play") {
    push();
    textAlign(CENTER, CENTER);
    textFont("Anton");
    fill(45, 212, 255);
    stroke(2, 17, 29, 140);
    strokeWeight(6 * scaleFactor);
    textSize(38 * scaleFactor);
    text("VOICE CONTROLLED JUMP", width * 0.5, height - 132 * scaleFactor);
    fill(255);
    textSize(24 * scaleFactor);
    strokeWeight(4 * scaleFactor);
    text("HUM, SAY HEY, OR MAKE A LOUD SOUND TO JUMP", width * 0.5, height - 94 * scaleFactor);
    pop();
  }
}

function drawMicPanel(x, y, s) {
  push();
  translate(x, y);
  noStroke();
  fill(9, 16, 26, 215);
  rect(0, 0, 254 * s, 64 * s, 30 * s);
  stroke(255);
  strokeWeight(3 * s);
  noFill();
  rect(0, 0, 254 * s, 64 * s, 30 * s);

  stroke(255);
  strokeWeight(4 * s);
  fill(255);
  ellipse(32 * s, 32 * s, 54 * s, 54 * s);
  fill(9, 16, 26);
  noStroke();
  ellipse(32 * s, 32 * s, 49 * s, 49 * s);
  stroke(255);
  strokeWeight(3 * s);
  line(32 * s, 20 * s, 32 * s, 36 * s);
  noFill();
  arc(32 * s, 20 * s, 16 * s, 18 * s, 0, 180);
  line(24 * s, 28 * s, 24 * s, 22 * s);
  line(40 * s, 28 * s, 40 * s, 22 * s);
  line(24 * s, 30 * s, 24 * s, 36 * s);
  line(40 * s, 30 * s, 40 * s, 36 * s);
  line(32 * s, 36 * s, 32 * s, 44 * s);
  line(24 * s, 44 * s, 40 * s, 44 * s);

  let bars = 11;
  let level = constrain(map(micLevelSmooth, 0, 0.24, 0, 1), 0, 1);
  let pitchFactor = constrain(map(pitchSmooth, 120, 420, 0, 1), 0, 1);
  let charged = constrain(voiceCharge / 4, 0, 1);

  for (let i = 0; i < bars; i++) {
    let bx = 84 * s + i * 13 * s;
    let bh = (16 + i * 2.2) * s;
    let by = 32 * s - bh * 0.5;
    let active = i / (bars - 1) < max(level, pitchFactor * 0.92, charged);
    let hue = lerpColor(color(25, 255, 94), color(255, 70, 54), i / (bars - 1));
    fill(active ? hue : color(42, 56, 71));
    noStroke();
    rect(bx, by, 8 * s, bh, 5 * s);
  }

  textAlign(CENTER, CENTER);
  textFont("Barlow Condensed");
  textSize(10 * s);
  fill(audioReady ? color(230, 244, 255) : color(255, 188, 115));
  let status = "MIC OFF";
  if (micPermissionDenied) {
    status = "MIC BLOCKED";
  } else if (audioReady) {
    status = "MIC " + nf(micLevelSmooth, 1, 3);
  }
  text(status, 166 * s, 54 * s);
  pop();
}

function drawStartOverlay() {
  drawOverlayBase(145);

  let s = min(width / BASE_W, height / BASE_H);
  push();
  textAlign(CENTER, CENTER);
  textFont("Anton");
  stroke(9, 18, 28);
  strokeWeight(10 * s);
  fill(255, 203, 49);
  textSize(84 * s);
  text("SCREAM", width * 0.5, height * 0.32);
  fill(55, 152, 255);
  text("BEARS!", width * 0.5, height * 0.42);

  fill(255);
  strokeWeight(5 * s);
  textFont("Barlow Condensed");
  textSize(28 * s);
  text("Hum, say hey, clap, or make a loud sound to jump over obstacles.", width * 0.5, height * 0.54);
  text("Click to enable microphone and start. Spacebar also jumps.", width * 0.5, height * 0.59);
  textSize(22 * s);
  fill(255, 218, 90);
  text("Top-right meter should move when the mic is working.", width * 0.5, height * 0.64);

  fill(45, 212, 255);
  textSize(32 * s);
  text(audioReady ? "CLICK TO START" : "CLICK TO ENABLE MIC", width * 0.5, height * 0.7);
  pop();
}

function drawGameOverOverlay() {
  drawOverlayBase(160);
  let s = min(width / BASE_W, height / BASE_H);

  push();
  textAlign(CENTER, CENTER);
  textFont("Anton");
  stroke(10, 15, 24);
  strokeWeight(10 * s);
  fill(255, 85, 66);
  textSize(78 * s);
  text("GAME OVER", width * 0.5, height * 0.35);

  fill(255);
  textFont("Barlow Condensed");
  strokeWeight(5 * s);
  textSize(34 * s);
  text("SCORE: " + score, width * 0.5, height * 0.48);
  text("HIGH SCORE: " + highScore, width * 0.5, height * 0.54);
  fill(255, 219, 85);
  textSize(28 * s);
  text("CLICK OR PRESS R TO RESTART", width * 0.5, height * 0.66);
  pop();
}

function drawOverlayBase(alphaAmount) {
  noStroke();
  fill(2, 7, 16, alphaAmount);
  rect(0, 0, width, height);
}

function mousePressed() {
  if (gameState === "start") {
    startRun();
  } else if (gameState === "gameover") {
    restartRun();
  }
}

function keyPressed() {
  if (key === " " || keyCode === UP_ARROW) {
    jumpQueued = true;
    if (gameState === "start") {
      startRun();
    }
  }
  if (key === "r" || key === "R") {
    if (gameState === "gameover") {
      restartRun();
    }
  }
}

async function startRun() {
  if (!audioReady) {
    await initAudio();
  }
  gameState = "play";
}

function restartRun() {
  resetWorld();
  gameState = "play";
}

async function initAudio() {
  try {
    await userStartAudio();
    mic = new p5.AudioIn();
    await new Promise((resolve, reject) => {
      mic.start(
        () => resolve(),
        (err) => reject(err || new Error("Microphone permission denied"))
      );
    });
    amp = new p5.Amplitude();
    amp.setInput(mic);

    let ctx = getAudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    if (mic.stream) {
      let source = ctx.createMediaStreamSource(mic.stream);
      source.connect(analyser);
    }
    audioReady = true;
    micPermissionDenied = false;
  } catch (err) {
    audioReady = false;
    micPermissionDenied = true;
    console.error("Microphone init failed:", err);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  player.x = width * 0.2;
}
