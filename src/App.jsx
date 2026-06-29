import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, ContactShadows, useGLTF, Center, Text } from '@react-three/drei';
import * as THREE from 'three';
import burgerModelPath from './assets/burger_separated_2.glb';
import Lenis from 'lenis';

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// ── Custom Cursor ───────────────────────────────────────────────────────────
function CustomCursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (dot.current) {
        dot.current.style.left = e.clientX + 'px';
        dot.current.style.top = e.clientY + 'px';
      }
    };
    window.addEventListener('mousemove', move);

    let raf;
    const animateRing = () => {
      ringPos.current.x += (pos.current.x - ringPos.current.x) * 0.12;
      ringPos.current.y += (pos.current.y - ringPos.current.y) * 0.12;
      if (ring.current) {
        ring.current.style.left = ringPos.current.x + 'px';
        ring.current.style.top = ringPos.current.y + 'px';
      }
      raf = requestAnimationFrame(animateRing);
    };
    raf = requestAnimationFrame(animateRing);

    return () => { window.removeEventListener('mousemove', move); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      <div className="cursor-dot" ref={dot} />
      <div className="cursor-ring" ref={ring} />
    </>
  );
}

// ── Smoothstep keyframe sampler ─────────────────────────────────────────────
function sampleKF(frames, t) {
  t = Math.max(frames[0].t, Math.min(frames[frames.length - 1].t, t));
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (t <= b.t) {
      const raw = (t - a.t) / (b.t - a.t);
      const p = raw * raw * (3 - 2 * raw); // smoothstep
      return {
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        s: a.s + (b.s - a.s) * p,
      };
    }
  }
  return frames[frames.length - 1];
}

// ── Hero 3D Text: fixed in world, fades on scroll ──────────────────────────
function Hero3DText({ scrollOffset, triggerPoints }) {
  const ref = useRef();
  const { viewport } = useThree();
  const fs = viewport.width < 5 ? 0.85 : 1.25;

  useFrame(() => {
    if (!ref.current) return;
    const offset = scrollOffset.current;
    const sizzleStart = triggerPoints.current ? triggerPoints.current.sizzle : 0.15;
    const fade = Math.max(0, 1 - offset / (sizzleStart * 0.8));
    ref.current.children.forEach(c => {
      if (c.material) { c.material.opacity = fade; c.material.transparent = true; }
    });
    ref.current.visible = fade > 0.01;
  });

  return (
    <group ref={ref} position={[0, 0, -1.5]}>
      <Text fontSize={fs * 1.1} position={[0, fs * 2.1, 0]}
        color="white" fillOpacity={0} strokeWidth="4%" strokeColor="rgba(255,255,255,0.8)"
        anchorX="center" anchorY="middle">THE</Text>
      <Text fontSize={fs * 1.8} position={[0, 0, 0]}
        color="white" anchorX="center" anchorY="middle">PERFECT</Text>
      <Text fontSize={fs * 1.1} position={[0, -(fs * 2.1), 0]}
        color="white" fillOpacity={0} strokeWidth="4%" strokeColor="rgba(255,255,255,0.8)"
        anchorX="center" anchorY="middle">BITE.</Text>
    </group>
  );
}

