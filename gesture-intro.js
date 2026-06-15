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

  class ContinuousMusic {
    constructor() {
      this.context = null;
      this.master = null;
      this.delay = null;
      this.enabled = false;
      this.step = 0;
      this.timer = 0;
      this.activeUntil = 0;
      this.motion = { x: 0.5, y: 0.5, energy: 0.45, direction: 1 };
      this.sequence = [
        62, 66, 69, 74,
        67, 71, 74, 79,
        69, 73, 76, 81,
        59, 62, 66, 71,
        67, 71, 74, 79,
        66, 69, 74, 78,
        64, 67, 71, 76,
        69, 73, 76, 81,
      ];
      this.scheduleNext = this.scheduleNext.bind(this);
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
      this.master.gain.value = 0.17;
      this.delay = this.context.createDelay(2);
      const feedback = this.context.createGain();
      const wet = this.context.createGain();
      this.delay.delayTime.value = 0.31;
      feedback.gain.value = 0.2;
      wet.gain.value = 0.16;
      this.delay.connect(feedback);
      feedback.connect(this.delay);
      this.delay.connect(wet);
      this.master.connect(this.context.destination);
      this.master.connect(this.delay);
      wet.connect(this.context.destination);
    }

    move(position, verticalPosition = 0.5, energy = 0.5, direction = 1) {
      this.motion = {
        x: clamp(position, 0, 1),
        y: clamp(verticalPosition, 0, 1),
        energy: clamp(energy, 0.22, 1),
        direction,
      };
      this.activeUntil = performance.now() + 520;
      if (this.enabled && !this.timer) this.scheduleNext();
    }

    scheduleNext() {
      this.timer = 0;
      if (!this.enabled || performance.now() > this.activeUntil) return;

      const octave = this.motion.y < 0.2 ? 12 : this.motion.y > 0.82 ? -12 : 0;
      const midi = this.sequence[this.step % this.sequence.length] + octave;
      const pan = clamp((this.motion.x - 0.5) * 1.35, -0.8, 0.8);
      this.playMidi(midi, this.motion.energy, 0, pan);
      if (this.step % 4 === 0) this.playMidi(midi - 12, this.motion.energy * 0.28, 0.028, pan * 0.45);
      this.step += 1;
      const interval = clamp(166 - this.motion.energy * 48, 112, 155);
      this.timer = window.setTimeout(this.scheduleNext, interval);
    }

    playMidi(midi, energy = 0.5, delay = 0, pan = 0) {
      if (!this.context || !this.master) return;
      const frequency = 440 * (2 ** ((midi - 69) / 12));
      const now = this.context.currentTime + delay;
      const gain = this.context.createGain();
      const fundamental = this.context.createOscillator();
      const overtone = this.context.createOscillator();
      const overtoneGain = this.context.createGain();
      const panner = this.context.createStereoPanner?.();

      fundamental.type = "sine";
      overtone.type = "triangle";
      fundamental.frequency.value = frequency;
      overtone.frequency.value = frequency * 2.003;
      overtoneGain.gain.value = 0.055;
      if (panner) panner.pan.setValueAtTime(pan, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.028 * energy, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.011 * energy, now + 0.34);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.42);
      fundamental.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(this.master);
      } else {
        gain.connect(this.master);
      }
      fundamental.start(now);
      overtone.start(now);
      fundamental.stop(now + 1.48);
      overtone.stop(now + 1.48);
    }

    preview() {
      if (!this.enabled) return;
      [62, 66, 69, 74, 76, 74].forEach((note, index) => this.playMidi(note, 0.42, index * 0.11, -0.25 + index * 0.1));
    }

    cadence() {
      if (!this.enabled) return;
      [62, 66, 69, 74].forEach((note, index) => this.playMidi(note, 0.48, index * 0.075));
    }

    stop() {
      this.activeUntil = 0;
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = 0;
    }
  }

  class GestureParticleField {
    constructor(targetCanvas, music) {
      this.canvas = targetCanvas;
      this.ctx = targetCanvas.getContext("2d");
      this.music = music;
      this.particles = [];
      this.stars = [];
      this.trails = [];
      this.ripples = [];
      this.pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, source: "mouse", intensity: 0 };
      this.handPointer = null;
      this.lastInput = { x: 0, y: 0, time: performance.now(), source: "mouse" };
      this.gesturePose = "neutral";
      this.poseChangedAt = performance.now();
      this.width = 1;
      this.height = 1;
      this.radius = 185;
      this.startedAt = performance.now();
      this.formedAt = reducedMotion ? 0 : this.startedAt + 2350;
      this.lastRipple = 0;
      this.resizeTimer = 0;
      this.resize = this.resize.bind(this);
      this.animate = this.animate.bind(this);

      window.addEventListener("resize", () => {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(this.resize, 120);
      }, { passive: true });
      targetCanvas.addEventListener("pointermove", (event) => this.handlePointer(event), { passive: true });
      targetCanvas.addEventListener("pointerleave", () => {
        if (this.pointer.source === "mouse") {
          this.setPointer(-9999, -9999, false, "mouse");
          this.music.stop();
        }
      });
      this.resize();
      this.animate();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.radius = this.width < 680 ? 112 : 185;
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
            const angle = Math.random() * Math.PI * 2;
            const scatterRadius = Math.max(this.width, this.height) * (0.24 + Math.random() * 0.62);
            nextParticles.push({
              x: existing ? existing.x : origin.x,
              y: existing ? existing.y : origin.y,
              tx: x,
              ty: y,
              vx: existing ? existing.vx : 0,
              vy: existing ? existing.vy : 0,
              sx: this.width / 2 + Math.cos(angle) * scatterRadius,
              sy: this.height / 2 + Math.sin(angle) * scatterRadius,
              birth: existing?.birth ?? this.startedAt + Math.random() * 920,
              depth: 0.45 + Math.random() * 0.85,
              phase: Math.random() * Math.PI * 2,
              size: 0.7 + Math.random() * 1.35,
              alpha: 0.42 + Math.random() * 0.54,
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
      const count = this.width < 680 ? 54 : 118;
      this.stars = Array.from({ length: count }, () => ({
        x: random() * this.width,
        y: random() * this.height,
        z: 0.25 + random() * 0.9,
        size: 0.3 + random() * 1.05,
        alpha: 0.035 + random() * 0.18,
        phase: random() * Math.PI * 2,
      }));
    }

    handlePointer(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.handleMotion(x, y, "mouse");
    }

    setHandPointer(x, y) {
      const targetX = x * this.width;
      const targetY = y * this.height;
      if (!this.handPointer) this.handPointer = { x: targetX, y: targetY };
      const distance = Math.hypot(targetX - this.handPointer.x, targetY - this.handPointer.y);
      const smoothing = clamp(0.38 + distance / 420, 0.38, 0.78);
      this.handPointer.x += (targetX - this.handPointer.x) * smoothing;
      this.handPointer.y += (targetY - this.handPointer.y) * smoothing;
      this.handleMotion(this.handPointer.x, this.handPointer.y, "hand");
    }

    handleMotion(x, y, source) {
      const now = performance.now();
      const sourceChanged = this.lastInput.source !== source;
      const elapsed = Math.max(16, now - this.lastInput.time);
      const dx = sourceChanged ? 0 : x - this.lastInput.x;
      const dy = sourceChanged ? 0 : y - this.lastInput.y;
      const velocity = Math.hypot(dx, dy) / elapsed;
      const direction = dx >= 0 ? 1 : -1;
      this.setPointer(x, y, true, source, dx / elapsed, dy / elapsed, velocity);
      if (velocity > 0.035) {
        this.music.move(x / this.width, y / this.height, clamp(velocity * 0.72, 0.26, 1), direction);
        this.trails.push({ x, y, life: 1, size: 14 + Math.min(velocity * 24, 28) });
        if (this.trails.length > 34) this.trails.shift();
        if (velocity > 0.62 && now - this.lastRipple > 170) {
          this.ripples.push({ x, y, radius: 12, life: 1 });
          this.lastRipple = now;
        }
      }
      this.lastInput = { x, y, time: now, source };
    }

    setPointer(x, y, active, source, vx = 0, vy = 0, intensity = 0) {
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.vx = vx;
      this.pointer.vy = vy;
      this.pointer.active = active;
      this.pointer.source = source;
      this.pointer.intensity = clamp(intensity, 0, 2.2);
    }

    setGesturePose(pose) {
      if (this.gesturePose === pose) return;
      this.gesturePose = pose;
      this.poseChangedAt = performance.now();
      if (pose === "open") {
        this.ripples.push({ x: this.pointer.x, y: this.pointer.y, radius: 24, life: 1.3 });
      } else if (pose === "fist") {
        this.ripples.push({ x: this.width / 2, y: this.height * 0.43, radius: Math.min(this.width, this.height) * 0.42, life: 0.75, inward: true });
      }
    }

    drawBackdrop(now) {
      const { ctx, width, height } = this;
      const parallaxX = this.pointer.active ? (this.pointer.x / width - 0.5) * 18 : 0;
      const parallaxY = this.pointer.active ? (this.pointer.y / height - 0.5) * 12 : 0;

      this.stars.forEach((star) => {
        star.y -= 0.025 + star.z * 0.07;
        if (star.y < -3) star.y = height + 3;
        const pulse = 0.68 + Math.sin(now * 0.0012 + star.phase) * 0.32;
        ctx.fillStyle = `rgba(170, 204, 221, ${star.alpha * pulse})`;
        ctx.fillRect(star.x + parallaxX * star.z, star.y + parallaxY * star.z, star.size * star.z, star.size * star.z);
      });

      ctx.save();
      ctx.translate(width / 2, height * 0.43);
      ctx.rotate(now * 0.000025);
      ctx.strokeStyle = "rgba(111, 157, 180, 0.055)";
      ctx.lineWidth = 1;
      [0.3, 0.44, 0.61].forEach((scale, index) => {
        ctx.beginPath();
        ctx.ellipse(0, 0, width * scale, height * scale * 0.42, index * 0.38, Math.PI * 0.08, Math.PI * 1.55);
        ctx.stroke();
      });
      ctx.restore();

      if (this.pointer.active) {
        const aura = ctx.createRadialGradient(this.pointer.x, this.pointer.y, 0, this.pointer.x, this.pointer.y, this.radius * 1.25);
        aura.addColorStop(0, `rgba(146, 212, 242, ${0.07 + this.pointer.intensity * 0.035})`);
        aura.addColorStop(0.38, "rgba(83, 151, 184, 0.035)");
        aura.addColorStop(1, "rgba(40, 91, 118, 0)");
        ctx.fillStyle = aura;
        ctx.fillRect(this.pointer.x - this.radius * 1.25, this.pointer.y - this.radius * 1.25, this.radius * 2.5, this.radius * 2.5);
      }
    }

    drawMotion() {
      const { ctx } = this;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      if (this.trails.length > 1) {
        ctx.beginPath();
        this.trails.forEach((trail, index) => {
          if (index === 0) ctx.moveTo(trail.x, trail.y);
          else ctx.lineTo(trail.x, trail.y);
        });
        ctx.strokeStyle = "rgba(118, 190, 224, 0.18)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      this.trails = this.trails.filter((trail) => {
        trail.life -= 0.032;
        trail.size += 0.42;
        if (trail.life <= 0) return false;
        ctx.fillStyle = `rgba(130, 205, 239, ${trail.life * 0.055})`;
        ctx.beginPath();
        ctx.arc(trail.x, trail.y, trail.size, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });

      this.ripples = this.ripples.filter((ripple) => {
        ripple.life -= ripple.inward ? 0.028 : 0.022;
        ripple.radius += ripple.inward ? -10 : 7;
        if (ripple.life <= 0 || ripple.radius <= 2) return false;
        ctx.strokeStyle = `rgba(147, 211, 239, ${Math.max(0, ripple.life) * 0.22})`;
        ctx.lineWidth = 0.8 + ripple.life * 1.4;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.stroke();
        return true;
      });
      ctx.restore();
    }

    animate() {
      const { ctx, width, height } = this;
      const now = performance.now();
      const forming = now < this.formedAt;
      const poseAge = clamp((now - this.poseChangedAt) / 720, 0, 1);
      ctx.clearRect(0, 0, width, height);
      this.drawBackdrop(now);
      this.drawMotion();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      this.particles.forEach((particle, index) => {
        if (now < particle.birth && forming) return;

        let targetX = particle.tx;
        let targetY = particle.ty;
        let attraction = forming ? 0.007 : 0.027;
        let drag = forming ? 0.91 : 0.855;

        if (this.gesturePose === "open") {
          targetX = particle.sx;
          targetY = particle.sy;
          attraction = 0.012 + poseAge * 0.02;
          drag = 0.89;
        } else if (this.gesturePose === "fist") {
          attraction = 0.038 + poseAge * 0.035;
          drag = 0.82;
        }

        if (forming) {
          const birthProgress = clamp((now - particle.birth) / 1350, 0, 1);
          attraction += birthProgress * 0.018;
          const centerDx = particle.x - width / 2;
          const centerDy = particle.y - height * 0.43;
          const swirl = (1 - birthProgress) * 0.00042 * particle.depth;
          particle.vx += -centerDy * swirl;
          particle.vy += centerDx * swirl;
        }

        if (this.pointer.active && this.gesturePose !== "fist") {
          const dx = particle.x - this.pointer.x;
          const dy = particle.y - this.pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          const targetDx = particle.tx - this.pointer.x;
          const targetDy = particle.ty - this.pointer.y;
          const targetDistance = Math.hypot(targetDx, targetDy);
          const coreRadius = this.radius * (this.pointer.source === "hand" ? 0.5 : 0.44);

          if (targetDistance < coreRadius) {
            const targetAngle = targetDistance > 0.01
              ? Math.atan2(targetDy, targetDx)
              : particle.phase;
            const targetPush = coreRadius + (1 - targetDistance / coreRadius) * 18;
            targetX = this.pointer.x + Math.cos(targetAngle) * targetPush;
            targetY = this.pointer.y + Math.sin(targetAngle) * targetPush;
            attraction *= 1.25;
          }

          if (distanceSquared < this.radius * this.radius && distanceSquared > 0.01) {
            const distance = Math.sqrt(distanceSquared);
            const influence = 1 - distance / this.radius;
            const strength = influence * (this.pointer.source === "hand" ? 3.5 : 2.45);
            const sweep = influence * Math.min(this.pointer.intensity, 1.8);
            particle.vx += (dx / distance) * strength + this.pointer.vx * sweep * 1.35;
            particle.vy += (dy / distance) * strength + this.pointer.vy * sweep * 1.35;
            const spin = (this.pointer.vx * dy - this.pointer.vy * dx >= 0 ? 1 : -1) * influence * 0.92;
            particle.vx += (-dy / distance) * spin;
            particle.vy += (dx / distance) * spin;

            if (index % 31 === 0) {
              ctx.strokeStyle = `rgba(112, 193, 229, ${influence * 0.18})`;
              ctx.lineWidth = 0.55;
              ctx.beginPath();
              ctx.moveTo(particle.x, particle.y);
              ctx.lineTo(this.pointer.x, this.pointer.y);
              ctx.stroke();
            }
          }
        }

        particle.vx += (targetX - particle.x) * attraction;
        particle.vy += (targetY - particle.y) * attraction;
        particle.vx *= drag;
        particle.vy *= drag;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const speed = Math.abs(particle.vx) + Math.abs(particle.vy);
        const shimmer = clamp(speed * 0.045, 0, 0.48);
        const pulse = 0.84 + Math.sin(now * 0.0024 + particle.phase) * 0.16;
        if (index % 7 === 0 && speed > 1.1) {
          ctx.fillStyle = `rgba(93, 180, 222, ${Math.min(0.11, shimmer * 0.2)})`;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size * 4.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(190, 224, 239, ${clamp((particle.alpha - 0.1 + shimmer) * pulse, 0.08, 1)})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size + shimmer * 0.9, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
      this.pointer.intensity *= 0.92;
      this.pointer.vx *= 0.9;
      this.pointer.vy *= 0.9;
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
      this.lastHandSeen = 0;
      this.entryHold = 0;
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
        status.textContent = "Show one hand · open, close, or make OK";
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
        this.entryHold = Math.max(0, this.entryHold - delta * 1.8);
        if (now - this.lastHandSeen < 240) {
          this.updateProgress();
          status.textContent = "Tracking hand · keep moving through the name";
          return;
        }
        this.field.setGesturePose("neutral");
        this.field.handPointer = null;
        this.field.setPointer(-9999, -9999, false, "hand");
        this.music.stop();
        this.updateProgress();
        status.textContent = "No hand detected · place one hand in view";
        return;
      }
      this.lastHandSeen = now;

      const indexTip = landmarks[8];
      const x = 1 - indexTip.x;
      const y = indexTip.y;
      this.field.setHandPointer(x, y);

      const openness = this.getOpenness(landmarks);
      const okGesture = this.isOkGesture(landmarks);
      const fistGesture = this.isFistGesture(landmarks);
      if (okGesture) {
        this.entryHold += delta;
        this.field.setGesturePose("neutral");
        status.textContent = "OK gesture detected · hold to enter";
      } else {
        this.entryHold = Math.max(0, this.entryHold - delta * 1.55);
        if (openness >= 0.8) {
          this.field.setGesturePose("open");
          status.textContent = "Open hand · particles released";
        } else if (fistGesture) {
          this.field.setGesturePose("fist");
          status.textContent = "Fist detected · gathering LAN LUO";
        } else {
          this.field.setGesturePose("neutral");
          status.textContent = "Move through the field · make OK to enter";
        }
      }
      this.updateProgress();
      if (this.entryHold >= 680) this.onEnter("gesture");
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

    isOkGesture(landmarks) {
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      const wrist = landmarks[0];
      const palmSpan = Math.max(0.06, distance(landmarks[5], landmarks[17]));
      const pinched = distance(landmarks[4], landmarks[8]) < palmSpan * 0.42;
      const raised = [[12, 10], [16, 14], [20, 18]].filter(([tip, pip]) => (
        distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) * 1.12
      )).length;
      return pinched && raised >= 2;
    }

    isFistGesture(landmarks) {
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      const wrist = landmarks[0];
      const curledFingers = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([tip, pip]) => (
        distance(landmarks[tip], wrist) < distance(landmarks[pip], wrist) * 1.08
      )).length;
      const indexCurled = distance(landmarks[8], wrist) < distance(landmarks[6], wrist) * 1.08;
      const palmSpan = Math.max(0.06, distance(landmarks[5], landmarks[17]));
      const thumbFolded = distance(landmarks[4], landmarks[9]) < palmSpan * 0.95;
      return indexCurled && curledFingers >= 3 && thumbFolded;
    }

    updateProgress() {
      const progress = clamp(this.entryHold / 680, 0, 1);
      intro.style.setProperty("--gesture-progress", `${progress * 360}deg`);
    }

    stop() {
      this.running = false;
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      video.srcObject = null;
      this.field.handPointer = null;
      this.field.setPointer(-9999, -9999, false, "hand");
      this.field.setGesturePose("neutral");
      this.music.stop();
      if (this.landmarker?.close) this.landmarker.close();
      this.landmarker = null;
    }
  }

  const music = new ContinuousMusic();
  const field = new GestureParticleField(canvas, music);
  let leaving = false;
  let handController;

  const enterSite = async (method) => {
    if (leaving) return;
    leaving = true;
    music.stop();
    music.unlock().then((enabled) => {
      if (enabled) music.cadence();
    });
    handController?.stop();
    status.textContent = method === "gesture" ? "OK gesture accepted · entering" : "Entering academic profile";
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
      music.preview();
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
