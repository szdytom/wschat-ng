let username;
let is_reconnection = false;
let last_command = null;
const server = `ws://${location.host}`;
const ws = init();

function clear_message() {
    $('#message').empty();
}

function clear_send() {
    $('#send').val('');
}

function format_time(time) {
    return `${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`;
}

if (String.prototype.replaceAll === undefined) {
    String.prototype.replaceAll = function(before, after) {
        let res = '';
        let matched = 0;
        for (let i = 0; i < this.length; i += 1) {
            if (this[i] === before[matched]) {
                matched += 1;
                if (matched === before.length) {
                    res += after;
                    matched = 0;
                }
            } else {
                for (let j = i - matched; j <= i; j += 1) {
                    res += this[j];
                }
                matched = 0;

            }
        }

        for (let i = this.length - matched; i < this.length; ++i) {
            res += this[i];
        }

        return res;
    };
}

function write_message(data) {
    const message = data.msg;

    let message_class = '';
    let message_source = data.from;
    if (data.type === 'system-message') {
        message_class = 'msg-from-info';
        message_source = 'SYSTEM INFO';
    } else if (data.type === 'command-block') {
        message_class = 'msg-from-cb';
        message_source = 'COMMAND BLOCK';
    }


    $('#message').append(
`
<div class="msg">
    <span class="msg-from ${message_class} ${(data.is_private ? 'msg-private' : '')}">
        ${message_source}
        <span class="msg-time">${format_time(new Date())}</span>
    </span>
    <br>
    <span class="msg-content">
        <pre>${message}</pre>
    </span>
</div>
`
    );
    scroll_to_bottom();
}

function init() {
    clear_message();
    login_name();

    const ws = new io(server);
    console.log('ws: ', ws);

    ws.on('connect', () => {
        if (is_reconnection) {
            write_message({
                from: 'INFO',
                msg: 'Reconnected.',
                is_private: true,
            });
        } else {
            write_message({
                from: 'INFO',
                msg: 'Connected.',
                is_private: true,
            });
            is_reconnection = true;
        }
        ws.emit('set-name', username);
    });

    ws.on('system-message', msg => {
        write_message({
            type: 'system-message',
            msg: msg,
            is_private: true,
        });
    });

    ws.on('new message', evt => {
        write_message({
            type: 'normal',
            from: evt.sender,
            msg: evt.data,
        });
    });

    ws.on('command-block-reply', data => {
        write_message({
            type: 'command-block',
            msg: `>> ${last_command}\n<- ${data}`,
            is_private: true,
        });
    });

    ws.on('disconnect', () => {
        write_message({
            type: 'system-message',
            msg: 'Disconnected.',
            is_private: true,
        });
    });

    return ws;
}

function open_prompt(content, tilte) {
    return window.prompt(content);
}

function login_name() {
    username = open_prompt('[Login] Input your name');
}

function send() {
    let data = $('#send').val();
    if (data === '') {
        return;
    }

    if (data === '/clear' || data === '/cls') {
        clear_message();
        clear_send();
        return;
    }

    if (data.startsWith('/')) {
        // a command
        last_command = data;
    }

    if (data.startsWith('/su')) {
        // a administrator login command.
        // now ask for passcode
        const code = open_prompt('Please input the passcode');
        data = `/su ${code}`;
    }

    if (ws.connected) {
        ws.emit('message', data);
    } else {
        write_message({
            type: 'system-message',
            msg: 'Socket not connected or has already disconnected. Failed to send.',
            is_private: true,
        });
    }

    clear_send();
}

function scroll_to_bottom() {
    if ($('#scroll-option').is(':checked')) {
        document.getElementById('message').scrollTop = document.getElementById('message').scrollHeight;
    }
}


document.addEventListener('keydown', function(key_event) {
    if (key_event.code === 'Enter' && key_event.ctrlKey) {
        key_event.preventDefault();
        send();
    }
});
