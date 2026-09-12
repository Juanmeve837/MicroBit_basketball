import sys
from pathlib import Path

# Los modulos de la app viven en la raiz del repo, no en un paquete instalado;
# insertarla en sys.path permite "import main", "import processors", etc.
# tanto para los tests como para pytest ejecutado desde cualquier cwd.
sys.path.insert(0, str(Path(__file__).resolve().parent))
