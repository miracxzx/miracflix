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
let heroMovieData = null;
let isLoginMode = true;
let isManageMode = false;
let currentBrowseType = 'movie';
let currentPage = 1;
let appRevealed = false;
const DEFAULT_PREFERENCES = {
    trailerPreview: true,
    notifications: true,
    compactMobile: false,
    reduceBackdropMotion: false
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

function applyPreferences(preferences = getLocalPreferences()) {
    document.body.classList.toggle('compact-mobile-mode', !!preferences.compactMobile);
    document.body.classList.toggle('reduce-backdrop-motion', !!preferences.reduceBackdropMotion);
    document.body.classList.toggle('notifications-off', !preferences.notifications);
    if (!preferences.notifications) {
        const badge = getEl('notif-badge');
        const drop = getEl('notif-dropdown');
        if (badge) badge.style.display = 'none';
        if (drop) drop.style.display = 'none';
    }
}

async function getPreferences() {
    const local = getLocalPreferences();
    const data = await DataManager.getUserData();
    const preferences = { ...local, ...(data?.preferences || {}) };
    setLocalPreferences(preferences);
    applyPreferences(preferences);
    return preferences;
}

async function savePreferences(update) {
    const current = getLocalPreferences();
    const preferences = { ...current, ...update };
    setLocalPreferences(preferences);
    applyPreferences(preferences);
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
        const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}&language=tr-TR${params}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('API Fetch Error:', error);
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
                ${source ? `<iframe src="${source}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>` : `
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

// --- Data & Persistence ---
const DataManager = {
    getUserData: async () => {
        const user = await AuthManager.getUser();
        if (!user) return null;
        
        const { data, error } = await supabase
            .from('user_data')
            .select('*')
            .eq('id', user.id)
            .single();
            
        if (error && error.code !== 'PGRST116') {
            console.error('User Data Fetch Error:', error);
        }
        return data;
    },
    
    updateUserData: async (update) => {
        const user = await AuthManager.getUser();
        if (!user) return;
        
        const { error } = await supabase
            .from('user_data')
            .upsert({ id: user.id, ...update }, { onConflict: 'id' });
            
        if (error) console.error('User Data Update Error:', error);
    },
    
    toggleWatchlist: async (movie) => {
        const data = await DataManager.getUserData();
        let watchlist = data?.watchlist || [];
        const exists = watchlist.findIndex(m => m.id === movie.id);
        
        if (exists > -1) {
            watchlist.splice(exists, 1);
        } else {
            watchlist.push({
                id: movie.id,
                title: movie.title || movie.name,
                poster_path: movie.poster_path,
                release_date: movie.release_date || movie.first_air_date,
                media_type: movie.type || currentBrowseType
            });
        }
        
        await DataManager.updateUserData({ watchlist });
        updateActionButtons();
    },

    removeFromWatchlist: async (movieId) => {
        const data = await DataManager.getUserData();
        const watchlist = (data?.watchlist || []).filter(m => m.id !== movieId);
        await DataManager.updateUserData({ watchlist });
        renderCollection('favorites', 'Favorilerim');
        updateActionButtons();
    },

    removeHistoryItem: async (movieId) => {
        const data = await DataManager.getUserData();
        const history = (data?.history || []).filter(m => m.id !== movieId);
        await DataManager.updateUserData({ history });
    },

    removeFromHistory: async (movieId) => {
        await DataManager.removeHistoryItem(movieId);
        renderCollection('history', 'İzleme Geçmişi');
        renderContinueWatching();
    },
    
    addToHistory: async (movie) => {
        const data = await DataManager.getUserData();
        if (!data) return;
        
        let history = data.history || [];
        // Remove existing and add to front
        history = [movie, ...history.filter(m => m.id !== movie.id)].slice(0, 30);
        
        await DataManager.updateUserData({ history });
        renderContinueWatching();
    }
};

// --- Rendering Core ---
function renderMovies(movies, container, type = 'movie', options = {}) {
    if (!container || !movies) return;
    if (!movies.length) {
        container.innerHTML = `<div class="empty-state">${options.emptyText || 'Henüz içerik yok.'}</div>`;
        return;
    }
    
    container.innerHTML = movies.map(movie => `
        <div class="movie-card ${options.removable ? 'is-removable' : ''}" onclick="openModalById(${movie.id}, '${movie.media_type || type}')">
            <img src="${movie.poster_path ? IMG_URL + movie.poster_path : POSTER_FALLBACK}" alt="${movie.title || movie.name}" loading="lazy">
            <div class="card-info">
                <h4>${movie.title || movie.name}</h4>
                <p>${(movie.release_date || movie.first_air_date || '').split('-')[0]}</p>
            </div>
            ${options.removable ? `
                <button class="remove-card-btn" title="${options.removeTitle || 'Listeden kaldır'}" onclick="event.stopPropagation(); ${options.removeAction}(${movie.id})">
                    <i data-lucide="x"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
    
    if (window.lucide) lucide.createIcons();
}

window.openModalById = async (id, type) => {
    const movie = await apiFetch(`/${type}/${id}`);
    if (movie) openModal(movie, type);
};

async function openModal(movie, type = 'movie') {
    currentMovie = { ...movie, type };
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
    getEl('modal-cast-list').innerHTML = castData.cast?.slice(0, 8).map(c => `
        <span class="cast-link" onclick="renderCollection('cast', '${c.name.replace(/'/g, "\\'")} Filmleri', '${c.name.replace(/'/g, "\\'")}')">${c.name}</span>
    `).join(', ') || 'Bilgi yok';
    
    // Social & Ratings
    fetchComments(movie.id);
    fetchMiracScore(movie.id);
    updateActionButtons();
    
    getEl('movie-modal').style.display = 'block';
    getEl('movie-modal').scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    
    // Recommendations
    apiFetch(`/${type}/${movie.id}/recommendations`).then(data => {
        renderMovies(data.results?.slice(0, 12), getEl('similar-content-list'), type);
    });
}

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
    
    list.innerHTML = data.length > 0 ? data.map(c => `
        <div class="comment-card">
            <img src="${c.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.username}`}" class="comment-avatar">
            <div class="comment-info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h4>${c.username}</h4>
                    ${user && user.id === c.user_id ? `
                        <div class="comment-actions">
                            <button onclick="deleteComment('${c.id}')" title="Sil"><i data-lucide="trash-2" style="width:16px;"></i></button>
                        </div>
                    ` : ''}
                </div>
                <p>${c.content}</p>
            </div>
        </div>
    `).join('') : '<p style="color:#666; text-align:center; padding: 20px;">Henüz yorum yapılmamış. İlk yorumu sen yap!</p>';
    
    if (window.lucide) lucide.createIcons();
}

async function postComment() {
    const user = await AuthManager.getUser();
    if (!user) return alert('Yorum yapmak için giriş yapmalısınız.');
    
    const content = getEl('comment-textarea').value.trim();
    if (!content) return;
    
    const userData = await DataManager.getUserData();
    const activeProfileIndex = parseInt(localStorage.getItem('activeProfileIndex') || '0');
    const activeProfile = (userData?.profiles || [])[activeProfileIndex] || { name: 'Kullanıcı' };
    
    const { error } = await supabase.from('comments').insert({
        user_id: user.id,
        movie_id: currentMovie.id.toString(),
        username: activeProfile.name,
        avatar_url: activeProfile.avatar,
        content: content
    });
    
    if (error) alert('Hata: ' + error.message);
    else {
        getEl('comment-textarea').value = '';
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
    
    if (['favorites', 'history'].includes(type)) {
        getEl('collection-grid').style.display = 'grid';
        const data = await DataManager.getUserData();
        const list = type === 'favorites' ? (data?.watchlist || []) : (data?.history || []);
        renderMovies(list, getEl('collection-grid'), 'movie', {
            removable: true,
            removeAction: type === 'favorites' ? 'removeFromWatchlist' : 'removeFromHistory',
            removeTitle: type === 'favorites' ? 'Favorilerden kaldır' : 'Geçmişten kaldır',
            emptyText: type === 'favorites' ? 'Favorilerinde henüz içerik yok.' : 'İzleme geçmişin henüz boş.'
        });
    } else if (['movie', 'tv', 'popular'].includes(type)) {
        getEl('browse-view').style.display = 'block';
        currentBrowseType = type;
        loadBrowse(1);
    } else if (type === 'search' || type === 'cast') {
        getEl('collection-grid').style.display = 'grid';
        const grid = getEl('collection-grid');
        grid.innerHTML = '<p>Aranıyor...</p>';
        
        let endpoint = type === 'search' ? '/search/multi' : '/search/person';
        const searchData = await apiFetch(endpoint, `&query=${encodeURIComponent(extra)}`);
        
        if (type === 'cast' && searchData.results?.[0]) {
            const personId = searchData.results[0].id;
            const credits = await apiFetch(`/person/${personId}/movie_credits`);
            renderMovies(credits.cast?.slice(0, 20), grid);
        } else {
            renderMovies(searchData.results?.slice(0, 24), grid);
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

window.renderCollection = renderCollection;
window.removeFromWatchlist = (movieId) => DataManager.removeFromWatchlist(movieId);
window.removeFromHistory = (movieId) => DataManager.removeFromHistory(movieId);
window.removeFromContinue = async (movieId) => {
    await DataManager.removeHistoryItem(movieId);
    renderContinueWatching();
};

function bindSettingsControls() {
    document.querySelectorAll('[data-setting]').forEach(input => {
        input.addEventListener('change', () => {
            savePreferences({ [input.dataset.setting]: input.checked });
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

    const views = {
        account: {
            title: 'Hesap',
            icon: 'user',
            body: `
                <div class="info-row"><span>E-posta</span><strong>${user?.email || 'Giriş yapılmadı'}</strong></div>
                <div class="info-row"><span>Aktif profil</span><strong>${activeProfile.name}</strong></div>
                <div class="info-row"><span>Profil sayısı</span><strong>${profiles.length}/5</strong></div>
                <button class="btn-xl secondary" onclick="renderCollection('profiles', 'Profil Yönetimi')"><i data-lucide="users"></i> Profilleri Yönet</button>
            `
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
    getEl('edit-profile-preview').src = profile && profile.avatar 
        ? profile.avatar 
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile ? profile.name : 'New'}`;
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
        profileContainer.innerHTML = `<button type="button" class="nav-login-btn" onclick="openAuthModal(event)">Giriş Yap</button>`;
        profileContainer.classList.add('logged-out');
        return;
    }
    profileContainer.classList.remove('logged-out');
    
    const data = await DataManager.getUserData();
    const profiles = data?.profiles || [{ name: 'Kullanıcı' }];
    const activeIndex = parseInt(localStorage.getItem('activeProfileIndex') || '0');
    const activeProfile = profiles[activeIndex] || profiles[0];
    
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

