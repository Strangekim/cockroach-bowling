// Cockroach Throwing — MVP (3D, third-person, mobile flick)
import * as THREE from './vendor/three.module.js';

let scene, camera, renderer;
let roach, target, pins = [];
const pinAimPoint = new THREE.Vector3();
let roachActive = false;
let roachVel = new THREE.Vector3();
let lastTime = performance.now();
let resetTimer = null;
let pendingFinalize = false;
let prevActive = false;
// Scoring state and UI refs
const scoreState = {
  frame: 1,
  throwInFrame: 1,
  total: 0,
  frames: Array.from({length:3}, ()=>({ throws:[0,0], pins:[0,0], wallHits:[0,0], score:0 })),
  currentThrowId: 0,
  wallHitsThisThrow: 0,
  gameOver: false,
};
let scoreboardEl = null;
let gameOverEl = null;
let scoreTableEl = null;
let scoreCells = [];
// Pins placement indirection so finalizeThrow can reset pins
let _placePinsImpl = null;
function placePins(){ if (typeof _placePinsImpl === 'function') _placePinsImpl(); }
let pendingPinsReset = false;

// Side wall + label references for dynamic multipliers
let sideWallL = null, sideWallR = null;
let sideWallMatL = null, sideWallMatR = null;
let plateLs = [], plateRs = [];
// temp vectors to reduce GC
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _tmpV4 = new THREE.Vector3();

const g = 12;
const ROACH_RADIUS = 0.30; // doubled roach size
const TARGET_RADIUS = 0.6; // legacy constant kept for compatibility
const LANE_LENGTH = 26; // ~30% longer lane
const LANE_WIDTH = 4.0; // widen lane ~2x from original
const LANE_HALF = LANE_WIDTH * 0.5;
const PIN_RADIUS = 0.12;
const LANE_GUTTER_W = 0.3; // gutter width on each side
const FOUL_Z = -0.8; // approximate foul line z
// Mass tuning (relative units)
const ROACH_MASS = 2.2; // heavier roach for stronger impacts
const PIN_MASS = 0.9;   // lighter pins to topple more easily

const statusEl = document.getElementById('status');
const aimCanvas = document.getElementById('aim');
const aimCtx = aimCanvas.getContext('2d');

function setStatus(text) { if (statusEl) statusEl.textContent = text; }

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(1);
  aimCanvas.width = w; aimCanvas.height = h;
}

// Make a canvas text texture accessible globally for wall labels
function makeTextTexture(text, {font='bold 64px sans-serif', color='#ffffff', stroke='#000000', strokeWidth=4, bg=null}={}){
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (bg){ ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width,canvas.height); }
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = strokeWidth;
  if (stroke){ ctx.strokeStyle = stroke; ctx.strokeText(text, canvas.width/2, canvas.height/2); }
  ctx.fillStyle = color; ctx.fillText(text, canvas.width/2, canvas.height/2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.minFilter = THREE.LinearFilter;
  return tex;
}

