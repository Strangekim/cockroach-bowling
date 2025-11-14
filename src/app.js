// Cockroach Throwing ??MVP (3D, third-person, mobile flick)
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
let wallRainbow = false; // rainbow effect flag when X >= 1024
let rankingBoard = null; // 3D billboard mesh
let rankingTop3Cache = null; // cache fetched Top3 to keep across rounds
// Lane floor refs for LOD switching
let ground = null, fore = null;
let groundMatWood = null, groundMatFlat = null;
let foreMatWood = null, foreMatFlat = null;
let paused = false; // pause flag
let pauseOverlayEl = null; // pause overlay element
let refreshWrap = null; // top-right refresh button wrapper
const USE_WOOD = false; // 성능 최적화를 위해 기본적으로 우드 텍스처 비활성화
// temp vectors to reduce GC
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _tmpV4 = new THREE.Vector3();

// Angular dynamics for roach spin
let roachAngVel = new THREE.Vector3(0, 0, 0);
const ANGULAR_DAMP = 0.985;
// Camera shake (on impacts)
let camShakeT = 0; // remaining time (s)
let camShakeAmp = 0; // base amplitude

const g = 12;
const ROACH_RADIUS = 0.30; // base roach radius
let ROACH_RADIUS_CUR = ROACH_RADIUS; // current (affected by skill)
let roachScale = 1; // current visual scale
let skillUsedThisRound = false; // usable once per game (round)

let skillActiveNow = false; // active until current throw starts/ends
let skillBtn = null; // UI button
const TARGET_RADIUS = 0.6; // legacy constant kept for compatibility
const LANE_LENGTH = 26; // ~30% longer lane
const LANE_WIDTH = 4.0; // widen lane ~2x from original
const LANE_HALF = LANE_WIDTH * 0.5;
const PIN_RADIUS = 0.24;
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

// Lightweight procedural wood texture for the lane
function makeWoodTexture({width=256, height=256, base='#d9b77a', stripe='#caa261', grain=18}={}){
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0,0,width,height);
  const boardW = Math.max(6, Math.floor(width / grain));
  for (let x=0; x<width; x+=boardW){
    ctx.fillStyle = ((x/boardW)|0) % 2 === 0 ? base : stripe;
    ctx.fillRect(x, 0, boardW, height);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x=0; x<width; x+=boardW){ ctx.fillRect(x, 0, 1, height); }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function createRankingBillboard(){
  if (rankingBoard) return rankingBoard;
  const bw = Math.max(1.0, LANE_WIDTH - 0.6);
  const bh = 2.0;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 12; ctx.strokeRect(6,6,canvas.width-12,canvas.height-12);
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 72px system-ui, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText('전체 랭킹 TOP3', canvas.width/2, 28);
  ctx.font = 'bold 56px system-ui, sans-serif';
  const startY = 140; const stepY = 110;
  // If we already fetched Top3, draw from cache
  if (Array.isArray(rankingTop3Cache) && rankingTop3Cache.length) {
    rankingTop3Cache.forEach((r,i)=>{
      const y = startY + i*stepY;
      ctx.fillStyle = '#93c5fd'; ctx.textAlign='left'; ctx.fillText(String(i+1)+'등', 140, y);
      let nick = (r && r.nickname) ? String(r.nickname) : '-';
      const gp = Array.from(nick); if (gp.length > 4) nick = gp.slice(0,4).join('') + '...';
      ctx.fillStyle = '#e5e7eb'; ctx.fillText(nick, 300, y);
      ctx.fillStyle = '#fbbf24'; ctx.textAlign='right'; ctx.fillText(String(r.score ?? '-'), canvas.width-140, y);
    });
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.minFilter = THREE.LinearFilter;
  const geo = new THREE.PlaneGeometry(bw, bh);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  const board = new THREE.Mesh(geo, mat);
  board.position.set(0, 5.0, -LANE_LENGTH + 1.0);
  scene.add(board);
  rankingBoard = board;
  return board;
}

function ensurePauseOverlay(){
  if (!pauseOverlayEl){
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:'fixed', inset:'0', display:'none', alignItems:'center', justifyContent:'center',
      background:'rgba(0,0,0,0.6)', color:'#fff', zIndex:9, flexDirection:'column', gap:'12px'
    });
    const title = document.createElement('div'); title.textContent = '게임 종료!'; title.style.fontSize='28px'; title.style.fontWeight='800';
    const row = document.createElement('div'); Object.assign(row.style,{ display:'flex', gap:'10px' });
    const btnCont = document.createElement('button'); btnCont.textContent = '계속 진행'; Object.assign(btnCont.style,{ padding:'10px 16px', borderRadius:'10px', border:'none', background:'#2d6cdf', color:'#fff', fontWeight:'800', cursor:'pointer' });
    const btnRestart = document.createElement('button'); btnRestart.textContent = '다시 시작'; Object.assign(btnRestart.style,{ padding:'10px 16px', borderRadius:'10px', border:'none', background:'#16a34a', color:'#fff', fontWeight:'800', cursor:'pointer' });
    btnCont.onclick = ()=>{ paused = false; el.style.display='none'; };
    btnRestart.onclick = ()=>{ paused = false; el.style.display='none'; resetGame(); };
    row.append(btnCont, btnRestart); el.append(title, row); document.body.appendChild(el);
    pauseOverlayEl = el;
  }
  pauseOverlayEl.style.display = 'flex';
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
  scoreboardEl.textContent = '프레임 1/3 · 투구 1/2 · 총점 0';
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
  const f = Math.min(scoreState.frame, 3); const t = Math.min(scoreState.throwInFrame, 2); const tot = scoreState.total;
  scoreboardEl.textContent = `프레임 ${f}/3 · 투구 ${t}/2 · 총점 ${tot}`;
  }
  // update table
  for (let i=0;i<3;i++){
    const cell = scoreCells[i]; if (!cell) continue; const fr = scoreState.frames[i];
    cell.t1.textContent = (function(){ const played = (i < scoreState.frame - 1) || (i === scoreState.frame - 1 && scoreState.throwInFrame > 1) || scoreState.gameOver; return played ? String(fr && typeof fr.throws[0] === 'number' ? fr.throws[0] : 0) : ''; })();
    cell.t2.textContent = (function(){ const played = (i < scoreState.frame - 1) || (i === scoreState.frame - 1 && scoreState.throwInFrame > 2) || scoreState.gameOver; return played ? String(fr && typeof fr.throws[1] === 'number' ? fr.throws[1] : 0) : ''; })();
    cell.total.textContent = (((i < scoreState.frame - 1) || scoreState.gameOver) && fr) ? String(fr.score || 0) : '';
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
  const pow2 = Math.pow(2, exp);
  wallRainbow = pow2 >= 1024;
  if (!wallRainbow) {
    if (sideWallMatL) sideWallMatL.color.setHex(color);
    if (sideWallMatR) sideWallMatR.color.setHex(color);
    // reset label tint/opacity to default when leaving rainbow mode
    for (const p of plateLs) { if (p.material && p.material.color) { p.material.color.setHex(0xffffff); p.material.opacity = 1.0; } }
    for (const p of plateRs) { if (p.material && p.material.color) { p.material.color.setHex(0xffffff); p.material.opacity = 1.0; } }
  }
}

