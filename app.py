from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
BOOKS_FILE = DATA_DIR / "books.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"
NOTES_FILE = DATA_DIR / "notes.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
SECRETS_FILE = DATA_DIR / "secrets.json"

DEFAULT_SETTINGS = {
    "daily_minutes_goal": 20,
    "yearly_books_goal": 12,
}

STATUS_LABELS = {
    "reading": "Olvasom",
    "want": "El akarom olvasni",
    "finished": "Befejeztem",
    "paused": "Szünetel",
    "abandoned": "Félbehagytam",
    "wishlist": "Wishlist",
}


def ensure_data_files() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    for path, fallback in (
        (BOOKS_FILE, []),
        (SESSIONS_FILE, []),
        (NOTES_FILE, []),
        (SETTINGS_FILE, DEFAULT_SETTINGS),
    ):
        if not path.exists():
            write_json(path, fallback)


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return fallback


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def iso_now() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def today_iso() -> str:
    return date.today().isoformat()


def int_or_zero(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def get_google_books_api_key() -> str:
    env_key = os.environ.get("GOOGLE_BOOKS_API_KEY", "").strip()
    if env_key:
        return env_key

    secrets = read_json(SECRETS_FILE, {})
    if isinstance(secrets, dict):
        return (secrets.get("google_books_api_key") or "").strip()
    return ""


def normalize_book(raw: dict) -> dict:
    total_pages = int_or_zero(raw.get("total_pages"))
    current_page = min(int_or_zero(raw.get("current_page")), total_pages or 10**9)
    status = raw.get("status") if raw.get("status") in STATUS_LABELS else "want"
    started_at = raw.get("started_at") or (today_iso() if status == "reading" else "")
    finished_at = raw.get("finished_at") or (today_iso() if status == "finished" else "")

    return {
        "id": raw.get("id") or str(uuid.uuid4()),
        "google_id": raw.get("google_id") or "",
        "title": (raw.get("title") or "Cím nélküli könyv").strip(),
        "authors": raw.get("authors") if isinstance(raw.get("authors"), list) else [],
        "thumbnail": raw.get("thumbnail") or "",
        "description": raw.get("description") or "",
        "published_date": raw.get("published_date") or "",
        "publisher": raw.get("publisher") or "",
        "categories": raw.get("categories") if isinstance(raw.get("categories"), list) else [],
        "isbn": raw.get("isbn") or "",
        "language": raw.get("language") or "",
        "total_pages": total_pages,
        "current_page": current_page,
        "status": status,
        "rating": min(5, int_or_zero(raw.get("rating"))),
        "review": raw.get("review") or "",
        "tags": raw.get("tags") if isinstance(raw.get("tags"), list) else [],
        "started_at": started_at,
        "finished_at": finished_at,
        "created_at": raw.get("created_at") or iso_now(),
        "updated_at": iso_now(),
    }


def enrich_book(book: dict, sessions: list[dict], notes: list[dict]) -> dict:
    book_sessions = [item for item in sessions if item.get("book_id") == book["id"]]
    book_notes = [item for item in notes if item.get("book_id") == book["id"]]
    total_pages = int_or_zero(book.get("total_pages"))
    current_page = int_or_zero(book.get("current_page"))
    progress = 0
    progress_label = "Nincs oldalszám"
    if total_pages:
        progress = min(100, round((current_page / total_pages) * 100))
        progress_label = f"{progress}%"
    elif book.get("status") == "finished":
        progress = 100
        progress_label = "100%"

    enriched = dict(book)
    enriched["status_label"] = STATUS_LABELS.get(book.get("status"), book.get("status"))
    enriched["progress"] = progress
    enriched["progress_label"] = progress_label
    enriched["has_page_count"] = bool(total_pages)
    enriched["session_count"] = len(book_sessions)
    enriched["minutes_read"] = sum(int_or_zero(item.get("minutes")) for item in book_sessions)
    enriched["pages_logged"] = sum(int_or_zero(item.get("pages")) for item in book_sessions)
    enriched["note_count"] = len(book_notes)
    return enriched


def google_volume_to_book(item: dict) -> dict:
    info = item.get("volumeInfo", {})
    identifiers = info.get("industryIdentifiers", [])
    isbn = ""
    for identifier in identifiers:
        if identifier.get("type") in {"ISBN_13", "ISBN_10"}:
            isbn = identifier.get("identifier", "")
            break

    images = info.get("imageLinks", {})
    thumbnail = images.get("thumbnail") or images.get("smallThumbnail") or ""
    thumbnail = thumbnail.replace("http://", "https://")

    return {
        "google_id": item.get("id", ""),
        "title": info.get("title", "Cím nélküli könyv"),
        "authors": info.get("authors", []),
        "thumbnail": thumbnail,
        "description": info.get("description", ""),
        "published_date": info.get("publishedDate", ""),
        "publisher": info.get("publisher", ""),
        "categories": info.get("categories", []),
        "isbn": isbn,
        "language": info.get("language", ""),
        "total_pages": info.get("pageCount") or 0,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def api_state():
    ensure_data_files()
    books = read_json(BOOKS_FILE, [])
    sessions = read_json(SESSIONS_FILE, [])
    notes = read_json(NOTES_FILE, [])
    settings = {**DEFAULT_SETTINGS, **read_json(SETTINGS_FILE, {})}
    enriched_books = [enrich_book(book, sessions, notes) for book in books]
    return jsonify(
        {
            "books": enriched_books,
            "sessions": sessions,
            "notes": notes,
            "settings": settings,
            "statuses": STATUS_LABELS,
            "today": today_iso(),
        }
    )


@app.get("/api/search")
def api_search():
    query = (request.args.get("q") or "").strip()
    if len(query) < 2:
        return jsonify({"items": []})

    search_params = {
        "q": query,
        "maxResults": 12,
        "printType": "books",
        "projection": "lite",
        "langRestrict": request.args.get("lang", ""),
    }
    api_key = get_google_books_api_key()
    if api_key:
        search_params["key"] = api_key

    params = urlencode(search_params)
    url = f"https://www.googleapis.com/books/v1/volumes?{params}"
    request_headers = Request(url, headers={"User-Agent": "Bookworm/1.0"})

    try:
        with urlopen(request_headers, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return jsonify({"error": f"Nem sikerült keresni: {exc}", "items": []}), 502

    return jsonify({"items": [google_volume_to_book(item) for item in payload.get("items", [])]})


@app.post("/api/books")
def api_create_book():
    ensure_data_files()
    books = read_json(BOOKS_FILE, [])
    book = normalize_book(request.get_json(silent=True) or {})
    books.insert(0, book)
    write_json(BOOKS_FILE, books)
    return jsonify(book), 201


@app.patch("/api/books/<book_id>")
def api_update_book(book_id: str):
    ensure_data_files()
    books = read_json(BOOKS_FILE, [])
    payload = request.get_json(silent=True) or {}
    for index, book in enumerate(books):
        if book.get("id") == book_id:
            merged = {**book, **payload, "id": book_id, "created_at": book.get("created_at")}
            books[index] = normalize_book(merged)
            write_json(BOOKS_FILE, books)
            return jsonify(books[index])
    return jsonify({"error": "Könyv nem található."}), 404


@app.delete("/api/books/<book_id>")
def api_delete_book(book_id: str):
    ensure_data_files()
    books = [book for book in read_json(BOOKS_FILE, []) if book.get("id") != book_id]
    sessions = [item for item in read_json(SESSIONS_FILE, []) if item.get("book_id") != book_id]
    notes = [item for item in read_json(NOTES_FILE, []) if item.get("book_id") != book_id]
    write_json(BOOKS_FILE, books)
    write_json(SESSIONS_FILE, sessions)
    write_json(NOTES_FILE, notes)
    return jsonify({"ok": True})


@app.post("/api/sessions")
def api_create_session():
    ensure_data_files()
    payload = request.get_json(silent=True) or {}
    book_id = payload.get("book_id")
    books = read_json(BOOKS_FILE, [])
    book = next((item for item in books if item.get("id") == book_id), None)
    if not book:
        return jsonify({"error": "Válassz könyvet az olvasás rögzítéséhez."}), 400

    previous_page = int_or_zero(book.get("current_page"))
    total_pages = int_or_zero(payload.get("total_pages")) or int_or_zero(book.get("total_pages"))
    if total_pages:
        book["total_pages"] = total_pages

    pages = int_or_zero(payload.get("pages"))
    minutes = int_or_zero(payload.get("minutes"))
    current_page = int_or_zero(payload.get("current_page"))
    if not pages and not minutes and not current_page and not total_pages:
        return jsonify({"error": "Adj meg legalább időt, oldalt vagy aktuális oldalszámot."}), 400

    if current_page:
        book["current_page"] = min(current_page, total_pages or current_page)
        if not pages:
            pages = max(0, int_or_zero(book.get("current_page")) - previous_page)
    elif pages:
        book["current_page"] = min(
            int_or_zero(book.get("current_page")) + pages,
            total_pages or 10**9,
        )

    if book.get("status") == "want":
        book["status"] = "reading"
        book["started_at"] = book.get("started_at") or today_iso()

    if total_pages and int_or_zero(book.get("current_page")) >= total_pages:
        book["status"] = "finished"
        book["finished_at"] = today_iso()

    book["updated_at"] = iso_now()
    write_json(BOOKS_FILE, books)

    sessions = read_json(SESSIONS_FILE, [])
    session = {
        "id": str(uuid.uuid4()),
        "book_id": book_id,
        "date": payload.get("date") or today_iso(),
        "minutes": minutes,
        "pages": pages,
        "current_page": int_or_zero(book.get("current_page")),
        "created_at": iso_now(),
    }
    sessions.insert(0, session)
    write_json(SESSIONS_FILE, sessions)
    return jsonify(session), 201


@app.post("/api/notes")
def api_create_note():
    ensure_data_files()
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    book_id = payload.get("book_id")
    if not text or not book_id:
        return jsonify({"error": "A jegyzethez könyv és szöveg is kell."}), 400

    notes = read_json(NOTES_FILE, [])
    note = {
        "id": str(uuid.uuid4()),
        "book_id": book_id,
        "type": payload.get("type") if payload.get("type") in {"note", "quote"} else "note",
        "text": text,
        "page": int_or_zero(payload.get("page")),
        "created_at": iso_now(),
    }
    notes.insert(0, note)
    write_json(NOTES_FILE, notes)
    return jsonify(note), 201


@app.delete("/api/notes/<note_id>")
def api_delete_note(note_id: str):
    ensure_data_files()
    notes = [note for note in read_json(NOTES_FILE, []) if note.get("id") != note_id]
    write_json(NOTES_FILE, notes)
    return jsonify({"ok": True})


@app.patch("/api/settings")
def api_update_settings():
    ensure_data_files()
    payload = request.get_json(silent=True) or {}
    settings = {
        "daily_minutes_goal": int_or_zero(payload.get("daily_minutes_goal")) or DEFAULT_SETTINGS["daily_minutes_goal"],
        "yearly_books_goal": int_or_zero(payload.get("yearly_books_goal")) or DEFAULT_SETTINGS["yearly_books_goal"],
    }
    write_json(SETTINGS_FILE, settings)
    return jsonify(settings)


if __name__ == "__main__":
    ensure_data_files()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", debug=True, port=port)