function createScoreUI(){
  // Compact summary bar
  scoreboardEl = document.createElement('div');
  scoreboardEl.id = 'scoreboard';
  Object.assign(scoreboardEl.style, {
    position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '6px 10px', borderRadius: '10px',
    fontWeight: '700', fontSize: '14px', zIndex: 6
  });
  scoreboardEl.textContent = 'Frame 1/3 · Throw 1/2 · Total 0';
  document.body.appendChild(scoreboardEl);

  // Bowling-like frame table
  scoreTableEl = document.createElement('div');
  Object.assign(scoreTableEl.style, {
    position:'fixed', top:'36px', left:'50%', transform:'translateX(-50%)',
    display:'grid', gridTemplateColumns:'repeat(3, minmax(40px, 1fr))', gap:'4px', width:'92vw', maxWidth:'900px',
    zIndex:6
  });
  scoreCells = [];
  for (let i=0;i<3;i++){
    const frame = document.createElement('div');
    Object.assign(frame.style, { background:'rgba(0,0,0,0.35)', color:'#fff', borderRadius:'6px', padding:'4px 4px 6px 4px' });
    const head = document.createElement('div'); head.textContent = String(i+1); Object.assign(head.style, { fontSize:'11px', opacity:'0.9' });
    const throwsRow = document.createElement('div'); Object.assign(throwsRow.style, { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px', marginTop:'2px' });
    const t1 = document.createElement('div'); const t2 = document.createElement('div');
    for (const t of [t1,t2]) Object.assign(t.style, { background:'rgba(255,255,255,0.12)', borderRadius:'4px', padding:'2px', textAlign:'center', minHeight:'18px', fontSize:'12px' });
    const total = document.createElement('div'); Object.assign(total.style, { marginTop:'4px', textAlign:'center', fontWeight:'800', fontSize:'13px' });
    throwsRow.append(t1,t2); frame.append(head, throwsRow, total); scoreTableEl.append(frame);
    scoreCells.push({t1, t2, total, frame});
  }
  document.body.appendChild(scoreTableEl);
}

function updateScoreUI(){
  if (scoreboardEl){
  const f = scoreState.frame; const t = scoreState.throwInFrame; const tot = scoreState.total;
  scoreboardEl.textContent = `Frame ${f}/3 · Throw ${t}/2 · Total ${tot}`;
  }
  // update table
  for (let i=0;i<3;i++){
    const cell = scoreCells[i]; if (!cell) continue; const fr = scoreState.frames[i];
    cell.t1.textContent = fr && fr.throws[0] ? String(fr.throws[0]) : '';
    cell.t2.textContent = fr && fr.throws[1] ? String(fr.throws[1]) : '';
    cell.total.textContent = fr && fr.score ? String(fr.score) : '';
    // highlight current frame
    const isCurrent = (i === scoreState.frame - 1 && !scoreState.gameOver);
    cell.frame.style.outline = isCurrent ? '2px solid #82d14a' : 'none';
  }
}

function labelColorForExp(exp){
  // exp: 1=>X2, 2=>X4, 3=>X8, 4=>X16, 5=>X32, 6=>X64, 7=>X128, 8=>X256, 9=>X512
  // vivid, opaque-friendly, high-contrast palette
  const palette = {
    1: 0x1565c0, // blue
    2: 0x2e7d32, // green
    3: 0xf9a825, // amber
    4: 0xd84315, // deep orange
    5: 0x6a1b9a, // purple
    6: 0x00838f, // teal
    7: 0xc0ca33, // lime
    8: 0xad1457, // pink
    9: 0x000000, // black for max multiplier
  };
  return palette[exp] || palette[9];
}

function updateWallMultiplierAll(){
  const hits = scoreState.wallHitsThisThrow || 0;
  const exp = Math.max(1, hits + 1);
  const label = `X${Math.pow(2, exp)}`;
  const tex = makeTextTexture(label, { font: 'bold 220px Arial', color: '#ffffff', stroke: '#000000', strokeWidth: 18 });
  if (plateLs && plateLs.length) { for (const p of plateLs) { p.material.map = tex; p.material.needsUpdate = true; } }
  if (plateRs && plateRs.length) { for (const p of plateRs) { p.material.map = tex; p.material.needsUpdate = true; } }
  const color = labelColorForExp(exp);
  if (sideWallMatL) sideWallMatL.color.setHex(color);
  if (sideWallMatR) sideWallMatR.color.setHex(color);
}

function showGameOver(){
  scoreState.gameOver = true;
  if (gameOverEl) gameOverEl.remove();
  gameOverEl = document.createElement('div');
  Object.assign(gameOverEl.style, {
    position:'fixed', inset:'0', display:'flex', alignItems:'center', justifyContent:'center',
    background:'rgba(0,0,0,0.6)', color:'#fff', zIndex:8, flexDirection:'column', gap:'12px'
  });
  const title = document.createElement('div'); title.textContent = '🎉 게임 종료!'; title.style.fontSize='28px'; title.style.fontWeight='800';
  const score = document.createElement('div'); score.textContent = `총점: ${scoreState.total}`; score.style.fontSize='22px';
  const btn = document.createElement('button'); btn.textContent = '다시하기'; Object.assign(btn.style, {
    padding:'10px 16px', borderRadius:'10px', border:'none', background:'#2d6cdf', color:'#fff', fontWeight:'800', cursor:'pointer'
  });
  btn.onclick = ()=>{ resetGame(); };
  gameOverEl.append(title, score, btn);
  document.body.appendChild(gameOverEl);
}

function resetGame(){
  scoreState.frame = 1; scoreState.throwInFrame = 1; scoreState.total = 0; scoreState.currentThrowId = 0; scoreState.wallHitsThisThrow = 0; scoreState.gameOver = false;
  scoreState.frames = Array.from({length:3}, ()=>({ throws:[0,0], pins:[0,0], wallHits:[0,0], score:0 }));
  if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; }
  updateScoreUI();
  placePins();
  updateScoreUI();
  resetRoach();
  setStatus('다시 당겨 발사');
}

 

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe9b1);
  scene.fog = new THREE.Fog(0xcfe9b1, 20, 80);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 2.2, 6.5);
  camera.lookAt(0, 1.2, 0);

  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.domElement.classList.add('webgl');
  document.body.appendChild(renderer.domElement);
  createScoreUI();

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(6, 10, 5);
  scene.add(dir);

  const groundGeo = new THREE.PlaneGeometry(LANE_WIDTH, LANE_LENGTH);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xd9c8a1, metalness: 0.0, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = false; ground.position.z = -LANE_LENGTH * 0.5;
  scene.add(ground); ground.visible = false; // hide brown lane for cleaner visuals and performance
  // Remove legacy brown side walls for cleaner visuals and performance
  // (Reverted) keep original simple ground; remove heavy lane decorations
  // Lightweight visual side walls (Plane + Basic material)
  const sideWallHeight = 12.0; // significantly taller walls for multiple vertical label rows
  const wallLen = LANE_LENGTH * 1.2; // extend wall length slightly beyond lane
  const sideWallGeo = new THREE.PlaneGeometry(wallLen, sideWallHeight);
  sideWallMatL = new THREE.MeshBasicMaterial({
    color: 0x2277ff,
    transparent: false
  });
  sideWallMatR = sideWallMatL.clone();
  sideWallL = new THREE.Mesh(sideWallGeo, sideWallMatL);
  sideWallL.rotation.y = Math.PI / 2; // face +X
  sideWallL.position.set(-LANE_HALF, sideWallHeight / 2, -wallLen * 0.5);
  sideWallR = new THREE.Mesh(sideWallGeo, sideWallMatR);
  sideWallR.rotation.y = -Math.PI / 2; // face -X
  sideWallR.position.set(LANE_HALF, sideWallHeight / 2, -wallLen * 0.5);
  scene.add(sideWallL, sideWallR);
  // Helper: make Canvas text texture
  function makeTextTexture(text, {font='bold 64px sans-serif', color='#ffffff', stroke='#000000', strokeWidth=4, bg=null}={}){
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (bg){ ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width,canvas.height); }
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = strokeWidth;
    if (stroke){ ctx.strokeStyle = stroke; ctx.strokeText(text, canvas.width/2, canvas.height/2); }
    ctx.fillStyle = color; ctx.fillText(text, canvas.width/2, canvas.height/2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  // X2 signage attached to transparent side walls (large)
  const x2tex = makeTextTexture('X2', { font: 'bold 200px Arial', color: '#ffffff', stroke: '#1a1a1a', strokeWidth: 12 });
  const plateGeo = new THREE.PlaneGeometry(4.0, 1.8);
  const baseMat = new THREE.MeshBasicMaterial({ map: x2tex, transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // Create labels per side: front/middle/back × five vertical rows (from bottom to top)
  const fracs = [-0.35, 0.0, 0.35];
  const rows = 5;
  const yRows = Array.from({length: rows}, (_, i) => (-sideWallHeight * 0.5) + (i + 0.5) * (sideWallHeight / rows));
  plateLs = []; plateRs = [];
  for (const f of fracs) {
    for (const y of yRows) {
      const mL = baseMat.clone(); const mR = baseMat.clone();
      const pL = new THREE.Mesh(plateGeo, mL);
      pL.position.set(f * wallLen, y, 0.06);
      pL.renderOrder = 2; sideWallL.add(pL); plateLs.push(pL);
      const pR = new THREE.Mesh(plateGeo, mR);
      // right wall has opposite local X direction
      pR.position.set(-f * wallLen, y, 0.06);
      pR.renderOrder = 2; sideWallR.add(pR); plateRs.push(pR);
    }
  }
  // Edge guides (thin bright rails at collision boundaries)
  const railGeo = new THREE.BoxGeometry(0.02, 0.02, LANE_LENGTH);
  const railMat = new THREE.MeshBasicMaterial({ color: 0xffff66 });
  const railL = new THREE.Mesh(railGeo, railMat); railL.position.set(-LANE_HALF, 0.31, -LANE_LENGTH * 0.5);
  const railR = railL.clone(); railR.position.x = LANE_HALF; scene.add(railL, railR);

  const laneMat = new THREE.LineBasicMaterial({ color: 0x6aa84f, transparent: true, opacity: 0.7 });
  const laneGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.5, 0.01, 0), new THREE.Vector3(-1.5, 0.01, -200)
  ]);
  const lane1 = new THREE.Line(laneGeom, laneMat);
  const lane2 = new THREE.Line(laneGeom.clone(), laneMat); lane2.position.x = 1.5; scene.add(lane1, lane2);

  // Build a low-poly cockroach: body + head + legs + antennae (more realistic tweaks)
  const roachMat = new THREE.MeshStandardMaterial({ color: 0x5b3416, roughness: 0.78, metalness: 0.1 });
  const roachGroup = new THREE.Group();
  const parts = { antennae: [], legs: [] };
  // Body (ellipsoid)
  const bodyGeo = new THREE.SphereGeometry(ROACH_RADIUS, 12, 10);
  const body = new THREE.Mesh(bodyGeo, roachMat);
  body.scale.set(1.0, 0.56, 1.95);
  roachGroup.add(body);
  // Head
  const headGeo = new THREE.SphereGeometry(ROACH_RADIUS * 0.75, 10, 8);
  const head = new THREE.Mesh(headGeo, roachMat);
  head.position.set(0, 0.02, -ROACH_RADIUS * 1.6);
  head.scale.set(0.95, 0.7, 1.0);
  roachGroup.add(head);
  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.35, metalness: 0.25 });
  const eyeGeo = new THREE.SphereGeometry(ROACH_RADIUS * 0.18, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.2, 0.02, -ROACH_RADIUS * 1.5); roachGroup.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.2, 0.02, -ROACH_RADIUS * 1.5); roachGroup.add(eyeR);
  // Legs (3 per side)
  const SCALE = ROACH_RADIUS / 0.15;
  const legGeo = new THREE.CylinderGeometry(0.008 * SCALE, 0.012 * SCALE, 0.28 * SCALE, 6);
  const legZ = [-0.20 * SCALE, 0.0, 0.20 * SCALE];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(legGeo, roachMat);
    l.position.set(-0.12 * SCALE, -0.06 * SCALE, legZ[i]);
    l.rotation.set(0.6, 0, 0.6);
    roachGroup.add(l); parts.legs.push(l);
    const r = new THREE.Mesh(legGeo, roachMat);
    r.position.set(0.12 * SCALE, -0.06 * SCALE, legZ[i]);
    r.rotation.set(0.6, 0, -0.6);
    roachGroup.add(r); parts.legs.push(r);
  }
  // Antennae
  const antGeo = new THREE.CylinderGeometry(0.003 * SCALE, 0.006 * SCALE, 0.26 * SCALE, 5);
  const antL = new THREE.Mesh(antGeo, roachMat);
  antL.position.set(-0.05 * SCALE, 0.06 * SCALE, -ROACH_RADIUS * 2.0);
  antL.rotation.set(-0.6, 0.3, 0);
  roachGroup.add(antL); parts.antennae.push(antL);
  const antR = new THREE.Mesh(antGeo, roachMat);
  antR.position.set(0.05 * SCALE, 0.06 * SCALE, -ROACH_RADIUS * 2.0);
  antR.rotation.set(-0.6, -0.3, 0);
  roachGroup.add(antR); parts.antennae.push(antR);

  // Elytra (wing covers)
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3c2712, roughness: 0.32, metalness: 0.18 });
  const shellGeo = new THREE.SphereGeometry(ROACH_RADIUS, 12, 10);
  const shellL = new THREE.Mesh(shellGeo, shellMat);
  shellL.scale.set(0.85, 0.5, 1.2);
  shellL.position.set(-0.08, 0.03, -0.05);
  shellL.rotation.set(0.1, 0.12, 0.05);
  roachGroup.add(shellL);
  const shellR = new THREE.Mesh(shellGeo, shellMat);
  shellR.scale.set(0.85, 0.5, 1.2);
  shellR.position.set(0.08, 0.03, -0.05);
  shellR.rotation.set(0.1, -0.12, -0.05);
  roachGroup.add(shellR);

  // Pronotum (shield behind head)
  const pronotumMat = new THREE.MeshStandardMaterial({ color: 0x4a2f14, roughness: 0.7, metalness: 0.08 });
  const pronotumGeo = new THREE.SphereGeometry(ROACH_RADIUS * 0.85, 12, 10);
  const pronotum = new THREE.Mesh(pronotumGeo, pronotumMat);
  pronotum.scale.set(1.2, 0.45, 0.8);
  pronotum.position.set(0, 0.02, -ROACH_RADIUS * 0.6);
  roachGroup.add(pronotum);

  roach = roachGroup; roach.userData.parts = parts; scene.add(roach);
  resetRoach();

  // Bowling pins
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.0 });
  const pinBandMat = new THREE.MeshStandardMaterial({ color: 0xd13d3d, roughness: 0.6, metalness: 0.0 });
  function makePin() {
    const g = new THREE.Group();
    const base = new THREE.CylinderGeometry(0.12, 0.11, 0.35, 12);
    const neck = new THREE.CylinderGeometry(0.09, 0.08, 0.18, 12);
    const head = new THREE.SphereGeometry(0.08, 12, 10);
    const meshBase = new THREE.Mesh(base, pinMat); meshBase.position.y = 0.175; g.add(meshBase);
    const meshNeck = new THREE.Mesh(neck, pinMat); meshNeck.position.y = 0.175 + 0.09 + 0.09; g.add(meshNeck);
    const meshHead = new THREE.Mesh(head, pinMat); meshHead.position.y = 0.175 + 0.09 + 0.18 + 0.08; g.add(meshHead);
    const band = new THREE.CylinderGeometry(0.095, 0.095, 0.025, 14);
    const bandMesh = new THREE.Mesh(band, pinBandMat); bandMesh.position.y = 0.175 + 0.05; g.add(bandMesh);
    g.userData.alive = true;
    g.userData.vel = new THREE.Vector3(0, 0, 0); // Add velocity for pin-pin collisions
    return g;
  }
  _placePinsImpl = function(){
    for (const p of pins) scene.remove(p);
    pins = [];
    // Bowling triangle: 45 pins with 9 rows [1..9], placed further back
    const headZ = -LANE_LENGTH * 0.70; // move cluster further back down the lane
    const rowSpacing = 0.42;
    const colSpacing = 0.40;
    const rows = [1,2,3,4,5,6,7,8,9];
    for (let r=0; r<rows.length; r++){
      const count = rows[r];
      const z = headZ - r * rowSpacing;
      for (let i=0; i<count; i++){
        const p = makePin();
        const offset = (-(count-1)/2 + i) * colSpacing;
        p.position.set(offset, 0, z);
        p.rotation.set(0,0,0);
        p.userData.alive = true;
        p.userData.vel.set(0, 0, 0);
        delete p.userData.tip;
        delete p.userData.knockedThrowId;
        scene.add(p); pins.push(p);
      }
    }
    pinAimPoint.set(0, 1.0, headZ);
  };
  placePins();
  const resetBtn = document.getElementById('resetPinsBtn');
  if (resetBtn && resetBtn.remove) resetBtn.remove();
  // Hidden legacy target
  const targetGeo = new THREE.TorusGeometry(TARGET_RADIUS, 0.05, 8, 24);
  const targetMat = new THREE.MeshStandardMaterial({ color: 0x82d14a, emissive: 0x0, roughness: 0.5 });
  target = new THREE.Mesh(targetGeo, targetMat); target.visible=false; target.position.set(0,-1000,-1000); scene.add(target);

  // No decorative columns in bowling mode

  setupInput();
  window.addEventListener('resize', resize); resize();
  setStatus('엄지로 화면을 눌러 뒤로 당긴 후 놓아 발사');
  requestAnimationFrame(loop);
}