function showGameOver(){
  scoreState.gameOver = true;
  if (gameOverEl) gameOverEl.remove();
  gameOverEl = document.createElement('div');
  Object.assign(gameOverEl.style, {
    position:'fixed', inset:'0', display:'flex', alignItems:'center', justifyContent:'center',
    background:'rgba(0,0,0,0.6)', color:'#fff', zIndex:8, flexDirection:'column', gap:'12px'
  });
  const title = document.createElement('div'); title.textContent = '게임 종료!'; title.style.fontSize='28px'; title.style.fontWeight='800';
  const score = document.createElement('div'); score.textContent = '총점: ' + scoreState.total; score.style.fontSize='22px';
  const btn = document.createElement('button'); btn.textContent = '\uC0C8\uB85C\uACE0\uCE68'; Object.assign(btn.style, {
    padding:'10px 16px', borderRadius:'10px', border:'none', background:'#2d6cdf', color:'#fff', fontWeight:'800', cursor:'pointer'
  });
  btn.onclick = ()=>{ if (refreshWrap) refreshWrap.style.display=''; if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; } paused = false; resetGame(); };
  gameOverEl.append(title, score, btn);
  document.body.appendChild(gameOverEl);
}
function resetGame(){
  scoreState.frame = 1; scoreState.throwInFrame = 1; scoreState.total = 0; scoreState.currentThrowId = 0; scoreState.wallHitsThisThrow = 0; scoreState.gameOver = false;
  scoreState.frames = Array.from({length:3}, ()=>({ throws:[0,0], pins:[0,0], wallHits:[0,0], score:0 }));
  skillUsedThisRound = false; skillActiveNow = false; applyRoachScale(1); updateSkillUI();
  if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; }
  updateScoreUI();
  placePins();
  // Ensure the ranking billboard is visible from the very start
  createRankingBillboard();
  if (rankingBoard) { scene.remove(rankingBoard); rankingBoard = null; }
  // 3D ranking billboard behind the pins, within side walls
  createRankingBillboard();
  updateScoreUI();
  resetRoach();
  if (refreshWrap) refreshWrap.style.display='';
  setStatus('Ready: pull to launch');
}

 

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe9b1);
  // 성능 최적화를 위해 Fog 비활성화
  scene.fog = null;

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
  const woodTex = makeWoodTexture({ width: 256, height: 256, base: '#d9b77a', stripe: '#caa261', grain: 18 });
  woodTex.repeat.set(Math.max(1, Math.floor(LANE_WIDTH*0.8)), Math.max(2, Math.floor(LANE_LENGTH/6)));
  groundMatWood = new THREE.MeshBasicMaterial({ map: woodTex });
  groundMatFlat = new THREE.MeshBasicMaterial({ color: 0xd9c8a1 });
  ground = new THREE.Mesh(groundGeo, USE_WOOD ? groundMatWood : groundMatFlat);
  ground.rotation.x = -Math.PI / 2; ground.position.z = -LANE_LENGTH * 0.5;
  scene.add(ground);
  // Extend wooden floor forward (toward camera) so green background is hidden near start
  const foreGeo = new THREE.PlaneGeometry(LANE_WIDTH, 4);
  foreMatWood = new THREE.MeshBasicMaterial({ map: woodTex });
  foreMatFlat = new THREE.MeshBasicMaterial({ color: 0xd9c8a1 });
  fore = new THREE.Mesh(foreGeo, USE_WOOD ? foreMatWood : foreMatFlat);
  fore.rotation.x = -Math.PI / 2;
  fore.position.z = 2.0; // modest forward extension to hide green
  scene.add(fore);
  // Draw a white start/foul line across the lane
  const startLineGeo = new THREE.PlaneGeometry(LANE_WIDTH, 0.06);
  const startLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const startLine = new THREE.Mesh(startLineGeo, startLineMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.011, FOUL_Z);
  scene.add(startLine);
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
    // X2 signage attached to transparent side walls (more visible)
  const x2tex = makeTextTexture('X2', { font: 'bold 200px Arial', color: '#ffffff', stroke: '#1a1a1a', strokeWidth: 12 });
  const plateGeo = new THREE.PlaneGeometry(4.0, 1.8);
  // Performance: avoid costly blending overdraw on many plates.
  // Use alphaTest to discard fully transparent texels, write depth, and render only front faces.
  const baseMat = new THREE.MeshBasicMaterial({
    map: x2tex,
    transparent: false,
    alphaTest: 0.5,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide
  });
  // 3 vertical rows × 5 positions along wall, both sides
  const fracs = [-0.45, -0.225, 0.0, 0.225, 0.45];
  const rows = 3;
  const yRows = Array.from({length: rows}, (_, i) => (-sideWallHeight * 0.5) + (i + 0.5) * (sideWallHeight / rows));
  plateLs = []; plateRs = [];
  for (const f of fracs) {
    for (const y of yRows) {
      const mL = baseMat.clone(); const mR = baseMat.clone();
      const pL = new THREE.Mesh(plateGeo, mL);
      pL.position.set(f * wallLen, y, 0.06);
      pL.renderOrder = 2; sideWallL.add(pL); plateLs.push(pL);
      const pR = new THREE.Mesh(plateGeo, mR);
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
    // Scaled x2 in all dimensions
    const base = new THREE.CylinderGeometry(0.24, 0.22, 0.70, 12);
    const neck = new THREE.CylinderGeometry(0.18, 0.16, 0.36, 12);
    const head = new THREE.SphereGeometry(0.16, 12, 10);
    const meshBase = new THREE.Mesh(base, pinMat); meshBase.position.y = 0.35; g.add(meshBase);
    const meshNeck = new THREE.Mesh(neck, pinMat); meshNeck.position.y = 0.35 + 0.18 + 0.18; g.add(meshNeck);
    const meshHead = new THREE.Mesh(head, pinMat); meshHead.position.y = 0.35 + 0.18 + 0.36 + 0.16; g.add(meshHead);
    const band = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14);
    const bandMesh = new THREE.Mesh(band, pinBandMat); bandMesh.position.y = 0.35 + 0.10; g.add(bandMesh);
    g.userData.alive = true;
    g.userData.vel = new THREE.Vector3(0, 0, 0); // Add velocity for pin-pin collisions
    g.userData.meshes = { base: meshBase, neck: meshNeck, head: meshHead, band: bandMesh };
    return g;
  }
  function colorizePin(pin, colorHex){
    if (!pin || !pin.userData || !pin.userData.meshes) return;
    const { base, neck, head } = pin.userData.meshes;
    for (const m of [base, neck, head]){
      if (!m) continue;
      m.material = (m.material || pinMat).clone();
      m.material.color.setHex(colorHex);
      m.material.needsUpdate = true;
    }
  }
  _placePinsImpl = function(){
    for (const p of pins) scene.remove(p);
    pins = [];
    // Bowling triangle: reduced ~half count (~28 pins) with 7 rows [1..7]
    const headZ = -LANE_LENGTH * 0.70; // move cluster further back down the lane
    const rowSpacing = 0.84; // doubled spacing for doubled pin size
    const colSpacing = 0.80; // doubled spacing for doubled pin size
    const rows = [1,2,3,4,5,6,7];
    // track row/column metadata for deterministic color rules
    const created = [];
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
        p.userData.row = r+1; // 1-based row index
        p.userData.rowCount = count;
        p.userData.colIndex = i; // 0..count-1
        delete p.userData.tip;
        delete p.userData.knockedThrowId;
        scene.add(p); pins.push(p); created.push(p);
      }
    }
    // Choose the most central pin (geometric center) as rainbow pin
    if (created.length) {
      let cx=0, cz=0; for (const p of created) { cx += p.position.x; cz += p.position.z; }
      cx/=created.length; cz/=created.length;
      let best=null, bd=Infinity;
      for (const p of created){ const dx=p.position.x-cx, dz=p.position.z-cz; const d=dx*dx+dz*dz; if (d<bd){ bd=d; best=p; } }
      if (best){ best.userData.rainbow = true; colorizePin(best, 0xff55aa); best.userData.isCenterRainbow=true; }
    }
    // Deterministic red pins: pick specific positions by row rules
    const pickTargets = [
      { row: 3, pos: 'center' },
      { row: 5, pos: 'left' },
      { row: 7, pos: 'right' },
    ];
    for (const rule of pickTargets){
      const cand = created.filter(p=>p.userData.row===rule.row);
      if (!cand.length) continue;
      let chosen=null;
      if (rule.pos==='center') {
        // choose middle index
        const mid = Math.floor(cand[0].userData.rowCount/2);
        chosen = cand.find(p=>p.userData.colIndex===mid) || cand[Math.floor(cand.length/2)];
      } else if (rule.pos==='left') {
        chosen = cand.find(p=>p.userData.colIndex===0) || cand[0];
      } else if (rule.pos==='right') {
        chosen = cand.find(p=>p.userData.colIndex===cand[0].userData.rowCount-1) || cand[cand.length-1];
      }
      if (chosen && !chosen.userData.isCenterRainbow) { colorizePin(chosen, 0xd13d3d); chosen.userData.red = true; }
    }
    pinAimPoint.set(0, 1.0, headZ);
  };
  placePins();
  // Create the ranking billboard at startup
  createRankingBillboard();
  const resetBtn = document.getElementById('resetPinsBtn');
  if (resetBtn && resetBtn.remove) resetBtn.remove();
  // Hidden legacy target
  const targetGeo = new THREE.TorusGeometry(TARGET_RADIUS, 0.05, 8, 24);
  const targetMat = new THREE.MeshStandardMaterial({ color: 0x82d14a, emissive: 0x0, roughness: 0.5 });
  target = new THREE.Mesh(targetGeo, targetMat); target.visible=false; target.position.set(0,-1000,-1000); scene.add(target);

  // No decorative columns in bowling mode

  setupInput();
  // Hide legacy HUD texts on the top-left and add refresh menu
  const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
    (function createRefreshMenuUI(){
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position:'fixed', top:'8px', right:'8px', zIndex:7 });
    const btn = document.createElement('button');
    btn.textContent = '\uC0C8\uB85C\uACE0\uCE68';
    Object.assign(btn.style, { padding:'8px 12px', border:'none', borderRadius:'10px', background:'#2d6cdf', color:'#fff', fontWeight:'800', cursor:'pointer' });
    btn.onclick = ()=>{ paused = true; ensurePauseOverlay(); };
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    refreshWrap = wrap;
  })();
  window.addEventListener('resize', resize); resize();
  setStatus('Ready: pull to launch');
  createSkillUI();
  requestAnimationFrame(loop);
}