// ── Geometry Slicer for single-mesh models ───────────────────────────────
function sliceMesh(mesh, numSlices = 5) {
  const geometry = mesh.geometry;
  if (!geometry) return [mesh];

  const posAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  if (!posAttr) return [mesh];

  // Slice along the local Z axis (which is the vertical axis of the burger in this model)
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const minZ = bbox.min.z;
  const maxZ = bbox.max.z;
  const height = maxZ - minZ;

  const indexAttr = geometry.index;
  const isIndexed = !!indexAttr;
  const vertexCount = isIndexed ? indexAttr.count : posAttr.count;

  const sliceTriangles = Array.from({ length: numSlices }, () => []);

  for (let i = 0; i < vertexCount; i += 3) {
    const idx0 = isIndexed ? indexAttr.getX(i) : i;
    const idx1 = isIndexed ? indexAttr.getX(i + 1) : i + 1;
    const idx2 = isIndexed ? indexAttr.getX(i + 2) : i + 2;

    const z0 = posAttr.getZ(idx0);
    const z1 = posAttr.getZ(idx1);
    const z2 = posAttr.getZ(idx2);
    const avgZ = (z0 + z1 + z2) / 3;

    let sliceIdx = Math.floor(((avgZ - minZ) / height) * numSlices);
    sliceIdx = Math.max(0, Math.min(numSlices - 1, sliceIdx));

    sliceTriangles[sliceIdx].push(idx0, idx1, idx2);
  }

  const slicedMeshes = [];

  sliceTriangles.forEach((indices, sliceIdx) => {
    if (indices.length === 0) return;

    const newGeom = new THREE.BufferGeometry();
    const oldToNew = new Map();
    const newPositions = [];
    const newNormals = [];
    const newUvs = [];
    const newIndices = [];

    indices.forEach((oldIdx) => {
      if (!oldToNew.has(oldIdx)) {
        const newIdx = newPositions.length / 3;
        oldToNew.set(oldIdx, newIdx);

        newPositions.push(posAttr.getX(oldIdx), posAttr.getY(oldIdx), posAttr.getZ(oldIdx));
        if (normalAttr) {
          newNormals.push(normalAttr.getX(oldIdx), normalAttr.getY(oldIdx), normalAttr.getZ(oldIdx));
        }
        if (uvAttr) {
          newUvs.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
        }
      }
      newIndices.push(oldToNew.get(oldIdx));
    });

    newGeom.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      newGeom.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    if (newUvs.length > 0) {
      newGeom.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    newGeom.setIndex(newIndices);

    newGeom.computeBoundingBox();
    const sliceBbox = newGeom.boundingBox;
    const sliceCenter = new THREE.Vector3();
    sliceBbox.getCenter(sliceCenter);

    const sliceMesh = new THREE.Mesh(newGeom, mesh.material);
    sliceMesh.name = `${mesh.name}_slice_${sliceIdx}`;
    
    sliceMesh.userData.originalPosition = new THREE.Vector3(0, 0, 0);
    // Use local Z center as centerY because Z is the local vertical height axis
    sliceMesh.userData.centerY = sliceCenter.z;

    slicedMeshes.push(sliceMesh);
  });

  return slicedMeshes;
}

function BurgerModel({ scrollOffset, triggerPoints }) {
  const ref = useRef();
  const autoRotY = useRef(0);
  const mouseRX = useRef(0); // rotation.x from mouse
  const mouseRY = useRef(0); // rotation.y additive from mouse
  const { scene } = useGLTF(burgerModelPath);

  const meshesRef = useRef([]);

  useEffect(() => {
    if (scene) {
      const meshes = [];

      scene.traverse((child) => {
        if (child.isMesh && !child.name.includes('_slice_')) {
          // Compute bounding box for sorting
          child.geometry.computeBoundingBox();
          const boundingBox = child.geometry.boundingBox;
          const center = new THREE.Vector3();
          boundingBox.getCenter(center);
          
          if (!child.userData.originalPosition) {
            child.userData.originalPosition = child.position.clone();
          }

          const isBun = child.name.toLowerCase().includes('bun') || 
                        (child.parent && child.parent.name.toLowerCase().includes('bun'));

          const parentNode = child.parent || scene;
          const bunMeshCount = parentNode.children.filter(c => c.isMesh && !c.name.includes('_slice_')).length;

          // Only slice the bun if the bun node contains a single combined mesh (needs splitting)
          if (isBun && bunMeshCount === 1) {
            // Slice the bun mesh into 2 layers (top and bottom bun) along Z
            child.visible = false;
            const parent = child.parent || scene;
            const slices = sliceMesh(child, 2);

            // Clean up previous slices
            const toRemove = [];
            parent.children.forEach(c => {
              if (c.name.includes('_slice_')) {
                toRemove.push(c);
              }
            });
            toRemove.forEach(c => parent.remove(c));

            // Add slices to the parent
            slices.forEach((slice) => {
              parent.add(slice);
              meshes.push(slice);
            });
          } else {
            // Non-bun meshes (or buns already separated in the GLTF) are used directly.
            child.visible = true;
            meshes.push(child);
          }
        }
      });

      // Compute correct world Y coordinates for sorting order (independent of parent coordinate spaces)
      meshes.forEach((mesh) => {
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        const localCenter = new THREE.Vector3();
        bbox.getCenter(localCenter);
        mesh.updateMatrixWorld(true);
        const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);
        mesh.userData.centerY = worldCenter.y;
      });

      // Sort meshes from bottom to top based on world Y center
      meshes.sort((a, b) => a.userData.centerY - b.userData.centerY);
      meshesRef.current = meshes;
    }
  }, [scene]);

  const globalMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      globalMouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      globalMouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
    };
    
    // Reset immediately on mount
    resetScroll();

    // Reset again after short delays to ensure late scroll-restoration attempts are overridden
    const t1 = setTimeout(resetScroll, 100);
    const t2 = setTimeout(resetScroll, 350);
    const t3 = setTimeout(resetScroll, 700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;

    // ── Mouse influence (additive, no translation) ─────────────────────────
    mouseRY.current = THREE.MathUtils.lerp(mouseRY.current, globalMouse.current.x * 1.2, 0.04);
    mouseRX.current = THREE.MathUtils.lerp(mouseRX.current, -globalMouse.current.y * 0.4, 0.04);

    // ── Rotation: auto-spin Y + mouse additive ─────────────────────────────
    autoRotY.current += delta * 0.18;
    ref.current.rotation.y = autoRotY.current + mouseRY.current;
    ref.current.rotation.x = mouseRX.current;

    // ── Scroll coordinates ─────────────────────────────────────────────────
    const offset = scrollOffset.current;
    const triggers = triggerPoints.current;

    // ── Explosion Effect during S2 (Sizzle section) ────────────────────────
    let explode = 0;
    // Add small buffer margins to keep model fully imploded at Sizzle section boundaries
    const sizzleStart = triggers.sizzle + 0.02;
    const sizzleEnd = triggers.story - 0.02;
    
    if (offset >= sizzleStart && offset <= sizzleEnd) {
      const mid = (sizzleStart + sizzleEnd) / 2;
      if (offset < mid) {
        explode = (offset - sizzleStart) / (mid - sizzleStart);
      } else {
        explode = (sizzleEnd - offset) / (sizzleEnd - mid);
      }
      // Smoothstep easing
      explode = explode * explode * (3 - 2 * explode);
    }

    // ── Scroll keyframes: smooth position journey ──────────────────────────
    const mob = state.viewport.width < 5;
    const bs = mob ? 0.075 : 0.09; // Increased scale for both mobile and desktop

    // Calculate dynamic flight points within the Ingredients section to ensure the burger disappears before the Menu section
    const tIngredientsHold = triggers.ingredients + 0.25 * (triggers.menu - triggers.ingredients);
    const tIngredientsFly = triggers.ingredients + 0.75 * (triggers.menu - triggers.ingredients);

    // Dynamically align keyframes with measured DOM section trigger points, anchoring the model during sections
    const rawKF = [
      // Hero (S1)
      { t: 0.0, x: 0, y: 0, s: bs },
      { t: triggers.sizzle - 0.02, x: 0, y: 0, s: bs },
      
      // Sizzle (S2)
      { t: triggers.sizzle + 0.02, x: 0, y: 0, s: bs },
      { t: triggers.story - 0.02, x: 0, y: 0, s: bs },
      
      // Story (S3) - placed closer to the text card (1.15 instead of 2.0)
      { t: triggers.story + 0.02, x: mob ? 0 : 1.15, y: 0, s: bs },
      { t: triggers.colorBreak - 0.02, x: mob ? 0 : 1.15, y: 0, s: bs },
      
      // Color Break (S4) transition to Ingredients (S5) - placed closer to the list (1.15 instead of 2.0)
      { t: triggers.colorBreak + 0.04, x: mob ? 0 : -1.15, y: -0.3, s: bs },
      { t: tIngredientsHold, x: mob ? 0 : -1.15, y: -0.3, s: bs },
      
      // Fly off-screen during Ingredients (S5)
      { t: tIngredientsFly, x: mob ? 0 : -1.15, y: 5.0, s: bs },
      
      // Menu (S6) and Footer (S7) - stays off-screen
      { t: 1.0, x: mob ? 0 : -1.15, y: 5.0, s: bs }
    ];

    // Defensive programming: guarantee timestamps are strictly increasing and bounded between 0 and 1
    const KF = [];
    let lastT = -0.01;
    rawKF.forEach((kf, idx) => {
      let tClamped = Math.max(lastT + 0.001, Math.min(1.0, kf.t));
      if (idx === rawKF.length - 1) tClamped = 1.0;
      KF.push({ ...kf, t: tClamped });
      lastT = tClamped;
    });

    const kf = sampleKF(KF, offset);

    // Gentle lerp adds trailing smoothness on top of keyframe smoothstep
    const lf = 1 - Math.pow(0.001, delta);
    const targetX = THREE.MathUtils.lerp(ref.current.position.x, kf.x, lf);
    const targetY = THREE.MathUtils.lerp(ref.current.position.y, kf.y, lf);
    const targetS = THREE.MathUtils.lerp(ref.current.scale.x, kf.s, lf);

    ref.current.position.x = targetX;
    ref.current.position.y = targetY;

    // Apply uniform scale
    ref.current.scale.setScalar(targetS);

    if (meshesRef.current.length > 0) {
      // Separate sliced meshes along the local Z axis (vertical in world space due to parent rotation)
      const maxOffset = 1.4; // spacing between exploded layers (tuned to keep separation visible but elegant)
      const count = meshesRef.current.length;
      meshesRef.current.forEach((mesh, index) => {
        const original = mesh.userData.originalPosition;
        const offsetIndex = index - (count - 1) / 2;
        // Invert the offset to account for parent +90 degree X rotation (where +Z is down in world space)
        mesh.position.z = original.z - offsetIndex * explode * maxOffset;
      });
    }
  });

  return (
    <group ref={ref}>
      <Center precise><primitive object={scene} scale={1} /></Center>
    </group>
  );
}

