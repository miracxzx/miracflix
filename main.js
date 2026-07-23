import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

// Initialize Supabase Client Safely
let supabase = null;
try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.warn('Supabase JS SDK could not be loaded from CDN. Falling back to local offline mode.');
    }
} catch (err) {
    console.error('Failed to initialize Supabase client:', err);
}

// Fallback Mock Supabase Client for offline/blocked network environments
if (!supabase) {
    supabase = {
        auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
            signOut: async () => ({ error: null }),
            onAuthStateChange: (callback) => {
                setTimeout(() => callback('SIGNED_OUT', null), 0);
                return { data: { subscription: { unsubscribe: () => {} } } };
            }
        },
        from: () => {
            const chain = {
                select: () => chain,
                insert: () => chain,
                update: () => chain,
                delete: () => chain,
                upsert: () => chain,
                eq: () => chain,
                neq: () => chain,
                in: () => chain,
                or: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({ data: null, error: null }),
                then: (resolve) => resolve({ data: [], error: null })
            };
            return chain;
        },
        channel: () => ({
            on: function() { return this; },
            subscribe: (callback) => {
                if (callback) callback('SUBSCRIBED');
                return { unsubscribe: () => {} };
            },
            track: async () => {},
            send: () => {}
        }),
        removeChannel: () => {},
        rpc: async () => ({ data: null, error: new Error('Supabase not available') })
    };
    
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            showToast('Veritabanı bağlantısı kurulamadı. Çevrimdışı/Misafir modunda çalışılıyor. Tercihleriniz yerel olarak saklanacaktır.');
        }, 3000);
    });
}


// Configuration
const API_KEY = import.meta.env?.VITE_TMDB_API_KEY || '20a0abcbeaf2431b5807118f4fe80c5e'; 
const BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'https://api.themoviedb.org/3' : '/api-tmdb/3';
const _isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const IMG_URL = _isLocal ? 'https://image.tmdb.org/t/p/w500' : '/tmdb-img/t/p/w500';
const BACKDROP_URL = _isLocal ? 'https://image.tmdb.org/t/p/original' : '/tmdb-img/t/p/original';
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
let currentPlayingMovie = null;
let currentPlayingImdbId = null;
let currentPlayingSourceUrl = null;
let sharedListsCache = {};
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
    if (!currentMovie) return;
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
            const [profileRes, listRes] = await Promise.all([
                supabase.from('user_data').select('*').eq('id', userId).maybeSingle(),
                supabase.from('custom_lists').select('id, name, description').eq('user_id', userId).eq('is_public', true).limit(8)
            ]);

            if (!profileRes.error && profileRes.data) {
                publicHistory = (profileRes.data.history || []).map(item => normalizeStoredMedia(item, getStoredMediaType(item))).slice(0, 8);
                publicLists = flattenPublicLists(profileRes.data.customLists || profileRes.data.customlists).slice(0, 8);
            }

            if (!listRes.error && listRes.data?.length) {
                const dbLists = listRes.data;
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
            console.warn('Public profile data could not be loaded:', error);
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

    const formCard = getEl('account-view')?.querySelector('.form-card');
    if (formCard) formCard.innerHTML = `
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

window.createCustomListFromInput = () => {
    DataManager.createCustomList(getEl('custom-list-name-input')?.value || '');
};

window.createSharedListFromInputs = () => {
    const names = Array.from(document.querySelectorAll('#shared-list-friends input:checked')).map(input => input.value);
    DataManager.createSharedList(getEl('shared-list-name-input')?.value || '', names);
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
        removable: true,
        removeAction: 'removeFromCustomList',
        removeArgs: `'${encodeURIComponent(name)}'`,
        removeTitle: 'Listeden kaldır',
        emptyText: 'Bu listede henüz içerik yok.'
    });
};

window.openSharedList = async (encodedName) => {
    const name = decodeURIComponent(encodedName);
    const list = sharedListsCache[name];
    getEl('collection-title').innerText = name;
    getEl('collection-grid').style.display = 'grid';
    getEl('browse-view').style.display = 'none';
    getEl('collection-form-container').style.display = 'none';
    renderMovies(list?.items || [], getEl('collection-grid'), 'movie', {
        removable: true,
        removeAction: 'removeFromSharedList',
        removeArgs: `'${encodeURIComponent(name)}'`,
        removeTitle: 'Ortak listeden kaldır',
        emptyText: 'Bu ortak listede henüz içerik yok.'
    });
};

function getPlayerSources(movie, imdbId) {
    const tmdbId = movie?.id;
    const isTv = movie?.type === 'tv' || movie?.media_type === 'tv';
    const season = currentEpisode?.season || 1;
    const episode = currentEpisode?.episode || 1;

    const sources = [
        {
            name: "PlayIMDb (Varsayılan)",
            url: imdbId ? `https://www.playimdb.com/title/${imdbId}/?sub_tr=1&default_sub=tr` : ''
        },
        {
            name: "VidSrc.to (Alternatif 1)",
            url: isTv 
                ? `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` 
                : `https://vidsrc.to/embed/movie/${imdbId || tmdbId}`
        },
        {
            name: "VidSrc.me (Alternatif 2)",
            url: isTv 
                ? `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}` 
                : `https://vidsrc.xyz/embed/movie?imdb=${imdbId}`
        },
        {
            name: "Embed.su (Alternatif 3)",
            url: isTv 
                ? `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}` 
                : `https://embed.su/embed/movie/${tmdbId}`
        },
        {
            name: "SuperEmbed (Alternatif 4)",
            url: isTv 
                ? `https://multiembed.mov/?video_id=${imdbId || tmdbId}&tmdb=1&s=${season}&e=${episode}` 
                : `https://multiembed.mov/?video_id=${imdbId || tmdbId}&tmdb=1`
        }
    ];

    return sources.filter(s => s.url);
}

window.switchPlayerSource = (url) => {
    const iframe = getEl('player-container')?.querySelector('iframe');
    if (iframe) {
        iframe.src = url;
        currentPlayingSourceUrl = url;
    }
};