function resetRoach() {
  roachActive = false;
  roachVel.set(0, 0, 0);
  roach.position.set(0, ROACH_RADIUS + 0.25, -0.4);
  roach.rotation.set(0, 0, 0);
  // At the exact moment the roach returns to start, reset wall multipliers/colors to X2
  scoreState.wallHitsThisThrow = 0;
  updateWallMultiplierAll();
}
function randomizeTarget() { const x = THREE.MathUtils.randFloatSpread(3.2); const z = -THREE.MathUtils.randFloat(14, 28); const y = THREE.MathUtils.randFloat(1.0, 2.0); target.position.set(x, y, z); }

function drawAim(start, current) {
  aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
  if (!start || !current) return; const dx = current.x - start.x; const dy = current.y - start.y; const len = Math.hypot(dx, dy); if (len < 8) return;
  const end = { x: start.x + dx, y: start.y + dy };
  aimCtx.save(); aimCtx.lineWidth = 6; aimCtx.lineCap = 'round'; aimCtx.lineJoin = 'round'; aimCtx.strokeStyle = 'rgba(130, 209, 74, 0.9)'; aimCtx.fillStyle = 'rgba(130, 209, 74, 0.9)';
  aimCtx.beginPath(); aimCtx.moveTo(start.x, start.y); aimCtx.lineTo(end.x, end.y); aimCtx.stroke();
  const angle = Math.atan2(dy, dx), ah = Math.min(18, 10 + len * 0.05); aimCtx.beginPath();
  aimCtx.moveTo(end.x, end.y);
  aimCtx.lineTo(end.x - ah * Math.cos(angle - Math.PI / 8), end.y - ah * Math.sin(angle - Math.PI / 8));
  aimCtx.lineTo(end.x - ah * Math.cos(angle + Math.PI / 8), end.y - ah * Math.sin(angle + Math.PI / 8));
  aimCtx.closePath(); aimCtx.fill(); aimCtx.restore();
}
function clearAim() { aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height); }