function applyRoachScale(s){
  roachScale = s;
  ROACH_RADIUS_CUR = ROACH_RADIUS * s;
  if (roach && roach.scale) roach.scale.set(s, s, s);
}

function updateSkillUI(){
  if (!skillBtn) return;
  const canUse = (!roachActive) && (!skillUsedThisRound);
  skillBtn.style.opacity = canUse ? '1' : '0.4';
  skillBtn.disabled = !canUse;
}

function createSkillUI(){
  const btn = document.createElement('button');
  btn.id = 'btnSkillBigRoach';
  btn.textContent = '2×';
  Object.assign(btn.style, {
    position:'fixed', left:'8px', top:'50%', transform:'translateY(-50%)',
    zIndex:7, padding:'10px 12px', border:'none', borderRadius:'9999px',
    background:'#f59e0b', color:'#111', fontWeight:'900', boxShadow:'0 6px 18px rgba(0,0,0,0.25)', cursor:'pointer'
  });
  btn.title = '바퀴벌레 2배 (라운드당 1회, 시작 전만 사용)';
  btn.onclick = ()=>{
    if (roachActive || skillUsedThisRound) return;
    applyRoachScale(2);
    skillActiveNow = true;
    skillUsedThisRound = true;
    updateSkillUI();
  };
  document.body.appendChild(btn);
  skillBtn = btn;
  updateSkillUI();
}

