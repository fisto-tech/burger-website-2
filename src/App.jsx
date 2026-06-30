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
  const containerRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const move = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };

      const target = e.target;
      if (target) {
        const interactive = target.closest('button, a, .bento-item, .large-list li');
        if (interactive) {
          if (interactive.classList.contains('bento-item')) {
            setHovered('bento');
          } else if (interactive.closest('.large-list li')) {
            setHovered('item');
          } else if (interactive.tagName === 'BUTTON' || interactive.classList.contains('nav-cta')) {
            setHovered('button');
          } else if (interactive.tagName === 'A') {
            setHovered('link');
          }
        } else {
          setHovered(null);
        }
      }
    };

    const handleMouseDown = () => setActive(true);
    const handleMouseUp = () => setActive(false);

    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    let raf;
    const animateCursor = () => {
      currentPos.current.x += (pos.current.x - currentPos.current.x) * 0.18;
      currentPos.current.y += (pos.current.y - currentPos.current.y) * 0.18;

      if (containerRef.current) {
        containerRef.current.style.left = currentPos.current.x + 'px';
        containerRef.current.style.top = currentPos.current.y + 'px';
      }
      raf = requestAnimationFrame(animateCursor);
    };
    raf = requestAnimationFrame(animateCursor);

    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div 
      className={`custom-burger-cursor ${hovered ? `hovered-${hovered}` : ''} ${active ? 'active' : ''}`} 
      ref={containerRef}
    >
      <div className="cursor-bun-top" />
      <div className="cursor-patty" />
      <div className="cursor-bun-bottom" />
      {hovered && <span className="cursor-label">{hovered === 'bento' ? 'CRAVE' : hovered === 'button' ? 'BITE' : hovered.toUpperCase()}</span>}
    </div>
  );
}

