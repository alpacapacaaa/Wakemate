# Wakemate Backend

Flask backend starter for Wakemate.

## Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

## Run

```powershell
python run.py
```

The health check is available at `GET http://localhost:5000/api/health`.

## Test

```powershell
pytest
```