function openPlayerPage(movie, imdbId, sourceUrl, mode = 'watch') {
    const title = movie?.title || movie?.name || 'MIRACFLIX';
    const poster = movie?.poster_path ? IMG_URL + movie.poster_path : POSTER_FALLBACK;
    const backdrop = movie?.backdrop_path ? BACKDROP_URL + movie.backdrop_path : '';
    const year = (movie?.release_date || movie?.first_air_date || '').split('-')[0];
    
    let source = sourceUrl;
    let sourceSelectorHtml = '';

    if (mode === 'watch') {
        currentPlayingMovie = movie;
        currentPlayingImdbId = imdbId;
        
        const sources = getPlayerSources(movie, imdbId);
        if (!source && sources.length > 0) {
            source = sources[0].url;
        }
        currentPlayingSourceUrl = source;

        sourceSelectorHtml = `
            <div class="player-source-selector-wrap" style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                <label for="player-source-select" style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; white-space: nowrap;">Kaynak Değiştir:</label>
                <select id="player-source-select" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; outline: none; cursor: pointer; min-width: 150px; font-family: inherit;" onchange="switchPlayerSource(this.value)">
                    ${sources.map(s => `<option value="${escapeHtml(s.url)}" ${s.url === source ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                </select>
            </div>
        `;
    } else {
        source = sourceUrl || (imdbId ? `https://www.playimdb.com/title/${imdbId}/?sub_tr=1&default_sub=tr` : '');
    }

    getEl('player-sub-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    getEl('player-container').innerHTML = `
        <div class="watch-shell" style="${backdrop ? `--watch-bg: url('${backdrop.replace(/["'()]/g, '')}')` : ''}">
            <div class="watch-meta" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div style="display: flex; align-items: center; gap: 18px;">
                    <img src="${poster}" alt="${title}" class="watch-poster">
                    <div>
                        <span class="watch-kicker">${mode === 'trailer' ? 'Fragman' : 'Şimdi Oynatılıyor'}</span>
                        <h1>${title}</h1>
                        <p style="margin-bottom: 4px;">${year ? `${year} · ` : ''}${mode === 'trailer' ? 'YouTube fragmanı' : 'MIRACFLIX oynatıcı'}</p>
                        ${sourceSelectorHtml}
                    </div>
                </div>
                ${mode !== 'trailer' ? `
                    <div class="party-btn-group" style="display: flex; gap: 10px; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="startWatchParty()"><i data-lucide="users" style="width: 14px; height: 14px;"></i> Party Başlat</button>
                        <button type="button" class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="joinWatchParty()"><i data-lucide="user-plus" style="width: 14px; height: 14px;"></i> Katıl</button>
                    </div>
                ` : ''}
            </div>
            <div class="watch-frame-wrap">
                <button type="button" class="player-fullscreen-btn" onclick="togglePlayerFullscreen()" title="Tam ekran">
                    <i data-lucide="maximize"></i>
                </button>
                ${source ? `<iframe src="${source}" sandbox="allow-scripts allow-same-origin allow-forms" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen webkitallowfullscreen mozallowfullscreen referrerpolicy="no-referrer"></iframe>` : `
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

function openPlayerPageForMember(movie, imdbId, sourceUrl) {
    if (currentPlayingMovie && currentPlayingMovie.id === movie?.id) return;
    openPlayerPage(movie, imdbId, sourceUrl, 'watch');
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
        
        try {
            const [userDataResult, sharedListsResult] = await Promise.all([
                supabase.from('user_data').select('*').eq('id', user.id).single(),
                supabase.from('shared_playlists').select('*')
            ]);
            
            let data = userDataResult.data;
            if (userDataResult.error && userDataResult.error.code !== 'PGRST116') {
                console.error('User Data Fetch Error:', userDataResult.error);
            }
            
            // Cache the shared lists
            sharedListsCache = {};
            if (sharedListsResult.data && !sharedListsResult.error) {
                sharedListsResult.data.forEach(list => {
                    sharedListsCache[list.name] = {
                        id: list.id,
                        name: list.name,
                        collaborators: list.collaborators,
                        items: list.items,
                        creator_id: list.creator_id,
                        creator_name: list.creator_name
                    };
                });
            }
            
            userDataCache = data;
            if (data) syncPublicProfile(data);
            return data;
        } catch (dbErr) {
            console.warn('DB Fetch error in getUserData, using fallback:', dbErr);
            const { data, error } = await supabase
                .from('user_data')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error && error.code !== 'PGRST116') {
                console.error('User Data Fallback Fetch Error:', error);
            }
            userDataCache = data;
            if (data) syncPublicProfile(data);
            return data;
        }
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
        if (!data || !movie || !listName.trim()) {
            showToast('Liste adı ve açık içerik gerekli.');
            return;
        }
        const lists = getProfileBucket(data, 'customLists', {});
        const name = listName.trim().slice(0, 40);
        const item = normalizeStoredMedia(movie, currentBrowseType);
        const current = lists[name] || [];
        lists[name] = [item, ...current.filter(m => !isSameMedia(m, item))].slice(0, 80);
        await DataManager.updateUserData({ customLists: setProfileBucket(data, 'customLists', lists) });
        showToast(`${name} listesine eklendi.`);
        renderListPicker();
    },

    createCustomList: async (listName) => {
        const data = await DataManager.getUserData();
        if (!data || !listName.trim()) return showToast('Liste adı yazmalısın.');
        const lists = getProfileBucket(data, 'customLists', {});
        const name = listName.trim().slice(0, 40);
        if (!lists[name]) lists[name] = [];
        await DataManager.updateUserData({ customLists: setProfileBucket(data, 'customLists', lists) });
        showToast(`${name} listesi oluşturuldu.`);
        renderProfileInfoView('lists');
    },

    removeFromCustomList: async (movieId, mediaType = null, encodedName = '') => {
        const data = await DataManager.getUserData();
        const name = decodeURIComponent(encodedName);
        const lists = getProfileBucket(data, 'customLists', {});
        const targetKey = mediaType ? `${mediaType}:${movieId}` : null;
        lists[name] = (lists[name] || []).filter(m => targetKey ? getHistoryKey(m) !== targetKey : m.id !== movieId);
        await DataManager.updateUserData({ customLists: setProfileBucket(data, 'customLists', lists) });
        openCustomList(encodeURIComponent(name));
    },

    deleteCustomList: async (encodedName) => {
        const data = await DataManager.getUserData();
        const name = decodeURIComponent(encodedName);
        const lists = getProfileBucket(data, 'customLists', {});
        delete lists[name];
        await DataManager.updateUserData({ customLists: setProfileBucket(data, 'customLists', lists) });
        showToast(`${name} listesi silindi.`);
        renderProfileInfoView('lists');
    },

    createSharedList: async (listName, collaboratorNames = []) => {
        const user = await AuthManager.getUser();
        if (!user) return showToast('Ortak liste oluşturmak için giriş yapmalısın.');
        const data = await DataManager.getUserData();
        if (!data || !listName.trim()) return showToast('Ortak liste adı yazmalısın.');
        const name = listName.trim().slice(0, 40);
        
        const activeProfile = getActiveProfile(data);
        const creatorName = activeProfile?.name || 'Lider';
        
        const { data: newRow, error } = await supabase
            .from('shared_playlists')
            .insert({
                name,
                creator_id: user.id,
                creator_name: creatorName,
                collaborators: collaboratorNames.filter(Boolean),
                items: []
            })
            .select()
            .single();
            
        if (error) {
            console.error('Shared list create error:', error);
            showToast('Ortak liste oluşturulamadı. Veritabanı tablosu kurulu olmayabilir.');
            return;
        }
        
        sharedListsCache[newRow.id] = {
            id: newRow.id,
            name: newRow.name,
            collaborators: newRow.collaborators,
            items: newRow.items,
            creator_id: newRow.creator_id,
            creator_name: newRow.creator_name
        };
        
        showToast(`${name} ortak listesi hazır.`);
        renderProfileInfoView('lists');
    },

    addToSharedList: async (listName, movie = currentMovie) => {
        if (!movie || !listName.trim()) return showToast('Ortak liste ve açık içerik gerekli.');
        const name = listName.trim();
        const list = sharedListsCache[name];
        if (!list) return showToast('Ortak liste bulunamadı.');
        
        const item = normalizeStoredMedia(movie, currentMovie?.type || currentBrowseType);
        const updatedItems = [item, ...(list.items || []).filter(m => !isSameMedia(m, item))].slice(0, 80);
        
        const { error } = await supabase
            .from('shared_playlists')
            .update({ items: updatedItems, updated_at: new Date().toISOString() })
            .eq('id', list.id);
            
        if (error) {
            console.error('Shared list add error:', error);
            showToast('Ortak listeye eklenemedi.');
            return;
        }
        
        list.items = updatedItems;
        showToast(`${name} ortak listesine eklendi.`);
        renderListPicker();
    },

    removeFromSharedList: async (movieId, mediaType = null, encodedName = '') => {
        const name = decodeURIComponent(encodedName);
        const list = sharedListsCache[name];
        if (!list) return;
        
        const targetKey = mediaType ? `${mediaType}:${movieId}` : null;
        const updatedItems = (list.items || []).filter(m => targetKey ? getHistoryKey(m) !== targetKey : m.id !== movieId);
        
        const { error } = await supabase
            .from('shared_playlists')
            .update({ items: updatedItems, updated_at: new Date().toISOString() })
            .eq('id', list.id);
            
        if (error) {
            console.error('Shared list remove error:', error);
            showToast('Ortak listeden silinemedi.');
            return;
        }
        
        list.items = updatedItems;
        openSharedList(encodeURIComponent(name));
    },

    deleteSharedList: async (encodedName) => {
        const name = decodeURIComponent(encodedName);
        const list = sharedListsCache[name];
        if (!list) return;
        
        const { error } = await supabase
            .from('shared_playlists')
            .delete()
            .eq('id', list.id);
            
        if (error) {
            console.error('Shared list delete error:', error);
            showToast('Ortak liste silinemedi.');
            return;
        }
        
        delete sharedListsCache[name];
        showToast(`${name} ortak listesi silindi.`);
        renderProfileInfoView('lists');
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
        const removeArgs = options.removeArgs ? `, ${options.removeArgs}` : '';
        return `
        <div class="movie-card ${options.removable ? 'is-removable' : ''} ${completed ? 'is-watched' : ''}" onclick="openModalById(${movie.id}, '${mediaType}')">
            <img src="${movie.poster_path ? IMG_URL + movie.poster_path : POSTER_FALLBACK}" alt="${escapeHtml(movie.title || movie.name)}" loading="lazy">
            ${completed ? '<span class="watched-badge"><i data-lucide="check"></i> İzlendi</span>' : ''}
            ${lastEpisode ? `<span class="episode-badge">S${lastEpisode.season} B${lastEpisode.episode}</span>` : ''}
            <div class="card-info">
                <h4>${escapeHtml(movie.title || movie.name)}</h4>
                <p>${(movie.release_date || movie.first_air_date || '').split('-')[0]}${progress?.percent ? ` · %${progress.percent}` : ''}</p>
            </div>
            ${progress?.percent ? `<div class="card-progress"><span style="width:${progress.percent}%"></span></div>` : ''}
            ${options.removable ? `
                <button class="remove-card-btn" title="${options.removeTitle || 'Listeden kaldır'}" onclick="event.stopPropagation(); ${options.removeAction}(${movie.id}, '${mediaType}'${removeArgs})">
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
    getEl('modal-overview').innerText = movie.overview;
    getEl('modal-type-badge').innerText = type === 'movie' ? 'Film' : 'Dizi';
    
    // Circular Progress & AI Insights
    updateCircularRatings(movie.vote_average, movie.popularity, 0.0);
    renderAiInsights(movie);
    
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
                <button class="episode-card ${isCurrent ? 'active' : ''}" type="button" data-season="${seasonNumber}" data-episode="${episode.episode_number}" data-title="${escapeHtml(episode.name || '')}" onclick="selectEpisode(this.dataset.season, this.dataset.episode, this.dataset.title)">
                    <span>Bölüm ${episode.episode_number}</span>
                    <strong>${escapeHtml(episode.name || 'Bölüm adı yok')}</strong>
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
        
    const miracValEl = getEl('ring-mirac-val');
    if (miracValEl) miracValEl.innerText = avgScore;
    updateCircularRatings(currentMovie?.vote_average, currentMovie?.popularity, avgScore);
    
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
    if (!user) return showToast('Puan vermek için giriş yapmalısınız.');
    
    const { error } = await supabase
        .from('ratings')
        .upsert({
            user_id: user.id,
            movie_id: currentMovie.id.toString(),
            rating: rating
        }, { onConflict: ['user_id', 'movie_id'] });
        
    if (error) showToast('Hata: ' + error.message);
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
            <button type="button" class="comment-profile-link" onclick="openCommentProfile('${c.user_id || ''}', '${escapeInline(c.username)}', '${escapeInline(avatar)}')" title="${escapeHtml(c.username)} profiline git">
                <img src="${escapeHtml(avatar)}" class="comment-avatar" alt="${escapeHtml(c.username)}">
            </button>
            <div class="comment-info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <button type="button" class="comment-name-link" onclick="openCommentProfile('${c.user_id || ''}', '${escapeInline(c.username)}', '${escapeInline(avatar)}')">${escapeHtml(c.username)}</button>
                    ${user && user.id === c.user_id ? `
                        <div class="comment-actions">
                            <button onclick="deleteComment('${c.id}')" title="Sil"><i data-lucide="trash-2" style="width:16px;"></i></button>
                        </div>
                    ` : ''}
                </div>
                <p class="${hasSpoiler ? 'spoiler-content' : ''}" onclick="this.classList.remove('spoiler-content')">${escapeHtml(cleanContent)}</p>
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
    if (!user) return showToast('Yorum yapmak için giriş yapmalısınız.');
    
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
    
    if (error) showToast('Hata: ' + error.message);
    else {
        getEl('comment-textarea').value = '';
        if (getEl('comment-spoiler')) getEl('comment-spoiler').checked = false;
        fetchComments(currentMovie.id);
    }
}

window.deleteComment = async (commentId) => {
    if (!confirm('Yorumu silmek istediğine emin misin?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) showToast('Hata: ' + error.message);
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
    getEl('collection-title').innerText = `${person.name} ${getPersonRoleLabel(person.known_for_department) === 'Oyuncu' ? 'Filmleri' : 'Sayfası'}`;
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
            <img src="${person.profile_path ? IMG_URL + person.profile_path : POSTER_FALLBACK}" alt="${escapeHtml(person.name)}">
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
    getEl('collection-title').innerText = `${name} ${getPersonRoleLabel('') === 'Oyuncu' ? 'Filmleri' : 'Sayfası'}`;
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

async function renderListPicker() {
    const panel = document.querySelector('.list-picker-popover');
    if (!panel) return;
    const data = await DataManager.getUserData();
    const lists = getProfileBucket(data, 'customLists', {});
    const sharedLists = sharedListsCache;
    const listButtons = Object.keys(lists).map(name => `
        <button type="button" onclick="DataManager.addToCustomList('${escapeInline(name)}')">
            <span>${escapeHtml(name)}</span><em>${lists[name].length}</em>
        </button>
    `).join('');
    const sharedButtons = Object.values(sharedLists).map(list => `
        <button type="button" onclick="DataManager.addToSharedList('${escapeInline(list.name)}')">
            <span>${escapeHtml(list.name)}</span><em>${(list.items || []).length}</em>
        </button>
    `).join('');

    panel.innerHTML = `
        <div class="list-picker-head">
            <strong>Listeye ekle</strong>
            <button type="button" onclick="closeListPicker()"><i data-lucide="x"></i></button>
        </div>
        <div class="settings-field">
            <label>Yeni kişisel liste</label>
            <div class="inline-control">
                <input id="quick-list-name-input" type="text" placeholder="Pazar filmleri">
                <button class="btn-xl secondary" onclick="DataManager.addToCustomList(document.getElementById('quick-list-name-input').value)">Ekle</button>
            </div>
        </div>
        <div class="list-picker-section">
            <h4>Kişisel listeler</h4>
            <div class="list-picker-buttons">${listButtons || '<p class="muted-note">Henüz kişisel listen yok.</p>'}</div>
        </div>
        <div class="list-picker-section">
            <h4>Ortak listeler</h4>
            <div class="list-picker-buttons">${sharedButtons || '<p class="muted-note">Henüz ortak listen yok.</p>'}</div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

window.openListPicker = async () => {
    if (!currentMovie) return showToast('Önce bir içerik açmalısın.');
    let panel = document.querySelector('.list-picker-popover');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'list-picker-popover';
        document.body.appendChild(panel);
    }
    panel.classList.add('show');
    await renderListPicker();
};

window.closeListPicker = () => {
    document.querySelector('.list-picker-popover')?.classList.remove('show');
};

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
window.removeFromCustomList = (movieId, mediaType = null, encodedName = '') => DataManager.removeFromCustomList(movieId, mediaType, encodedName);
window.removeFromSharedList = (movieId, mediaType = null, encodedName = '') => DataManager.removeFromSharedList(movieId, mediaType, encodedName);
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
            body: (() => {
                const friendListHtml = friendships.length > 0 
                    ? friendships.map(friend => `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.04); padding: 12px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="${friend.friend_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.friend_name}`}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                                <strong>${escapeHtml(friend.friend_name)}</strong>
                            </div>
                            <button type="button" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 4px;" onclick="openDirectChat('${friend.friend_id}', '${escapeInline(friend.friend_name)}', '${escapeInline(friend.friend_avatar || '')}')"><i data-lucide="message-square" style="width: 14px; height: 14px;"></i> Mesaj</button>
                        </div>
                    `).join('')
                    : '<p class="muted-note">Henüz arkadaş eklenmemiş.</p>';

                return `
                    <div class="settings-field">
                        <label>Arkadaşlık isteği gönder</label>
                        <div class="inline-control"><input id="friend-name-input" type="text" placeholder="Profil adı veya e-posta"><button class="btn-xl secondary" onclick="addFriendFromInput()">Gönder</button></div>
                    </div>
                    <div class="friend-request-list">
                        <h3>Gelen istekler</h3>
                        ${incomingRequestCards || '<p class="muted-note">Bekleyen arkadaşlık isteği yok.</p>'}
                    </div>
                    <div style="margin-top: 30px;">
                        <h3 style="margin-bottom: 15px;"><i data-lucide="users"></i> Arkadaşlarım</h3>
                        ${friendListHtml}
                    </div>
                    <div id="direct-chat-area" style="margin-top: 30px; display: none;"></div>
                    <div class="info-grid" style="margin-top: 30px;">
                        <div class="help-item"><strong>Gönderilen istekler</strong><span>${sentRequestText || 'Bekleyen gönderilmiş istek yok.'}</span></div>
                        <div class="help-item"><strong>Arkadaşların ne izliyor?</strong><span>${getProfileBucket(data, 'activityFeed', []).slice(0, 4).map(item => item.text).join(' · ') || 'Aktivite akışı boş.'}</span></div>
                    </div>
                `;
            })()
        },

        lists: {
            title: 'Listelerim',
            icon: 'list-plus',
            body: (() => {
                const lists = getProfileBucket(data, 'customLists', {});
                const sharedLists = sharedListsCache;
                const buttons = Object.keys(lists).map(name => `
                    <div class="list-manage-chip">
                        <button class="list-chip" onclick="openCustomList('${encodeURIComponent(name)}')">${name}<span>${lists[name].length}</span></button>
                        <button class="icon-danger-btn" title="Listeyi sil" onclick="DataManager.deleteCustomList('${encodeURIComponent(name)}')"><i data-lucide="trash-2"></i></button>
                    </div>
                `).join('');
                const friendOptions = friendNames.map(name => `<label><input type="checkbox" value="${escapeHtml(name)}"> ${escapeHtml(name)}</label>`).join('');
                const sharedButtons = Object.values(sharedLists).map(list => `
                    <div class="list-manage-chip">
                        <button class="list-chip shared" onclick="openSharedList('${encodeURIComponent(list.name)}')">${escapeHtml(list.name)}<span>${(list.items || []).length}</span></button>
                        <button class="icon-danger-btn" title="Ortak listeyi sil" onclick="DataManager.deleteSharedList('${encodeURIComponent(list.name)}')"><i data-lucide="trash-2"></i></button>
                    </div>
                `).join('');
                return `
                    <div class="settings-field">
                        <label>Yeni kişisel liste</label>
                        <div class="inline-control"><input id="custom-list-name-input" type="text" placeholder="En iyi korkularım"><button class="btn-xl secondary" onclick="createCustomListFromInput()">Oluştur</button></div>
                    </div>
                    <div class="list-chip-grid">${buttons || '<p class="muted-note">Henüz özel listen yok. Buradan liste oluşturup içerik detayından listeye ekleyebilirsin.</p>'}</div>
                    <div class="settings-field">
                        <label>Ortak liste oluştur</label>
                        <div class="inline-control"><input id="shared-list-name-input" type="text" placeholder="Kanka film gecesi"><button class="btn-xl secondary" onclick="createSharedListFromInputs()">Oluştur</button></div>
                    </div>
                    <div class="friend-checkbox-grid" id="shared-list-friends">${friendOptions || '<p class="muted-note">Ortak liste için önce arkadaş eklemelisin.</p>'}</div>
                    <div class="list-chip-grid">${sharedButtons || '<p class="muted-note">Henüz ortak listen yok.</p>'}</div>
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
        },
        duels: {
            title: 'VS Film Düelloları',
            icon: 'swords',
            body: `
                <div id="duel-arena-container">
                    <p class="muted-note">Düello alanı yükleniyor...</p>
                </div>
            `
        },
        diary: {
            title: 'Sinema Günlüğüm',
            icon: 'book-open',
            body: `
                <div id="diary-calendar-container">
                    <p class="muted-note">Takvim yükleniyor...</p>
                </div>
            `
        },
        newspaper: {
            title: 'AI Gazetesi',
            icon: 'newspaper',
            body: `
                <div id="newspaper-container">
                    <p class="muted-note">Gazete basılıyor...</p>
                </div>
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
    if (view === 'duels') loadMovieDuel();
    if (view === 'diary') renderCinemaDiaryCalendar();
    if (view === 'newspaper') renderAiCinemaNewspaper();
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
            showToast('Paylaşım metni kopyalanamadı: ' + text);
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
    
    const genre = getEl('filter-genre')?.value || '';
    const year = getEl('filter-year')?.value || '';
    const rating = getEl('filter-rating')?.value || '0';
    const sort = getEl('filter-sort')?.value || 'popularity.desc';
    
    let params = `&page=${page}&sort_by=${sort}&vote_average.gte=${rating}`;
    if (genre) params += `&with_genres=${genre}`;
    if (year) {
        if (currentBrowseType === 'movie') params += `&primary_release_year=${year}`;
        else params += `&first_air_date_year=${year}`;
    }
    
    let endpoint = `/discover/${currentBrowseType === 'popular' ? 'movie' : currentBrowseType}`;
    if (currentBrowseType === 'popular') {
        endpoint = '/trending/all/week';
        params = `&page=${page}`; // Clear incompatible params
    }
    
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
        <div class="profile-slot ${i === activeIndex ? 'active' : ''} ${isManageMode ? 'manage-mode' : ''}" data-profile-index="${i}" data-profile-name="${escapeHtml(p.name)}" data-profile-avatar="${escapeHtml(p.avatar || '')}" onclick="handleProfileClick(this.dataset.profileIndex, this.dataset.profileName, this.dataset.profileAvatar)">
            <div class="avatar-wrap">
                <img src="${p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`}">
                ${isManageMode ? '<div class="edit-overlay"><i data-lucide="edit-2"></i></div>' : ''}
            </div>
            <span>${escapeHtml(p.name)}</span>
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
    if (!profileContainer) return;
    
    if (!user) {
        profileContainer.innerHTML = `<button class="nav-login-btn" onclick="openAuthModal(event)">Giriş Yap</button>`;
        profileContainer.classList.add('logged-out');
        
        // Still set these in case the modal is opened manually or through other means
        const guestData = getGuestUserData();
        const guestProfile = guestData.profiles?.[getActiveProfileIndex()] || guestData.profiles?.[0] || { name: 'Misafir' };
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
        ? `<span><i data-lucide="list-video"></i> Son bölüm: S${currentEpisode.season} B${currentEpisode.episode}${currentEpisode.title ? ` · ${escapeHtml(currentEpisode.title)}` : ''}</span>`
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
                <strong>${escapeHtml(item.title)}</strong>
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
        btn.innerHTML = isInWatchlist ? '<i data-lucide="heart" fill="currentColor"></i>' : '<i data-lucide="heart"></i>';
    }
    const laterBtn = getEl('add-to-watchlater');
    if (laterBtn) {
        laterBtn.classList.toggle('active', isInWatchLater);
        laterBtn.innerHTML = isInWatchLater ? `<i data-lucide="clock-check"></i>` : `<i data-lucide="clock"></i>`;
    }
    const completedBtn = getEl('mark-completed-btn');
    if (completedBtn) {
        completedBtn.classList.toggle('active', completed);
        completedBtn.innerHTML = completed ? '<i data-lucide="check-circle-2" fill="currentColor"></i>' : '<i data-lucide="check-circle-2"></i>';
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
    
    Promise.all([
        apiFetch('/trending/tv/week').then(d => renderMovies(d.results, getEl('trending-tv'), 'tv')),
        apiFetch('/movie/top_rated').then(d => renderMovies(d.results, getEl('top-rated'))),
        apiFetch('/discover/tv', '&with_genres=9648&sort_by=popularity.desc').then(d => renderMovies(d.results, getEl('mystery-tv'), 'tv')),
        apiFetch('/discover/movie', '&primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31&sort_by=popularity.desc').then(d => renderMovies(d.results, getEl('nineties-movies'))),
        apiFetch('/discover/movie', '&vote_average.gte=8&vote_count.gte=1000&sort_by=vote_average.desc').then(d => renderMovies(d.results, getEl('imdb-eight-plus'))),
        apiFetch('/movie/upcoming').then(d => renderReleaseCalendar(d.results || []))
    ]);
    
    // 2. Auth State UI
    updateProfileUI();
    getPreferences();
    
    const isLoggedIn = await AuthManager.isLoggedIn();
    await DataManager.migrateUserData();
    renderContinueWatching();
    renderWatchLater();
    renderNotifications();
    if (isLoggedIn) subscribeToRealtimeNotifications();

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
    getEl('user-profile-btn')?.addEventListener('click', async (e) => {
        const user = await AuthManager.getUser();
        if (!user) {
            openAuthModal(e);
            return;
        }
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

    // Surprise (Shuffle) - Decision Wheel Trigger
    getEl('surprise-btn')?.addEventListener('click', () => {
        setupDecisionWheel();
    });

    // Profile Settings
    getEl('menu-profiles-manage')?.addEventListener('click', () => renderCollection('profiles', 'Profil Yönetimi'));
    getEl('menu-favorites')?.addEventListener('click', () => renderCollection('favorites', 'Favorilerim'));
    getEl('menu-watchlater')?.addEventListener('click', () => renderCollection('watchLater', 'Sonra İzle'));
    getEl('menu-history')?.addEventListener('click', () => renderCollection('history', 'İzleme Geçmişi'));
    getEl('menu-account')?.addEventListener('click', () => renderProfileInfoView('account'));
    getEl('menu-social')?.addEventListener('click', () => renderProfileInfoView('social'));
    getEl('menu-custom-lists')?.addEventListener('click', () => renderProfileInfoView('lists'));
    getEl('menu-duels')?.addEventListener('click', () => renderProfileInfoView('duels'));
    getEl('menu-diary')?.addEventListener('click', () => renderProfileInfoView('diary'));
    getEl('menu-newspaper')?.addEventListener('click', () => renderProfileInfoView('newspaper'));
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
        if (isNaN(index)) return;
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
        if (isNaN(index)) return;
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
            
        if (error) showToast('Hata: ' + error.message);
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
    getEl('add-to-custom-list')?.addEventListener('click', openListPicker);
    getEl('mark-completed-btn')?.addEventListener('click', () => DataManager.markCompleted(currentMovie));
    getEl('hide-content-btn')?.addEventListener('click', () => DataManager.hideItem(currentMovie));
    getEl('share-content-btn')?.addEventListener('click', shareCurrentContent);
    getEl('generate-ticket-btn')?.addEventListener('click', generateRetroTicket);
    
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
            showToast('Fragman bulunamadı.');
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
    document.querySelectorAll('.close-modal, .close-auth, .close-profile-settings, .close-player, #close-wheel').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal, .player-sub-overlay, #wheel-modal').forEach(m => m.style.display = 'none');
            document.body.style.overflow = 'auto';
            if (btn.classList.contains('close-player')) getEl('player-container').innerHTML = '';
        });
    });

    // Decision Wheel Buttons
    getEl('spin-wheel-btn')?.addEventListener('click', spinWheel);
    getEl('wheel-respin-btn')?.addEventListener('click', setupDecisionWheel);

    // Global Click to close dropdowns
    window.addEventListener('click', () => {
        getEl('notif-dropdown').style.display = 'none';
    });
});

