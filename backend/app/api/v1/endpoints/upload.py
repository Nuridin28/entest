from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Set
import os
import asyncio
import logging
import json

from ....core.database import get_async_db
from ....models.user import User
from ....models.test import TestSession, PreliminaryTestSession
from ....api.deps import get_current_active_user
from ....utils.file_paths import ensure_upload_directory, get_relative_upload_path, FileTypes
from ....tasks.file_processing import process_screen_recording
from ....services.test_service import TestService
from ....services.preliminary_test_service import PreliminaryTestService

router = APIRouter()
logger = logging.getLogger(__name__)

                               
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)
        logger.info(f"WebSocket connected for session {session_id}")

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"WebSocket disconnected for session {session_id}")

    async def send_status_update(self, session_id: str, status_data: dict):
        if session_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_text(json.dumps(status_data))
                except:
                    disconnected.add(connection)
            
                                             
            for conn in disconnected:
                self.active_connections[session_id].discard(conn)

manager = ConnectionManager()

async def determine_session_type(session_id: str, user_id: int, db: AsyncSession):
    """
    Автоматически определяет тип сессии (main или preliminary)
    """
    try:
                                              
        test_service = TestService(db)
        main_session = await test_service.get_test_session(session_id)
        if main_session and main_session.user_id == user_id:
            return 'main', main_session
    except:
        pass
    
    try:
                                                
        prelim_session_id = int(session_id)
        prelim_service = PreliminaryTestService(db)
        prelim_session = await prelim_service.get_preliminary_test_session(prelim_session_id)
        if prelim_session and prelim_session.user_id == user_id:
            return 'preliminary', prelim_session
    except:
        pass
    
    return None, None

@router.post("/screen-chunk/{session_id}")
async def upload_screen_chunk(
    session_id: str,
    chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    is_final: bool = Form(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Универсальный эндпоинт для загрузки чанков записи экрана
    Автоматически определяет тип сессии и обрабатывает файл
    """
    logger.info(f"Upload chunk for session {session_id}, chunk {chunk_index}, final: {is_final}")
    
    try:
                               
        session_type, session = await determine_session_type(session_id, current_user.id, db)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or access denied")
        
                                       
        chunks_dir = ensure_upload_directory(f"{FileTypes.CHUNKS}/{session_id}")
        
                                                           
        if session_type == 'preliminary':
            base_filename = f"prelim_{session_id}"
        else:
            base_filename = session_id
            
        chunk_filename = f"{base_filename}_chunk_{chunk_index:04d}.webm"
        chunk_path = os.path.join(chunks_dir, chunk_filename)
        
                        
        with open(chunk_path, "wb") as buffer:
            content = await chunk.read()
            buffer.write(content)
        
        logger.info(f"Chunk saved: {chunk_path}, size: {len(content)} bytes")
        
                                                      
        if is_final:
            logger.info(f"Final chunk received, starting background processing for {session_id}")
            
                                            
            final_dir = ensure_upload_directory(FileTypes.SCREEN_RECORDINGS)
            final_filename = f"{base_filename}.webm"
            final_path = os.path.join(final_dir, final_filename)
            
                              
            await combine_chunks(chunks_dir, final_path, base_filename)
            
                                         
            task = process_screen_recording.delay(
                session_id=session_id,
                file_path=final_path,
                user_id=current_user.id
            )
            
            return {
                "status": "processing",
                "message": "File uploaded successfully, processing in background",
                "task_id": task.id,
                "session_type": session_type
            }
        
        return {
            "status": "chunk_received",
            "chunk_index": chunk_index,
            "session_type": session_type
        }
        
    except Exception as e:
        logger.error(f"Error uploading chunk for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

async def combine_chunks(chunks_dir: str, output_path: str, base_filename: str):
    """
    Объединяет чанки в один файл
    """
    try:
                                     
        chunk_files = []
        for filename in os.listdir(chunks_dir):
            if filename.startswith(base_filename) and filename.endswith('.webm'):
                chunk_files.append(os.path.join(chunks_dir, filename))
        
                                   
        chunk_files.sort()
        
                          
        with open(output_path, 'wb') as output_file:
            for chunk_file in chunk_files:
                with open(chunk_file, 'rb') as input_file:
                    output_file.write(input_file.read())
        
        logger.info(f"Combined {len(chunk_files)} chunks into {output_path}")
        
                                 
        for chunk_file in chunk_files:
            try:
                os.remove(chunk_file)
            except:
                pass
                
                                                   
        try:
            os.rmdir(chunks_dir)
        except:
            pass
            
    except Exception as e:
        logger.error(f"Error combining chunks: {e}")
        raise

@router.get("/status/{session_id}")
async def get_upload_status(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Получает статус обработки загруженного файла
    """
    try:
                               
        session_type, session = await determine_session_type(session_id, current_user.id, db)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
                                    
        if session_type == 'preliminary':
            has_recording = bool(session.screen_recording_path)
            metadata = session.screen_recording_metadata or {}
        else:
            has_recording = bool(session.screen_recording_path)
            metadata = session.screen_recording_metadata or {}
        
        if has_recording:
            return {
                "status": "completed",
                "session_type": session_type,
                "file_path": session.screen_recording_path,
                "metadata": metadata
            }
        else:
            return {
                "status": "processing",
                "session_type": session_type,
                "message": "File is being processed"
            }
            
    except Exception as e:
        logger.error(f"Error getting upload status for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")

@router.websocket("/ws/status/{session_id}")
async def websocket_upload_status(websocket: WebSocket, session_id: str):
    """
    WebSocket эндпоинт для получения обновлений статуса обработки файлов в реальном времени
    """
    await manager.connect(websocket, session_id)
    try:
        while True:
                                                                         
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)

                                                                         
async def notify_upload_status(session_id: str, status: str, progress: int = 0, metadata: dict = None):
    """
    Отправляет обновление статуса через WebSocket
    """
    status_data = {
        "session_id": session_id,
        "status": status,
        "progress": progress,
        "timestamp": asyncio.get_event_loop().time(),
        "metadata": metadata or {}
    }
    await manager.send_status_update(session_id, status_data)