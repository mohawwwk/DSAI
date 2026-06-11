import asyncio
import json
from local_backend import get_groq_api_key, get_gemini_client, call_generate_content

async def main():
    print('GROQ_KEY_SET', bool(get_groq_api_key()))
    client = get_gemini_client()
    prompt = ['Summarize the poem The Road Not Taken in one sentence.']
    try:
        result = await call_generate_content(client, prompt)
        print('RESULT', json.dumps(result, indent=2))
    except Exception as e:
        print('EXCEPTION', type(e).__name__, str(e))
        import traceback; traceback.print_exc()

asyncio.run(main())
