import uvicorn
from fastapi import FastAPI, Request
import json
import uuid

app = FastAPI()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Request: {request.method} {request.url.path}")
    body = await request.body()
    if body:
        print(f"Body: {body.decode()}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

@app.get("/list-apps")
async def list_apps():
    return ["tauri_build_agent", "frontend_standard_agent"]

@app.post("/apps/{agent_name}/users/{user_id}/sessions")
async def create_session(agent_name: str, user_id: str):
    session_id = str(uuid.uuid4())
    print(f"Creating session {session_id} for agent {agent_name} and user {user_id}")
    return {"id": session_id}

@app.post("/apps/{agent_name}/users/{user_id}/sessions/{session_id}/chat")
async def chat(agent_name: str, user_id: str, session_id: str, request: Request):
    data = await request.json()
    print(f"Chat in session {session_id}: {data}")
    return {"response": f"Eu sou o {agent_name}. Você disse: {data.get('message')}"}

@app.get("/{path:path}")
async def catch_all_get(path: str):
    return {"message": f"Path {path} caught (GET)"}

@app.post("/{path:path}")
async def catch_all_post(path: str):
    return {"message": f"Path {path} caught (POST)"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9999)