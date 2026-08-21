// Shared hike viewer. Reads globals from the page: TRACKS, TOTAL, PHOTOS, PROFILE,
// LABELS, CONFIG.

const LINE_COLOR = '#8b0000';      // solid dark red
const LINE_WEIGHT = 4;
const DIM_OPACITY = 0.3;

// Elevation-profile slope colouring (grade = rise / run).
function slopeColor(grade, dim) {
  if (dim) return 'rgba(255,255,255,0.2)';
  if (grade > 0.30) return '#8b0000'; // >30%: dark red
  if (grade > 0.20) return '#e53935'; // 20-30%: red
  if (grade > 0.10) return '#fb8c00'; // 10-20%: orange
  if (grade > 0)    return '#ffb300'; // 0-10%: yellow
  return '#4caf50';                   // downhill / flat: green
}

// ---- Map ----
const map = L.map('map', { zoomControl: false }).setView([0, 0], 2);  // placeholder; fitBounds overrides on load
L.control.zoom({ position: 'topright' }).addTo(map);
const tileTerrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17, attribution: '&copy; OpenTopoMap'
});
const tileSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: '&copy; Esri'
});
let satellite = false;
tileTerrain.addTo(map);
function setTilePaneFilter() {
  // terrain is faded so the tracks stand out; satellite shown at full opacity
  map.getPane('tilePane').style.filter = satellite ? 'brightness(1) opacity(1)' : 'brightness(1) opacity(0.6)';
}
setTilePaneFilter();

// ---- Map control icons ----
const ICON_EXPAND = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
const ICON_COMPRESS = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>';
const ICON_TERRAIN = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 6l-4.22 5.63 1.25 1.67L14 9.33 19 16h-8.46l-4.01-5.37L1 18h22L14 6z"/></svg>';
const ICON_SATELLITE = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
const ICON_IMAGE = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
const ICON_LABEL = '<span class="ctrl-text">Aa</span>';
let mapFull = false;
let photosVisible = false;
let labelsVisible = true;
let fullBtnLink = null, layerBtnLink = null, labelBtnLink = null, photoBtnLink = null;
function setMapFull(on) {
  mapFull = on;
  fullBtnLink.innerHTML = on ? ICON_COMPRESS : ICON_EXPAND;
  fullBtnLink.title = on ? 'Exit full screen' : 'Full screen';
  updateLayout();
  drawElevationChart();
}
function setSatellite(on) {
  satellite = on;
  if (on) { map.removeLayer(tileTerrain); tileSatellite.addTo(map); }
  else { map.removeLayer(tileSatellite); tileTerrain.addTo(map); }
  setTilePaneFilter();
  layerBtnLink.innerHTML = on ? ICON_TERRAIN : ICON_SATELLITE;
  layerBtnLink.title = on ? 'Terrain' : 'Satellite';
}

// ---- Photo thumbnails + lightbox ----
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
function openLightbox(file) {
  lightboxImg.src = file;
  lightbox.classList.add('open');
}
function closeLightbox() {
  lightbox.classList.remove('open');
  lightboxImg.src = '';
}
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});