// --- Decision Wheel Logic ---
let wheelMovies = [];
let isWheelSpinning = false;
let currentRotation = 0;

async function setupDecisionWheel() {
    getEl('wheel-modal').style.display = 'flex';
    getEl('spin-wheel-btn').style.display = 'inline-flex';
    getEl('wheel-winner-card').style.display = 'none';
    
    // Reset wheel transformation instantly
    const canvas = getEl('wheel-canvas');
    if (canvas) {
        canvas.style.transition = 'none';
        canvas.style.transform = 'rotate(0deg)';
        canvas.offsetHeight; // Trigger reflow
        canvas.style.transition = 'transform 6s cubic-bezier(0.1, 0.8, 0.1, 1)';
    }
    
    const isAiMode = getEl('wheel-ai-mode')?.checked;
    let data = null;
    
    if (isAiMode) {
        const userData = await DataManager.getUserData();
        const history = userData?.history || [];
        const watchlist = userData?.watchlist || [];
        const allItems = [...history, ...watchlist];
        
        if (allItems.length > 0) {
            // Count genres from user's active selections
            const genreCounts = {};
            allItems.forEach(item => {
                const genres = item.genre_ids || [];
                genres.forEach(id => {
                    genreCounts[id] = (genreCounts[id] || 0) + 1;
                });
            });
            
            // Get favorite genre ID
            const favGenreId = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a])[0];
            
            if (favGenreId) {
                showRealtimeToast('🧠 AI Öneri Modu', 'İzleme geçmişin analiz edilerek en sevdiğin türe göre özel çark hazırlandı.');
                data = await apiFetch('/discover/movie', `&with_genres=${favGenreId}&sort_by=vote_average.desc&vote_count.gte=100&page=${Math.floor(Math.random() * 3) + 1}`);
            }
        }
        
        if (!data || !data.results || data.results.length < 8) {
            showRealtimeToast('🧠 AI Öneri Modu', 'İzleme geçmişin henüz yetersiz olduğu için sana özel popüler içerikler seçildi.');
            data = await apiFetch('/movie/popular', `&page=${Math.floor(Math.random() * 5) + 1}`);
        }
    } else {
        data = await apiFetch('/movie/popular', `&page=${Math.floor(Math.random() * 5) + 1}`);
    }
    
    if (!data.results || data.results.length < 8) return;
    
    // Shuffle and pick 8
    for (let i = data.results.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [data.results[i], data.results[j]] = [data.results[j], data.results[i]]; }
    wheelMovies = data.results.slice(0, 8);
    drawWheel();
}

