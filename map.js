/* ── Config ───────────────────────────────────────────────────── */
const SUPABASE_URL      = 'https://vhithoextflcsconcjnz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoaXRob2V4dGZsY3Njb25jam56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTY1MTgsImV4cCI6MjA5NTI3MjUxOH0.gxI3PqG2QsFRBNVgVjrZkrJ12gK8oiYbrsD5yi0hZ18';

const CATEGORY_EMOJI = {
  Restaurant:  '🍽',
  Bar:         '🍸',
  Coffee:      '☕',
  Hotel:       '🏨',
  Experience:  '⭐',
  Other:       '📍',
};

/* ── State ────────────────────────────────────────────────────── */
let map, markerCluster;
let supabaseClient;
let allPlaces   = [];
let markers     = {};       // id → { marker, place }
let isAdmin     = false;
let adminPw     = '';
let activeFilter = 'all';
let searchQuery  = '';
let currentPlace = null;    // place currently shown in sidebar
let pendingEditId = null;   // id when editing an existing place
let lightboxImages = [];
let lightboxIdx    = 0;
let placingMode    = false;

/* ── Boot ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  initNav();
  initMap();
  checkAdminSession();
  loadPlaces();
  bindControls();
  bindSidebar();
  bindModal();
  bindPwModal();
  bindDelModal();
  bindLightbox();
});

/* ── Nav (mobile toggle) ──────────────────────────────────────── */
function initNav() {
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => links.classList.remove('open'))
  );
}

