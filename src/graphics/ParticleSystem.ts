import * as THREE from 'three';

export class ParticleSystem {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private pointsMesh: THREE.Points;
  private geometry: THREE.BufferGeometry;

  private maxCount: number = 90000;
  private activeCount: number = 75000;

  // Float arrays for GPU buffers
  private positions: Float32Array;
  private targets: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;

  private texture: THREE.Texture;

  constructor(canvasElementId: string) {
    const canvas = document.getElementById(canvasElementId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element ${canvasElementId} not found.`);
    }
    this.container = canvas.parentElement || document.body;

    // Three.js Scene Setup
    this.scene = new THREE.Scene();
    // Soft subtle ambient fog that preserves true particle colors at all depths
    this.scene.fog = new THREE.FogExp2(0x06050c, 0.025);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 3.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Generate glowing radial particle texture
    this.texture = this.createGlowingTexture();

    // Allocate particle buffers
    this.positions = new Float32Array(this.maxCount * 3);
    this.targets = new Float32Array(this.maxCount * 3);
    this.velocities = new Float32Array(this.maxCount * 3);
    this.colors = new Float32Array(this.maxCount * 3);
    this.sizes = new Float32Array(this.maxCount);

    this.initParticles();

    // Buffer Geometry & Shader Material for crisp, distinct, richly colored particles
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.texture }
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        varying float vDist;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = -mvPosition.z;
          vDist = dist;

          // Stable point size at all distances so distant particles remain distinct and visible
          float pSize = size * (260.0 / max(dist, 0.7));
          gl_PointSize = clamp(pSize, 2.5, 22.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vDist;
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          if (texColor.a < 0.04) discard;

          // Dynamically enrich color depth for distant and sparse particles
          // Maintains existing palette while preventing fading or washing out
          float depthFactor = clamp((vDist - 1.2) / 3.8, 0.0, 1.0);
          vec3 enriched = vColor * (1.12 + depthFactor * 0.38);

          // Prevent overexposure or whitening out
          enriched = min(enriched, vec3(0.96, 0.94, 1.0));

          float alpha = texColor.a * (0.92 + depthFactor * 0.08);
          gl_FragColor = vec4(enriched, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });

    this.pointsMesh = new THREE.Points(this.geometry, material);
    this.scene.add(this.pointsMesh);
    this.geometry.setDrawRange(0, this.activeCount);

    // Handle Window Resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private createGlowingTexture(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    // Crisp defined dot core so each particle is distinctly visible
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.35, 'rgba(240, 210, 255, 0.95)');
    gradient.addColorStop(0.65, 'rgba(180, 100, 250, 0.35)');
    gradient.addColorStop(0.85, 'rgba(120, 40, 210, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private initParticles(): void {
    const palette = [
      new THREE.Color(0xa855f7), // Bright purple
      new THREE.Color(0xc084fc), // Violet
      new THREE.Color(0xe879f9), // Magenta pink
      new THREE.Color(0x818cf8), // Indigo
      new THREE.Color(0xd8b4fe), // Lilac
      new THREE.Color(0x38bdf8), // Cyan star glow
      new THREE.Color(0xf472b6)  // Cosmic rose
    ];

    for (let i = 0; i < this.maxCount; i++) {
      const i3 = i * 3;
      const r = 1.5 * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      this.positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.positions[i3 + 2] = r * Math.cos(phi);

      this.targets[i3] = this.positions[i3];
      this.targets[i3 + 1] = this.positions[i3 + 1];
      this.targets[i3 + 2] = this.positions[i3 + 2];

      this.velocities[i3] = 0;
      this.velocities[i3 + 1] = 0;
      this.velocities[i3 + 2] = 0;

      const col = palette[Math.floor(Math.random() * palette.length)];
      this.colors[i3] = col.r;
      this.colors[i3 + 1] = col.g;
      this.colors[i3 + 2] = col.b;

      // Elegant fine small dot size (like original, but with high count)
      this.sizes[i] = 0.02 + Math.random() * 0.035;
    }
  }

  public update(deltaTime: number): void {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const clampedDt = Math.min(deltaTime, 0.05);

    // Frame-rate independent spring-damper physics for ultra-smooth movement
    const stiffness = 9.0 * clampedDt;
    const damping = Math.pow(0.86, clampedDt * 60.0);

    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;

      // Spring force towards target
      const fx = (this.targets[i3] - this.positions[i3]) * stiffness;
      const fy = (this.targets[i3 + 1] - this.positions[i3 + 1]) * stiffness;
      const fz = (this.targets[i3 + 2] - this.positions[i3 + 2]) * stiffness;

      // Update velocities
      this.velocities[i3] = (this.velocities[i3] + fx) * damping;
      this.velocities[i3 + 1] = (this.velocities[i3 + 1] + fy) * damping;
      this.velocities[i3 + 2] = (this.velocities[i3 + 2] + fz) * damping;

      // Update positions
      this.positions[i3] += this.velocities[i3];
      this.positions[i3 + 1] += this.velocities[i3 + 1];
      this.positions[i3 + 2] += this.velocities[i3 + 2];
    }

    posAttr.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  public setTargets(newTargets: Float32Array): void {
    const count = Math.min(newTargets.length / 3, this.activeCount);
    for (let i = 0; i < count * 3; i++) {
      this.targets[i] = newTargets[i];
    }
  }

  public getTargetBuffer(): Float32Array {
    return this.targets;
  }

  public getActiveParticleCount(): number {
    return this.activeCount;
  }

  public setActiveParticleCount(count: number): void {
    this.activeCount = Math.max(2000, Math.min(count, this.maxCount));
    this.geometry.setDrawRange(0, this.activeCount);
  }

  public screenToWorld(xNorm: number, yNorm: number, zDepth: number = 0): THREE.Vector3 {
    // MediaPipe landmark coordinates are [0..1], mirrored for webcam
    const ndcX = (1.0 - xNorm) * 2 - 1; // Invert X for mirror feel
    const ndcY = -(yNorm * 2 - 1);       // Invert Y for WebGL screen coords

    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(this.camera);

    const dir = vec.sub(this.camera.position).normalize();
    const distance = (zDepth - this.camera.position.z) / dir.z;

    return this.camera.position.clone().add(dir.multiplyScalar(distance));
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.geometry.dispose();
    (this.pointsMesh.material as THREE.Material).dispose();
    this.texture.dispose();
    this.renderer.dispose();
  }
}
