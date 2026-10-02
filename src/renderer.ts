import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

// Renders a GLB avatar's face in close-up and animates its mouth, blinks and brows. The avatar needs Oculus viseme
// morph targets (viseme_aa, viseme_PP, …); ARKit jawOpen / mouthFunnel / mouthPucker / mouthRollLower / mouthClose /
// mouthPressLeft|Right, eyeBlinkLeft|Right and browInnerUp are used when present.

/**
 * Avatar morph target name(s) to use for each standard name the SDK drives (viseme_aa … viseme_U, eyeBlinkLeft,
 * eyeBlinkRight, browInnerUp, jawOpen, mouthFunnel, mouthPucker, mouthRollLower, mouthClose, mouthPressLeft,
 * mouthPressRight). Unlisted names are used as they are; [] turns one off.
 */
export type MorphTargetMap = Record<string, string | string[]>;

// Avatars whose morphs are named h_expressions.<shape>_h (detected automatically).
const h = (...shapes: string[]) => shapes.map((shape) => `h_expressions.${shape}_h`);
const H_EXPRESSIONS: MorphTargetMap = {
  viseme_sil: [], viseme_PP: h("MPB_Up", "MPB_Down"), viseme_FF: h("FV"), viseme_TH: h("TD_I"), viseme_DD: h("TD_I"),
  viseme_kk: h("KG"), viseme_CH: h("SH_CH"), viseme_SS: h("S"), viseme_nn: h("TD_I"), viseme_RR: h("UH_OO"),
  viseme_aa: h("AE_AA"), viseme_E: h("Ax_E"), viseme_I: h("TD_I"), viseme_O: h("AO_a"), viseme_U: h("UW_U"),
  eyeBlinkLeft: h("LeyeClose"), eyeBlinkRight: h("ReyeClose"), browInnerUp: h("LbrowUp", "RbrowUp"),
  jawOpen: h("MouthOpen"), mouthPucker: h("Kiss"),
  mouthFunnel: [], mouthRollLower: [], mouthClose: [], mouthPressLeft: [], mouthPressRight: [],
};

/** What the avatar is doing: speaking (its audio is sounding), listening, or thinking (set by the app). */
export type Mode = "speaking" | "listening" | "thinking";

// Viseme → morph mapping, tuned on Microsoft Rocketbox avatars.
// Gains per viseme (aa opens very wide on these models; p/b/m and f/v need a little extra to read as closed).
const VISEME_GAIN: Record<string, number> = {
  aa: 0.52, E: 0.95, I: 0.95, O: 0.72, U: 1, PP: 1.1, FF: 1.1, TH: 0.75, DD: 0.7, kk: 0.7, nn: 0.7,
};
// Rounded visemes barely round the lips on these models, so add ARKit rounding per viseme weight: funnel for the
// round opening, plus a little lower-lip roll and lip closing so oo/w read as small, pushed-forward lips.
// r and sh/ch/j are rounded too.
const ROUNDING: Record<string, Record<string, number>> = {
  mouthPucker: { U: 1.2, O: 0.77, RR: 0.83, CH: 0.58 },
  mouthFunnel: { U: 0.9, O: 1.15, RR: 0.64, CH: 1.09 },
  mouthRollLower: { U: 0.26 },
  mouthClose: { U: 0.26 },
};
// p/b/m press the lips together, not just touch them; the visible compression is what makes them readable.
const LIP_PRESS: Record<string, number> = { mouthPressLeft: 0.35, mouthPressRight: 0.35 };
const JAW_LEVEL = 0.1; // jaw opening with the vowels; keep low or the mouth gapes
// Speed cap: a morph may travel its full range no faster than this, so shapes glide instead of snapping.
// Lip closures may move twice as fast.
const LIP_SLEW_MS = 160;
const CLOSURE_SLEW_MS = 80;
const CLOSURE_MORPHS = new Set(["viseme_PP", "viseme_FF", "mouthPressLeft", "mouthPressRight"]);
const VISEMES = ["aa", "E", "I", "O", "U", "PP", "SS", "TH", "DD", "FF", "kk", "nn", "RR", "CH", "sil"];