/* ── Map ──────────────────────────────────────────────────────── */
function initMap() {
  map = L.map('map', {
    center: [39.5, -98.35],
    zoom: 4,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(map);

  markerCluster = L.markerClusterGroup({
    iconCreateFunction: cluster => L.divIcon({
      html: `<div class="cluster-icon">${cluster.getChildCount()}</div>`,
      className: 'cluster-wrapper',
      iconSize: [40, 40],
    }),
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 55,
    animate: true,
  });
  map.addLayer(markerCluster);

  map.on('click', onMapClick);
}

function createMarkerIcon(category) {
  const emoji = CATEGORY_EMOJI[category] || '📍';
  return L.divIcon({
    html: `<div class="map-pin"><span class="pin-emoji">${emoji}</span></div>`,
    className: 'pin-wrapper',
    iconSize: [38, 44],
    iconAnchor: [19, 44],
    popupAnchor: [0, -46],
  });
}

/* ── Load places ──────────────────────────────────────────────── */
async function loadPlaces() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/places?select=*&order=created_at.desc`,
      {
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allPlaces = await res.json();
    renderMarkers();
  } catch (err) {
    console.error('Failed to load places:', err);
    showToast('Could not load places.', 'error');
  }
}

function renderMarkers() {
  markerCluster.clearLayers();
  markers = {};

  const visible = filteredPlaces();
  visible.forEach(place => addMarker(place));
}

function addMarker(place) {
  const marker = L.marker([place.lat, place.lng], {
    icon: createMarkerIcon(place.category),
    title: place.name,
  });
  marker.on('click', e => {
    L.DomEvent.stopPropagation(e);
    openSidebar(place);
  });
  markers[place.id] = { marker, place };
  markerCluster.addLayer(marker);
}

function removeMarker(id) {
  if (markers[id]) {
    markerCluster.removeLayer(markers[id].marker);
    delete markers[id];
  }
}

function filteredPlaces() {
  const q = searchQuery.trim().toLowerCase();
  return allPlaces.filter(p => {
    const catOk = activeFilter === 'all' || p.category === activeFilter;
    const searchOk = !q ||
      (p.name  && p.name.toLowerCase().includes(q)) ||
      (p.city  && p.city.toLowerCase().includes(q)) ||
      (p.state && p.state.toLowerCase().includes(q));
    return catOk && searchOk;
  });
}

/* ── Sidebar ──────────────────────────────────────────────────── */
function openSidebar(place) {
  currentPlace = place;

  // Name
  document.getElementById('place-name').textContent = place.name;

  // Badge
  const badge = document.getElementById('place-category-badge');
  badge.textContent = place.category || 'Other';

  // Location
  const loc = [place.city, place.state].filter(Boolean).join(', ');
  document.getElementById('place-location').textContent = loc;

  // Description
  const descEl = document.getElementById('place-description');
  descEl.textContent = place.description || '';
  descEl.style.display = place.description ? '' : 'none';

  // Memory
  const memWrap = document.getElementById('place-memory-wrap');
  const memText = document.getElementById('place-memory-text');
  if (place.memory) {
    memText.textContent = `"${place.memory}"`;
    memWrap.classList.remove('hidden');
  } else {
    memWrap.classList.add('hidden');
  }

  // Website
  const webEl = document.getElementById('place-website');
  if (place.website) {
    webEl.href = place.website;
    webEl.classList.remove('hidden');
  } else {
    webEl.classList.add('hidden');
  }

  // Gallery
  const galleryWrap = document.getElementById('sidebar-gallery-wrap');
  const gallery     = document.getElementById('sidebar-gallery');
  gallery.innerHTML = '';
  if (place.image_urls && place.image_urls.length > 0) {
    place.image_urls.forEach((url, i) => {
      const img = document.createElement('img');
      img.src     = url;
      img.alt     = place.name;
      img.className = 'gallery-thumb';
      img.loading   = 'lazy';
      img.addEventListener('click', () => openLightbox(place.image_urls, i));
      gallery.appendChild(img);
    });
    galleryWrap.classList.remove('hidden');
  } else {
    galleryWrap.classList.add('hidden');
  }

  // Admin controls
  const adminActions = document.getElementById('admin-place-actions');
  adminActions.classList.toggle('hidden', !isAdmin);

  document.getElementById('sidebar').classList.add('open');
  exitPlacingMode();
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  currentPlace = null;
}

function bindSidebar() {
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);

  document.getElementById('btn-edit-place').addEventListener('click', () => {
    if (!currentPlace) return;
    pendingEditId = currentPlace.id;
    populateEditForm(currentPlace);
    document.getElementById('modal-title').textContent = 'Edit Place';
    openModal();
  });

  document.getElementById('btn-delete-place').addEventListener('click', () => {
    if (!currentPlace) return;
    document.getElementById('del-place-name').textContent = currentPlace.name;
    document.getElementById('del-modal').classList.remove('hidden');
  });
}

/* ── Filter + Search ─────────────────────────────────────────── */
function bindControls() {
  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.cat;
      renderMarkers();
    });
  });

  // Search
  const searchInput = document.getElementById('map-search');
  let searchTimer;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      renderMarkers();
    }, 200);
  });

  // Lock
  document.getElementById('lock-btn').addEventListener('click', () => {
    if (isAdmin) {
      exitAdminMode();
    } else {
      document.getElementById('pw-modal').classList.remove('hidden');
      setTimeout(() => document.getElementById('pw-input').focus(), 50);
    }
  });

  // Add Place FAB
  document.getElementById('add-place-btn').addEventListener('click', () => {
    if (!isAdmin) return;
    if (placingMode) {
      exitPlacingMode();
    } else {
      enterPlacingMode();
    }
  });
}

/* ── Map click ───────────────────────────────────────────────── */
function onMapClick(e) {
  if (!isAdmin || !placingMode) return;
  exitPlacingMode();
  pendingEditId = null;
  clearForm();
  document.getElementById('form-lat').value = e.latlng.lat.toFixed(6);
  document.getElementById('form-lng').value = e.latlng.lng.toFixed(6);
  document.getElementById('form-coords-display').textContent =
    `📍 ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  document.getElementById('modal-title').textContent = 'Add Place';
  openModal();
}

/* ── Placing mode ────────────────────────────────────────────── */
function enterPlacingMode() {
  placingMode = true;
  map.getContainer().classList.add('placing-mode');
  const btn = document.getElementById('add-place-btn');
  btn.classList.add('placing');
  btn.title = 'Click map to place pin — click again to cancel';
  showToast('Click anywhere on the map to drop a pin');
}

function exitPlacingMode() {
  placingMode = false;
  map.getContainer().classList.remove('placing-mode');
  const btn = document.getElementById('add-place-btn');
  btn.classList.remove('placing');
  btn.title = '';
}

/* ── Admin mode ──────────────────────────────────────────────── */
function checkAdminSession() {
  if (sessionStorage.getItem('bjm_admin') === '1') {
    adminPw = sessionStorage.getItem('bjm_admin_pw') || '';
    enterAdminMode(false);
  }
}

function enterAdminMode(save = true) {
  isAdmin = true;
  if (save) {
    sessionStorage.setItem('bjm_admin', '1');
    sessionStorage.setItem('bjm_admin_pw', adminPw);
  }
  document.getElementById('admin-indicator').classList.remove('hidden');
  document.getElementById('add-place-btn').classList.remove('hidden');
  document.getElementById('lock-btn').classList.add('unlocked');
  // Show admin actions on currently open sidebar if any
  if (currentPlace) {
    document.getElementById('admin-place-actions').classList.remove('hidden');
  }
}

function exitAdminMode() {
  isAdmin = false;
  adminPw = '';
  sessionStorage.removeItem('bjm_admin');
  sessionStorage.removeItem('bjm_admin_pw');
  document.getElementById('admin-indicator').classList.add('hidden');
  document.getElementById('add-place-btn').classList.add('hidden');
  document.getElementById('lock-btn').classList.remove('unlocked');
  document.getElementById('admin-place-actions').classList.add('hidden');
  exitPlacingMode();
}

/* ── Password modal ──────────────────────────────────────────── */
function bindPwModal() {
  const modal     = document.getElementById('pw-modal');
  const form      = document.getElementById('pw-form');
  const closeBtn  = document.getElementById('pw-modal-close');
  const backdrop  = document.getElementById('pw-modal-backdrop');
  const errorEl   = document.getElementById('pw-error');

  function closePwModal() {
    modal.classList.add('hidden');
    form.reset();
    errorEl.classList.add('hidden');
  }

  closeBtn.addEventListener('click', closePwModal);
  backdrop.addEventListener('click', closePwModal);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const pw = document.getElementById('pw-input').value;
    if (!pw) return;

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking…';
    errorEl.classList.add('hidden');

    try {
      const res = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        adminPw = pw;
        closePwModal();
        enterAdminMode(true);
        showToast('Admin mode unlocked');
      } else {
        errorEl.classList.remove('hidden');
        document.getElementById('pw-input').focus();
      }
    } catch {
      errorEl.textContent = 'Could not reach server. Try again.';
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock';
    }
  });
}