const photoMarkers = PHOTOS.map(ph => {
  const icon = L.divIcon({
    className: 'photo-marker',
    html: '<img src="' + ph.file + '" alt="">',
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
  return L.marker([ph.lat, ph.lon], { icon, zIndexOffset: 1000 }).on('click', () => openLightbox(ph.file));
});
function setPhotos(on) {
  photosVisible = on;
  photoMarkers.forEach(m => { if (on) m.addTo(map); else map.removeLayer(m); });
  photoBtnLink.classList.toggle('off', !on);
  photoBtnLink.title = on ? 'Hide photos' : 'Show photos';
}
function setLabels(on) {
  labelsVisible = on;
  labelBtnLink.classList.toggle('off', !on);
  labelBtnLink.title = on ? 'Hide labels' : 'Show labels';
  applyLabels(selectedIdx);
}

// ---- Map labels ----
// Each label is pinned to a coordinate; `align` names the side of that point the plate
// sits on ('center' covers it). The marker itself is zero-sized and Leaflet drives its
// transform, so the offset lives on an inner span that CSS shifts by its own size.
// An optional `icon` ('peak') adds a second span drawn on the point itself.
const labelMarkers = LABELS.map(l => L.marker([l.lat, l.lon], {
  icon: L.divIcon({
    className: '',
    html: (l.icon ? '<span class="map-icon map-icon-' + l.icon + '"></span>' : '') +
          '<span class="map-label align-' + (l.align || 'center') + '">' + l.text + '</span>',
    iconSize: [0, 0], iconAnchor: [0, 0],
  }),
  interactive: false,   // never swallow clicks meant for the track underneath
  zIndexOffset: 500,
}));
// Visible when the labels toggle is on and either nothing is selected, or the selected
// track is one of the label's own.
function applyLabels(idx) {
  labelMarkers.forEach((m, i) => {
    const show = labelsVisible && (idx == null || (LABELS[i].indices || []).indexOf(idx) >= 0);
    if (show) m.addTo(map); else map.removeLayer(m);
  });
}
applyLabels(null);   // not setLabels(): the button and selectedIdx do not exist yet

// ---- Controls (bottom-left): fullscreen + terrain/satellite + photos ----
function makeCtrlBtn(parent, icon, title, handler) {
  const bar = L.DomUtil.create('div', 'leaflet-bar map-fs-btn', parent);
  const a = L.DomUtil.create('a', '', bar);
  a.href = '#';
  a.title = title;
  a.innerHTML = icon;
  L.DomEvent.on(a, 'click', L.DomEvent.stop);
  L.DomEvent.on(a, 'click', handler);
  return a;
}
const mapControls = L.control({ position: 'bottomleft' });
mapControls.onAdd = function () {
  const wrap = L.DomUtil.create('div', 'map-ctrls');
  fullBtnLink = makeCtrlBtn(wrap, ICON_EXPAND, 'Full screen', () => setMapFull(!mapFull));
  layerBtnLink = makeCtrlBtn(wrap, ICON_SATELLITE, 'Satellite', () => setSatellite(!satellite));
  labelBtnLink = makeCtrlBtn(wrap, ICON_LABEL, 'Hide labels', () => setLabels(!labelsVisible));
  photoBtnLink = makeCtrlBtn(wrap, ICON_IMAGE, 'Hide photos', () => setPhotos(!photosVisible));
  return wrap;
};
mapControls.addTo(map);
setPhotos(photosVisible);   // hidden by default

const overlayEl = document.getElementById('overlay');
const tracksPanel = document.getElementById('tracks-panel');
const elevationCanvas = document.getElementById('elevation-canvas');

// ---- Render tracks ----
const trackLayers = [];   // one polyline per track
let profileHighlight = null;   // index of the highlighted track (persists across redraws)
const allBounds = L.latLngBounds();

// ---- Track selection (shared by the table rows and by clicking on the map) ----
// Selecting a track dims all others on the map, shows only its start/end markers,
// emphasises it in the elevation profile, and highlights its table row. Selecting
// the already-selected track deselects it.
let selectedIdx = null;
function applyHighlight(idx) {
  profileHighlight = idx;
  trackLayers.forEach((l, j) => l.setStyle({ opacity: (idx == null || j === idx) ? 1 : DIM_OPACITY }));
  // Show all start/end markers when nothing is selected; otherwise only the
  // selected track's own start and end markers.
  TRACKS.forEach((t, j) => {
    const show = (idx == null) || (j === idx);
    [t._markerStart, t._markerEnd].forEach(m => {
      if (!m) return;
      if (show) m.addTo(map); else map.removeLayer(m);
    });
  });
  applyLabels(idx);
  drawElevationChart();
  tracksPanel.querySelectorAll('tr[data-track-idx]').forEach(r => {
    r.classList.toggle('selected', parseInt(r.dataset.trackIdx) === idx);
  });
}
function selectTrack(i) {
  selectedIdx = (selectedIdx === i) ? null : i;
  applyHighlight(selectedIdx);
}

TRACKS.forEach((t, idx) => {
  const latlngs = t.points.map(p => [p[0], p[1]]);
  const line = L.polyline(latlngs, { color: LINE_COLOR, weight: LINE_WEIGHT, opacity: 1 }).addTo(map);
  line.on('click', () => selectTrack(idx));   // click anywhere on the track to select it
  trackLayers.push(line);
  allBounds.extend(line.getBounds());

  const startIcon = L.divIcon({ className: '', html: '<div style="width:10px;height:10px;background:#00c853;border:1px solid #fff;border-radius:50%;"></div>', iconSize: [10,10], iconAnchor: [5,5] });
  const endIcon = L.divIcon({ className: '', html: '<div style="width:10px;height:10px;background:#e94560;border:1px solid #fff;border-radius:50%;"></div>', iconSize: [10,10], iconAnchor: [5,5] });
  t._markerStart = L.marker(latlngs[0], { icon: startIcon })
    .on('click', () => selectTrack(idx)).addTo(map);
  t._markerEnd = L.marker(latlngs[latlngs.length - 1], { icon: endIcon })
    .on('click', () => selectTrack(idx)).addTo(map);
});

// Continuous trek: every interior junction marker is yellow.
const midIcon = L.divIcon({ className: '', html: '<div style="width:10px;height:10px;background:#ffd600;border:1px solid #fff;border-radius:50%;"></div>', iconSize: [10,10], iconAnchor: [5,5] });
for (let i = 0; i < TRACKS.length - 1; i++) {
  TRACKS[i]._markerEnd.setIcon(midIcon);
  TRACKS[i + 1]._markerStart.setIcon(midIcon);
}

// Discontinuities in the journey: dashed light-red line from a track's end to the next track's start.
const FILL_GAP_WITH_DASH = CONFIG.fillGapWithDash || [];
FILL_GAP_WITH_DASH.forEach(i => {
  const a = TRACKS[i].points[TRACKS[i].points.length - 1];
  const b = TRACKS[i + 1].points[0];
  L.polyline([[a[0], a[1]], [b[0], b[1]]], { color: '#ff6b6b', weight: 3, opacity: 0.9, dashArray: '6 8' }).addTo(map);
});

// ---- Table ----
function buildTable() {
  let html = '<table id="tracks-table"><thead><tr>' +
    '<th>Day</th><th>Name</th><th>Dist</th><th>Gain</th><th>Elapsed</th><th>Moving</th>' +
    '<th>Min</th><th>Max</th>' +
    '</tr></thead><tbody>';
  let prevDay = null;
  TRACKS.forEach((t, idx) => {
    const isNewDay = t.day !== prevDay;
    const dayCell = isNewDay ? t.day : '';
    prevDay = t.day;
    const cls = (isNewDay && idx > 0) ? ' class="day-start"' : '';
    html += `<tr data-track-idx="${idx}"${cls}><td>${dayCell}</td><td>${t.name}</td>` +
      `<td>${t.dist}</td><td>${t.gain}</td><td>${t.elapsed}</td><td>${t.moving}</td>` +
      `<td>${t.minEle}</td><td>${t.maxEle}</td></tr>`;
  });
  html += `<tr class="total-row"><td></td><td>Total</td>` +
    `<td>${TOTAL.dist}</td><td>${TOTAL.gain}</td><td>${TOTAL.elapsed}</td><td>${TOTAL.moving}</td>` +
    `<td>${TOTAL.minEle}</td><td>${TOTAL.maxEle}</td></tr>`;
  html += '</tbody></table>';
  tracksPanel.innerHTML = html;

  // Click/tap a row to select it (same as clicking the track on the map): dim all
  // others + emphasise it in the profile. Click the selected row again to deselect.
  tracksPanel.querySelectorAll('tr[data-track-idx]').forEach(row => {
    const i = parseInt(row.dataset.trackIdx);
    row.addEventListener('click', () => selectTrack(i));
  });
}
buildTable();

// ---- Elevation profile (pre-computed at generation time — no runtime sampling) ----
const elevSegments = PROFILE;

// ---- Hover readout ----
// Distances everywhere below are true metres walked, measured on the full-resolution
// GPX track at generation time: PROFILE[i].distances for the chart, points[i][3] for the map.
// Neither is re-measured from the decimated polyline, which cuts corners and would
// under-read by ~10%.
const HOVER_COLOR = '#2196f3';
const segLayout = [];   // {x0, w, maxD} per segment in CSS px, refreshed on every draw
let hover = null;       // {x, ele, dist} while the pointer is over the chart
let hoverMarker = null; // blue dot on the map at the matching point

// Distance at which each track starts, so the readout counts from the trek's start.
const trackStartDist = [];
let trekDist = 0;
elevSegments.forEach(seg => {
  trackStartDist.push(trekDist);
  trekDist += seg.distances[seg.distances.length - 1];
});

const hoverIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:' + HOVER_COLOR +
        ';border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,.6);"></div>',
  iconSize: [12, 12], iconAnchor: [6, 6],
});
function setHoverMarker(latlng) {
  if (!latlng) {
    if (hoverMarker) { map.removeLayer(hoverMarker); hoverMarker = null; }
    return;
  }
  if (hoverMarker) hoverMarker.setLatLng(latlng);
  else hoverMarker = L.marker(latlng, { icon: hoverIcon, interactive: false, zIndexOffset: 2000 }).addTo(map);
}

