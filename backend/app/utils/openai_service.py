import asyncio
import json
from typing import Any, Dict, List, Optional

from openai import AsyncAzureOpenAI

from ..core.config import settings


class OpenAIService:
    def __init__(self):
        self.client: Optional[AsyncAzureOpenAI] = self._initialize_client()

    def _initialize_client(self) -> Optional[AsyncAzureOpenAI]:
        if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
            print("[OpenAIService] Azure OpenAI not configured (endpoint/api_key missing). Chat features disabled.")
            return None
        return AsyncAzureOpenAI(
            api_version=settings.azure_openai_api_version,
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
        )
    
    def _parse_json_response(self, response: Optional[str], method_name: str) -> Optional[Dict[str, Any]]:
        """Надежно парсит JSON из ответа OpenAI, логируя ошибки."""
        if not response:
            return None
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            print(f"FATAL: OpenAI returned invalid JSON for {method_name}. Response: {response}")
            return None

    async def _generate_chat_completion(
        self, 
        messages: List[Dict[str, str]], 
        max_tokens: int = 4096, 
        temperature: float = 0.7
    ) -> Optional[str]:
        """Основной метод для вызова чат-моделей с принудительным JSON-ответом."""
        if not self.client:
            return None
        try:
            print(f"[DEBUG] Making OpenAI request with model: {settings.azure_openai_deployment}")
            response = await self.client.chat.completions.create(
                model=settings.azure_openai_deployment,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content
            print(f"[DEBUG] OpenAI response received, length: {len(content) if content else 0}")
            return content
        except Exception as e:
            print(f"Error calling Azure OpenAI chat completion: {e}")
            return None

    async def generate_reading_test(self, level: str) -> Optional[Dict[str, Any]]:
        """Генерирует тест на чтение (текст и вопросы)."""
        system_prompt = f"""
You are an expert English language teacher creating a reading comprehension test for {level} level students.
Your task is to create a reading passage of 400-500 words and 5 multiple-choice questions.
Ensure that the correct answers are varied and not predominantly a single option (e.g., not always 'A').
Return the response in this EXACT JSON format with no extra text:
{{
    "passage": "The reading text here...",
    "questions": [
        {{
            "question": "Question text here?",
            "options": {{"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}},
            "correct_answer": "B",
            "explanation": "Why this answer is correct"
        }}
    ]
}}"""
        messages = [{"role": "system", "content": system_prompt}]
        response = await self._generate_chat_completion(messages, temperature=0.4)
        return self._parse_json_response(response, "generate_reading_test")

    async def generate_listening_test(self, level: str) -> Optional[Dict[str, Any]]:
        """Генерирует сценарии для аудирования (скрипты и вопросы)."""
        print(f"[DEBUG] Generating listening test for level: {level}")
        
        try:
            system_prompt = f"""
You are an expert English language teacher creating 5 listening comprehension scenarios for {level} level students.
For each scenario, provide an audio script and one related multiple-choice question.
Return the response in this EXACT JSON format with no extra text:
{{
    "scenarios": [
        {{
            "audio_script": "The text to be spoken for the first scenario...",
            "question": "What is the main topic of the first scenario?",
            "options": {{"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}},
            "correct_answer": "A",
            "explanation": "Explanation of the correct answer."
        }}
    ]
}}"""
            messages = [{"role": "system", "content": system_prompt}]
            response = await self._generate_chat_completion(messages, temperature=0.8)
            
            if not response:
                print(f"[ERROR] No response from OpenAI for listening test generation")
                return {"error": "No response from OpenAI"}
            
            result = self._parse_json_response(response, "generate_listening_test")
            print(f"[DEBUG] Generated listening test result: {result}")
            
                                           
            if not result or "scenarios" not in result:
                print(f"[ERROR] Invalid listening test structure: {result}")
                return {"error": "Invalid test structure from OpenAI"}
            
            scenarios = result.get("scenarios", [])
            if not scenarios or len(scenarios) == 0:
                print(f"[ERROR] No scenarios generated in listening test")
                return {"error": "No scenarios generated"}
            
                                    
            for i, scenario in enumerate(scenarios):
                required_fields = ["audio_script", "question", "options", "correct_answer"]
                missing_fields = [field for field in required_fields if not scenario.get(field)]
                if missing_fields:
                    print(f"[ERROR] Scenario {i+1} missing fields: {missing_fields}")
                    return {"error": f"Scenario {i+1} missing required fields: {missing_fields}"}
            
            return result
            
        except Exception as e:
            print(f"[ERROR] Exception in generate_listening_test: {e}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            return {"error": f"Exception during generation: {str(e)}"}

    async def generate_writing_test(self, level: str) -> Optional[Dict[str, Any]]:
        """Генерирует задания для письменной части."""
        system_prompt = f"""
You are an English language teacher creating 1 writing prompt for {level} level students.
Provide clear instructions and evaluation criteria.
Return the response in this EXACT JSON format with no extra text:
{{
    "prompts": [
        {{
            "title": "Writing Task 1: An Email",
            "prompt": "Detailed writing prompt for the first task...",
            "instructions": "Specific instructions for the task.",
            "word_count": 150,
            "time_limit": 20,
            "evaluation_criteria": ["Grammar", "Vocabulary", "Coherence", "Task Completion"]
        }}
    ]
}}"""
        messages = [{"role": "system", "content": system_prompt}]
        response = await self._generate_chat_completion(messages, temperature=0.8)
        return self._parse_json_response(response, "generate_writing_test")

    async def generate_speaking_test(self, level: str) -> Optional[Dict[str, Any]]:
        """Генерирует вопросы для устной части."""
        system_prompt = f"""
You are an English language teacher creating 5 speaking assessment questions for {level} level students.
Include a variety of types: personal, opinion, situational, and descriptive.
Return the response in this EXACT JSON format with no extra text:
{{
    "questions": [
        {{
            "type": "personal",
            "question": "Can you tell me about your hometown?",
            "follow_up": "What is the most interesting place to visit there?",
            "preparation_time": 15,
            "speaking_time": 60,
            "evaluation_criteria": ["Fluency", "Accuracy", "Vocabulary", "Pronunciation"]
        }}
    ]
}}"""
        messages = [{"role": "system", "content": system_prompt}]
        response = await self._generate_chat_completion(messages, temperature=0.8)
        return self._parse_json_response(response, "generate_speaking_test")

    async def generate_full_test(self, level: str) -> Dict[str, Any]:
        """Генерирует полный тест, выполняя все секции параллельно с кэшированием."""
        if not self.client:
            msg = "Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in backend/.env"
            return {
                "reading": {"error": msg},
                "listening": {"error": msg},
                "writing": {"error": msg},
                "speaking": {"error": msg},
            }
        from app.core.cache import acached

        from app.core.cache import cache
        pregenerated_key = f"pregenerated_test:{level}"
        pregenerated_test = await cache.aget(pregenerated_key)
        
        if pregenerated_test:
                                                            
            await cache.adelete(pregenerated_key)
            return pregenerated_test
        
                                                                              
        async def cached_generate_reading():
            cache_key = f"test_section_{level}_reading"
            cached = await cache.aget(cache_key)
            if cached and not (isinstance(cached, dict) and "error" in cached):
                return cached
            result = await self.generate_reading_test(level)
            if not (isinstance(result, dict) and "error" in result):
                await cache.aset(cache_key, result, ttl=1800)
            return result
        
        async def cached_generate_listening():
            cache_key = f"test_section_{level}_listening"
            cached = await cache.aget(cache_key)
            if cached and not (isinstance(cached, dict) and "error" in cached):
                return cached
            result = await self.generate_listening_test(level)
            if not (isinstance(result, dict) and "error" in result):
                await cache.aset(cache_key, result, ttl=1800)
            return result
        
        async def cached_generate_writing():
            cache_key = f"test_section_{level}_writing"
            cached = await cache.aget(cache_key)
            if cached and not (isinstance(cached, dict) and "error" in cached):
                return cached
            result = await self.generate_writing_test(level)
            if not (isinstance(result, dict) and "error" in result):
                await cache.aset(cache_key, result, ttl=1800)
            return result
        
        async def cached_generate_speaking():
            cache_key = f"test_section_{level}_speaking"
            cached = await cache.aget(cache_key)
            if cached and not (isinstance(cached, dict) and "error" in cached):
                return cached
            result = await self.generate_speaking_test(level)
            if not (isinstance(result, dict) and "error" in result):
                await cache.aset(cache_key, result, ttl=1800)
            return result
        
        tasks = [
            cached_generate_reading(),
            cached_generate_listening(),
            cached_generate_writing(),
            cached_generate_speaking()
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        test_data = {
            "reading": results[0] if not isinstance(results[0], Exception) else {"error": str(results[0])},
            "listening": results[1] if not isinstance(results[1], Exception) else {"error": str(results[1])},
            "writing": results[2] if not isinstance(results[2], Exception) else {"error": str(results[2])},
            "speaking": results[3] if not isinstance(results[3], Exception) else {"error": str(results[3])}
        }
        
                       
        for section, data in test_data.items():
            if isinstance(data, dict) and "error" in data:
                print(f"[ERROR] {section} generation failed: {data['error']}")
            else:
                print(f"[DEBUG] {section} generation successful: {type(data)}")
        
        print(f"[DEBUG] Full test data generated for level {level}: {test_data}")
        
        return test_data

    def evaluate_reading_answer(self, question: str, correct_answer: str, user_answer: str) -> Dict[str, Any]:
        """Локально оценивает ответ на вопрос с выбором варианта. Экономит API вызовы."""
        is_correct = user_answer.strip().upper() == correct_answer.strip().upper()
        score = 100.0 if is_correct else 0.0
        feedback = f"{'Correct.' if is_correct else 'Incorrect.'} The correct answer was '{correct_answer}'."
        return {"score": score, "feedback": feedback}

    async def evaluate_writing_answer(self, prompt: str, user_answer: str, level: str) -> Optional[Dict[str, Any]]:
        """Оценивает письменный ответ с помощью AI."""
        system_prompt = f"""
You are an English teacher strictly evaluating a writing task for a {level} level student.
Criteria (each 0-25):
1. Grammar
2. Vocabulary
3. Coherence & Cohesion
4. Task Completion & Relevance — THE MOST IMPORTANT.  Give 0 if the response does not address the prompt or is obviously off-topic.  Give 5 or less if it only partially answers the prompt.

If the response is mostly irrelevant (e.g. answers another question such as "London is the capital of Great Britain"), the TOTAL score must not exceed 40.

Return ONLY valid JSON in the following format with no additional keys or text:
{{
    "score": 85.0,
    "breakdown": {{"grammar": 22, "vocabulary": 20, "coherence": 23, "task_completion": 20}},
    "feedback": "Detailed feedback with strengths and areas for improvement.",
    "suggestions": ["Specific suggestion 1", "Specific suggestion 2"]
}}"""
        user_prompt = f"Writing Prompt: {prompt}\n\nStudent Response: {user_answer}\n\nEvaluate this writing response."
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        
        response = await self._generate_chat_completion(messages, temperature=0.5)
        parsed_response = self._parse_json_response(response, "evaluate_writing_answer")

                                                              
        if parsed_response:
            return parsed_response
        return {
            "score": 50.0, "feedback": "Could not automatically evaluate the response. Manual review required.",
            "breakdown": {}, "suggestions": []
        }

    async def evaluate_speaking_answer(self, question: str, transcribed_text: str, level: str) -> Optional[Dict[str, Any]]:
        """Оценивает устный ответ по его транскрипции."""
        system_prompt = f"""
You are an English teacher evaluating a speaking response for a {level} level student.
You receive ONLY the transcription, so disregard pronunciation and focus on MEANING.

Criteria (0-25 each):
• Fluency (discourse markers, pauses)
• Vocabulary range and accuracy
• Grammar range and accuracy
• Task Achievement & Relevance — give 0 if the response is off-topic.  Off-topic answers must not get a total score higher than 40.

Return ONLY valid JSON in this format with no other text:
{{
    "score": 75.0,
    "breakdown": {{"fluency": 18, "vocabulary": 19, "grammar": 17, "task_achievement": 21}},
    "feedback": "Brief but specific feedback.",
    "suggestions": ["Suggestion 1", "Suggestion 2"]
}}"""
        user_prompt = f"Speaking Question: {question}\n\nTranscribed Response: {transcribed_text}\n\nEvaluate this speaking response."
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]

        response = await self._generate_chat_completion(messages, temperature=0.5)
        parsed_response = self._parse_json_response(response, "evaluate_speaking_answer")
        
        if parsed_response:
            return parsed_response
        return {
            "score": 50.0, "feedback": "Could not automatically evaluate the response. Manual review required.",
            "breakdown": {}, "suggestions": []
        }

    def calculate_cefr_level(self, reading_score: float, listening_score: float, 
                           writing_score: float, speaking_score: float) -> str:
        """Рассчитывает итоговый уровень CEFR по баллам секций."""
        overall_score = (reading_score + listening_score + writing_score + speaking_score) / 4
        
        if overall_score >= 90: return "C2"
        if overall_score >= 80: return "C1"
        if overall_score >= 70: return "B2"
        if overall_score >= 60: return "B1"
        if overall_score >= 50: return "A2"
        return "A1"

openai_service = OpenAIService()