function resetRoach() {
  roachActive = false;
  roachVel.set(0, 0, 0);
  // reset skill effect after each throw
  applyRoachScale(1);
  skillActiveNow = false;
  roach.position.set(0, ROACH_RADIUS_CUR + 0.25, -0.4);
  roach.rotation.set(0, 0, 0);
  // At the exact moment the roach returns to start, reset wall multipliers/colors to X2
  scoreState.wallHitsThisThrow = 0;
  updateWallMultiplierAll();
  updateSkillUI();
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
  const onDown = (e) => { e.preventDefault(); if (isDragging || roachActive) return; isDragging = true; startPt = toPt(e); curPt = { ...startPt }; drawAim(startPt, curPt); setStatus('Ready: pull to launch'); };
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
  roach.position.set(0, ROACH_RADIUS_CUR + 0.25, -0.4);
  // Start scoring for this throw
  scoreState.currentThrowId++;
  scoreState.wallHitsThisThrow = 0;
  // Reset wall UI multipliers back to X2 for new throw
  updateWallMultiplierAll();
  roachVel.copy(dir).multiplyScalar(speed); roachActive = true;
  updateSkillUI();
  // Apply initial spin based on drag direction/length
  roach.rotation.order = 'YXZ';
  const side = THREE.MathUtils.clamp(-(pullX) / maxLen, -1, 1);
  const up = THREE.MathUtils.clamp(-(pullY) / maxLen, -1, 1);
  // Tune these multipliers to taste
  roachAngVel.set(
    up * 1.2,   // pitch spin
    side * 2.0, // yaw spin
    side * 1.5  // roll spin
  );
  const lookAt = new THREE.Vector3().copy(roach.position).add(roachVel); roach.lookAt(lookAt);
  setStatus('Ready: pull to launch');
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000); lastTime = t;
  if (paused) { renderer.render(scene, camera); requestAnimationFrame(loop); return; }
  // Floor LOD (disabled to keep floor color stable)
  if (false) {
    const dir = _tmpV1; camera.getWorldDirection(dir);
    const useFlat = (dir.y < -0.22);
    if (ground && ground.material !== (useFlat ? groundMatFlat : groundMatWood)) {
      ground.material = useFlat ? groundMatFlat : groundMatWood;
    }
    if (fore && fore.material !== (useFlat ? foreMatFlat : foreMatWood)) {
      fore.material = useFlat ? foreMatFlat : foreMatWood;
    }
  }
  // Animate rainbow wall colors when enabled (X >= 1024)
  if (wallRainbow) {
    const baseHue = ((t * 0.10) % 360) / 360; // faster hue cycle
    const sat = 1.0, light = 0.55;
    if (sideWallMatL && sideWallMatL.color && sideWallMatL.color.setHSL) sideWallMatL.color.setHSL(baseHue, sat, light);
    if (sideWallMatR && sideWallMatR.color && sideWallMatR.color.setHSL) sideWallMatR.color.setHSL((baseHue+0.08)%1, sat, light);
    // also tint label plates dynamically to change text color
    const applyRainbowToPlates = (arr, phaseOff=0)=>{
      for (let i=0;i<arr.length;i++){
        const m = arr[i].material; if (!m || !m.color || !m.transparent===undefined) continue;
        const h = (baseHue + phaseOff + i*0.03) % 1;
        m.color.setHSL(h, 0.95, 0.65);
        m.transparent = true; m.opacity = 0.95;
      }
    };
    if (plateLs && plateLs.length) applyRainbowToPlates(plateLs, 0.0);
    if (plateRs && plateRs.length) applyRainbowToPlates(plateRs, 0.12);
  }
  // Animate rainbow pin color if present (body + band + emissive)
  if (pins && pins.length) {
    const hue = ((t * 0.15) % 360) / 360;
    for (const p of pins) {
      if (!p || !p.userData || !p.userData.rainbow || !p.userData.meshes) continue;
      const { base, neck, head, band } = p.userData.meshes;
      const parts = [base, neck, head];
      for (const m of parts){
        if (m && m.material && m.material.color && m.material.color.setHSL) {
          m.material.color.setHSL(hue, 0.9, 0.6);
          if (m.material.emissive) {
            const l = wallRainbow ? 0.8 : 0.25;
            const tc = new THREE.Color(); tc.setHSL(hue, 1.0, 0.5);
            m.material.emissive.copy(tc); m.material.emissiveIntensity = l;
          }
        }
      }
      if (band && band.material && band.material.color && band.material.color.setHSL) {
        const bh = (hue + 0.33) % 1;
        band.material.color.setHSL(bh, 0.95, 0.55);
        if (band.material.emissive) {
          const l2 = wallRainbow ? 1.0 : 0.35;
          const tc2 = new THREE.Color(); tc2.setHSL(bh, 1.0, 0.6);
          band.material.emissive.copy(tc2); band.material.emissiveIntensity = l2;
        }
      }
    }
  }
  if (roachActive) {
    // Integrate motion
    roachVel.y -= g * dt; roach.position.addScaledVector(roachVel, dt);
    // Integrate angular velocity for free spin
    roach.rotation.x += roachAngVel.x * dt;
    roach.rotation.y += roachAngVel.y * dt;
    roach.rotation.z += roachAngVel.z * dt;
    roachAngVel.multiplyScalar(ANGULAR_DAMP);
    // Gentle alignment to velocity: pitch/roll only (weakened)
    const speedXZ = Math.hypot(roachVel.x, roachVel.z);
    const targetPitch = -Math.atan2(roachVel.y, Math.max(0.1, speedXZ));
    const targetRoll  = THREE.MathUtils.clamp(-roachVel.x * 0.12, -0.6, 0.6);
    const lerpAng = (a,b,t)=>a+(b-a)*t;
    roach.rotation.x = lerpAng(roach.rotation.x, targetPitch, 0.06);
    roach.rotation.z = lerpAng(roach.rotation.z, targetRoll, 0.05);
    // Very light yaw alignment so heading roughly follows velocity
    const desiredYaw = Math.atan2(roachVel.x, -roachVel.z);
    roach.rotation.y = lerpAng(roach.rotation.y, desiredYaw, 0.02);
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
    if (roach.position.x < -LANE_HALF + ROACH_RADIUS_CUR) {
      roach.position.x = -LANE_HALF + ROACH_RADIUS_CUR;
      {
        const jitter = 1 + (Math.random() - 0.5) * 0.10; // ±5%
        roachVel.x *= -0.93 * jitter; // slightly stronger rebound
        // small lateral/z nudge for variety
        roachVel.z += (Math.random() - 0.5) * 0.15;
      }
      scoreState.wallHitsThisThrow++; updateWallMultiplierAll();
      // add torque + camera shake on wall hit for more spin feel
      roachAngVel.y += 1.5 * Math.sign(roachVel.x);
      roachAngVel.z += 0.8 * Math.sign(roachVel.x);
      camShakeT = Math.max(camShakeT, 0.12);
      camShakeAmp = Math.min(0.12, 0.02 + Math.abs(roachVel.x) * 0.01);
    }
    if (roach.position.x >  LANE_HALF - ROACH_RADIUS_CUR) {
      roach.position.x =  LANE_HALF - ROACH_RADIUS_CUR;
      {
        const jitter = 1 + (Math.random() - 0.5) * 0.10; // ±5%
        roachVel.x *= -0.93 * jitter; // slightly stronger rebound
        roachVel.z += (Math.random() - 0.5) * 0.15;
      }
      scoreState.wallHitsThisThrow++; updateWallMultiplierAll();
      roachAngVel.y += 1.5 * Math.sign(roachVel.x);
      roachAngVel.z += 0.8 * Math.sign(roachVel.x);
      camShakeT = Math.max(camShakeT, 0.12);
      camShakeAmp = Math.min(0.12, 0.02 + Math.abs(roachVel.x) * 0.01);
    }
    for (const p of pins) {
      const dx = roach.position.x - p.position.x;
      const dz = roach.position.z - p.position.z;
      const dist2 = dx*dx + dz*dz;
      const pr = PIN_RADIUS + ROACH_RADIUS_CUR;
      const nearXZ = dist2 < pr*pr;
      // Allow slightly higher belly contacts to count
      const nearY = roach.position.y <= 0.85; // allow higher belly contacts
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
          // Belly hits (higher Y) tip a bit faster
          const bellyFactor = THREE.MathUtils.clamp((roach.position.y - 0.25) / 0.5, 0, 1);
          const tipSpeed = 2.2 + 1.3 * bellyFactor;
          p.userData.tip = { tx, tz, max, speed: tipSpeed };
          p.userData.knockedThrowId = scoreState.currentThrowId;
        }
        // Resolve penetration: push roach out and reflect velocity
        const len = Math.max(1e-4, Math.sqrt(dist2));
        const nx = dx/len, nz = dz/len; // from pin to roach
        const overlap = (PIN_RADIUS + ROACH_RADIUS_CUR) - len;
        roach.position.x += nx * overlap;
        roach.position.z += nz * overlap;
        const vdotn = roachVel.x*nx + roachVel.z*nz;
        const e = 0.7 + (Math.random()-0.5)*0.16; // 0.62..0.78
        roachVel.x = roachVel.x - (1+e)*vdotn*nx;
        roachVel.z = roachVel.z - (1+e)*vdotn*nz;
        // Transfer momentum to pin (use tuned masses)
        const bellyFactor2 = THREE.MathUtils.clamp((roach.position.y - 0.25) / 0.5, 0, 1);
        const impulseFactor = 0.8 + 0.7 * bellyFactor2; // stronger when hitting a bit higher
        const massRatio = (ROACH_MASS / PIN_MASS);
        p.userData.vel.x += -nx * vdotn * impulseFactor * massRatio;
        p.userData.vel.z += -nz * vdotn * impulseFactor * massRatio;
        // Add a bit of tangential shove to encourage tipping
        const vtx = roachVel.x - vdotn * nx;
        const vtz = roachVel.z - vdotn * nz;
        const tangentialKick = (0.34 + (Math.random()-0.5)*0.10) * bellyFactor2 * massRatio;
        // camera shake intensity based on impact strength
        camShakeT = Math.max(camShakeT, 0.15);
        camShakeAmp = Math.min(0.14, 0.02 + Math.abs(vdotn) * 0.02);
        p.userData.vel.x += -vtx * tangentialKick;
        p.userData.vel.z += -vtz * tangentialKick;
      }
    }
    // (moved) Pin-pin collisions handled below every frame for continuous interaction
    const minY = ROACH_RADIUS_CUR + 0.02; if (roach.position.y <= minY) { roach.position.y = minY; roachActive = false; setStatus('Ready: pull to launch'); }
    const d = roach.position.distanceTo(target.position); if (d < TARGET_RADIUS + ROACH_RADIUS_CUR * 0.75) { flashTarget(); randomizeTarget(); resetRoach(); setStatus('Ready: pull to launch'); }
  }
  // Apply camera shake to camera target/position
  const camTarget = _tmpV1; const camPos = _tmpV2;
  if (roachActive) { const v = _tmpV3.copy(roachVel); if (v.lengthSq() < 0.001) v.set(0, 0, -1); v.normalize(); const behind = _tmpV4.copy(v).multiplyScalar(-4.5); behind.y += 2.0; camPos.copy(roach.position).add(behind); camTarget.copy(roach.position).addScaledVector(v, 1.5); }
  else {
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
    const toT = _tmpV3.copy(pinAimPoint).sub(roach.position); toT.y = 0; if (toT.lengthSq() < 1e-4) toT.set(0,0,-1); toT.normalize(); const back = _tmpV4.copy(toT).multiplyScalar(-4.2); camPos.copy(roach.position).add(back); camPos.y = Math.max(roach.position.y + 1.8, 2.0); camTarget.copy(roach.position).addScaledVector(toT, 2.0); camTarget.y = Math.min(roach.position.y + 0.9, camPos.y - 0.8);
  }
  if (camShakeT > 0) {
    const s = camShakeAmp * (camShakeT / 0.15);
    const tt = t * 0.06;
    camPos.x += (Math.sin(tt*850.0) + Math.cos(tt*1130.0)) * 0.5 * s;
    camPos.y += Math.sin(tt*960.0) * 0.3 * s;
    camTarget.x += Math.sin(tt*720.0) * 0.3 * s;
    camShakeT = Math.max(0, camShakeT - dt);
    camShakeAmp *= 0.92;
  }
  // (moved) finalize and render happen after pin-pin and pin updates below
  // Pin-pin collisions: broadphase grid for performance + low iteration
  const CELL = 0.6;
  for (let it=0; it<1; it++) {
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
              const e = 0.6 + (Math.random()-0.5)*0.10; // restitution with slight randomness
                const m1 = PIN_MASS, m2 = PIN_MASS;
                const jimp = -(1 + e) * relVelDotN / (1/m1 + 1/m2);
                a.userData.vel.x -= (jimp * nx) / m1;
                a.userData.vel.z -= (jimp * nz) / m1;
                b.userData.vel.x += (jimp * nx) / m2;
                b.userData.vel.z += (jimp * nz) / m2;
                // tipping: impact strong enough knocks one or both down
                const impactSpeed = -relVelDotN;
                const TIP_THRESHOLD = 0.55;
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
  // Now that physics settled, finalize throw if we just stopped
  if (!roachActive && prevActive && !resetTimer) {
    pendingFinalize = true;
    resetTimer = setTimeout(() => { 
      if (pendingFinalize) { finalizeThrow(); pendingFinalize = false; }
      if (pendingPinsReset) { placePins(); pendingPinsReset = false; }
      resetRoach(); 
      resetTimer = null; 
    }, 1500);
  }
  // Finish camera update, render and schedule next frame
  if (camPos.y < camTarget.y + 0.6) camPos.y = camTarget.y + 0.6;
  camera.position.lerp(camPos, 0.12); camera.lookAt(camTarget);
  renderer.render(scene, camera);
  prevActive = roachActive;
  requestAnimationFrame(loop);
}