/* ── Add / Edit modal ────────────────────────────────────────── */
function openModal() {
  document.getElementById('add-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('form-name').focus(), 50);
}

function closeModal() {
  document.getElementById('add-modal').classList.add('hidden');
  clearForm();
  pendingEditId = null;
}

function clearForm() {
  document.getElementById('add-place-form').reset();
  document.getElementById('form-id').value  = '';
  document.getElementById('form-lat').value = '';
  document.getElementById('form-lng').value = '';
  document.getElementById('form-coords-display').textContent = '';
  document.getElementById('image-preview').innerHTML = '';
  document.getElementById('image-preview-wrap').classList.add('hidden');
  document.getElementById('form-error').classList.add('hidden');
}

function populateEditForm(place) {
  document.getElementById('form-id').value          = place.id;
  document.getElementById('form-name').value         = place.name || '';
  document.getElementById('form-category').value     = place.category || 'Other';
  document.getElementById('form-city').value         = place.city || '';
  document.getElementById('form-state').value        = place.state || '';
  document.getElementById('form-description').value  = place.description || '';
  document.getElementById('form-memory').value       = place.memory || '';
  document.getElementById('form-website').value      = place.website || '';
  document.getElementById('form-lat').value          = place.lat;
  document.getElementById('form-lng').value          = place.lng;
  document.getElementById('form-coords-display').textContent =
    `📍 ${parseFloat(place.lat).toFixed(5)}, ${parseFloat(place.lng).toFixed(5)}`;

  // Show existing images as previews
  if (place.image_urls && place.image_urls.length > 0) {
    const preview = document.getElementById('image-preview');
    preview.innerHTML = '';
    place.image_urls.forEach(url => {
      const img = document.createElement('img');
      img.src       = url;
      img.className = 'preview-thumb';
      preview.appendChild(img);
    });
    document.getElementById('image-preview-wrap').classList.remove('hidden');
  }
}

function bindModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);

  // Image preview on file select
  document.getElementById('form-images').addEventListener('change', function () {
    const preview = document.getElementById('image-preview');
    const wrap    = document.getElementById('image-preview-wrap');
    preview.innerHTML = '';
    if (this.files.length > 0) {
      wrap.classList.remove('hidden');
      Array.from(this.files).forEach(file => {
        const url = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src       = url;
        img.className = 'preview-thumb';
        preview.appendChild(img);
      });
      // Update label
      document.querySelector('.file-input-label').textContent =
        `${this.files.length} photo${this.files.length > 1 ? 's' : ''} selected`;
    } else {
      wrap.classList.add('hidden');
      document.querySelector('.file-input-label').textContent = 'Choose photos…';
    }
  });

  document.getElementById('add-place-form').addEventListener('submit', submitPlace);
}

