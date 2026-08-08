import json
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        connections = self.active_connections.get(session_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(session_id, None)

    async def broadcast(self, session_id: str, message: dict) -> None:
        connections = self.active_connections.get(session_id, [])
        if not connections:
            return
        data = json.dumps(message)
        for connection in connections:
            await connection.send_text(data)


manager = ConnectionManager()