function finalizeThrow(){
  if (scoreState.gameOver) return;
  const fIdx = scoreState.frame - 1; const tIdx = scoreState.throwInFrame - 1;
  // count pins knocked this throw
  let knocked = 0;
  let baseSum = 0;
  for (const p of pins) {
    if (p.userData.knockedThrowId === scoreState.currentThrowId) {
      knocked++;
      let b = 1;
      if (p.userData.red) b = 5;
      if (p.userData.rainbow) b = 50;
      baseSum += b;
    }
  }
  const hits = scoreState.wallHitsThisThrow;
  // Apply wall multiplier to baseSum
  const points = baseSum * Math.pow(2, hits);
  const frame = scoreState.frames[fIdx];
  frame.throws[tIdx] = points; frame.pins[tIdx] = knocked; frame.wallHits[tIdx] = hits;
  // advance throw/frame
  scoreState.throwInFrame++;
  if (scoreState.throwInFrame > 2) {
    frame.score = (frame.throws[0]||0) + (frame.throws[1]||0);
    scoreState.total += frame.score;
    scoreState.throwInFrame = 1; scoreState.frame++;
    // Skill remains used for the entire game (no reset here)
    pendingPinsReset = true; // defer pin reset until roach resets to origin
    if (scoreState.frame > 3) { updateScoreUI(); showGameOver(); return; }
  }
  updateScoreUI();
}

