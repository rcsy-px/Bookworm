const state = {
    books: [],
    sessions: [],
    notes: [],
    settings: { daily_minutes_goal: 20, yearly_books_goal: 12 },
    statuses: {},
    today: "",
    activeView: "dashboard",
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    loadState();
});

function cacheElements() {
    [
        "todayLine",
        "todayMinutes",
        "todayMeter",
        "dailyGoalText",
        "yearBooks",
        "yearMeter",
        "yearGoalText",
        "readingCount",
        "continueList",
        "quickLogForm",
        "quickBook",
        "quickMinutes",
        "quickPages",
        "quickCurrentPage",
        "libraryList",
        "statusFilter",
        "noteForm",
        "noteBook",
        "noteType",
        "notePage",
        "noteText",
        "notesList",
        "settingsForm",
        "dailyGoal",
        "yearlyGoal",
        "openAddBook",
        "addBookDialog",
        "bookDialog",
        "bookDetail",
        "bookSearchInput",
        "bookSearchButton",
        "searchMessage",
        "searchResults",
        "toast",
    ].forEach((id) => {
        els[id] = document.getElementById(id);
    });
}

function bindEvents() {
    document.querySelectorAll("[data-nav]").forEach((button) => {
        button.addEventListener("click", () => setView(button.dataset.nav));
    });

    els.openAddBook.addEventListener("click", () => {
        els.addBookDialog.showModal();
        setTimeout(() => els.bookSearchInput.focus(), 50);
    });

    els.bookSearchButton.addEventListener("click", searchBooks);
    els.bookSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchBooks();
        }
    });

    els.quickLogForm.addEventListener("submit", saveSession);
    els.noteForm.addEventListener("submit", saveNote);
    els.settingsForm.addEventListener("submit", saveSettings);
    els.statusFilter.addEventListener("change", renderLibrary);
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Valami nem sikerült.");
    }
    return payload;
}

async function loadState() {
    try {
        const payload = await api("/api/state");
        Object.assign(state, payload);
        renderAll();
    } catch (error) {
        showToast(error.message);
    }
}

function renderAll() {
    renderDashboard();
    renderSelects();
    renderLibrary();
    renderNotes();
    renderSettings();
}

function setView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
    document.getElementById(`${viewName}View`).classList.add("active-view");
    document.querySelectorAll(".bottom-nav button").forEach((button) => {
        button.classList.toggle("active", button.dataset.nav === viewName);
    });
}

function renderDashboard() {
    const todaySessions = state.sessions.filter((session) => session.date === state.today);
    const todayMinutes = sum(todaySessions, "minutes");
    const finishedThisYear = state.books.filter((book) => {
        return book.status === "finished" && (book.finished_at || "").startsWith(new Date().getFullYear().toString());
    }).length;
    const readingBooks = state.books.filter((book) => book.status === "reading");

    els.todayLine.textContent = `${formatDate(state.today)} - ${state.books.length} könyv a polcon`;
    els.todayMinutes.textContent = `${todayMinutes} perc`;
    els.dailyGoalText.textContent = `Cél: ${state.settings.daily_minutes_goal} perc`;
    els.todayMeter.style.width = `${percent(todayMinutes, state.settings.daily_minutes_goal)}%`;
    els.yearBooks.textContent = `${finishedThisYear} / ${state.settings.yearly_books_goal}`;
    els.yearGoalText.textContent = "Befejezett könyvek";
    els.yearMeter.style.width = `${percent(finishedThisYear, state.settings.yearly_books_goal)}%`;
    els.readingCount.textContent = readingBooks.length;

    const continueBooks = readingBooks.length ? readingBooks : state.books.filter((book) => book.status === "want").slice(0, 4);
    els.continueList.innerHTML = continueBooks.length
        ? continueBooks.slice(0, 6).map(bookCard).join("")
        : emptyState("Még nincs könyv. Adj hozzá egyet a keresővel.");

    els.continueList.querySelectorAll("[data-book-open]").forEach((button) => {
        button.addEventListener("click", () => openBook(button.dataset.bookOpen));
    });
}

