const axios = require('axios');
const HTMLParser = require('node-html-parser');

function findURLinText(text) {
    text = text.replaceAll(' ', '\n');
    const array =  text.split('\n');
    var urls = [];
    for (let i = 0; i < array.length; i++) {
        const element = array[i];
        try {
            urls.push(new URL(element));
        } catch (error) {
            
        }
    }
    return urls;
}

async function urlinfo (url) {
    var response;
    try {
        response = await axios.get(url);
    } catch (error) {
        return;
    }
    const data = response.data;
    if(!data) return;
    var parse;
    try {
        parse = HTMLParser.parse(data);
    } catch (error) {
        return;
    }
    const headElements = parse.getElementsByTagName('head')[0].querySelectorAll('*');
    var description = '';
    var values = [];
    for (let i = 0; i < headElements.length; i++) {
        const element = headElements[i];
        if (element.rawTagName == 'title'){
            description += 'Title: ' + element.textContent;
            description += ' ';
        }else{
            if(element.attributes){
                const content = element.attributes.content;
                if (content){
                    if (values.indexOf(content) == -1){
                        if(content != 'undefined'){
                            if (content.indexOf('://') == -1){
                                if (Number.isNaN(Number(content))){
                                    if (element.attributes.name) {
                                        description += element.attributes.name;
                                        description += ': ';
                                    }
                                    if (element.attributes.property) {
                                        description += element.attributes.property;
                                        description += ': ';
                                    }
                                    values.push(content);
                                    description += content;
                                    description += ' ';
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // console.log(description);
    return description;
}

async function improvemsg(text) {
    const urls = findURLinText(text);
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        var description = url.href;
        const out = await urlinfo(url.href);
        if(out){
            description += '\nDesc. URL: [';
            description += out + ']';
        }
        text = text.replaceAll(url.href, description);
    }
    return text;
}

exports.improvemsg = improvemsg;

async function test (){
    const input = `

    `;
    var out = await improvemsg(input);
    console.log(out);
    setTimeout(async function name(params) {
        setInterval(async function name(params) {
        }, 10000);
    },10000);
}
