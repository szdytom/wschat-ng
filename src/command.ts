import { User, validate_username, kill_username, register_username, grant_access, find_user } from './user';
import { Server as SocketServer, Socket } from 'socket.io';
import { set_room, all_rooms } from './room';

export function is_command(cmd: string) {
    return cmd.startsWith('/');
};

function command_reply(msg: string, socket: Socket) {
    socket.emit('command-block-reply', msg);
}

function mask_room_name(name: string) {
    if (name === 'global') {
        return name;
    }
    return `costum-room#${name}`;
}

function unmask_room_name(name: string) {
    if (name === 'global') {
        return name;
    }

    if (name.startsWith('costum-room#')) {
        return name.substring(12);
    }

    return null;
}

export function run_command(cmd: string, uid: string, users: Map<string, User>, io: SocketServer, silent: boolean = false) {
    if (!is_command(cmd)) { return; }

    const user = users.get(uid);
    const socket = user.socket;
    const command_reply = (msg: string) => {
        if (silent) { return; }
        socket.emit('command-block-reply', msg);
    };

    const cmd_set = cmd.split(/\s+/);

    if (cmd.startsWith('/disconnect')) {
        command_reply('Diconnecting. Bye!',);
        socket.disconnect();
        return;
    }

    if (cmd.startsWith('/join')) {
        const room_name = cmd_set[1];
        set_room(room_name);
        const masked_name = mask_room_name(room_name);
        socket.join(masked_name);
        command_reply('OK.');
        return;
    }

    if (cmd.startsWith('/ls')) {
        if (cmd_set[1] === 'own') {
            command_reply(JSON.stringify(
                Array
                .from(socket.rooms)
                .map(x => unmask_room_name(x))
                .filter(x => x !== null)
            ));
            return;
        }

        command_reply(JSON.stringify(all_rooms()));
        return;
    }

    if (cmd.startsWith('/rename')) {
        const new_name = cmd_set[1].toString();
        if (validate_username(new_name)) {
            kill_username(user.name);
            register_username(new_name, user.id);
            user.name = new_name;
            command_reply(`Renamed to ${new_name}.`);
        } else {
            command_reply('Failed to rename.');
        }
        return;
    }

    if (cmd.startsWith('/whoami')) {
        command_reply(JSON.stringify({
            name: user.name,
            id: user.id,
            is_administrator: user.is_administrator,
        }));
        return;
    }

    if (cmd.startsWith('/ps')) {
        let result = '[';
        users.forEach(user => {
            result += `"${user.name}",`;
        });
        result = result.substring(0, result.length - 1) + ']';
        command_reply(result);
        return;
    }

    if (cmd.startsWith('/su')) {
        const code = cmd_set[1];
        grant_access(user, code);
        command_reply('You are administartor now.');
        return;
    }

    if (cmd.startsWith('/resign')) {
        user.is_administrator = false;
        command_reply('OK.');
        return;
    }

    if (cmd.startsWith('/filter')) {
        const filter_string = cmd.substring('/filter'.length);
        command_reply(JSON.stringify(find_user(filter_string, users, uid)));
        return;
    }
};
