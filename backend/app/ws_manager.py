import json
import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger("stratum.ws")


class ConnectionManager:
    """Tracks the open sockets per session and fans messages out to them.

    In-memory, so it only works for a single backend instance. Scaling past one
    worker means moving rooms to Redis pub/sub — see docs/DEPLOY.md.
    """

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
        # Iterate a copy: a failed send drops that socket, which mutates the list.
        connections = list(self.active_connections.get(session_id, []))
        if not connections:
            return
        data = json.dumps(message)
        dead: List[WebSocket] = []
        for connection in connections:
            try:
                await connection.send_text(data)
            except Exception:
                # One racer's phone dropped mid-send. Without this the exception
                # would abort the loop and silence everyone further down the
                # list — a single dead socket freezing the whole leaderboard.
                dead.append(connection)
        for connection in dead:
            logger.info("dropping dead socket from session %s", session_id)
            self.disconnect(session_id, connection)


manager = ConnectionManager()