// Index of the last entry <= v, assuming `at` reads an ascending key.
function bracket(arr, v, at) {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(arr[mid]) <= v) lo = mid; else hi = mid;
  }
  return lo;
}
// Clamped so the sub-metre rounding difference between the profile distances (0.1 m)
// and the per-point ones (1 m) can never extrapolate past either end of a track.
function frac(d, a, b) {
  const span = b - a;
  return span > 0 ? Math.max(0, Math.min(1, (d - a) / span)) : 0;
}
function lerpElevation(seg, d) {
  if (seg.distances.length < 2) return seg.elevations[0];
  const i = bracket(seg.distances, d, x => x);
  const f = frac(d, seg.distances[i], seg.distances[i + 1]);
  return seg.elevations[i] + (seg.elevations[i + 1] - seg.elevations[i]) * f;
}
// Walk the rendered polyline by its stored true distance to find the map position.
function pointAtDistance(pts, d) {
  if (pts.length < 2) return [pts[0][0], pts[0][1]];
  const i = bracket(pts, d, p => p[3]);
  const f = frac(d, pts[i][3], pts[i + 1][3]);
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
}

function updateHover(x) {
  if (!segLayout.length) return;
  const last = segLayout[segLayout.length - 1];
  x = Math.max(0, Math.min(last.x0 + last.w, x));
  let i = segLayout.findIndex(s => x < s.x0 + s.w);
  if (i < 0) i = segLayout.length - 1;
  const s = segLayout[i];
  const d = s.w > 0 ? Math.max(0, Math.min(s.maxD, ((x - s.x0) / s.w) * s.maxD)) : 0;
  hover = { x, ele: lerpElevation(elevSegments[i], d), dist: trackStartDist[i] + d };
  setHoverMarker(pointAtDistance(TRACKS[i].points, d));
  drawElevationChart();
}
function clearHover() {
  if (!hover) return;
  hover = null;
  setHoverMarker(null);
  drawElevationChart();
}

