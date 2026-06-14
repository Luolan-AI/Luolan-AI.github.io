(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const readColor = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  class ThemeController {
    constructor(button) {
      this.button = button;
      this.meta = document.querySelector('meta[name="theme-color"]');
      this.media = window.matchMedia("(prefers-color-scheme: dark)");
      this.hasSavedTheme = false;
      try {
        this.hasSavedTheme = Boolean(localStorage.getItem("lan-luo-theme"));
      } catch {
        this.hasSavedTheme = false;
      }
      this.updateButton();
      button.addEventListener("click", () => this.toggle());
      this.media.addEventListener("change", (event) => {
        if (!this.hasSavedTheme) this.apply(event.matches ? "dark" : "light", false);
      });
    }

    toggle() {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      this.apply(nextTheme, true);
    }

    apply(theme, persist) {
      document.documentElement.dataset.theme = theme;
      this.hasSavedTheme = persist || this.hasSavedTheme;
      if (persist) {
        try {
          localStorage.setItem("lan-luo-theme", theme);
        } catch {
          // The visual mode still works when storage is unavailable.
        }
      }
      this.updateButton();
      window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
    }

    updateButton() {
      const isDark = document.documentElement.dataset.theme === "dark";
      this.button.setAttribute("aria-pressed", String(isDark));
      this.button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      this.button.querySelector(".theme-label").textContent = isDark ? "light" : "night";
      if (this.meta) this.meta.content = isDark ? "#171a1c" : "#dfe2e2";
    }
  }

  class NeuralField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.pointer = { x: 0.5, y: 0.5 };
      this.nodes = [];
      this.edges = [];
      this.time = 0;
      this.updatePalette = this.updatePalette.bind(this);
      this.resize = this.resize.bind(this);
      this.draw = this.draw.bind(this);
      window.addEventListener("resize", this.resize, { passive: true });
      window.addEventListener("themechange", this.updatePalette);
      window.addEventListener("pointermove", (event) => {
        this.pointer.x = event.clientX / window.innerWidth;
        this.pointer.y = event.clientY / window.innerHeight;
      }, { passive: true });
      this.updatePalette();
      this.resize();
      this.draw();
    }

    updatePalette() {
      this.lineColor = readColor("--canvas-line-rgb", "9, 86, 140");
      this.nodeColor = readColor("--canvas-node-rgb", "141, 156, 160");
      if (reducedMotion && this.width) this.draw();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.buildNetwork();
    }

    buildNetwork() {
      this.nodes = [];
      this.edges = [];
      const layers = [0.05, 0.22, 0.43, 0.65, 0.83, 0.97];
      const counts = this.width < 700 ? [3, 4, 4, 4, 3, 2] : [4, 6, 7, 7, 5, 4];
      let seed = 1147;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      layers.forEach((layerX, layerIndex) => {
        const layer = [];
        for (let i = 0; i < counts[layerIndex]; i += 1) {
          const node = {
            x: layerX * this.width + (random() - 0.5) * this.width * 0.05,
            y: ((i + 1) / (counts[layerIndex] + 1)) * this.height + (random() - 0.5) * 80,
            radius: 0.8 + random() * 1.4,
            phase: random() * Math.PI * 2,
            speed: 0.12 + random() * 0.16,
            layer: layerIndex,
          };
          this.nodes.push(node);
          layer.push(node);
        }

        if (layerIndex > 0) {
          const previous = this.nodes.filter((node) => node.layer === layerIndex - 1);
          layer.forEach((node) => {
            previous
              .slice()
              .sort((a, b) => Math.abs(a.y - node.y) - Math.abs(b.y - node.y))
              .slice(0, layerIndex % 2 === 0 ? 2 : 1)
              .forEach((source) => this.edges.push([source, node]));
          });
        }
      });
    }

    draw() {
      const { ctx, width, height } = this;
      ctx.clearRect(0, 0, width, height);
      this.time += reducedMotion ? 0 : 0.005;
      const parallaxX = (this.pointer.x - 0.5) * 14;
      const parallaxY = (this.pointer.y - 0.5) * 10;

      ctx.lineWidth = 0.55;
      this.edges.forEach(([a, b], index) => {
        const ax = a.x + Math.sin(this.time * a.speed + a.phase) * 8 + parallaxX * 0.25;
        const ay = a.y + Math.cos(this.time * a.speed + a.phase) * 9 + parallaxY * 0.25;
        const bx = b.x + Math.sin(this.time * b.speed + b.phase) * 8 + parallaxX * 0.45;
        const by = b.y + Math.cos(this.time * b.speed + b.phase) * 9 + parallaxY * 0.45;
        const pulse = 0.028 + Math.sin(this.time * 1.6 + index * 0.7) * 0.009;
        ctx.strokeStyle = `rgba(${this.lineColor}, ${pulse * 1.9})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      });

      this.nodes.forEach((node, index) => {
        const depth = 0.18 + node.layer * 0.06;
        const x = node.x + Math.sin(this.time * node.speed + node.phase) * 8 + parallaxX * depth;
        const y = node.y + Math.cos(this.time * node.speed + node.phase) * 9 + parallaxY * depth;
        const alpha = 0.09 + (Math.sin(this.time * 1.3 + index) + 1) * 0.035;
        ctx.fillStyle = `rgba(${this.nodeColor}, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(x, y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!reducedMotion) requestAnimationFrame(this.draw);
    }
  }

  class ParticleTitle {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.particles = [];
      this.pointer = { x: -9999, y: -9999, active: false };
      this.radius = 70;
      this.resizeTimer = 0;
      this.onMove = null;
      this.updatePalette = this.updatePalette.bind(this);
      this.resize = this.resize.bind(this);
      this.animate = this.animate.bind(this);
      window.addEventListener("resize", () => {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(this.resize, 120);
      }, { passive: true });
      canvas.addEventListener("pointermove", (event) => this.handlePointer(event), { passive: true });
      canvas.addEventListener("pointerenter", () => { this.pointer.active = true; });
      canvas.addEventListener("pointerleave", () => {
        this.pointer.active = false;
        this.pointer.x = -9999;
        this.pointer.y = -9999;
      });
      window.addEventListener("pointermove", (event) => {
        const rect = this.canvas.getBoundingClientRect();
        const isOutside = event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom;
        if (isOutside) {
          this.pointer.active = false;
          this.pointer.x = -9999;
          this.pointer.y = -9999;
        }
      }, { passive: true });
      window.addEventListener("themechange", this.updatePalette);
      this.updatePalette();
      this.resize();
      this.animate();
    }

    updatePalette() {
      this.particleColor = readColor("--particle-rgb", "9, 86, 140");
      if (reducedMotion && this.width) this.drawStatic();
    }

    handlePointer(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.pointer.active = true;
      if (this.onMove) this.onMove(this.pointer.x / rect.width, event);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(1, Math.round(rect.width));
      this.height = Math.max(1, Math.round(rect.height));
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.buildParticles();
    }

    buildParticles() {
      const buffer = document.createElement("canvas");
      buffer.width = this.width;
      buffer.height = this.height;
      const bufferCtx = buffer.getContext("2d", { willReadFrequently: true });
      const fontSize = clamp(this.width * 0.19, 58, 170);
      bufferCtx.clearRect(0, 0, this.width, this.height);
      bufferCtx.fillStyle = "#ffffff";
      bufferCtx.font = `700 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
      bufferCtx.textAlign = "center";
      bufferCtx.textBaseline = "middle";
      bufferCtx.fillText("LAN LUO", this.width / 2, this.height / 2);
      const pixels = bufferCtx.getImageData(0, 0, this.width, this.height).data;
      const gap = this.width < 600 ? 3 : 4;
      const nextParticles = [];

      for (let y = 0; y < this.height; y += gap) {
        for (let x = 0; x < this.width; x += gap) {
          if (pixels[(y * this.width + x) * 4 + 3] > 120) {
            const existing = this.particles[nextParticles.length];
            nextParticles.push({
              x: existing ? existing.x : x + (Math.random() - 0.5) * 90,
              y: existing ? existing.y : y + (Math.random() - 0.5) * 90,
              tx: x,
              ty: y,
              vx: existing ? existing.vx : 0,
              vy: existing ? existing.vy : 0,
              size: 0.75 + Math.random() * 0.85,
              alpha: 0.5 + Math.random() * 0.5,
            });
          }
        }
      }

      this.particles = nextParticles;
      document.querySelector(".hero").classList.add("particles-ready");
      if (reducedMotion) this.drawStatic();
    }

    drawStatic() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.particles.forEach((particle) => {
        this.ctx.fillStyle = `rgba(${this.particleColor}, ${particle.alpha})`;
        this.ctx.fillRect(particle.tx, particle.ty, particle.size, particle.size);
      });
    }

    animate() {
      if (reducedMotion) return;
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.particles.forEach((particle) => {
        if (this.pointer.active) {
          const dx = particle.x - this.pointer.x;
          const dy = particle.y - this.pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < this.radius * this.radius && distanceSquared > 0.01) {
            const distance = Math.sqrt(distanceSquared);
            const force = (1 - distance / this.radius) * 1.05;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        particle.vx += (particle.tx - particle.x) * 0.026;
        particle.vy += (particle.ty - particle.y) * 0.026;
        particle.vx *= 0.84;
        particle.vy *= 0.84;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const speed = Math.abs(particle.vx) + Math.abs(particle.vy);
        const shimmer = clamp(speed * 0.05, 0, 0.22);
        this.ctx.fillStyle = `rgba(${this.particleColor}, ${particle.alpha - 0.14 + shimmer})`;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        this.ctx.fill();
      });
      requestAnimationFrame(this.animate);
    }
  }

  class MusicBox {
    constructor(button, title) {
      this.button = button;
      this.title = title;
      this.enabled = false;
      this.lastPlayed = 0;
      this.step = 0;
      this.context = null;
      this.master = null;
      this.sequence = [0, 2, 4, 1, 3, 5, 2, 4, 6, 3, 1, 5];
      this.frequencies = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1174.66];
      button.addEventListener("click", () => this.toggle());
      title.onMove = (position) => this.handleMove(position);
    }

    async toggle() {
      if (!this.context) this.createContext();
      if (!this.context) return;
      this.enabled = !this.enabled;
      this.button.setAttribute("aria-pressed", String(this.enabled));
      this.button.setAttribute("aria-label", this.enabled ? "Disable ambient sound" : "Enable ambient sound");
      this.button.querySelector(".sound-label").textContent = this.enabled ? "sound: listening" : "sound: muted";
      if (this.enabled) {
        if (this.context.state === "suspended") {
          try {
            await this.context.resume();
          } catch {
            return;
          }
        }
        this.playNote(2, 0.55);
      }
    }

    createContext() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this.button.disabled = true;
        this.button.querySelector(".sound-label").textContent = "sound: unavailable";
        return;
      }

      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      const delay = this.context.createDelay(2.5);
      const feedback = this.context.createGain();
      const wet = this.context.createGain();
      delay.delayTime.value = 0.38;
      feedback.gain.value = 0.24;
      wet.gain.value = 0.18;
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      this.master.connect(this.context.destination);
      this.master.connect(delay);
      wet.connect(this.context.destination);
    }

    handleMove(position) {
      if (!this.enabled || !this.context) return;
      const now = performance.now();
      if (now - this.lastPlayed < 460) return;
      this.lastPlayed = now;
      const positionalOffset = Math.round(position * 2) - 1;
      const note = clamp(this.sequence[this.step % this.sequence.length] + positionalOffset, 0, this.frequencies.length - 1);
      this.step += 1;
      this.playNote(note, 0.38 + Math.abs(position - 0.5) * 0.18);
    }

    playNote(index, intensity) {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      const frequency = this.frequencies[index];
      const gain = this.context.createGain();
      const fundamental = this.context.createOscillator();
      const overtone = this.context.createOscillator();
      const overtoneGain = this.context.createGain();
      fundamental.type = "sine";
      overtone.type = "triangle";
      fundamental.frequency.value = frequency;
      overtone.frequency.value = frequency * 2.01;
      overtoneGain.gain.value = 0.09;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.032 * intensity, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
      fundamental.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(this.master);
      fundamental.start(now);
      overtone.start(now);
      fundamental.stop(now + 1.7);
      overtone.stop(now + 1.7);
    }
  }

  const spaceCanvas = document.querySelector("#space-canvas");
  const titleCanvas = document.querySelector("#particle-title");
  const themeButton = document.querySelector(".theme-toggle");
  const soundButton = document.querySelector(".sound-toggle");
  new ThemeController(themeButton);
  new NeuralField(spaceCanvas);
  const particleTitle = new ParticleTitle(titleCanvas);
  new MusicBox(soundButton, particleTitle);

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
  document.querySelector("#year").textContent = new Date().getFullYear();
})();