async function updateActionButtons() {
    if (!currentMovie) return;
    const data = await DataManager.getUserData();
    const isInWatchlist = (data?.watchlist || []).some(m => m.id === currentMovie.id);
    
    const btn = getEl('add-to-watchlist');
    if (btn) {
        btn.innerHTML = isInWatchlist ? `<i data-lucide="check"></i>` : `<i data-lucide="plus"></i>`;
        if (window.lucide) lucide.createIcons();
    }
}

// --- App Initialization ---
async function init() {
    applyPreferences();
    // Keep the intro visual, but never let slow APIs trap the whole UI behind it.
    setTimeout(revealApp, 1800);

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
    
    // 2. Auth State UI
    updateProfileUI();
    getPreferences();
    
    const isLoggedIn = await AuthManager.isLoggedIn();
    if (isLoggedIn) {
        renderContinueWatching();
        
        // Notifications (Upcoming)
        apiFetch('/movie/upcoming').then(d => {
            if (getLocalPreferences().notifications && d.results?.length) {
                getEl('notif-badge').style.display = 'block';
                getEl('notif-list').innerHTML = d.results.slice(0, 5).map(m => `
                    <div class="notif-item" onclick="openModalById(${m.id}, 'movie')">
                        <img src="${IMG_URL + m.poster_path}" class="notif-poster">
                        <div class="notif-info">
                            <h4>${m.title}</h4>
                            <p>Yakında Sinemalarda!</p>
                        </div>
                    </div>
                `).join('');
            }
        });
    }

    // 3. Remove Loading Intro once the first content pass has had a chance to land.
    setTimeout(revealApp, 1500);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    init();

    // Global Auth Listener
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            updateProfileUI();
            if (event === 'SIGNED_IN') renderContinueWatching();
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
        const user = await AuthManager.getUser();
        getEl(user ? 'profile-settings-modal' : 'auth-modal').style.display = 'flex';
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
    });

    // Surprise (Shuffle)
    getEl('surprise-btn')?.addEventListener('click', async () => {
        const data = await apiFetch('/movie/popular', `&page=${Math.floor(Math.random() * 10) + 1}`);
        if (data.results?.length) openModal(data.results[Math.floor(Math.random() * 20)]);
    });

    // Profile Settings
    getEl('menu-profiles-manage')?.addEventListener('click', () => renderCollection('profiles', 'Profil Yönetimi'));
    getEl('menu-favorites')?.addEventListener('click', () => renderCollection('favorites', 'Favorilerim'));
    getEl('menu-history')?.addEventListener('click', () => renderCollection('history', 'İzleme Geçmişi'));
    getEl('menu-account')?.addEventListener('click', () => renderProfileInfoView('account'));
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
            profiles.push({ name, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}` });
        } else {
            profiles[index].name = name;
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
            : await supabase.auth.signUp({ email, password });
            
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
    
    getEl('modal-play-btn')?.addEventListener('click', () => {
        openPlayerPage(currentMovie, currentImdbId);
        DataManager.addToHistory(currentMovie);
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
            if (action === 'favorites') renderCollection('favorites', 'Favorilerim');
            if (action === 'profile') {
                const user = await AuthManager.getUser();
                getEl(user ? 'profile-settings-modal' : 'auth-modal').style.display = 'flex';
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
