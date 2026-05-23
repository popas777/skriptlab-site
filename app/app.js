const API_BASE_URL = (window.SKRIPTLAB_CONFIG && window.SKRIPTLAB_CONFIG.API_BASE_URL) || "http://127.0.0.1:8000";
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const apiFetch = (path, options) => window.SkriptLabAuth.fetch(path, options);

if (!window.SkriptLabAuth.requireLogin()) {
    throw new Error("Login required.");
}

window.saveManuscriptToDB = async function(data) {
    if (!data) return;
    try {
        const res = await apiFetch('/api/projects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const saved = await res.json();
        data.id = saved.id;
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(data));
    } catch (e) {
        console.error("DB Save fail", e);
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(data));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = window.SkriptLabAuth.getUser();
    const fullWorkspaceRoles = new Set(['admin', 'test_user']);
    const betaCoreViews = new Set(['view-kirjani', 'view-analyysi', 'view-toimitus']);
    const roleLabels = {
        admin: 'Admin',
        test_user: 'Test user',
        org_admin: 'Org admin',
        toimittaja: 'Toimittaja',
        kirjailija: 'Kirjailija'
    };
    const canSeeAllModules = currentUser && fullWorkspaceRoles.has(currentUser.role);
    const usageEls = {
        box: document.getElementById('usage-box'),
        analysisText: document.getElementById('usage-analysis-text'),
        analysisBar: document.getElementById('usage-analysis-bar'),
        analysisChars: document.getElementById('usage-analysis-chars'),
        editText: document.getElementById('usage-edit-text'),
        editBar: document.getElementById('usage-edit-bar'),
        editChars: document.getElementById('usage-edit-chars'),
        status: document.getElementById('usage-status')
    };

    const logoutLink = document.getElementById('logout-link');
    const adminLink = document.getElementById('admin-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', () => {
            window.SkriptLabAuth.clearSession();
        });
    }
    if (adminLink && currentUser && currentUser.role === 'admin') {
        adminLink.classList.remove('hidden');
    }

    if (currentUser) {
        const roleBadge = document.querySelector('.role-badge');
        if (roleBadge) {
            roleBadge.textContent = `Käyttäjäryhmä: ${roleLabels[currentUser.role] || currentUser.role}`;
        }
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString('fi-FI');
    }

    function usagePercent(used, limit) {
        if (!limit || limit <= 0) return used > 0 ? 100 : 0;
        return Math.min(100, Math.round((used / limit) * 100));
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeWord(value) {
        return String(value || '').toLocaleLowerCase('fi-FI').replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function normalizeText(value) {
        return String(value || '').toLocaleLowerCase('fi-FI').replace(/\s+/g, ' ').trim();
    }

    function tokenizeText(value) {
        return String(value || '').match(/(\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+)/gu) || [];
    }

    function splitSentences(value) {
        return String(value || '').match(/[^.!?…]+[.!?…]*|[.!?…]+/g) || [];
    }

    function matchedTargetWordIndexes(originalSentence, targetSentence) {
        const originalWords = tokenizeText(originalSentence).map(normalizeWord).filter(Boolean);
        const targetTokens = tokenizeText(targetSentence);
        const targetWords = targetTokens
            .map((token, tokenIndex) => ({ tokenIndex, word: normalizeWord(token) }))
            .filter(item => item.word);
        const targetWordValues = targetWords.map(item => item.word);
        if (originalWords.length * targetWordValues.length > 250000) {
            const originalWordSet = new Set(originalWords);
            const matched = new Set();
            targetWordValues.forEach((word, index) => {
                if (originalWordSet.has(word)) matched.add(index);
            });
            return { matched, targetTokens, targetWords };
        }
        const rows = originalWords.length + 1;
        const cols = targetWordValues.length + 1;
        const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

        for (let i = originalWords.length - 1; i >= 0; i--) {
            for (let j = targetWordValues.length - 1; j >= 0; j--) {
                dp[i][j] = originalWords[i] === targetWordValues[j]
                    ? dp[i + 1][j + 1] + 1
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }

        const matched = new Set();
        let i = 0;
        let j = 0;
        while (i < originalWords.length && j < targetWordValues.length) {
            if (originalWords[i] === targetWordValues[j]) {
                matched.add(j);
                i++;
                j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                i++;
            } else {
                j++;
            }
        }

        return { matched, targetTokens, targetWords };
    }

    function sentenceDiffHtml(originalSentence, targetSentence) {
        const changedSentence = normalizeText(originalSentence) !== normalizeText(targetSentence);
        const { matched, targetTokens } = matchedTargetWordIndexes(originalSentence, targetSentence);
        let wordIndex = 0;
        const html = targetTokens.map(token => {
            const normalized = normalizeWord(token);
            if (!normalized) return escapeHtml(token);
            const isChangedWord = changedSentence && !matched.has(wordIndex++);
            return isChangedWord
                ? `<span class="diff-word">${escapeHtml(token)}</span>`
                : escapeHtml(token);
        }).join('');

        return changedSentence
            ? `<span class="diff-sentence">${html}</span>`
            : html;
    }

    function buildDiffHtml(original, target) {
        const originalParagraphs = String(original || '').split(/\n\s*\n/);
        const targetParagraphs = String(target || '').split(/\n\s*\n/);

        return targetParagraphs.map((paragraph, paragraphIndex) => {
            const originalSentences = splitSentences(originalParagraphs[paragraphIndex] || '');
            const targetSentences = splitSentences(paragraph);
            return targetSentences.map((sentence, sentenceIndex) => {
                return sentenceDiffHtml(originalSentences[sentenceIndex] || '', sentence);
            }).join('');
        }).join('\n\n');
    }

    function updateUsagePanel(data) {
        if (!usageEls.box || !data) return;
        const analysisPercent = usagePercent(data.monthly_analysis_used, data.monthly_analysis_limit);
        const editPercent = usagePercent(data.monthly_paragraph_edit_used, data.monthly_paragraph_edit_limit);

        usageEls.analysisText.textContent = `${data.monthly_analysis_used}/${data.monthly_analysis_limit}`;
        usageEls.analysisBar.style.width = `${analysisPercent}%`;
        usageEls.analysisChars.textContent = `Max ${formatNumber(data.max_analysis_chars)} merkkiä / analyysi`;

        usageEls.editText.textContent = `${data.monthly_paragraph_edit_used}/${data.monthly_paragraph_edit_limit}`;
        usageEls.editBar.style.width = `${editPercent}%`;
        usageEls.editChars.textContent = `Max ${formatNumber(data.max_paragraph_edit_chars)} merkkiä / muokkaus`;

        usageEls.status.textContent = analysisPercent >= 100 || editPercent >= 100
            ? 'Kuukausiraja täynnä. Ota yhteys ylläpitoon.'
            : 'Rajat päivittyvät onnistuneiden AI-ajojen jälkeen.';
    }

    async function loadUsage() {
        if (!usageEls.box) return;
        try {
            const res = await apiFetch('/api/usage/me');
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käyttörajojen lataus epäonnistui.');
            updateUsagePanel(data);
        } catch (err) {
            if (usageEls.status) usageEls.status.textContent = err.message;
        }
    }

    async function apiErrorMessage(res, fallback) {
        const data = await res.json().catch(() => null);
        const detail = data?.detail || fallback;
        if (res.status === 429) {
            return `${detail} Käyttörajasi näkyvät vasemmassa sivupalkissa.`;
        }
        if (res.status === 413) {
            return `${detail} Lyhennä tekstiä tai jaa työ pienempiin osiin.`;
        }
        if (res.status === 422) {
            return `${detail} Voit kokeilla lyhyempää katkelmaa, muotoilla pyynnön toimituksellisemmaksi tai pyytää ylläpitoa kokeilemaan toista sallittua mallia.`;
        }
        if (res.status === 502) {
            return `AI-palvelu ei juuri nyt vastannut odotetusti. ${detail}`;
        }
        return detail;
    }

    // --- 1. Top Bar Logic ---
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
    });

    const toggleThemeBtn = document.getElementById('toggle-theme');
    toggleThemeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if(currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            toggleThemeBtn.textContent = '☀️';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            toggleThemeBtn.textContent = '🌓';
        }
    });

    const toggleLangBtn = document.getElementById('toggle-lang');
    toggleLangBtn.addEventListener('click', () => {
        if (toggleLangBtn.textContent === 'FI / ENG') {
            toggleLangBtn.textContent = 'ENG / FI';
        } else {
            toggleLangBtn.textContent = 'FI / ENG';
        }
    });

    const toggleMobileBtn = document.getElementById('toggle-mobile');
    const appWrapper = document.getElementById('app-wrapper');
    toggleMobileBtn.addEventListener('click', () => {
        appWrapper.classList.toggle('mobile-simulate');
    });

    // --- 2. SPA Navigation Logic ---
    const navItems = document.querySelectorAll('#nav-menu li[data-view]');
    const views = document.querySelectorAll('.view-section');

    function isViewAllowed(viewId) {
        return canSeeAllModules || betaCoreViews.has(viewId);
    }

    navItems.forEach(item => {
        const viewId = item.getAttribute('data-view');
        if (!isViewAllowed(viewId)) {
            item.hidden = true;
        }
    });

    function openModule(viewId) {
        if (!isViewAllowed(viewId)) {
            viewId = 'view-kirjani';
        }

        views.forEach(v => v.classList.add('hidden'));
        const targetView = document.getElementById(viewId);
        if(targetView) targetView.classList.remove('hidden');

        navItems.forEach(item => {
            if(item.getAttribute('data-view') === viewId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            openModule(item.getAttribute('data-view'));
            // If they click something other than Kirjani, simulate that a book is selected
            if(item.getAttribute('data-view') !== 'view-kirjani') {
                document.getElementById('top-book-name').textContent = 'Käsikirjoitus: Metsän salaisuus';
            } else {
                document.getElementById('top-book-name').textContent = 'Käsikirjoitus: Valitse projekti...';
            }
        });
    });
    
    // Alistetaan globaaliksi, jotta onclickit HTML:ssä toimivat
    window.openModule = openModule;


    // --- 3. Analysis Simulation Logic ---
    const runAnalysisBtn = document.getElementById('run-analysis-btn');
    const analysisLoader = document.getElementById('analysis-loader');
    const analysisResults = document.getElementById('analysis-results');
    const sidebarStyle = document.getElementById('sidebar-style');
    const sidebarVocab = document.getElementById('sidebar-vocab');

    if(runAnalysisBtn) {
        runAnalysisBtn.addEventListener('click', () => {
            runAnalysisBtn.style.display = 'none';
            analysisLoader.classList.remove('hidden');
            
            // Käynnistetään ajastin
            let analysisSeconds = 0;
            const timerEl = document.getElementById('analysis-timer');
            const analysisInterval = setInterval(() => {
                analysisSeconds++;
                const m = Math.floor(analysisSeconds / 60);
                const s = analysisSeconds % 60;
                if(timerEl) timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
            }, 1000);
            
            // Haetaan ladattu raakateksti lokaalista muistista
            const rawMsText = localStorage.getItem('skriptlab_raw_text') || "";
            if(!rawMsText) {
                alert('Käsikirjoitusta ei ole vielä ladattu oikein! Lataa tiedosto Kirjani-näkymästä ensin.');
                analysisLoader.classList.add('hidden');
                runAnalysisBtn.style.display = 'block';
                return;
            }

            // Tehdään aito fetch meidän backend API:in
            apiFetch('/api/analyze', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: rawMsText})
            })
            .then(async res => {
                if(!res.ok) {
                    throw new Error(await apiErrorMessage(res, "Analyysi epäonnistui."));
                }
                return res.json();
            })
            .then(data => {
                clearInterval(analysisInterval);
                analysisLoader.classList.add('hidden');
                analysisResults.classList.remove('hidden');
                
                if(data.status === "success" && data.data) {
                    const r = data.data;
                    
                    // Päivitetään Analyysi-tuloskortti aidolla datalla!
                    let title = window.manuscriptData ? window.manuscriptData.title : "Käsikirjoitus";
                    let newHtml = `<strong>Tekoälyn analyysi ladattu! (${title})</strong><br><br>`;
                    
                    if(r.style) newHtml += `<strong>Tyylianalyysi:</strong><br>${r.style.substring(0,250)}...<br><br>`;
                    if(r.synopsis) newHtml += `<strong>Synopsis-tiivistelmä:</strong><br>${r.synopsis.substring(0,300)}...<br><br>`;
                    newHtml += `<strong>✔ Rakenneanalyysi paloiteltu suoraan Toimitus-navigaatioon!</strong><br><br>`;
                    newHtml += `Huom: Muut ominaisuudet (Kuvitus, Markkinointi) saattavat vielä päivittyä UI-koodissa!`;
                    document.getElementById('mock-analysis-text').innerHTML = newHtml;
                    runAnalysisBtn.style.display = 'block';
                    runAnalysisBtn.textContent = '🔄 Analysoi Uudelleen';
                    
                    // Rakennetaan Vektorimuisti
                    sidebarStyle.textContent = r.style ? "Tekoälyn arvioima" : "Virhe";
                    sidebarVocab.textContent = r.glossary ? "✅ Valmis sanasto" : "-";
                    sidebarStyle.style.color = "var(--ai-gradient-start)";
                    sidebarVocab.style.color = "var(--ai-gradient-start)";
                    
                    // Korvataan aiempi lokaali regex-ratkaisu TODELLISELLA RAKENTEELLA!
                    let structData = r.structure;
                    // Jos structure tuli stringinä, yritetään parsia
                    if (typeof structData === 'string' && structData.length > 2) {
                        try {
                            let si = structData.indexOf('[');
                            let ei = structData.lastIndexOf(']');
                            if (si !== -1 && ei !== -1) {
                                structData = JSON.parse(structData.substring(si, ei + 1));
                            }
                        } catch(parseErr) {
                            console.error('Structure-JSON parsinta epäonnistui:', parseErr);
                            structData = null;
                        }
                    }
                    
                    if(structData && Array.isArray(structData) && structData.length > 0) {
                       // Muunnetaan Analyzerin JSON-rakenne meidän Frontend-manuscriptData formaattiin:
                       let freshChapters = structData.map((item, idx) => {
                           let cId = item.id || `luku_${idx}`;
                           // Tuki sekä 'title'/'nimi' kenttänimille
                           let cTitle = item.title || item.nimi || (cId === "alku" ? "Alku / Nimiölehti" : (cId === "sisallys" ? "Sisällysluettelo" : cId));
                           // Tuki sekä 'paragraphs'/'kappaleet' kenttänimille
                           let cParagraphs = item.paragraphs || item.kappaleet || [];
                           let cleanedParagraphs = cParagraphs.map(p => p.replace(/<KAPPALE[\d]+>/gi, '').replace(/<KAPPALE>/gi, '').trim());
                           return {
                               id: cId,
                               title: cTitle,
                               paragraphs: cleanedParagraphs
                           };
                       });
                       if(window.manuscriptData) {
                           window.manuscriptData.chapters = freshChapters;
                       } else {
                           // Fallback
                           window.manuscriptData = { title: "A", author: "B", chapters: freshChapters };
                       }
                       // Tallennetaan pysyvästi
                       window.saveManuscriptToDB(window.manuscriptData);
                       // Kutsutaan UI refresh
                       if(window.renderNavList) window.renderNavList();
                       loadUsage();
                    } else {
                         alert("Varoitus: Skripti vastasi, mutta ei pystynyt erittelemään kappaleita (structure dict puuttuu)");
                    }
                    
                } else {
                     throw new Error("Data response viallinen");
                }
            })
            .catch(e => {
                clearInterval(analysisInterval);
                alert('Analyysi epäonnistui:\n' + e.message);
                analysisLoader.classList.add('hidden');
                runAnalysisBtn.style.display = 'block';
                loadUsage();
            });
        });
    }

    // --- 4. Split-Screen Editor Logic ---
    const aiBtn = document.getElementById('ai-improve-btn');
    const editableText = document.getElementById('edited-text');
    const lockBtn = document.getElementById('lock-block-btn');
    const editScopeSelect = document.getElementById('edit-scope');
    const editorWorkspace = document.getElementById('editor-workspace');
    const toggleEditorNavBtn = document.getElementById('toggle-editor-nav-btn');
    const toggleEditorCommentsBtn = document.getElementById('toggle-editor-comments-btn');
    const editedDiffPreview = document.getElementById('edited-diff-preview');
    let diffPreviewTimer = null;

    function selectedEditText() {
        const sel = window.currentEditSelection || {};
        if (sel.cIndex === null || sel.cIndex === undefined || !window.manuscriptData?.chapters?.[sel.cIndex]) {
            return '';
        }
        const chapter = window.manuscriptData.chapters[sel.cIndex];
        if (editScopeSelect && editScopeSelect.value === 'chapter') {
            return (chapter.paragraphs || []).join('\n\n').trim();
        }
        return (chapter.paragraphs?.[sel.pIndex] || '').trim();
    }

    function refreshEditableTextForScope() {
        if (!editableText) return;
        const text = selectedEditText();
        if (text) editableText.value = text;
        renderEditedDiffPreview();
    }

    function renderEditedDiffPreview() {
        if (!editedDiffPreview || !editableText) return;
        const original = selectedEditText();
        const edited = editableText.value || '';
        if (!edited.trim() || normalizeText(original) === normalizeText(edited)) {
            editedDiffPreview.classList.add('is-empty');
            editedDiffPreview.innerHTML = '';
            return;
        }
        editedDiffPreview.innerHTML = buildDiffHtml(original, edited);
        editedDiffPreview.classList.remove('is-empty');
    }

    function scheduleEditedDiffPreview() {
        window.clearTimeout(diffPreviewTimer);
        diffPreviewTimer = window.setTimeout(renderEditedDiffPreview, 120);
    }

    function updateEditorGrid() {
        if (!editorWorkspace) return;
        const hideNav = editorWorkspace.classList.contains('hide-editor-nav');
        const hideComments = editorWorkspace.classList.contains('hide-editor-comments');
        const columns = [];
        if (!hideNav) columns.push('220px');
        columns.push('minmax(0, 1fr)', 'minmax(0, 1fr)', '160px');
        if (!hideComments) columns.push('240px');
        editorWorkspace.style.gridTemplateColumns = columns.join(' ');
    }

    const geminiMagicText = `Musta pimeys kietoi ikiaikaisen varjometsän syliinsä, ja puut piirtyivät taivasta vasten kuin sysimustat kynnet. Jokin liikkui äänettömästi aluskasvillisuuden seassa – askeleet olivat huomaamattomat, mutta ilmassa lepäsi odottava jännite. Hahmo oli epäilemättä taikaolennon kaltainen; ehkäpä matkalainen etsimässä loistavaa kiveä.
    
"Totisesti, täällä noitien pimeys on valtaisa," hahmo lausui, ja sen ääni muistutti kuivien lehtien rapinaa.`;

    if(aiBtn) {
        aiBtn.addEventListener('click', () => {
            const sourceText = selectedEditText();
            if (!sourceText || sourceText.length < 5) {
                alert('Valitse ensin luku tai kappale navigoinnista ennen AI-muokkausta!');
                return;
            }
            
            editableText.value = '';
            aiBtn.innerHTML = '<span class="sparkle">⏳</span><br>Muokkaan...';
            aiBtn.style.pointerEvents = 'none';
            
            const promptEl = document.getElementById('toimitus-prompt');
            const editPrompt = promptEl ? promptEl.value : 'Korjaa virheet ja sujuvoita.';
            const tempEl = document.getElementById('temp-val');
            const temperature = tempEl ? parseFloat(tempEl.textContent) : 0.3;
            renderEditedDiffPreview();
            
            apiFetch('/api/edit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: sourceText, prompt: editPrompt, temperature: temperature})
            })
            .then(async res => {
                if(!res.ok) {
                    throw new Error(await apiErrorMessage(res, 'Toimitus epäonnistui.'));
                }
                return res.json();
            })
            .then(data => {
                if (data.status === 'success' && data.edited_text) {
                    loadUsage();
                    // Typewriter-efekti
                    const geminiResult = data.edited_text;
                    let i = 0;
                    const typeWriter = () => {
                        if (i < geminiResult.length) {
                            editableText.value += geminiResult.charAt(i);
                            i++;
                            setTimeout(typeWriter, 8);
                        } else {
                            aiBtn.innerHTML = '<span class="sparkle">✨</span><br>AI';
                            aiBtn.style.pointerEvents = 'auto';
                            editableText.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                            renderEditedDiffPreview();
                            setTimeout(() => { editableText.style.backgroundColor = 'transparent'; }, 600);
                        }
                    };
                    typeWriter();
                } else {
                    throw new Error('Vastauksessa ei muokattua tekstiä');
                }
            })
            .catch(err => {
                alert('Toimitus epäonnistui: ' + err.message);
                aiBtn.innerHTML = '<span class="sparkle">✨</span><br>AI';
                aiBtn.style.pointerEvents = 'auto';
                loadUsage();
            });
        });
    }

    if (editableText) {
        editableText.addEventListener('input', scheduleEditedDiffPreview);
    }

    if(lockBtn) {
        lockBtn.addEventListener('click', () => {
            const badge = document.querySelector('.badge.glowing');
            if(lockBtn.textContent === "Lukitse Pätkä (Freeze)") {
                lockBtn.textContent = "Pätkä Lukittu";
                lockBtn.style.background = "#238636"; 
                lockBtn.style.color = "#fff";
                editableText.readOnly = true;
                
                if (badge) {
                    badge.textContent = 'Valmis';
                    badge.classList.remove('glowing');
                    badge.style.background = 'rgba(35, 134, 54, 0.2)';
                    badge.style.borderColor = 'rgba(35, 134, 54, 0.5)';
                }
            } else {
                lockBtn.textContent = "Lukitse Pätkä (Freeze)";
                lockBtn.style.background = "var(--text-primary)";
                lockBtn.style.color = "var(--bg-color)";
                editableText.readOnly = false;
                
                const normalBadge = document.querySelector('.panel-header .badge');
                if(normalBadge) {
                    normalBadge.textContent = 'Kesken';
                    normalBadge.classList.add('glowing');
                    normalBadge.style.background = '';
                    normalBadge.style.borderColor = '';
                }
            }
        });
    }

    if (editScopeSelect) {
        editScopeSelect.addEventListener('change', refreshEditableTextForScope);
    }

    if (toggleEditorNavBtn && editorWorkspace) {
        toggleEditorNavBtn.addEventListener('click', () => {
            editorWorkspace.classList.toggle('hide-editor-nav');
            const hidden = editorWorkspace.classList.contains('hide-editor-nav');
            toggleEditorNavBtn.textContent = hidden ? 'Näytä navigaatio' : 'Piilota navigaatio';
            updateEditorGrid();
        });
    }

    if (toggleEditorCommentsBtn && editorWorkspace) {
        toggleEditorCommentsBtn.addEventListener('click', () => {
            editorWorkspace.classList.toggle('hide-editor-comments');
            const hidden = editorWorkspace.classList.contains('hide-editor-comments');
            toggleEditorCommentsBtn.textContent = hidden ? 'Näytä kommentit' : 'Piilota kommentit';
            updateEditorGrid();
        });
    }

    // --- Yleiset UI funktiot ---
    window.updateDynamicTexts = function() {
        if (!window.manuscriptData) return;
        const title = window.manuscriptData.title || "Nimetön";
        const author = window.manuscriptData.author || "Tuntematon";
        
        const topBookName = document.getElementById('top-book-name');
        if (topBookName) {
            topBookName.textContent = `Käsikirjoitus: ${title} (${author})`;
        }
        
        const th = document.getElementById('toimitus-book-title');
        if (th) th.innerHTML = `${title} <span class="badge">Luonnos</span>`;
        
        document.querySelectorAll('.view-section .header-info p').forEach(p => {
            if (p.id === "toimitus-book-chapter") return; 
            let txt = p.textContent;
            if (txt.startsWith("Käsikirjoitus:") || txt.startsWith("Käsikirjoitukseen:")) {
                let prefix = txt.startsWith("Käsikirjoitus:") ? "Käsikirjoitus: " : "Käsikirjoitukseen: ";
                let suffixMatch = txt.match(/(\(.*)/);
                let suffix = suffixMatch ? suffixMatch[0] : "";
                p.textContent = prefix + title + " " + suffix;
            }
        });
    };

    // --- 5. Kuvitus Logic ---
    window.generateCover = function(num) {
        const box = document.getElementById(`cover${num}-box`);
        box.innerHTML = `<div style="text-align:center; padding:40px;"><span class="sparkle glow-text" style="font-size:24px;">⏳</span><br><p style="color:var(--text-secondary); margin-top:12px;">Maalataan (Midjourney/Dall-e)...</p></div>`;
        setTimeout(() => {
            box.innerHTML = `<img src="cover_${num}.png" style="width:100%; border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); animation: fadeIn 0.5s ease;">`;
        }, 1500);
    };

    // --- 6. Global Task Manager ---
    window.startLongTask = function(title, desc, durationSeconds) {
        const overlay = document.getElementById('global-task-overlay');
        const titleEl = document.getElementById('task-title');
        const descEl = document.getElementById('task-desc');
        const barEl = document.getElementById('task-progress-bar');
        const timeEl = document.getElementById('task-time-left');
        const percentEl = document.getElementById('task-percent');
        const closeBtn = document.getElementById('task-close-btn');

        if(!overlay) return;

        overlay.classList.remove('hidden');
        if(closeBtn) closeBtn.classList.add('hidden');
        
        titleEl.textContent = title;
        descEl.textContent = desc;
        barEl.style.width = '0%';
        percentEl.textContent = '0%';
        
        let timeLeft = durationSeconds;
        const total = durationSeconds;
        
        const formatTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m} min ${s < 10 ? '0' : ''}${s} s`;
        };
        
        timeEl.textContent = `Arvioitu aika: ${formatTime(timeLeft)}`;

        const interval = setInterval(() => {
            timeLeft -= 1;
            if (timeLeft <= 0) {
                clearInterval(interval);
                barEl.style.width = '100%';
                percentEl.textContent = '100%';
                timeEl.textContent = 'Valmis!';
                titleEl.textContent = '✨ Tehtävä suoritettu';
                if(closeBtn) closeBtn.classList.remove('hidden');
            } else {
                const p = Math.floor(((total - timeLeft) / total) * 100);
                barEl.style.width = `${p}%`;
                percentEl.textContent = `${p}%`;
                timeEl.textContent = `Arvioitu aika: ${formatTime(timeLeft)}`;
            }
        }, 1000);
    };

    function createManuscriptFromText(title, text) {
        let bookData = {
            title: title,
            author: "Tuntematon",
            chapters: []
        };

        const rawLines = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        let currentChapter = { id: "alku", title: "Alku / Nimiölehti", paragraphs: [] };
        let sisallysFound = false;
        let lukuCount = 0;

        for (let line of rawLines) {
            let lowerLine = line.toLowerCase().trim();
            if (!sisallysFound && lukuCount === 0 && (lowerLine === "sisällys" || lowerLine === "sisällysluettelo" || lowerLine === "table of contents" || lowerLine === "toc")) {
                if (currentChapter.paragraphs.length > 0) bookData.chapters.push(currentChapter);
                currentChapter = { id: "sisallys", title: "Sisällysluettelo", paragraphs: [] };
                sisallysFound = true;
                currentChapter.paragraphs.push(line);
                continue;
            }

            let isChapter = /^luku\s*\d+/i.test(lowerLine)
                         || /^chapter\s*\d+/i.test(lowerLine)
                         || /^osa\s*\d+/i.test(lowerLine)
                         || /^\d+\.\s*$/.test(lowerLine)
                         || /^([IVXLC]+\.)\s*$/.test(lowerLine)
                         || (lowerLine.length > 2 && lowerLine.length < 50 && !/[.!?:]/.test(lowerLine) && currentChapter.paragraphs.length > 2);

            if (isChapter) {
                if (currentChapter.paragraphs.length > 0 || currentChapter.id !== "alku") {
                    bookData.chapters.push(currentChapter);
                }
                lukuCount++;
                currentChapter = { id: `luku_${lukuCount}`, title: line.substring(0, 50), paragraphs: [] };
            } else {
                currentChapter.paragraphs.push(line);
            }
        }
        if (currentChapter.paragraphs.length > 0 || currentChapter.title.toLowerCase().startsWith("luku")) {
            bookData.chapters.push(currentChapter);
        }

        if (!bookData.chapters.find(c => c.id === "alku")) {
            bookData.chapters.unshift({ id: "alku", title: "Alku / Nimiölehti", paragraphs: ["(Ei erillistä alku-osaa havaittu)"] });
        }
        if (!bookData.chapters.find(c => c.id === "sisallys")) {
            bookData.chapters.splice(1, 0, { id: "sisallys", title: "Sisällysluettelo", paragraphs: ["(Ei sisällysluetteloa havaittu)"] });
        }

        return bookData;
    }

    function addManuscriptCard(data, statusText) {
        const gridCards = document.querySelector('#view-kirjani .grid-cards');
        if (!gridCards) return;

        const newCard = document.createElement('div');
        newCard.className = 'card glass-panel interactive';
        newCard.setAttribute('onclick', `openModule('view-analyysi'); window.updateDynamicTexts();`);
        newCard.innerHTML = `
            <div style="font-size:30px; margin-bottom:4px;">📄</div>
            <input type="text" class="book-title-input" value="${data.title}" style="width:100%; font-size:18px; font-weight:bold; background:transparent; border:none; border-bottom:1px dashed rgba(255,255,255,0.3); color:var(--text-primary); font-family:inherit; outline:none; margin-bottom:8px; padding-bottom:4px;" onclick="event.stopPropagation();">
            <div style="margin-bottom:12px;" onclick="event.stopPropagation();">
                <label style="font-size:11px; color:var(--text-secondary);">Kirjailija:</label>
                <input type="text" class="book-author-input" value="${data.author}" style="width:100%; background:transparent; border:none; border-bottom:1px solid #333; color:var(--text-primary); font-family:inherit; font-size:13px; outline:none; padding:2px 0;">
            </div>
            <p class="card-meta">${statusText}</p>
            <p class="card-status"><span class="badge glowing">Odottaa Analyysiä</span></p>
            <button onclick="event.stopPropagation(); if(confirm('Poistetaanko teos pysyvästi?')) { localStorage.removeItem('skriptlab_manuscript'); localStorage.removeItem('skriptlab_raw_text'); window.location.reload(); }" style="margin-top:12px; padding:6px 12px; font-size:12px; background:rgba(255,50,50,0.2); color:var(--text-primary); border:1px solid rgba(255,50,50,0.5); border-radius:6px; cursor:pointer;">🗑️ Poista Teos</button>
        `;
        gridCards.prepend(newCard);
    }

    // --- 7. File Upload ---
    const fileUpload = document.getElementById('manuscript-upload');
    if(fileUpload) {
        fileUpload.addEventListener('click', (e) => {
            e.target.value = null; // Mahdollistaa saman tiedoston valinnan
        });
        fileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            fileUpload.disabled = true;
            apiFetch('/api/import/text', {
                method: 'POST',
                body: formData
            })
            .then(async res => {
                if (!res.ok) throw new Error(await apiErrorMessage(res, 'Tiedoston lukeminen epäonnistui.'));
                return res.json();
            })
            .then(data => {
                const text = data.text;
                localStorage.setItem('skriptlab_raw_text', text);
                let bookData = createManuscriptFromText(data.title, text);
                window.manuscriptData = bookData;
                window.saveManuscriptToDB(bookData);
                window.updateDynamicTexts();
                window.renderNavList();
                addManuscriptCard(bookData, `Ladattu: ${data.filename} (${data.char_count} merkkiä)`);
                window.openModule('view-analyysi');
                alert('Lataus ok! Aloita teoksen rakenneanalyysi ja lukujen palastelu klikkaamalla taikasauva-näppäintä.');
            })
            .catch(err => {
                alert('Virhe ladattaessa tiedostoa: ' + err.message);
            })
            .finally(() => {
                fileUpload.disabled = false;
                fileUpload.value = '';
            });
        });
    }

    window.renderNavList = function() {
        const navList = document.querySelector('#editor-nav-panel ul');
        if (navList && window.manuscriptData && window.manuscriptData.chapters) {
            let htmlOut = "";
            window.manuscriptData.chapters.forEach((chapter, cIndex) => {
                let isSpecial = chapter.id === "alku" || chapter.id === "sisallys";
                htmlOut += `<li style="margin-bottom:8px;">
                    <strong style="color:${isSpecial ? 'var(--text-secondary)' : 'var(--text-primary)'}; cursor:pointer;" onclick="window.loadParagraph(${cIndex}, 0, this.nextElementSibling.querySelector('li') || this); this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">${chapter.title}</strong>
                    <ul style="list-style:none; padding-left:12px; margin-top:6px; margin-bottom:12px; ${isSpecial ? 'display:none;' : ''}">
                `;
                chapter.paragraphs.forEach((p, pIndex) => {
                    let isFirst = cIndex === (window.manuscriptData.chapters.length > 2 ? 2 : 0) && pIndex === 0;
                    htmlOut += `<li style="padding:4px 0; color:${isFirst ? 'var(--ai-gradient-start)' : 'var(--text-secondary)'}; font-weight:${isFirst ? 'bold' : 'normal'}; cursor:pointer;" onclick="window.loadParagraph(${cIndex}, ${pIndex}, this)">${isFirst ? '●' : '○'} Kappale ${pIndex + 1}</li>`;
                });
                htmlOut += `</ul></li>`;
            });
            navList.innerHTML = htmlOut;
            
            const originalText = document.getElementById('original-text');
            const editedText = document.getElementById('edited-text');
            if(originalText && editedText && window.manuscriptData.chapters.length > 0) {
                const firstChapterIndex = window.manuscriptData.chapters.length > 2 ? 2 : 0;
                let txt = window.manuscriptData.chapters[firstChapterIndex].paragraphs[0] || "";
                originalText.style.whiteSpace = 'pre-wrap';
                originalText.textContent = txt;
                editedText.value = txt;
                window.currentEditSelection = { cIndex: firstChapterIndex, pIndex: 0 };
                renderEditedDiffPreview();
            }
        }
    };

    // Tallenna nykyinen valinta globaalisti
    window.currentEditSelection = { cIndex: null, pIndex: null };

    window.loadParagraph = function(cIndex, pIndex, el) {
        if (!window.manuscriptData || !window.manuscriptData.chapters[cIndex]) return;
        
        window.currentEditSelection = { cIndex, pIndex };
        const chapter = window.manuscriptData.chapters[cIndex];
        
        // Näytetään kaikki luvun kappaleet alkuperäispaneelissa, valittu boldataan
        const originalText = document.getElementById('original-text');
        const editedText = document.getElementById('edited-text');
        const chapterLabel = document.getElementById('original-chapter-label');
        
        if (chapterLabel) chapterLabel.textContent = `— ${chapter.title}`;
        
        if (originalText) {
            let html = '';
            chapter.paragraphs.forEach((p, idx) => {
                const isSelected = idx === pIndex;
                html += `<div data-pindex="${idx}" style="
                    padding: 10px 12px;
                    margin-bottom: 8px;
                    border-radius: 8px;
                    cursor: pointer;
                    line-height: 1.7;
                    transition: all 0.2s;
                    ${isSelected 
                        ? 'font-weight: 600; background: rgba(16, 185, 129, 0.12); border-left: 3px solid var(--ai-gradient-start); color: var(--text-primary);' 
                        : 'font-weight: normal; opacity: 0.6; color: var(--text-secondary); border-left: 3px solid transparent;'
                    }
                " onclick="window.loadParagraph(${cIndex}, ${idx}, document.querySelector('#editor-nav-panel ul li li:nth-child(${idx+1})') || this)">${escapeHtml(p)}</div>`;
            });
            originalText.innerHTML = html;
            
            // Scrollaa valittu kappale näkyviin
            setTimeout(() => {
                const selectedDiv = originalText.querySelector(`[data-pindex="${pIndex}"]`);
                if (selectedDiv) selectedDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        
        if (editedText) {
            editedText.value = (editScopeSelect && editScopeSelect.value === 'chapter')
                ? (chapter.paragraphs || []).join('\n\n')
                : (chapter.paragraphs[pIndex] || '');
            renderEditedDiffPreview();
        }
        
        // Navigointilistan päivitys
        document.querySelectorAll('#editor-nav-panel ul li li').forEach(li => {
            li.style.color = 'var(--text-secondary)';
            li.style.fontWeight = 'normal';
            if(li.textContent.startsWith('●')) li.textContent = '○ ' + li.textContent.substring(2);
        });
        if (el) {
            el.style.color = 'var(--ai-gradient-start)';
            el.style.fontWeight = 'bold';
            if(el.textContent.startsWith('○')) el.textContent = '● ' + el.textContent.substring(2);
        }
        
        const statusP = document.querySelector('#view-toimitus .header-info p');
        if (statusP) {
            statusP.textContent = `${chapter.title}, Kappale ${pIndex + 1} (Toimitus/Käännöstila)`;
        }
    };

    // Korvaa alkuperäinen -napin logiikka
    const replaceBtn = document.getElementById('replace-original-btn');
    if (replaceBtn) {
        replaceBtn.addEventListener('click', () => {
            const sel = window.currentEditSelection;
            const editedText = document.getElementById('edited-text');
            if (sel.cIndex === null || sel.pIndex === null || !editedText) {
                alert('Valitse ensin kappale ennen korvaamista!');
                return;
            }
            const newText = editedText.value.trim();
            if (!newText) {
                alert('Muokattu teksti on tyhjä!');
                return;
            }
            if (!confirm(`Korvatanko alkuperäinen kappale ${sel.pIndex + 1} muokatulla versiolla?`)) return;
            
            // Päivitä manuscriptData
            if (editScopeSelect && editScopeSelect.value === 'chapter') {
                window.manuscriptData.chapters[sel.cIndex].paragraphs = newText
                    .split(/\n\s*\n/)
                    .map(part => part.trim())
                    .filter(Boolean);
                sel.pIndex = 0;
            } else {
                window.manuscriptData.chapters[sel.cIndex].paragraphs[sel.pIndex] = newText;
            }
            window.saveManuscriptToDB(window.manuscriptData);
            
            // Päivitä näkymä
            window.loadParagraph(sel.cIndex, sel.pIndex, null);
            
            // Vihreä välähdys onnistumisesta
            editedText.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            setTimeout(() => { editedText.style.backgroundColor = 'transparent'; }, 800);
        });
    }

    {
        loadUsage();
        // Load from DB first, otherwise fallback to local storage
        apiFetch('/api/projects').then(r => r.json()).then(projects => {
            if(projects && projects.length > 0) {
                window.manuscriptData = projects[0];
                localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
                initializeKirjaniView(window.manuscriptData);
            } else {
                const saved = localStorage.getItem('skriptlab_manuscript');
                if (saved) {
                    try { window.manuscriptData = JSON.parse(saved); initializeKirjaniView(window.manuscriptData); } catch(e){}
                }
            }
        }).catch(e => {
            const saved = localStorage.getItem('skriptlab_manuscript');
            if (saved) {
                try { window.manuscriptData = JSON.parse(saved); initializeKirjaniView(window.manuscriptData); } catch(e){}
            }
        });
        
        function initializeKirjaniView(data) {
                const gridCards = document.querySelector('#view-kirjani .grid-cards');
                if (gridCards) {
                    const newCard = document.createElement('div');
                    newCard.className = 'card glass-panel interactive';
                    newCard.setAttribute('onclick', `openModule('view-analyysi'); window.updateDynamicTexts();`);
                    newCard.innerHTML = `
                        <div style="font-size:30px; margin-bottom:4px;">📄</div>
                        <input type="text" class="book-title-input" value="${data.title}" style="width:100%; font-size:18px; font-weight:bold; background:transparent; border:none; border-bottom:1px dashed rgba(255,255,255,0.3); color:var(--text-primary); font-family:inherit; outline:none; margin-bottom:8px; padding-bottom:4px;" onclick="event.stopPropagation();" onchange="window.manuscriptData.title = this.value; window.saveManuscriptToDB(window.manuscriptData); window.updateDynamicTexts();">
                        <div style="margin-bottom:12px;" onclick="event.stopPropagation();">
                            <label style="font-size:11px; color:var(--text-secondary);">Kirjailija:</label>
                            <input type="text" class="book-author-input" value="${data.author}" style="width:100%; background:transparent; border:none; border-bottom:1px solid #333; color:var(--text-primary); font-family:inherit; font-size:13px; outline:none; padding:2px 0;" onchange="window.manuscriptData.author = this.value; window.saveManuscriptToDB(window.manuscriptData); window.updateDynamicTexts();">
                        </div>
                        <p class="card-meta">Ladattu: Tietokannasta/Muistista</p>
                        <p class="card-status"><span class="badge glowing">Valmis</span></p>
                        <button onclick="event.stopPropagation(); if(confirm('Poistetaanko teos paikallisesta muistista?')) { localStorage.removeItem('skriptlab_manuscript'); localStorage.removeItem('skriptlab_raw_text'); window.location.reload(); }" style="margin-top:12px; padding:6px 12px; font-size:12px; background:rgba(255,50,50,0.2); color:var(--text-primary); border:1px solid rgba(255,50,50,0.5); border-radius:6px; cursor:pointer;">🗑️ Poista Teos</button>
                    `;
                    gridCards.prepend(newCard);
                }
                window.renderNavList();
                window.updateDynamicTexts();
        }

    }
});