useGLTF.preload(burgerModelPath);

function Experience({ scrollOffset, triggerPoints }) {
  return (
    <>
      <Environment preset="studio" />
      
      {/* Soft ambient lighting for shadow definition */}
      <ambientLight intensity={0.35} />
      
      {/* High-quality studio key light casting smooth shadows */}
      <directionalLight 
        position={[6, 12, 8]} 
        intensity={2.4} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
      />
      
      {/* Soft fill light to illuminate darker areas */}
      <directionalLight position={[-6, 6, -3]} intensity={0.7} />
      
      {/* Crisp white rim light to highlight burger silhouette and details */}
      <spotLight 
        position={[0, 8, -10]} 
        angle={0.6} 
        penumbra={1} 
        intensity={5.5} 
        color="#ffffff" 
      />
      
      {/* Soft warm backing spotlights for subtle luxury mood coloring */}
      <spotLight position={[-10, 5, -8]} angle={0.5} penumbra={1} intensity={1.2} color="#ff4500" />
      <spotLight position={[10, 5, -8]} angle={0.5} penumbra={1} intensity={1.2} color="#ffa500" />
      
      <Hero3DText scrollOffset={scrollOffset} triggerPoints={triggerPoints} />
      <BurgerModel scrollOffset={scrollOffset} triggerPoints={triggerPoints} />
      
      {/* Contact shadow plane positioned slightly higher to align with model base */}
      <ContactShadows position={[0, -2.6, 0]} opacity={0.4} scale={18} blur={2.5} far={5} />
    </>
  );
}

