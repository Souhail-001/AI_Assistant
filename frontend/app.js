
const API = '';  // Same-origin; adjust if running on different port
const ACCESS_TOKEN_KEY = 'access_token';
const authState = {
    isAuthenticated: false,
    initialized: false,
};
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt'];
const RESUME_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
]);

let uploadZone = null;
let fileInput = null;

// ── Tab Navigation ─────────────────────────────────────────
function setActiveTab(tabName) {
    if (!authState.isAuthenticated) {
        applyAuthGate();
        return;
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
        tab.style.pointerEvents = 'auto';
    });
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.remove('active');
        void selectedTab.offsetWidth;
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block';
    }

    if (tabName === 'history') {
        loadHistory();
    }
}

function applyAuthGate() {
    const isLoggedIn = authState.isAuthenticated;
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'inline-flex' : 'none';
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.disabled = !isLoggedIn;
        btn.classList.toggle('disabled', !isLoggedIn);
    });
    if (isLoggedIn && !document.querySelector('.tab-content.active')) {
        setActiveTab('review');
    }
}

// ── Page Router ────────────────────────────────────────────
function showPage(name, authMode) {
    if (name === 'dashboard' && !authState.isAuthenticated) {
        name = 'auth';
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + name);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);

    if (name === 'home') {
        initParticles();
        initScrollReveal();
        runStatCounters();
    }
    if (name === 'auth' && authMode) {
        switchAuthForm(authMode);
    }
    if (name === 'dashboard') {
        applyAuthGate();
    }
}

function ensureAuthenticated() {
    if (authState.isAuthenticated) return true;
    showPage('auth');
    setAuthStatus('🔒 Please log in first.', 'error');
    return false;
}

// ── File Upload Drag & Drop ────────────────────────────────
function setupUploadZone() {
    uploadZone = document.getElementById('uploadZone');
    fileInput = document.getElementById('resumeFile');

    if (!uploadZone || !fileInput) return;

    fileInput.setAttribute(
        'accept',
        '.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
    );

    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', e => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            uploadZone.querySelector('p').textContent = `✓ ${e.dataTransfer.files[0].name}`;
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            uploadZone.querySelector('p').textContent = `✓ ${fileInput.files[0].name}`;
        }
    });
}

// ── Utility: show loader on button ─────────────────────────
function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn._origHTML = btn.innerHTML;
        btn.innerHTML = '<div class="spinner"></div> Processing...';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn._origHTML || btn.innerHTML;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function parseErrorMessage(resp) {
    try {
        const body = await resp.json();
        return body?.detail || resp.statusText;
    } catch {
        return resp.statusText;
    }
}

function setAuthStatus(message, type = '') {
    const statusBox = document.getElementById('authStatus');
    if (!statusBox) return;
    statusBox.className = type ? `status-box ${type}` : 'status-box';
    statusBox.textContent = message;
    statusBox.style.display = 'block';
}

function setAccessToken(token) {
    if (token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
}

function getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

async function validateTokenWithServer(token) {
    if (!token) return false;

    try {
        const resp = await fetch(`${API}/api/v1/auth/me`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
        });
        return resp.ok;
    } catch {
        return false;
    }
}