// ── Order Modal Component ──────────────────────────────────────────────────
function OrderModal({ isOpen, onClose }) {
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleAction = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg('');
      onClose();
    }, 1800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card reveal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        {successMsg ? (
          <div className="modal-success-screen">
            <span className="success-icon" style={{ fontSize: '3rem', display: 'block', marginBottom: '15px' }}>🍔</span>
            <h3 style={{ fontFamily: 'Anton', fontSize: '1.8rem', color: 'var(--primary)', marginBottom: '10px' }}>
              {successMsg === 'cart' ? 'ADDED TO CART!' : 'PREPARING YOUR ORDER!'}
            </h3>
            <p style={{ color: '#aaa', fontSize: '0.95rem' }}>Your culinary journey is underway.</p>
          </div>
        ) : (
          <>
            <span className="section-badge">Gourmet Selection</span>
            <h2>CHOOSE YOUR EXPERIENCE</h2>
            <p className="modal-desc">Savor the masterfully engineered dry-aged Wagyu masterpiece. Freshly toasted buns, sharp cheddar, and black truffle butter.</p>
            
            <div className="modal-options">
              <div className="modal-card">
                <h4>THE CRAVE CLASSIC</h4>
                <span className="price">$14.00</span>
                <div className="modal-actions">
                  <button className="modal-btn secondary" onClick={() => handleAction('cart')}>Add to Cart</button>
                  <button className="modal-btn primary" onClick={() => handleAction('order')}>Order Now</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
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

          // if (child.material) {
          //   // Increase metalness and tune roughness for a richer, more premium food material look
          //   const nameLower = child.name.toLowerCase();
          //   if (nameLower.includes('bun')) {
          //     child.material.roughness = 1;
          //     child.material.metalness = 1; // Slight baked sheen on bun surface
          //   } else if (nameLower.includes('patty') || nameLower.includes('meat')) {
          //     child.material.roughness = 1;
          //     child.material.metalness = 1;  // Juicy sear effect on meat
          //   } else if (nameLower.includes('tomato')) {
          //     child.material.roughness = 1;
          //     child.material.metalness = 1; // Wet, glistening tomato
          //   } else if (nameLower.includes('lettuce') || nameLower.includes('salad')) {
          //     child.material.roughness = 1;
          //     child.material.metalness = 1; // Fresh leafy sheen
          //   } else if (nameLower.includes('cheese')) {
          //     child.material.roughness = 1;
          //     child.material.metalness = 1;  // Glossy melted cheese
          //   } else {
          //     child.material.roughness = 1;
          //     child.material.metalness = 1;
          //   }
          // }

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
    mouseRY.current = THREE.MathUtils.lerp(mouseRY.current, globalMouse.current.x * 1.8, 0.06);
    mouseRX.current = THREE.MathUtils.lerp(mouseRX.current, -globalMouse.current.y * 0.7, 0.06);

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
    const sizzleStart = triggers.sizzle - 0.05; // Starts 3% scroll progress BEFORE the Sizzle section
    const sizzleEnd = triggers.story - 0.10;     // Ends 7% scroll progress BEFORE the Story section

    
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
      { t: triggers.story - 0.10, x: 0, y: 0, s: bs },
      
      // Story (S3) - placed closer to the right edge (2.2 instead of 1.15)
      { t: triggers.story - 0.02, x: mob ? 0 : 2.2, y: 0, s: bs },
      { t: triggers.colorBreak - 0.05, x: mob ? 0 : 2.2, y: 0, s: bs },
      
      // Color Break (S4) transition to Ingredients (S5) - placed closer to the left edge (-2.2 instead of -1.15)
      { t: triggers.colorBreak + 0.04, x: mob ? 0 : -2.2, y: -0.3, s: bs },
      { t: tIngredientsHold, x: mob ? 0 : -2.2, y: -0.3, s: bs },
      
      // Fly off-screen during Ingredients (S5)
      { t: tIngredientsFly, x: mob ? 0 : -2.2, y: 12.0, s: bs },
      
      // Menu (S6) and Footer (S7) - stays off-screen
      { t: 1.0, x: mob ? 0 : -2.2, y: 12.0, s: bs }
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
      const maxOffset = 0.45; // spacing between exploded layers (tuned to keep separation visible but elegant)
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
      {/* Soft lighting from all directions (sky/ground gradient) with no sharp specular hot-spots */}
      <hemisphereLight intensity={1.25} color="#252424ff" groundColor="#c9c9c9ff" />
      
      {/* Soft ambient lighting for overall base brightness */}
      <ambientLight intensity={1} />
      
      {/* High-quality studio key light set to a very low intensity just for soft shadow casting */}
      <directionalLight 
        position={[3, 8, 5]} 
        intensity={1} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
      />
      
      {/* Soft fill light */}
      <directionalLight position={[-3, 6, 2]} intensity={0.1} />
      
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

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let currentProgress = 0;
    const interval = setInterval(() => {
      const increment = Math.floor(Math.random() * 12) + 4;
      currentProgress = Math.min(100, currentProgress + increment);
      setProgress(currentProgress);
      
      if (currentProgress === 100) {
        clearInterval(interval);
        setTimeout(() => {
          setFadeOut(true);
          setTimeout(() => {
            setLoading(false);
          }, 600);
        }, 450);
      }
    }, 90);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    const elements = document.querySelectorAll('.reveal-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, [loading]);

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
      {loading && (
        <div className={`preloader ${fadeOut ? 'fade-out' : ''}`}>
          <div className="loader-blueprint">
            <svg viewBox="0 0 100 100" className="loader-svg" width="120" height="120">
              <defs>
                <linearGradient id="burger-grad" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#ff4500" />
                  <stop offset="100%" stopColor="#ffa500" />
                </linearGradient>
                <clipPath id="loader-clip">
                  <rect x="0" y={100 - progress} width="100" height="100" />
                </clipPath>
              </defs>
              <circle cx="50" cy="50" r="46" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" opacity="0.15" fill="none" />
              
              {/* Silhouette outline */}
              <g opacity="0.15" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15,35 Q50,12 85,35 Q85,45 80,45 L20,45 Q15,45 15,35 Z" />
                <path d="M10,48 Q20,44 30,48 Q40,44 50,48 Q60,44 70,48 Q80,44 90,48" />
                <rect x="18" y="52" width="28" height="6" rx="2" />
                <rect x="54" y="52" width="28" height="6" rx="2" />
                <path d="M15,62 L85,62 L80,68 L76,62" />
                <rect x="18" y="70" width="64" height="12" rx="4" />
                <path d="M18,86 L82,86 Q85,96 50,96 Q15,96 18,86 Z" />
              </g>

              {/* Colorful active parts rising up */}
              <g clipPath="url(#loader-clip)" stroke="url(#burger-grad)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15,35 Q50,12 85,35 Q85,45 80,45 L20,45 Q15,45 15,35 Z" />
                <path d="M10,48 Q20,44 30,48 Q40,44 50,48 Q60,44 70,48 Q80,44 90,48" />
                <rect x="18" y="52" width="28" height="6" rx="2" />
                <rect x="54" y="52" width="28" height="6" rx="2" />
                <path d="M15,62 L85,62 L80,68 L76,62" />
                <rect x="18" y="70" width="64" height="12" rx="4" />
                <path d="M18,86 L82,86 Q85,96 50,96 Q15,96 18,86 Z" />
              </g>
            </svg>
          </div>
          <div className="loader-text">CRAVE</div>
          <div className="loader-percentage">{progress}%</div>
        </div>
      )}

      <CustomCursor />

      <OrderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      
      <header>
        <div className="logo">CRAVE<span>.</span></div>
        <button className="nav-cta" onClick={() => setIsModalOpen(true)}>Pre-Order</button>
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
          <div className="section-container">
            <div className="story-content glass-card reveal-on-scroll">
              <span className="section-badge">THE CRAFT</span>
              <h2>BORN FROM<br />PASSION.</h2>
              <p>We didn't just want to make another burger. We wanted to engineer a masterpiece — every element obsessively perfected. Experience gastronomy elevated.</p>
            </div>
          </div>
        </section>

        {/* S4: Color break */}
        <section className="color-break">
          <h2 className="reveal-on-scroll">100% WAGYU.<br />ZERO COMPROMISE.</h2>
        </section>

        {/* S5: Ingredients */}
        <section className="ingredients-section">
          <div className="section-container">
            <div className="ingredients-content glass-card reveal-on-scroll">
              <span className="section-badge">THE BUILD</span>
              <h2>INGREDIENTS.</h2>
              <ul className="large-list">
                <li className="reveal-on-scroll delay-1">
                  <h3><span>01.</span> Black Angus Beef</h3>
                  <p>Dry-aged 28 days for maximum density.</p>
                </li>
                <li className="reveal-on-scroll delay-2">
                  <h3><span>02.</span> Artisan Brioche</h3>
                  <p>Toasted daily with black truffle butter.</p>
                </li>
                <li className="reveal-on-scroll delay-3">
                  <h3><span>03.</span> Heirloom Tomato</h3>
                  <p>Organic vine-ripened, hand-sliced thick.</p>
                </li>
                <li className="reveal-on-scroll delay-4">
                  <h3><span>04.</span> Aged Cheddar</h3>
                  <p>Sharp English cheddar melted under a cloche.</p>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* S6: Menu */}
        <section className="menu-section">
          <span className="section-badge centered reveal-on-scroll">MENU</span>
          <h2 className="reveal-on-scroll delay-1">SIGNATURES</h2>
          <div className="bento-menu">
            <div className="bento-item reveal-on-scroll delay-1">
              <img src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80" alt="Classic Burger" />
              <div className="bento-content">
                <h4>THE CLASSIC</h4>
                <span>$14</span>
              </div>
            </div>
            <div className="bento-item reveal-on-scroll delay-2">
              <img src="https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=1200&q=80" alt="Spicy Smash" />
              <div className="bento-content">
                <h4>SPICY SMASH</h4>
                <span>$16</span>
              </div>
            </div>
            <div className="bento-item reveal-on-scroll delay-1">
              <img src="https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=80" alt="Truffle Beast" />
              <div className="bento-content">
                <h4>TRUFFLE BEAST</h4>
                <span>$19</span>
              </div>
            </div>
            <div className="bento-item reveal-on-scroll delay-2">
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
            <button className="massive-btn" onClick={() => setIsModalOpen(true)}>ORDER NOW</button>
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
