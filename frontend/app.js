
const API = '';  // Same-origin; adjust if running on different port

// ── Tab Navigation ─────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Update nav
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Show tab
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById(`tab-${btn.dataset.tab}`);
        if (tab) {
            tab.classList.remove('active');
            void tab.offsetWidth; // trigger reflow
            tab.classList.add('active');
        }
    });
});

// ── File Upload Drag & Drop ────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('resumeFile');

if (uploadZone && fileInput) {
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

// ═══════════════════════════════════════════════════════════
// FEATURE 1: Resume Review
// ═══════════════════════════════════════════════════════════
async function submitReview() {
    const btn = document.getElementById('reviewBtn');
    const resultsArea = document.getElementById('reviewResults');
    const file = fileInput.files[0];
    const textInput = document.getElementById('resumeText').value.trim();
    const jobDesc = document.getElementById('jobDesc').value.trim();

    if (!file && !textInput) {
        alert('Please upload a file or paste your resume text.');
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
            const resp = await fetch(`${API}/api/v1/review/upload`, {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
            data = await resp.json();
        } else {
            const resp = await fetch(`${API}/api/v1/review/text`, {
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
    const score = Math.round(data.overall_score);
    const circumference = 2 * Math.PI * 34;
    const offset = circumference - (score / 100) * circumference;

    let html = `
    <svg width="0" height="0"><defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6C63FF"/><stop offset="100%" stop-color="#00D4FF"/></linearGradient></defs></svg>

    <div class="result-card">
        <div class="result-header">
            <div class="score-ring">
                <svg viewBox="0 0 80 80">
                    <circle class="bg-circle" cx="40" cy="40" r="34"/>
                    <circle class="score-circle" cx="40" cy="40" r="34"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"/>
                </svg>
                <div class="score-value">${score}</div>
            </div>
            <div class="result-summary">
                <h3>Resume Score</h3>
                <p>${data.summary}</p>
            </div>
        </div>
    </div>

    <div class="result-card">
        <h3 style="margin-bottom:8px;">📋 Section Analysis</h3>
        <ul class="section-list">
            ${data.sections.map(s => `
                <li class="section-item">
                    <span class="section-name">
                        <span class="dot ${s.present ? 'dot-green' : 'dot-red'}"></span>
                        ${s.section}
                    </span>
                    <span class="section-score">${Math.round(s.score)}</span>
                </li>
            `).join('')}
        </ul>
    </div>`;

    if (data.extracted_skills.length) {
        html += `
        <div class="result-card">
            <h3>🛠 Detected Skills</h3>
            <div class="tag-list">
                ${data.extracted_skills.map(s => `<span class="tag tag-skill">${s}</span>`).join('')}
            </div>
        </div>`;
    }

    if (data.keyword_gaps.length) {
        html += `
        <div class="result-card">
            <h3>🔍 Keyword Gaps</h3>
            <div class="tag-list">
                ${data.keyword_gaps.map(k => `<span class="tag tag-gap">${k}</span>`).join('')}
            </div>
        </div>`;
    }

    if (data.suggestions.length) {
        html += `
        <div class="result-card">
            <h3>💡 Suggestions</h3>
            <ul class="suggestion-list">
                ${data.suggestions.map(s => `<li class="suggestion-item">${s}</li>`).join('')}
            </ul>
        </div>`;
    }

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
// FEATURE 2: AI Interviewer
// ═══════════════════════════════════════════════════════════
async function startInterview() {
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
    statusBox.textContent = '⏳ Creating interview room...';

    try {
        const resp = await fetch(`${API}/api/v1/interview/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_role: role,
                difficulty: difficulty,
            }),
        });

        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || resp.statusText);
        }

        const data = await resp.json();
        statusBox.className = 'status-box success';
        statusBox.innerHTML = `
            <p>✅ Interview room created!</p>
            <p style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary)">
                <strong>Room:</strong> ${data.room_name}<br>
                <strong>LiveKit URL:</strong> ${data.livekit_url}<br>
                <small>Connect using a LiveKit client with the provided token to start your interview.</small>
            </p>
        `;
    } catch (err) {
        statusBox.className = 'status-box error';
        statusBox.textContent = `❌ ${err.message}`;
    } finally {
        setLoading(btn, false);
    }
}

// ═══════════════════════════════════════════════════════════
// FEATURE 3: Job Matcher
// ═══════════════════════════════════════════════════════════
async function matchJobs() {
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
        const resp = await fetch(`${API}/api/v1/jobs/match`, {
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
    if (!data.matches || data.matches.length === 0) {
        container.innerHTML = `<div class="status-box">No matching jobs found. Try adjusting your resume text or job title hint.</div>`;
        container.style.display = 'block';
        return;
    }

    let html = `
    <div class="result-card">
        <h3>🔑 Search Keywords</h3>
        <div class="tag-list" style="margin-top:8px;">
            ${data.query_keywords.map(k => `<span class="tag tag-skill">${k}</span>`).join('')}
        </div>
        <p style="margin-top:12px;color:var(--text-muted);font-size:0.85rem;">Found ${data.total_found} matching jobs</p>
    </div>`;

    data.matches.forEach((job, i) => {
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
        const resp = await fetch(`${API}/api/v1/footprint/generate`, {
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
            ${gh.top_languages.length ? `
                <h4 style="margin-top:16px;margin-bottom:8px;">Top Languages</h4>
                <div class="tag-list">
                    ${gh.top_languages.map(l => `<span class="tag tag-lang">${l}</span>`).join('')}
                </div>
            ` : ''}
            ${gh.top_repos.length ? `
                <h4 style="margin-top:20px;margin-bottom:8px;">Top Repositories</h4>
                ${gh.top_repos.slice(0, 5).map(r => `
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
            ${ln.experience.length ? `
                <h4>Experience</h4>
                <ul class="section-list">
                    ${ln.experience.map(e => `<li class="section-item"><span class="section-name">${e}</span></li>`).join('')}
                </ul>
            ` : ''}
            ${ln.skills.length ? `
                <h4 style="margin-top:16px;">Skills</h4>
                <div class="tag-list" style="margin-top:8px;">
                    ${ln.skills.map(s => `<span class="tag tag-skill">${s}</span>`).join('')}
                </div>
            ` : ''}
        </div>`;
    }

    // ── Combined Skills ─────────────────────────────────
    if (data.combined_skills && data.combined_skills.length) {
        html += `
        <div class="result-card">
            <h3>🧩 Combined Skills</h3>
            <div class="tag-list" style="margin-top:12px;">
                ${data.combined_skills.map(s => `<span class="tag tag-lang">${s}</span>`).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}