async function tryRefreshAccessToken() {
    try {
        const resp = await fetch(`${API}/api/v1/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (!resp.ok) return null;

        const data = await resp.json();
        return data?.access_token || null;
    } catch {
        return null;
    }
}

async function initializeAuthGate() {
    const storedToken = getAccessToken();
    if (await validateTokenWithServer(storedToken)) {
        authState.isAuthenticated = true;
        authState.initialized = true;
        showPage('dashboard');
        return;
    }
    const refreshedToken = await tryRefreshAccessToken();
    if (refreshedToken && await validateTokenWithServer(refreshedToken)) {
        setAccessToken(refreshedToken);
        authState.isAuthenticated = true;
        authState.initialized = true;
        showPage('dashboard');
        return;
    }
    setAccessToken('');
    authState.isAuthenticated = false;
    authState.initialized = true;
    showPage('home');
}

async function fetchWithAuth(url, options = {}) {
    if (!ensureAuthenticated()) {
        throw new Error('Authentication required');
    }

    const token = getAccessToken();
    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
    };

    const resp = await fetch(url, {
        ...options,
        headers,
    });

    if (resp.status === 401) {
        setAccessToken('');
        authState.isAuthenticated = false;
        applyAuthGate();
        setAuthStatus('🔒 Session expired. Please log in again.', 'error');
    }

    return resp;
}

async function submitRegister() {
    const btn = document.getElementById('registerSubmitBtn');
    const email = document.getElementById('registerEmail')?.value.trim();
    const password = document.getElementById('registerPassword')?.value || '';

    if (!email || !password) {
        setAuthStatus('Please provide email and password to register.', 'error');
        return;
    }

    setLoading(btn, true);
    try {
        const resp = await fetch(`${API}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email, password }),
        });

        if (!resp.ok) {
            throw new Error(await parseErrorMessage(resp));
        }

        setAuthStatus('✅ Registration successful. You can now log in.', 'success');
    } catch (err) {
        setAuthStatus(`❌ ${err.message}`, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function submitLogin() {
    const btn = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value || '';

    if (!email || !password) {
        setAuthStatus('Please provide email and password to log in.', 'error');
        return;
    }

    setLoading(btn, true);
    try {
        const body = new URLSearchParams();
        body.append('username', email);
        body.append('password', password);

        const resp = await fetch(`${API}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            credentials: 'include',
        });

        if (!resp.ok) {
            throw new Error(await parseErrorMessage(resp));
        }

        const data = await resp.json();
        const accessToken = data?.access_token || '';
        setAccessToken(accessToken);

        const valid = await validateTokenWithServer(accessToken);
        if (!valid) {
            setAccessToken('');
            authState.isAuthenticated = false;
            applyAuthGate();
            throw new Error('Login completed but token validation failed. Please try again.');
        }

        authState.isAuthenticated = true;
        authState.initialized = true;
        showPage('dashboard');
    } catch (err) {
        setAuthStatus(`❌ ${err.message}`, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function submitLogout() {
    const btn = document.getElementById('logoutBtn');
    setLoading(btn, true);
    try {
        await fetch(`${API}/api/v1/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });
        setAccessToken('');
        authState.isAuthenticated = false;
        showPage('home');
    } catch (err) {
        setAuthStatus(`❌ ${err.message}`, 'error');
    } finally {
        setLoading(btn, false);
    }
}

function parseReviewList(rawBlock) {
    if (!rawBlock || typeof rawBlock !== 'string') return [];

    const normalized = rawBlock.replace(/\r/g, '\n').trim();
    if (!normalized) return [];

    const lines = normalized
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
        .filter(Boolean);

    if (lines.length > 1) return lines;

    const fallback = normalized
        .split(/[;•]/)
        .map(line => line.trim())
        .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
        .filter(Boolean);

    return fallback;
}

function parseReviewText(reviewText) {
    if (!reviewText || typeof reviewText !== 'string') return null;

    const text = reviewText.replace(/\r/g, '\n').trim();
    if (!text) return null;

    const markerRegex = /(?:^|\n)\s*(?:\d+\s*[.)-]?\s*)?(Overall\s*Score|Strengths|Critical\s*Weaknesses|Suggested\s*Improvements|Required\s*Improvements(?:\s*\(Priority\s*Order\))?|Honest\s*Hiring\s*Outlook)\s*[:\-]\s*/gim;
    const markers = [];
    let match;

    while ((match = markerRegex.exec(text)) !== null) {
        const rawKey = match[1].toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
        const normalizedKey = rawKey.includes('required_improvements')
            ? 'required_improvements'
            : rawKey;

        markers.push({
            key: normalizedKey,
            start: match.index,
            contentStart: markerRegex.lastIndex,
        });
    }

    if (!markers.length) return null;

    const sections = {};
    for (let index = 0; index < markers.length; index += 1) {
        const current = markers[index];
        const end = index < markers.length - 1 ? markers[index + 1].start : text.length;
        sections[current.key] = text.slice(current.contentStart, end).trim();
    }

    const scoreText = sections.overall_score || '';
    const scoreMatch = scoreText.match(/(100|\d{1,2})(?:\s*\/\s*100)?/);
    const parsedScore = scoreMatch ? Math.min(100, Math.max(0, Number(scoreMatch[1]))) : null;
    const verdictMatch = scoreText.match(/\b(STRONG|BORDERLINE|WEAK|REJECT)\b/i);
    const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : null;

    const improvementsBlock = sections.required_improvements || sections.suggested_improvements;
    const outlookText = (sections.honest_hiring_outlook || '')
        .replace(/\n{2,}/g, '\n')
        .trim();

    return {
        summary: text.slice(0, markers[0].start).trim(),
        score: Number.isFinite(parsedScore) ? parsedScore : null,
        verdict,
        strengths: parseReviewList(sections.strengths),
        weaknesses: parseReviewList(sections.critical_weaknesses),
        improvements: parseReviewList(improvementsBlock),
        outlook: outlookText,
    };
}

