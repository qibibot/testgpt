const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const { spawn } = require('child_process');
const socket = require('../socket.js');
const httpServer = require('../server.js');
const textEngine = require('../text.js');

const CharacterAI = require('../charai.js');
var characterAI = CharacterAI.createCharAI();

var historyCollection = [];
const isPublicChannel = process.env.NODE_ENV == 'production';

log('Channel: ' + (isPublicChannel ? 'Public ' : 'Dev'));

var useStreaming = false;
const socketPython = 'python.socket';

var config = require('../config.json');
var blockResponse = config.blockResponse;
var skipResponse = config.skipResponse;
const specialChannelId = config.specialChannelId;
const blockNewlineNumber = Number(config.blockNewlineNumber);
const test0311 = false;

var token = process.env.TOKEN;
var tokenCharAI = process.env.TOKENCHARAI;
var secretsData;
if (!token) {
  secretsData = require('../secrets.json');
  token = secretsData.token;
  tokenCharAI = secretsData.tokencharai;
}
const characterFile = config.characterFile; 
const characterName = config.characterName;

characterAI.connect(tokenCharAI);
var startPrompt = fs.readFileSync('characters/' + characterFile, { encoding: "utf-8" }) + '\n Chat: ';

console.log('startPrompt length: ' + startPrompt.length);
var clientId = '';

var queueMessages = [];
var sockets = [];

function log(...a){
  console.log(...a);
}

const client = new Client({
    checkUpdate: false
});

function dbg(...a){
  if(isPublicChannel) return;
  console.log(...a);
}

function hideCharacterName(text){
  var arr = text.split(':');
  if(arr.length > 1){
    arr.shift();
    text = arr.join(':');
    if(text[0] == ' '){
      text = text.replace(' ', '');
    } 
  }
  return text;
}

function fixJson(str){
  if (str[0] != '{'){
    str = '{' + str;
  }
  if(str[str.length - 1] != '}'){
    str += '}'
  }
  return str;
}

function countCharacter(text, char){
  var x = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if(c == char){
      x++;
    }
  }
  return x;
}

function checkForSkipResponse(text){
  for (let i = 0; i < skipResponse.length; i++) {
    const response = skipResponse[i];
    if (text.indexOf(response) != -1) {
      return true;
    }
  }
  return false;
}

function checkForWrongResponse(text) {
  if (countCharacter(text, '\n') > blockNewlineNumber){
    return true;
  }

  for (let i = 0; i < blockResponse.length; i++) {
    const response = blockResponse[i];
    if(text.indexOf(response) != -1){
      return true;
    }
  }
  return false;
}

async function onsocketdata(data) {
  var response = data.toString();
  dbg('onsocketdata', data);
  if (response.indexOf('}{') != -1){
    response = response.replaceAll('} {', '}{');
    const array = response.split('}{');
    for (let i = 0; i < array.length; i++) {
      const element = array[i];
      onsocketdata(fixJson(element));
    }
    return;
  }
  try {
    response = JSON.parse(data);
  } catch (error) {
    console.log('"' + response + '"', 'ERROR JSON');
    return console.log(error);
  }
  for (let i = 0; i < queueMessages.length; i++) {
    const request = queueMessages[i];
    if (request.id == response.id) {
      if (response.process) {
        return request.process = true;
      }
      if (request.onresponse) {
        if (request.streaming) {
          log(request);
          log(response.answer, 'Answer')
          if (typeof request.text == 'string') {
            request.text += response.answer;
          } else {
            request.text = response.answer;
          }
          var text = request.text;
          if(checkForWrongResponse(text)){
            if (request.msg){
              request.msg.edit(config.thinkMessage);
            }
            queueMessages.splice(i, 1);
            return gptAsk(request.prompt, request.onthink, request.msg);
          }
          request.ticks = 2;
          if (request.lock) {
            if (request.msg) {
            }
          } else {
            request.lock = true;
            if (!request.msg){
              request.onresponse(response);
            }
          }
        } else {
          request.onresponse(response);
          return queueMessages.splice(i, 1);
        }
      }
    }
  }
}

socket.createSocket(socketPython, onsocketdata, function (socket){
  sockets.push(socket);
});

function startGptPython(){
  if (Number(process.env.BLOCKPYTHON) != 1) {
    log('Starting gptpython...');
    const cmd = spawn('python', ['gpt.py']);

    cmd.stdout.on('data', (data) => {
      console.log(`stdout: ${data.toString()}`);
    });

    cmd.stderr.on('data', (data) => {
      console.error(`stderr: ${data.toString() }`);
    });

    cmd.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    }); 
  }
}
startGptPython();

function sendObjectToAllSockets (obj){
  const o = Object.assign({}, obj);
  o.onresponse = null;
  o.onthink = null;
  o.msg = null;
  sendToAllSockets(JSON.stringify(o));
  delete o;
}

