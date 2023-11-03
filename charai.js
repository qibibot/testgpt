const WebSocket = require('ws');
let crypto;
try {
    crypto = require('node:crypto');
} catch (err) {
    console.error('crypto support is disabled!');
}

function ws_log(...a){
    return;
    console.log(...a);
}

function createAuthorHuman(author_id, name){
    return {
        author_id: author_id.toString(),
        name: name.toString(),
        is_human: true
    }
}

function parseMessage(data) {
    var o;
    try {
        o = JSON.parse(data);
        ws_log('@Received: ', o);
    } catch (error) {
        ws_log('@Received: ', data);
    }
    if(!o) return;
    const turn = o.turn;
    if (!turn) return;
    const command = o.command;
    if (command != 'update_turn') return;
    if (!turn.create_time) return;
    const isOK = turn.state == 'STATE_OK';
    if (!isOK) return;
    const isHuman = turn.is_human;
    if (isHuman) return;
    const cmd = turn.candidates
    const answer = turn.candidates[0].raw_content;
    return answer;
}

function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function generate_cmd (author, chat_id, character_id, text){
    const turn_id = uuidv4();
    const request_id = uuidv4();
    var o = {
        "command": "create_and_generate_turn",
        "request_id": request_id,
        "payload": {
            "num_candidates": 1,
            "character_id": character_id,
            "turn": {
                "turn_key": {
                    "turn_id": turn_id,
                    "chat_id": chat_id
                },
                "author": author,
                "candidates": [{
                    "candidate_id": turn_id,
                    "raw_content": text,
                }], "primary_candidate_id": turn_id
            }
        }
    };
    const req = JSON.stringify(o);
    ws_log('@Request: ' + req);
    return req;
}

function createCharAI(token){
    var obj = {};
    obj.token = token;
    obj.connect = async function (token){
        if(token){
            obj.token = token;
        }
        const options = {
            headers: {
                Cookie: 'HTTP_AUTHORIZATION="Token ' + obj.token + '"'
            }
        };
        obj.ws = new WebSocket('wss://neo.character.ai/ws/', options);
        return new Promise((resolve, reject) => {
            obj.ws.on('open', function open() {
                resolve(obj.ws);
            });
            obj.ws.on('error', console.error);
            obj.ws.on('message', function (data) {
                const answer = parseMessage(data);
                if(answer){
                    if(obj.askResolve){
                        obj.askResolve(answer);
                        obj.askResolve = null;
                    }
                }
            });
        });
    }
    obj.ask = async function (author, chat_id, character_id, text){
        if(obj.ws.readyState != 1){
            await obj.connect();
        }
        const req = generate_cmd(author, chat_id, character_id, text);
        obj.ws.send(req);
        return new Promise((resolve, reject) => {
            obj.askResolve = resolve;
        });
    }
    return obj;
}

exports.createCharAI = createCharAI;
exports.createAuthorHuman = createAuthorHuman;

async function test(){
    const token = 'x';
    const characterAI = createCharAI(token);
    await characterAI.connect(token);
    console.log('Ready!');

    const author = createAuthorHuman(0, 'User');
    const chat_id = 'y';
    const character_id = 'kP-kNGIi7VswePS8cw-q1Wd_6NcJMeAJkqkJqWjM9Cc';
    const text = 'Who are you?';
    console.log('Question: ', text);

    const answer = await characterAI.ask(author, chat_id, character_id, text);
    console.log('Answer: ', answer);
}
// test();