// Blinks: a quick close and slower open, every few seconds; speakers blink a little more often than listeners.
const BLINK_INTERVAL_S: Record<Mode, [number, number]> = { speaking: [1.8, 4.5], listening: [2.5, 6], thinking: [1.5, 4] };
const BLINK_S = 0.2;
// Brows: attentive listeners raise their inner brows slightly; thinking raises them more. Eased between modes.
const BROW: Record<Mode, number> = { speaking: 0, listening: 0.05, thinking: 0.15 };
const BROW_EASE_MS = 700;
const BROW_SMOOTHING_MS = 45;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Face close-up (metres): the whole head and the neck, with the arms and hands out of shot. On Rocketbox avatars
// the frame ends ~0.25 m below the eyes (shoulder joints ~0.23 m, forearms ~0.4 m, hands ~0.55 m below) and
// ~0.17 m above them (top of the hair). On narrow containers the width limit keeps the whole head in.
const FRAME_HEIGHT_M = 0.42;
const MIN_FRAME_WIDTH_M = 0.3;
const FACE_Y_IN_FRAME = 0.52; // face centre (eyes to chin), from the top

/** Centre of the face: vertices moved by blink/jaw morphs, else the head bone, else near the top of the model. */
function faceCenter(root: THREE.Object3D, meshes: THREE.Mesh[], targets: (name: string) => string[]): THREE.Vector3 {
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  for (const mesh of meshes) {
    for (const name of ["eyeBlinkLeft", "eyeBlinkRight", "jawOpen"].flatMap(targets)) {
      const delta = mesh.geometry.morphAttributes.position?.[mesh.morphTargetDictionary?.[name] ?? -1];
      if (!delta) continue;
      for (let i = 0; i < delta.count; i += 1) {
        if (Math.abs(delta.getX(i)) + Math.abs(delta.getY(i)) + Math.abs(delta.getZ(i)) < 1e-4) continue;
        box.expandByPoint(mesh.localToWorld(mesh.getVertexPosition(i, vertex))); // skinned + morphed
      }
    }
  }
  if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
  const head = root.getObjectByName("Head");
  if (head) return head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0));
  const whole = new THREE.Box3().setFromObject(root);
  const center = whole.getCenter(new THREE.Vector3());
  return new THREE.Vector3(center.x, whole.max.y - FRAME_HEIGHT_M * 0.4, center.z);
}

/**
 * Calibrate Rocketbox atlas materials (`f01_head`, `m03_body`, …) for physically based lighting; other materials
 * are kept as authored. Hair and lash (`_opacity`) materials keep their alpha blending: alpha-tested cutouts give
 * jagged hairlines and leak the page through the transparent canvas.
 */
function refineMaterial(mesh: THREE.Mesh, source: THREE.Material): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial) || source.roughnessMap || !/^[fm]\d+_(head|body)$/.test(source.name)) return source;
  const material = new THREE.MeshPhysicalMaterial();
  if (source instanceof THREE.MeshPhysicalMaterial) material.copy(source);
  else THREE.MeshStandardMaterial.prototype.copy.call(material, source);
  material.metalness = 0;
  material.roughness = 0.82;
  material.specularIntensity = 0.45;
  if (source.name.endsWith("_head")) {
    // Skin, hair, teeth and eyes share one texture atlas, so tell them apart by geometry: eyeballs are weighted
    // to eye bones, and the face has nonzero blink deltas.
    const skinned = mesh as THREE.SkinnedMesh;
    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const eyeBones = new Set(skinned.skeleton?.bones.flatMap((bone, index) => (/eye$/i.test(bone.name) ? [index] : [])) ?? []);
    let eyeVertices = 0;
    if (indices && weights) {
      for (let i = 0; i < indices.count; i += 1) {
        for (let c = 0; c < 4; c += 1) {
          if (eyeBones.has(indices.getComponent(i, c)) && weights.getComponent(i, c) > 0.5) {
            eyeVertices += 1;
            break;
          }
        }
      }
    }
    const eye = !!indices && eyeVertices > indices.count / 2;
    const blink = mesh.geometry.morphAttributes.position?.[mesh.morphTargetDictionary?.eyeBlinkLeft ?? -1];
    let skin = false;
    if (blink) {
      for (let i = 0; i < blink.count && !skin; i += 1) {
        skin = Math.abs(blink.getX(i)) + Math.abs(blink.getY(i)) + Math.abs(blink.getZ(i)) > 1e-4;
      }
    }
    material.roughness = eye ? 0.22 : skin ? 0.62 : 0.72;
    material.specularIntensity = eye ? 0.6 : 0.35;
    material.clearcoat = eye ? 0.25 : 0;
    material.clearcoatRoughness = 0.12;
    if (eye) material.normalScale.multiplyScalar(0.2);
  }
  return material;
}