function renderSelects() {
    const options = state.books
        .map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`)
        .join("");
    const empty = `<option value="">Nincs könyv kiválasztva</option>`;
    els.quickBook.innerHTML = state.books.length ? options : empty;
    els.noteBook.innerHTML = state.books.length ? options : empty;
}

function renderLibrary() {
    const filter = els.statusFilter.value;
    const books = filter === "all" ? state.books : state.books.filter((book) => book.status === filter);
    els.libraryList.innerHTML = books.length
        ? books.map(libraryItem).join("")
        : emptyState("Itt még üres a polc ebben a nézetben.");

    els.libraryList.querySelectorAll("[data-book-open]").forEach((button) => {
        button.addEventListener("click", () => openBook(button.dataset.bookOpen));
    });
    els.libraryList.querySelectorAll("[data-status-book]").forEach((select) => {
        select.addEventListener("change", () => updateBook(select.dataset.statusBook, { status: select.value }));
    });
}

function renderNotes() {
    const notes = state.notes.map((note) => {
        const book = findBook(note.book_id);
        const label = note.type === "quote" ? "Idézet" : "Jegyzet";
        return `
            <article class="note-item">
                <span class="status-pill">${label}</span>
                <blockquote>${escapeHtml(note.text)}</blockquote>
                <div class="note-foot">
                    <span>${escapeHtml(book?.title || "Ismeretlen könyv")}${note.page ? ` - ${note.page}. oldal` : ""}</span>
                    <button class="small-action danger-action" data-note-delete="${escapeHtml(note.id)}">Törlés</button>
                </div>
            </article>
        `;
    });
    els.notesList.innerHTML = notes.length ? notes.join("") : emptyState("A jegyzetek itt fognak megjelenni.");
    els.notesList.querySelectorAll("[data-note-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteNote(button.dataset.noteDelete));
    });
}

function renderSettings() {
    els.dailyGoal.value = state.settings.daily_minutes_goal;
    els.yearlyGoal.value = state.settings.yearly_books_goal;
}

function bookCard(book) {
    return `
        <button class="book-card" data-book-open="${escapeHtml(book.id)}">
            ${cover(book)}
            <span>
                <span class="status-pill">${escapeHtml(book.status_label)}</span>
                <strong class="book-title">${escapeHtml(book.title)}</strong>
                <span class="book-meta">${escapeHtml(authors(book))}</span>
                <span class="progress-line">
                    <span class="meter"><span style="width:${book.progress}%"></span></span>
                    <span>${escapeHtml(book.progress_label || `${book.progress}%`)}</span>
                </span>
            </span>
        </button>
    `;
}

function libraryItem(book) {
    return `
        <article class="library-item">
            ${cover(book)}
            <div>
                <span class="status-pill">${escapeHtml(book.status_label)}</span>
                <h3 class="book-title">${escapeHtml(book.title)}</h3>
                <p class="book-meta">${escapeHtml(authors(book))}</p>
                <p class="book-meta">${escapeHtml(pageSummary(book))} - ${book.minutes_read} perc olvasás - ${book.note_count} jegyzet</p>
                <div class="progress-line">
                    <span class="meter"><span style="width:${book.progress}%"></span></span>
                    <span>${escapeHtml(book.progress_label || `${book.progress}%`)}</span>
                </div>
            </div>
            <div class="item-actions">
                <select data-status-book="${escapeHtml(book.id)}">
                    ${statusOptions(book.status)}
                </select>
                <button class="small-action" data-book-open="${escapeHtml(book.id)}">Megnyitás</button>
            </div>
        </article>
    `;
}

function statusOptions(active) {
    return Object.entries(state.statuses)
        .map(([value, label]) => `<option value="${value}" ${value === active ? "selected" : ""}>${escapeHtml(label)}</option>`)
        .join("");
}

function cover(book) {
    if (book.thumbnail) {
        return `<img class="cover" src="${escapeHtml(book.thumbnail)}" alt="">`;
    }
    const initials = (book.title || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return `<span class="cover-placeholder">${escapeHtml(initials)}</span>`;
}

async function searchBooks() {
    const query = els.bookSearchInput.value.trim();
    if (query.length < 2) {
        showToast("Írj be legalább két karaktert.");
        return;
    }

    els.searchMessage.textContent = "Keresés...";
    els.searchResults.innerHTML = "";
    try {
        const payload = await api(`/api/search?q=${encodeURIComponent(query)}`);
        els.searchMessage.textContent = payload.items.length ? "Válassz egy könyvet a listából." : "Nincs találat.";
        els.searchResults.innerHTML = payload.items.map(searchResult).join("");
        els.searchResults.querySelectorAll("[data-add-result]").forEach((button) => {
            button.addEventListener("click", () => {
                const index = Number(button.dataset.addResult);
                addBookFromSearch(payload.items[index]);
            });
        });
    } catch (error) {
        els.searchMessage.textContent = error.message;
    }
}

function searchResult(book, index) {
    return `
        <article class="result-item">
            ${cover(book)}
            <div>
                <h3 class="book-title">${escapeHtml(book.title)}</h3>
                <p class="book-meta">${escapeHtml(authors(book))}</p>
                <p class="book-meta">${escapeHtml([book.publisher, book.published_date, book.total_pages ? `${book.total_pages} oldal` : ""].filter(Boolean).join(" - "))}</p>
            </div>
            <div class="item-actions">
                <button class="primary-action" data-add-result="${index}">Hozzáadás</button>
            </div>
        </article>
    `;
}

async function addBookFromSearch(book) {
    try {
        await api("/api/books", {
            method: "POST",
            body: JSON.stringify({ ...book, status: "want" }),
        });
        els.addBookDialog.close();
        els.bookSearchInput.value = "";
        els.searchResults.innerHTML = "";
        els.searchMessage.textContent = "Keress rá egy könyvre, majd válaszd ki a találatok közül.";
        await loadState();
        showToast("Könyv hozzáadva.");
    } catch (error) {
        showToast(error.message);
    }
}

async function saveSession(event) {
    event.preventDefault();
    try {
        await api("/api/sessions", {
            method: "POST",
            body: JSON.stringify({
                book_id: els.quickBook.value,
                minutes: els.quickMinutes.value,
                pages: els.quickPages.value,
                current_page: els.quickCurrentPage.value,
            }),
        });
        els.quickMinutes.value = "";
        els.quickPages.value = "";
        els.quickCurrentPage.value = "";
        await loadState();
        showToast("Olvasás rögzítve.");
    } catch (error) {
        showToast(error.message);
    }
}

async function saveNote(event) {
    event.preventDefault();
    try {
        await api("/api/notes", {
            method: "POST",
            body: JSON.stringify({
                book_id: els.noteBook.value,
                type: els.noteType.value,
                page: els.notePage.value,
                text: els.noteText.value,
            }),
        });
        els.notePage.value = "";
        els.noteText.value = "";
        await loadState();
        showToast("Jegyzet mentve.");
    } catch (error) {
        showToast(error.message);
    }
}

async function saveSettings(event) {
    event.preventDefault();
    try {
        await api("/api/settings", {
            method: "PATCH",
            body: JSON.stringify({
                daily_minutes_goal: els.dailyGoal.value,
                yearly_books_goal: els.yearlyGoal.value,
            }),
        });
        await loadState();
        showToast("Célok mentve.");
    } catch (error) {
        showToast(error.message);
    }
}

async function updateBook(bookId, changes) {
    try {
        await api(`/api/books/${bookId}`, {
            method: "PATCH",
            body: JSON.stringify(changes),
        });
        await loadState();
        showToast("Könyv frissítve.");
    } catch (error) {
        showToast(error.message);
    }
}

async function deleteBook(bookId) {
    if (!confirm("Töröljük ezt a könyvet minden jegyzettel és naplóval együtt?")) {
        return;
    }
    try {
        await api(`/api/books/${bookId}`, { method: "DELETE" });
        els.bookDialog.close();
        await loadState();
        showToast("Könyv törölve.");
    } catch (error) {
        showToast(error.message);
    }
}

async function deleteNote(noteId) {
    try {
        await api(`/api/notes/${noteId}`, { method: "DELETE" });
        await loadState();
        showToast("Jegyzet törölve.");
    } catch (error) {
        showToast(error.message);
    }
}

function openBook(bookId) {
    const book = findBook(bookId);
    if (!book) {
        return;
    }
    const bookNotes = state.notes.filter((note) => note.book_id === book.id).slice(0, 5);
    els.bookDetail.innerHTML = `
        <div class="detail-grid">
            ${cover(book)}
            <div>
                <p class="eyebrow">${escapeHtml(book.status_label)}</p>
                <h2>${escapeHtml(book.title)}</h2>
                <p class="book-meta">${escapeHtml(authors(book))}</p>
                <p class="book-meta">${escapeHtml([book.publisher, book.published_date, book.total_pages ? `${book.total_pages} oldal` : "Hiányzó oldalszám"].filter(Boolean).join(" - "))}</p>
                <div class="progress-line">
                    <span class="meter"><span style="width:${book.progress}%"></span></span>
                    <strong>${escapeHtml(book.progress_label || `${book.progress}%`)}</strong>
                </div>
                <div class="detail-actions">
                    <select id="detailStatus">${statusOptions(book.status)}</select>
                    <button id="saveDetailStatus" class="small-action">Státusz mentése</button>
                    <button id="deleteBook" class="small-action danger-action">Törlés</button>
                </div>
            </div>
        </div>
        <form id="detailLogForm" class="detail-form">
            <label>Összes oldal<input id="detailTotalPages" type="number" min="0" value="${book.total_pages || ""}" placeholder="pl. 384"></label>
            <label>Most itt tartok<input id="detailCurrentPage" type="number" min="0" value="${book.current_page || 0}" placeholder="pl. 128"></label>
            <label>Most olvastam<input id="detailMinutes" type="number" min="0" placeholder="perc, opcionális"></label>
            <button class="primary-action" type="submit">Haladás naplózása</button>
            <p class="book-meta wide-field">Ha csak azt írod be, hol tartasz, a rendszer az előző oldalhoz képest naplózza az olvasott oldalakat. A százalékhoz kell az összes oldalszám.</p>
        </form>
        <form id="detailMetaForm" class="detail-form">
            <label>Értékelés 0-5<input id="detailRating" type="number" min="0" max="5" value="${book.rating || 0}"></label>
            <label class="wide-field">Rövid vélemény<textarea id="detailReview" rows="2">${escapeHtml(book.review || "")}</textarea></label>
            <button class="small-action" type="submit">Vélemény mentése</button>
        </form>
        ${book.description ? `<p class="book-meta">${escapeHtml(stripHtml(book.description)).slice(0, 520)}</p>` : ""}
        <h3>Legutóbbi jegyzetek</h3>
        ${bookNotes.length ? bookNotes.map((note) => `<p class="book-meta">${note.type === "quote" ? "Idézet" : "Jegyzet"}: ${escapeHtml(note.text)}</p>`).join("") : `<p class="book-meta">Ehhez a könyvhöz még nincs jegyzet.</p>`}
    `;

    document.getElementById("saveDetailStatus").addEventListener("click", () => {
        updateBook(book.id, { status: document.getElementById("detailStatus").value });
    });
    document.getElementById("deleteBook").addEventListener("click", () => deleteBook(book.id));
    document.getElementById("detailLogForm").addEventListener("submit", (event) => {
        event.preventDefault();
        logBookProgress(book.id, {
            total_pages: document.getElementById("detailTotalPages").value,
            current_page: document.getElementById("detailCurrentPage").value,
            minutes: document.getElementById("detailMinutes").value,
        });
    });
    document.getElementById("detailMetaForm").addEventListener("submit", (event) => {
        event.preventDefault();
        updateBook(book.id, {
            rating: document.getElementById("detailRating").value,
            review: document.getElementById("detailReview").value,
        });
    });
    els.bookDialog.showModal();
}

async function logBookProgress(bookId, payload) {
    try {
        await api("/api/sessions", {
            method: "POST",
            body: JSON.stringify({ book_id: bookId, ...payload }),
        });
        els.bookDialog.close();
        await loadState();
        showToast("Haladás naplózva.");
    } catch (error) {
        showToast(error.message);
    }
}

function findBook(bookId) {
    return state.books.find((book) => book.id === bookId);
}

function authors(book) {
    return book.authors?.length ? book.authors.join(", ") : "Ismeretlen szerző";
}

function pageSummary(book) {
    const current = book.current_page || 0;
    if (book.total_pages) {
        return `${current} / ${book.total_pages} oldal`;
    }
    return `${current} oldal - add meg az összes oldalt a százalékhoz`;
}

function sum(items, field) {
    return items.reduce((total, item) => total + Number(item[field] || 0), 0);
}

function percent(value, goal) {
    if (!goal) {
        return 0;
    }
    return Math.min(100, Math.round((Number(value || 0) / Number(goal)) * 100));
}

function formatDate(value) {
    if (!value) {
        return "";
    }
    return new Intl.DateTimeFormat("hu-HU", {
        month: "long",
        day: "numeric",
        weekday: "long",
    }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function stripHtml(value) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = value;
    return wrapper.textContent || wrapper.innerText || "";
}

function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

let toastTimer;

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2800);
}