function drawWheel() {
    const canvas = getEl('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 10;
    
    ctx.clearRect(0, 0, size, size);
    
    // Custom theme colors based on body theme
    const theme = document.body.dataset.theme || 'classic';
    let baseColor = '#E50914';
    let hoverColor = '#ff2e3b';
    if (theme === 'blue') {
        baseColor = '#2f80ff';
        hoverColor = '#5a9cff';
    } else if (theme === 'purple') {
        baseColor = '#a855f7';
        hoverColor = '#c084fc';
    } else if (theme === 'amoled') {
        baseColor = '#ffffff';
        hoverColor = '#d6d6d6';
    }
    
    const themeColors = [
        baseColor, '#181818', '#333333', '#080808',
        hoverColor, '#222222', '#555555', '#121212'
    ];
    
    const arc = Math.PI * 2 / 8;
    
    wheelMovies.forEach((movie, i) => {
        const angle = i * arc;
        ctx.fillStyle = themeColors[i % themeColors.length];
        
        ctx.beginPath();
        ctx.arc(center, center, radius, angle, angle + arc);
        ctx.lineTo(center, center);
        ctx.fill();
        
        // Draw Text
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.translate(center, center);
        ctx.rotate(angle + arc / 2);
        ctx.textAlign = 'right';
        ctx.font = 'bold 11px Poppins, sans-serif';
        
        // Truncate title
        let title = movie.title || movie.name || '';
        if (title.length > 15) title = title.substring(0, 13) + '..';
        
        ctx.fillText(title, radius - 20, 4);
        ctx.restore();
    });
    
    // Draw Center Circle
    ctx.beginPath();
    ctx.arc(center, center, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(center, center, 15, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
}

function spinWheel() {
    if (isWheelSpinning || !wheelMovies.length) return;
    isWheelSpinning = true;
    
    getEl('spin-wheel-btn').style.display = 'none';
    getEl('wheel-winner-card').style.display = 'none';
    
    const canvas = getEl('wheel-canvas');
    const winnerIndex = Math.floor(Math.random() * 8);
    const winner = wheelMovies[winnerIndex];
    
    // 360 deg is 8 slices (45 deg each)
    // Pointer is at the top (270 deg). 
    // To land slice winnerIndex at 12 o'clock, we align its center:
    const spins = 6 + Math.floor(Math.random() * 4); // 6 to 9 full spins
    const sliceAngle = 360 / 8;
    
    // Rotation offset to align pointer with slice center
    const targetDeg = 270 - (winnerIndex * sliceAngle + sliceAngle / 2);
    const totalRotation = (spins * 360) + targetDeg;
    
    canvas.style.transform = `rotate(${totalRotation}deg)`;
    currentRotation = totalRotation;
    
    setTimeout(() => {
        isWheelSpinning = false;
        
        // Show winner details
        const card = getEl('wheel-winner-card');
        getEl('wheel-winner-img').src = winner.poster_path ? IMG_URL + winner.poster_path : POSTER_FALLBACK;
        getEl('wheel-winner-title').innerText = winner.title || winner.name;
        getEl('wheel-winner-desc').innerText = winner.overview || 'Açıklama bulunmuyor.';
        
        card.style.display = 'flex';
        
        getEl('wheel-winner-btn').onclick = () => {
            getEl('wheel-modal').style.display = 'none';
            openModal(winner);
        };
    }, 6100);
}

// --- DM Chat System ---
let activeChatFriendId = null;
let chatSubscription = null;

async function openDirectChat(friendId, friendName, friendAvatar) {
    activeChatFriendId = friendId;
    const area = getEl('direct-chat-area');
    if (!area) return;
    
    area.style.display = 'block';
    area.innerHTML = `
        <div class="chat-tab-container">
            <div class="chat-header">
                <img src="${friendAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendName}`}" alt="${friendName}">
                <strong>${escapeHtml(friendName)} ile Sohbet</strong>
            </div>
            <div class="chat-messages" id="chat-msg-list">
                <p class="muted-note" style="text-align: center; padding: 20px;">Mesajlar yükleniyor...</p>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chat-message-input" placeholder="Bir mesaj yaz...">
                <button type="button" class="chat-send-btn" id="chat-send-btn"><i data-lucide="send"></i></button>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
    
    // Bind send button
    getEl('chat-send-btn').addEventListener('click', sendDirectMessage);
    getEl('chat-message-input').addEventListener('keyup', e => {
        if (e.key === 'Enter') sendDirectMessage();
    });
    
    fetchDirectMessages(friendId);
    subscribeToDirectMessages(friendId);
}

async function fetchDirectMessages(friendId) {
    const user = await AuthManager.getUser();
    if (!user) return;
    
    const list = getEl('chat-msg-list');
    if (!list) return;
    
    try {
        const { data: messages, error } = await supabase
            .from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        renderChatMessages(messages || []);
    } catch (e) {
        // Fallback local storage
        const localKey = `dm_${user.id}_${friendId}`;
        const localMsgs = JSON.parse(localStorage.getItem(localKey) || '[]');
        renderChatMessages(localMsgs);
    }
}

function renderChatMessages(messages) {
    const list = getEl('chat-msg-list');
    if (!list) return;
    
    if (messages.length === 0) {
        list.innerHTML = '<p class="muted-note" style="text-align: center; padding: 20px;">Sohbeti başlatmak için ilk mesajı gönder!</p>';
        return;
    }
    
    const activeUserId = userDataCache?.id || '';
    
    list.innerHTML = messages.map(msg => {
        const isSent = msg.sender_id === activeUserId || msg.is_sent;
        const time = new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="chat-msg ${isSent ? 'sent' : 'received'}">
                ${escapeHtml(msg.message)}
                <span class="chat-time">${time}</span>
            </div>
        `;
    }).join('');
    
    list.scrollTop = list.scrollHeight;
}

async function sendDirectMessage() {
    const input = getEl('chat-message-input');
    const message = input.value.trim();
    if (!message || !activeChatFriendId) return;
    
    input.value = '';
    const user = await AuthManager.getUser();
    if (!user) return;
    
    const newMsg = {
        sender_id: user.id,
        receiver_id: activeChatFriendId,
        message: message,
        created_at: new Date().toISOString()
    };
    
    try {
        const { error } = await supabase.from('direct_messages').insert(newMsg);
        if (error) throw error;
        fetchDirectMessages(activeChatFriendId);
    } catch (e) {
        // Fallback local storage
        const localKey = `dm_${user.id}_${activeChatFriendId}`;
        const oppositeKey = `dm_${activeChatFriendId}_${user.id}`;
        const localMsgs = JSON.parse(localStorage.getItem(localKey) || '[]');
        const toSave = { ...newMsg, is_sent: true };
        localMsgs.push(toSave);
        localStorage.setItem(localKey, JSON.stringify(localMsgs));
        localStorage.setItem(oppositeKey, JSON.stringify(localMsgs));
        renderChatMessages(localMsgs);
    }
}

function subscribeToDirectMessages(friendId) {
    if (chatSubscription) {
        supabase.removeChannel(chatSubscription);
    }
    
    chatSubscription = supabase
        .channel('public:direct_messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'direct_messages'
        }, payload => {
            const msg = payload.new;
            if (msg.sender_id === friendId || msg.receiver_id === friendId) {
                fetchDirectMessages(friendId);
            }
        })
        .subscribe();
}

window.openDirectChat = openDirectChat;

// --- Real-Time Toast Notifications ---
let notificationSubscription = null;

async function subscribeToRealtimeNotifications() {
    const user = await AuthManager.getUser();
    if (!user) return;
    
    if (notificationSubscription) {
        supabase.removeChannel(notificationSubscription);
    }
    
    notificationSubscription = supabase
        .channel('public:notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
        }, payload => {
            const notif = payload.new;
            showRealtimeToast(notif.title, notif.body || '');
            renderNotifications();
        })
        .subscribe();
}

function showRealtimeToast(title, body) {
    const toastContainer = getEl('realtime-toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'realtime-toast';
    toast.innerHTML = `
        <div class="rt-toast-header">
            <i data-lucide="bell" style="width:16px; height:16px; color: var(--primary-color);"></i>
            <strong>${escapeHtml(title)}</strong>
        </div>
        <p>${escapeHtml(body)}</p>
    `;
    toastContainer.appendChild(toast);
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'realtime-toast-container';
    container.className = 'realtime-toast-container';
    document.body.appendChild(container);
    return container;
}

window.subscribeToRealtimeNotifications = subscribeToRealtimeNotifications;

// --- Watch Party System ---
let currentPartyChannel = null;
let isPartyHost = false;
let partyRoomCode = '';

async function startWatchParty() {
    const user = await AuthManager.getUser();
    if (!user) return showToast('Watch Party başlatmak için giriş yapmalısın.');
    
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    partyRoomCode = roomCode;
    isPartyHost = true;
    
    setupWatchPartyChannel(roomCode);
    showToast(`Watch Party kuruldu! Kod: ${roomCode}`);
    renderWatchPartyUI();
}

async function joinWatchParty(code) {
    const user = await AuthManager.getUser();
    if (!user) return showToast('Watch Party katılmak için giriş yapmalısın.');
    if (!code) {
        code = 'MIRA00';
    }
    
    const roomCode = code.trim().toUpperCase();
    partyRoomCode = roomCode;
    isPartyHost = false;
    
    setupWatchPartyChannel(roomCode);
    showToast(`Watch Party odaya katıldın: ${roomCode}`);
    renderWatchPartyUI();
}

function broadcastCurrentMovie() {
    if (!isPartyHost || !currentPartyChannel || !currentPlayingMovie) return;
    currentPartyChannel.send({
        type: 'broadcast',
        event: 'sync_movie',
        payload: {
            movie: currentPlayingMovie,
            imdbId: currentPlayingImdbId,
            sourceUrl: currentPlayingSourceUrl
        }
    });
}

function updatePartyMembersList(state) {
    const avatarsContainer = document.querySelector('.party-members-avatars');
    if (!avatarsContainer) return;
    
    const members = [];
    const seen = new Set();
    Object.values(state).forEach(presences => {
        presences.forEach(p => {
            if (p.userName && !seen.has(p.userId)) {
                seen.add(p.userId);
                members.push(p);
            }
        });
    });
    
    avatarsContainer.innerHTML = members.map(m => `
        <div class="party-member-avatar-wrap" style="position: relative; display: inline-flex;" title="${escapeHtml(m.userName)}${m.isHost ? ' (Lider)' : ''}">
            <img src="${escapeHtml(m.userAvatar)}" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid ${m.isHost ? 'var(--primary-color)' : '#5a9cff'}; object-fit: cover; background: #222;">
            ${m.isHost ? '<span style="position: absolute; bottom: -3px; right: -3px; font-size: 10px;">👑</span>' : ''}
        </div>
    `).join('');
}

function setupWatchPartyChannel(roomCode) {
    if (currentPartyChannel) {
        supabase.removeChannel(currentPartyChannel);
    }
    
    currentPartyChannel = supabase.channel(`party:${roomCode}`, {
        config: {
            presence: { key: roomCode },
            broadcast: { self: false }
        }
    });
    
    const profile = userDataCache ? getActiveProfile(userDataCache) : { name: 'Misafir' };
    const profileName = profile.name || 'Misafir';
    const profileAvatar = profile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileName}`;
    
    currentPartyChannel
        .on('presence', { event: 'sync' }, () => {
            const state = currentPartyChannel.presenceState();
            updatePartyMembersList(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            newPresences.forEach(p => {
                showRealtimeToast('👥 Watch Party', `${p.userName} odaya katıldı!`);
            });
            if (isPartyHost) {
                broadcastCurrentMovie();
            }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            leftPresences.forEach(p => {
                showRealtimeToast('👥 Watch Party', `${p.userName} odadan ayrıldı.`);
            });
        })
        .on('broadcast', { event: 'request_sync' }, () => {
            if (isPartyHost) {
                broadcastCurrentMovie();
            }
        })
        .on('broadcast', { event: 'sync_movie' }, payload => {
            if (!isPartyHost) {
                const { movie, imdbId, sourceUrl } = payload.payload;
                openPlayerPageForMember(movie, imdbId, sourceUrl);
            }
        })
        .on('broadcast', { event: 'sync' }, payload => {
            if (!isPartyHost) {
                const action = payload.payload.action;
                showRealtimeToast('📡 Watch Party', `Yayın durumu host tarafından senkronize edildi: ${action}`);
            }
        });
        
    currentPartyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            const user = await AuthManager.getUser();
            const userId = user ? user.id : 'guest-' + Math.random().toString(36).substring(2, 6);
            await currentPartyChannel.track({
                userId: userId,
                userName: profileName,
                userAvatar: profileAvatar,
                isHost: isPartyHost
            });
            if (isPartyHost) {
                broadcastCurrentMovie();
            } else {
                currentPartyChannel.send({
                    type: 'broadcast',
                    event: 'request_sync',
                    payload: {}
                });
            }
        }
    });
}

function renderWatchPartyUI() {
    const shell = document.querySelector('.watch-shell');
    if (!shell) return;
    
    let partyBar = document.querySelector('.watch-party-bar');
    if (!partyBar) {
        partyBar = document.createElement('div');
        partyBar.className = 'watch-party-bar';
        shell.insertBefore(partyBar, shell.firstChild);
    }
    
    partyBar.innerHTML = `
        <div class="party-info-group" style="display: flex; align-items: center; gap: 10px;">
            <span class="party-badge">Canlı Party</span>
            <strong>Oda Kodu: <span style="color: var(--primary-color); letter-spacing: 1px;">${partyRoomCode}</span></strong>
            <div class="party-members-avatars" style="display: flex; align-items: center; gap: 6px; margin-left: 15px;">
                <!-- Avatars loaded dynamically -->
            </div>
        </div>
        <div class="party-actions" style="display: flex; align-items: center; gap: 10px;">
            ${isPartyHost ? `
                <button type="button" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="syncPartyHostPlayback('Oynatılıyor')"><i data-lucide="play" style="width: 12px; height: 12px;"></i> Oynatmayı Eşitle</button>
            ` : '<span style="font-size: 0.8rem; color: var(--text-muted);">Senkronizasyon aktif...</span>'}
            <button type="button" class="btn-danger-outline" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 4px;" onclick="leaveWatchParty()">Ayrıl</button>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function syncPartyHostPlayback(action) {
    if (!isPartyHost || !currentPartyChannel) return;
    currentPartyChannel.send({
        type: 'broadcast',
        event: 'sync',
        payload: { action, time: 0 }
    });
    broadcastCurrentMovie();
    showToast('Tüm oda üyeleriyle oynatma durumu eşitlendi.');
}

function leaveWatchParty() {
    if (currentPartyChannel) {
        supabase.removeChannel(currentPartyChannel);
        currentPartyChannel = null;
    }
    partyRoomCode = '';
    document.querySelector('.watch-party-bar')?.remove();
    showToast('Watch Party odasından ayrıldın.');
}

window.startWatchParty = startWatchParty;
window.joinWatchParty = joinWatchParty;
window.syncPartyHostPlayback = syncPartyHostPlayback;
window.leaveWatchParty = leaveWatchParty;


async function renderAiInsights(movie) {
    const textEl = getEl('modal-ai-insights-text');
    const panelEl = getEl('modal-ai-insights');
    if (!textEl || !panelEl) return;
    
    const userData = await DataManager.getUserData();
    const history = userData?.history || [];
    const watchlist = userData?.watchlist || [];
    const allItems = [...history, ...watchlist];
    
    if (allItems.length === 0) {
        panelEl.style.display = 'none';
        return;
    }
    
    const genreNames = {
        28: 'Aksiyon', 12: 'Macera', 16: 'Animasyon', 35: 'Komedi', 80: 'Suç',
        99: 'Belgesel', 18: 'Dram', 10751: 'Aile', 14: 'Fantastik', 36: 'Tarih',
        27: 'Korku', 10402: 'Müzik', 9648: 'Gizem', 10749: 'Romantik',
        878: 'Bilim Kurgu', 53: 'Gerilim', 10752: 'Savaş', 37: 'Western'
    };
    
    const userGenres = {};
    allItems.forEach(item => {
        const genres = item.genre_ids || [];
        genres.forEach(id => {
            userGenres[id] = (userGenres[id] || 0) + 1;
        });
    });
    
    const movieGenres = movie.genres?.map(g => g.id) || movie.genre_ids || [];
    const matches = movieGenres.filter(id => userGenres[id] > 0);
    panelEl.style.display = 'block';
    
    if (matches.length > 0) {
        const topGenreId = matches.sort((a, b) => userGenres[b] - userGenres[a])[0];
        const genreName = genreNames[topGenreId] || 'bu tarz';
        textEl.innerText = `${genreName} türündeki içerikleri sıklıkla izlediğini fark ettik. Bu yapım, zengin görsel atmosferi ve güçlü hikaye örgüsüyle kişisel sinema zevkine tam olarak uyuyor!`;
    } else {
        textEl.innerText = `Bu içerik, şimdiye kadar izlediğin türlerden farklı ve taze bir soluk sunuyor. Sinema yelpazeni genişletmek ve yeni bir macera keşfetmek için harika bir fırsat!`;
    }
}

async function generateRetroTicket() {
    if (!currentMovie) return showToast('Önce bir içerik açmalısın.');
    
    const quotes = [
        "Umut iyi bir şeydir, belki de en iyisi. Ve iyi şeyler asla ölmez.",
        "Kaderimizdeki yıldızları değil, kendi adımlarımızı takip etmeliyiz.",
        "Hayat bir kutu çikolata gibidir, içinden ne çıkacağını asla bilemezsin.",
        "Büyük güç büyük sorumluluk getirir.",
        "Neden bu kadar ciddisin?",
        "Sonsuzluğa ve ötesine!",
        "Yolumuz nereye? Yıldızlara ve ötesine.",
        "Yarın yepyeni bir gün.",
        "İz bırakan her film, birlikte izlenince güzelleşir.",
        "Bu hayatta sadece bir kez bilet kesilir, tadını çıkar."
    ];
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    
    let ticketOverlay = document.getElementById('ticket-overlay');
    if (!ticketOverlay) {
        ticketOverlay = document.createElement('div');
        ticketOverlay.id = 'ticket-overlay';
        ticketOverlay.className = 'modal';
        ticketOverlay.style.display = 'none';
        ticketOverlay.style.alignItems = 'center';
        ticketOverlay.style.justifyContent = 'center';
        ticketOverlay.style.zIndex = '99999';
        ticketOverlay.style.background = 'rgba(0, 0, 0, 0.9)';
        document.body.appendChild(ticketOverlay);
    }
    
    const data = await DataManager.getUserData();
    const activeProfile = data ? getActiveProfile(data) : { name: 'Misafir' };
    const dateStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const ratingVal = Math.round(currentMovie.vote_average || 7);
    const ratingStars = '★'.repeat(ratingVal) + '☆'.repeat(10 - ratingVal);
    const posterUrl = currentMovie.poster_path ? IMG_URL + currentMovie.poster_path : POSTER_FALLBACK;
    
    ticketOverlay.innerHTML = `
        <div class="ticket-stub-card" style="position: relative; background: radial-gradient(circle at left, transparent 15px, #181818 16px), radial-gradient(circle at right, transparent 15px, #181818 16px); background-size: 100% 100%; border: 1px solid rgba(255,255,255,0.06); padding: 30px; border-radius: 12px; width: 440px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); border-left: 5px solid var(--primary-color);">
            <button onclick="document.getElementById('ticket-overlay').style.display='none'" style="position: absolute; top: 15px; right: 15px; background: none; border: 0; color: #888; font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
            <div style="text-align: center; border-bottom: 2px dashed rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="color: var(--primary-color); font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px;">MİRAÇFLIX BİLETİ</h3>
                <small style="color: #666; font-size: 0.7rem;">SİNEMA HATIRASI / ORIGINAL TICKET STUB</small>
            </div>
            <div style="display: flex; gap: 15px; align-items: flex-start;">
                <img src="${posterUrl}" style="width: 100px; height: 150px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">
                <div style="flex: 1; display: grid; gap: 8px; text-align: left;">
                    <h4 style="font-size: 1.1rem; color: #fff; font-weight: 800; margin: 0;">${escapeHtml(currentMovie.title || currentMovie.name)}</h4>
                    <div style="font-size: 0.8rem; color: #aaa;"><strong>İzleyen:</strong> ${escapeHtml(activeProfile.name)}</div>
                    <div style="font-size: 0.8rem; color: #aaa;"><strong>Tarih:</strong> ${dateStr}</div>
                    <div style="font-size: 0.85rem; color: #f5c518; letter-spacing: 1px;">${ratingStars}</div>
                </div>
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed rgba(255,255,255,0.1); text-align: center;">
                <p style="font-style: italic; color: #ccc; font-size: 0.82rem; line-height: 1.4; margin: 0 0 15px;">"${randomQuote}"</p>
                <div class="barcode" style="background: repeating-linear-gradient(90deg, #fff, #fff 2px, #000 2px, #000 6px); height: 35px; width: 80%; margin: 0 auto 10px;"></div>
                <small style="color: #444; font-size: 0.6rem; letter-spacing: 2px;">MFX-${Math.floor(100000 + Math.random() * 900000)}</small>
            </div>
            <button id="download-ticket-btn" class="btn btn-primary w-100" style="margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="downloadTicketStub()"><i data-lucide="download" style="width: 16px; height: 16px;"></i> Görsel Olarak İndir</button>
        </div>
    `;
    ticketOverlay.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

async function downloadTicketStub() {
    const data = await DataManager.getUserData();
    const activeProfile = data ? getActiveProfile(data) : { name: 'Misafir' };
    const dateStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const ratingVal = Math.round(currentMovie.vote_average || 7);
    const titleText = currentMovie.title || currentMovie.name;
    
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 550;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#181818';
    ctx.strokeStyle = '#e50914';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(40, 40, 720, 470, 16);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#e50914';
    ctx.beginPath();
    ctx.roundRect(40, 40, 15, 470, { tl: 16, bl: 16, tr: 0, br: 0 });
    ctx.fill();
    
    ctx.fillStyle = '#e50914';
    ctx.font = '900 28px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MIRAÇFLIX BILETI', 400, 95);
    
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.fillText('SINEMA HATIRASI / ORIGINAL TICKET STUB', 400, 120);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(80, 150);
    ctx.lineTo(720, 150);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(titleText.substring(0, 30), 80, 205);
    
    ctx.fillStyle = '#aaa';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Izleyen:  ${activeProfile.name}`, 80, 255);
    ctx.fillText(`Tarih:    ${dateStr}`, 80, 295);
    ctx.fillText(`Puan:     ${'★'.repeat(ratingVal)}${'☆'.repeat(10 - ratingVal)}`, 80, 335);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 18px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(`"Umut iyi bir seydir, belki de en iyisi. Ve iyi seyler asla olmez."`, 400, 410);
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(200, 445, 400, 35);
    ctx.fillStyle = '#000';
    for (let i = 210; i < 590; i += Math.floor(Math.random() * 8) + 4) {
        ctx.fillRect(i, 445, Math.floor(Math.random() * 3) + 1, 35);
    }
    
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`MFX-${Math.floor(100000 + Math.random() * 900000)}`, 400, 498);
    
    const link = document.createElement('a');
    link.download = `miracflix-ticket-${titleText.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    showToast('Bileti başarıyla indirdin!');
}

window.generateRetroTicket = generateRetroTicket;
window.downloadTicketStub = downloadTicketStub;

let currentDuelData = null;

async function loadMovieDuel() {
    const container = document.getElementById('duel-arena-container');
    if (!container) return;
    
    try {
        const seeds = [
            { a: { id: '27205', title: 'Inception', poster: '/oYuLE5SKugZ47dYRC2RJnzk6xpa.jpg' }, b: { id: '157336', title: 'Interstellar', poster: '/gEU2QniE6E77NIgVEj6v64juCOr.jpg' } },
            { a: { id: '155', title: 'The Dark Knight', poster: '/qJ2tWwZSQIM3m1OW4J2P7511Nth.jpg' }, b: { id: '550', title: 'Fight Club', poster: '/adw6L1V2w7HcxEU7n60vSuJUjYn.jpg' } },
            { a: { id: '680', title: 'Pulp Fiction', poster: '/d5iIlvfjPyI0jijHrm12M5BeKMq.jpg' }, b: { id: '13', title: 'Forrest Gump', poster: '/arw2vcB28DXjhoQuoIJcx6w3o4v.jpg' } },
            { a: { id: '120', title: 'L.O.T.R: The Fellowship', poster: '/6oom5QDN2187fiJUoQj70w36vwm.jpg' }, b: { id: '122', title: 'L.O.T.R: The Return of the King', poster: '/rC54V1av0wI4iIMuX65zARY9bH3.jpg' } }
        ];
        
        const pair = seeds[Math.floor(Math.random() * seeds.length)];
        
        const { data: dbDuel, error } = await supabase
            .from('movie_duels')
            .select('*')
            .eq('movie_a_id', pair.a.id)
            .eq('movie_b_id', pair.b.id)
            .maybeSingle();
            
        let votesA = 0;
        let votesB = 0;
        let duelRowId = null;
        
        if (!error && dbDuel) {
            votesA = dbDuel.votes_a;
            votesB = dbDuel.votes_b;
            duelRowId = dbDuel.id;
        } else {
            const { data: inserted, error: insErr } = await supabase
                .from('movie_duels')
                .insert({
                    movie_a_id: pair.a.id,
                    movie_a_title: pair.a.title,
                    movie_a_poster: pair.a.poster,
                    movie_b_id: pair.b.id,
                    movie_b_title: pair.b.title,
                    movie_b_poster: pair.b.poster,
                    votes_a: 0,
                    votes_b: 0
                })
                .select()
                .single();
            if (!insErr && inserted) {
                duelRowId = inserted.id;
            }
        }
        
        currentDuelData = {
            id: duelRowId,
            a: pair.a,
            b: pair.b,
            votesA,
            votesB
        };
        
        const posterA = pair.a.poster ? IMG_URL + pair.a.poster : POSTER_FALLBACK;
        const posterB = pair.b.poster ? IMG_URL + pair.b.poster : POSTER_FALLBACK;
        
        container.innerHTML = `
            <div class="duel-instruction" style="text-align: center; margin-bottom: 25px;">
                <h3 style="font-weight: 800; font-size: 1.25rem;">Hangi Yapım Daha İyi?</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem;">Oyunu ver, küresel tercihleri anında gör!</p>
            </div>
            <div class="duel-stage" style="display: flex; align-items: center; justify-content: center; gap: 30px; position: relative;">
                <div class="duel-option" onclick="voteDuelOption('a')" style="flex: 1; text-align: center; cursor: pointer; transition: transform 0.3s; padding: 15px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);">
                    <img src="${posterA}" style="width: 140px; height: 210px; border-radius: 8px; object-fit: cover; box-shadow: 0 10px 20px rgba(0,0,0,0.5);">
                    <h4 style="margin-top: 12px; font-weight: 800; font-size: 1rem;">${pair.a.title}</h4>
                </div>
                <div class="duel-vs" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--primary-color); color: #fff; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; font-size: 1rem; box-shadow: 0 0 20px var(--primary-color); z-index: 5;">VS</div>
                <div class="duel-option" onclick="voteDuelOption('b')" style="flex: 1; text-align: center; cursor: pointer; transition: transform 0.3s; padding: 15px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);">
                    <img src="${posterB}" style="width: 140px; height: 210px; border-radius: 8px; object-fit: cover; box-shadow: 0 10px 20px rgba(0,0,0,0.5);">
                    <h4 style="margin-top: 12px; font-weight: 800; font-size: 1rem;">${pair.b.title}</h4>
                </div>
            </div>
            <div id="duel-results-panel" style="display: none; margin-top: 30px;"></div>
        `;
    } catch (e) {
        console.error('Duel loading failed:', e);
        container.innerHTML = `<p class="muted-note">Düello başlatılamadı. Supabase tablosunun kurulu olduğundan emin olun.</p>`;
    }
}

async function voteDuelOption(option) {
    if (!currentDuelData || !currentDuelData.id) return;
    
    const updatePayload = option === 'a' 
        ? { votes_a: currentDuelData.votesA + 1 }
        : { votes_b: currentDuelData.votesB + 1 };
        
    const { data: updated, error } = await supabase
        .from('movie_duels')
        .update(updatePayload)
        .eq('id', currentDuelData.id)
        .select()
        .single();
        
    if (error) {
        showToast('Oy verilemedi.');
        return;
    }
    
    const vA = updated.votes_a;
    const vB = updated.votes_b;
    const total = vA + vB || 1;
    const pctA = Math.round((vA / total) * 100);
    const pctB = 100 - pctA;
    
    const resultsPanel = document.getElementById('duel-results-panel');
    if (resultsPanel) {
        resultsPanel.innerHTML = `
            <div style="display: grid; gap: 15px;">
                <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 800; font-size: 0.9rem;">
                    <span>${currentDuelData.a.title} (%${pctA})</span>
                    <span>${currentDuelData.b.title} (%${pctB})</span>
                </div>
                <div style="height: 10px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; display: flex;">
                    <div style="width: ${pctA}%; background: var(--primary-color); height: 100%; transition: width 0.6s ease; box-shadow: 0 0 10px var(--primary-color);"></div>
                    <div style="width: ${pctB}%; background: #5a9cff; height: 100%; transition: width 0.6s ease; box-shadow: 0 0 10px #5a9cff;"></div>
                </div>
                <button class="btn btn-secondary w-100" style="margin-top: 15px;" onclick="loadMovieDuel()">Sonraki Düello</button>
            </div>
        `;
        resultsPanel.style.display = 'block';
        document.querySelectorAll('.duel-option').forEach(el => el.style.pointerEvents = 'none');
    }
}

window.loadMovieDuel = loadMovieDuel;
window.voteDuelOption = voteDuelOption;

let selectedDiaryDay = null;

async function renderCinemaDiaryCalendar() {
    const container = document.getElementById('diary-calendar-container');
    if (!container) return;
    
    const data = await DataManager.getUserData();
    const history = data?.history || [];
    const diaryNotes = getProfileBucket(data, 'diaryNotes', {});
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay === 0 ? 7 : firstDay) - 1;
    
    let daysHtml = '';
    const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
    const weekdaysHtml = weekdays.map(day => `<div style="text-align: center; color: #666; font-size: 0.72rem; font-weight: 800; padding: 5px 0;">${day}</div>`).join('');
    
    for (let i = 0; i < startOffset; i++) {
        daysHtml += `<div style="aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.02);"></div>`;
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        let watchedMovie = null;
        history.forEach(item => {
            if (item.watched_at && item.watched_at.startsWith(dateKey)) {
                watchedMovie = item;
            }
        });
        
        const hasNote = !!diaryNotes[dateKey];
        const posterUrl = watchedMovie ? IMG_URL + watchedMovie.poster_path : '';
        
        daysHtml += `
            <div onclick="openDiaryNote('${dateKey}')" style="position: relative; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.06); background: ${posterUrl ? `url('${posterUrl}') center/cover no-repeat` : 'rgba(255,255,255,0.02)'}; cursor: pointer; border-radius: 4px; overflow: hidden; transition: transform 0.2s;">
                <span style="position: absolute; top: 4px; left: 4px; font-size: 0.65rem; background: rgba(0,0,0,0.65); padding: 1px 4px; border-radius: 3px; color: #fff; font-weight: 800; pointer-events: none;">${day}</span>
                ${hasNote ? '<span style="position: absolute; top: 4px; right: 4px; background: var(--primary-color); width: 6px; height: 6px; border-radius: 50%; display: block;" title="Not var"></span>' : ''}
                ${posterUrl ? '<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); transition: opacity 0.2s; pointer-events: none;" class="poster-overlay"></div>' : ''}
            </div>
        `;
    }
    
    container.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="font-weight: 800; font-size: 1.15rem; color: #fff;">${monthNames[month]} ${year}</h3>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 3px;">İzleme yaptığın günleri seçerek kişisel günlüğünü oluştur.</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
            ${weekdaysHtml}
            ${daysHtml}
        </div>
    `;
}

