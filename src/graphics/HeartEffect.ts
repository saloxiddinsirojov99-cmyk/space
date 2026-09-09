import * as THREE from 'three';

export interface FloatingHeart {
  center: THREE.Vector3;
  size: number;
  speed: THREE.Vector3;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  scale: number;
  maxScale: number;
  life: number;
  maxLife: number;
}

export class HeartEffect {
  private floatingHearts: FloatingHeart[] = [];

  public update(deltaTime: number, handPos?: THREE.Vector3): FloatingHeart[] {
    // Spawn new hearts periodically if hand is active
    if (handPos && this.floatingHearts.length < 15 && Math.random() < 0.25) {
      this.floatingHearts.push({
        center: new THREE.Vector3(
          handPos.x + (Math.random() - 0.5) * 0.4,
          handPos.y + (Math.random() - 0.5) * 0.3,
          handPos.z + (Math.random() - 0.5) * 0.2
        ),
        size: 0.15 + Math.random() * 0.35,
        speed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.08,
          0.12 + Math.random() * 0.18, // float up
          (Math.random() - 0.5) * 0.05
        ),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.5,
        opacity: 1.0,
        scale: 0.1,
        maxScale: 0.8 + Math.random() * 0.8,
        life: 0,
        maxLife: 2.0 + Math.random() * 2.5
      });
    }

    // Update existing floating hearts
    for (let i = this.floatingHearts.length - 1; i >= 0; i--) {
      const h = this.floatingHearts[i];
      h.life += deltaTime;
      h.center.addScaledVector(h.speed, deltaTime);
      h.rotation += h.rotationSpeed * deltaTime;

      const progress = h.life / h.maxLife;
      if (progress < 0.2) {
        h.scale = (progress / 0.2) * h.maxScale;
        h.opacity = progress / 0.2;
      } else if (progress > 0.7) {
        h.opacity = (1.0 - progress) / 0.3;
      } else {
        h.opacity = 1.0;
      }

      if (h.life >= h.maxLife) {
        this.floatingHearts.splice(i, 1);
      }
    }

    return this.floatingHearts;
  }

  public static getHeartPoint(t: number, scale: number = 0.02): { x: number; y: number } {
    // Standard parametric heart curve
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return {
      x: x * scale,
      y: y * scale
    };
  }
}
