(() => {
  "use strict";

  const intro = document.querySelector("#gesture-intro");
  if (!intro) return;

  const canvas = document.querySelector("#gesture-canvas");
  const status = document.querySelector("#gesture-status");
  const cameraButton = document.querySelector("#enable-gesture");
  const mouseSoundButton = document.querySelector("#enable-mouse-sound");
  const enterButton = document.querySelector("#enter-site");
  const skipButton = document.querySelector(".intro-skip");
  const video = document.querySelector("#gesture-video");
  const siteHeader = document.querySelector(".site-header");
  const siteMain = document.querySelector("main");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  siteHeader.inert = true;
  siteMain.inert = true;
  siteHeader.setAttribute("aria-hidden", "true");
  siteMain.setAttribute("aria-hidden", "true");

  class CelloSuitesMusic {
    constructor() {
      this.context = null;
      this.master = null;
      this.delay = null;
      this.enabled = false;
      this.lastPlayed = 0;
      this.lastNote = -1;
      this.suites = [
        [43, 50, 59, 57, 59, 50, 59, 50, 43, 50, 59, 57, 59, 50, 59, 50, 43, 52, 60, 59, 60, 52, 60, 52, 43, 52, 60, 59, 60, 52, 60, 52],
        [50, 53, 57, 53, 52, 50, 49, 52, 55, 57, 58, 57, 55, 53, 52, 55, 58, 61, 64, 58, 57, 55, 53, 52, 53, 55, 57, 53, 50, 48, 46, 45],
        [60, 59, 57, 55, 53, 52, 50, 48, 43, 40, 43, 36, 38, 40, 41, 43, 45, 47, 48, 50, 48, 47, 45, 43, 45, 47, 48, 50, 52, 53, 50, 52],
        [39, 63, 58, 55, 58, 51, 55, 46, 39, 63, 58, 55, 58, 51, 55, 46, 39, 61, 58, 55, 58, 51, 55, 46, 39, 61, 58, 55, 58, 51, 55, 46],
        [36, 48, 43, 45, 47, 48, 50, 51, 53, 51, 50, 51, 48, 36, 47, 53, 56, 56, 55, 56, 53, 51, 53, 50, 48, 51, 36, 48, 48, 50, 51, 47],
        [50, 50, 50, 50, 50, 54, 50, 50, 57, 50, 50, 62, 50, 50, 50, 50, 50, 54, 50, 50, 57, 50, 50, 62, 59, 50, 55, 59, 61, 62, 57, 50],
      ];
    }

    async unlock() {
      if (!this.context) this.createContext();
      if (!this.context) return false;
      if (this.context.state === "suspended") {
        try {
          await Promise.race([
            this.context.resume(),
            new Promise((resolve) => window.setTimeout(resolve, 650)),
          ]);
        } catch {
          return false;
        }
      }
      this.enabled = this.context.state === "running";
      return this.enabled;
    }

    createContext() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.2;
      this.delay = this.context.createDelay(2);
      const feedback = this.context.createGain();
      const wet = this.context.createGain();
      this.delay.delayTime.value = 0.19;
      feedback.gain.value = 0.12;
      wet.gain.value = 0.09;
      this.delay.connect(feedback);
      feedback.connect(this.delay);
      this.delay.connect(wet);
      this.master.connect(this.context.destination);
      this.master.connect(this.delay);
      wet.connect(this.context.destination);
    }

    playAt(position, verticalPosition = 0.5, energy = 0.5, direction = 1) {
      if (!this.enabled || !this.context || this.context.state !== "running") return;
      const nowMs = performance.now();
      if (nowMs - this.lastPlayed < 105) return;

      const suiteIndex = clamp(Math.floor(verticalPosition * this.suites.length), 0, this.suites.length - 1);
      const suite = this.suites[suiteIndex];
      const rawIndex = clamp(Math.floor(position * suite.length), 0, suite.length - 1);
      const index = direction < 0 ? suite.length - 1 - rawIndex : rawIndex;
      const noteKey = suiteIndex * 100 + index;
      if (noteKey === this.lastNote && nowMs - this.lastPlayed < 210) return;
      this.lastPlayed = nowMs;
      this.lastNote = noteKey;
      this.playCelloNote(suite[index], clamp(energy, 0.2, 1));
    }

    playCelloNote(midi, energy = 0.5, delay = 0) {
      if (!this.context || !this.master) return;
      const frequency = 440 * (2 ** ((midi - 69) / 12));
      const now = this.context.currentTime + delay;
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      const fundamental = this.context.createOscillator();
      const bow = this.context.createOscillator();
      const body = this.context.createOscillator();
      const bowGain = this.context.createGain();
      const bodyGain = this.context.createGain();

      fundamental.type = "sawtooth";
      bow.type = "triangle";
      body.type = "sine";
      fundamental.frequency.value = frequency;
      bow.frequency.value = frequency * 2.005;
      body.frequency.value = frequency * 0.5;
      bowGain.gain.value = 0.09;
      bodyGain.gain.value = 0.15;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(720 + energy * 760, now);
      filter.Q.value = 1.15;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.022 * energy, now + 0.055);
      gain.gain.exponentialRampToValueAtTime(0.014 * energy, now + 0.31);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.12);
      fundamental.connect(filter);
      bow.connect(bowGain);
      body.connect(bodyGain);
      bowGain.connect(filter);
      bodyGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      fundamental.start(now);
      bow.start(now);
      body.start(now);
      fundamental.stop(now + 1.18);
      bow.stop(now + 1.18);
      body.stop(now + 1.18);
    }

    cadence() {
      if (!this.enabled) return;
      [43, 50, 59, 62].forEach((note, index) => this.playCelloNote(note, 0.42, index * 0.085));
    }
  }

  class GestureParticleField {
    constructor(targetCanvas, music) {
      this.canvas = targetCanvas;
      this.ctx = targetCanvas.getContext("2d");
      this.music = music;
      this.particles = [];
      this.stars = [];
      this.pointer = { x: -9999, y: -9999, active: false, source: "mouse" };
      this.lastInput = { x: 0, time: performance.now() };
      this.width = 1;
      this.height = 1;
      this.radius = 150;
      this.formedAt = reducedMotion ? 0 : performance.now() + 1550;
      this.resizeTimer = 0;
      this.resize = this.resize.bind(this);
      this.animate = this.animate.bind(this);

      window.addEventListener("resize", () => {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(this.resize, 120);
      }, { passive: true });
      targetCanvas.addEventListener("pointermove", (event) => this.handlePointer(event), { passive: true });
      targetCanvas.addEventListener("pointerleave", () => {
        if (this.pointer.source === "mouse") this.setPointer(-9999, -9999, false, "mouse");
      });
      this.resize();
      this.animate();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.radius = this.width < 680 ? 92 : 150;
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.buildParticles();
      this.buildStars();
    }

    buildParticles() {
      const buffer = document.createElement("canvas");
      buffer.width = this.width;
      buffer.height = this.height;
      const bufferCtx = buffer.getContext("2d", { willReadFrequently: true });
      const fontSize = clamp(this.width * (this.width < 680 ? 0.235 : 0.19), 78, 250);
      const titleY = this.height * (this.width < 680 ? 0.4 : 0.43);
      bufferCtx.clearRect(0, 0, this.width, this.height);
      bufferCtx.fillStyle = "#ffffff";
      bufferCtx.font = `750 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
      bufferCtx.textAlign = "center";
      bufferCtx.textBaseline = "middle";
      bufferCtx.fillText("LAN LUO", this.width / 2, titleY);
      const pixels = bufferCtx.getImageData(0, 0, this.width, this.height).data;
      const gap = this.width < 680 ? 3 : 4;
      const nextParticles = [];

      for (let y = 0; y < this.height; y += gap) {
        for (let x = 0; x < this.width; x += gap) {
          if (pixels[(y * this.width + x) * 4 + 3] > 120) {
            const existing = this.particles[nextParticles.length];
            const origin = this.getEdgeOrigin(nextParticles.length);
            nextParticles.push({
              x: existing ? existing.x : origin.x,
              y: existing ? existing.y : origin.y,
              tx: x,
              ty: y,
              vx: existing ? existing.vx : 0,
              vy: existing ? existing.vy : 0,
              size: 0.65 + Math.random() * 1.15,
              alpha: 0.38 + Math.random() * 0.58,
            });
          }
        }
      }

      this.particles = nextParticles;
      intro.classList.add("particles-ready");
    }

    getEdgeOrigin(index) {
      const edge = index % 4;
      const inset = -18 + Math.random() * 52;
      if (edge === 0) return { x: inset, y: Math.random() * this.height };
      if (edge === 1) return { x: this.width - inset, y: Math.random() * this.height };
      if (edge === 2) return { x: Math.random() * this.width, y: inset };
      return { x: Math.random() * this.width, y: this.height - inset };
    }

    buildStars() {
      let seed = 811;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const count = this.width < 680 ? 28 : 56;
      this.stars = Array.from({ length: count }, () => ({
        x: random() * this.width,
        y: random() * this.height,
        size: 0.35 + random() * 0.8,
        alpha: 0.05 + random() * 0.14,
      }));
    }

    handlePointer(event) {
      const now = performance.now();
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const elapsed = Math.max(16, now - this.lastInput.time);
      const velocity = Math.abs(x - this.lastInput.x) / elapsed;
      const direction = x >= this.lastInput.x ? 1 : -1;
      this.setPointer(x, y, true, "mouse");
      if (velocity > 0.12) this.music.playAt(x / this.width, y / this.height, clamp(velocity * 0.8, 0.25, 1), direction);
      this.lastInput = { x, time: now };
    }

    setHandPointer(x, y) {
      const now = performance.now();
      const px = x * this.width;
      const py = y * this.height;
      const elapsed = Math.max(16, now - this.lastInput.time);
      const velocity = Math.abs(px - this.lastInput.x) / elapsed;
      const direction = px >= this.lastInput.x ? 1 : -1;
      this.setPointer(px, py, true, "hand");
      if (velocity > 0.045) this.music.playAt(x, y, clamp(velocity * 1.4, 0.3, 1), direction);
      this.lastInput = { x: px, time: now };
    }

    setPointer(x, y, active, source) {
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.active = active;
      this.pointer.source = source;
    }

    animate() {
      const { ctx, width, height } = this;
      const forming = performance.now() < this.formedAt;
      const attraction = forming ? 0.009 : 0.026;
      const drag = forming ? 0.9 : 0.85;
      ctx.clearRect(0, 0, width, height);
      this.stars.forEach((star) => {
        ctx.fillStyle = `rgba(181, 202, 212, ${star.alpha})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      this.particles.forEach((particle) => {
        if (this.pointer.active) {
          const dx = particle.x - this.pointer.x;
          const dy = particle.y - this.pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < this.radius * this.radius && distanceSquared > 0.01) {
            const distance = Math.sqrt(distanceSquared);
            const force = (1 - distance / this.radius) * (this.pointer.source === "hand" ? 2.4 : 1.65);
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        particle.vx += (particle.tx - particle.x) * attraction;
        particle.vy += (particle.ty - particle.y) * attraction;
        particle.vx *= drag;
        particle.vy *= drag;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const speed = Math.abs(particle.vx) + Math.abs(particle.vy);
        const shimmer = clamp(speed * 0.04, 0, 0.3);
        ctx.fillStyle = `rgba(190, 215, 228, ${particle.alpha - 0.12 + shimmer})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!reducedMotion) requestAnimationFrame(this.animate);
    }
  }

  class HandGestureController {
    constructor(field, music, onEnter) {
      this.field = field;
      this.music = music;
      this.onEnter = onEnter;
      this.landmarker = null;
      this.stream = null;
      this.running = false;
      this.lastVideoTime = -1;
      this.lastDetection = 0;
      this.lastFrame = performance.now();
      this.openHold = 0;
      this.loop = this.loop.bind(this);
    }

    async start() {
      if (this.running) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = "Camera unavailable · use mouse or Enter site";
        return;
      }

      cameraButton.disabled = true;
      cameraButton.lastChild.textContent = " Loading vision";
      status.textContent = "Loading hand tracking · camera permission will follow";
      this.music.unlock();

      try {
        const visionPromise = import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm");
        const streamPromise = navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const [visionModule, stream] = await Promise.all([visionPromise, streamPromise]);
        const { FilesetResolver, HandLandmarker } = visionModule;
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        });

        this.stream = stream;
        video.srcObject = stream;
        await video.play();
        cameraButton.disabled = false;
        cameraButton.lastChild.textContent = " Gesture active";
        status.textContent = "Show one hand · move left and right";
        this.running = true;
        this.lastFrame = performance.now();
        requestAnimationFrame(this.loop);
      } catch (error) {
        this.stop();
        cameraButton.disabled = false;
        cameraButton.lastChild.textContent = " Retry gesture";
        const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
        status.textContent = denied
          ? "Camera permission declined · mouse interaction remains available"
          : "Hand tracking could not start · use mouse or Enter site";
      }
    }

    loop(now) {
      if (!this.running) return;
      if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime && now - this.lastDetection > 42) {
        try {
          const result = this.landmarker.detectForVideo(video, now);
          this.lastVideoTime = video.currentTime;
          this.lastDetection = now;
          this.processResult(result, now);
        } catch {
          status.textContent = "Tracking paused · use mouse or retry camera";
        }
      }
      requestAnimationFrame(this.loop);
    }

    processResult(result, now) {
      const landmarks = result.landmarks?.[0];
      const delta = Math.min(90, now - this.lastFrame);
      this.lastFrame = now;

      if (!landmarks) {
        this.openHold = Math.max(0, this.openHold - delta * 1.8);
        this.updateProgress();
        status.textContent = "No hand detected · place one hand in view";
        return;
      }

      const palmIds = [0, 5, 9, 13, 17];
      const center = palmIds.reduce((sum, index) => ({
        x: sum.x + landmarks[index].x,
        y: sum.y + landmarks[index].y,
      }), { x: 0, y: 0 });
      const palmX = center.x / palmIds.length;
      const palmY = center.y / palmIds.length;
      const indexTip = landmarks[8];
      const x = 1 - (indexTip.x * 0.72 + palmX * 0.28);
      const y = indexTip.y * 0.72 + palmY * 0.28;
      this.field.setHandPointer(x, y);

      const openness = this.getOpenness(landmarks);
      if (openness >= 1) {
        this.openHold += delta;
        status.textContent = "Open palm detected · hold to enter";
      } else {
        this.openHold = Math.max(0, this.openHold - delta * 1.45);
        status.textContent = openness >= 0.6
          ? "Spread all five fingers"
          : "Hand connected · move left and right";
      }
      this.updateProgress();
      if (this.openHold >= 720) this.onEnter("gesture");
    }

    getOpenness(landmarks) {
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      const wrist = landmarks[0];
      const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
      let extended = fingers.filter(([tip, pip]) => (
        distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) * 1.16
      )).length;
      const thumbExtended = distance(landmarks[4], wrist) > distance(landmarks[3], wrist) * 1.1
        && distance(landmarks[4], landmarks[5]) > 0.11;
      if (thumbExtended) extended += 1;
      return extended / 5;
    }

    updateProgress() {
      const progress = clamp(this.openHold / 720, 0, 1);
      intro.style.setProperty("--gesture-progress", `${progress * 360}deg`);
    }

    stop() {
      this.running = false;
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      video.srcObject = null;
      this.field.setPointer(-9999, -9999, false, "hand");
      if (this.landmarker?.close) this.landmarker.close();
      this.landmarker = null;
    }
  }

  const music = new CelloSuitesMusic();
  const field = new GestureParticleField(canvas, music);
  let leaving = false;
  let handController;

  const enterSite = async (method) => {
    if (leaving) return;
    leaving = true;
    music.unlock().then((enabled) => {
      if (enabled) music.cadence();
    });
    handController?.stop();
    status.textContent = method === "gesture" ? "Open palm accepted · entering" : "Entering academic profile";
    intro.classList.add("is-leaving");
    intro.setAttribute("aria-hidden", "true");
    siteHeader.inert = false;
    siteMain.inert = false;
    siteHeader.removeAttribute("aria-hidden");
    siteMain.removeAttribute("aria-hidden");
    document.body.classList.remove("intro-active");
    window.setTimeout(() => { intro.hidden = true; }, reducedMotion ? 20 : 900);
  };

  handController = new HandGestureController(field, music, enterSite);

  cameraButton.addEventListener("click", (event) => {
    event.stopPropagation();
    handController.start();
  });

  mouseSoundButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    const enabled = await music.unlock();
    if (enabled) {
      mouseSoundButton.textContent = "Mouse sound on";
      status.textContent = "Move left and right across LAN LUO · click the field to enter";
      music.playAt(0.25, 0.45, 0.45, 1);
    } else {
      status.textContent = "Audio unavailable · particle interaction still works";
    }
  });

  enterButton.addEventListener("click", (event) => {
    event.stopPropagation();
    enterSite("button");
  });
  skipButton.addEventListener("click", (event) => {
    event.stopPropagation();
    enterSite("skip");
  });
  canvas.addEventListener("click", () => enterSite("mouse"));
  window.addEventListener("pagehide", () => handController.stop());
})();
