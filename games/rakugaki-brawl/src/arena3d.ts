import * as THREE from 'three';
import type { Phase, Pose } from './anim.js';
import { IDLE } from './anim.js';
import type { ArenaRenderer, FighterView, ReplayState } from './view.js';

const IDLE_PHASE: Phase = { kind: 'idle', u: 0, big: false };

/** Arena pixels per world unit. Arena is 480 px wide -> 6 units. */
const PPU = 80;
const CUTOUT_DEPTH = 0.05;

interface Cutout {
  group: THREE.Group;   // handles position and facing
  mesh: THREE.Mesh;     // handles pose (offset, scale, roll)
  shadow: THREE.Mesh;
  face: THREE.MeshLambertMaterial | null; // front/back material, texture updated every frame
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

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ color: 0xf1ede2 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    // A faint horizon line so depth reads even on a plain background.
    const line = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.04), new THREE.MeshBasicMaterial({ color: 0xcbc3b3 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.001, -3.5);
    this.scene.add(line);

    this.a = this.makeCutout(1);
    this.b = this.makeCutout(-1);
  }

  private makeCutout(facing: 1 | -1): Cutout {
    const group = new THREE.Group();
    // Mirror the enemy with a negative x scale so its front face still faces the
    // camera (three.js flips the winding for negative determinants).
    group.scale.x = facing;
    // Paper edge: tinted with the fighter's element colour, mostly transparent so it reads as a thin rim, not a frame.
    // The box's side faces are the sprite's bounding box, not the doodle's outline, so at
    // high resolution they read as stray lines. Keep them fully transparent.
    const side = new THREE.MeshLambertMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, CUTOUT_DEPTH), side);
    mesh.visible = false;
    group.add(mesh);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; shadow.visible = false;
    group.add(shadow);
    this.scene.add(group);
    return { group, mesh, shadow, face: null, side, view: null, w: 1, h: 1 };
  }

  private assign(c: Cutout, view: FighterView): void {
    if (c.face) { c.face.map?.dispose(); c.face.dispose(); }
    const first = view.frame(0, IDLE_PHASE);
    const copy = document.createElement('canvas');
    copy.width = first.width; copy.height = first.height;
    copy.getContext('2d')!.drawImage(first, 0, 0);
    const tex = new THREE.CanvasTexture(copy);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    // FrontSide only: with DoubleSide the mirrored back face showed through the
    // transparent front face as a second, flipped copy of any asymmetric doodle.
    c.face = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.FrontSide });
    c.side.color.set(view.color);
    const maxH = 180, maxW = 260;
    const scale = Math.min(1, maxH / view.height, maxW / view.width);
    c.w = (view.width * scale) / PPU;
    c.h = (view.height * scale) / PPU;
    c.mesh.geometry.dispose();
    c.mesh.geometry = new THREE.BoxGeometry(c.w, c.h, CUTOUT_DEPTH);
    c.mesh.visible = true;
    c.shadow.visible = true;
    c.shadow.scale.set(c.w * 0.9, c.w * 0.35, 1);
    c.view = view;
    this.applyPose(c, IDLE, IDLE_PHASE, 0, false);
  }

  private applyPose(c: Cutout, pose: Pose, phase: Phase, t: number, flash: boolean): void {
    if (!c.view || !c.face) return;
    // Re-rasterise the doodle with limbs posed for this phase, then upload a
    // copy: uploading the 2D canvas that is being redrawn every frame produced
    // stale/duplicated texels on some backends.
    const src = c.view.frame(t, phase);
    const tex = c.face.map!;
    const dst = tex.image as HTMLCanvasElement;
    if (dst !== src) {
      const g = dst.getContext('2d')!;
      g.clearRect(0, 0, dst.width, dst.height);
      g.drawImage(src, 0, 0);
    }
    tex.needsUpdate = true;
    // Box material order: +x, -x, +y, -y, +z (front), -z (back).
    c.mesh.material = [c.side, c.side, c.side, c.side, c.face, c.face];
    c.face.emissive.set(flash ? 0xffffff : 0x000000);
    c.face.emissiveIntensity = flash ? 0.9 : 0;
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

  resize(): void {
    const c = this.renderer.domElement;
    this.renderer.setSize(c.width, c.height, false);
    this.camera.aspect = c.width / c.height;
    // Wide strips: pull the camera back a little so both fighters stay in frame.
    this.camera.fov = this.camera.aspect > 2 ? 24 : 30;
    this.camera.updateProjectionMatrix();
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
    this.applyPose(this.a, s.poseA, s.phaseA, s.t, s.flashA);
    this.applyPose(this.b, s.poseB, s.phaseB, s.t, s.flashB);
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
    s.popups.forEach((p, i) => {
      if (p.life <= 0) return;
      const c = document.createElement('canvas');
      c.width = 256; c.height = 96;
      const ctx = c.getContext('2d')!;
      const big = p.text.startsWith('!!') || p.text.length > 3;
      ctx.font = `900 ${big ? 56 : 44}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.strokeText(p.text, 128, 48);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 128, 48);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: Math.min(1, p.life * 2), depthTest: false }));
      // Pop in, then drift up and fan out sideways so consecutive hits don't stack into one blob.
      const pop = 1 + Math.max(0, p.life - 0.8) * 2;
      sp.scale.set(2.0 * pop, 0.75 * pop, 1);
      const fan = ((i * 7) % 5 - 2) * 0.35;
      sp.position.set(p.x / PPU - 3 + fan, 1.9 + (1 - p.life) * 1.2, 0.6);
      this.scene.add(sp);
      this.popupSprites.push(sp);
    });
  }
}