function App() {
  const scrollOffset = useRef(0);
  const triggerPoints = useRef({
    sizzle: 0.15,
    story: 0.3,
    colorBreak: 0.45,
    ingredients: 0.6,
    menu: 0.75,
    footer: 0.9
  });

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      mouseMultiplier: 1.0,
    });

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    const handleScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      scrollOffset.current = docHeight > 0 ? window.scrollY / docHeight : 0;
    };

    window.addEventListener('scroll', handleScroll);
    lenis.on('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      lenis.off('scroll', handleScroll);
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const updateTriggers = () => {
      const sizzleEl = document.querySelector('.visual-break');
      const storyEl = document.querySelector('.story-section');
      const colorEl = document.querySelector('.color-break');
      const ingredientsEl = document.querySelector('.ingredients-section');
      const menuEl = document.querySelector('.menu-section');
      const footerEl = document.querySelector('.luxury-footer');
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;

      if (docHeight > 0) {
        triggerPoints.current = {
          sizzle: sizzleEl ? sizzleEl.offsetTop / docHeight : 0.15,
          story: storyEl ? storyEl.offsetTop / docHeight : 0.3,
          colorBreak: colorEl ? colorEl.offsetTop / docHeight : 0.45,
          ingredients: ingredientsEl ? ingredientsEl.offsetTop / docHeight : 0.6,
          menu: menuEl ? menuEl.offsetTop / docHeight : 0.75,
          footer: footerEl ? footerEl.offsetTop / docHeight : 0.9,
        };
      }
    };

    updateTriggers();
    window.addEventListener('resize', updateTriggers);
    // Dynamic page layouts might shift on load, so check again a few times
    const t1 = setTimeout(updateTriggers, 200);
    const t2 = setTimeout(updateTriggers, 600);
    const t3 = setTimeout(updateTriggers, 1200);

    return () => {
      window.removeEventListener('resize', updateTriggers);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <>
      <CustomCursor />
      
      <header>
        <div className="logo">CRAVE<span>.</span></div>
        <button className="nav-cta">Pre-Order</button>
      </header>

      <div className="canvas-container">
        <Canvas shadows camera={{ position: [0, 0, 8], fov: 45 }} gl={{ antialias: true, alpha: true }}>
          <Suspense fallback={null}>
            <Experience scrollOffset={scrollOffset} triggerPoints={triggerPoints} />
          </Suspense>
        </Canvas>
      </div>

      <div className="ui-layer">
        {/* S1: Hero */}
        <section className="hero-section">
          <div className="hero-sub">
            <p>Move your mouse to rotate. Scroll to explore.</p>
          </div>
        </section>

        {/* S2: Image break */}
        <section className="visual-break">
          <h2>SIZZLE.</h2>
        </section>

        {/* S3: Story */}
        <section className="story-section">
          <div className="story-content glass-card">
            <span className="section-badge">THE CRAFT</span>
            <h2>BORN FROM<br />PASSION.</h2>
            <p>We didn't just want to make another burger. We wanted to engineer a masterpiece — every element obsessively perfected. Experience gastronomy elevated.</p>
          </div>
        </section>

        {/* S4: Color break */}
        <section className="color-break">
          <h2>100% WAGYU.<br />ZERO COMPROMISE.</h2>
        </section>

        {/* S5: Ingredients */}
        <section className="ingredients-section">
          <div className="ingredients-content glass-card">
            <span className="section-badge">THE BUILD</span>
            <h2>INGREDIENTS.</h2>
            <ul className="large-list">
              <li>
                <h3><span>01.</span> Black Angus Beef</h3>
                <p>Dry-aged 28 days for maximum density.</p>
              </li>
              <li>
                <h3><span>02.</span> Artisan Brioche</h3>
                <p>Toasted daily with black truffle butter.</p>
              </li>
              <li>
                <h3><span>03.</span> Heirloom Tomato</h3>
                <p>Organic vine-ripened, hand-sliced thick.</p>
              </li>
              <li>
                <h3><span>04.</span> Aged Cheddar</h3>
                <p>Sharp English cheddar melted under a cloche.</p>
              </li>
            </ul>
          </div>
        </section>

        {/* S6: Menu */}
        <section className="menu-section">
          <span className="section-badge centered">MENU</span>
          <h2>SIGNATURES</h2>
          <div className="bento-menu">
            <div className="bento-item">
              <img src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80" alt="Classic Burger" />
              <div className="bento-content">
                <h4>THE CLASSIC</h4>
                <span>$14</span>
              </div>
            </div>
            <div className="bento-item">
              <img src="https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=1200&q=80" alt="Spicy Smash" />
              <div className="bento-content">
                <h4>SPICY SMASH</h4>
                <span>$16</span>
              </div>
            </div>
            <div className="bento-item">
              <img src="https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=80" alt="Truffle Beast" />
              <div className="bento-content">
                <h4>TRUFFLE BEAST</h4>
                <span>$19</span>
              </div>
            </div>
            <div className="bento-item">
              <img src="https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=80" alt="BBQ Bacon" />
              <div className="bento-content">
                <h4>BBQ BACON</h4>
                <span>$17</span>
              </div>
            </div>
          </div>
        </section>

        {/* S7: Footer */}
        <footer className="luxury-footer">
          <div className="footer-top">
            <h2>HUNGRY?</h2>
            <button className="massive-btn">ORDER NOW</button>
          </div>

          <div className="footer-grid">
            <div className="footer-col brand-col">
              <div className="logo">CRAVE<span>.</span></div>
              <p className="footer-tagline">Obsessively engineered gastronomy. Elevating the classic burger to a culinary art form.</p>
              <div className="social-links">
                <a href="#" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                </a>
                <a href="#" aria-label="Facebook">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                </a>
                <a href="#" aria-label="Twitter">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg>
                </a>
              </div>
            </div>

            <div className="footer-col">
              <h3>EXPLORE</h3>
              <ul>
                <li><a href="#">Menu</a></li>
                <li><a href="#">Our Story</a></li>
                <li><a href="#">Locations</a></li>
                <li><a href="#">Careers</a></li>
              </ul>
            </div>

            <div className="footer-col">
              <h3>HOURS</h3>
              <ul>
                <li>Mon - Thu: 11am - 10pm</li>
                <li>Fri - Sat: 11am - Midnight</li>
                <li>Sun: Noon - 9pm</li>
              </ul>
            </div>

            <div className="footer-col">
              <h3>CONTACT</h3>
              <ul>
                <li><a href="tel:+18005552728">+1 (800) 555-CRAV</a></li>
                <li><a href="mailto:hello@craveburger.com">hello@craveburger.com</a></li>
                <li>100 Gourmet Way, Suite 400<br />New York, NY 10001</li>
              </ul>
            </div>

          </div>

          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} CRAVE. ALL RIGHTS RESERVED.</p>
            <div className="footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms & Conditions</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

export default App;