function validateResumeFile(file) {
    if (!file) return null;
    if (file.size > MAX_RESUME_BYTES) {
        return 'File is too large. Max size is 5MB.';
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isValidExtension = RESUME_EXTENSIONS.includes(extension);
    const isValidMime = RESUME_MIME_TYPES.has(file.type);

    if (!isValidExtension && !isValidMime) {
        return 'Unsupported file type. Please upload PDF, DOCX, DOC, or TXT.';
    }

    return null;
}

function normalizeVerdict(verdict) {
    if (!verdict) return null;
    const value = String(verdict).trim().toUpperCase();
    return ['STRONG', 'BORDERLINE', 'WEAK', 'REJECT'].includes(value) ? value : null;
}

function deriveVerdictFromScore(score) {
    if (!Number.isFinite(score)) return null;
    if (score >= 80) return 'STRONG';
    if (score >= 60) return 'BORDERLINE';
    if (score >= 40) return 'WEAK';
    return 'REJECT';
}

function renderReviewListItems(items, emptyText, listType) {
    if (!items.length) {
        return `<li class="review-item empty-item"><p>${escapeHtml(emptyText)}</p></li>`;
    }

    return items.map(rawItem => {
        let text = String(rawItem || '').trim();
        const badges = [];

        const severityMatch = text.match(/\[(DEALBREAKER|MAJOR|MINOR)\]/i);
        if (severityMatch) {
            const severity = severityMatch[1].toUpperCase();
            badges.push(`<span class="review-badge review-badge-severity review-badge-${severity.toLowerCase()}">${severity}</span>`);
            text = text.replace(severityMatch[0], '').trim();
        }

        const impactMatch = text.match(/\[(?:IMPACT:\s*)?(HIGH|MEDIUM|LOW)\]/i);
        if (impactMatch) {
            const impact = impactMatch[1].toUpperCase();
            badges.push(`<span class="review-badge review-badge-impact review-badge-impact-${impact.toLowerCase()}">IMPACT ${impact}</span>`);
            text = text.replace(impactMatch[0], '').trim();
        }

        if (listType === 'strengths') {
            badges.push('<span class="review-badge review-badge-tone review-badge-positive">EVIDENCE</span>');
        }

        return `
            <li class="review-item">
                ${badges.length ? `<div class="review-item-badges">${badges.join('')}</div>` : ''}
                <p>${escapeHtml(text || String(rawItem || ''))}</p>
            </li>
        `;
    }).join('');
}

function renderScoreCard({ score, verdict, summary }) {
    const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
    const scoreValue = normalizedScore ?? 0;
    const scoreLabel = normalizedScore !== null ? String(normalizedScore) : '—';
    const finalVerdict = normalizeVerdict(verdict) || deriveVerdictFromScore(normalizedScore);
    const circumference = 2 * Math.PI * 34;
    const offset = circumference - (scoreValue / 100) * circumference;
    const verdictClass = finalVerdict ? `review-verdict review-verdict-${finalVerdict.toLowerCase()}` : 'review-verdict';

    return `
        <svg width="0" height="0"><defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5ef5c4"/><stop offset="50%" stop-color="#36c7d0"/><stop offset="100%" stop-color="#e879a8"/></linearGradient></defs></svg>
        <div class="result-card review-score-card">
            <div class="result-header">
                <div class="score-ring">
                    <svg viewBox="0 0 80 80">
                        <circle class="bg-circle" cx="40" cy="40" r="34"/>
                        <circle class="score-circle" cx="40" cy="40" r="34"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <div class="score-value">${scoreLabel}</div>
                </div>
                <div class="result-summary">
                    <div class="review-head-meta">
                        <h3>Overall Score</h3>
                        ${finalVerdict ? `<span class="${verdictClass}">${escapeHtml(finalVerdict)}</span>` : ''}
                    </div>
                    <p>${escapeHtml(summary || 'Detailed review generated from your resume and role context.')}</p>
                </div>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
// FEATURE 1: Resume Review
// ═══════════════════════════════════════════════════════════
async function submitReview() {
    if (!ensureAuthenticated()) return;

    const btn = document.getElementById('reviewBtn');
    const resultsArea = document.getElementById('reviewResults');
    const file = fileInput?.files?.[0];
    const textInput = document.getElementById('resumeText').value.trim();
    const jobDesc = document.getElementById('jobDesc').value.trim();

    if (!file && !textInput) {
        alert('Please upload a file or paste your resume text.');
        return;
    }

    const fileError = validateResumeFile(file);
    if (fileError) {
        alert(fileError);
        return;
    }

    setLoading(btn, true);
    resultsArea.style.display = 'none';

    try {
        let data;
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            if (jobDesc) formData.append('job_description', jobDesc);
            const resp = await fetchWithAuth(`${API}/api/v1/review/upload`, {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
            data = await resp.json();
        } else {
            const resp = await fetchWithAuth(`${API}/api/v1/review/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resume_text: textInput,
                    job_description: jobDesc || null,
                }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
            data = await resp.json();
        }

        renderReviewResults(data, resultsArea);
    } catch (err) {
        resultsArea.innerHTML = `<div class="status-box error">❌ ${err.message}</div>`;
        resultsArea.style.display = 'block';
    } finally {
        setLoading(btn, false);
    }
}

