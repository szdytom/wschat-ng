import { User, validate_username, kill_username, register_username, grant_access, find_user } from './user';
import { Server as SocketServer, Socket } from 'socket.io';
import { set_room, all_rooms } from './room';

export function is_command(cmd: string) {
    return cmd.startsWith('/');
};

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

export function run_command(cmd_raw: string, uid: string, users: Map<string, User>, io: SocketServer, silent: boolean = false) {
    const cmd = cmd_raw.replace(/(^\s*)|(\s*$)/, '');
    
    if (!is_command(cmd)) { return; }

    const user = users.get(uid);
    const socket = user.socket;
    const command_reply = (msg: string) => {
        if (silent) { return; }
        socket.emit('command-block-reply', msg);
    };

    const system_reply = (msg: string, socket: Socket) => {
        socket.emit('system-message', msg);
    };

    const request_administrator_access = () => {
        if (user.is_administrator) { return true; }

        command_reply('You must be an administrator to run this command.');
        return false;
    };

    const safe_find_user = (filter_string: string) => {
        let res: string[];
        try {
            res = find_user(filter_string, users, uid);
        } catch (err) {
            res = [];
        }

        return res;
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
        if (cmd === '/ls') {
            command_reply(JSON.stringify(all_rooms()));
            return;
        }
        
        const filter_string = cmd.substring('/ls'.length);
        const target = safe_find_user(filter_string)[0];

        if (target === undefined) {
            command_reply('Target user not found.');
            return;
        }

        command_reply(JSON.stringify(
            Array
            .from(users.get(target).socket.rooms)
            .map(x => unmask_room_name(x))
            .filter(x => x !== null)
        ));
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
        if (cmd === '/ps') {
            command_reply(JSON.stringify(Array
                .from(users)
                .map(x => x[1].name)
            ));
            return;
        }
        
        const filter_string = cmd.substring('/ps'.length);
        const checked_user = safe_find_user(filter_string);
        command_reply(JSON.stringify(Array
            .from(users)
            .filter(([id,]) => checked_user.includes(id))
            .map(x => x[1].name)
        ));
        return;
    }

    if (cmd.startsWith('/su')) {
        const code = cmd_set[1];
        if (grant_access(user, code)) { command_reply('You are administartor now.'); }
        else { command_reply('Code incorrect.'); }
        return;
    }

    if (cmd.startsWith('/resign')) {
        user.is_administrator = false;
        command_reply('OK.');
        return;
    }

    if (cmd.startsWith('/filter')) {
        const filter_string = cmd.substring('/filter'.length);
        command_reply(JSON.stringify(safe_find_user(filter_string)));
        return;
    }

    if (cmd.startsWith('/whois')) {
        const id = cmd_set[1];
        command_reply(users.get(id).name);
        return;
    }

    if (cmd.startsWith('/kill')) {
        if (!request_administrator_access()) { return; }

        const filter_string = cmd.substring('/kill'.length);
        const checked_user = safe_find_user(filter_string);
        for (let id of checked_user) {
            const target = users.get(id).socket;
            system_reply('Your are killed.', target);
            target.disconnect();
        }

        command_reply(JSON.stringify(checked_user));
    }
};