async function submitPlace(e) {
  e.preventDefault();
  if (!isAdmin) return;

  const form      = e.target;
  const submitBtn = document.getElementById('form-submit');
  const errorEl   = document.getElementById('form-error');
  errorEl.classList.add('hidden');

  const name = document.getElementById('form-name').value.trim();
  const lat  = document.getElementById('form-lat').value;
  const lng  = document.getElementById('form-lng').value;

  if (!name) {
    showFormError('Name is required.');
    return;
  }
  if (!lat || !lng) {
    showFormError('Drop a pin on the map first.');
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading…';

  try {
    // 1. Upload any new images directly to Supabase storage
    const fileInput = document.getElementById('form-images');
    let imageUrls   = [];

    if (pendingEditId) {
      // Keep existing image URLs when editing (new uploads append)
      const existing = allPlaces.find(p => p.id === pendingEditId);
      imageUrls = (existing && existing.image_urls) ? [...existing.image_urls] : [];
    }

    if (fileInput.files.length > 0) {
      submitBtn.textContent = `Uploading ${fileInput.files.length} photo${fileInput.files.length > 1 ? 's' : ''}…`;
      const uploaded = await uploadImages(fileInput.files);
      imageUrls = [...imageUrls, ...uploaded];
    }

    submitBtn.textContent = 'Saving…';

    // 2. Save place via API
    const payload = {
      adminPassword: adminPw,
      id:          document.getElementById('form-id').value || undefined,
      name,
      category:    document.getElementById('form-category').value,
      city:        document.getElementById('form-city').value.trim(),
      state:       document.getElementById('form-state').value.trim(),
      lat:         parseFloat(lat),
      lng:         parseFloat(lng),
      description: document.getElementById('form-description').value.trim(),
      memory:      document.getElementById('form-memory').value.trim(),
      website:     document.getElementById('form-website').value.trim(),
      imageUrls,
    };

    const res = await fetch('/api/add-place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const saved = await res.json();

    if (pendingEditId) {
      // Update in-memory list and marker
      const idx = allPlaces.findIndex(p => p.id === pendingEditId);
      if (idx !== -1) allPlaces[idx] = saved;
      removeMarker(pendingEditId);
      addMarker(saved);
      closeModal();
      closeSidebar();
      openSidebar(saved);
      showToast(`✓ ${saved.name} updated`);
    } else {
      // New place
      allPlaces.unshift(saved);
      addMarker(saved);
      closeModal();
      setTimeout(() => {
        map.flyTo([saved.lat, saved.lng], Math.max(map.getZoom(), 13), { duration: 1.2 });
        openSidebar(saved);
      }, 200);
      showToast(`✓ ${saved.name} added`);
    }

  } catch (err) {
    console.error('Submit error:', err);
    showFormError(err.message || 'Something went wrong. Try again.');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Save Place';
    return;
  }

  submitBtn.disabled    = false;
  submitBtn.textContent = 'Save Place';
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ── Image upload (direct to Supabase storage) ────────────────── */
async function uploadImages(files) {
  const urls = [];
  for (const file of files) {
    try {
      const ext      = file.name.split('.').pop().toLowerCase() || 'jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error } = await supabaseClient.storage
        .from('place-images')
        .upload(filename, file, { cacheControl: '31536000', upsert: false });

      if (error) {
        console.error('Upload error for', file.name, error);
        continue;
      }

      const { data: { publicUrl } } = supabaseClient.storage
        .from('place-images')
        .getPublicUrl(filename);

      urls.push(publicUrl);
    } catch (err) {
      console.error('Upload failed for', file.name, err);
    }
  }
  return urls;
}

/* ── Delete modal ────────────────────────────────────────────── */
function bindDelModal() {
  const modal    = document.getElementById('del-modal');
  const backdrop = document.getElementById('del-modal-backdrop');
  const cancelBtn = document.getElementById('del-cancel');
  const confirmBtn = document.getElementById('del-confirm');

  function closeDelModal() { modal.classList.add('hidden'); }
  backdrop.addEventListener('click', closeDelModal);
  cancelBtn.addEventListener('click', closeDelModal);

  confirmBtn.addEventListener('click', async () => {
    if (!currentPlace || !isAdmin) return;
    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Deleting…';

    try {
      const res = await fetch('/api/delete-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: adminPw,
          id:         currentPlace.id,
          imageUrls:  currentPlace.image_urls || [],
        }),
      });

      if (!res.ok) throw new Error('Delete failed');

      // Remove from state
      allPlaces = allPlaces.filter(p => p.id !== currentPlace.id);
      removeMarker(currentPlace.id);
      closeSidebar();
      closeDelModal();
      showToast('Place deleted');
    } catch (err) {
      console.error(err);
      showToast('Delete failed. Try again.', 'error');
    } finally {
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Delete';
    }
  });
}

