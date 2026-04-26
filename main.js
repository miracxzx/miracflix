import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

// Initialize Supabase Client
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuration
const API_KEY = '20a0abcbeaf2431b5807118f4fe80c5e'; 
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/original';
const POSTER_FALLBACK = 'https://placehold.co/400x600/181818/ffffff?text=MIRACFLIX';
const BACKDROP_FALLBACK = 'linear-gradient(135deg, #111 0%, #1f1f1f 55%, #000 100%)';

// --- State & Globals ---
let currentMovie = null;
let currentImdbId = null;
let currentTrailerUrl = null;
let currentEpisode = null;
let heroMovieData = null;
let isLoginMode = true;
let isManageMode = false;
let currentBrowseType = 'movie';
let currentPage = 1;
let appRevealed = false;
let userDataCache = null;
const DEFAULT_PREFERENCES = {
    trailerPreview: true,
    notifications: true,
    compactMobile: false,
    reduceBackdropMotion: false,
    theme: 'classic',
    language: 'tr',
    homeLayout: 'standard'
};
const SEARCH_TOPIC_KEYWORDS = {
    detective: 'detective investigation',
    mafia: 'mafia crime family',
    revenge: 'revenge',
    survival: 'survival',
    space: 'space sci fi',
    'time travel': 'time travel',
    'post apocalyptic': 'post apocalyptic',
    zombie: 'zombie',
    superhero: 'superhero',
    school: 'school teen',
    family: 'family drama',
    heist: 'heist robbery',
    spy: 'spy espionage',
    courtroom: 'courtroom legal',
    'based on true story': 'based on true story'
};
const APP_PRODUCTION_URL = 'https://miracflix.netlify.app';

function getAuthRedirectUrl() {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    return isLocal ? APP_PRODUCTION_URL : window.location.origin;
}

const getEl = (id) => document.getElementById(id);

function getLocalPreferences() {
    try {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem('miracflixPreferences') || '{}') };
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
}

function setLocalPreferences(preferences) {
    localStorage.setItem('miracflixPreferences', JSON.stringify(preferences));
}

