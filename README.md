# Bookworm

Bookworm is a small Flask web app for tracking a personal reading library, daily reading progress, notes, quotes, and reading goals. The interface is currently Hungarian, mobile-friendly, and built as a single-page experience backed by simple JSON files.

## Features

- Search for books through the Google Books API
- Add books to a personal shelf with title, author, cover, publisher, page count, ISBN, and description metadata
- Track reading status:
  - Reading
  - Want to read
  - Finished
  - Paused
  - Abandoned
  - Wishlist
- Log daily reading sessions by minutes, pages read, or current page
- Automatically update book progress and mark books as finished when the page count is reached
- Save notes and quotes for individual books
- Store ratings and short reviews
- Track daily reading minute goals and yearly finished-book goals
- Persist data locally in JSON files

## Tech Stack

- Python
- Flask
- Vanilla JavaScript
- HTML templates with Jinja
- CSS with Bootstrap and Bootstrap Icons
- JSON file storage
- Optional Google Books API key support

## Project Structure

```text
Bookworm/
├── app.py
├── data/
│   ├── books.json
│   ├── notes.json
│   ├── sessions.json
│   └── settings.json
├── static/
│   ├── bootstrap-icons.min.css
│   ├── bootstrap.min.css
│   ├── index.js
│   └── style.css
└── templates/
    └── index.html
```

## Getting Started

### 1. Create a virtual environment

```bash
python -m venv .venv
```

Activate it:

```bash
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install flask
```

### 3. Run the app

```bash
python app.py
```

By default, the app runs at:

```text
http://127.0.0.1:5000
```

You can override the port with the `PORT` environment variable.

## Google Books API

Book search works through the Google Books API. The app can search without an API key, but you can provide one for more reliable usage.

Set it with an environment variable:

```bash
GOOGLE_BOOKS_API_KEY=your_api_key_here
```

Alternatively, create `data/secrets.json`:

```json
{
  "google_books_api_key": "your_api_key_here"
}
```

`data/secrets.json` is ignored by Git.

## Data Storage

Bookworm stores all application data in the `data/` directory:

- `books.json` stores books and metadata
- `sessions.json` stores reading logs
- `notes.json` stores notes and quotes
- `settings.json` stores reading goals

The app creates missing data files automatically when it starts.

## API Overview

The frontend communicates with the Flask backend through JSON endpoints:

- `GET /api/state` returns books, sessions, notes, settings, statuses, and today's date
- `GET /api/search?q=...` searches Google Books
- `POST /api/books` creates a book
- `PATCH /api/books/<book_id>` updates a book
- `DELETE /api/books/<book_id>` deletes a book and its related sessions and notes
- `POST /api/sessions` logs reading progress
- `POST /api/notes` creates a note or quote
- `DELETE /api/notes/<note_id>` deletes a note
- `PATCH /api/settings` updates reading goals

## Development Notes

- The app uses local JSON files instead of a database, so it is best suited for personal use or small local deployments.
- The UI text is Hungarian.
- Bootstrap and Bootstrap Icons are referenced from CDN in the template, while local CSS files are also present in `static/`.
- No build step is required.