function flashTarget() { const orig = target.material.color.clone(); target.material.color.set(0xffe370); setTimeout(() => target.material.color.copy(orig), 150); }

init();

// Normalize any garbled Korean UI text at runtime (UTF-8)
(function normalizeKoreanUI(){
  try {
    // Document title
    if (typeof document !== 'undefined') {
      document.title = '바퀴벌레 볼링';
    }
    // HUD status/hint
    const status = document.getElementById('status');
    if (status && /[�]/.test(status.textContent || '')) status.textContent = '로딩 중...';
    const hint = document.getElementById('hint');
    if (hint && /[�]/.test(hint.textContent || '')) hint.textContent = '화면을 끌어 조준, 손을 떼면 발사';
    // Reset button label
    const resetBtn = document.getElementById('resetPinsBtn');
    if (resetBtn && /[�?]/.test((resetBtn.textContent||''))) resetBtn.textContent = '핀 리셋';
  } catch (e) { /* no-op */ }
})();

// Patch dynamic UI (pause/gameover/scoreboard) texts when those elements appear
(function observeAndFixDynamicText(){
  if (typeof MutationObserver === 'undefined') return;
  const fixNode = (node)=>{
    if (!(node && node.nodeType === 1)) return;
    // Pause overlay title/buttons
    if (node.textContent && /[�]/.test(node.textContent)) {
      node.textContent = node.textContent
        .replace(/���� ����!/g, '일시 정지!')
        .replace(/��� ����/g, '계속')
        .replace(/�ٽ� ����/g, '다시 시작')
        .replace(/������ /g, '프레임 ')
        .replace(/�� ���� /g, ' · 투구 ')
        .replace(/�� ���� /g, ' · 총점 ')
        .replace(/����: /g, '총점: ')
        .replace(/���� ����!/g, '게임 종료!');
    }
  };
  const obs = new MutationObserver((muts)=>{
    for (const m of muts) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(fixNode);
      } else if (m.type === 'characterData' && m.target && m.target.parentElement) {
        fixNode(m.target.parentElement);
      }
    }
  });
  try { obs.observe(document.body, { childList: true, characterData: true, subtree: true }); } catch {}
})();

