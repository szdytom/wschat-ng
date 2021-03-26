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
        return name.substring('costum-room#'.length);
    }

    return null;
}

export function send_message({ msg, sender }: { msg: string; sender: string; }, io: SocketServer, socket: Socket) {
    io.in(Array.from(socket.rooms)).emit('new message', {
        type: 'text-message',
        data: msg,
        sender: sender,
    });
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
    const msg = cmd.replace(/^[^\n]+\n/m, '');

    const command_map: Map<string, (prefix: string) => void> = new Map();
    const admin_command_map: Map<string, (prefix: string) => void> = new Map();

    command_map.set('disconnect', () => {
        command_reply('Diconnecting. Bye!',);
        socket.disconnect();
    });

    command_map.set('join', () => {
        const room_name = cmd_set[1];
        set_room(room_name);
        const masked_name = mask_room_name(room_name);
        socket.join(masked_name);
        command_reply('OK.');
    });

    command_map.set('ls', (prefix: string) => {
        if (cmd === prefix) {
            command_reply(JSON.stringify(all_rooms()));
            return;
        }
        
        const filter_string = cmd.substring(prefix.length);
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
    });

    command_map.set('rename', () => {
        const new_name = cmd_set[1].toString();
        if (validate_username(new_name)) {
            kill_username(user.name);
            register_username(new_name, user.id);
            user.name = new_name;
            command_reply(`Renamed to ${new_name}.`);
        } else {
            command_reply('Failed to rename.');
        }
    });

    command_map.set('whoami', () => {
        command_reply(JSON.stringify({
            name: user.name,
            id: user.id,
            is_administrator: user.is_administrator,
        }));
    });

    command_map.set('ps', (prefix: string) => {
        if (cmd === prefix) {
            command_reply(JSON.stringify(Array
                .from(users)
                .map(x => x[1].name)
            ));
            return;
        }
        
        const filter_string = cmd.substring(prefix.length);
        const checked_user = safe_find_user(filter_string);
        command_reply(JSON.stringify(Array
            .from(users)
            .filter(([id,]) => checked_user.includes(id))
            .map(x => x[1].name)
        ));
    });

    command_map.set('su', () => {
        const code = cmd_set[1];
        if (grant_access(user, code)) { command_reply('You are administartor now.'); }
        else { command_reply('Code incorrect.'); }
    });

    command_map.set('resign', () => {
        user.is_administrator = false;
        command_reply('OK.');
    });

    command_map.set('filter', (prefix: string) => {
        const filter_string = cmd.substring(prefix.length);
        command_reply(JSON.stringify(safe_find_user(filter_string)));
    });

    command_map.set('whois', () => {
        const id = cmd_set[1];
        command_reply(users.get(id).name);
    });

    admin_command_map.set('kill', (prefix: string) => {
        const filter_string = cmd.substring(prefix.length);
        const checked_user = safe_find_user(filter_string);
        for (let id of checked_user) {
            const target = users.get(id).socket;
            system_reply('Your are killed.', target);
            target.disconnect();
        }
    
        command_reply(JSON.stringify(checked_user));
    });

    command_map.set('anon', () => {
        send_message({ msg: msg, sender: 'Anonymous User'}, io, socket);
    });

    if (user.is_administrator) {
        for (let val of admin_command_map) {
            const [prefix, executor] = val;
            const command_prefix = '/' + prefix;
            if (cmd.startsWith(command_prefix)) {
                executor(command_prefix);
                return;
            }
        };
    }

    for (let val of command_map) {
        const [prefix, executor] = val;
        const command_prefix = '/' + prefix;
        if (cmd.startsWith(command_prefix)) {
            executor(command_prefix);
            return;
        }
    }

    command_reply(`Bad command: "${cmd.match(/^\/[^\s]+/)[0]}".`);
};