let isDragging = false; let startPt = null; let curPt = null;
function setupInput() {
  const el = renderer.domElement;
  const toPt = (e) => (e.touches && e.touches[0]) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
  const onDown = (e) => { e.preventDefault(); if (isDragging || roachActive) return; isDragging = true; startPt = toPt(e); curPt = { ...startPt }; drawAim(startPt, curPt); setStatus('좌우: 방향 / 길이: 파워'); };
  const onMove = (e) => { if (!isDragging) return; curPt = toPt(e); drawAim(startPt, curPt); };
  const onUp = (e) => { if (!isDragging) return; isDragging = false; clearAim(); const endPt = toPt(e.changedTouches ? (e.changedTouches[0] || e.touches?.[0] || e) : e); shootFromDrag(startPt, endPt); startPt = null; curPt = null; };
  el.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: false });
  el.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp, { passive: false });
}

function shootFromDrag(start, end) {
  if (!start || !end) return; const pullX = start.x - end.x; const pullY = start.y - end.y; const pullLen = Math.hypot(pullX, pullY);
  const maxLen = Math.min(window.innerWidth, window.innerHeight) * 0.6; const power = THREE.MathUtils.clamp(pullLen / maxLen, 0, 1); const speed = THREE.MathUtils.lerp(7, 30, power);
  const yaw = THREE.MathUtils.clamp(-pullX * 0.0038, -0.8, 0.8); const elev = THREE.MathUtils.clamp((-pullY) * 0.005, 0.08, 1.2);
  const dir = new THREE.Vector3(0, 0, -1); dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw); dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), +elev); dir.normalize();
  // Bowling: always start from the tee position
  roach.position.set(0, ROACH_RADIUS + 0.25, -0.4);
  // Start scoring for this throw
  scoreState.currentThrowId++;
  scoreState.wallHitsThisThrow = 0;
  // Reset wall UI multipliers back to X2 for new throw
  updateWallMultiplierAll();
  roachVel.copy(dir).multiplyScalar(speed); roachActive = true;
  const lookAt = new THREE.Vector3().copy(roach.position).add(roachVel); roach.lookAt(lookAt);
  setStatus('발사! 목표 링을 맞춰보세요');
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000); lastTime = t;
  if (roachActive) {
    // Integrate motion
    roachVel.y -= g * dt; roach.position.addScaledVector(roachVel, dt);
    // More realistic attitude: pitch by arc, roll by lateral velocity
    const speedXZ = Math.hypot(roachVel.x, roachVel.z);
    const targetPitch = -Math.atan2(roachVel.y, Math.max(0.1, speedXZ));
    const targetRoll  = THREE.MathUtils.clamp(-roachVel.x * 0.12, -0.6, 0.6);
    const lerpAng = (a,b,t)=>a+(b-a)*t;
    roach.rotation.x = lerpAng(roach.rotation.x, targetPitch, 0.12);
    roach.rotation.z = lerpAng(roach.rotation.z, targetRoll, 0.12);
    // Animate antennae and legs with aggressive, speed-scaled motion
    if (roach.userData && roach.userData.parts) {
      const parts = roach.userData.parts;
      const tt = performance.now() * 0.010; // base time
      const ft = performance.now() * 0.045; // fast flutter time
      const ampA = 0.25 + Math.min(0.90, speedXZ * 0.45);
      const ampL = 0.20 + Math.min(0.70, speedXZ * 0.60);
      for (let i=0;i<parts.antennae.length;i++) {
        const a = parts.antennae[i];
        const sway = Math.sin(tt*1.8 + i*0.9) * ampA;
        const flutter = Math.sin(ft*8.0 + i*1.1) * (ampA * 0.35);
        const backBend = Math.min(0.50, speedXZ * 0.22);
        a.rotation.x = -0.6 + sway + flutter + backBend;
        a.rotation.y = Math.sin(tt*1.2 + i) * 0.35;
        a.rotation.z = Math.sin(tt*2.1 + i*0.5) * 0.22 + THREE.MathUtils.clamp(-roachVel.x * 0.18, -0.35, 0.35);
      }
      for (let i=0;i<parts.legs.length;i++) {
        const l = parts.legs[i];
        const ph = (i%2===0?0.0:0.6) + i*0.2;
        const side = (l.position.x < 0) ? -1 : 1; // left/right
        l.rotation.x = 0.7 + Math.sin(tt*3.0 + ph) * ampL;
        l.rotation.y = Math.cos(tt*2.0 + ph) * 0.25;
        l.rotation.z = side * Math.sin(tt*3.6 + ph*1.3) * 0.30;
      }
    }
    // Bowling: walls and pin collisions
    if (roach.position.x < -LANE_HALF + ROACH_RADIUS) {
      roach.position.x = -LANE_HALF + ROACH_RADIUS; roachVel.x *= -0.85; scoreState.wallHitsThisThrow++; updateWallMultiplierAll();
    }
    if (roach.position.x >  LANE_HALF - ROACH_RADIUS) {
      roach.position.x =  LANE_HALF - ROACH_RADIUS; roachVel.x *= -0.85; scoreState.wallHitsThisThrow++; updateWallMultiplierAll();
    }
    for (const p of pins) {
      const dx = roach.position.x - p.position.x;
      const dz = roach.position.z - p.position.z;
      const dist2 = dx*dx + dz*dz;
      const pr = PIN_RADIUS + ROACH_RADIUS;
      const nearXZ = dist2 < pr*pr;
      const nearY = roach.position.y <= 0.45; // ignore overhead passes
      if (nearXZ && nearY) {
        // Tip the pin with direction based on impact vector (more natural)
        if (p.userData.alive) {
          p.userData.alive = false;
          const impactDirX = dx; // from pin to roach
          const impactDirZ = dz;
          const len = Math.max(1e-4, Math.hypot(impactDirX, impactDirZ));
          const inx = impactDirX/len, inz = impactDirZ/len;
          const max = 1.35;
          const jitter = 0.25 * (Math.random()-0.5);
          // map impact direction to target tip angles on both x and z
          const tx = THREE.MathUtils.clamp(-inz * max + jitter, -max, max);
          const tz = THREE.MathUtils.clamp( inx * max + jitter, -max, max);
          p.userData.tip = { tx, tz, max, speed: 2.0 };
          p.userData.knockedThrowId = scoreState.currentThrowId;
        }
        // Resolve penetration: push roach out and reflect velocity
        const len = Math.max(1e-4, Math.sqrt(dist2));
        const nx = dx/len, nz = dz/len; // from pin to roach
        const overlap = (PIN_RADIUS + ROACH_RADIUS) - len;
        roach.position.x += nx * overlap;
        roach.position.z += nz * overlap;
        const vdotn = roachVel.x*nx + roachVel.z*nz;
        const e = 0.6;
        roachVel.x = roachVel.x - (1+e)*vdotn*nx;
        roachVel.z = roachVel.z - (1+e)*vdotn*nz;
        // Transfer momentum to pin (use tuned masses)
        const impulseFactor = 0.7; // base transfer factor
        p.userData.vel.x += -nx * vdotn * impulseFactor * (ROACH_MASS / PIN_MASS);
        p.userData.vel.z += -nz * vdotn * impulseFactor * (ROACH_MASS / PIN_MASS);
      }
    }
    // (moved) Pin-pin collisions handled below every frame for continuous interaction
    const minY = ROACH_RADIUS + 0.02; if (roach.position.y <= minY) { roach.position.y = minY; roachActive = false; setStatus('다시 당겨 발사'); }
    const d = roach.position.distanceTo(target.position); if (d < TARGET_RADIUS + ROACH_RADIUS * 0.75) { flashTarget(); randomizeTarget(); resetRoach(); setStatus('명중! 다음 목표를 노려보세요'); }
  }
  if (!roachActive && prevActive && !resetTimer) {
    pendingFinalize = true;
    resetTimer = setTimeout(() => { 
      if (pendingFinalize) { finalizeThrow(); pendingFinalize = false; }
      if (pendingPinsReset) { placePins(); pendingPinsReset = false; }
      resetRoach(); 
      resetTimer = null; 
    }, 1500);
  }
  // Pin-pin collisions: broadphase grid for performance + low iteration
  const CELL = 0.6;
  for (let it=0; it<2; it++) {
    const grid = new Map();
    // build grid
    for (let i=0;i<pins.length;i++){
      const p = pins[i];
      const ix = Math.floor(p.position.x / CELL);
      const iz = Math.floor(p.position.z / CELL);
      const key = ix+','+iz;
      let arr = grid.get(key); if (!arr){ arr = []; grid.set(key, arr); }
      arr.push(i);
    }
    // collide within neighboring cells
    for (let i=0;i<pins.length;i++){
      const a = pins[i];
      const aix = Math.floor(a.position.x / CELL);
      const aiz = Math.floor(a.position.z / CELL);
      for (let gx=aix-1; gx<=aix+1; gx++){
        for (let gz=aiz-1; gz<=aiz+1; gz++){
          const arr = grid.get(gx+','+gz); if (!arr) continue;
          for (let k=0;k<arr.length;k++){
            const j = arr[k]; if (j <= i) continue;
            const b = pins[j];
            const dx=b.position.x - a.position.x; const dz=b.position.z - a.position.z;
            const dist2 = dx*dx + dz*dz; const rr = (PIN_RADIUS*2);
            if (dist2 < rr*rr){
              const len = Math.max(1e-4, Math.sqrt(dist2)); const nx = dx/len, nz = dz/len;
              const overlap = rr - len; const half = overlap*0.5;
              // positional correction (separation)
              a.position.x -= nx*half; a.position.z -= nz*half;
              b.position.x += nx*half; b.position.z += nz*half;
              // relative velocity along normal
              const relVelX = b.userData.vel.x - a.userData.vel.x;
              const relVelZ = b.userData.vel.z - a.userData.vel.z;
              const relVelDotN = relVelX * nx + relVelZ * nz;
              if (relVelDotN < 0) { // approaching
                const e = 0.5; // restitution
                const m1 = PIN_MASS, m2 = PIN_MASS;
                const jimp = -(1 + e) * relVelDotN / (1/m1 + 1/m2);
                a.userData.vel.x -= (jimp * nx) / m1;
                a.userData.vel.z -= (jimp * nz) / m1;
                b.userData.vel.x += (jimp * nx) / m2;
                b.userData.vel.z += (jimp * nz) / m2;
                // tipping: impact strong enough knocks one or both down
                const impactSpeed = -relVelDotN;
                const TIP_THRESHOLD = 0.65;
                if (impactSpeed > TIP_THRESHOLD){
                  const max = 1.35; const jitter = 0.25 * (Math.random()-0.5);
                  if (a.userData.alive) {
                    a.userData.alive = false;
                    const tx = THREE.MathUtils.clamp(-nz * max + jitter, -max, max);
                    const tz = THREE.MathUtils.clamp( nx * max + jitter, -max, max);
                    a.userData.tip = a.userData.tip || { tx, tz, max, speed: 2.0 };
                    a.userData.knockedThrowId = a.userData.knockedThrowId || scoreState.currentThrowId;
                  }
                  if (b.userData.alive) {
                    b.userData.alive = false;
                    const tx = THREE.MathUtils.clamp( nz * max + jitter, -max, max);
                    const tz = THREE.MathUtils.clamp(-nx * max + jitter, -max, max);
                    b.userData.tip = b.userData.tip || { tx, tz, max, speed: 2.0 };
                    b.userData.knockedThrowId = b.userData.knockedThrowId || scoreState.currentThrowId;
                  }
                }
              }
              // gentle chain: if one has tipped, encourage the other to tip with aligned direction
              if ((a.userData.alive===false && !a.userData.tip) || (b.userData.alive===false && !b.userData.tip)){
                const max = 1.35;
                if (a.userData.alive===true){
                  a.userData.alive = false;
                  a.userData.tip = { tx: -nz*max, tz: nx*max, max, speed: 1.8 };
                  a.userData.knockedThrowId = scoreState.currentThrowId;
                }
                if (b.userData.alive===true){
                  b.userData.alive = false;
                  b.userData.tip = { tx: nz*max, tz: -nx*max, max, speed: 1.8 };
                  b.userData.knockedThrowId = scoreState.currentThrowId;
                }
              }
            }
          }
        }
      }
    }
  }
  // Update pin physics and animation
  for (const p of pins) {
    // Apply pin velocity and friction
    if (p.userData.vel) {
      p.position.x += p.userData.vel.x * dt;
      p.position.z += p.userData.vel.z * dt;
      // Friction (slow down pins over time)
      const friction = 0.90;
      p.userData.vel.x *= friction;
      p.userData.vel.z *= friction;
      // Stop very slow pins
      if (Math.abs(p.userData.vel.x) < 0.01 && Math.abs(p.userData.vel.z) < 0.01) {
        p.userData.vel.x = 0;
        p.userData.vel.z = 0;
      }
      // Keep pins within lane boundaries
      if (p.position.x < -LANE_HALF + PIN_RADIUS) {
        p.position.x = -LANE_HALF + PIN_RADIUS;
        p.userData.vel.x *= -0.4; // bounce off wall with energy loss
      }
      if (p.position.x > LANE_HALF - PIN_RADIUS) {
        p.position.x = LANE_HALF - PIN_RADIUS;
        p.userData.vel.x *= -0.4;
      }
    }
    // Pin tipping animation (when marked): tip in 2 axes, keep base on ground
    if (p.userData.tip && p.userData.alive === false) {
      const tip = p.userData.tip; const max = tip.max || 1.35; const speed = tip.speed || 2.0;
      const dxz = (target, current) => {
        const diff = THREE.MathUtils.clamp(target - current, -speed*dt, speed*dt);
        return THREE.MathUtils.clamp(current + diff, -max, max);
      };
      p.rotation.x = dxz(tip.tx || 0, p.rotation.x || 0);
      p.rotation.z = dxz(tip.tz || 0, p.rotation.z || 0);
      p.position.y = 0; // keep on floor; no sinking
    }
  }
  const camTarget = _tmpV1; const camPos = _tmpV2;
  if (roachActive) { const v = _tmpV3.copy(roachVel); if (v.lengthSq() < 0.001) v.set(0, 0, -1); v.normalize(); const behind = _tmpV4.copy(v).multiplyScalar(-4.5); behind.y += 2.0; camPos.copy(roach.position).add(behind); camTarget.copy(roach.position).addScaledVector(v, 1.5); }
  else {
    // Idle: keep slight lively motion even when not flying
    if (roach.userData && roach.userData.parts) {
      const parts = roach.userData.parts;
      const tt = performance.now() * 0.008;
      const ft = performance.now() * 0.040;
      for (let i=0;i<parts.antennae.length;i++) {
        const a = parts.antennae[i];
        a.rotation.x = -0.6 + Math.sin(tt*1.1 + i*0.8)*0.18 + Math.sin(ft*6.0 + i)*0.08;
        a.rotation.y = Math.sin(tt*0.9 + i)*0.18;
      }
      for (let i=0;i<parts.legs.length;i++) {
        const l = parts.legs[i];
        const ph = (i%2===0?0.0:0.6) + i*0.15;
        const side = (l.position.x < 0) ? -1 : 1;
        l.rotation.x = 0.55 + Math.sin(tt*1.8 + ph)*0.22;
        l.rotation.y = Math.cos(tt*1.4 + ph)*0.10;
        l.rotation.z = side * Math.sin(tt*2.0 + ph)*0.12;
      }
    }
    // Golf-like idle: slightly top-down from behind roach toward target
    const toT = _tmpV3.copy(pinAimPoint).sub(roach.position); toT.y = 0;
    if (toT.lengthSq() < 1e-4) toT.set(0, 0, -1);
    toT.normalize();
    const back = _tmpV4.copy(toT).multiplyScalar(-4.2);
    camPos.copy(roach.position).add(back);
    camPos.y = Math.max(roach.position.y + 1.8, 2.0);
    camTarget.copy(roach.position).addScaledVector(toT, 2.0);
    camTarget.y = Math.min(roach.position.y + 0.9, camPos.y - 0.8);
  }
  if (camPos.y < camTarget.y + 0.6) camPos.y = camTarget.y + 0.6;
  camera.position.lerp(camPos, 0.12); camera.lookAt(camTarget);
  prevActive = roachActive;
  renderer.render(scene, camera); requestAnimationFrame(loop);
}

function finalizeThrow(){
  if (scoreState.gameOver) return;
  const fIdx = scoreState.frame - 1; const tIdx = scoreState.throwInFrame - 1;
  // count pins knocked this throw
  let knocked = 0;
  for (const p of pins) { if (p.userData.knockedThrowId === scoreState.currentThrowId) knocked++; }
  const hits = scoreState.wallHitsThisThrow;
  const points = knocked * Math.pow(2, hits);
  const frame = scoreState.frames[fIdx];
  frame.throws[tIdx] = points; frame.pins[tIdx] = knocked; frame.wallHits[tIdx] = hits;
  // advance throw/frame
  scoreState.throwInFrame++;
  if (scoreState.throwInFrame > 2) {
    frame.score = (frame.throws[0]||0) + (frame.throws[1]||0);
    scoreState.total += frame.score;
    scoreState.throwInFrame = 1; scoreState.frame++;
    pendingPinsReset = true; // defer pin reset until roach resets to origin
    if (scoreState.frame > 3) { updateScoreUI(); showGameOver(); return; }
  }
  updateScoreUI();
}

function flashTarget() { const orig = target.material.color.clone(); target.material.color.set(0xffe370); setTimeout(() => target.material.color.copy(orig), 150); }

init();