async function openDiaryNote(dateKey) {
    selectedDiaryDay = dateKey;
    const data = await DataManager.getUserData();
    const diaryNotes = getProfileBucket(data, 'diaryNotes', {});
    
    const textEl = document.getElementById('diary-note-text');
    const titleEl = document.getElementById('diary-note-date');
    if (textEl && titleEl) {
        const [y, m, d] = dateKey.split('-');
        titleEl.innerText = `${d}.${m}.${y} Günlüğü`;
        textEl.value = diaryNotes[dateKey] || '';
        document.getElementById('diary-note-modal').style.display = 'flex';
    }
}

async function saveDiaryNote() {
    if (!selectedDiaryDay) return;
    const text = document.getElementById('diary-note-text').value.trim();
    
    const data = await DataManager.getUserData();
    const diaryNotes = getProfileBucket(data, 'diaryNotes', {});
    
    if (text) {
        diaryNotes[selectedDiaryDay] = text;
    } else {
        delete diaryNotes[selectedDiaryDay];
    }
    
    await DataManager.updateUserData({
        diaryNotes: setProfileBucket(data, 'diaryNotes', diaryNotes)
    });
    
    document.getElementById('diary-note-modal').style.display = 'none';
    showToast('Günlük notu başarıyla kaydedildi.');
    renderCinemaDiaryCalendar();
}

