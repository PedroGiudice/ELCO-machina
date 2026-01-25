import uvicorn
import os
import sys
from google.adk.cli.fast_api import get_fast_api_app

if __name__ == "__main__":
    # Garante que o PYTHONPATH inclua o diretório atual
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(current_dir)
    
    # O diretório de agentes é o diretório atual
    app = get_fast_api_app(
        agents_dir=current_dir,
        web=False,
        reload_agents=True
    )
    
    print(f"Starting ADK Server with agents from {current_dir}")
    uvicorn.run(app, host="0.0.0.0", port=9000)
