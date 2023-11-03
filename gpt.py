import g4f
import socket
import os
import threading
import json
import time

socket_path = 'python.socket'
client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
def onresponse(response_data=None, client=None):
    string = response_data.decode()
    if(string == 'ok'):
        return
    o = {}
    try:
        o = json.loads(string)
    except ValueError:
        return
    streaming = o['streaming']
    process_o = {
        "id": o['id'],
        "process": True,
        "streaming": streaming
    }
    client.sendall(json.dumps(process_o).encode())

    gpt_response = g4f.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": o['prompt']}],
        stream=streaming
    )
    response_o = {
        "id": o['id'],
        "answer": gpt_response,
        "streaming": streaming
    }
    if(streaming):
        for message in gpt_response:
            response_o['answer'] = message
            client.sendall(json.dumps(response_o).encode())
    else:
        client.sendall(json.dumps(response_o).encode())

while (True):
    if (os.path.exists(socket_path)):
        noconnection = False
        try:
            test = client.getpeername()
        except:
            noconnection = True
        if(noconnection):
            client.connect(socket_path)
        response_data = client.recv(1024*1024*1024)
        t = threading.Thread(target=onresponse, args=(response_data, client,))
        t.start()
    else:
        print('Client: no socket')
        time.sleep(1)
client.close()