from flask import Flask

from app.config import Config
from app.routes.health import health_bp


def create_app(config_class: type[Config] = Config) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    app.register_blueprint(health_bp, url_prefix="/api")

    return app
