import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';
import { GestureResult, GestureType } from '../core/GestureRecognizer';
import { HandData } from '../core/HandTracker';
import { HeartEffect } from './HeartEffect';

export class EffectsManager {
  private particleSystem: ParticleSystem;
  private heartEffect: HeartEffect;
  private pulseTime: number = 0;

  // Double-buffered targets for smooth particle morphing
  private desiredTargets: Float32Array;
  private currentTargets: Float32Array;

  // Hand position smoothing & dead-zone damping
  private smoothedHandCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private targetHandCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private isHandPresent: boolean = false;

  // Precomputed rasterized 2D points for CHAROS text formation
  private charosPoints: { x: number; y: number }[] = [];

  // 🖐️ STOP Dense Cluster State (Inertia & Motion Flow)
  private stopClusterCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private stopClusterVel: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private stopStrength: number = 0;

  // 🫰 BUTTERFLY State (Living Flap, Inertia, Follow & Trailing)
  private butterflyCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private butterflyVelocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private butterflyTilt: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  constructor(particleSystem: ParticleSystem) {
    this.particleSystem = particleSystem;
    this.heartEffect = new HeartEffect();

    const maxParticles = 90000;
    this.desiredTargets = new Float32Array(maxParticles * 3);
    this.currentTargets = new Float32Array(maxParticles * 3);

    this.initCharosTextPoints();
  }

  public update(deltaTime: number, gestureResult: GestureResult, hands: HandData[]): void {
    this.pulseTime += deltaTime * 2.5;
    const activeCount = this.particleSystem.getActiveParticleCount();
    const clampedDt = Math.min(deltaTime, 0.05);

    // Smooth hand position tracking
    if (hands.length > 0) {
      const p1World = this.particleSystem.screenToWorld(
        gestureResult.primaryHandPosition.x,
        gestureResult.primaryHandPosition.y,
        0
      );

      if (!this.isHandPresent) {
        this.smoothedHandCenter.copy(p1World);
        this.stopClusterCenter.copy(p1World);
        this.butterflyCenter.copy(p1World);
        this.isHandPresent = true;
      } else {
        this.targetHandCenter.copy(p1World);
        const followSpeed = 10.0;
        this.smoothedHandCenter.lerp(this.targetHandCenter, 1.0 - Math.exp(-followSpeed * clampedDt));
      }
    } else {
      this.targetHandCenter.set(0, 0, 0);
      this.smoothedHandCenter.lerp(this.targetHandCenter, 1.0 - Math.exp(-2.0 * clampedDt));
      this.isHandPresent = false;
    }

    let p1World = this.smoothedHandCenter.clone();
    let p2World: THREE.Vector3 | null = null;

    if (gestureResult.secondaryHandPosition) {
      p2World = this.particleSystem.screenToWorld(
        gestureResult.secondaryHandPosition.x,
        gestureResult.secondaryHandPosition.y,
        0
      );
    }

    // Map hand gestures to distinct Formations
    switch (gestureResult.gesture) {
      // 💖 1. GLOWING NEON "CHAROS" NAME WITH FLOATING HEARTS (LOVE 🫶🏻)
      case 'LOVE':
        this.generateCharosEffect(this.desiredTargets, activeCount, p1World, p2World);
        break;

      // 🧬 2. DNA DOUBLE HELIX FORMATION (CROSSED FINGERS 🤞🏻)
      case 'CROSSED':
        this.generateDNA(this.desiredTargets, activeCount, p1World);
        break;

      // 🌌 3. SPIRAL GALAXY (Open Hand / OPEN_PALMS / WAVE)
      case 'OPEN_PALMS':
      case 'WAVE':
        this.generateSpiralGalaxy(this.desiredTargets, activeCount, p1World);
        break;

      // 🖐️ 4. DENSE PARTICLE CLUSTER & INERTIAL HAND FLOW (STOP ✋🏻)
      case 'STOP':
        this.generateStopDenseCluster(this.desiredTargets, activeCount, p1World, gestureResult.handVelocity, clampedDt);
        break;

      // 🫰 5. LIVING BUTTERFLY WITH FLAPPING WINGS & TRAILING (BUTTERFLY 🫰)
      case 'BUTTERFLY':
        this.generateButterflyEffect(this.desiredTargets, activeCount, p1World, gestureResult.handVelocity, clampedDt);
        break;

      // 🪐 6. RINGED PLANET / SATURN (Pinch / OK 👌🏻)
      case 'OK':
        this.generateRingedPlanet(this.desiredTargets, activeCount, p1World);
        break;

      // 💖 6. ENDLESS GLOWING MINI HEARTS MULTIPLYING (PEACE ✌🏻)
      case 'PEACE':
        this.generateEndlessMiniHearts(this.desiredTargets, activeCount, p1World);
        break;

      // 🧊 7. ROTATING 3D WIREFRAME CUBE (FIST ✊🏻)
      case 'FIST':
        this.generateRotatingCube(this.desiredTargets, activeCount, p1World);
        break;

      // ☀️ 6. SOLAR SYSTEM & ORBITAL PLANETS (HANDS_UP)
      case 'HANDS_UP':
        this.generateSolarSystem(this.desiredTargets, activeCount, p1World, p2World);
        break;

      // 🌍 7. ROTATING EARTH PLANET (ONE_FINGER ☝🏻)
      case 'ONE_FINGER':
        this.generateRotatingEarth(this.desiredTargets, activeCount, p1World);
        break;

      // 🌠 8. PULSAR STAR & POLAR JETS (ROCK 🤘🏻)
      case 'ROCK':
        this.generatePulsarStar(this.desiredTargets, activeCount, p1World);
        break;

      // ☁️ 8. COSMIC NEBULA CLOUD (HANDSHAKE / THUMBS_DOWN)
      case 'HANDSHAKE':
      case 'THUMBS_DOWN':
        this.generateCosmicNebula(this.desiredTargets, activeCount, p1World);
        break;

      // IDLE / DEFAULT: When hands are absent, flow across the FULL SCREEN
      case 'IDLE':
      default:
        if (hands.length > 0) {
          this.generateSpiralGalaxy(this.desiredTargets, activeCount, p1World);
        } else {
          this.generateFullScreenIdleFlow(this.desiredTargets, activeCount);
        }
        break;
    }

    // Smooth Particle Morphing Engine
    const morphRate = 1.0 - Math.exp(-14.0 * clampedDt);
    for (let i = 0; i < activeCount * 3; i++) {
      this.currentTargets[i] += (this.desiredTargets[i] - this.currentTargets[i]) * morphRate;
    }

    this.particleSystem.setTargets(this.currentTargets);
  }