function getGuestUserData() {
    try {
        return {
            profiles: [{ name: 'Misafir', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest' }],
            ...JSON.parse(localStorage.getItem('miracflixGuestData') || '{}')
        };
    } catch {
        return { profiles: [{ name: 'Misafir', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest' }] };
    }
}

function updateGuestUserData(update) {
    const next = { ...getGuestUserData(), ...update };
    localStorage.setItem('miracflixGuestData', JSON.stringify(next));
    userDataCache = next;
}

function applyPreferences(preferences = getLocalPreferences()) {
    document.body.classList.toggle('compact-mobile-mode', !!preferences.compactMobile);
    document.body.classList.toggle('reduce-backdrop-motion', !!preferences.reduceBackdropMotion);
    document.body.classList.toggle('notifications-off', !preferences.notifications);
    document.body.dataset.theme = preferences.theme || 'classic';
    document.body.dataset.homeLayout = preferences.homeLayout || 'standard';
    document.documentElement.lang = preferences.language || 'tr';
    if (!preferences.notifications) {
        const badge = getEl('notif-badge');
        const drop = getEl('notif-dropdown');
        if (badge) badge.style.display = 'none';
        if (drop) drop.style.display = 'none';
    }
}

function applyHomeLayout(preferences = getLocalPreferences()) {
    const discoveryFirst = preferences.homeLayout === 'discovery';
    document.querySelectorAll('.standard-row').forEach((row, index) => {
        row.style.order = discoveryFirst ? String(20 + index) : String(10 + index);
    });
    document.querySelectorAll('.discovery-row').forEach((row, index) => {
        row.style.order = discoveryFirst ? String(10 + index) : String(20 + index);
    });
    document.querySelectorAll('.personal-row').forEach((row, index) => {
        row.style.order = String(index + 1);
    });
}

async function getPreferences() {
    const local = getLocalPreferences();
    const data = await DataManager.getUserData();
    const preferences = { ...local, ...(data?.preferences || {}) };
    setLocalPreferences(preferences);
    applyPreferences(preferences);
    applyHomeLayout(preferences);
    return preferences;
}

async function savePreferences(update) {
    const current = getLocalPreferences();
    const preferences = { ...current, ...update };
    setLocalPreferences(preferences);
    applyPreferences(preferences);
    applyHomeLayout(preferences);
    const user = await AuthManager.getUser();
    if (user) await DataManager.updateUserData({ preferences });
}

function revealApp() {
    if (appRevealed) return;
    appRevealed = true;

    const intro = getEl('startup-intro');
    const app = getEl('app');
    if (!app) return;

    const show = () => {
        app.style.display = 'block';
        if (window.lucide) lucide.createIcons();
    };

    if (intro) {
        intro.style.opacity = '0';
        setTimeout(() => {
            intro.style.display = 'none';
            show();
        }, 800);
    } else {
        show();
    }
}

// --- Auth Manager ---
const AuthManager = {
    getUser: async () => {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error) throw error;
            return user;
        } catch (e) {
            console.warn('Auth check failed:', e.message);
            return null;
        }
    },
    isLoggedIn: async () => {
        const user = await AuthManager.getUser();
        return !!user;
    },
    logout: async () => {
        localStorage.removeItem('activeProfileIndex');
        await supabase.auth.signOut();
        location.reload();
    }
};

// --- API Helpers ---
async function apiFetch(endpoint, params = '') {
    try {
        const language = getLocalPreferences().language === 'en' ? 'en-US' : 'tr-TR';
        const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}&language=${language}${params}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('API Fetch Error:', error);
        showToast(navigator.onLine ? 'İçerik yüklenirken hata oluştu.' : 'Çevrimdışısın. Bağlantı gelince tekrar dene.');
        return { results: [] };
    }
}

async function getImdbId(id, type = 'movie') {
    const data = await apiFetch(`/${type}/${id}/external_ids`);
    return data.imdb_id;
}

async function getTrailer(id, type = 'movie') {
    let data = await apiFetch(`/${type}/${id}/videos`);
    let trailer = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    
    if (!trailer) {
        // Try English if Turkish trailer not found
        data = await apiFetch(`/${type}/${id}/videos`, '&language=en-US');
        trailer = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    }
    
    return trailer ? `https://www.youtube.com/embed/${trailer.key}` : null;
}

function getStoredMediaType(item, fallback = 'movie') {
    return item?.media_type || item?.type || fallback || 'movie';
}

function getHistoryKey(item, fallback = 'movie') {
    return `${getStoredMediaType(item, fallback)}:${item?.id}`;
}

function getActiveProfileIndex() {
    return parseInt(localStorage.getItem('activeProfileIndex') || '0');
}

function getProfileKey(index = getActiveProfileIndex()) {
    return `profile_${index}`;
}

function getProfileBucket(data, field, fallback) {
    const value = data?.[field];
    if (value && !Array.isArray(value) && typeof value === 'object') {
        return value[getProfileKey()] || fallback;
    }
    return value || fallback;
}

function setProfileBucket(data, field, value) {
    const existing = data?.[field];
    const bucket = existing && !Array.isArray(existing) && typeof existing === 'object' ? { ...existing } : {};
    bucket[getProfileKey()] = value;
    return bucket;
}

function isSameMedia(a, b) {
    return getHistoryKey(a) === getHistoryKey(b);
}

function normalizeStoredMedia(item, fallback = 'movie') {
    const mediaType = getStoredMediaType(item, fallback);
    return {
        id: item.id,
        title: item.title || item.name,
        name: item.name || item.title,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        release_date: item.release_date || item.first_air_date,
        first_air_date: item.first_air_date || item.release_date,
        vote_average: item.vote_average,
        media_type: mediaType,
        type: mediaType
    };
}

function getProgressFor(data, item) {
    const progress = getProfileBucket(data, 'watchProgress', {});
    return progress[getHistoryKey(item)] || null;
}

function getCompletedKeys(data) {
    return getProfileBucket(data, 'completedItems', []);
}

function isCompleted(data, item) {
    return getCompletedKeys(data).includes(getHistoryKey(item));
}

function buildSkeletonCards(count = 8) {
    return Array.from({ length: count }, () => '<div class="movie-card skeleton-card"></div>').join('');
}

function showToast(message) {
    let toast = document.querySelector('.app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeInline(value = '') {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPersonRoleLabel(department = '') {
    if (department === 'Directing') return 'Yönetmen';
    if (department === 'Writing') return 'Yazar';
    if (department === 'Production') return 'Yapımcı';
    if (department === 'Creator') return 'Yaratıcı';
    if (department === 'Sound') return 'Müzik';
    if (department === 'Camera') return 'Görüntü Yönetmeni';
    if (department === 'Editing') return 'Kurgu';
    return 'Oyuncu';
}

function getPersonPageTitle(name, department = '') {
    const normalized = getPersonRoleLabel(department);
    return `${name} ${normalized === 'Oyuncu' ? 'Filmleri' : 'Sayfası'}`;
}

function getActiveProfile(data) {
    const profiles = data?.profiles || [{ name: 'Kullanıcı' }];
    return profiles[getActiveProfileIndex()] || profiles[0] || { name: 'Kullanıcı' };
}

async function syncPublicProfile(data = userDataCache) {
    const user = await AuthManager.getUser();
    if (!user || !data) return;
    const profile = getActiveProfile(data);
    try {
        await supabase.from('user_public_profiles').upsert({
            id: user.id,
            email: user.email,
            display_name: profile.name || user.email?.split('@')[0] || 'Kullanıcı',
            avatar_url: profile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.name || user.id}`,
            search_text: `${profile.name || ''} ${user.email || ''}`.toLowerCase()
        }, { onConflict: 'id' });
    } catch (error) {
        console.warn('Public profile sync skipped:', error);
    }
}

async function findPublicProfile(query) {
    const term = query.trim().toLowerCase().replace(/[,%()]/g, ' ');
    if (!term) return null;
    const { data, error } = await supabase
        .from('user_public_profiles')
        .select('id, display_name, avatar_url, email')
        .or(`display_name.ilike.%${term}%,email.ilike.%${term}%,search_text.ilike.%${term}%`)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function getCommentLikes() {
    const data = await DataManager.getUserData();
    const storedLikes = getProfileBucket(data, 'commentLikes', {});
    if (Object.keys(storedLikes).length) return storedLikes;
    try {
        return JSON.parse(localStorage.getItem('miracflixCommentLikes') || '{}');
    } catch {
        return {};
    }
}

async function getCommentReactions() {
    const data = await DataManager.getUserData();
    const storedReactions = getProfileBucket(data, 'commentReactions', {});
    if (Object.keys(storedReactions).length) return storedReactions;
    try {
        return JSON.parse(localStorage.getItem('miracflixCommentReactions') || '{}');
    } catch {
        return {};
    }
}

window.likeComment = async (commentId) => {
    const data = await DataManager.getUserData();
    const likes = await getCommentLikes();
    const reactions = await getCommentReactions();
    const wasLiked = !!reactions[commentId];

    if (wasLiked) {
        likes[commentId] = Math.max(0, (likes[commentId] || 1) - 1);
        delete reactions[commentId];
    } else {
        likes[commentId] = 1;
        reactions[commentId] = true;
    }

    localStorage.setItem('miracflixCommentLikes', JSON.stringify(likes));
    localStorage.setItem('miracflixCommentReactions', JSON.stringify(reactions));
    if (data) {
        await DataManager.updateUserData({
            commentLikes: setProfileBucket(data, 'commentLikes', likes),
            commentReactions: setProfileBucket(data, 'commentReactions', reactions)
        });
    }
    fetchComments(currentMovie.id);
};

window.replyToComment = (username) => {
    const textarea = getEl('comment-textarea');
    textarea.value = `@${username} `;
    textarea.focus();
};

function flattenPublicLists(rawLists = {}) {
    if (!rawLists || Array.isArray(rawLists) || typeof rawLists !== 'object') return [];

    const looksLikeListBucket = Object.values(rawLists).some(Array.isArray);
    const buckets = looksLikeListBucket ? [rawLists] : Object.values(rawLists);

    return buckets.flatMap(bucket => {
        if (!bucket || Array.isArray(bucket) || typeof bucket !== 'object') return [];
        return Object.entries(bucket)
            .filter(([, items]) => Array.isArray(items))
            .map(([name, items]) => ({ name, items }));
    });
}

window.publicProfileLists = [];

window.openPublicProfileList = (index) => {
    const list = window.publicProfileLists?.[index];
    if (!list) return;

    getEl('collection-title').innerText = list.name;
    getEl('collection-grid').style.display = 'grid';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'none';
    renderMovies(list.items || [], getEl('collection-grid'), 'movie', {
        emptyText: 'Bu listede görünür içerik yok.'
    });
};

window.openCommentProfile = async (userId, username, avatarUrl = '') => {
    const safeName = username || 'Kullanıcı';
    getEl('collection-overlay').style.display = 'block';
    getEl('collection-title').innerText = `${safeName} Profili`;
    getEl('collection-grid').style.display = 'none';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'block';
    document.querySelectorAll('.profile-form-view').forEach(v => v.style.display = 'none');
    getEl('account-view').style.display = 'block';
    getEl('movie-modal').style.display = 'none';
    getEl('profile-settings-modal').style.display = 'none';

    let query = supabase.from('comments').select('*').order('created_at', { ascending: false }).limit(12);
    query = userId && userId !== 'null' ? query.eq('user_id', userId) : query.eq('username', safeName);
    const { data: comments = [] } = await query;
    const commentCount = comments.length;
    const latest = comments.slice(0, 5).map(comment => `
        <div class="profile-activity-item">
            <strong>${escapeHtml(comment.username)}</strong>
            <span>${escapeHtml(comment.content?.replace('[spoiler]', '').trim() || 'Yorum yok')}</span>
        </div>
    `).join('');

    let publicHistory = [];
    let publicLists = [];

    if (userId && userId !== 'null') {
        try {
            const { data: profileData, error } = await supabase
                .from('user_data')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (!error && profileData) {
                publicHistory = (profileData.history || []).map(item => normalizeStoredMedia(item, getStoredMediaType(item))).slice(0, 8);
                publicLists = flattenPublicLists(profileData.customLists || profileData.customlists).slice(0, 8);
            }
        } catch (error) {
            console.warn('Public profile user_data could not be loaded:', error);
        }

        try {
            const { data: dbLists, error: listError } = await supabase
                .from('custom_lists')
                .select('id, name, description')
                .eq('user_id', userId)
                .eq('is_public', true)
                .limit(8);

            if (!listError && dbLists?.length) {
                const listIds = dbLists.map(list => list.id);
                const { data: rows = [], error: itemError } = await supabase
                    .from('custom_list_items')
                    .select('list_id, media')
                    .in('list_id', listIds);

                if (!itemError) {
                    const normalizedDbLists = dbLists.map(list => ({
                        name: list.name,
                        description: list.description,
                        items: rows
                            .filter(row => row.list_id === list.id)
                            .map(row => normalizeStoredMedia(row.media || {}, getStoredMediaType(row.media || {})))
                    }));
                    publicLists = [...normalizedDbLists, ...publicLists]
                        .filter((list, index, all) => all.findIndex(item => item.name === list.name) === index)
                        .slice(0, 8);
                }
            }
        } catch (error) {
            console.warn('Public profile custom lists could not be loaded:', error);
        }
    }

    window.publicProfileLists = publicLists;
    const listCards = publicLists.map((list, index) => `
        <button type="button" class="public-list-card" onclick="openPublicProfileList(${index})">
            <span>
                <strong>${escapeHtml(list.name)}</strong>
                ${list.description ? `<small>${escapeHtml(list.description)}</small>` : ''}
            </span>
            <em>${(list.items || []).length}</em>
        </button>
    `).join('');

    getEl('account-view').querySelector('.form-card').innerHTML = `
        <div class="public-profile-header">
            <img src="${avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`}" alt="${escapeHtml(safeName)}">
            <div>
                <span class="section-kicker">Kullanıcı profili</span>
                <h2>${escapeHtml(safeName)}</h2>
                <p>${commentCount} son yorum kaydı</p>
            </div>
        </div>
        <button class="btn-xl secondary" onclick="DataManager.addFriend('${escapeInline(safeName)}', '${escapeInline(userId || '')}', '${escapeInline(avatarUrl)}')"><i data-lucide="user-plus"></i> Arkadaş Ekle</button>
        <div class="public-profile-section">
            <div class="section-heading-row">
                <h3>Son izledikleri</h3>
                <span>${publicHistory.length ? `${publicHistory.length} içerik` : 'Gizli veya boş'}</span>
            </div>
            <div id="public-history-grid" class="public-mini-grid"></div>
        </div>
        <div class="public-profile-section">
            <div class="section-heading-row">
                <h3>Listeleri</h3>
                <span>${publicLists.length ? `${publicLists.length} liste` : 'Herkese açık liste yok'}</span>
            </div>
            <div class="public-list-grid">
                ${listCards || '<p class="muted-note">Bu kullanıcı için görünür liste bulunamadı.</p>'}
            </div>
        </div>
        <div class="profile-activity-list">
            <h3>Son yorumlar</h3>
            ${latest || '<p class="muted-note">Bu kullanıcı için herkese açık yorum bulunamadı.</p>'}
        </div>
    `;
    renderMovies(publicHistory, getEl('public-history-grid'), 'movie', {
        emptyText: 'Son izledikleri gizli veya henüz kayıt yok.'
    });
    if (window.lucide) lucide.createIcons();
};

window.addFriendFromInput = () => {
    DataManager.addFriend(getEl('friend-name-input')?.value || '');
};

window.addCurrentToCustomList = () => {
    DataManager.addToCustomList(getEl('custom-list-name-input')?.value || '', currentMovie);
};

window.openCustomList = async (encodedName) => {
    const name = decodeURIComponent(encodedName);
    const data = await DataManager.getUserData();
    const lists = getProfileBucket(data, 'customLists', {});
    getEl('collection-title').innerText = name;
    getEl('collection-grid').style.display = 'grid';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'none';
    renderMovies(lists[name] || [], getEl('collection-grid'), 'movie', {
        emptyText: 'Bu listede henüz içerik yok.'
    });
};

function openPlayerPage(movie, imdbId, sourceUrl, mode = 'watch') {
    const title = movie?.title || movie?.name || 'MIRACFLIX';
    const poster = movie?.poster_path ? IMG_URL + movie.poster_path : POSTER_FALLBACK;
    const backdrop = movie?.backdrop_path ? BACKDROP_URL + movie.backdrop_path : '';
    const year = (movie?.release_date || movie?.first_air_date || '').split('-')[0];
    const source = sourceUrl || (imdbId ? `https://www.playimdb.com/title/${imdbId}/?sub_tr=1&default_sub=tr` : '');

    getEl('player-sub-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    getEl('player-container').innerHTML = `
        <div class="watch-shell" style="${backdrop ? `--watch-bg: url('${backdrop}')` : ''}">
            <div class="watch-meta">
                <img src="${poster}" alt="${title}" class="watch-poster">
                <div>
                    <span class="watch-kicker">${mode === 'trailer' ? 'Fragman' : 'Şimdi Oynatılıyor'}</span>
                    <h1>${title}</h1>
                    <p>${year ? `${year} · ` : ''}${mode === 'trailer' ? 'YouTube fragmanı' : 'MIRACFLIX oynatıcı'}</p>
                </div>
            </div>
            <div class="watch-frame-wrap">
                <button type="button" class="player-fullscreen-btn" onclick="togglePlayerFullscreen()" title="Tam ekran">
                    <i data-lucide="maximize"></i>
                </button>
                ${source ? `<iframe src="${source}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen webkitallowfullscreen mozallowfullscreen referrerpolicy="no-referrer"></iframe>` : `
                    <div class="watch-unavailable">
                        <i data-lucide="circle-alert"></i>
                        <h2>Oynatıcı kaynağı bulunamadı</h2>
                        <p>Bu içerik için geçerli bir oynatma bağlantısı alınamadı.</p>
                    </div>
                `}
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

window.togglePlayerFullscreen = async () => {
    const target = getEl('player-container')?.querySelector('.watch-frame-wrap') || getEl('player-sub-overlay');
    if (!target) return;

    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }

        if (target.requestFullscreen) await target.requestFullscreen();
        else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
        else if (target.msRequestFullscreen) target.msRequestFullscreen();
    } catch (error) {
        showToast('Tam ekran başlatılamadı. Tarayıcı izni engelliyor olabilir.');
    }
};

// --- Data & Persistence ---
const DataManager = {
    getUserData: async () => {
        const user = await AuthManager.getUser();
        if (!user) {
            userDataCache = getGuestUserData();
            return userDataCache;
        }
        
        const { data, error } = await supabase
            .from('user_data')
            .select('*')
            .eq('id', user.id)
            .single();
            
        if (error && error.code !== 'PGRST116') {
            console.error('User Data Fetch Error:', error);
        }
        userDataCache = data;
        if (data) syncPublicProfile(data);
        return data;
    },
    
    updateUserData: async (update) => {
        const user = await AuthManager.getUser();
        if (!user) {
            updateGuestUserData(update);
            return;
        }
        
        const { error } = await supabase
            .from('user_data')
            .upsert({ id: user.id, ...update }, { onConflict: 'id' });
            
        if (error) console.error('User Data Update Error:', error);
        else {
            userDataCache = { ...(userDataCache || {}), ...update };
            syncPublicProfile(userDataCache);
        }
    },
    
    toggleWatchlist: async (movie) => {
        const data = await DataManager.getUserData();
        let watchlist = data?.watchlist || [];
        const item = normalizeStoredMedia(movie, currentBrowseType);
        const exists = watchlist.findIndex(m => isSameMedia(m, item));
        
        if (exists > -1) {
            watchlist.splice(exists, 1);
        } else {
            watchlist.push(item);
        }
        
        await DataManager.updateUserData({ watchlist });
        updateActionButtons();
    },

    removeFromWatchlist: async (movieId, mediaType = null) => {
        const data = await DataManager.getUserData();
        const targetKey = mediaType ? `${mediaType}:${movieId}` : null;
        const watchlist = (data?.watchlist || []).filter(m => targetKey ? getHistoryKey(m) !== targetKey : m.id !== movieId);
        await DataManager.updateUserData({ watchlist });
        renderCollection('favorites', 'Favorilerim');
        updateActionButtons();
    },

    toggleWatchLater: async (movie) => {
        const data = await DataManager.getUserData();
        let watchLater = getProfileBucket(data, 'watchLater', []);
        const item = normalizeStoredMedia(movie, currentBrowseType);
        const exists = watchLater.findIndex(m => isSameMedia(m, item));
        if (exists > -1) watchLater.splice(exists, 1);
        else watchLater = [item, ...watchLater].slice(0, 80);
        await DataManager.updateUserData({ watchLater: setProfileBucket(data, 'watchLater', watchLater) });
        renderWatchLater();
        updateActionButtons();
    },

    removeFromWatchLater: async (movieId, mediaType = null) => {
        const data = await DataManager.getUserData();
        const targetKey = mediaType ? `${mediaType}:${movieId}` : null;
        const watchLater = getProfileBucket(data, 'watchLater', []).filter(m => targetKey ? getHistoryKey(m) !== targetKey : m.id !== movieId);
        await DataManager.updateUserData({ watchLater: setProfileBucket(data, 'watchLater', watchLater) });
        renderWatchLater();
    },

    removeHistoryItem: async (movieId, mediaType = null) => {
        const data = await DataManager.getUserData();
        const targetKey = mediaType ? `${mediaType}:${movieId}` : null;
        const history = (data?.history || []).filter(m => {
            if (!targetKey) return m.id !== movieId;
            return getHistoryKey(m) !== targetKey;
        });
        await DataManager.updateUserData({ history });
    },

    removeFromHistory: async (movieId, mediaType = null) => {
        await DataManager.removeHistoryItem(movieId, mediaType);
        renderCollection('history', 'İzleme Geçmişi');
        renderContinueWatching();
    },
    
    addToHistory: async (movie) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        
        let history = data.history || [];
        const mediaType = getStoredMediaType(movie, currentBrowseType);
        const historyItem = normalizeStoredMedia(movie, mediaType);
        if (currentEpisode && mediaType === 'tv') {
            historyItem.last_episode = currentEpisode;
        }
        const historyKey = getHistoryKey(historyItem);
        history = [historyItem, ...history.filter(m => getHistoryKey(m) !== historyKey)].slice(0, 30);
        
        await DataManager.updateUserData({ history });
        renderContinueWatching();
    },

    setProgress: async (movie, percent, episode = currentEpisode) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        const item = normalizeStoredMedia(movie, currentBrowseType);
        if (episode && getStoredMediaType(item) === 'tv') item.last_episode = episode;
        const progress = getProfileBucket(data, 'watchProgress', {});
        progress[getHistoryKey(item)] = {
            percent: Math.max(0, Math.min(100, percent)),
            updated_at: new Date().toISOString(),
            episode: episode || null
        };
        let history = data.history || [];
        history = [item, ...history.filter(m => getHistoryKey(m) !== getHistoryKey(item))].slice(0, 30);
        await DataManager.updateUserData({
            watchProgress: setProfileBucket(data, 'watchProgress', progress),
            history
        });
        renderWatchStatePanel();
        renderContinueWatching();
    },

    markCompleted: async (movie, forceState = null) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        const item = normalizeStoredMedia(movie, currentBrowseType);
        let completed = getCompletedKeys(data);
        const key = getHistoryKey(item);
        const shouldComplete = forceState === null ? !completed.includes(key) : !!forceState;
        completed = shouldComplete ? [key, ...completed.filter(k => k !== key)] : completed.filter(k => k !== key);
        const progress = getProfileBucket(data, 'watchProgress', {});
        if (shouldComplete) {
            progress[key] = {
                percent: 100,
                updated_at: new Date().toISOString(),
                episode: currentEpisode || progress[key]?.episode || null
            };
        }
        await DataManager.updateUserData({
            completedItems: setProfileBucket(data, 'completedItems', completed),
            watchProgress: setProfileBucket(data, 'watchProgress', progress)
        });
        renderWatchStatePanel();
        renderContinueWatching();
        updateActionButtons();
    },

    markUnwatched: async (movie) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        const item = normalizeStoredMedia(movie, currentBrowseType);
        const key = getHistoryKey(item);
        const completed = getCompletedKeys(data).filter(k => k !== key);
        const progress = getProfileBucket(data, 'watchProgress', {});
        delete progress[key];
        const history = (data.history || []).filter(m => getHistoryKey(m) !== key);
        await DataManager.updateUserData({
            completedItems: setProfileBucket(data, 'completedItems', completed),
            watchProgress: setProfileBucket(data, 'watchProgress', progress),
            history
        });
        renderWatchStatePanel();
        renderContinueWatching();
        updateActionButtons();
    },

    hideItem: async (movie) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        const item = normalizeStoredMedia(movie, currentBrowseType);
        let hidden = getProfileBucket(data, 'hiddenItems', []);
        const key = getHistoryKey(item);
        if (!hidden.includes(key)) hidden = [key, ...hidden];
        await DataManager.updateUserData({ hiddenItems: setProfileBucket(data, 'hiddenItems', hidden) });
        getEl('movie-modal').style.display = 'none';
    },

    addToCustomList: async (listName, movie = currentMovie) => {
        const data = await DataManager.getUserData();
        if (!data || !movie || !listName.trim()) return;
        const lists = getProfileBucket(data, 'customLists', {});
        const name = listName.trim().slice(0, 40);
        const item = normalizeStoredMedia(movie, currentBrowseType);
        const current = lists[name] || [];
        lists[name] = [item, ...current.filter(m => !isSameMedia(m, item))].slice(0, 80);
        await DataManager.updateUserData({ customLists: setProfileBucket(data, 'customLists', lists) });
        showToast(`${name} listesine eklendi.`);
    },

    addFriend: async (friendName, friendUserId = '', friendAvatar = '') => {
        const data = await DataManager.getUserData();
        const user = await AuthManager.getUser();
        if (!user) {
            showToast('Arkadaşlık isteği göndermek için giriş yapmalısın.');
            return;
        }

        try {
            await syncPublicProfile(data);
            const target = friendUserId
                ? { id: friendUserId, display_name: friendName, avatar_url: friendAvatar }
                : await findPublicProfile(friendName);

            if (!target?.id) {
                showToast('Kullanıcı bulunamadı. Profil adını veya e-postayı kontrol et.');
                return;
            }
            if (target.id === user.id) {
                showToast('Kendine arkadaşlık isteği gönderemezsin.');
                return;
            }

            const activeProfile = getActiveProfile(data);
            const { data: request, error } = await supabase
                .from('friend_requests')
                .insert({
                    requester_id: user.id,
                    receiver_id: target.id,
                    requester_name: activeProfile.name || user.email,
                    requester_avatar: activeProfile.avatar,
                    receiver_name: target.display_name || friendName,
                    receiver_avatar: target.avatar_url || friendAvatar,
                    status: 'pending'
                })
                .select('id')
                .single();

            if (error) {
                if (error.code === '23505') showToast('Bu kullanıcıya zaten bekleyen bir istek var.');
                else throw error;
                return;
            }

            await supabase.from('notifications').insert({
                user_id: target.id,
                type: 'friend_request',
                title: 'Yeni arkadaşlık isteği',
                body: `${activeProfile.name || user.email} sana arkadaşlık isteği gönderdi.`,
                actor_id: user.id,
                actor_name: activeProfile.name || user.email,
                actor_avatar: activeProfile.avatar,
                request_id: request.id
            });

            showToast('Arkadaşlık isteği gönderildi.');
            renderProfileInfoView('social');
        } catch (error) {
            console.error('Friend request error:', error);
            showToast('Arkadaşlık sistemi için Supabase SQL kurulumu gerekiyor.');
        }
    },

    logActivity: async (activity) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        const feed = getProfileBucket(data, 'activityFeed', []);
        await DataManager.updateUserData({
            activityFeed: setProfileBucket(data, 'activityFeed', [{ ...activity, at: new Date().toISOString() }, ...feed].slice(0, 30))
        });
    },

    migrateUserData: async () => {
        const data = await DataManager.getUserData();
        if (!data || data.migrationVersion >= 2) return;
        const normalizedHistory = (data.history || []).map(item => normalizeStoredMedia(item, getStoredMediaType(item)));
        await DataManager.updateUserData({
            history: normalizedHistory,
            migrationVersion: 2
        });
    }
};