window.renderCinemaDiaryCalendar = renderCinemaDiaryCalendar;
window.openDiaryNote = openDiaryNote;
window.saveDiaryNote = saveDiaryNote;

async function renderAiCinemaNewspaper() {
    const container = document.getElementById('newspaper-container');
    if (!container) return;

    const data = await DataManager.getUserData();
    const history = data?.history || [];
    
    // Filter history from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentHistory = history.filter(item => {
        if (!item.watched_at) return false;
        const watchDate = new Date(item.watched_at);
        return watchDate >= sevenDaysAgo;
    });

    let newspaperHtml = '';
    const dateStr = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (recentHistory.length === 0) {
        // Fallback humor headlines when history is empty in the last 7 days
        newspaperHtml = `
            <div class="newspaper-layout">
                <div class="newspaper-header">
                    <div class="newspaper-title">MİRAÇFLIX GAZETESİ</div>
                    <div class="newspaper-meta">
                        <span>SAYI: #404</span>
                        <span>TARİH: ${dateStr}</span>
                        <span>FİYATI: 1 PATLAMIŞ MISIR</span>
                    </div>
                </div>
                
                <div class="newspaper-headline-block">
                    <h1>SİNEMA SALONLARINDA BÜYÜK SESSİZLİK: MIRACFLIX'TE FİLM KITLIĞI!</h1>
                    <p class="newspaper-lead">Son 7 gündür tek bir film bile izlemeyen editörümüz Miraç, film makinistlerini işsiz bıraktı. Dedikodulara göre mısır patlatma makinesi örümcek bağlamış durumda.</p>
                </div>

                <div class="newspaper-columns">
                    <div class="newspaper-col">
                        <h3>Kayıp Aranıyor!</h3>
                        <p>Koltukta saatlerce uzanıp ekran karşısında hipnotize olan meşhur sinema severimizin son günlerde ortalıkta gözükmemesi mahalle sakinlerini endişelendiriyor. Görgü tanıkları en son bir kitap okurken veya dışarıda yürürken görüldüğünü iddia ediyorlar. Sinema camiası yasta.</p>
                    </div>
                    <div class="newspaper-col">
                        <h3>Makinistlerin Grevi Yakın</h3>
                        <p>Film projeksiyon odasından gelen bilgilere göre, makinistler tozlu koltukları temizlemekten sıkıldı. "Bize film verin, izletelim!" diyen çalışanlar, en kısa sürede bir aksiyon veya bilim kurgu fırtınası beklediklerini belirttiler.</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        // We have active watch history! Let's analyze genres to make funny reports
        const genresCount = {};
        const genreNames = {
            28: 'Aksiyon', 12: 'Macera', 16: 'Animasyon', 35: 'Komedi', 80: 'Suç',
            99: 'Belgesel', 18: 'Dram', 10751: 'Aile', 14: 'Fantastik', 36: 'Tarih',
            27: 'Korku', 10402: 'Müzik', 9648: 'Gizem', 10749: 'Romantik',
            878: 'Bilim Kurgu', 53: 'Gerilim', 10752: 'Savaş', 37: 'Western'
        };

        recentHistory.forEach(item => {
            const ids = item.genre_ids || [];
            ids.forEach(id => {
                genresCount[id] = (genresCount[id] || 0) + 1;
            });
        });

        // Find top genre
        const topGenreId = Object.keys(genresCount).sort((a, b) => genresCount[b] - genresCount[a])[0];
        const topGenreName = genreNames[topGenreId] || 'Sinema';
        const watchedTitles = recentHistory.slice(0, 3).map(m => escapeHtml(m.title || m.name)).join(', ');

        let editorialText = '';
        let headlineText = '';
        
        if (topGenreId == 27 || topGenreId == 53) { // Horror / Thriller
            headlineText = `MIRACFLIX EKRANLARINDA GERİLİM DOLU GÜNLER: ADRENALİN TAVAN YAPTI!`;
            editorialText = `Editörümüz Miraç bu hafta adeta bir korku tünelinde yaşadı. İzlediği korkunç sahneler karşısında patlamış mısırını dökmemeyi başaran Miraç, çelikten sinirleriyle mahallede korkusuz kahraman olarak anılmaya başlandı. Karanlıkta televizyon izleme rekoru kırıldı!`;
        } else if (topGenreId == 35) { // Comedy
            headlineText = `KAHKAHA TUFANI: MİRAÇ BU HAFTA GÜLMEKTEN YERE YATTI!`;
            editorialText = `Komedi filmleriyle dolu bir haftayı geride bırakan Miraç, komşuların "Bu saatte kim gülüyor?" şikayetlerine maruz kaldı. Tıbbi uzmanlar haftalık kahkaha dozunun mutluluk hormonunu %200 artırdığını doğruladı.`;
        } else if (topGenreId == 878) { // Sci-fi
            headlineText = `GELECEĞE YOLCULUK: MİRAÇ ZAMAN BÜKÜCÜ DERECEYE ULAŞTI!`;
            editorialText = `Bilim kurgu dünyasına kendini kaptıran Miraç, bu hafta uzay-zaman sürekliliğini sorgulamaktan evdeki ampulleri bile değiştirmeyi unuttu. Yapay zeka ve galaksiler arası savaşlar hakkında makaleler yazmaya başladığı söyleniyor.`;
        } else if (topGenreId == 18) { // Drama
            headlineText = `DUYGUSAL ANLAR: GÖZYAŞLARI SEL OLDU, PEÇETE STOKLARI TÜKENDİ!`;
            editorialText = `Dramatik hikayelerin peşinden giden Miraç, bu hafta hüznün doruklarına ulaştı. Yerel marketler peçete satışlarında rekor kırıldığını bildirirken, Miraç'ın filmlerdeki buruk aşk hikayeleri ve hayat mücadeleleri karşısında duygulandığı gözlendi.`;
        } else {
            headlineText = `SİNEMA DÜNYASININ YENİ FATİHİ: HAFTALIK İZLEME REKORU KIRILDI!`;
            editorialText = `Miraç, bu hafta adeta bir sinema maratoncusu gibi çalıştı. Arka arkaya bitirdiği yapımlarla sinema kültürünü arşa çıkaran editörümüz, film eleştirmenlerine taş çıkartacak yorumlar yazmaya devam ediyor.`;
        }

        newspaperHtml = `
            <div class="newspaper-layout">
                <div class="newspaper-header">
                    <div class="newspaper-title">MİRAÇFLIX GAZETESİ</div>
                    <div class="newspaper-meta">
                        <span>SAYI: #109</span>
                        <span>TARİH: ${dateStr}</span>
                        <span>FİYATI: 1 TIKLA BEDAVA</span>
                    </div>
                </div>
                
                <div class="newspaper-headline-block">
                    <h1>${headlineText}</h1>
                    <p class="newspaper-lead">${editorialText}</p>
                </div>

                <div class="newspaper-columns">
                    <div class="newspaper-col">
                        <h3>Haftanın Trend Türü: ${topGenreName}</h3>
                        <p>Yapılan istatistiksel analizlere göre Miraç'ın bu haftaki gözdesi <strong>${topGenreName}</strong> oldu. En çok izlenenler listesinde şu inciler yer alıyor: <em>${watchedTitles}</em>. Editörümüz, bu yapımların sinematografik kalitesini öve öve bitiremiyor.</p>
                    </div>
                    <div class="newspaper-col">
                        <h3>Miraç'tan Özel Eleştiri</h3>
                        <p>"Sinema sadece eğlence değil, bir yaşam tarzıdır kanka," diyen meşhur eleştirmenimiz, önümüzdeki günlerde daha fazla maraton yapacağını müjdeledi. Bir sonraki sayısı sabırsızlıkla beklenen gazetemiz, Miraç'ın her adımını izlemeye devam edecek!</p>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = newspaperHtml;
}

window.renderAiCinemaNewspaper = renderAiCinemaNewspaper;

