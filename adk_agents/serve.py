import sys
import os
import uvicorn
from importlib import import_module

# Adiciona o diretório atual ao path para importar os módulos dos agentes
sys.path.append(os.getcwd())

def start_server(agent_module_path, port):
    try:
        # Importa o módulo do agente (ex: tauri_build_agent.agent)
        module = import_module(agent_module_path)
        agent = module.root_agent
        
        # Tenta obter o app FastAPI do agente. 
        # A implementação exata depende da versão do ADK.
        # Tentativa 1: Atributo .app
        if hasattr(agent, 'app'):
            app = agent.app
        # Tentativa 2: Método .create_app()
        elif hasattr(agent, 'create_app'):
            app = agent.create_app()
        # Tentativa 3: O próprio agente é um app (pouco provável)
        else:
            # Fallback: Tenta criar um app genérico se o ADK permitir
            from fastapi import FastAPI
            app = FastAPI()
            @app.get("/")
            def root():
                return {"status": "ok", "agent": agent.name}
            @app.get("/agents")
            def list_agents():
                return [{"name": agent.name, "description": agent.instruction[:100]}]
            
            # Nota: Isso é um mock se o ADK não expuser o app diretamente.
            # Em produção, usariamos a lib oficial de server do ADK.

        print(f"Starting {agent.name} on port {port}")
        uvicorn.run(app, host="0.0.0.0", port=port)
    except Exception as e:
        print(f"Error starting agent: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python serve.py <module_path> <port>")
        sys.exit(1)
    
    start_server(sys.argv[1], int(sys.argv[2]))
