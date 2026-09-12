from config.config import Config


def data_raw() -> str:
    return str(Config.instance().get_path("data_raw"))


def data_processed() -> str:
    return str(Config.instance().get_path("data_processed"))


def results_figures() -> str:
    return str(Config.instance().get_path("results_figures"))


def results_tables() -> str:
    return str(Config.instance().get_path("results_tables"))
