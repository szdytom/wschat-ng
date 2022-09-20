import SocketIO = require('socket.io');
import Express = require('express');
import http_server = require('http');
import path = require('path');

import { kill_username, register_username, User } from './user';
import { is_command, run_command, send_message } from './command';

const app = Express();
const http = new http_server.Server(app);
const io = new SocketIO.Server(http);

const users = new Map<string, User>();

io.on('connection', socket => {
    const user: User = {
        id: socket.id,
        name: socket.id,
        socket: socket,
        is_administrator: false,
    };
    users.set(socket.id, user);
    register_username(user.name, user.id);

    socket.on('message', msg => {
        if (is_command(msg)) {
            run_command(msg, user.id, users, io);
            return;
        }

        send_message({
            msg: msg,
            sender: user.name,
        }, io, socket);
    });

    socket.on('set-name', name => {
        run_command(`/rename ${name}`, user.id, users, io, true);
    });

    socket.on('disconnect', () => {
        kill_username(user.name);
        users.delete(user.id);
    });
});

app.use('/', Express.static(path.join(__dirname, '../public/dist')));

const server_port = parseInt(process.env.PORT) | 4412;
http.listen(server_port, () => {
    console.log(`Server started on port ${server_port}.`);
});

process.on('SIGINT', () => {
    console.log('\nShutting server...');
    users.forEach(u => {
        u.socket.disconnect();
        console.log(`Disconnected user ${u.name}.`);
    });
    http.close(() => {
        console.log('Closed.');
        process.exit(0);
    });
});