function renderReviewResults(data, container) {
    const payload = (data && typeof data === 'object') ? data : {};
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const extractedSkills = Array.isArray(payload.extracted_skills) ? payload.extracted_skills : [];
    const keywordGaps = Array.isArray(payload.keyword_gaps) ? payload.keyword_gaps : [];
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];

    const hasStructuredReview =
        Number.isFinite(Number(payload.overall_score)) ||
        sections.length > 0 ||
        extractedSkills.length > 0 ||
        keywordGaps.length > 0 ||
        suggestions.length > 0;

    const parsedReview = !hasStructuredReview && typeof payload.review === 'string'
        ? parseReviewText(payload.review)
        : null;

    if (!hasStructuredReview && typeof payload.review === 'string' && !parsedReview) {
        const safeText = escapeHtml(payload.review).replace(/\n/g, '<br>');
        container.innerHTML = `
            <div class="result-card review-panel review-panel-outlook">
                <h3>📄 Review Result</h3>
                <p class="review-raw-text">${safeText}</p>
            </div>
        `;
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    const reviewModel = parsedReview
        ? {
            score: parsedReview.score,
            verdict: parsedReview.verdict,
            summary: parsedReview.summary,
            strengths: parsedReview.strengths,
            weaknesses: parsedReview.weaknesses,
            improvements: parsedReview.improvements,
            outlook: parsedReview.outlook,
        }
        : {
            score: Number(payload.overall_score),
            verdict: payload.verdict,
            summary: payload.summary,
            strengths: [],
            weaknesses: keywordGaps,
            improvements: suggestions,
            outlook: payload.hiring_outlook || '',
        };

    const hasAnyList = reviewModel.strengths.length || reviewModel.weaknesses.length || reviewModel.improvements.length;

    let html = `<div class="review-report">${renderScoreCard(reviewModel)}`;

    html += `
        <div class="review-grid">
            <div class="result-card review-panel review-panel-strengths">
                <h3>✅ Strengths</h3>
                <ul class="review-list">${renderReviewListItems(reviewModel.strengths, 'No strengths extracted.', 'strengths')}</ul>
            </div>
            <div class="result-card review-panel review-panel-weaknesses">
                <h3>⚠️ Critical Weaknesses</h3>
                <ul class="review-list">${renderReviewListItems(reviewModel.weaknesses, 'No critical weaknesses extracted.', 'weaknesses')}</ul>
            </div>
        </div>

        <div class="result-card review-panel review-panel-improvements">
            <h3>💡 Required Improvements</h3>
            <ul class="review-list">${renderReviewListItems(reviewModel.improvements, 'No improvement actions extracted.', 'improvements')}</ul>
        </div>
    `;

    if (reviewModel.outlook) {
        html += `
            <div class="result-card review-panel review-panel-outlook">
                <h3>📌 Honest Hiring Outlook</h3>
                <p class="review-outlook-text">${escapeHtml(reviewModel.outlook).replace(/\n/g, '<br>')}</p>
            </div>
        `;
    }

    if (sections.length) {
        html += `
            <div class="result-card review-panel">
                <h3>📋 Section Analysis</h3>
                <ul class="section-list">
                    ${sections.map(section => `
                        <li class="section-item">
                            <span class="section-name">
                                <span class="dot ${section.present ? 'dot-green' : 'dot-red'}"></span>
                                ${escapeHtml(section.section || 'Unnamed Section')}
                            </span>
                            <span class="section-score">${Math.round(Number(section.score) || 0)}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    if (extractedSkills.length || keywordGaps.length) {
        html += `<div class="review-grid">`;
        if (extractedSkills.length) {
            html += `
                <div class="result-card review-panel">
                    <h3>🛠 Detected Skills</h3>
                    <div class="tag-list">
                        ${extractedSkills.map(skill => `<span class="tag tag-skill">${escapeHtml(skill)}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        if (keywordGaps.length) {
            html += `
                <div class="result-card review-panel">
                    <h3>🔍 Keyword Gaps</h3>
                    <div class="tag-list">
                        ${keywordGaps.map(gap => `<span class="tag tag-gap">${escapeHtml(gap)}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        html += `</div>`;
    }

    if (!hasAnyList && typeof payload.review === 'string') {
        html += `<div class="result-card"><h3>📄 Full Review</h3><p class="review-raw-text">${escapeHtml(payload.review).replace(/\n/g, '<br>')}</p></div>`;
    }

    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
// FEATURE 2: AI Interviewer
// ═══════════════════════════════════════════════════════════
const interviewState = {
    sessionId: null,
    questionNumber: 0,
    totalQuestions: 6,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    inputMode: 'voice', // 'voice' or 'text'
};

async function startInterview() {
    if (!ensureAuthenticated()) return;

    const btn = document.getElementById('startInterviewBtn');
    const statusBox = document.getElementById('interviewStatus');
    const role = document.getElementById('interviewRole').value.trim();
    const difficulty = document.getElementById('interviewDifficulty').value;

    if (!role) {
        alert('Please enter a job role.');
        return;
    }

    setLoading(btn, true);
    statusBox.style.display = 'block';
    statusBox.className = 'status-box';
    statusBox.textContent = '⏳ Setting up your interview...';

    try {
        const resp = await fetchWithAuth(`${API}/api/v1/interview/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_role: role, difficulty }),
        });

        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || resp.statusText);
        }

        const data = await resp.json();
        interviewState.sessionId = data.session_id;
        interviewState.questionNumber = 1;
        interviewState.totalQuestions = data.total_questions || 6;

        // Hide setup, show active area
        document.getElementById('interviewSetup').style.display = 'none';
        statusBox.style.display = 'none';
        document.getElementById('interviewActive').style.display = 'block';
        document.getElementById('interviewResults').style.display = 'none';

        // Set role badge
        document.getElementById('interviewRoleBadge').textContent = `${role} · ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;

        // Update progress
        updateInterviewProgress();

        // Render first question
        const transcript = document.getElementById('interviewTranscript');
        transcript.innerHTML = '';
        addTranscriptBubble('ai', data.question, data.audio_base64);

    } catch (err) {
        statusBox.className = 'status-box error';
        statusBox.textContent = `❌ ${err.message}`;
    } finally {
        setLoading(btn, false);
    }
}

function updateInterviewProgress() {
    const fill = document.getElementById('interviewProgressFill');
    const label = document.getElementById('interviewProgressLabel');
    const pct = (interviewState.questionNumber / interviewState.totalQuestions) * 100;
    fill.style.width = `${pct}%`;
    label.textContent = `Question ${interviewState.questionNumber} / ${interviewState.totalQuestions}`;
}

function addTranscriptBubble(role, text, audioBase64 = null) {
    const transcript = document.getElementById('interviewTranscript');
    const bubble = document.createElement('div');
    bubble.className = `transcript-bubble transcript-${role}`;

    const label = role === 'ai' ? '🤖 Interviewer' : '👤 You';
    let audioHtml = '';
    if (audioBase64) {
        audioHtml = `
            <div class="transcript-audio">
                <button class="play-audio-btn" onclick="playAudioBase64(this, '${audioBase64}')">
                    ▶ Play Audio
                </button>
            </div>`;
    }

    bubble.innerHTML = `
        <div class="transcript-role">${label}</div>
        <div class="transcript-text">${escapeHtml(text)}</div>
        ${audioHtml}
    `;

    transcript.appendChild(bubble);
    transcript.scrollTop = transcript.scrollHeight;
}

function addTranscriptFeedback(feedback) {
    const transcript = document.getElementById('interviewTranscript');
    const div = document.createElement('div');
    div.className = 'transcript-feedback';
    div.innerHTML = `<strong>📝 Feedback:</strong> ${escapeHtml(feedback)}`;
    transcript.appendChild(div);
    transcript.scrollTop = transcript.scrollHeight;
}

function playAudioBase64(btn, base64Data) {
    try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const origText = btn.textContent;
        btn.textContent = '⏸ Playing...';
        btn.disabled = true;
        audio.play();
        audio.onended = () => {
            btn.textContent = origText;
            btn.disabled = false;
            URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
            btn.textContent = origText;
            btn.disabled = false;
        };
    } catch (e) {
        console.error('Audio playback error:', e);
    }
}

// ── Input mode toggle ────────────────────────────────
function setInterviewMode(mode) {
    interviewState.inputMode = mode;
    document.getElementById('voiceArea').style.display = mode === 'voice' ? 'flex' : 'none';
    document.getElementById('textArea').style.display = mode === 'text' ? 'block' : 'none';
    document.getElementById('modeVoiceBtn').classList.toggle('active', mode === 'voice');
    document.getElementById('modeTextBtn').classList.toggle('active', mode === 'text');
}

// ── Voice recording ──────────────────────────────────
async function toggleRecording() {
    if (interviewState.isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        interviewState.audioChunks = [];
        interviewState.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

        interviewState.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) interviewState.audioChunks.push(e.data);
        };

        interviewState.mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(interviewState.audioChunks, { type: 'audio/webm' });
            await submitAudioAnswer(audioBlob);
        };

        interviewState.mediaRecorder.start();
        interviewState.isRecording = true;

        document.getElementById('recordBtnInner').classList.add('recording');
        document.getElementById('recordPulse').classList.add('active');
        document.getElementById('waveform').style.display = 'flex';
        document.getElementById('recordHint').textContent = 'Recording... Click to stop';
    } catch (err) {
        alert('Microphone access denied. Please allow microphone access or use text mode.');
        console.error('Mic error:', err);
    }
}

function stopRecording() {
    if (interviewState.mediaRecorder && interviewState.mediaRecorder.state !== 'inactive') {
        interviewState.mediaRecorder.stop();
    }
    interviewState.isRecording = false;

    document.getElementById('recordBtnInner').classList.remove('recording');
    document.getElementById('recordPulse').classList.remove('active');
    document.getElementById('waveform').style.display = 'none';
    document.getElementById('recordHint').textContent = 'Processing...';
}

// ── Submit audio answer ──────────────────────────────
async function submitAudioAnswer(audioBlob) {
    const inputCard = document.getElementById('interviewInputCard');

    disableAnswerInput(true);

    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');

        const resp = await fetchWithAuth(`${API}/api/v1/interview/${interviewState.sessionId}/answer-audio`, {
            method: 'POST',
            body: formData,
        });

        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || resp.statusText);
        }

        const data = await resp.json();
        handleAnswerResponse(data, '(voice answer)');
    } catch (err) {
        addTranscriptBubble('user', `❌ Error: ${err.message}`);
    } finally {
        disableAnswerInput(false);
        document.getElementById('recordHint').textContent = 'Click to start recording';
    }
}