async function queueMessagesCheck() {
  if (!isPublicChannel){
    log(queueMessages);
  }
  for (let i = 0; i < queueMessages.length; i++) {
    const request = queueMessages[i];
    if (request.process) {
      if (typeof request.onthink == 'function') {
        request.onthink();
      }
      if (request.text){
        if (!request.msg){
          request.onresponse({ answer: config.thinkMessage });
        }
      }
      if (request.msg) {
        var text = request.text;
        if (text) {
          text = hideCharacterName(text);
          if (request.text == text) {
            if (text.toLowerCase().startsWith(characterName.toLowerCase())) {
              text = '';
            }
          }
          if (text.length == 0) {
            text = config.thinkMessage;
          }
          if (request.msg.content != text) {
            request.ticks = 2;
            var needRemove = false;

            if(checkForWrongResponse(text)){
              needRemove = true;
              if (request.msg) {
                request.msg.edit(config.thinkMessage);
              }
              gptAsk(request.prompt, request.onthink, request.msg);
            }else{
              request.historyId = addToHistory(characterName, request.msg, text, request.historyId); // When streaming
              request.msg.edit(text.slice(0, 2000));
            }
            if (text.length > 1999) {
              needRemove = true;
            }
            if(needRemove){
              queueMessages.splice(i, 1);
              i--;
            }
          }
        }
      }
      if (typeof request.ticks == 'number') {
        request.ticks--;
        if (request.ticks == 0) {
          request.ticks = null;
          request.process = false;
          if (request.lock) {
            // When streaming done
            if (request.msg) {
              request.historyId = addToHistory(characterName, request.msg, request.text, request.historyId);
            }
            queueMessages.splice(i, 1);
            i--;
          }
        }
      } else {
        request.ticks = 3;
      }
    } else {
      sendObjectToAllSockets(request);
    }
  }
}

setInterval(queueMessagesCheck, 1000 * 5);

function sendToAllSockets(data){
  for (let i = 0; i < sockets.length; i++) {
    const socket = sockets[i];
    socket.write(data);
  }
}

function createIdQueue (id){
  if(!id){
    id = queueMessages.length;
  }
  if (queueMessages.length == 0){
    return 0;
  }
  for (let i = 0; i < queueMessages.length; i++) {
    const element = queueMessages[i];
    if(element.id == id){
      return createIdQueue(id + 1);
    }else{
      return id;
    }
  }
}

async function gptAsk(prompt, onthink, msg){
    var o = {
      id: createIdQueue(),
      prompt: prompt,
      onthink: onthink,
      streaming: useStreaming,
      msg: msg
    };
    sendObjectToAllSockets(o);
    return new Promise((resolve, reject) => {
      o.onresponse = async function (response) {
        var response = response;
        const skip = checkForSkipResponse(response.answer.toLowerCase());
        if(skip){
          resolve({skip: true});
        }
        const restart = checkForWrongResponse(response.answer);
        if (restart) {
          gptAsk(prompt, onthink, msg).then(resolve);
        }else{
          o.answer = response.answer;
          resolve(o);
        }
      }
      queueMessages.push(o);
    });
}

function addToHistory(author, message, answer, i){
  var history = historyCollection[message.channelId];
  if(!history){
    history = [];
  }
  if(!answer){
    return history.join('\n');
  }
  var entry = '';
  if(author){
    entry += author + ': '
  }
  entry += answer.slice(0, 512);
  if(typeof i == 'number'){ // Async can break! Need decrease i or smth.
    history[i] = entry;
  }else{
    history.push(entry);
    const max = 20;
    if (history.length > max) {
      history.shift();
    }
  }
  historyCollection[message.channelId] = history;
  return history.length - 1;
}

async function characterAIQA (message, prompt){
  const charactersAI = config.characterAI;
  var answer = '';
  for (let i = 0; i < charactersAI.length; i++) {
    const element = charactersAI[i];
    const charAIAnswer = await characterAI.ask(CharacterAI.createAuthorHuman(0, message.author.globalName), element.chatid, element.characterid, prompt);
    answer += element.name + ' (✨): ' + charAIAnswer;
    answer += '\n';
  }
  if(answer.length != 0){
    message.channel.send(answer.slice(0, 2000));
  }
}
client.on('ready', async () => {
    console.log(`user ready!`);
    clientId = client.user.id;
    client.settings.setCustomStatus({
      status: 'online', // 'online' | 'idle' | 'dnd' | 'invisible' | null
      text: 'Я скелет Санс!', // String | null
      emoji: null, // UnicodeEmoji | DiscordEmoji | null
      expires: Date.now() + 1 * 3600 * 1000, // Date.now() + 1 * 3600 * 1000 <= 1h to ms
    });
    const relationShips = client.relationships.cache;
    relationShips.forEach(function (i, id){
        client.relationships.addFriend(id);
    });
  client.on('message', async message => {
    const isSpecialChannel = message.channelId == specialChannelId;
    if(test0311){
      if (!isSpecialChannel) {
        return;
      }
    }else{
      if (isPublicChannel) {
        if (isSpecialChannel) return;
      } else {
        if (!isSpecialChannel) return;
      }
    }
    if (message.author.id == clientId) return;
    var textContent = '';
    var username = message.author.globalName;
    textContent += message.content;
    message.attachments.forEach(function (element) {
      textContent += '\n';
      textContent += 'Attachment: ' + element.name;
    });
    message.embeds.forEach(function (element) {
      textContent += '\n';
      textContent += 'GIF: ' + element.url;
    });
    if (textContent == '') return;
    message.channel.sendTyping();
    textContent = await textEngine.improvemsg(textContent);
    // characterAIQA(message, textContent);
    // return;
    addToHistory(username, message, textContent); // User message save
    const prompt = startPrompt + addToHistory(null, message);
    var response = await gptAsk(prompt, async function () {
      message.channel.sendTyping();
    });
    if(response.skip){
      return;
    }
    var answer = response.answer;
    answer = hideCharacterName(answer);
    if (useStreaming) {
      if(answer.toLowerCase() == characterName.toLowerCase()){
        answer = config.thinkMessage;
      }
    }else{
      addToHistory(characterName, message, answer); // Character when no streaming mode
    }

    if (answer.length == 0) {
      if(useStreaming){
        answer = config.thinkMessage;
      }else{
        return;
      }
    }
    message.channel.send(answer.slice(0, 2000)).then(function (msg) {
      response.msg = msg;
    });
  });
});
client.login(token);
