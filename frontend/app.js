
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
        <svg width="0" height="0"><defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6C63FF"/><stop offset="100%" stop-color="#00D4FF"/></linearGradient></defs></svg>
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