// ── Submit text answer ───────────────────────────────
async function submitTextAnswer() {
    const textarea = document.getElementById('interviewAnswer');
    const answer = textarea.value.trim();

    if (!answer) {
        alert('Please type your answer before submitting.');
        return;
    }

    disableAnswerInput(true);

    try {
        const resp = await fetchWithAuth(`${API}/api/v1/interview/${interviewState.sessionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer }),
        });

        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || resp.statusText);
        }

        const data = await resp.json();
        textarea.value = '';
        handleAnswerResponse(data, answer);
    } catch (err) {
        addTranscriptBubble('user', `❌ Error: ${err.message}`);
    } finally {
        disableAnswerInput(false);
    }
}

function handleAnswerResponse(data, answerText) {
    // Show user's answer
    addTranscriptBubble('user', answerText);

    // Show feedback
    if (data.feedback) {
        addTranscriptFeedback(data.feedback);
    }

    if (data.is_last || !data.next_question) {
        // Interview complete — auto-end
        document.getElementById('interviewInputCard').style.display = 'none';
        addTranscriptBubble('ai', '✅ That concludes our interview! Click "End Interview" for your final evaluation.');
    } else {
        // Show next question
        interviewState.questionNumber = data.question_number + 1;
        updateInterviewProgress();
        addTranscriptBubble('ai', data.next_question, data.audio_base64);
    }
}

function disableAnswerInput(disabled) {
    const recordBtn = document.getElementById('recordBtn');
    const submitBtn = document.getElementById('submitTextBtn');
    const textarea = document.getElementById('interviewAnswer');
    if (recordBtn) recordBtn.disabled = disabled;
    if (submitBtn) {
        if (disabled) {
            setLoading(submitBtn, true);
        } else {
            setLoading(submitBtn, false);
        }
    }
    if (textarea) textarea.disabled = disabled;
}

// ── End interview ────────────────────────────────────
async function endInterview() {
    if (!interviewState.sessionId) return;

    const btn = document.getElementById('endInterviewBtn');
    setLoading(btn, true);

    try {
        const resp = await fetchWithAuth(`${API}/api/v1/interview/${interviewState.sessionId}/end`, {
            method: 'POST',
        });

        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || resp.statusText);
        }

        const data = await resp.json();
        renderInterviewFeedback(data);

        // Hide active, show results
        document.getElementById('interviewActive').style.display = 'none';

    } catch (err) {
        const results = document.getElementById('interviewResults');
        results.innerHTML = `<div class="status-box error">❌ ${err.message}</div>`;
        results.style.display = 'block';
    } finally {
        setLoading(btn, false);
        interviewState.sessionId = null;
    }
}

function renderInterviewFeedback(data) {
    const container = document.getElementById('interviewResults');

    // Score card
    const score = data.score ?? null;
    const scoreValue = score !== null ? score : 0;
    const scoreLabel = score !== null ? String(score) : '—';
    const circumference = 2 * Math.PI * 34;
    const offset = circumference - (scoreValue / 100) * circumference;

    let verdict = '';
    if (score !== null) {
        if (score >= 80) verdict = 'STRONG';
        else if (score >= 60) verdict = 'GOOD';
        else if (score >= 40) verdict = 'NEEDS IMPROVEMENT';
        else verdict = 'WEAK';
    }

    const feedbackText = escapeHtml(data.final_feedback || '').replace(/\n/g, '<br>');

    container.innerHTML = `
        <div class="review-report">
            <svg width="0" height="0"><defs><linearGradient id="scoreGradI" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5ef5c4"/><stop offset="50%" stop-color="#36c7d0"/><stop offset="100%" stop-color="#e879a8"/></linearGradient></defs></svg>

            <div class="result-card review-score-card">
                <div class="result-header">
                    <div class="score-ring">
                        <svg viewBox="0 0 80 80">
                            <circle class="bg-circle" cx="40" cy="40" r="34"/>
                            <circle class="score-circle" cx="40" cy="40" r="34"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${offset}"/>
                        </svg>
                        <div class="score-value">${scoreLabel}</div>
                    </div>
                    <div class="result-summary">
                        <div class="review-head-meta">
                            <h3>Interview Score</h3>
                            ${verdict ? `<span class="review-verdict review-verdict-${verdict.toLowerCase().replace(/\s+/g, '-')}">${verdict}</span>` : ''}
                        </div>
                        <p>${data.questions_answered} of ${data.total_questions} questions answered</p>
                    </div>
                </div>
            </div>

            <div class="result-card review-panel review-panel-outlook">
                <h3>📋 Detailed Evaluation</h3>
                <div class="review-outlook-text">${feedbackText}</div>
            </div>

            <div style="text-align:center;margin-top:20px;">
                <button class="btn btn-primary" onclick="resetInterview()">Start New Interview</button>
            </div>
        </div>
    `;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetInterview() {
    interviewState.sessionId = null;
    interviewState.questionNumber = 0;
    document.getElementById('interviewSetup').style.display = 'block';
    document.getElementById('interviewActive').style.display = 'none';
    document.getElementById('interviewResults').style.display = 'none';
    document.getElementById('interviewInputCard').style.display = 'block';
    document.getElementById('interviewStatus').style.display = 'none';
    document.getElementById('interviewTranscript').innerHTML = '';
}

// ═══════════════════════════════════════════════════════════
// FEATURE 3: Job Matcher
// ═══════════════════════════════════════════════════════════
async function matchJobs() {
    if (!ensureAuthenticated()) return;

    const btn = document.getElementById('matchBtn');
    const resultsArea = document.getElementById('jobResults');
    const resumeText = document.getElementById('jobResumeText').value.trim();
    const hint = document.getElementById('jobHint').value.trim();
    const location = document.getElementById('jobLocation').value.trim();

    if (!resumeText || resumeText.length < 50) {
        alert('Please paste your resume text (at least 50 characters).');
        return;
    }

    setLoading(btn, true);
    resultsArea.style.display = 'none';

    try {
        const resp = await fetchWithAuth(`${API}/api/v1/jobs/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resume_text: resumeText,
                job_title_hint: hint || null,
                location: location || null,
            }),
        });

        if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
        const data = await resp.json();
        renderJobResults(data, resultsArea);
    } catch (err) {
        resultsArea.innerHTML = `<div class="status-box error">❌ ${err.message}</div>`;
        resultsArea.style.display = 'block';
    } finally {
        setLoading(btn, false);
    }
}