  // ---------------------------------------------------------------------------
  // 💖 FORMATION 1: GLOWING NEON "CHAROS" NAME WITH HEARTS (LOVE 🫶🏻)
  // ---------------------------------------------------------------------------
  private initCharosTextPoints(): void {
    if (typeof document === 'undefined') return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 115px "Orbitron", "Outfit", "Arial", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CHAROS', canvas.width / 2, canvas.height / 2);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const step = 2; // high density
      const pts: { x: number; y: number }[] = [];

      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      // Scale to WebGL world units: width ~ 2.8
      const scaleFactor = 2.8 / canvas.width;

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const idx = (y * canvas.width + x) * 4;
          if (data[idx] > 80) { // Text pixel
            pts.push({
              x: (x - halfW) * scaleFactor,
              y: -(y - halfH) * scaleFactor
            });
          }
        }
      }

      this.charosPoints = pts;
    } catch (e) {
      console.warn('Canvas rasterization error for CHAROS text:', e);
    }
  }

  private generateCharosEffect(
    buffer: Float32Array,
    count: number,
    p1: THREE.Vector3,
    p2: THREE.Vector3 | null
  ): void {
    const center = p2 ? p1.clone().add(p2).multiplyScalar(0.5) : p1;

    // Fallback if canvas rasterization didn't produce points
    if (!this.charosPoints || this.charosPoints.length === 0) {
      this.initCharosTextPoints();
    }

    const pts = this.charosPoints;
    const numPts = pts.length;

    // Budget:
    // 65% particles for "CHAROS" text letters (thick, glowing neon typography)
    // 25% particles for surrounding glowing heart outline
    // 10% particles for orbiting sparkle stars & mini hearts
    const textPool = Math.floor(count * 0.65);
    const heartPool = Math.floor(count * 0.25);
    const sparklesPool = count - textPool - heartPool;

    let idx = 0;

    // Subtle gentle pulse
    const pulse = 1.0 + Math.sin(this.pulseTime * 3.0) * 0.035;

    // 1. "CHAROS" Text Letters (Extremely crisp, dense, glowing)
    if (numPts > 0) {
      for (let i = 0; i < textPool; i++) {
        const pt = pts[i % numPts];
        const i3 = idx * 3;

        // Slight 3D extrusion/jitter for neon glow volume
        const jitter = (Math.random() - 0.5) * 0.012;
        const depth = (Math.random() - 0.5) * 0.08;

        buffer[i3]     = center.x + pt.x * pulse + jitter;
        buffer[i3 + 1] = center.y + pt.y * pulse + jitter;
        buffer[i3 + 2] = center.z + depth;
        idx++;
      }
    } else {
      // Fallback
      for (let i = 0; i < textPool; i++) {
        const i3 = idx * 3;
        buffer[i3]     = center.x + (Math.random() - 0.5) * 2.0;
        buffer[i3 + 1] = center.y + (Math.random() - 0.5) * 0.6;
        buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.1;
        idx++;
      }
    }

    // 2. Surrounding Big Glowing Heart Outline framing the name
    const heartScale = 0.145 * pulse;
    for (let i = 0; i < heartPool; i++) {
      const i3 = idx * 3;
      const t = (i / heartPool) * Math.PI * 2.0;

      // Parametric heart formula
      const sinT = Math.sin(t);
      const hx = 16 * sinT * sinT * sinT;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

      // Frame slightly wider horizontally to embrace the word
      const fx = (hx / 16.0) * 2.1 * (heartScale / 0.145);
      const fy = ((hy - 0.5) / 16.0) * 1.65 * (heartScale / 0.145);
      const jitter = (Math.random() - 0.5) * 0.02;

      buffer[i3]     = center.x + fx + jitter;
      buffer[i3 + 1] = center.y + fy + jitter;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.04;
      idx++;
    }

    // 3. Orbiting Sparkles & Floating Mini Hearts
    for (; idx < count; idx++) {
      const i3 = idx * 3;
      const t = (idx / sparklesPool) * Math.PI * 6.0 + this.pulseTime * 0.8;
      const r = 0.4 + (idx % 20) * 0.08;

      buffer[i3]     = center.x + Math.cos(t) * r * 1.5;
      buffer[i3 + 1] = center.y + Math.sin(t) * r * 0.9;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.2;
    }
  }

  // ---------------------------------------------------------------------------
  // ☀️ FORMATION: BEAUTIFUL SOLAR SYSTEM TOP-DOWN VIEW
  // 8 real planets: Mercury, Venus, Earth, Mars, (Asteroid Belt),
  //                 Jupiter, Saturn (rings!), Uranus, Neptune
  // ---------------------------------------------------------------------------
  private generateBeautifulSolarSystem(
    buffer: Float32Array,
    count: number,
    p1: THREE.Vector3,
    p2: THREE.Vector3 | null
  ): void {
    const center = p2 ? p1.clone().add(p2).multiplyScalar(0.5) : p1;

    // Orbital radii (top-down XY plane)
    const planets = [
      { name: 'Mercury', r: 0.22, speed: 4.15,  size: 0.032, color: new THREE.Color(0xb5b5b5) },
      { name: 'Venus',   r: 0.34, speed: 1.62,  size: 0.048, color: new THREE.Color(0xffd27f) },
      { name: 'Earth',   r: 0.47, speed: 1.00,  size: 0.052, color: new THREE.Color(0x4fc3f7) },
      { name: 'Mars',    r: 0.60, speed: 0.53,  size: 0.038, color: new THREE.Color(0xff6b47) },
      { name: 'Jupiter', r: 0.88, speed: 0.084, size: 0.11,  color: new THREE.Color(0xd4a96a) },
      { name: 'Saturn',  r: 1.10, speed: 0.034, size: 0.095, color: new THREE.Color(0xe8d5a3) },
      { name: 'Uranus',  r: 1.30, speed: 0.012, size: 0.070, color: new THREE.Color(0x7de8e8) },
      { name: 'Neptune', r: 1.48, speed: 0.006, size: 0.065, color: new THREE.Color(0x4b70dd) },
    ];

    // Allocate budget: Sun=20%, orbits=35%, planets=30%, asteroid belt=10%, glow=5%
    const sunPool       = Math.floor(count * 0.20);
    const orbitPool     = Math.floor(count * 0.35);
    const planetPool    = Math.floor(count * 0.30);
    const beltPool      = Math.floor(count * 0.10);
    const remaining     = count - sunPool - orbitPool - planetPool - beltPool;

    let idx = 0;

    // ─── SUN ────────────────────────────────────────────────────────────────
    for (let i = 0; i < sunPool; i++) {
      const i3 = idx * 3;
      const pulse = 0.18 + Math.sin(this.pulseTime * 3.0 + i * 0.04) * 0.02;
      const r = Math.pow(Math.random(), 1.8) * pulse;
      const theta = Math.random() * Math.PI * 2;
      buffer[i3]     = center.x + Math.cos(theta) * r;
      buffer[i3 + 1] = center.y + Math.sin(theta) * r;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.015;
      idx++;
    }

    // ─── ORBIT RINGS (fine dotted circles) ──────────────────────────────────
    const perOrbitRing = Math.floor(orbitPool / planets.length);
    for (const pl of planets) {
      for (let i = 0; i < perOrbitRing; i++) {
        const i3 = idx * 3;
        const angle = (i / perOrbitRing) * Math.PI * 2;
        const jitter = (Math.random() - 0.5) * 0.006;
        buffer[i3]     = center.x + Math.cos(angle) * (pl.r + jitter);
        buffer[i3 + 1] = center.y + Math.sin(angle) * (pl.r + jitter);
        buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.008;
        idx++;
      }
    }

    // ─── PLANETS (dense spherical blobs at current orbital angle) ───────────
    const perPlanet = Math.floor(planetPool / planets.length);
    for (const pl of planets) {
      const angle = this.pulseTime * pl.speed;
      const px = center.x + Math.cos(angle) * pl.r;
      const py = center.y + Math.sin(angle) * pl.r;
      const pz = center.z;

      for (let i = 0; i < perPlanet; i++) {
        const i3 = idx * 3;
        const pr = Math.pow(Math.random(), 0.7) * pl.size;
        const theta = Math.random() * Math.PI * 2;
        buffer[i3]     = px + Math.cos(theta) * pr;
        buffer[i3 + 1] = py + Math.sin(theta) * pr;
        buffer[i3 + 2] = pz + (Math.random() - 0.5) * 0.012;

        // Saturn gets a thin equatorial ring
        if (pl.name === 'Saturn' && i < Math.floor(perPlanet * 0.35)) {
          const ringR = pl.size * (1.4 + Math.random() * 0.9);
          const ra = Math.random() * Math.PI * 2;
          buffer[i3]     = px + Math.cos(ra) * ringR;
          buffer[i3 + 1] = py + Math.sin(ra) * ringR * 0.25; // flattened in XY top view
          buffer[i3 + 2] = pz;
        }
        idx++;
      }
    }

    // ─── ASTEROID BELT (between Mars 0.60 and Jupiter 0.88) ─────────────────
    for (let i = 0; i < beltPool; i++) {
      const i3 = idx * 3;
      const r = 0.69 + Math.random() * 0.12;
      const angle = Math.random() * Math.PI * 2;
      buffer[i3]     = center.x + Math.cos(angle) * r + (Math.random() - 0.5) * 0.025;
      buffer[i3 + 1] = center.y + Math.sin(angle) * r + (Math.random() - 0.5) * 0.025;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.012;
      idx++;
    }

    // ─── FILL REMAINING with faint background stars ─────────────────────────
    for (; idx < count; idx++) {
      const i3 = idx * 3;
      const r = 0.05 + Math.random() * 1.55;
      const angle = Math.random() * Math.PI * 2;
      buffer[i3]     = center.x + Math.cos(angle) * r;
      buffer[i3 + 1] = center.y + Math.sin(angle) * r;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.02;
    }
  }

  // ---------------------------------------------------------------------------
  // 🧬 FORMATION 2: DNA DOUBLE HELIX FORMATION (Crossed Fingers CROSSED 🤞🏻)
  // ---------------------------------------------------------------------------
  private generateDNA(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const helixRadius = 0.42;
    const helixHeight = 2.2;
    const strandPool = Math.floor(count * 0.75);
    const rungPool = count - strandPool;
    const perStrand = Math.floor(strandPool / 2);

    // Twin Intertwined Helices
    for (let i = 0; i < perStrand; i++) {
      const t = (i / perStrand) * Math.PI * 8.0;
      const y = (i / perStrand - 0.5) * helixHeight;

      // Strand A
      const i3A = i * 3;
      const angleA = t + this.pulseTime * 0.8;
      buffer[i3A] = center.x + Math.cos(angleA) * helixRadius + (Math.random() - 0.5) * 0.02;
      buffer[i3A + 1] = center.y + y;
      buffer[i3A + 2] = center.z + Math.sin(angleA) * helixRadius + (Math.random() - 0.5) * 0.02;

      // Strand B (Phase shifted by 180 degrees)
      const i3B = (perStrand + i) * 3;
      const angleB = t + Math.PI + this.pulseTime * 0.8;
      buffer[i3B] = center.x + Math.cos(angleB) * helixRadius + (Math.random() - 0.5) * 0.02;
      buffer[i3B + 1] = center.y + y;
      buffer[i3B + 2] = center.z + Math.sin(angleB) * helixRadius + (Math.random() - 0.5) * 0.02;
    }

    // Horizontal Base Pair Cross Rungs
    const rungsCount = 28;
    const particlesPerRung = Math.floor(rungPool / rungsCount);
    let rungIdx = strandPool;

    for (let r = 0; r < rungsCount && rungIdx < count; r++) {
      const frac = r / rungsCount;
      const y = (frac - 0.5) * helixHeight;
      const t = frac * Math.PI * 8.0 + this.pulseTime * 0.8;

      const ptA = new THREE.Vector3(
        center.x + Math.cos(t) * helixRadius,
        center.y + y,
        center.z + Math.sin(t) * helixRadius
      );
      const ptB = new THREE.Vector3(
        center.x + Math.cos(t + Math.PI) * helixRadius,
        center.y + y,
        center.z + Math.sin(t + Math.PI) * helixRadius
      );

      for (let p = 0; p < particlesPerRung && rungIdx < count; p++) {
        const i3 = rungIdx * 3;
        const lerpVal = p / particlesPerRung;
        const pos = ptA.clone().lerp(ptB, lerpVal);

        buffer[i3] = pos.x + (Math.random() - 0.5) * 0.015;
        buffer[i3 + 1] = pos.y + (Math.random() - 0.5) * 0.015;
        buffer[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.015;
        rungIdx++;
      }
    }

    // Fill remainder
    for (; rungIdx < count; rungIdx++) {
      const i3 = rungIdx * 3;
      buffer[i3] = center.x + (Math.random() - 0.5) * 0.4;
      buffer[i3 + 1] = center.y + (Math.random() - 0.5) * helixHeight;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.4;
    }
  }

  // ---------------------------------------------------------------------------
  // 🌌 FORMATION 3: SPIRAL GALAXY (Multi-arm Spiral + Galactic Bulge)
  // ---------------------------------------------------------------------------
  private generateSpiralGalaxy(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const arms = 4;
    const maxRadius = 1.5;
    const corePool = Math.floor(count * 0.25);
    const armPool = count - corePool;

    // Galactic Core Bulge
    for (let i = 0; i < corePool; i++) {
      const i3 = i * 3;
      const r = Math.pow(Math.random(), 2.2) * 0.35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      buffer[i3] = center.x + r * Math.sin(phi) * Math.cos(theta);
      buffer[i3 + 1] = center.y + r * Math.sin(phi) * Math.sin(theta);
      buffer[i3 + 2] = center.z + r * Math.cos(phi) * 0.4;
    }

    // 4 Spiral Arms
    for (let i = corePool; i < count; i++) {
      const i3 = i * 3;
      const progress = (i - corePool) / armPool;
      const r = Math.pow(progress, 0.7) * maxRadius;

      const armAngle = ((i - corePool) % arms) * ((Math.PI * 2) / arms);
      const spiralAngle = armAngle + r * 3.5 + this.pulseTime * 0.35;
      const scatter = (Math.random() - 0.5) * (0.04 + r * 0.12);

      buffer[i3] = center.x + Math.cos(spiralAngle) * r + scatter;
      buffer[i3 + 1] = center.y + Math.sin(spiralAngle) * r + scatter;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * (0.05 + r * 0.1);
    }
  }

  // ---------------------------------------------------------------------------
  // 🪐 FORMATION 4: RINGED PLANET (Gas Giant + Double Saturn Ring)
  // ---------------------------------------------------------------------------
  private generateRingedPlanet(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const planetRadius = 0.52;
    const spherePool = Math.floor(count * 0.6);
    const ringPool = count - spherePool;

    // Spherical Planet Body
    const phiGold = Math.PI * (3.0 - Math.sqrt(5.0));
    for (let i = 0; i < spherePool; i++) {
      const i3 = i * 3;
      const y = 1.0 - (i / (spherePool - 1)) * 2.0;
      const radiusAtY = Math.sqrt(Math.max(0, 1.0 - y * y));
      const theta = phiGold * i + this.pulseTime * 0.25;

      const r = planetRadius + (Math.random() - 0.5) * 0.015;

      buffer[i3] = center.x + Math.cos(theta) * radiusAtY * r;
      buffer[i3 + 1] = center.y + y * r;
      buffer[i3 + 2] = center.z + Math.sin(theta) * radiusAtY * r;
    }

    // Double Ring System
    const tiltAngle = Math.PI / 5.5; // 32 deg tilt
    for (let i = spherePool; i < count; i++) {
      const i3 = i * 3;
      const progress = (i - spherePool) / ringPool;
      const isInner = progress < 0.6;

      const r = isInner
        ? 0.72 + (progress / 0.6) * 0.28
        : 1.08 + ((progress - 0.6) / 0.4) * 0.32;

      const angle = progress * Math.PI * 24.0 + this.pulseTime * 0.45;

      const rawX = Math.cos(angle) * r;
      const rawZ = Math.sin(angle) * r;
      const rawY = (Math.random() - 0.5) * 0.02;

      const rotatedY = rawY * Math.cos(tiltAngle) - rawZ * Math.sin(tiltAngle);
      const rotatedZ = rawY * Math.sin(tiltAngle) + rawZ * Math.cos(tiltAngle);

      buffer[i3] = center.x + rawX;
      buffer[i3 + 1] = center.y + rotatedY;
      buffer[i3 + 2] = center.z + rotatedZ;
    }
  }

  // ---------------------------------------------------------------------------
  // 🖐️ FORMATION: DENSE PARTICLE CLUSTER WITH INERTIAL HAND FLOW (STOP ✋🏻)
  // ---------------------------------------------------------------------------
  private generateStopDenseCluster(
    buffer: Float32Array,
    count: number,
    targetCenter: THREE.Vector3,
    handVelocity: { x: number; y: number },
    dt: number
  ): void {
    // Smoothly grow stop gesture strength
    this.stopStrength += (1.0 - this.stopStrength) * (1.0 - Math.exp(-6.0 * dt));

    // Calculate World-space hand motion velocity with inertia
    // (MediaPipe X is flipped in mirror mode, Y inverted)
    const worldVx = -handVelocity.x * 5.5;
    const worldVy = -handVelocity.y * 5.5;
    const targetVel = new THREE.Vector3(worldVx, worldVy, 0);

    // Smooth inertia and damping for hand flow
    this.stopClusterVel.lerp(targetVel, 1.0 - Math.exp(-9.0 * dt));
    this.stopClusterCenter.lerp(targetCenter, 1.0 - Math.exp(-11.0 * dt));

    // Dynamic cluster center with slight lead in velocity direction
    const clusterPos = this.stopClusterCenter.clone().addScaledVector(this.stopClusterVel, 0.05);

    // Cluster dimensions: compact, dense, orderly sphere
    const clusterRadius = 0.38 * (1.05 - 0.22 * this.stopStrength);
    const phiGold = Math.PI * (3.0 - Math.sqrt(5.0));

    const coreCount = Math.floor(count * 0.72);
    const haloCount = count - coreCount;

    // 1. Dense Core Spherical Quantum Cloud
    for (let i = 0; i < coreCount; i++) {
      const i3 = i * 3;
      const progress = i / coreCount;

      // Fibonacci sphere distribution for orderly packing
      const y = 1.0 - progress * 2.0;
      const radiusAtY = Math.sqrt(Math.max(0, 1.0 - y * y));
      const theta = phiGold * i + this.pulseTime * 0.45;

      // Concentric layered density (dense towards center)
      const layerDist = Math.pow(Math.random(), 0.65) * clusterRadius;

      // Velocity trailing flow: particles flow with natural fluid inertia following the hand
      const flowLag = (1.0 - progress) * 0.12;
      const px = clusterPos.x + Math.cos(theta) * radiusAtY * layerDist + this.stopClusterVel.x * flowLag;
      const py = clusterPos.y + y * layerDist + this.stopClusterVel.y * flowLag;
      const pz = clusterPos.z + Math.sin(theta) * radiusAtY * layerDist;

      buffer[i3]     = px;
      buffer[i3 + 1] = py;
      buffer[i3 + 2] = pz;
    }

    // 2. Surrounding Orderly Micro-Orbiting Shell
    for (let i = 0; i < haloCount; i++) {
      const i3 = (coreCount + i) * 3;
      const progress = i / haloCount;

      const angle = progress * Math.PI * 16.0 + this.pulseTime * 0.6;
      const r = clusterRadius * (1.05 + progress * 0.45);

      const px = clusterPos.x + Math.cos(angle) * r + this.stopClusterVel.x * 0.08;
      const py = clusterPos.y + Math.sin(angle) * r * 0.85 + this.stopClusterVel.y * 0.08;
      const pz = clusterPos.z + (Math.random() - 0.5) * 0.08;

      buffer[i3]     = px;
      buffer[i3 + 1] = py;
      buffer[i3 + 2] = pz;
    }
  }

  // ---------------------------------------------------------------------------
  // 🫰 FORMATION: LIVING BUTTERFLY WITH FLAPPING WINGS & TRAILING (BUTTERFLY 🫰)
  // ---------------------------------------------------------------------------
  private generateButterflyEffect(
    buffer: Float32Array,
    count: number,
    targetCenter: THREE.Vector3,
    handVelocity: { x: number; y: number },
    dt: number
  ): void {
    // 1. Smooth Hand Follow with Inertia
    const worldVx = -handVelocity.x * 6.5;
    const worldVy = -handVelocity.y * 6.5;
    const targetVel = new THREE.Vector3(worldVx, worldVy, 0);

    this.butterflyVelocity.lerp(targetVel, 1.0 - Math.exp(-9.0 * dt));
    this.butterflyCenter.lerp(targetCenter, 1.0 - Math.exp(-11.0 * dt));

    const speed = Math.hypot(this.butterflyVelocity.x, this.butterflyVelocity.y);

    // Natural banking tilt during hand motion (roll and pitch)
    const targetTiltZ = -this.butterflyVelocity.x * 0.35;
    const targetTiltX = this.butterflyVelocity.y * 0.25;
    this.butterflyTilt.lerp(new THREE.Vector3(targetTiltX, 0, targetTiltZ), 1.0 - Math.exp(-8.0 * dt));

    const cosZ = Math.cos(this.butterflyTilt.z), sinZ = Math.sin(this.butterflyTilt.z);
    const cosX = Math.cos(this.butterflyTilt.x), sinX = Math.sin(this.butterflyTilt.x);

    // Dynamic living wing flap (faster when moving)
    const flapSpeed = 4.2 + Math.min(speed * 3.5, 4.0);
    const flapPhase = Math.sin(this.pulseTime * flapSpeed);
    const flapAmount = 0.55;

    // Butterfly Scale (optimal scale relative to hand)
    const bScale = 0.85;

    // Partition particles:
    // Body & Antennae: 12%
    // Forewings (Top Wings): 44%
    // Hindwings (Bottom Wings): 32%
    // Motion Trailing Stardust: 12%
    const bodyPool = Math.floor(count * 0.12);
    const forewingPool = Math.floor(count * 0.44);
    const hindwingPool = Math.floor(count * 0.32);
    const trailPool = count - bodyPool - forewingPool - hindwingPool;

    let idx = 0;

    // Helper: 3D rotation & positioning for butterfly elements
    const placeParticle = (lx: number, ly: number, lz: number) => {
      // 3D rotation with banking tilt
      const y1 = ly * cosX - lz * sinX;
      const z1 = ly * sinX + lz * cosX;

      const x2 = lx * cosZ - y1 * sinZ;
      const y2 = lx * sinZ + y1 * cosZ;

      const i3 = idx * 3;
      buffer[i3]     = this.butterflyCenter.x + x2;
      buffer[i3 + 1] = this.butterflyCenter.y + y2;
      buffer[i3 + 2] = this.butterflyCenter.z + z1;
      idx++;
    };

    // --- 1. BUTTERFLY BODY & ANTENNAE ---
    const antennaeCount = Math.floor(bodyPool * 0.35);
    const coreBodyCount = bodyPool - antennaeCount;

    // Torso and abdomen
    for (let i = 0; i < coreBodyCount; i++) {
      const p = i / coreBodyCount;
      const by = (p - 0.5) * (0.65 * bScale);
      const bRad = (1.0 - Math.abs(p - 0.5) * 1.6) * (0.045 * bScale) + 0.01;
      const angle = Math.random() * Math.PI * 2;

      const bx = Math.cos(angle) * bRad;
      const bz = Math.sin(angle) * bRad;
      placeParticle(bx, by, bz);
    }

    // Curved Antennae
    const perAntenna = Math.floor(antennaeCount / 2);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < perAntenna; i++) {
        const p = i / perAntenna;
        const ax = side * (0.02 + Math.pow(p, 1.4) * 0.18) * bScale;
        const ay = (0.28 + p * 0.28) * bScale;
        const az = Math.sin(p * Math.PI) * 0.04 * bScale;
        placeParticle(ax, ay, az);
      }
    }

    // --- 2. FOREWINGS (Large Top Wings) ---
    for (let i = 0; i < forewingPool; i++) {
      const side = (i % 2 === 0) ? 1 : -1;
      const u = Math.random(); // radial progress
      const v = Math.random() * Math.PI * 0.5; // angle in quadrant

      // Organic curved top wing profile
      const wingRadius = Math.sin(v) * (0.75 * bScale) * (0.4 + 0.6 * Math.sqrt(u));
      const wx = side * (0.04 + Math.cos(v) * wingRadius);
      const wy = (0.05 + Math.sin(v) * wingRadius * 0.85);

      // Flapping Z displacement based on distance from spine
      const wingSpanNorm = Math.abs(wx) / (0.85 * bScale);
      const wz = flapPhase * Math.pow(wingSpanNorm, 1.1) * (flapAmount * bScale);

      // Wing contraction during flap
      const compressedX = wx * (1.0 - 0.14 * flapPhase * flapPhase);

      placeParticle(compressedX, wy, wz);
    }

    // --- 3. HINDWINGS (Rounded Bottom Wings) ---
    for (let i = 0; i < hindwingPool; i++) {
      const side = (i % 2 === 0) ? 1 : -1;
      const u = Math.random();
      const v = Math.random() * Math.PI * 0.55;

      // Rounded teardrop bottom wing profile
      const wingRadius = Math.sin(v) * (0.55 * bScale) * (0.35 + 0.65 * Math.sqrt(u));
      const wx = side * (0.035 + Math.cos(v) * wingRadius * 0.85);
      const wy = (-0.05 - Math.sin(v) * wingRadius * 0.7);

      const wingSpanNorm = Math.abs(wx) / (0.6 * bScale);
      const wz = flapPhase * Math.pow(wingSpanNorm, 1.1) * (flapAmount * 0.8 * bScale);
      const compressedX = wx * (1.0 - 0.12 * flapPhase * flapPhase);

      placeParticle(compressedX, wy, wz);
    }

    // --- 4. TRAILING STARDUST STREAM (Active with hand velocity) ---
    for (; idx < count; idx++) {
      const p = (idx - (count - trailPool)) / trailPool;

      // Particles flow backward along the negative velocity vector
      const trailSpread = (0.05 + p * 0.25) * bScale;

      const tx = (Math.random() - 0.5) * trailSpread - this.butterflyVelocity.x * (p * 0.25);
      const ty = (Math.random() - 0.5) * trailSpread - this.butterflyVelocity.y * (p * 0.25);
      const tz = (Math.random() - 0.5) * 0.12;

      placeParticle(tx, ty, tz);
    }
  }

  // ---------------------------------------------------------------------------
  // 💖 FORMATION: ENDLESS GLOWING MINI HEARTS FOUNTAIN (PEACE ✌🏻)
  // ---------------------------------------------------------------------------
  private generateEndlessMiniHearts(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const numHearts = 38; // 38 ta uzluksiz ko'payib yuruvchi mini yurakcha
    const particlesPerHeart = Math.floor(count / numHearts);

    let idx = 0;
    for (let h = 0; h < numHearts; h++) {
      // Har bir yurakchaning hayot sikli (0 dan 1 gacha uzluksiz davriy)
      const speed = 0.25 + (h % 6) * 0.05;
      const progress = (this.pulseTime * speed + h / numHearts) % 1.0;

      // O'sishi va tarqalishi
      const growth = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
      const scale = 0.035 + growth * 0.15; // Mayda yurakchalar

      // Favvora kabi markazdan yuqoriga va spiral shaklida sochilish
      const angle = (h * 2.39996) + progress * 1.6; // Golden ratio spiral
      const driftDist = Math.pow(progress, 0.7) * 1.45;
      const hx = center.x + Math.cos(angle) * driftDist;
      const hy = center.y + progress * 1.85 - 0.35; // pastdan yuqoriga ko'tariladi
      const hz = center.z + Math.sin(angle) * (driftDist * 0.6);

      // Tebranish va aylanma burchagi
      const wobble = Math.sin(this.pulseTime * 3.2 + h * 1.3) * 0.28;
      const cosW = Math.cos(wobble);
      const sinW = Math.sin(wobble);

      for (let i = 0; i < particlesPerHeart && idx < count; i++) {
        const i3 = idx * 3;
        // Parametrik yurak egri chizig'i: t ∈ [0, 2π]
        const t = (i / particlesPerHeart) * Math.PI * 2.0;

        const sinT = Math.sin(t);
        const px = 16 * sinT * sinT * sinT;
        const py = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

        // Normallashtirish
        const nx = px / 16.0;
        const ny = (py - 1.0) / 16.0;

        // Aylantirish va miqyoslash
        const rx = (nx * cosW - ny * sinW) * scale;
        const ry = (nx * sinW + ny * cosW) * scale;
        const jitter = (Math.random() - 0.5) * 0.012;

        buffer[i3]     = hx + rx + jitter;
        buffer[i3 + 1] = hy + ry + jitter;
        buffer[i3 + 2] = hz + (Math.random() - 0.5) * 0.025;
        idx++;
      }
    }

    // Qolgan zarrachalarni porlovchi yulduz changi (sparkles) qilib tarqatamiz
    for (; idx < count; idx++) {
      const i3 = idx * 3;
      const r = Math.random() * 1.3;
      const a = Math.random() * Math.PI * 2;
      buffer[i3]     = center.x + Math.cos(a) * r;
      buffer[i3 + 1] = center.y + Math.sin(a) * r + (Math.random() - 0.5) * 0.6;
      buffer[i3 + 2] = center.z + (Math.random() - 0.5) * 0.35;
    }
  }

  // ---------------------------------------------------------------------------
  // 🧊 FORMATION: ROTATING 3D WIREFRAME CYBER CUBE (FIST ✊🏻)
  // ---------------------------------------------------------------------------
  private generateRotatingCube(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const halfSide = 0.58; // Kub yarim o'lchami

    // 3D burchaklar bo'yicha rotatsiya
    const rx = this.pulseTime * 0.75;
    const ry = this.pulseTime * 1.1;
    const rz = this.pulseTime * 0.5;

    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);

    // 3D aylantirish funksiyasi
    const rotate3D = (x: number, y: number, z: number, outIdx: number) => {
      // Rotate around X
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;
      // Rotate around Y
      const x2 = x * cosY + z1 * sinY;
      const z2 = -x * sinY + z1 * cosY;
      // Rotate around Z
      const x3 = x2 * cosZ - y1 * sinZ;
      const y3 = x2 * sinZ + y1 * cosZ;

      const i3 = outIdx * 3;
      buffer[i3]     = center.x + x3;
      buffer[i3 + 1] = center.y + y3;
      buffer[i3 + 2] = center.z + z2;
    };

    // Kubning 12 ta qovurg'asi (Edges)
    const edges: [ [number, number, number], [number, number, number] ][] = [
      // Bottom 4 edges
      [ [-halfSide, -halfSide, -halfSide], [ halfSide, -halfSide, -halfSide] ],
      [ [ halfSide, -halfSide, -halfSide], [ halfSide, -halfSide,  halfSide] ],
      [ [ halfSide, -halfSide,  halfSide], [-halfSide, -halfSide,  halfSide] ],
      [ [-halfSide, -halfSide,  halfSide], [-halfSide, -halfSide, -halfSide] ],
      // Top 4 edges
      [ [-halfSide,  halfSide, -halfSide], [ halfSide,  halfSide, -halfSide] ],
      [ [ halfSide,  halfSide, -halfSide], [ halfSide,  halfSide,  halfSide] ],
      [ [ halfSide,  halfSide,  halfSide], [-halfSide,  halfSide,  halfSide] ],
      [ [-halfSide,  halfSide,  halfSide], [-halfSide,  halfSide, -halfSide] ],
      // Vertical 4 pillars
      [ [-halfSide, -halfSide, -halfSide], [-halfSide,  halfSide, -halfSide] ],
      [ [ halfSide, -halfSide, -halfSide], [ halfSide,  halfSide, -halfSide] ],
      [ [ halfSide, -halfSide,  halfSide], [ halfSide,  halfSide,  halfSide] ],
      [ [-halfSide, -halfSide,  halfSide], [-halfSide,  halfSide,  halfSide] ],
    ];

    // Zarrachalarning 55% qovurg'alarga
    const edgePool = Math.floor(count * 0.55);
    const perEdge = Math.floor(edgePool / edges.length);
    let idx = 0;

    for (const [pA, pB] of edges) {
      for (let i = 0; i < perEdge; i++) {
        const t = i / perEdge;
        const x = pA[0] + (pB[0] - pA[0]) * t + (Math.random() - 0.5) * 0.012;
        const y = pA[1] + (pB[1] - pA[1]) * t + (Math.random() - 0.5) * 0.012;
        const z = pA[2] + (pB[2] - pA[2]) * t + (Math.random() - 0.5) * 0.012;
        rotate3D(x, y, z, idx++);
      }
    }

    // 6 ta yog'iga (Faces) 35% zarracha
    const facePool = Math.floor(count * 0.35);
    const perFace = Math.floor(facePool / 6);
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < perFace; i++) {
        const u = (Math.random() - 0.5) * 2.0 * halfSide;
        const v = (Math.random() - 0.5) * 2.0 * halfSide;
        let x = 0, y = 0, z = 0;
        if (f === 0) { x = halfSide; y = u; z = v; }
        else if (f === 1) { x = -halfSide; y = u; z = v; }
        else if (f === 2) { y = halfSide; x = u; z = v; }
        else if (f === 3) { y = -halfSide; x = u; z = v; }
        else if (f === 4) { z = halfSide; x = u; y = v; }
        else { z = -halfSide; x = u; y = v; }

        rotate3D(x, y, z, idx++);
      }
    }

    // Markazdagi aylanuvchi yadro (Core)
    for (; idx < count; idx++) {
      const cr = Math.pow(Math.random(), 2.0) * (halfSide * 0.45);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const cx = cr * Math.sin(phi) * Math.cos(theta);
      const cy = cr * Math.sin(phi) * Math.sin(theta);
      const cz = cr * Math.cos(phi);
      rotate3D(cx, cy, cz, idx);
    }
  }

  // ---------------------------------------------------------------------------
  // 🕳️ FORMATION 5: BLACK HOLE & ACCRETION DISK + RELATIVISTIC JETS
  // ---------------------------------------------------------------------------
  private generateBlackHole(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const diskPool = Math.floor(count * 0.75);
    const jetPool = count - diskPool;

    // Swirling Accretion Disk around Black Hole Event Horizon
    for (let i = 0; i < diskPool; i++) {
      const i3 = i * 3;
      const progress = i / diskPool;
      const r = 0.25 + Math.pow(progress, 0.6) * 1.25;
      const angle = progress * Math.PI * 18.0 + (1.5 / r) * this.pulseTime * 0.5;

      const noise = (Math.random() - 0.5) * (0.02 + r * 0.05);

      buffer[i3] = center.x + Math.cos(angle) * r + noise;
      buffer[i3 + 1] = center.y + (Math.random() - 0.5) * 0.04;
      buffer[i3 + 2] = center.z + Math.sin(angle) * r + noise;
    }

    // Vertical Relativistic Polar Jets
    const halfJet = Math.floor(jetPool / 2);
    for (let i = 0; i < jetPool; i++) {
      const i3 = (diskPool + i) * 3;
      const dir = i < halfJet ? 1 : -1;
      const height = Math.pow(Math.random(), 0.7) * 1.5;
      const radiusAtH = (height / 1.5) * 0.18;
      const angle = Math.random() * Math.PI * 2;

      buffer[i3] = center.x + Math.cos(angle) * radiusAtH;
      buffer[i3 + 1] = center.y + height * dir;
      buffer[i3 + 2] = center.z + Math.sin(angle) * radiusAtH;
    }
  }

  // ---------------------------------------------------------------------------
  // ☀️ FORMATION 6: SOLAR SYSTEM (Central Sun + 3 Orbiting Planet Rings)
  // ---------------------------------------------------------------------------
  private generateSolarSystem(
    buffer: Float32Array,
    count: number,
    p1: THREE.Vector3,
    p2: THREE.Vector3 | null
  ): void {
    const center = p2 ? p1.clone().add(p2).multiplyScalar(0.5) : p1;

    const sunPool = Math.floor(count * 0.35);
    const orbitPool = count - sunPool;

    // Central Glowing Sun
    for (let i = 0; i < sunPool; i++) {
      const i3 = i * 3;
      const r = Math.pow(Math.random(), 1.5) * 0.38;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      buffer[i3] = center.x + r * Math.sin(phi) * Math.cos(theta);
      buffer[i3 + 1] = center.y + r * Math.sin(phi) * Math.sin(theta);
      buffer[i3 + 2] = center.z + r * Math.cos(phi);
    }

    // 3 Planetary Orbits & Planets
    const orbitRadii = [0.65, 1.0, 1.4];
    const perOrbit = Math.floor(orbitPool / 3);

    for (let o = 0; o < 3; o++) {
      const rOrbit = orbitRadii[o];
      const orbitSpeed = (1.5 / rOrbit) * 0.4;
      const planetAngle = this.pulseTime * orbitSpeed;

      for (let i = 0; i < perOrbit; i++) {
        const idx = sunPool + o * perOrbit + i;
        const i3 = idx * 3;

        const tFrac = i / perOrbit;
        if (tFrac < 0.8) {
          const angle = (tFrac / 0.8) * Math.PI * 2;
          buffer[i3] = center.x + Math.cos(angle) * rOrbit + (Math.random() - 0.5) * 0.02;
          buffer[i3 + 1] = center.y + (Math.random() - 0.5) * 0.03;
          buffer[i3 + 2] = center.z + Math.sin(angle) * rOrbit + (Math.random() - 0.5) * 0.02;
        } else {
          const planetCenter = new THREE.Vector3(
            center.x + Math.cos(planetAngle) * rOrbit,
            center.y,
            center.z + Math.sin(planetAngle) * rOrbit
          );
          const pr = Math.random() * 0.1;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);

          buffer[i3] = planetCenter.x + pr * Math.sin(phi) * Math.cos(theta);
          buffer[i3 + 1] = planetCenter.y + pr * Math.sin(phi) * Math.sin(theta);
          buffer[i3 + 2] = planetCenter.z + pr * Math.cos(phi);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 🌍 FORMATION 7: ROTATING EARTH PLANET (ONE_FINGER ☝🏻)
  // ---------------------------------------------------------------------------
  private generateRotatingEarth(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const earthRadius = 0.70;
    const rot = this.pulseTime * 0.5; // Rotation around Y axis

    // Particle budget
    const oceanPool     = Math.floor(count * 0.38); // Blue oceans
    const continentPool = Math.floor(count * 0.28); // Green/brown landmasses
    const cloudsPool    = Math.floor(count * 0.12); // White clouds
    const icePool       = Math.floor(count * 0.06); // Polar ice caps
    const atmosPool     = Math.floor(count * 0.08); // Atmospheric glow halo
    const moonPool      = count - oceanPool - continentPool - cloudsPool - icePool - atmosPool;

    let idx = 0;

    // Helper: place a particle on the sphere surface at spherical coords (theta, phi)
    const place = (theta: number, phi: number, r: number) => {
      const sinPhi = Math.sin(phi);
      const i3 = idx * 3;
      buffer[i3]     = center.x + r * sinPhi * Math.cos(theta);
      buffer[i3 + 1] = center.y + r * Math.cos(phi);
      buffer[i3 + 2] = center.z + r * sinPhi * Math.sin(theta);
      idx++;
    };

    // ─── OCEANS (full sphere coverage, blue) ──────────────────────────────────
    for (let i = 0; i < oceanPool; i++) {
      const theta = Math.random() * Math.PI * 2 + rot;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = earthRadius + (Math.random() - 0.5) * 0.01;
      place(theta, phi, r);
    }

    // ─── CONTINENTS (6 blobs = Africa, Eurasia, Americas, etc.) ──────────────
    // Each continent defined by (centerPhi, centerTheta, spread)
    const continents = [
      { phi: 1.3,  theta: 0.3,  spread: 0.45 }, // Africa
      { phi: 0.9,  theta: 1.2,  spread: 0.55 }, // Eurasia
      { phi: 1.2,  theta: -1.6, spread: 0.42 }, // North America
      { phi: 1.7,  theta: -1.2, spread: 0.38 }, // South America
      { phi: 1.5,  theta: 2.4,  spread: 0.35 }, // Australia
      { phi: 0.6,  theta: 0.8,  spread: 0.30 }, // Europe / Greenland
    ];
    const perContinent = Math.floor(continentPool / continents.length);
    for (const cont of continents) {
      for (let i = 0; i < perContinent; i++) {
        const dPhi   = (Math.random() - 0.5) * cont.spread;
        const dTheta = (Math.random() - 0.5) * cont.spread;
        const phi    = Math.max(0.05, Math.min(Math.PI - 0.05, cont.phi + dPhi));
        const theta  = cont.theta + dTheta + rot;
        const r      = earthRadius + 0.005 + (Math.random() - 0.5) * 0.006;
        place(theta, phi, r);
      }
    }

    // ─── CLOUDS (wispy layer slightly above surface) ──────────────────────────
    for (let i = 0; i < cloudsPool; i++) {
      const theta = Math.random() * Math.PI * 2 + rot * 1.15; // clouds drift faster
      const phi   = Math.acos(2 * Math.random() - 1);
      // Cluster into cloud bands (tropical & mid-lat)
      const band  = Math.random() < 0.6 ? 1.4 + (Math.random() - 0.5) * 0.8
                                         : 0.6 + (Math.random() - 0.5) * 0.5;
      const r = earthRadius + 0.025 + Math.random() * 0.02;
      place(theta, band, r);
    }

    // ─── POLAR ICE CAPS (white caps at north and south poles) ────────────────
    const perPole = Math.floor(icePool / 2);
    for (let i = 0; i < perPole; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * 0.38; // North pole
      place(theta, phi, earthRadius + 0.008);
    }
    for (let i = 0; i < perPole; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.PI - Math.random() * 0.38; // South pole
      place(theta, phi, earthRadius + 0.008);
    }

    // ─── ATMOSPHERIC GLOW (thin translucent halo around planet) ─────────────
    for (let i = 0; i < atmosPool; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = earthRadius + 0.055 + Math.random() * 0.065;
      place(theta, phi, r);
    }

    // ─── MOON (orbiting in a tilted plane, grey sphere) ─────────────────────
    const moonOrbitR = earthRadius * 2.5;
    const moonAngle  = this.pulseTime * 0.38;
    const moonTilt   = 0.18; // slight inclination
    const moonCx     = center.x + Math.cos(moonAngle) * moonOrbitR;
    const moonCy     = center.y + Math.sin(moonAngle) * moonOrbitR * Math.sin(moonTilt);
    const moonCz     = center.z + Math.sin(moonAngle) * moonOrbitR;

    for (let i = 0; i < moonPool; i++) {
      const i3 = idx * 3;
      const r  = Math.pow(Math.random(), 0.6) * 0.12;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      buffer[i3]     = moonCx + r * Math.sin(phi) * Math.cos(theta);
      buffer[i3 + 1] = moonCy + r * Math.cos(phi);
      buffer[i3 + 2] = moonCz + r * Math.sin(phi) * Math.sin(theta);
      idx++;
    }
  }

  // ---------------------------------------------------------------------------
  // 🌠 FORMATION 8: PULSAR STAR & POLAR BEAMS (ROCK 🤘🏻)
  // ---------------------------------------------------------------------------
  private generatePulsarStar(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    const corePool = Math.floor(count * 0.4);
    const beamPool = count - corePool;

    for (let i = 0; i < corePool; i++) {
      const i3 = i * 3;
      const r = Math.pow(Math.random(), 3.0) * 0.25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      buffer[i3] = center.x + r * Math.sin(phi) * Math.cos(theta);
      buffer[i3 + 1] = center.y + r * Math.sin(phi) * Math.sin(theta);
      buffer[i3 + 2] = center.z + r * Math.cos(phi);
    }

    const rotSpeed = this.pulseTime * 2.0;
    for (let i = corePool; i < count; i++) {
      const i3 = i * 3;
      const progress = (i - corePool) / beamPool;
      const h = (progress - 0.5) * 3.0;
      const r = Math.abs(h) * 0.25 + 0.05;
      const angle = h * 6.0 + rotSpeed;

      buffer[i3] = center.x + Math.cos(angle) * r;
      buffer[i3 + 1] = center.y + h;
      buffer[i3 + 2] = center.z + Math.sin(angle) * r;
    }
  }

  // ---------------------------------------------------------------------------
  // ☁️ FORMATION 8: COSMIC NEBULA CLOUD
  // ---------------------------------------------------------------------------
  private generateCosmicNebula(buffer: Float32Array, count: number, center: THREE.Vector3): void {
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const t = (i / count) * Math.PI * 4.0;
      const side = i % 2 === 0 ? 1 : -1;

      const r = (0.2 + Math.sin(t * 2.0 + this.pulseTime * 0.5) * 0.3) * side;
      const x = Math.cos(t) * r * 1.5;
      const y = Math.sin(t) * r * 1.2;
      const z = (Math.random() - 0.5) * 0.4;

      buffer[i3] = center.x + x + (Math.random() - 0.5) * 0.08;
      buffer[i3 + 1] = center.y + y + (Math.random() - 0.5) * 0.08;
      buffer[i3 + 2] = center.z + z;
    }
  }

  // ---------------------------------------------------------------------------
  // 🌌 FULL SCREEN IDLE FLOW (When hands are absent)
  // Dynamic cosmic waves and flowing fluid nebula across the entire viewport
  // ---------------------------------------------------------------------------
  private generateFullScreenIdleFlow(buffer: Float32Array, count: number): void {
    const t = this.pulseTime * 0.35;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Deterministic golden-ratio distribution to evenly distribute across the screen
      const frac1 = ((i * 0.6180339887) % 1.0) - 0.5;
      const frac2 = ((i * 0.4142135623) % 1.0) - 0.5;
      const frac3 = ((i * 0.7320508075) % 1.0) - 0.5;

      // Full screen viewport coordinates (width ~7.4, height ~4.6, depth ~2.2)
      const baseX = frac1 * 7.4;
      const baseY = frac2 * 4.6;
      const baseZ = frac3 * 2.2;

      // Multi-frequency 3D sinusoidal fluid waves
      const waveY = Math.sin(baseX * 1.1 + t * 1.4) * Math.cos(baseZ * 1.3 + t * 0.9) * 0.45;
      const waveX = Math.cos(baseY * 1.2 + t * 1.1) * Math.sin(baseZ * 0.9 + t * 0.8) * 0.35;
      const waveZ = Math.sin(baseX * 0.8 + baseY * 1.0 + t * 0.7) * 0.4;

      // Gentle orbital galactic flow around screen center
      const dist = Math.sqrt(baseX * baseX + baseY * baseY);
      const angle = t * 0.18 + dist * 0.12;
      const cosA = Math.cos(angle * 0.15);
      const sinA = Math.sin(angle * 0.15);

      const rotX = baseX * cosA - baseY * sinA;
      const rotY = baseX * sinA + baseY * cosA;

      buffer[i3]     = rotX + waveX;
      buffer[i3 + 1] = rotY + waveY;
      buffer[i3 + 2] = baseZ + waveZ;
    }
  }
}