/* ── Lightbox ─────────────────────────────────────────────────── */
function openLightbox(images, index) {
  lightboxImages = images;
  lightboxIdx    = index;
  renderLightbox();
  document.getElementById('lightbox').classList.remove('hidden');
}

function renderLightbox() {
  document.getElementById('lb-img').src = lightboxImages[lightboxIdx];
  document.getElementById('lb-counter').textContent =
    lightboxImages.length > 1 ? `${lightboxIdx + 1} / ${lightboxImages.length}` : '';
  document.getElementById('lb-prev').style.display = lightboxIdx === 0 ? 'none' : '';
  document.getElementById('lb-next').style.display =
    lightboxIdx === lightboxImages.length - 1 ? 'none' : '';
}

function bindLightbox() {
  const lb = document.getElementById('lightbox');
  document.getElementById('lb-close').addEventListener('click', () => lb.classList.add('hidden'));
  lb.addEventListener('click', e => { if (e.target === lb) lb.classList.add('hidden'); });
  document.getElementById('lb-prev').addEventListener('click', () => {
    if (lightboxIdx > 0) { lightboxIdx--; renderLightbox(); }
  });
  document.getElementById('lb-next').addEventListener('click', () => {
    if (lightboxIdx < lightboxImages.length - 1) { lightboxIdx++; renderLightbox(); }
  });
  document.addEventListener('keydown', e => {
    if (lb.classList.contains('hidden')) return;
    if (e.key === 'Escape')      lb.classList.add('hidden');
    if (e.key === 'ArrowLeft'  && lightboxIdx > 0)                        { lightboxIdx--; renderLightbox(); }
    if (e.key === 'ArrowRight' && lightboxIdx < lightboxImages.length - 1){ lightboxIdx++; renderLightbox(); }
  });
}

/* ── Toast ────────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}