function renderJobResults(data, container) {
    const matches = Array.isArray(data?.matches) ? data.matches : [];
    const queryKeywords = Array.isArray(data?.query_keywords) ? data.query_keywords : [];

    if (matches.length === 0) {
        container.innerHTML = `<div class="status-box">No matching jobs found. Try adjusting your resume text or job title hint.</div>`;
        container.style.display = 'block';
        return;
    }

    let html = `
    <div class="result-card">
        <h3>🔑 Search Keywords</h3>
        <div class="tag-list" style="margin-top:8px;">
            ${queryKeywords.map(k => `<span class="tag tag-skill">${k}</span>`).join('')}
        </div>
        <p style="margin-top:12px;color:var(--text-muted);font-size:0.85rem;">Found ${data.total_found ?? matches.length} matching jobs</p>
    </div>`;

    matches.forEach((job, i) => {
        const scorePercent = Math.round(job.match_score * 100);
        const salary = job.salary_min || job.salary_max
            ? `💰 $${(job.salary_min || 0).toLocaleString()} — $${(job.salary_max || 0).toLocaleString()}`
            : '';

        html += `
        <div class="job-card">
            <div class="job-score-bar">
                <div class="score">${scorePercent}%</div>
                <div class="label">match</div>
            </div>
            <div class="job-info">
                <h4>${job.url ? `<a href="${job.url}" target="_blank">${job.title}</a>` : job.title}</h4>
                <div class="job-meta">
                    ${job.company ? `🏢 ${job.company}` : ''}
                    ${job.location ? ` · 📍 ${job.location}` : ''}
                    ${salary ? ` · ${salary}` : ''}
                </div>
                <div class="job-desc">${job.description}</div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
// FEATURE 4: Digital Footprint
// ═══════════════════════════════════════════════════════════
async function generateFootprint() {
    if (!ensureAuthenticated()) return;

    const btn = document.getElementById('footprintBtn');
    const resultsArea = document.getElementById('footprintResults');
    const github = document.getElementById('githubUser').value.trim();
    const linkedin = document.getElementById('linkedinUrl').value.trim();

    if (!github && !linkedin) {
        alert('Please enter at least a GitHub username or LinkedIn URL.');
        return;
    }

    setLoading(btn, true);
    resultsArea.style.display = 'none';

    try {
        const resp = await fetchWithAuth(`${API}/api/v1/footprint/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                github_username: github || null,
                linkedin_url: linkedin || null,
            }),
        });

        if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
        const data = await resp.json();
        renderFootprintResults(data, resultsArea);
    } catch (err) {
        resultsArea.innerHTML = `<div class="status-box error">❌ ${err.message}</div>`;
        resultsArea.style.display = 'block';
    } finally {
        setLoading(btn, false);
    }
}

