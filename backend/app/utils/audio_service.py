import asyncio
import os
import subprocess
import tempfile
from typing import Optional

from io import BytesIO   
import aiofiles

from openai import AsyncAzureOpenAI

from ..core.config import settings


class AudioService:
    def __init__(self):
        if not settings.azure_openai_endpoint_audio or not settings.azure_openai_api_key_audio:
            print("[AudioService] Azure OpenAI audio not configured. TTS/transcribe disabled.")
            self.tts_client: Optional[AsyncAzureOpenAI] = None
            self.transcribe_client: Optional[AsyncAzureOpenAI] = None
            return
        self.tts_client = AsyncAzureOpenAI(
            api_version=settings.azure_openai_audio_api_version,
            azure_endpoint=settings.azure_openai_endpoint_audio,
            api_key=settings.azure_openai_api_key_audio,
        )
        self.transcribe_client = AsyncAzureOpenAI(
            api_version=settings.azure_openai_audio_api_version,
            azure_endpoint=settings.azure_openai_endpoint_audio,
            api_key=settings.azure_openai_api_key_audio,
        )
        print(f"Audio service initialized:")
        print(f"  - Endpoint: {settings.azure_openai_endpoint_audio}")
        print(f"  - API Version (config): {settings.azure_openai_audio_api_version}")
        print(f"  - Transcribe Deployment: {settings.azure_openai_transcribe_deployment}")

    async def text_to_speech(self, text: str, voice: str = "alloy") -> Optional[bytes]:
        """Конвертирует текст в речь (аудио-байт-код)."""
        if not self.tts_client:
            return None
        try:
            response = await self.tts_client.audio.speech.create(
                model=settings.azure_openai_tts_deployment,
                voice=voice,
                input=text,
                response_format="mp3"
            )
            return response.content
        except Exception as e:
            print(f"Error in text_to_speech: {e}")
            return None

    async def _convert_webm_to_wav(self, audio_data: bytes) -> Optional[bytes]:
        """Конвертирует WebM в WAV используя ffmpeg."""
        try:
                                     
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as input_file:
                input_file.write(audio_data)
                input_path = input_file.name
            
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as output_file:
                output_path = output_file.name
            
                                           
            cmd = [
                'ffmpeg', '-i', input_path, 
                '-ar', '16000',                     
                '-ac', '1',            
                '-c:a', 'pcm_s16le',              
                '-y',                                   
                output_path
            ]
            
            process = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                print(f"FFmpeg error: {stderr.decode()}")
                return None
            
                                          
            async with aiofiles.open(output_path, 'rb') as f:
                converted_data = await f.read()
            
                                     
            os.unlink(input_path)
            os.unlink(output_path)
            
            print(f"Successfully converted WebM to WAV: {len(audio_data)} -> {len(converted_data)} bytes")
            return converted_data
            
        except Exception as e:
            print(f"Error converting WebM to WAV: {e}")
            return None

    async def speech_to_text_from_bytes(self, audio_data: bytes) -> Optional[str]:
        """
        Транскрибирует аудио используя GPT-4o-transcribe модель.
        Работает с данными в памяти, не создавая временных файлов на диске.
        """
        if not self.transcribe_client:
            return None
        try:
            if len(audio_data) < 1000:                                  
                print(f"Audio data too small: {len(audio_data)} bytes")
                return None
                
            original_format = self._detect_audio_format(audio_data)
            print(f"GPT-4o-transcribe: detected format {original_format}, size: {len(audio_data)} bytes")
            print(f"Audio header (first 20 bytes): {audio_data[:20].hex()}")
            
                                               
            if original_format == "webm":
                print("Converting WebM to WAV for better compatibility...")
                converted_data = await self._convert_webm_to_wav(audio_data)
                if converted_data:
                    audio_data = converted_data
                    audio_format = "wav"
                    print(f"Conversion successful, new size: {len(audio_data)} bytes")
                else:
                    print("Conversion failed, trying original WebM data...")
                    audio_format = original_format
            else:
                audio_format = original_format
            
            audio_io = BytesIO(audio_data)
            audio_io.name = f"audio.{audio_format}"
            
            print(f"Using deployment: {settings.azure_openai_transcribe_deployment}")

            transcript = await self.transcribe_client.audio.transcriptions.create(
                model=settings.azure_openai_transcribe_deployment,  
                file=audio_io,
                response_format="text"
            )
            
            result = str(transcript).strip()
            print(f"Transcription result: {result[:100]}...")   
            
            return result
            
        except Exception as e:
            print(f"GPT-4o-transcribe error: {e}")
            print(f"Error type: {type(e).__name__}")
            print(f"Error args: {e.args}")
            if 'response' in dir(e):
                print(f"HTTP response: {getattr(e, 'response', 'N/A')}")
            return None

    def _detect_audio_format(self, audio_data: bytes) -> str:
        """Определяет формат аудио файла по заголовку."""
        if len(audio_data) < 12:
            return "wav"  
            
                                       
        if audio_data[:4] == b'RIFF' and audio_data[8:12] == b'WAVE':
            return "wav"
                                                                 
        elif audio_data[:4] == b'\x1a\x45\xdf\xa3':
            return "webm"
                   
        elif audio_data[:3] == b'ID3' or audio_data[:2] == b'\xff\xfb':
            return "mp3"
                   
        elif audio_data[:4] == b'OggS':
            return "ogg"
                                                 
        elif b'ftyp' in audio_data[:20]:
            return "mp4"
        else:
            return "webm"

    async def save_audio_file(self, audio_data: bytes, file_path: str) -> bool:
        """Сохраняет аудио-данные в файл, создавая директорию при необходимости."""
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            async with aiofiles.open(file_path, "wb") as f:
                await f.write(audio_data)
            return True
        except Exception as e:
            print(f"Error saving audio file to {file_path}: {e}")
            return False

audio_service = AudioService()