// Vertical line at the cursor, plus a dot and a label on the profile itself.
function drawHoverReadout(ctx, W, H, minE, maxE) {
  if (!hover) return;
  const y = H - ((hover.ele - minE) / (maxE - minE)) * H;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(hover.x) + 0.5, 0);
  ctx.lineTo(Math.round(hover.x) + 0.5, H);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(hover.x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = HOVER_COLOR;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Two-line readout: distance travelled on top, altitude below. The arrows are drawn
  // in their own column so both values line up despite the glyphs differing in width.
  const distTxt = (hover.dist / 1000).toFixed(2) + ' km';
  const eleTxt = Math.round(hover.ele) + ' m';
  ctx.font = '11px sans-serif';
  const padX = 6, padY = 4, lineH = 13, gap = 4;
  const arrowW = Math.max(ctx.measureText('→').width, ctx.measureText('↑').width);
  const textX = padX + arrowW + gap;
  const boxW = textX + Math.max(ctx.measureText(distTxt).width, ctx.measureText(eleTxt).width) + padX;
  const boxH = lineH * 2 + padY * 2;
  let bx = hover.x + 10;
  if (bx + boxW > W) bx = hover.x - 10 - boxW;
  bx = Math.max(0, Math.min(W - boxW, bx));
  let by = y - boxH - 5;
  if (by < 0) by = y + 5;
  by = Math.max(0, Math.min(H - boxH, by));
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  const yTop = by + padY + lineH / 2, yBottom = by + padY + lineH * 1.5;
  ctx.fillText('→', bx + padX, yTop);
  ctx.fillText(distTxt, bx + textX, yTop);
  ctx.fillText('↑', bx + padX, yBottom);
  ctx.fillText(eleTxt, bx + textX, yBottom);
  ctx.restore();
}

