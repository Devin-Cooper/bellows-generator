// src/render/three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFoldModel } from '../geometry/index.js';

/**
 * Convert a FoldModel into an indexed THREE.BufferGeometry with vertex normals.
 * Pure and headless: no renderer or DOM required.
 * @param {import('../geometry/types.js').FoldModel} foldModel
 * @returns {THREE.BufferGeometry}
 */
export function foldModelToGeometry(foldModel) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(foldModel.positions, 3),
  );
  geometry.setIndex(foldModel.indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Interactive Three.js preview of the folded bellows shell.
 * Assign `params` before calling `setExtension` so the collapse slider can
 * rebuild the FoldModel for a new t.
 */
export class BellowsViewer {
  /** @param {HTMLCanvasElement} canvasEl */
  constructor(canvasEl) {
    this.canvas = canvasEl;
    /** @type {object|null} params source for setExtension rebuilds */
    this.params = null;
    this.mesh = null;
    this.wireframe = false;

    const width = canvasEl.clientWidth || 640;
    const height = canvasEl.clientHeight || 480;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    this.camera.position.set(300, 220, 420);

    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setSize(width, height, false);

    this.controls = new OrbitControls(this.camera, canvasEl);
    this.controls.enableDamping = true;

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(1, 1, 1);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    this.material = new THREE.MeshStandardMaterial({
      color: 0xb0752a,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.0,
      wireframe: this.wireframe,
    });

    this._animate = this._animate.bind(this);
    this._raf = requestAnimationFrame(this._animate);
  }

  /**
   * Replace the displayed geometry from a prebuilt FoldModel.
   * @param {import('../geometry/types.js').FoldModel} foldModel
   */
  setFoldModel(foldModel) {
    const geometry = foldModelToGeometry(foldModel);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    } else {
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.scene.add(this.mesh);
    }
    this.controls.target.set(0, 0, foldModel.axialLength / 2);
    this.controls.update();
  }

  /**
   * Rebuild the shell at a new extension t in [0,1]. Requires `params`.
   * @param {number} t
   */
  setExtension(t) {
    if (!this.params) {
      throw new Error('BellowsViewer.setExtension: params not set');
    }
    this.setFoldModel(buildFoldModel(this.params, t));
  }

  /** Toggle solid/wireframe rendering. @param {boolean} on */
  setWireframe(on) {
    this.wireframe = on;
    this.material.wireframe = on;
  }

  /**
   * Re-read the canvas client size and resize the renderer + camera, then
   * render once. Needed because the canvas has 0 client size while hidden in an
   * inactive preview tab; call this when the 3D tab becomes visible and on
   * window resize.
   */
  resize() {
    const width = this.canvas.clientWidth || 640;
    const height = this.canvas.clientHeight || 480;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.controls.dispose();
    if (this.mesh) this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
