// ==========================================
// GESTION DES LIENS UTILES
// ==========================================

var _lk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const STORAGE_KEY_LINKS = _lk.CUSTOM_LINKS || 'darkOrbitCustomLinks';

const DEFAULT_LINKS = [
  {
    id: 1,
    title: 'DarkOrbit Officiel',
    description: 'Site officiel du jeu',
    url: 'https://darkorbit.com',
    icon: '🚀',
    iconType: 'emoji'
  },
  {
    id: 2,
    title: 'Forum Officiel',
    description: 'Communauté et discussions',
    url: 'https://board.darkorbit.com',
    icon: '💬',
    iconType: 'emoji'
  },
  {
    id: 3,
    title: 'Wiki DarkOrbit',
    description: 'Guides et informations',
    url: 'https://darkorbit.fandom.com/wiki/DarkOrbit_Wiki',
    icon: '📚',
    iconType: 'emoji'
  },
  {
    id: 4,
    title: 'Guides YouTube',
    description: 'Tutoriels vidéo',
    url: 'https://www.youtube.com/results?search_query=darkorbit+guide',
    icon: '🎥',
    iconType: 'emoji'
  },
  {
    id: 5,
    title: 'Discord',
    description: 'Communauté Discord',
    url: 'https://discord.gg/darkorbit',
    icon: '💬',
    iconType: 'emoji'
  },
  {
    id: 6,
    title: 'Reddit',
    description: 'r/Darkorbit',
    url: 'https://www.reddit.com/r/Darkorbit/',
    icon: '🤖',
    iconType: 'emoji'
  }
];

let currentEditingLinkId = null;
let currentLinkIconData = null;

// ==========================================
// STOCKAGE (avec cache)
// ==========================================

function getCustomLinks() {
  // Utiliser le cache si disponible
  if (typeof StorageCache !== 'undefined') {
    const cached = StorageCache.get(STORAGE_KEY_LINKS, null);
    return cached || DEFAULT_LINKS;
  }
  // Fallback sans cache
  const stored = SafeStorage.get(STORAGE_KEY_LINKS, null);
  return stored || DEFAULT_LINKS;
}

function saveCustomLinks(links) {
  // Utiliser le cache si disponible
  if (typeof StorageCache !== 'undefined') {
    return StorageCache.set(STORAGE_KEY_LINKS, links);
  }
  // Fallback sans cache
  return SafeStorage.set(STORAGE_KEY_LINKS, links);
}

// ==========================================
// AFFICHAGE DES LIENS
// ==========================================

function renderLinksInSettings() {
  const container = document.getElementById('settingsLinksGrid');
  if (!container) return;
  
  const links = getCustomLinks();
  
  if (links.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Aucun lien configuré</p>';
    return;
  }
  
  container.innerHTML = links.map(link => {
    const iconHtml = link.iconType === 'image' 
      ? `<img src="${link.icon}" alt="${link.title}" style="width: 100%; height: 100%; object-fit: contain;">`
      : link.icon;
    
    return `
      <a href="${link.url}" target="_blank" class="settings-link-card">
        <div class="link-icon">${iconHtml}</div>
        <div class="link-content">
          <div class="link-title">${sanitizeHTML(link.title)}</div>
          <div class="link-description">${sanitizeHTML(link.description || '')}</div>
        </div>
      </a>
    `;
  }).join('');
}

function renderLinksInManageModal() {
  const container = document.getElementById('manageLinksListContainer');
  if (!container) return;
  
  const links = getCustomLinks();
  
  if (links.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Aucun lien configuré</p>';
    return;
  }
  
  container.innerHTML = '<div class="manage-links-list">' + links.map(link => {
    const iconHtml = link.iconType === 'image'
      ? `<img src="${link.icon}" alt="${link.title}">`
      : link.icon;
    
    return `
      <div class="manage-link-item">
        <div class="manage-link-icon">${iconHtml}</div>
        <div class="manage-link-info">
          <div class="manage-link-title">${sanitizeHTML(link.title)}</div>
          <div class="manage-link-url">${link.url}</div>
        </div>
        <div class="manage-link-actions">
          <button class="manage-link-btn edit" onclick="editLink(${link.id})">✏️ Modifier</button>
          <button class="manage-link-btn delete" onclick="deleteLink(${link.id})">🗑️</button>
        </div>
      </div>
    `;
  }).join('') + '</div>';
}

// ==========================================
// MODAL
// ==========================================

function openManageLinksModal() {
  const modal = document.getElementById('manageLinksModal');
  renderLinksInManageModal();
  resetLinkForm();
  modal.style.display = 'flex';
}

