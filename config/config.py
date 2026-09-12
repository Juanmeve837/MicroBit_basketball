import yaml
import os
from pathlib import Path


class Config:
    _instance = None
    _config = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._config is None:
            config_path = Path(__file__).parent / "config.yaml"
            with open(config_path, 'r', encoding='utf-8') as f:
                self._config = yaml.safe_load(f)

    def get(self, key, default=None):
        return self._config.get(key, default)

    def get_path(self, path_key):
        path_value = self._config['paths'].get(path_key)
        if path_value:
            p = Path(path_value)
            p.mkdir(parents=True, exist_ok=True)
            return p
        raise KeyError(f"Path '{path_key}' no encontrado en config")

    def get_param(self, section, key):
        return self._config.get(section, {}).get(key)

    @classmethod
    def instance(cls):
        return cls()