function renderFootprintResults(data, container) {
    const ghTopLanguages = Array.isArray(data?.github?.top_languages) ? data.github.top_languages : [];
    const ghTopRepos = Array.isArray(data?.github?.top_repos) ? data.github.top_repos : [];
    const lnExperience = Array.isArray(data?.linkedin?.experience) ? data.linkedin.experience : [];
    const lnSkills = Array.isArray(data?.linkedin?.skills) ? data.linkedin.skills : [];
    const combinedSkills = Array.isArray(data?.combined_skills) ? data.combined_skills : [];
    let html = '';

    // ── Profile Strength ───────────────────────────────
    html += `
    <div class="result-card" style="text-align:center;">
        <h3 style="margin-bottom:16px;">Profile Strength</h3>
        <span class="strength-badge strength-${data.profile_strength}">${data.profile_strength}</span>
        <p style="margin-top:16px;color:var(--text-secondary);font-size:0.9rem;">${data.summary_text}</p>
    </div>`;

    // ── GitHub ──────────────────────────────────────────
    if (data.github) {
        const gh = data.github;
        const initials = gh.username.slice(0, 2).toUpperCase();

        html += `
        <div class="result-card">
            <div class="profile-header">
                <div class="profile-avatar">${initials}</div>
                <div class="profile-info">
                    <h3>GitHub: ${gh.username}</h3>
                    <p>${gh.bio || 'No bio'}</p>
                </div>
            </div>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${gh.public_repos}</div>
                    <div class="stat-label">Repos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${gh.total_stars}</div>
                    <div class="stat-label">Stars</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${gh.followers}</div>
                    <div class="stat-label">Followers</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${gh.following}</div>
                    <div class="stat-label">Following</div>
                </div>
            </div>
            ${ghTopLanguages.length ? `
                <h4 style="margin-top:16px;margin-bottom:8px;">Top Languages</h4>
                <div class="tag-list">
                    ${ghTopLanguages.map(l => `<span class="tag tag-lang">${l}</span>`).join('')}
                </div>
            ` : ''}
            ${ghTopRepos.length ? `
                <h4 style="margin-top:20px;margin-bottom:8px;">Top Repositories</h4>
                ${ghTopRepos.slice(0, 5).map(r => `
                    <div class="job-card" style="margin-bottom:8px;">
                        <div class="job-score-bar">
                            <div class="score">⭐${r.stars}</div>
                            <div class="label">${r.language || '—'}</div>
                        </div>
                        <div class="job-info">
                            <h4><a href="${r.url}" target="_blank">${r.name}</a></h4>
                            <div class="job-desc">${r.description || 'No description'}</div>
                        </div>
                    </div>
                `).join('')}
            ` : ''}
        </div>`;
    }

    // ── LinkedIn ────────────────────────────────────────
    if (data.linkedin) {
        const ln = data.linkedin;
        html += `
        <div class="result-card">
            <div class="profile-header">
                <div class="profile-avatar" style="background:var(--accent-gradient-warm);">${(ln.name || 'LI').slice(0, 2).toUpperCase()}</div>
                <div class="profile-info">
                    <h3>${ln.name || 'LinkedIn Profile'}</h3>
                    <p>${ln.headline || 'No headline'}</p>
                </div>
            </div>
            ${ln.summary ? `<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">${ln.summary}</p>` : ''}
            ${lnExperience.length ? `
                <h4>Experience</h4>
                <ul class="section-list">
                    ${lnExperience.map(e => `<li class="section-item"><span class="section-name">${e}</span></li>`).join('')}
                </ul>
            ` : ''}
            ${lnSkills.length ? `
                <h4 style="margin-top:16px;">Skills</h4>
                <div class="tag-list" style="margin-top:8px;">
                    ${lnSkills.map(s => `<span class="tag tag-skill">${s}</span>`).join('')}
                </div>
            ` : ''}
        </div>`;
    }

    // ── Combined Skills ─────────────────────────────────
    if (combinedSkills.length) {
        html += `
        <div class="result-card">
            <h3>🧩 Combined Skills</h3>
            <div class="tag-list" style="margin-top:12px;">
                ${combinedSkills.map(s => `<span class="tag tag-lang">${s}</span>`).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function bindNavigationHandlers() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!ensureAuthenticated()) return;
            setActiveTab(btn.dataset.tab);
        });
    });
}

function switchAuthForm(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('authTabLogin');
    const tabRegister = document.getElementById('authTabRegister');
    if (mode === 'register') {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        if (tabLogin) tabLogin.classList.remove('active');
        if (tabRegister) tabRegister.classList.add('active');
    } else {
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (tabLogin) tabLogin.classList.add('active');
        if (tabRegister) tabRegister.classList.remove('active');
    }
}