// Enhance pause overlay to include "메뉴로 돌아가기"
(function enhancePauseOverlay(){
  if (typeof ensurePauseOverlay !== 'function') return;
  const __orig = ensurePauseOverlay;
  ensurePauseOverlay = function(){
    __orig();
    try {
      if (!pauseOverlayEl) return;
      // Fix labels if garbled
      const title = pauseOverlayEl.querySelector('div');
      if (title && /[�]/.test(title.textContent||'')) title.textContent = '일시 정지!';
      // Add menu button if missing
      const hasMenu = pauseOverlayEl.querySelector('#btnMenuBack');
      if (!hasMenu){
        const row = pauseOverlayEl.querySelector('div div, div > div');
        const btn = document.createElement('button'); btn.id = 'btnMenuBack'; btn.textContent = '메뉴로 돌아가기';
        Object.assign(btn.style, { padding:'10px 16px', borderRadius:'10px', border:'none', background:'#374151', color:'#fff', fontWeight:'800', cursor:'pointer' });
        btn.onclick = ()=>{ location.href = 'index.html'; };
        if (row && row.append) row.append(btn);
      }
    } catch {}
  };
})();

// Override game over screen to support nickname save and menu back
(function overrideGameOver(){
  if (typeof showGameOver !== 'function') return;
  const __orig = showGameOver;
  showGameOver = function(){
    __orig();
    try {
      if (!gameOverEl) return;
      // Replace title/score labels
      const nodes = Array.from(gameOverEl.children||[]);
      if (nodes[0]) nodes[0].textContent = '게임 종료!';
      if (nodes[1]) nodes[1].textContent = '총점: ' + scoreState.total;
      // Insert form and buttons if not present
      if (!gameOverEl.querySelector('#nicknameInput')){
        const form = document.createElement('div'); Object.assign(form.style, { display:'flex', gap:'8px', alignItems:'center', marginTop:'4px' });
        const input = document.createElement('input'); input.id='nicknameInput'; Object.assign(input, { placeholder:'닉네임(최대 20자)', maxLength:20 }); Object.assign(input.style, { padding:'8px 10px', borderRadius:'8px', border:'1px solid #374151', outline:'none' });
        const btnSave = document.createElement('button'); btnSave.id='btnSaveScore'; btnSave.textContent = '점수 저장'; Object.assign(btnSave.style, { padding:'8px 12px', border:'none', borderRadius:'8px', background:'#16a34a', color:'#fff', fontWeight:'800', cursor:'pointer' });
        form.append(input, btnSave);
        const btnMenu = document.createElement('button'); btnMenu.textContent = '메뉴로 돌아가기'; Object.assign(btnMenu.style, { padding:'8px 12px', border:'none', borderRadius:'8px', background:'#374151', color:'#fff', fontWeight:'800', cursor:'pointer' });
        btnMenu.onclick = ()=>{ location.href = 'index.html'; };
        gameOverEl.appendChild(form);
        gameOverEl.appendChild(btnMenu);
        btnSave.onclick = async ()=>{
          const nickname = String(input.value||'').trim();
          if (!nickname) { alert('닉네임을 입력해주세요.'); input.focus(); return; }
          if (nickname.length > 20) { alert('닉네임은 최대 20자입니다.'); return; }
          const clean = nickname.replace(/[\u0000-\u001F\u007F]+/g, '').slice(0,20);
          const ENV = (window.ENV||{}); const url = ENV.SUPABASE_URL; const key = ENV.SUPABASE_ANON_KEY;
          if (!url || !key) { alert('환경변수(Supabase)가 설정되지 않았습니다.'); return; }
          btnSave.disabled = true; btnSave.textContent = '저장 중...';
          try {
            const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
            const body = JSON.stringify({ nickname: clean, score: scoreState.total });
            const r = await fetch(url + '/rest/v1/scores', { method:'POST', headers, body });
            if (!r.ok) throw new Error('save failed');
            btnSave.textContent = '저장 완료';
          } catch(e) {
            alert('저장에 실패했습니다. 나중에 다시 시도해주세요.');
            btnSave.disabled = false; btnSave.textContent = '점수 저장';
          }
        };
      }
    } catch {}
  };
})();

