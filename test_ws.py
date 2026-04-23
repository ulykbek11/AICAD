import asyncio
from websockets.sync.client import connect

def test():
    try:
        with connect('ws://localhost:8000/api/ws/123') as ws:
            print('Connected!')
            ws.send('{"prompt":"test"}')
            res = ws.recv()
            print(res)
    except Exception as e:
        print('Error:', e)
test()
