# Backend

Minimal Flask backend for the WakeMate iOS app.

## Quick start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
flask --app app run --debug
```

## Endpoints

- `GET /health` returns a simple health check response.