function drawElevationChart() {
  const ctx = elevationCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = elevationCanvas.getBoundingClientRect();
  elevationCanvas.width = rect.width * dpr;
  elevationCanvas.height = rect.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  let globalMinE = Infinity, globalMaxE = -Infinity;
  elevSegments.forEach(seg => seg.elevations.forEach(e => {
    if (e < globalMinE) globalMinE = e;
    if (e > globalMaxE) globalMaxE = e;
  }));
  const minE = globalMinE - 20, maxE = globalMaxE + 20;

  let totalSegDist = 0;
  elevSegments.forEach(seg => { totalSegDist += seg.distances[seg.distances.length - 1]; });
  const numGaps = elevSegments.length > 1 ? elevSegments.length - 1 : 0;
  const gapPx = 0;
  const usableW = W - numGaps * gapPx;

  ctx.clearRect(0, 0, W, H);
  let cumPxOffset = 0;
  segLayout.length = 0;
  elevSegments.forEach((seg, segIdx) => {
    const dim = profileHighlight != null && segIdx !== profileHighlight;
    const segMaxD = seg.distances[seg.distances.length - 1];
    const segW = totalSegDist > 0 ? (segMaxD / totalSegDist) * usableW : 0;
    segLayout.push({ x0: cumPxOffset, w: segW, maxD: segMaxD });
    const coords = seg.elevations.map((ev, i) => ({
      x: cumPxOffset + (segMaxD > 0 ? (seg.distances[i] / segMaxD) * segW : 0),
      y: H - ((ev - minE) / (maxE - minE)) * H,
    }));

    // area under the profile (unchanged white gradient)
    ctx.beginPath();
    ctx.moveTo(cumPxOffset, H);
    coords.forEach(c => ctx.lineTo(c.x, c.y));
    ctx.lineTo(cumPxOffset + segW, H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, dim ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, dim ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)');
    ctx.fillStyle = grad;
    ctx.fill();

    // slope-coloured line on top
    for (let i = 0; i < coords.length - 1; i++) {
      const rise = seg.elevations[i + 1] - seg.elevations[i];
      const run = seg.distances[i + 1] - seg.distances[i];
      ctx.beginPath();
      ctx.moveTo(coords[i].x, coords[i].y);
      ctx.lineTo(coords[i + 1].x, coords[i + 1].y);
      ctx.strokeStyle = slopeColor(run > 0 ? rise / run : 0, dim);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    cumPxOffset += segW + gapPx;
  });

  // Elevation gridlines (0–8000) that fall within the visible range; the vertical
  // spacing is set per-hike via CONFIG.elevationGridStep (metres), default 1000.
  const gridStep = CONFIG.elevationGridStep || 1000;
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';
  for (let el = 0; el <= 8000; el += gridStep) {
    if (el < minE || el > maxE) continue;
    const y = H - ((el - minE) / (maxE - minE)) * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(el + ' m', 4, Math.max(10, y - 3));
  }

  drawHoverReadout(ctx, W, H, minE, maxE);
}

// Pointer events cover mouse and touch-drag alike.
elevationCanvas.addEventListener('pointermove', (e) => {
  updateHover(e.clientX - elevationCanvas.getBoundingClientRect().left);
});
elevationCanvas.addEventListener('pointerleave', clearHover);
elevationCanvas.addEventListener('pointercancel', clearHover);

// ---- Layout: table fills the right; map takes the remaining space (not behind
//      the table or the elevation chart) ----
const mapEl = document.getElementById('map');
const mobileMQ = window.matchMedia('(max-width: 600px)');
function updateLayout() {
  if (mapFull) {
    document.body.classList.add('map-full');
    mapEl.style.top = mapEl.style.left = mapEl.style.right = mapEl.style.bottom = '';
    map.invalidateSize();
    return;
  }
  document.body.classList.remove('map-full');
  if (mobileMQ.matches) {
    // Mobile: stacked flow — clear desktop inline insets and let CSS size things.
    mapEl.style.top = mapEl.style.left = mapEl.style.right = mapEl.style.bottom = '';
    tracksPanel.style.top = tracksPanel.style.height = '';
    map.invalidateSize();
    return;
  }
  const overlayH = overlayEl.offsetHeight;
  tracksPanel.style.top = '0px';
  tracksPanel.style.height = (window.innerHeight - overlayH) + 'px';
  const panelW = tracksPanel.offsetWidth;
  mapEl.style.top = '0px';
  mapEl.style.left = panelW + 'px';
  mapEl.style.right = '0px';
  mapEl.style.bottom = overlayH + 'px';
  map.invalidateSize();
}

updateLayout();
map.fitBounds(allBounds, { padding: [30, 30] });
drawElevationChart();
window.addEventListener('resize', () => {
  clearHover();   // the cursor position no longer maps to the same point
  updateLayout();
  drawElevationChart();
});