function closeManageLinksModal() {
  const modal = document.getElementById('manageLinksModal');
  modal.style.display = 'none';
  resetLinkForm();
}

function resetLinkForm() {
  currentEditingLinkId = null;
  currentLinkIconData = null;
  
  document.getElementById('linkTitleInput').value = '';
  document.getElementById('linkDescriptionInput').value = '';
  document.getElementById('linkUrlInput').value = '';
  document.getElementById('linkIconEmojiInput').value = '';
  
  document.getElementById('linkIconPreviewImg').style.display = 'none';
  document.getElementById('linkIconPreviewEmoji').style.display = 'block';
  document.getElementById('linkIconPreviewEmoji').textContent = '🔗';
  
  document.getElementById('manageLinkFormTitle').textContent = '➕ Ajouter un lien';
  document.getElementById('saveLinkBtn').textContent = '✅ Ajouter';
  document.getElementById('cancelLinkEditBtn').style.display = 'none';
  
  const fileInput = document.getElementById('linkIconImageInput');
  if (fileInput) fileInput.value = '';
}

function resetLinkIcon() {
  currentLinkIconData = null;
  document.getElementById('linkIconEmojiInput').value = '';
  document.getElementById('linkIconPreviewImg').style.display = 'none';
  document.getElementById('linkIconPreviewEmoji').style.display = 'block';
  document.getElementById('linkIconPreviewEmoji').textContent = '🔗';
  
  const fileInput = document.getElementById('linkIconImageInput');
  if (fileInput) fileInput.value = '';
}

// ==========================================
// GESTION DE L'ICÔNE
// ==========================================

function handleLinkIconUpload(file) {
  if (!file) return;
  
  if (file.size > 200 * 1024) {
    showToast('❌ Image trop volumineuse (max 200KB)', 'error');
    return;
  }
  
  if (!file.type.startsWith('image/')) {
    showToast('❌ Fichier invalide', 'error');
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const base64Data = e.target.result;
    
    // FIX BUG #15 : Validation stricte base64 image (sécurité)
    if (!validateBase64Image(base64Data)) {
      showToast('❌ Format d\'image non supporté', 'error');
      return;
    }
    
    currentLinkIconData = {
      type: 'image',
      data: base64Data
    };
    
    document.getElementById('linkIconPreviewImg').src = base64Data;
    document.getElementById('linkIconPreviewImg').style.display = 'block';
    document.getElementById('linkIconPreviewEmoji').style.display = 'none';
    document.getElementById('linkIconEmojiInput').value = '';
  };
  
  reader.readAsDataURL(file);
}

// FIX BUG #15 : Fonction de validation base64
function validateBase64Image(base64) {
  const validPrefixes = [
    'data:image/jpeg',
    'data:image/jpg',
    'data:image/png',
    'data:image/gif',
    'data:image/webp'
  ];
  return validPrefixes.some(prefix => base64.startsWith(prefix));
}

function updateLinkIconPreview() {
  const emoji = document.getElementById('linkIconEmojiInput').value.trim();
  
  if (emoji) {
    currentLinkIconData = {
      type: 'emoji',
      data: emoji
    };
    
    document.getElementById('linkIconPreviewEmoji').textContent = emoji;
    document.getElementById('linkIconPreviewEmoji').style.display = 'block';
    document.getElementById('linkIconPreviewImg').style.display = 'none';
  }
}

// ==========================================
// CRUD OPERATIONS
// ==========================================

function saveLink() {
  const title = document.getElementById('linkTitleInput').value.trim();
  const description = document.getElementById('linkDescriptionInput').value.trim();
  const url = document.getElementById('linkUrlInput').value.trim();
  const emoji = document.getElementById('linkIconEmojiInput').value.trim();
  
  if (!title) {
    showToast('❌ Le titre est requis', 'error');
    return;
  }
  
  if (!url) {
    showToast('❌ L\'URL est requise', 'error');
    return;
  }
  
  // FIX BUG #7 : Validation stricte de l'URL (sécurité)
  try {
    const parsedUrl = new URL(url);
    // Autoriser seulement http et https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      showToast('❌ URL invalide : seuls http:// et https:// sont autorisés', 'error');
      return;
    }
  } catch (e) {
    showToast('❌ URL invalide : format incorrect', 'error');
    return;
  }
  
  const links = getCustomLinks();
  
  let icon = '🔗';
  let iconType = 'emoji';
  
  if (currentLinkIconData) {
    icon = currentLinkIconData.data;
    iconType = currentLinkIconData.type;
  } else if (emoji) {
    icon = emoji;
    iconType = 'emoji';
  }
  
  if (currentEditingLinkId !== null) {
    // Modification
    const index = links.findIndex(l => l.id === currentEditingLinkId);
    if (index !== -1) {
      links[index] = {
        ...links[index],
        title,
        description,
        url,
        icon,
        iconType
      };
    }
  } else {
    // Ajout
    const newId = links.length > 0 ? Math.max(...links.map(l => l.id)) + 1 : 1;
    links.push({
      id: newId,
      title,
      description,
      url,
      icon,
      iconType
    });
  }
  
  const result = saveCustomLinks(links);
  
  if (result.success) {
    showToast(currentEditingLinkId ? '✅ Lien modifié' : '✅ Lien ajouté', 'success');
    renderLinksInManageModal();
    renderLinksInSettings();
    resetLinkForm();
  } else {
    showToast('❌ Erreur de sauvegarde', 'error');
  }
}