function bindAuthHandlers() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); submitLogout(); });

    const tabLogin = document.getElementById('authTabLogin');
    const tabRegister = document.getElementById('authTabRegister');
    if (tabLogin) tabLogin.addEventListener('click', () => switchAuthForm('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => switchAuthForm('register'));

    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', e => { e.preventDefault(); submitLogin(); });

    const registerSubmitBtn = document.getElementById('registerSubmitBtn');
    if (registerSubmitBtn) registerSubmitBtn.addEventListener('click', e => { e.preventDefault(); submitRegister(); });
}

function bindFeatureHandlers() {
    const handlers = [
        ['reviewBtn', submitReview], ['startInterviewBtn', startInterview],
        ['recordBtn', toggleRecording], ['submitTextBtn', submitTextAnswer],
        ['endInterviewBtn', endInterview], ['matchBtn', matchJobs],
        ['footprintBtn', generateFootprint],
        ['modeVoiceBtn', () => setInterviewMode('voice')],
        ['modeTextBtn', () => setInterviewMode('text')],
    ];
    handlers.forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', e => { e.preventDefault(); fn(); });
    });
}

// ── Particle Canvas ────────────────────────────────────────
let particlesInited = false;
function initParticles() {
    if (particlesInited) return;
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    particlesInited = true;
    const ctx = canvas.getContext('2d');
    let w, h, dots = [];
    function resize() { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; }
    resize(); window.addEventListener('resize', resize);
    for (let i = 0; i < 60; i++) dots.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2 + 1, dx: (Math.random() - .5) * .4, dy: (Math.random() - .5) - .15, o: Math.random() * .5 + .2 });
    function draw() {
        ctx.clearRect(0, 0, w, h);
        dots.forEach(d => {
            ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(94,245,196,${d.o})`; ctx.fill();
            d.x += d.dx; d.y += d.dy;
            if (d.x < 0) d.x = w; if (d.x > w) d.x = 0;
            if (d.y < 0) d.y = h; if (d.y > h) d.y = 0;
        });
        requestAnimationFrame(draw);
    }
    draw();
}

// ── Scroll Reveal ──────────────────────────────────────────
let srObserver;
function initScrollReveal() {
    if (srObserver) return;
    srObserver = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.15 });
    document.querySelectorAll('.sr').forEach(el => srObserver.observe(el));
}

// ── Stat Counters ──────────────────────────────────────────
let statsRan = false;
function runStatCounters() {
    if (statsRan) return;
    const nums = document.querySelectorAll('.stat-box .num[data-count]');
    if (!nums.length) return;
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            statsRan = true;
            nums.forEach(el => {
                const target = parseFloat(el.dataset.count);
                let cur = 0; const inc = target / 60;
                const tick = () => { cur += inc; if (cur >= target) { el.textContent = target; return; } el.textContent = Math.floor(cur); requestAnimationFrame(tick); };
                tick();
            });
            obs.disconnect();
        });
    }, { threshold: 0.3 });
    nums.forEach(el => obs.observe(el));
}

// ═══════════════════════════════════════════════════════════
// FEATURE: History
// ═══════════════════════════════════════════════════════════
async function loadHistory() {
    const loading = document.getElementById('historyLoading');
    const revContainer = document.getElementById('historyReviewsContainer');
    const intContainer = document.getElementById('historyInterviewsContainer');

    loading.style.display = 'block';

    try {
        const resp = await fetchWithAuth(`${API}/api/v1/history/`);
        if (!resp.ok) throw new Error('Failed to load history');

        const data = await resp.json();

        // Render Reviews
        if (data.reviews.length === 0) {
            revContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">No resume reviews yet.</div>';
        } else {
            revContainer.innerHTML = data.reviews.map(r => `
                <div class="job-card-entry" style="animation: fadeUp .4s ease;">
                    <h4>📄 General CV Review</h4>
                    <div class="meta" style="margin-bottom: 4px;">Target JD: ${r.job_desc_used || 'None'}</div>
                    <div class="company" style="color: var(--accent-1); margin-bottom: 6px;">Score: ${r.score !== null ? r.score + '/100' : 'N/A'}</div>
                    <div class="meta" style="color: var(--text-primary); font-size: 0.85rem;">${r.feedback_summary || 'No summary generated.'}</div>
                    <div class="meta" style="margin-top: 8px; font-size: 0.75rem;">${new Date(r.created_at).toLocaleString()}</div>
                </div>
            `).join('');
        }

        // Render Interviews
        if (data.interviews.length === 0) {
            intContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">No mock interviews yet.</div>';
        } else {
            intContainer.innerHTML = data.interviews.map(i => {
                const verdictClass = i.verdict && typeof i.verdict === 'string' ? i.verdict.toLowerCase().replace(/\\s+/g, '-') : '';
                const verdictTag = i.verdict ? `<span class="review-verdict review-verdict-${verdictClass}" style="display:inline-block; margin-bottom:8px;">${i.verdict}</span>` : '';
                return `
                <div class="job-card-entry" style="animation: fadeUp .5s ease;">
                    <h4>🎙️ ${i.job_role || 'General'} Interview</h4>
                    <div class="company" style="color: var(--accent-2); margin-bottom: 6px;">Score: ${i.score !== null ? i.score + '/100' : 'N/A'}</div>
                    ${verdictTag}
                    <div class="meta" style="margin-top: 8px; font-size: 0.75rem;">${new Date(i.created_at).toLocaleString()}</div>
                </div>
            `}).join('');
        }

    } catch (e) {
        console.error(e);
        revContainer.innerHTML = '<div style="color:var(--error);">Error loading data.</div>';
        intContainer.innerHTML = '<div style="color:var(--error);">Error loading data.</div>';
    } finally {
        loading.style.display = 'none';
    }
}

// ── Init ───────────────────────────────────────────────────
function initApp() {
    setupUploadZone();
    bindNavigationHandlers();
    bindAuthHandlers();
    bindFeatureHandlers();
    showPage('home');
    initializeAuthGate();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}