// Fetch Top3 for 3D ranking board after it appears
(function update3DRankingBoard(){
  const ENV = (window.ENV||{}); const url = ENV.SUPABASE_URL; const key = ENV.SUPABASE_ANON_KEY;
  if (!url || !key) return;
  async function tryUpdate(){
    if (!rankingBoard || !rankingBoard.material) { requestAnimationFrame(tryUpdate); return; }
    try {
      const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key };
      const endpoint = url + '/rest/v1/scores?select=nickname,score&order=score.desc&limit=3';
      const r = await fetch(endpoint, { headers });
      const rows = await r.json();
      // cache Top3 for later use across rounds
      try { rankingTop3Cache = Array.isArray(rows) ? rows.slice(0,3).map(it=>({ ...it })) : []; } catch {}
      // Truncate nickname to 4 characters with ellipsis for billboard
      try {
        if (Array.isArray(rows)) {
          for (const it of rows) {
            if (it && it.nickname) {
              const gp = Array.from(String(it.nickname));
              if (gp.length > 4) it.nickname = gp.slice(0,4).join('') + '...';
            }
          }
        }
      } catch {}
      // draw onto a canvas and set as texture
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 12; ctx.strokeRect(6,6,canvas.width-12,canvas.height-12);
      ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 72px system-ui, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText('전체 랭킹 TOP3', canvas.width/2, 28);
      ctx.font = 'bold 56px system-ui, sans-serif';
      const startY = 140; const stepY = 110;
      (rows||[]).forEach((r,i)=>{
        const y = startY + i*stepY;
        ctx.fillStyle = '#93c5fd'; ctx.textAlign='left'; ctx.fillText(String(i+1)+'등', 140, y);
        ctx.fillStyle = '#e5e7eb'; ctx.fillText(r.nickname || '-', 300, y);
        ctx.fillStyle = '#fbbf24'; ctx.textAlign='right'; ctx.fillText(String(r.score ?? '-'), canvas.width-140, y);
      });
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.minFilter = THREE.LinearFilter;
      rankingBoard.material.map = tex; rankingBoard.material.needsUpdate = true;
    } catch(e) {}
  }
  tryUpdate();
})();