function disposeObject(root: THREE.Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    resources.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

export class AvatarRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(22, 1, 0.1, 10);
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly keyLight = new THREE.RectAreaLight(0xfff3e8, 4, 0.8, 1.1);
  private readonly fillLight = new THREE.RectAreaLight(0xe5efff, 1, 1.2, 1.5);
  private readonly resizeObserver: ResizeObserver;
  private readonly clock = new THREE.Clock();
  private model: THREE.Object3D | null = null;
  private faceMeshes: THREE.Mesh[] = [];
  private face: THREE.Vector3 | null = null;
  private morphMap: MorphTargetMap = {};
  private frame = 0;
  private loadId = 0;
  private disposed = false;
  private blinkAt = -1;
  private nextBlinkAt = 2;
  private brow = BROW.listening;

  constructor(
    private readonly container: HTMLElement,
    private readonly getFrame: () => { visemes: Record<string, number>; mode: Mode },
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    Object.assign(this.renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
    container.appendChild(this.renderer.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35; // avoid washing out facial shape with light from every direction
    RectAreaLightUniformsLib.init();
    this.scene.add(this.keyLight, this.fillLight);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Load (or replace) the avatar. Resolves when it is on screen. */
  load(url: string, morphTargets: MorphTargetMap = {}): Promise<void> {
    const id = ++this.loadId;
    return new Promise((resolve, reject) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, (gltf) => {
        if (this.disposed || id !== this.loadId) {
          disposeObject(gltf.scene);
          resolve();
          return;
        }
        if (this.model) {
          this.scene.remove(this.model);
          disposeObject(this.model);
        }
        this.model = gltf.scene;
        this.scene.add(gltf.scene);
        this.faceMeshes = [];
        const replaced = new Set<THREE.Material>();
        const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        gltf.scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.morphTargetDictionary) this.faceMeshes.push(mesh);
          const refine = (material: THREE.Material) => {
            const refined = refineMaterial(mesh, material);
            if (refined !== material) replaced.add(material);
            return refined;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(refine) : refine(mesh.material);
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
              if (texture) texture.anisotropy = anisotropy;
            }
          }
        });
        for (const material of replaced) material.dispose();
        const has = (name: string) => this.faceMeshes.some((mesh) => mesh.morphTargetDictionary?.[name] !== undefined);
        this.morphMap = { ...(has("h_expressions.AE_AA_h") ? H_EXPRESSIONS : {}), ...morphTargets };
        if (!this.targets("viseme_aa").some(has)) {
          console.warn(`talking-avatar: ${url} has no Oculus viseme morph targets (viseme_aa, viseme_PP, …); the mouth won't move`);
        }
        gltf.scene.updateMatrixWorld(true);
        this.face = faceCenter(gltf.scene, this.faceMeshes, (name) => this.targets(name));
        this.keyLight.position.copy(this.face).add(new THREE.Vector3(-0.8, 0.5, 1.2));
        this.keyLight.lookAt(this.face);
        this.fillLight.position.copy(this.face).add(new THREE.Vector3(0.9, 0.15, 1));
        this.fillLight.lookAt(this.face);
        this.frameFace();
        resolve();
      }, undefined, (error) => {
        const reason = error instanceof Error ? error.message : String(error);
        // fetch() reports a CORS block as a bare network error; say what usually causes it.
        reject(new Error(`talking-avatar: couldn't load avatar ${url} (${reason}). If the browser console shows a CORS `
          + "error, the avatar's server must send Access-Control-Allow-Origin for this page's origin."));
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    if (this.model) disposeObject(this.model);
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly tick = () => {
    const dtMs = Math.min(this.clock.getDelta(), 0.05) * 1000; // returning from a hidden tab must not snap
    const { visemes, mode } = this.getFrame();
    this.applyMouth(visemes, dtMs);
    this.applyBlinkAndBrows(mode, dtMs);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** The avatar's morph target name(s) for a standard name. */
  private targets(name: string): string[] {
    const mapped = this.morphMap[name];
    return mapped === undefined ? [name] : Array.isArray(mapped) ? mapped : [mapped];
  }

  private applyMouth(weights: Record<string, number>, dtMs: number): void {
    const slew = (name: string, value: number) => {
      const maxStep = dtMs / (CLOSURE_MORPHS.has(name) ? CLOSURE_SLEW_MS : LIP_SLEW_MS);
      for (const target of this.targets(name)) {
        for (const mesh of this.faceMeshes) {
          const index = mesh.morphTargetDictionary?.[target];
          const influences = mesh.morphTargetInfluences;
          if (index === undefined || !influences) continue;
          influences[index] += THREE.MathUtils.clamp(value - influences[index], -maxStep, maxStep);
        }
      }
    };
    for (const viseme of VISEMES) slew(`viseme_${viseme}`, (weights[viseme] ?? 0) * (VISEME_GAIN[viseme] ?? 1));
    for (const [name, gains] of Object.entries(ROUNDING)) {
      slew(name, Math.min(1, Object.entries(gains).reduce((sum, [viseme, gain]) => sum + gain * (weights[viseme] ?? 0), 0)));
    }
    for (const [name, press] of Object.entries(LIP_PRESS)) slew(name, Math.min(1, press * (weights.PP ?? 0)));
    const vowelOpen = Math.max(weights.aa ?? 0, weights.E ?? 0, weights.I ?? 0, weights.O ?? 0, weights.U ?? 0);
    slew("jawOpen", JAW_LEVEL * vowelOpen * (1 - (weights.PP ?? 0)));
  }

  private applyBlinkAndBrows(mode: Mode, dtMs: number): void {
    const t = this.clock.elapsedTime;
    if (t >= this.nextBlinkAt) {
      this.blinkAt = t;
      this.nextBlinkAt = t + BLINK_S + rand(...BLINK_INTERVAL_S[mode]);
    }
    const progress = (t - this.blinkAt) / BLINK_S;
    const blink = progress >= 1 ? 0 : progress < 0.35 ? progress / 0.35 : 1 - (progress - 0.35) / 0.65;
    this.setMorph("eyeBlinkLeft", blink, 1);
    this.setMorph("eyeBlinkRight", blink, 1);
    this.brow += (BROW[mode] - this.brow) * (1 - Math.exp(-dtMs / BROW_EASE_MS));
    this.setMorph("browInnerUp", this.brow, 1 - Math.exp(-dtMs / BROW_SMOOTHING_MS));
  }

  private setMorph(name: string, value: number, speed: number): void {
    for (const target of this.targets(name)) {
      for (const mesh of this.faceMeshes) {
        const index = mesh.morphTargetDictionary?.[target];
        const influences = mesh.morphTargetInfluences;
        if (index === undefined || !influences) continue;
        influences[index] = THREE.MathUtils.lerp(influences[index], value, speed);
      }
    }
  }

  private frameFace(): void {
    if (!this.face) return;
    const { camera, face } = this;
    const height = Math.max(FRAME_HEIGHT_M, MIN_FRAME_WIDTH_M / camera.aspect);
    const distance = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(face.x, face.y + 0.03, face.z + distance); // lens at eye level
    camera.lookAt(face.x, face.y - (0.5 - FACE_Y_IN_FRAME) * height, face.z);
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.frameFace();
  }
}