// --- Rendering Core ---
window.DataManager = DataManager;

function renderMovies(movies, container, type = 'movie', options = {}) {
    if (!container || !movies) return;
    const hiddenItems = userDataCache ? getProfileBucket(userDataCache, 'hiddenItems', []) : [];
    movies = movies.filter(movie => !hiddenItems.includes(getHistoryKey({ ...movie, media_type: getStoredMediaType(movie, type) })));
    if (!movies.length) {
        container.innerHTML = `<div class="empty-state">${options.emptyText || 'Henüz içerik yok.'}</div>`;
        return;
    }
    
    container.innerHTML = movies.map(movie => {
        const mediaType = getStoredMediaType(movie, type);
        const progress = userDataCache ? getProgressFor(userDataCache, { ...movie, media_type: mediaType }) : null;
        const completed = userDataCache ? isCompleted(userDataCache, { ...movie, media_type: mediaType }) : false;
        const lastEpisode = movie.last_episode;
        return `
        <div class="movie-card ${options.removable ? 'is-removable' : ''} ${completed ? 'is-watched' : ''}" onclick="openModalById(${movie.id}, '${mediaType}')">
            <img src="${movie.poster_path ? IMG_URL + movie.poster_path : POSTER_FALLBACK}" alt="${movie.title || movie.name}" loading="lazy">
            ${completed ? '<span class="watched-badge"><i data-lucide="check"></i> İzlendi</span>' : ''}
            ${lastEpisode ? `<span class="episode-badge">S${lastEpisode.season} B${lastEpisode.episode}</span>` : ''}
            <div class="card-info">
                <h4>${movie.title || movie.name}</h4>
                <p>${(movie.release_date || movie.first_air_date || '').split('-')[0]}${progress?.percent ? ` · %${progress.percent}` : ''}</p>
            </div>
            ${progress?.percent ? `<div class="card-progress"><span style="width:${progress.percent}%"></span></div>` : ''}
            ${options.removable ? `
                <button class="remove-card-btn" title="${options.removeTitle || 'Listeden kaldır'}" onclick="event.stopPropagation(); ${options.removeAction}(${movie.id}, '${mediaType}')">
                    <i data-lucide="x"></i>
                </button>
            ` : ''}
        </div>
    `;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

window.openModalById = async (id, type) => {
    const movie = await apiFetch(`/${type}/${id}`);
    if (movie) openModal(movie, type);
};

async function openModal(movie, type = 'movie') {
    currentMovie = { ...movie, type };
    window.currentMovie = currentMovie;
    const stateData = await DataManager.getUserData();
    const storedProgress = getProgressFor(stateData, currentMovie);
    currentEpisode = currentMovie.last_episode || storedProgress?.episode || null;
    currentImdbId = await getImdbId(movie.id, type);
    currentTrailerUrl = await getTrailer(movie.id, type);
    
    getEl('modal-bg').style.backgroundImage = movie.backdrop_path ? `url(${BACKDROP_URL + movie.backdrop_path})` : BACKDROP_FALLBACK;
    getEl('modal-poster-img').src = movie.poster_path ? IMG_URL + movie.poster_path : POSTER_FALLBACK;
    getEl('modal-title').innerText = movie.title || movie.name;
    getEl('modal-year').innerText = (movie.release_date || movie.first_air_date || '').split('-')[0];
    getEl('modal-rating').innerText = movie.vote_average ? movie.vote_average.toFixed(1) : '0.0';
    getEl('modal-overview').innerText = movie.overview;
    getEl('modal-type-badge').innerText = type === 'movie' ? 'Film' : 'Dizi';
    
    // Cast
    const castData = await apiFetch(`/${type}/${movie.id}/credits`);
    const directors = type === 'movie'
        ? (castData.crew || []).filter(person => person.job === 'Director')
        : (movie.created_by?.length ? movie.created_by : (castData.crew || []).filter(person => ['Director', 'Creator', 'Executive Producer'].includes(person.job)).slice(0, 3));
    const directorLabel = type === 'movie' ? 'Yönetmen:' : 'Yaratıcı:';
    const directorBlock = getEl('modal-director');
    if (directorBlock) {
        directorBlock.style.display = directors.length ? 'block' : 'none';
        directorBlock.querySelector('strong').innerText = directorLabel;
        getEl('modal-director-list').innerHTML = directors.map(person => `
            <span class="cast-link" onclick="openPersonById(${person.id}, '${escapeInline(person.name)}')">${escapeHtml(person.name)}</span>
        `).join(', ');
    }
    const castBlock = getEl('modal-cast');
    if (castBlock) castBlock.style.display = castData.cast?.length ? 'block' : 'none';
    getEl('modal-cast-list').innerHTML = castData.cast?.slice(0, 8).map(c => `
        <span class="cast-link" onclick="openPersonById(${c.id}, '${escapeInline(c.name)}')">${escapeHtml(c.name)}</span>
    `).join(', ') || 'Bilgi yok';
    
    // Social & Ratings
    fetchComments(movie.id);
    fetchMiracScore(movie.id);
    renderWatchStatePanel();
    updateActionButtons();
    
    getEl('movie-modal').style.display = 'block';
    getEl('movie-modal').scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    
    // Recommendations
    if (type === 'tv') renderSeasonGuide(movie);
    else getEl('tv-season-section').style.display = 'none';

    Promise.all([
        apiFetch(`/${type}/${movie.id}/recommendations`),
        apiFetch(`/${type}/${movie.id}/similar`)
    ]).then(([recommendations, similar]) => {
        const seen = new Set();
        const merged = [...(recommendations.results || []), ...(similar.results || [])]
            .filter(item => item.poster_path && !seen.has(item.id) && seen.add(item.id))
            .slice(0, 18);
        renderMovies(merged, getEl('similar-content-list'), type);
    });
}

async function renderSeasonGuide(show) {
    const section = getEl('tv-season-section');
    const select = getEl('season-select');
    const list = getEl('episode-list');
    const seasons = (show.seasons || []).filter(season => season.season_number > 0);
    if (!seasons.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    select.innerHTML = seasons.map(season => `
        <option value="${season.season_number}">${season.name || `${season.season_number}. Sezon`}</option>
    `).join('');

    const preferredSeason = currentEpisode?.season || seasons[0].season_number;
    select.value = preferredSeason;

    const loadSeason = async (seasonNumber) => {
        list.innerHTML = buildSkeletonCards(6);
        const data = await apiFetch(`/tv/${show.id}/season/${seasonNumber}`);
        list.innerHTML = (data.episodes || []).map(episode => {
            const isCurrent = currentEpisode?.season === seasonNumber && currentEpisode?.episode === episode.episode_number;
            return `
                <button class="episode-card ${isCurrent ? 'active' : ''}" type="button" onclick="selectEpisode(${seasonNumber}, ${episode.episode_number}, '${(episode.name || '').replace(/'/g, "\\'")}')">
                    <span>Bölüm ${episode.episode_number}</span>
                    <strong>${episode.name || 'Bölüm adı yok'}</strong>
                    <small>${episode.runtime ? `${episode.runtime} dk` : (episode.air_date || '').split('-')[0] || 'Tarih yok'}</small>
                </button>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    };

    select.onchange = () => loadSeason(parseInt(select.value));
    loadSeason(parseInt(select.value));
}

window.selectEpisode = (season, episode, title = '') => {
    currentEpisode = { season, episode, title };
    renderWatchStatePanel();
    document.querySelectorAll('.episode-card').forEach(card => card.classList.remove('active'));
    const clickEvent = typeof event !== 'undefined' ? event : null;
    clickEvent?.currentTarget?.classList.add('active');
};

// --- MiracScore System ---
async function fetchMiracScore(movieId) {
    const { data, error } = await supabase
        .from('ratings')
        .select('rating, user_id')
        .eq('movie_id', movieId.toString());
        
    if (error) return;
    
    const avgScore = data.length > 0 
        ? (data.reduce((acc, curr) => acc + curr.rating, 0) / data.length).toFixed(1) 
        : '0.0';
        
    getEl('mirac-score-val').innerText = avgScore;
    
    const user = await AuthManager.getUser();
    if (user) {
        const userRating = data.find(r => r.user_id === user.id)?.rating || 0;
        highlightStars(userRating);
    } else {
        highlightStars(0);
    }
}

function highlightStars(rating) {
    document.querySelectorAll('.star').forEach(star => {
        star.classList.toggle('active', parseInt(star.dataset.value) <= rating);
    });
}

async function saveRating(rating) {
    const user = await AuthManager.getUser();
    if (!user) return alert('Puan vermek için giriş yapmalısınız.');
    
    const { error } = await supabase
        .from('ratings')
        .upsert({
            user_id: user.id,
            movie_id: currentMovie.id.toString(),
            rating: rating
        }, { onConflict: ['user_id', 'movie_id'] });
        
    if (error) alert('Hata: ' + error.message);
    else fetchMiracScore(currentMovie.id);
}

// --- Comments System ---
async function fetchComments(movieId) {
    const list = getEl('comments-list');
    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('movie_id', movieId.toString())
        .order('created_at', { ascending: false });
        
    if (error) return;
    
    const user = await AuthManager.getUser();
    const likes = await getCommentLikes();
    const reactions = await getCommentReactions();
    
    list.innerHTML = data.length > 0 ? data.map(c => {
        const hasSpoiler = c.content?.startsWith('[spoiler]');
        const cleanContent = hasSpoiler ? c.content.replace('[spoiler]', '').trim() : c.content;
        const avatar = c.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.username}`;
        const liked = !!reactions[c.id];
        const likeCount = liked ? 1 : Math.min(1, likes[c.id] || 0);
        return `
        <div class="comment-card">
            <button type="button" class="comment-profile-link" onclick="openCommentProfile('${c.user_id || ''}', '${escapeInline(c.username)}', '${escapeInline(avatar)}')" title="${c.username} profiline git">
                <img src="${avatar}" class="comment-avatar" alt="${c.username}">
            </button>
            <div class="comment-info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <button type="button" class="comment-name-link" onclick="openCommentProfile('${c.user_id || ''}', '${escapeInline(c.username)}', '${escapeInline(avatar)}')">${c.username}</button>
                    ${user && user.id === c.user_id ? `
                        <div class="comment-actions">
                            <button onclick="deleteComment('${c.id}')" title="Sil"><i data-lucide="trash-2" style="width:16px;"></i></button>
                        </div>
                    ` : ''}
                </div>
                <p class="${hasSpoiler ? 'spoiler-content' : ''}" onclick="this.classList.remove('spoiler-content')">${cleanContent}</p>
                <div class="comment-toolbar">
                    <button type="button" class="${liked ? 'active' : ''}" onclick="likeComment('${c.id}')"><i data-lucide="thumbs-up"></i> ${likeCount}</button>
                    <button type="button" onclick="replyToComment('${c.username.replace(/'/g, "\\'")}')"><i data-lucide="reply"></i> Yanıtla</button>
                    ${hasSpoiler ? '<span>Spoiler</span>' : ''}
                </div>
            </div>
        </div>
    `;
    }).join('') : '<p style="color:#666; text-align:center; padding: 20px;">Henüz yorum yapılmamış. İlk yorumu sen yap!</p>';
    
    if (window.lucide) lucide.createIcons();
}

async function postComment() {
    const user = await AuthManager.getUser();
    if (!user) return alert('Yorum yapmak için giriş yapmalısınız.');
    
    const content = getEl('comment-textarea').value.trim();
    if (!content) return;
    const isSpoiler = getEl('comment-spoiler')?.checked;
    
    const userData = await DataManager.getUserData();
    const activeProfileIndex = parseInt(localStorage.getItem('activeProfileIndex') || '0');
    const activeProfile = (userData?.profiles || [])[activeProfileIndex] || { name: 'Kullanıcı' };
    
    const { error } = await supabase.from('comments').insert({
        user_id: user.id,
        movie_id: currentMovie.id.toString(),
        username: activeProfile.name,
        avatar_url: activeProfile.avatar,
        content: isSpoiler ? `[spoiler] ${content}` : content
    });
    
    if (error) alert('Hata: ' + error.message);
    else {
        getEl('comment-textarea').value = '';
        if (getEl('comment-spoiler')) getEl('comment-spoiler').checked = false;
        fetchComments(currentMovie.id);
    }
}

window.deleteComment = async (commentId) => {
    if (!confirm('Yorumu silmek istediğine emin misin?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) alert('Hata: ' + error.message);
    else fetchComments(currentMovie.id);
};

// --- Browse & Collections ---
async function renderCollection(type, title, extra = null) {
    getEl('collection-overlay').style.display = 'block';
    getEl('collection-title').innerText = title;
    
    // Hide all sub-views
    getEl('collection-grid').style.display = 'none';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'none';
    
    if (['favorites', 'history', 'watchLater'].includes(type)) {
        getEl('collection-grid').style.display = 'grid';
        const data = await DataManager.getUserData();
        const list = type === 'favorites'
            ? (data?.watchlist || [])
            : type === 'watchLater'
                ? getProfileBucket(data, 'watchLater', [])
                : (data?.history || []);
        renderMovies(list, getEl('collection-grid'), 'movie', {
            removable: true,
            removeAction: type === 'favorites' ? 'removeFromWatchlist' : type === 'watchLater' ? 'removeFromWatchLater' : 'removeFromHistory',
            removeTitle: type === 'favorites' ? 'Favorilerden kaldır' : type === 'watchLater' ? 'Sonra izle listesinden kaldır' : 'Geçmişten kaldır',
            emptyText: type === 'favorites' ? 'Favorilerinde henüz içerik yok.' : type === 'watchLater' ? 'Sonra izle listende henüz içerik yok.' : 'İzleme geçmişin henüz boş.'
        });
    } else if (['movie', 'tv', 'popular'].includes(type)) {
        getEl('browse-view').style.display = 'block';
        currentBrowseType = type;
        loadBrowse(1);
    } else if (type === 'search' || type === 'cast' || type === 'person') {
        getEl('collection-grid').style.display = 'grid';
        const grid = getEl('collection-grid');
        grid.innerHTML = buildSkeletonCards(10);
        
        const searchTopic = getEl('search-topic')?.value || '';
        const topicQuery = SEARCH_TOPIC_KEYWORDS[searchTopic] || searchTopic;
        const queryText = type === 'search' && topicQuery ? `${extra} ${topicQuery}` : extra;
        let endpoint = type === 'search' ? `/search/${getEl('search-type')?.value || 'multi'}` : '/search/person';
        const searchData = await apiFetch(endpoint, `&query=${encodeURIComponent(queryText)}`);
        
        if ((type === 'cast' || type === 'person') && searchData.results?.[0]) {
            const personId = searchData.results[0].id;
            renderPersonPage(personId, grid);
        } else {
            const searchYear = getEl('search-year')?.value;
            const searchGenre = getEl('search-genre')?.value;
            let results = (searchData.results || []).filter(item => ['movie', 'tv'].includes(item.media_type || getEl('search-type')?.value));
            if (searchYear) results = results.filter(item => (item.release_date || item.first_air_date || '').startsWith(searchYear));
            if (searchGenre) results = results.filter(item => (item.genre_ids || []).includes(parseInt(searchGenre)));
            renderMovies(results.slice(0, 30), grid);
        }
    } else if (type === 'profiles') {
        getEl('collection-form-container').style.display = 'block';
        document.querySelectorAll('.profile-form-view').forEach(v => v.style.display = 'none');
        getEl('profiles-view').style.display = 'block';
        renderProfiles();
    }
    
    // Close other modals
    getEl('movie-modal').style.display = 'none';
    getEl('profile-settings-modal').style.display = 'none';
}

async function renderPersonPage(personId, grid) {
    const [person, movieCredits, tvCredits] = await Promise.all([
        apiFetch(`/person/${personId}`),
        apiFetch(`/person/${personId}/movie_credits`),
        apiFetch(`/person/${personId}/tv_credits`)
    ]);
    getEl('collection-title').innerText = getPersonPageTitle(person.name, person.known_for_department);
    const excludedCreditGenres = new Set([10763, 10764, 10767]);
    const importantCrewJobs = new Set(['Director', 'Creator', 'Screenplay', 'Writer', 'Story', 'Producer', 'Executive Producer']);
    const selfCreditPattern = /\b(self|himself|herself|themself|archive footage|uncredited archive|host|guest)\b/i;
    const isDirectorProfile = person.known_for_department === 'Directing';
    const roleLabel = getPersonRoleLabel(person.known_for_department);
    const getCreditDate = item => item.release_date || item.first_air_date || '0000-00-00';
    const scoreCredit = item => {
        const year = parseInt(getCreditDate(item).slice(0, 4), 10) || 0;
        const recencyBoost = year ? Math.max(0, year - 1980) / 12 : 0;
        const voteBoost = Math.log10((item.vote_count || 0) + 1) * 9;
        const orderBoost = item.order === 0 ? 10 : item.order ? Math.max(0, 8 - item.order) : 0;
        const tvBoost = item.episode_count && item.episode_count > 10 ? 8 : 0;
        const directorBoost = item.job === 'Director' || item.job === 'Creator' ? 32 : importantCrewJobs.has(item.job) ? 10 : 0;
        return (item.popularity || 0) + voteBoost + orderBoost + tvBoost + recencyBoost + directorBoost;
    };

    const rawCredits = [
        ...(movieCredits.cast || []).map(item => ({ ...item, media_type: 'movie' })),
        ...(tvCredits.cast || []).map(item => ({ ...item, media_type: 'tv' })),
        ...(movieCredits.crew || []).filter(item => importantCrewJobs.has(item.job)).map(item => ({ ...item, media_type: 'movie' })),
        ...(tvCredits.crew || []).filter(item => importantCrewJobs.has(item.job)).map(item => ({ ...item, media_type: 'tv' }))
    ];

    const cleanCredits = rawCredits
        .filter(item => item.poster_path)
        .filter(item => item.job || !selfCreditPattern.test(item.character || ''))
        .filter(item => !(item.genre_ids || []).some(id => excludedCreditGenres.has(id)))
        .filter(item => !isDirectorProfile || item.job || (item.vote_count || 0) >= 80 || (item.popularity || 0) >= 8)
        .filter(item => (item.vote_count || 0) >= 10 || (item.popularity || 0) >= 2 || item.media_type === 'tv');

    const deduped = Array.from(cleanCredits.reduce((map, item) => {
        const title = (item.title || item.name || '').toLowerCase().trim();
        const key = `${item.media_type}:${item.id || title}`;
        const titleKey = `${item.media_type}:title:${title}`;
        const current = map.get(key) || map.get(titleKey);
        if (!current || scoreCredit(item) > scoreCredit(current)) {
            map.set(key, item);
            if (title) map.set(titleKey, item);
        }
        return map;
    }, new Map()).values())
        .filter((item, index, all) => all.findIndex(other => `${other.media_type}:${other.id}` === `${item.media_type}:${item.id}`) === index)
        .sort((a, b) => scoreCredit(b) - scoreCredit(a))
        .slice(0, 30);

    const fallbackCredits = rawCredits
        .filter(item => item.poster_path)
        .sort((a, b) => scoreCredit(b) - scoreCredit(a))
        .slice(0, 18);

    const combined = deduped.length >= 6 ? deduped : fallbackCredits;

    grid.innerHTML = `
        <article class="person-hero">
            <img src="${person.profile_path ? IMG_URL + person.profile_path : POSTER_FALLBACK}" alt="${person.name}">
            <div>
                <span class="section-kicker">${roleLabel} sayfası</span>
                <h2>${escapeHtml(person.name)}</h2>
                <p>${escapeHtml(person.biography || 'Bu kişi için biyografi bilgisi henüz yok.')}</p>
                <div class="person-meta">
                    <span>${roleLabel}</span>
                    <span>${person.birthday || 'Tarih yok'}</span>
                </div>
            </div>
        </article>
        <div class="section-heading-row person-credit-heading">
            <h3>${isDirectorProfile || person.known_for_department === 'Writing' ? 'Ürettiği işler' : 'Öne çıkan işleri'}</h3>
            <span>Talk show ve kısa konuk kayıtları ayıklandı</span>
        </div>
        <div class="person-credit-grid"></div>
    `;
    renderMovies(combined, grid.querySelector('.person-credit-grid'), 'movie');
}

window.openPersonById = async (personId, name = 'Kişi') => {
    getEl('collection-overlay').style.display = 'block';
    getEl('collection-title').innerText = getPersonPageTitle(name);
    getEl('collection-grid').style.display = 'grid';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'none';
    getEl('movie-modal').style.display = 'none';
    getEl('profile-settings-modal').style.display = 'none';
    const grid = getEl('collection-grid');
    grid.innerHTML = buildSkeletonCards(10);
    await renderPersonPage(personId, grid);
};

async function getFriendships() {
    const user = await AuthManager.getUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from('friendships')
        .select('friend_id, friend_name, friend_avatar, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('Friendships could not be loaded:', error);
        return [];
    }
    return data || [];
}

async function getFriendRequests(status = 'pending', direction = 'received') {
    const user = await AuthManager.getUser();
    if (!user) return [];
    const column = direction === 'sent' ? 'requester_id' : 'receiver_id';
    const { data, error } = await supabase
        .from('friend_requests')
        .select('*')
        .eq(column, user.id)
        .eq('status', status)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('Friend requests could not be loaded:', error);
        return [];
    }
    return data || [];
}

window.respondFriendRequest = async (requestId, action) => {
    const fn = action === 'accept' ? 'accept_friend_request' : 'decline_friend_request';
    const { error } = await supabase.rpc(fn, { request_uuid: requestId });
    if (error) {
        console.error('Friend request response error:', error);
        showToast('İstek güncellenemedi. Supabase SQL kurulumu eksik olabilir.');
        return;
    }
    showToast(action === 'accept' ? 'Arkadaşlık isteği kabul edildi.' : 'Arkadaşlık isteği reddedildi.');
    renderNotifications();
    renderProfileInfoView('social');
};

async function renderNotifications() {
    const list = getEl('notif-list');
    const badge = getEl('notif-badge');
    if (!list) return;

    const user = await AuthManager.getUser();
    let items = [];
    let unreadCount = 0;

    if (user) {
        try {
            const [requests, notificationResult] = await Promise.all([
                getFriendRequests('pending', 'received'),
                supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(12)
            ]);

            const notifications = notificationResult.error ? [] : notificationResult.data || [];
            unreadCount += notifications.filter(item => !item.is_read).length + requests.length;
            const seenRequests = new Set();

            items.push(...requests.map(request => {
                seenRequests.add(request.id);
                return `
                    <div class="notif-item friend-request-notif">
                        <img src="${request.requester_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${request.requester_name}`}" class="notif-avatar" alt="${escapeHtml(request.requester_name)}">
                        <div class="notif-info">
                            <h4>${escapeHtml(request.requester_name)}</h4>
                            <p>Sana arkadaşlık isteği gönderdi.</p>
                            <div class="notif-actions">
                                <button onclick="respondFriendRequest('${request.id}', 'accept')">Kabul et</button>
                                <button onclick="respondFriendRequest('${request.id}', 'decline')">Reddet</button>
                            </div>
                        </div>
                    </div>
                `;
            }));

            items.push(...notifications
                .filter(item => !item.request_id || !seenRequests.has(item.request_id))
                .map(item => `
                    <div class="notif-item">
                        <img src="${item.actor_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.actor_name || 'MIRACFLIX'}`}" class="notif-avatar" alt="${escapeHtml(item.actor_name || 'Bildirim')}">
                        <div class="notif-info">
                            <h4>${escapeHtml(item.title || 'Bildirim')}</h4>
                            <p>${escapeHtml(item.body || '')}</p>
                        </div>
                    </div>
                `));
        } catch (error) {
            console.warn('App notifications skipped:', error);
        }
    }

    try {
        const upcoming = await apiFetch('/movie/upcoming');
        if (getLocalPreferences().notifications && upcoming.results?.length) {
            items.push(...upcoming.results.slice(0, 5).map(m => `
                <div class="notif-item" onclick="openModalById(${m.id}, 'movie')">
                    <img src="${m.poster_path ? IMG_URL + m.poster_path : POSTER_FALLBACK}" class="notif-poster">
                    <div class="notif-info">
                        <h4>${escapeHtml(m.title)}</h4>
                        <p>Yakında sinemalarda.</p>
                    </div>
                </div>
            `));
        }
    } catch {
        // Upcoming notifications are optional.
    }

    list.innerHTML = items.join('') || '<p class="notif-empty">Şimdilik bildirim yok.</p>';
    if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';
}

async function markNotificationsRead() {
    const user = await AuthManager.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
}

window.renderCollection = renderCollection;
window.removeFromWatchlist = (movieId, mediaType = null) => DataManager.removeFromWatchlist(movieId, mediaType);
window.removeFromWatchLater = (movieId, mediaType = null) => DataManager.removeFromWatchLater(movieId, mediaType);
window.removeFromHistory = (movieId, mediaType = null) => DataManager.removeFromHistory(movieId, mediaType);
window.removeFromContinue = async (movieId, mediaType = null) => {
    await DataManager.removeHistoryItem(movieId, mediaType);
    renderContinueWatching();
};

function bindSettingsControls() {
    document.querySelectorAll('[data-setting]').forEach(input => {
        input.addEventListener('change', () => {
            savePreferences({ [input.dataset.setting]: input.type === 'checkbox' ? input.checked : input.value });
        });
    });
}

async function renderProfileInfoView(view) {
    getEl('collection-overlay').style.display = 'block';
    getEl('collection-grid').style.display = 'none';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'block';
    document.querySelectorAll('.profile-form-view').forEach(v => v.style.display = 'none');
    getEl('account-view').style.display = 'block';
    getEl('movie-modal').style.display = 'none';
    getEl('profile-settings-modal').style.display = 'none';

    const user = await AuthManager.getUser();
    const data = await DataManager.getUserData();
    const preferences = await getPreferences();
    const profiles = data?.profiles || [{ name: 'Kullanıcı' }];
    const activeIndex = parseInt(localStorage.getItem('activeProfileIndex') || '0');
    const activeProfile = profiles[activeIndex] || profiles[0];
    const accountCard = getEl('account-view').querySelector('.form-card');
    const [friendships, incomingRequests, sentRequests] = user
        ? await Promise.all([
            getFriendships(),
            getFriendRequests('pending', 'received'),
            getFriendRequests('pending', 'sent')
        ])
        : [[], [], []];
    const friendNames = friendships.map(friend => friend.friend_name).filter(Boolean);
    const incomingRequestCards = incomingRequests.map(request => `
        <div class="friend-request-card">
            <img src="${request.requester_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${request.requester_name}`}" alt="${escapeHtml(request.requester_name)}">
            <div>
                <strong>${escapeHtml(request.requester_name)}</strong>
                <span>Arkadaşlık isteği gönderdi.</span>
            </div>
            <button onclick="respondFriendRequest('${request.id}', 'accept')">Kabul</button>
            <button onclick="respondFriendRequest('${request.id}', 'decline')">Reddet</button>
        </div>
    `).join('');
    const sentRequestText = sentRequests.map(request => request.receiver_name).filter(Boolean).join(', ');

    const views = {
        account: {
            title: 'Hesap',
            icon: 'user',
            body: `
                <div class="info-row"><span>E-posta</span><strong>${user?.email || 'Giriş yapılmadı'}</strong></div>
                <div class="info-row"><span>Aktif profil</span><strong>${activeProfile.name}</strong></div>
                <div class="info-row"><span>Profil sayısı</span><strong>${profiles.length}/5</strong></div>
                <div class="profile-public-card">
                    <img src="${activeProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeProfile.name}`}" alt="${activeProfile.name}">
                    <div>
                        <span class="section-kicker">Profil sayfası</span>
                        <h3>${activeProfile.name}</h3>
                        <p>${(data?.history || []).length} geçmiş kaydı · ${getProfileBucket(data, 'watchLater', []).length} sonra izle · ${getCompletedKeys(data).length} tamamlanan</p>
                    </div>
                </div>
                ${user ? '' : '<button class="btn-xl primary" onclick="openAuthModal(event)"><i data-lucide="log-in"></i> Giriş Yap</button>'}
                <button class="btn-xl secondary" onclick="renderCollection('profiles', 'Profil Yönetimi')"><i data-lucide="users"></i> Profilleri Yönet</button>
            `
        },
        social: {
            title: 'Sosyal',
            icon: 'users-round',
            body: `
                <div class="settings-field">
                    <label>Arkadaşlık isteği gönder</label>
                    <div class="inline-control"><input id="friend-name-input" type="text" placeholder="Profil adı veya e-posta"><button class="btn-xl secondary" onclick="addFriendFromInput()">Gönder</button></div>
                </div>
                <div class="friend-request-list">
                    <h3>Gelen istekler</h3>
                    ${incomingRequestCards || '<p class="muted-note">Bekleyen arkadaşlık isteği yok.</p>'}
                </div>
                <div class="info-grid">
                    <div class="help-item"><strong>Arkadaşlar</strong><span>${friendNames.join(', ') || getProfileBucket(data, 'friends', []).join(', ') || 'Henüz arkadaş eklenmedi.'}</span></div>
                    <div class="help-item"><strong>Gönderilen istekler</strong><span>${sentRequestText || 'Bekleyen gönderilmiş istek yok.'}</span></div>
                    <div class="help-item"><strong>Arkadaşların ne izliyor?</strong><span>${getProfileBucket(data, 'activityFeed', []).slice(0, 4).map(item => item.text).join(' · ') || 'Aktivite akışı boş.'}</span></div>
                </div>
                <div class="page-hero-card"><span>Ortak liste</span><h3>Sonra İzle listeni arkadaşlarınla planlamak için hazır alan.</h3><p>Arkadaşlık sistemi artık istek, kabul ve bildirim akışıyla çalışır. Ortak listeler bir sonraki sosyal katman için hazır bekliyor.</p></div>
            `
        },
        lists: {
            title: 'Listelerim',
            icon: 'list-plus',
            body: (() => {
                const lists = getProfileBucket(data, 'customLists', {});
                const buttons = Object.keys(lists).map(name => `<button class="list-chip" onclick="openCustomList('${encodeURIComponent(name)}')">${name}<span>${lists[name].length}</span></button>`).join('');
                return `
                    <div class="settings-field">
                        <label>Şu an açık içerik için liste adı</label>
                        <div class="inline-control"><input id="custom-list-name-input" type="text" placeholder="En iyi korkularım"><button class="btn-xl secondary" onclick="addCurrentToCustomList()">Ekle</button></div>
                    </div>
                    <div class="list-chip-grid">${buttons || '<p class="muted-note">Henüz özel listen yok. Bir içerik detayından liste adı yazıp ekleyebilirsin.</p>'}</div>
                `;
            })()
        },
        settings: {
            title: 'Ayarlar',
            icon: 'settings',
            body: `
                <label class="settings-toggle">
                    <span><strong>Otomatik fragman önizleme</strong><small>Fragman destekli alanlarda önizleme davranışını açık tutar.</small></span>
                    <input type="checkbox" data-setting="trailerPreview" ${preferences.trailerPreview ? 'checked' : ''}>
                </label>
                <label class="settings-toggle">
                    <span><strong>Bildirim rozetleri</strong><small>Yakında gelen içerik bildirimlerini üst menüde gösterir.</small></span>
                    <input type="checkbox" data-setting="notifications" ${preferences.notifications ? 'checked' : ''}>
                </label>
                <label class="settings-toggle">
                    <span><strong>Kompakt mobil görünüm</strong><small>Telefon ekranında hero ve satırları daha sıkı gösterir.</small></span>
                    <input type="checkbox" data-setting="compactMobile" ${preferences.compactMobile ? 'checked' : ''}>
                </label>
                <label class="settings-toggle">
                    <span><strong>Sakin arka plan</strong><small>Film sayfasındaki büyük görsel efektleri azaltır.</small></span>
                    <input type="checkbox" data-setting="reduceBackdropMotion" ${preferences.reduceBackdropMotion ? 'checked' : ''}>
                </label>
                <div class="settings-field">
                    <label>Tema</label>
                    <select data-setting="theme">
                        <option value="classic" ${preferences.theme === 'classic' ? 'selected' : ''}>Klasik kırmızı</option>
                        <option value="blue" ${preferences.theme === 'blue' ? 'selected' : ''}>Mavi</option>
                        <option value="purple" ${preferences.theme === 'purple' ? 'selected' : ''}>Mor</option>
                        <option value="amoled" ${preferences.theme === 'amoled' ? 'selected' : ''}>AMOLED</option>
                    </select>
                </div>
                <div class="settings-field">
                    <label>Dil tercihi</label>
                    <select data-setting="language">
                        <option value="tr" ${preferences.language === 'tr' ? 'selected' : ''}>Türkçe</option>
                        <option value="en" ${preferences.language === 'en' ? 'selected' : ''}>English metadata</option>
                    </select>
                </div>
                <div class="settings-field">
                    <label>Ana sayfa yoğunluğu</label>
                    <select data-setting="homeLayout">
                        <option value="standard" ${preferences.homeLayout === 'standard' ? 'selected' : ''}>Standart</option>
                        <option value="discovery" ${preferences.homeLayout === 'discovery' ? 'selected' : ''}>Keşif rafları önde</option>
                    </select>
                </div>
                <p class="muted-note">Ayarlar cihazda hemen uygulanır; giriş yaptıysan profil verinle de eşitlenir.</p>
            `
        },
        help: {
            title: 'Yardım Merkezi',
            icon: 'help-circle',
            body: `
                <div class="help-item"><strong>Film açılmıyorsa</strong><span>Oynatıcı üçüncü taraf kaynak kullandığı için bazı içerikler geçici olarak yanıt vermeyebilir.</span></div>
                <div class="help-item"><strong>Favoriler nasıl silinir?</strong><span>Favorilerim veya İzleme Geçmişi ekranında kartın sağ üstündeki çarpıya bas.</span></div>
                <div class="help-item"><strong>Profil yönetimi</strong><span>Profil Ayarları > Profil Yönetimi içinden profil ekleyebilir veya düzenleyebilirsin.</span></div>
            `
        }
    };

    const selected = views[view];
    getEl('collection-title').innerText = selected.title;
    accountCard.innerHTML = `
        <div class="info-card-heading"><i data-lucide="${selected.icon}"></i><h2>${selected.title}</h2></div>
        <div class="info-card-body">${selected.body}</div>
    `;
    if (window.lucide) lucide.createIcons();
    if (view === 'settings') bindSettingsControls();
}

async function shareCurrentContent() {
    if (!currentMovie) return;
    const title = currentMovie.title || currentMovie.name || 'MIRACFLIX içeriği';
    const mediaType = getStoredMediaType(currentMovie, currentMovie.type || currentBrowseType);
    const url = `${location.origin}${location.pathname}#${mediaType}-${currentMovie.id}`;
    const text = `${title} önerim: ${url}`;
    try {
        if (navigator.share) {
            await navigator.share({ title, text, url });
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            showToast('Öneri bağlantısı panoya kopyalandı.');
        } else {
            prompt('Paylaşım metni', text);
        }
        DataManager.logActivity({ text: `${title} önerildi`, media: normalizeStoredMedia(currentMovie, mediaType) });
    } catch (error) {
        if (error.name !== 'AbortError') showToast('Paylaşım başlatılamadı.');
    }
}

function renderFooterPage(page) {
    const pages = {
        subtitles: {
            title: 'Seslendirme ve Alt Yazı',
            icon: 'captions',
            body: `
                <div class="page-hero-card"><span>TR odaklı izleme</span><h3>Altyazı ve dublaj seçenekleri tek yerde.</h3><p>Oynatıcı desteklediğinde Türkçe altyazı varsayılan olarak istenir, kalite seçimi kaynak durumuna göre korunur.</p></div>
                <div class="info-grid"><div class="help-item"><strong>Türkçe altyazı</strong><span>Uygun kaynaklarda otomatik seçilir.</span></div><div class="help-item"><strong>Dublaj</strong><span>Kaynak sağlıyorsa oynatıcı içinden değiştirilebilir.</span></div><div class="help-item"><strong>Kalite</strong><span>Bağlantına göre otomatik ölçeklenir.</span></div></div>
            `
        },
        media: {
            title: 'Medya Merkezi',
            icon: 'newspaper',
            body: `
                <div class="page-hero-card"><span>Yayın akışı</span><h3>Popüler, trend ve yüksek puanlı içerikler canlı katalogdan beslenir.</h3><p>Film posterleri, oyuncular, benzer içerikler ve fragmanlar TMDB verileriyle arayüze taşınır.</p></div>
                <button class="btn-xl secondary" onclick="renderCollection('popular', 'Yeni ve Popüler')"><i data-lucide="sparkles"></i> Yeni ve Popüler'i Aç</button>
            `
        },
        privacy: {
            title: 'Gizlilik',
            icon: 'shield',
            body: `
                <div class="page-hero-card"><span>Veri kontrolü</span><h3>Profil, favori, geçmiş ve ayar verileri sade bir kullanıcı modelinde tutulur.</h3><p>Aktif profil gibi cihaz tercihleri tarayıcıda, giriş yaptıysan liste ve yorum verileri Supabase tarafında saklanır.</p></div>
                <div class="info-grid"><div class="help-item"><strong>Yerel tercih</strong><span>Aktif profil ve cihaz ayarları.</span></div><div class="help-item"><strong>Hesap verisi</strong><span>Favoriler, geçmiş, yorumlar ve puanlar.</span></div></div>
            `
        },
        terms: {
            title: 'Kullanım Koşulları',
            icon: 'file-text',
            body: `
                <div class="page-hero-card"><span>Kullanım</span><h3>MIRACFLIX kişisel keşif, listeleme ve izleme deneyimi için tasarlandı.</h3><p>Posterler, fragmanlar ve bazı oynatma kaynakları üçüncü taraf servislerden gelebilir.</p></div>
                <div class="info-grid"><div class="help-item"><strong>Katalog</strong><span>Harici veri sağlayıcılardan beslenir.</span></div><div class="help-item"><strong>Kişisel kullanım</strong><span>Profil ve listeleme deneyimi kullanıcı odaklıdır.</span></div></div>
            `
        },
        help: {
            title: 'Yardım Merkezi',
            icon: 'help-circle',
            body: `
                <div class="page-hero-card"><span>Destek</span><h3>Sık kullanılan işlemler artık tek dokunuş uzağında.</h3><p>Mobil alt menüden arama, filmler, listem ve profil ekranlarına hızlı geçebilirsin.</p></div>
                <div class="info-grid"><div class="help-item"><strong>Favori silme</strong><span>Kartın sağ üstündeki çarpıyı kullan.</span></div><div class="help-item"><strong>Geçmiş temizleme</strong><span>İzlemeye Devam Et veya Geçmiş ekranından kaldır.</span></div><div class="help-item"><strong>Arama</strong><span>Arama ekranında yaz ve Enter'a bas.</span></div></div>
            `
        },
        company: {
            title: 'Kurumsal Bilgiler',
            icon: 'building-2',
            body: `
                <div class="page-hero-card"><span>MIRACFLIX</span><h3>Profil, keşif, favori, geçmiş, yorum ve puanlama odaklı kişisel yayın arayüzü.</h3><p>Ürün deneyimi Netflix hissini koruyup kişisel listeleme ve sosyal puanlama özellikleriyle genişletildi.</p></div>
                <div class="info-grid"><div class="help-item"><strong>Teknik</strong><span>Vite, Supabase ve TMDB API.</span></div><div class="help-item"><strong>Yayın</strong><span>Netlify CDN üzerinden canlı.</span></div></div>
            `
        },
        contact: {
            title: 'Bize Ulaşın',
            icon: 'mail',
            body: `
                <div class="page-hero-card"><span>İletişim</span><h3>Geri bildirim ve hata takibi için GitHub deposu kullanılabilir.</h3><p>Yeni özellik önerileri, UI sorunları ve yayın güncellemeleri repo üzerinden takip edilebilir.</p></div>
                <a class="btn-xl secondary page-link-button" href="https://github.com/miracxzx/miracflix" target="_blank" rel="noreferrer"><i data-lucide="github"></i> GitHub Reposunu Aç</a>
            `
        }
    };

    const selected = pages[page] || pages.help;
    getEl('collection-overlay').style.display = 'block';
    getEl('collection-title').innerText = selected.title;
    getEl('collection-grid').style.display = 'none';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'block';
    document.querySelectorAll('.profile-form-view').forEach(v => v.style.display = 'none');
    getEl('account-view').style.display = 'block';
    const accountCard = getEl('account-view').querySelector('.form-card');
    accountCard.innerHTML = `
        <div class="info-card-heading"><i data-lucide="${selected.icon}"></i><h2>${selected.title}</h2></div>
        <div class="info-card-body">${selected.body}</div>
    `;
    if (window.lucide) lucide.createIcons();
}

async function loadBrowse(page = 1) {
    currentPage = page;
    const grid = getEl('browse-grid');
    grid.innerHTML = '<p>İçerikler yükleniyor...</p>';
    
    const genre = getEl('filter-genre').value;
    const year = getEl('filter-year').value;
    const rating = getEl('filter-rating').value;
    const sort = getEl('filter-sort').value;
    
    let params = `&page=${page}&sort_by=${sort}&vote_average.gte=${rating}`;
    if (genre) params += `&with_genres=${genre}`;
    if (year) {
        if (currentBrowseType === 'movie') params += `&primary_release_year=${year}`;
        else params += `&first_air_date_year=${year}`;
    }
    
    let endpoint = `/discover/${currentBrowseType === 'popular' ? 'movie' : currentBrowseType}`;
    if (currentBrowseType === 'popular') endpoint = '/trending/all/week';
    
    const data = await apiFetch(endpoint, params);
    renderMovies(data.results, grid, currentBrowseType === 'tv' ? 'tv' : 'movie');
    
    // Pagination
    const pc = getEl('pagination-controls');
    pc.innerHTML = '';
    const maxPages = Math.min(data.total_pages || 1, 500);
    
    for (let i = Math.max(1, page - 2); i <= Math.min(maxPages, Math.max(1, page - 2) + 4); i++) {
        const btn = document.createElement('button');
        btn.className = `pagination-btn ${i === page ? 'active' : ''}`;
        btn.innerText = i;
        btn.onclick = () => loadBrowse(i);
        pc.appendChild(btn);
    }
}

// --- Profiles Management ---
async function renderProfiles() {
    const data = await DataManager.getUserData();
    const profiles = data?.profiles || [{ name: 'Kullanıcı' }];
    const activeIndex = parseInt(localStorage.getItem('activeProfileIndex') || '0');
    
    const container = document.querySelector('.profiles-container');
    if (!container) return;
    
    container.innerHTML = profiles.map((p, i) => `
        <div class="profile-slot ${i === activeIndex ? 'active' : ''} ${isManageMode ? 'manage-mode' : ''}" onclick="handleProfileClick(${i}, '${p.name.replace(/'/g, "\\'")}', '${p.avatar || ''}')">
            <div class="avatar-wrap">
                <img src="${p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`}">
                ${isManageMode ? '<div class="edit-overlay"><i data-lucide="edit-2"></i></div>' : ''}
            </div>
            <span>${p.name}</span>
        </div>
    `).join('') + (profiles.length < 5 && !isManageMode ? `
        <div class="profile-slot add-profile" onclick="openEditProfileModal(null, ${profiles.length})">
            <div class="avatar-wrap"><i data-lucide="plus"></i></div>
            <span>Ekle</span>
        </div>
    ` : '');
    
    if (window.lucide) lucide.createIcons();
}

window.handleProfileClick = (index, name, avatar) => {
    if (isManageMode) {
        openEditProfileModal({ name, avatar }, index);
    } else {
        localStorage.setItem('activeProfileIndex', index);
        location.reload();
    }
};

function openEditProfileModal(profile, index) {
    getEl('edit-profile-modal').style.display = 'flex';
    getEl('edit-profile-title').innerText = profile ? 'Profili Düzenle' : 'Yeni Profil';
    getEl('edit-profile-name-input').value = profile ? profile.name : '';
    const preview = getEl('edit-profile-preview');
    preview.src = profile && profile.avatar 
        ? profile.avatar 
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile ? profile.name : 'New'}`;
    const gallery = getEl('avatar-gallery');
    if (gallery) {
        const seeds = ['Mirac', 'Cinema', 'Action', 'Drama', 'SciFi', 'Comedy'];
        gallery.innerHTML = seeds.map(seed => {
            const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
            return `<button type="button" class="avatar-choice" onclick="document.getElementById('edit-profile-preview').src='${url}'"><img src="${url}" alt="${seed}"></button>`;
        }).join('');
    }
    getEl('edit-profile-modal').dataset.index = index;
    getEl('delete-profile-btn').style.display = profile ? 'block' : 'none';
}

window.openEditProfileModal = openEditProfileModal;

window.openAuthModal = (event) => {
    event?.stopPropagation();
    getEl('auth-modal').style.display = 'flex';
};

async function updateProfileUI() {
    const user = await AuthManager.getUser();
    const profileContainer = document.querySelector('.user-profile');
    
    if (!user) {
        const guestData = getGuestUserData();
        const guestProfile = guestData.profiles?.[getActiveProfileIndex()] || guestData.profiles?.[0] || { name: 'Misafir' };
        profileContainer.innerHTML = `<img src="${guestProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestProfile.name}`}">`;
        profileContainer.classList.remove('logged-out');
        getEl('profile-img-large').src = guestProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestProfile.name}`;
        getEl('profile-name-display').innerText = guestProfile.name;
        getEl('profile-email-display').innerText = 'Misafir profil';
        return;
    }
    profileContainer.classList.remove('logged-out');
    
    const data = await DataManager.getUserData();
    const profiles = data?.profiles || [{ name: 'Kullanıcı' }];
    const activeIndex = parseInt(localStorage.getItem('activeProfileIndex') || '0');
    const activeProfile = profiles[activeIndex] || profiles[0];
    syncPublicProfile({ ...(data || {}), profiles });
    
    profileContainer.innerHTML = `<img src="${activeProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeProfile.name}`}">`;
    
    getEl('profile-img-large').src = activeProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeProfile.name}`;
    getEl('profile-name-display').innerText = activeProfile.name;
    getEl('profile-email-display').innerText = user.email;
}

// --- Home Content Init ---
async function renderContinueWatching() {
    const data = await DataManager.getUserData();
    const section = getEl('continue-watching-section');
    const list = getEl('continue-watching-list');
    
    if (data?.history?.length) {
        section.style.display = 'block';
        renderMovies(data.history.slice(0, 12), list, 'movie', {
            removable: true,
            removeAction: 'removeFromContinue',
            removeTitle: 'İzlemeye devamdan kaldır'
        });
    } else {
        section.style.display = 'none';
    }
}

async function renderWatchLater() {
    const data = await DataManager.getUserData();
    const section = getEl('my-list-section');
    const list = getEl('my-list');
    const watchLater = getProfileBucket(data, 'watchLater', []);
    if (watchLater.length) {
        section.style.display = 'block';
        renderMovies(watchLater.slice(0, 12), list, 'movie', {
            removable: true,
            removeAction: 'removeFromWatchLater',
            removeTitle: 'Sonra izle listesinden kaldır'
        });
    } else {
        section.style.display = 'none';
    }
}

async function renderWatchStatePanel() {
    const panel = getEl('watch-state-panel');
    if (!panel || !currentMovie) return;
    const data = await DataManager.getUserData();
    const progress = getProgressFor(data, currentMovie);
    const completed = isCompleted(data, currentMovie);
    const episodeText = currentMovie.type === 'tv' && currentEpisode
        ? `<span><i data-lucide="list-video"></i> Son bölüm: S${currentEpisode.season} B${currentEpisode.episode}${currentEpisode.title ? ` · ${currentEpisode.title}` : ''}</span>`
        : '';
    panel.innerHTML = `
        <div class="watch-state-copy">
            <span><i data-lucide="${completed ? 'check-circle-2' : 'activity'}"></i> ${completed ? 'Tamamlandı' : 'İzleme durumu'}</span>
            ${episodeText}
            <strong>${progress?.percent ? `%${progress.percent} izlendi` : 'Henüz ilerleme yok'}</strong>
        </div>
        <div class="watch-state-actions">
            <button type="button" onclick="DataManager.setProgress(window.currentMovie, 25)"><i data-lucide="circle"></i> %25</button>
            <button type="button" onclick="DataManager.setProgress(window.currentMovie, 50)"><i data-lucide="circle-dot"></i> %50</button>
            <button type="button" onclick="DataManager.setProgress(window.currentMovie, 75)"><i data-lucide="loader"></i> %75</button>
            <button type="button" onclick="DataManager.setProgress(window.currentMovie, 100); DataManager.markCompleted(window.currentMovie, true)"><i data-lucide="check"></i> Bitti</button>
            <button type="button" class="danger" onclick="DataManager.markUnwatched(window.currentMovie)"><i data-lucide="rotate-ccw"></i> İzlenmedi</button>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function renderReleaseCalendar(items) {
    const calendar = getEl('release-calendar');
    if (!calendar) return;
    const upcoming = items
        .filter(item => item.release_date)
        .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))
        .slice(0, 8);
    calendar.innerHTML = upcoming.length ? upcoming.map(item => {
        const date = new Date(item.release_date);
        return `
            <button class="release-item" type="button" onclick="openModalById(${item.id}, 'movie')">
                <span>${date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
                <strong>${item.title}</strong>
                <small>${item.vote_average ? item.vote_average.toFixed(1) : 'Yeni'}</small>
            </button>
        `;
    }).join('') : '<div class="empty-state">Yakında çıkacak içerik bulunamadı.</div>';
}

async function updateActionButtons() {
    if (!currentMovie) return;
    const data = await DataManager.getUserData();
    const item = normalizeStoredMedia(currentMovie, currentMovie.type || currentBrowseType);
    const isInWatchlist = (data?.watchlist || []).some(m => isSameMedia(m, item));
    const isInWatchLater = getProfileBucket(data, 'watchLater', []).some(m => isSameMedia(m, item));
    const completed = isCompleted(data, item);
    
    const btn = getEl('add-to-watchlist');
    if (btn) {
        btn.classList.toggle('active', isInWatchlist);
        btn.innerHTML = isInWatchlist ? `<i data-lucide="heart"></i>` : `<i data-lucide="heart"></i>`;
    }
    const laterBtn = getEl('add-to-watchlater');
    if (laterBtn) {
        laterBtn.classList.toggle('active', isInWatchLater);
        laterBtn.innerHTML = isInWatchLater ? `<i data-lucide="clock-check"></i>` : `<i data-lucide="clock"></i>`;
    }
    const completedBtn = getEl('mark-completed-btn');
    if (completedBtn) {
        completedBtn.classList.toggle('active', completed);
        completedBtn.innerHTML = completed ? `<i data-lucide="check-circle-2"></i>` : `<i data-lucide="check-circle-2"></i>`;
    }
    if (window.lucide) lucide.createIcons();
}

// --- App Initialization ---
async function init() {
    applyPreferences();
    // Keep the intro visual, but never let slow APIs trap the whole UI behind it.
    setTimeout(revealApp, 1800);
    ['popular-movies', 'trending-tv', 'top-rated', 'mystery-tv', 'nineties-movies', 'imdb-eight-plus'].forEach(id => {
        const el = getEl(id);
        if (el) el.innerHTML = buildSkeletonCards(10);
    });

    // 1. Initial Content
    const popularData = await apiFetch('/movie/popular');
    if (popularData.results?.[0]) {
        heroMovieData = popularData.results[0];
        getEl('hero').style.backgroundImage = `url(${BACKDROP_URL + heroMovieData.backdrop_path})`;
        getEl('hero-title').innerText = heroMovieData.title;
        getEl('hero-overview').innerText = heroMovieData.overview;
        renderMovies(popularData.results, getEl('popular-movies'));
    }
    
    apiFetch('/trending/tv/week').then(d => renderMovies(d.results, getEl('trending-tv'), 'tv'));
    apiFetch('/movie/top_rated').then(d => renderMovies(d.results, getEl('top-rated')));
    apiFetch('/discover/tv', '&with_genres=9648&sort_by=popularity.desc').then(d => renderMovies(d.results, getEl('mystery-tv'), 'tv'));
    apiFetch('/discover/movie', '&primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31&sort_by=popularity.desc').then(d => renderMovies(d.results, getEl('nineties-movies')));
    apiFetch('/discover/movie', '&vote_average.gte=8&vote_count.gte=1000&sort_by=vote_average.desc').then(d => renderMovies(d.results, getEl('imdb-eight-plus')));
    apiFetch('/movie/upcoming').then(d => renderReleaseCalendar(d.results || []));
    
    // 2. Auth State UI
    updateProfileUI();
    getPreferences();
    
    const isLoggedIn = await AuthManager.isLoggedIn();
    await DataManager.migrateUserData();
    renderContinueWatching();
    renderWatchLater();
    renderNotifications();

    // 3. Remove Loading Intro once the first content pass has had a chance to land.
    setTimeout(revealApp, 1500);

    const hashMatch = location.hash.match(/^#(movie|tv)-(\d+)$/);
    if (hashMatch) {
        setTimeout(() => openModalById(parseInt(hashMatch[2]), hashMatch[1]), 600);
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    init();
    window.addEventListener('offline', () => showToast('Çevrimdışı moda geçtin.'));
    window.addEventListener('online', () => showToast('Bağlantı geri geldi.'));

    // Global Auth Listener
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            updateProfileUI();
            renderNotifications();
            if (event === 'SIGNED_IN') {
                renderContinueWatching();
                renderWatchLater();
            }
        }
    });

    // Navbar Links
    const navMap = {
        'nav-home': () => { location.reload(); },
        'nav-tv': () => renderCollection('tv', 'Tüm Diziler'),
        'nav-movies': () => renderCollection('movie', 'Tüm Filmler'),
        'nav-popular': () => renderCollection('popular', 'Yeni ve Popüler')
    };
    Object.entries(navMap).forEach(([id, action]) => getEl(id)?.addEventListener('click', e => {
        e.preventDefault();
        action();
    }));

    // Collection Close
    getEl('close-collection')?.addEventListener('click', () => {
        getEl('collection-overlay').style.display = 'none';
    });

    // Hero Buttons
    getEl('hero-play-btn')?.addEventListener('click', async () => {
        const imdbId = await getImdbId(heroMovieData.id);
        openPlayerPage(heroMovieData, imdbId);
        DataManager.addToHistory({
            id: heroMovieData.id,
            title: heroMovieData.title,
            poster_path: heroMovieData.poster_path,
            media_type: 'movie'
        });
    });
    
    getEl('hero-info-btn')?.addEventListener('click', () => openModal(heroMovieData));

    // Search
    getEl('search-btn')?.addEventListener('click', () => getEl('search-overlay').style.display = 'flex');
    getEl('close-search')?.addEventListener('click', () => getEl('search-overlay').style.display = 'none');
    
    // Profile
    getEl('user-profile-btn')?.addEventListener('click', async () => {
        getEl('collection-overlay').style.display = 'none';
        getEl('movie-modal').style.display = 'none';
        getEl('profile-settings-modal').style.display = 'flex';
    });
    getEl('search-input')?.addEventListener('keyup', e => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                renderCollection('search', `"${query}" Sonuçları`, query);
                getEl('search-overlay').style.display = 'none';
            }
        }
    });

    // Notifications Toggle
    getEl('notif-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        const drop = getEl('notif-dropdown');
        drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
        getEl('notif-badge').style.display = 'none';
        if (drop.style.display === 'block') {
            renderNotifications();
            markNotificationsRead();
        }
    });

    // Surprise (Shuffle)
    getEl('surprise-btn')?.addEventListener('click', async () => {
        const data = await apiFetch('/movie/popular', `&page=${Math.floor(Math.random() * 10) + 1}`);
        if (data.results?.length) openModal(data.results[Math.floor(Math.random() * 20)]);
    });

    // Profile Settings
    getEl('menu-profiles-manage')?.addEventListener('click', () => renderCollection('profiles', 'Profil Yönetimi'));
    getEl('menu-favorites')?.addEventListener('click', () => renderCollection('favorites', 'Favorilerim'));
    getEl('menu-watchlater')?.addEventListener('click', () => renderCollection('watchLater', 'Sonra İzle'));
    getEl('menu-history')?.addEventListener('click', () => renderCollection('history', 'İzleme Geçmişi'));
    getEl('menu-account')?.addEventListener('click', () => renderProfileInfoView('account'));
    getEl('menu-social')?.addEventListener('click', () => renderProfileInfoView('social'));
    getEl('menu-custom-lists')?.addEventListener('click', () => renderProfileInfoView('lists'));
    getEl('menu-settings')?.addEventListener('click', () => renderProfileInfoView('settings'));
    getEl('menu-help')?.addEventListener('click', () => renderProfileInfoView('help'));
    getEl('profile-logout')?.addEventListener('click', () => AuthManager.logout());

    // Profile Management Logic
    getEl('manage-profiles-btn')?.addEventListener('click', () => {
        isManageMode = !isManageMode;
        renderProfiles();
    });

    getEl('save-edit-profile-btn')?.addEventListener('click', async () => {
        const index = parseInt(getEl('edit-profile-modal').dataset.index);
        const name = getEl('edit-profile-name-input').value.trim();
        if (!name) return;
        
        const data = await DataManager.getUserData();
        let profiles = data?.profiles || [];
        
        if (index >= profiles.length) {
            profiles.push({ name, avatar: getEl('edit-profile-preview').src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}` });
        } else {
            profiles[index].name = name;
            profiles[index].avatar = getEl('edit-profile-preview').src;
        }
        
        await DataManager.updateUserData({ profiles });
        getEl('edit-profile-modal').style.display = 'none';
        renderProfiles();
    });

    getEl('delete-profile-btn')?.addEventListener('click', async () => {
        const index = parseInt(getEl('edit-profile-modal').dataset.index);
        const data = await DataManager.getUserData();
        let profiles = data?.profiles || [];
        
        profiles.splice(index, 1);
        await DataManager.updateUserData({ profiles });
        getEl('edit-profile-modal').style.display = 'none';
        renderProfiles();
    });

    getEl('cancel-edit-profile-btn')?.addEventListener('click', () => {
        getEl('edit-profile-modal').style.display = 'none';
    });

    // Auth Form
    getEl('auth-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const email = getEl('auth-email').value;
        const password = getEl('auth-password').value;
        
        const { error } = isLoginMode 
            ? await supabase.auth.signInWithPassword({ email, password })
            : await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: getAuthRedirectUrl()
                }
            });
            
        if (error) alert('Hata: ' + error.message);
        else location.reload();
    });

    getEl('switch-auth')?.addEventListener('click', e => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        getEl('auth-title').innerText = isLoginMode ? 'Giriş Yap' : 'Kayıt Ol';
        getEl('auth-submit-btn').innerText = isLoginMode ? 'Devam Et' : 'Kayıt Ol';
        e.target.innerText = isLoginMode ? 'Kayıt Ol' : 'Giriş Yap';
    });

    // Movie Modal Buttons
    getEl('add-to-watchlist')?.addEventListener('click', () => DataManager.toggleWatchlist(currentMovie));
    getEl('add-to-watchlater')?.addEventListener('click', () => DataManager.toggleWatchLater(currentMovie));
    getEl('mark-completed-btn')?.addEventListener('click', () => DataManager.markCompleted(currentMovie));
    getEl('hide-content-btn')?.addEventListener('click', () => DataManager.hideItem(currentMovie));
    getEl('share-content-btn')?.addEventListener('click', shareCurrentContent);
    
    getEl('modal-play-btn')?.addEventListener('click', () => {
        openPlayerPage(currentMovie, currentImdbId);
        DataManager.addToHistory(currentMovie);
        DataManager.setProgress(currentMovie, Math.max(5, getProgressFor(userDataCache, currentMovie)?.percent || 0), currentEpisode);
        DataManager.logActivity({ text: `${currentMovie.title || currentMovie.name} izleniyor`, media: normalizeStoredMedia(currentMovie, currentMovie.type) });
    });

    getEl('modal-trailer-btn')?.addEventListener('click', () => {
        if (currentTrailerUrl) {
            openPlayerPage(currentMovie, currentImdbId, currentTrailerUrl, 'trailer');
        } else {
            alert('Fragman bulunamadı.');
        }
    });

    getEl('post-comment-btn')?.addEventListener('click', postComment);

    document.querySelectorAll('[data-mobile-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('[data-mobile-action]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const action = btn.dataset.mobileAction;
            if (action === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
            if (action === 'search') getEl('search-overlay').style.display = 'flex';
            if (action === 'movies') renderCollection('movie', 'Tüm Filmler');
            if (action === 'watchLater') renderCollection('watchLater', 'Sonra İzle');
            if (action === 'profile') {
                getEl('collection-overlay').style.display = 'none';
                getEl('movie-modal').style.display = 'none';
                getEl('profile-settings-modal').style.display = 'flex';
            }
        });
    });

    document.querySelectorAll('[data-footer-page]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            renderFooterPage(link.dataset.footerPage);
        });
    });

    // Filters
    getEl('filter-rating')?.addEventListener('input', e => {
        getEl('rating-val').innerText = e.target.value + '+';
    });
    
    getEl('apply-filters-btn')?.addEventListener('click', () => loadBrowse(1));

    // Stars
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => saveRating(parseInt(star.dataset.value)));
    });

    // Close Modals
    document.querySelectorAll('.close-modal, .close-auth, .close-profile-settings, .close-player').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal, .player-sub-overlay').forEach(m => m.style.display = 'none');
            document.body.style.overflow = 'auto';
            if (btn.classList.contains('close-player')) getEl('player-container').innerHTML = '';
        });
    });

    // Global Click to close dropdowns
    window.addEventListener('click', () => {
        getEl('notif-dropdown').style.display = 'none';
    });
});
