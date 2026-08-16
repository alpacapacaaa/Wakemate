from flask import Flask


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/health")
    def healthcheck():
        return {"status": "ok"}

    return app