function editLink(linkId) {
  const links = getCustomLinks();
  const link = links.find(l => l.id === linkId);
  
  if (!link) return;
  
  currentEditingLinkId = linkId;
  
  document.getElementById('linkTitleInput').value = link.title;
  document.getElementById('linkDescriptionInput').value = link.description || '';
  document.getElementById('linkUrlInput').value = link.url;
  
  if (link.iconType === 'image') {
    currentLinkIconData = {
      type: 'image',
      data: link.icon
    };
    document.getElementById('linkIconPreviewImg').src = link.icon;
    document.getElementById('linkIconPreviewImg').style.display = 'block';
    document.getElementById('linkIconPreviewEmoji').style.display = 'none';
  } else {
    currentLinkIconData = {
      type: 'emoji',
      data: link.icon
    };
    document.getElementById('linkIconEmojiInput').value = link.icon;
    document.getElementById('linkIconPreviewEmoji').textContent = link.icon;
    document.getElementById('linkIconPreviewEmoji').style.display = 'block';
    document.getElementById('linkIconPreviewImg').style.display = 'none';
  }
  
  document.getElementById('manageLinkFormTitle').textContent = '✏️ Modifier le lien';
  document.getElementById('saveLinkBtn').textContent = '💾 Enregistrer';
  document.getElementById('cancelLinkEditBtn').style.display = 'block';
  
  // Scroll vers le formulaire
  document.getElementById('manageLinkFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteLink(linkId) {
  if (!confirm('Supprimer ce lien ?')) return;
  
  let links = getCustomLinks();
  links = links.filter(l => l.id !== linkId);
  
  const result = saveCustomLinks(links);
  
  if (result.success) {
    showToast('✅ Lien supprimé', 'success');
    renderLinksInManageModal();
    renderLinksInSettings();
    
    if (currentEditingLinkId === linkId) {
      resetLinkForm();
    }
  } else {
    showToast('❌ Erreur de suppression', 'error');
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  
  // Bouton ouvrir modal
  const manageLinksBtnSettings = document.getElementById('manageLinksBtnSettings');
  if (manageLinksBtnSettings) {
    manageLinksBtnSettings.addEventListener('click', openManageLinksModal);
  }
  
  // Boutons fermer modal
  const closeBtn = document.getElementById('closeManageLinksBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeManageLinksModal);
  }
  
  const closeBtn2 = document.getElementById('closeManageLinksBtn2');
  if (closeBtn2) {
    closeBtn2.addEventListener('click', closeManageLinksModal);
  }
  
  // Bouton sauvegarder lien
  const saveLinkBtn = document.getElementById('saveLinkBtn');
  if (saveLinkBtn) {
    saveLinkBtn.addEventListener('click', saveLink);
  }
  
  // Bouton annuler édition
  const cancelLinkEditBtn = document.getElementById('cancelLinkEditBtn');
  if (cancelLinkEditBtn) {
    cancelLinkEditBtn.addEventListener('click', resetLinkForm);
  }
  
  // Upload d'image
  const linkIconImageInput = document.getElementById('linkIconImageInput');
  if (linkIconImageInput) {
    linkIconImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleLinkIconUpload(file);
      }
    });
  }
  
  // Input emoji AVEC DEBOUNCE (FIX BUG #19)
  const linkIconEmojiInput = document.getElementById('linkIconEmojiInput');
  if (linkIconEmojiInput) {
    const debouncedUpdate = debounce(updateLinkIconPreview, 300);
    linkIconEmojiInput.addEventListener('input', debouncedUpdate);
  }
  
  // Render initial
  renderLinksInSettings();
});

// Fermer modal en cliquant dehors
window.addEventListener('click', (e) => {
  const modal = document.getElementById('manageLinksModal');
  if (e.target === modal) {
    closeManageLinksModal();
  }
});

