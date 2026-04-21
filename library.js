// ==========================================
// library.js - Dynamic Fetching Logic
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // UI Elements
    const viewSubjects = document.getElementById("viewSubjects");
    const viewChapters = document.getElementById("viewChapters");
    const viewNotes = document.getElementById("viewNotes");
    const subjectsGrid = document.getElementById("subjectsGrid");
    const chaptersGrid = document.getElementById("chaptersGrid");
    const notesContainer = document.getElementById("notesContainer");
    
    const chapterHeader = document.getElementById("chapterHeader");
    const chapterBreadcrumb = document.getElementById("chapterBreadcrumb");
    const notesBreadcrumb = document.getElementById("notesBreadcrumb");
    
    // Back Buttons
    document.getElementById("backToSubjects").addEventListener("click", () => showView(viewSubjects));
    document.getElementById("backToChapters").addEventListener("click", () => showView(viewChapters));

    // Meta Data (Global scope so we can access it during navigation)
    let libraryData = [];

    // --- 1. INITIALIZE: Load Subjects Meta Data ---
    async function initLibrary() {
        try {
            // Fetch the meta data file we created
            const response = await fetch('data/library_meta.json');
            if(!response.ok) throw new Error("Failed to load library meta.");
            libraryData = await response.json();
            renderSubjects(libraryData);
        } catch (error) {
            console.error(error);
            subjectsGrid.innerHTML = `<p style="color:var(--text-muted)">Failed to load subjects. Are you using a Live Server?</p>`;
        }
    }

    // --- 2. RENDER SUBJECTS ---
    function renderSubjects(data) {
        subjectsGrid.innerHTML = '';
        data.forEach(subject => {
            const card = document.createElement("div");
            card.className = "subject-card";
            card.innerHTML = `
                <div class="subject-card-top">
                    <span class="subject-icon">${subject.icon}</span>
                    <span class="subject-badge">${subject.badge}</span>
                </div>
                <h3 class="subject-name">${subject.name}</h3>
                <p class="subject-desc">${subject.desc}</p>
                <div class="subject-footer">
                    <span class="subject-tag">${subject.chapters.length} CHAPTERS</span>
                    <svg class="subject-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
            `;
            card.addEventListener("click", () => openSubject(subject));
            subjectsGrid.appendChild(card);
        });
    }

    // --- 3. OPEN SUBJECT & RENDER CHAPTERS ---
    function openSubject(subject) {
        // Update Chapter View Header
        chapterHeader.innerHTML = `
            <div class="ch-subject-icon">${subject.icon}</div>
            <h2 class="ch-subject-title">${subject.name}</h2>
            <p class="ch-subject-desc">${subject.desc}</p>
        `;
        chapterBreadcrumb.innerHTML = `${subject.name}`;

        // Render Chapters
        chaptersGrid.innerHTML = '';
        subject.chapters.forEach(chapter => {
            const card = document.createElement("div");
            card.className = "chapter-card";
            card.innerHTML = `
                <div class="chapter-num">${chapter.num}</div>
                <div class="chapter-info">
                    <h4 class="chapter-title">${chapter.title}</h4>
                    <p class="chapter-sub">${chapter.sub}</p>
                </div>
                <svg class="chapter-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            `;
            card.addEventListener("click", () => fetchAndRenderNotes(chapter, subject));
            chaptersGrid.appendChild(card);
        });

        showView(viewChapters);
    }

    // --- 4. FETCH AND RENDER SPECIFIC NOTES ---
    async function fetchAndRenderNotes(chapter, subject) {
        notesContainer.innerHTML = `<p style="color:var(--text-muted); text-align:center;">Loading notes...</p>`;
        showView(viewNotes);
        
        notesBreadcrumb.innerHTML = `${subject.name} <span class="bc-sep">/</span> <span class="bc-current">${chapter.title}</span>`;
        document.getElementById("backChapterLabel").innerText = `${subject.name}`;

        try {
            const response = await fetch(chapter.file);
            if(!response.ok) throw new Error("Notes file not found.");
            const noteData = await response.json();
            
            // Build HTML from JSON arrays
            let htmlContent = `
                <div class="notes-header">
                    <span class="notes-subject-tag">${noteData.subjectTag}</span>
                    <h1 class="notes-title">${noteData.title}</h1>
                    <p class="notes-subtitle">${noteData.subtitle}</p>
                </div>
            `;

            noteData.content.forEach(block => {
                if(block.blockType === "topic-title") {
                    htmlContent += `<div class="topic-block"><h3 class="topic-title">${block.text}</h3></div>`;
                } 
                else if(block.blockType === "note-text") {
                    htmlContent += `<p class="note-text">${block.text}</p>`;
                }
                else if(block.blockType === "note-def") {
                    htmlContent += `<p class="note-def">${block.text}</p>`;
                }
                else if(block.blockType === "formula-block") {
                    htmlContent += `
                        <div class="formula-block">
                            <div class="formula-name">${block.name}</div>
                            <div class="formula-eq">$$${block.formula}$$</div>
                            <div class="formula-note">${block.note}</div>
                        </div>
                    `;
                }
                else if(block.blockType === "exam-tip") {
                    htmlContent += `
                        <div class="exam-tip">
                            <div class="exam-tip-label">${block.label}</div>
                            <div class="exam-tip-text">${block.text}</div>
                        </div>
                    `;
                }
            });

            // Add Tutor CTA at bottom
            htmlContent += `
                <div class="notes-cta">
                    <p>Confused about this chapter?</p>
                    <a href="tutor.html">Ask CoreDeck AI Tutor</a>
                </div>
            `;

            notesContainer.innerHTML = htmlContent;

            // Trigger KaTeX to render math formulas
            if (window.renderMathInElement) {
                renderMathInElement(notesContainer, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ]
                });
            }

        } catch (error) {
            console.error(error);
            notesContainer.innerHTML = `<p style="color:#ff4444; text-align:center;">⚠️ Error loading notes. Please make sure you are using VS Code Live Server.</p>`;
        }
    }

    // --- UTILS: Switch Views ---
    function showView(viewElement) {
        viewSubjects.style.display = 'none';
        viewChapters.style.display = 'none';
        viewNotes.style.display = 'none';
        
        viewElement.style.display = 'block';
        window.scrollTo(0, 0); // Scroll to top on view change
    }

    // Start Everything
    initLibrary();
});
