import * as THREE from 'three';
import type { Pose } from './anim.js';
import { IDLE } from './anim.js';
import { boilIndex, type ArenaRenderer, type FighterView, type ReplayState } from './view.js';

/** Arena pixels per world unit. Arena is 480 px wide -> 6 units. */
const PPU = 80;
const CUTOUT_DEPTH = 0.05;

interface Cutout {
  group: THREE.Group;   // handles position and facing
  mesh: THREE.Mesh;     // handles pose (offset, scale, roll)
  shadow: THREE.Mesh;
  mats: THREE.MeshLambertMaterial[]; // front/back materials, one per boil variant
  side: THREE.MeshLambertMaterial;
  view: FighterView | null;
  w: number;
  h: number;
}

/**
 * Paper-cutout 3D arena: each doodle is a thin textured slab standing on a
 * ground plane, viewed by a perspective camera. Poses from anim.ts drive
 * lunge, squash and roll; the texture cycles through boil variants.
 */
export class Arena3D implements ArenaRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private a: Cutout;
  private b: Cutout;
  private popupSprites: THREE.Sprite[] = [];
  private baseCam = new THREE.Vector3(0, 1.9, 7.6);

  static supported(canvas: HTMLCanvasElement): boolean {
    try {
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      return !!gl;
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 100);
    this.camera.position.copy(this.baseCam);
    this.camera.lookAt(0, 0.8, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b3, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(2, 5, 4);
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: 0xf1ede2 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    // A faint horizon line so depth reads even on a plain background.
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.02), new THREE.MeshBasicMaterial({ color: 0xcbc3b3 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.001, -2.5);
    this.scene.add(line);

    this.a = this.makeCutout(1);
    this.b = this.makeCutout(-1);
  }

  private makeCutout(facing: 1 | -1): Cutout {
    const group = new THREE.Group();
    group.rotation.y = facing === 1 ? 0 : Math.PI;
    // Paper edge: tinted with the fighter's element colour, mostly transparent so it reads as a thin rim, not a frame.
    const side = new THREE.MeshLambertMaterial({ color: 0x222222, transparent: true, opacity: 0.25 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, CUTOUT_DEPTH), side);
    mesh.visible = false;
    group.add(mesh);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; shadow.visible = false;
    group.add(shadow);
    this.scene.add(group);
    return { group, mesh, shadow, mats: [], side, view: null, w: 1, h: 1 };
  }

  private assign(c: Cutout, view: FighterView): void {
    for (const m of c.mats) { m.map?.dispose(); m.dispose(); }
    c.mats = view.sprites.map((canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      return new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    });
    c.side.color.set(view.color);
    const sprite = view.sprites[0];
    const maxH = 140, maxW = 200;
    const scale = Math.min(1, maxH / sprite.height, maxW / sprite.width);
    c.w = (sprite.width * scale) / PPU;
    c.h = (sprite.height * scale) / PPU;
    c.mesh.geometry.dispose();
    c.mesh.geometry = new THREE.BoxGeometry(c.w, c.h, CUTOUT_DEPTH);
    c.mesh.visible = true;
    c.shadow.visible = true;
    c.shadow.scale.set(c.w * 0.9, c.w * 0.35, 1);
    c.view = view;
    this.applyPose(c, IDLE, 0, false);
  }

  private applyPose(c: Cutout, pose: Pose, t: number, flash: boolean): void {
    if (!c.view) return;
    const variant = c.mats[boilIndex(t, c.mats.length)];
    // Box material order: +x, -x, +y, -y, +z (front), -z (back).
    c.mesh.material = [c.side, c.side, c.side, c.side, variant, variant];
    variant.emissive.set(flash ? 0xffffff : 0x000000);
    variant.emissiveIntensity = flash ? 0.9 : 0;
    c.mesh.scale.set(pose.sx, pose.sy, 1);
    // Keep the feet on the ground: box is centred, so lift by half the scaled height.
    c.mesh.position.set(pose.dx / PPU, (c.h * pose.sy) / 2 - pose.dy / PPU, 0);
    c.mesh.rotation.z = -pose.rot;
    const lift = Math.max(0, -pose.dy) / PPU;
    const s = Math.max(0.4, 1 - lift * 0.6);
    c.shadow.scale.set(c.w * 0.9 * s, c.w * 0.35 * s, 1);
    c.shadow.position.x = pose.dx / PPU;
  }

  setFighters(a: FighterView, b: FighterView): void {
    this.assign(this.a, a);
    this.assign(this.b, b);
  }

  preview(b: FighterView, xB: number): void {
    this.a.mesh.visible = false; this.a.shadow.visible = false;
    this.assign(this.b, b);
    this.b.group.position.x = xB / PPU - 3;
    this.clearPopups();
    this.camera.position.copy(this.baseCam);
    this.renderer.render(this.scene, this.camera);
  }

  draw(s: ReplayState): void {
    this.a.group.position.x = s.xA / PPU - 3;
    this.b.group.position.x = s.xB / PPU - 3;
    this.applyPose(this.a, s.poseA, s.t, s.flashA);
    this.applyPose(this.b, s.poseB, s.t, s.flashB);
    // Camera shake and a slow drift so the scene feels filmed, not static.
    const sh = s.shake / PPU;
    this.camera.position.set(
      this.baseCam.x + Math.sin(s.t * 0.7) * 0.15 + (Math.random() - 0.5) * sh,
      this.baseCam.y + (Math.random() - 0.5) * sh,
      this.baseCam.z,
    );
    this.camera.lookAt(0, 0.8, 0);
    this.syncPopups(s);
    this.renderer.render(this.scene, this.camera);
  }

  private clearPopups(): void {
    for (const sp of this.popupSprites) { this.scene.remove(sp); (sp.material as THREE.SpriteMaterial).map?.dispose(); sp.material.dispose(); }
    this.popupSprites = [];
  }

  private syncPopups(s: ReplayState): void {
    this.clearPopups();
    for (const p of s.popups) {
      if (p.life <= 0) continue;
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.strokeText(p.text, 128, 32);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 128, 32);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: Math.min(1, p.life * 1.5), depthTest: false }));
      sp.scale.set(1.6, 0.4, 1);
      sp.position.set(p.x / PPU - 3, 1.9 + (1 - p.life) * 0.8, 0.6);
      this.scene.add(sp);
      this.popupSprites.push(sp);
    }
  }
}
