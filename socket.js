const fs = require('fs');
const net = require('net');

var connections = {};
const isPublicChannel = process.env.NODE_ENV == 'production';

function createServer(socket, onmessage, newsocket) {
    console.log('Socket created.');
    var server = net.createServer(function (stream) {
        stream.on('error', function (err){
            console.log(err);
        });

        // Store all connections so we can terminate them if the server closes.
        var self = Date.now();
        connections[self] = (stream);
        stream.on('end', function () {
            console.log('Client disconnected.');
            delete connections[self];
        });
        stream.on('data', function (msg) {
            onmessage(msg);
            msg = msg.toString();
            if (!isPublicChannel){
                console.log('Client:', msg);
            }
        });
    })
        .listen(socket)
        .on('connection', function (socket) {
            newsocket(socket);
            socket.write('ok');
        });
    return server;
}

var shutdown = false;

exports.createSocket = function (socketfile, onmessage, newsocket){
    console.log('Checking for leftover socket.');
    var server;
    fs.stat(socketfile, function (err, stats) {
        if (err) {
            // start server
            console.log('No leftover socket found.');
            server = createServer(socketfile, onmessage, newsocket); return;
        }
        // remove file then start server
        console.log('Removing leftover socket.')
        fs.unlink(socketfile, function (err) {
            if (err) {
                // This should never happen.
                console.error(err); process.exit(0);
            }
            server = createServer(socketfile, onmessage, newsocket); return;
        });
    });

    // close all connections when the user does CTRL-C
    function cleanup() {
        if (!shutdown) {
            shutdown = true;
            console.log('\n', "Closing sockets.", '\n');
            if (Object.keys(connections).length) {
                let clients = Object.keys(connections);
                while (clients.length) {
                    let client = clients.pop();
                    connections[client].write('bye');
                    connections[client].end();
                }
            }
            server.close();
            process.exit(0);
        }
    }
    process.on('SIGINT', cleanup);
}