let username;
let is_reconnection = false;
let last_command = null;
const server = `ws://${location.host}`;

let ws;
let md;
let unread_message = 0;

$(() => {
    init().then(x => ws = x).catch(err => console.log(err))
});

function clear_message() {
    $('#message').empty();
}

function clear_send() {
    $('#send').val('');
}

function format_time(time) {
    return `${time.getMonth() + 1}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`;
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

    let rendered_message;
    if (!data.plain) {
        rendered_message = md.render(message);
    } else {
        rendered_message = `${message}`;
    }
    rendered_message = DOMPurify.sanitize(rendered_message);

    $('#message').append(`
<div class="msg">
    <span class="msg-from ${message_class} ${(data.is_private ? 'msg-private' : '')}">
        ${message_source}
    </span>
    <span class="msg-time">${format_time(new Date())}</span>
    <br>
    <span class="msg-content">
        ${rendered_message}
    </span>
</div>
`
    );
    scroll_to_bottom();
}

function notify_new_message(msg, is_private) {
    if (document.visibilityState === 'visible') { return; }
    unread_message += 1;
    $('title').text(`(${unread_message} new message) WebSocket Chat Room`);
    if (Notification.permission === 'granted' || is_private || msg.startsWith(`@${username}`) || msg.endsWith(`@${username}`)) {
        const n = new Notification(`WS-Chat: You have ${unread_message} new messages unread.`);
        setTimeout(() => { n.close() }, 3000);
    }
}

async function init() {
    $('#prompt-data').on('keyup', (e) => {
        if (e.key === 'Enter') { $('#confirm-prompt').click(); }
    });

    clear_message();
    
    write_message({
        type: 'system-message',
        msg: 'Notification permission are use to get you infomated. Please allow it.',
        is_private: true,
        plain: true,
    });
    await Notification.requestPermission();
    
    await login_name();

    md = new remarkable.Remarkable({
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(lang, str).value;
                } catch (err) { }
            }

            try {
                return hljs.highlightAuto(str).value;
            } catch (err) { }

            return '';
        }
    });

    md.inline.ruler.enable(['mark', 'sup', 'sub']);

    const ws = new io(server);

    ws.on('connect', () => {
        if (is_reconnection) {
            write_message({
                type: 'system-message',
                msg: 'Reconnected.',
                is_private: true,
                plain: true,
            });
        } else {
            write_message({
                type: 'system-message',
                msg: 'Connected.',
                is_private: true,
                plain: true,
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
            plain: true,
        });
    });

    ws.on('change username', new_name => {
        username = new_name;
    });

    ws.on('new message', evt => {
        write_message({
            type: 'normal',
            from: evt.sender,
            msg: evt.data,
        });
        notify_new_message(evt.data, false);
    });

    ws.on('private message', evt => {
        write_message({
            type: 'normal',
            from: evt.sender,
            msg: evt.data,
            is_private: true,
        });
        notify_new_message(evt.data, true);
    })

    ws.on('command-block-reply', data => {
        write_message({
            type: 'command-block',
            msg: `>> ${last_command}\n<- ${data}`,
            is_private: true,
            plain: true,
        });
    });

    ws.on('disconnect', () => {
        write_message({
            type: 'system-message',
            msg: 'Disconnected.',
            is_private: true,
            plain: true,
        });
    });

    $('#send').focus();

    return ws;
}

function open_prompt(title) {
    $('#prompt-box-title').text(title);
    $('#prompt-data').val('');
    $('#prompt-box').show('fast', () => { $('#prompt-data').focus(); });

    let resolve_callback;
    let res = new Promise((resolve) => {
        resolve_callback = resolve;
    });

    $('#confirm-prompt').one('click', () => {
        if (resolve_callback) {
            $('#prompt-box').hide('fast');
            $('#prompt-background').hide();
            resolve_callback($('#prompt-data').val());
        }
    });

    return res;
}

async function login_name() {
    username = await open_prompt('[Login] Input your name');
}

async function send() {
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
        const code = await open_prompt('[su] Input the administration passcode');
        data = `/su ${code}`;
    }

    if (ws.connected) {
        ws.emit('message', data);
    } else {
        write_message({
            type: 'system-message',
            msg: 'Socket not connected or has already disconnected. Failed to send.',
            is_private: true,
            plain: true,
        });
    }

    clear_send();
}

function scroll_to_bottom() {
    if ($('#scroll-option').is(':checked')) {
        document.getElementById('message').scrollTop = document.getElementById('message').scrollHeight;
    }
}

document.addEventListener('keydown', async function (key_event) {
    if (key_event.code === 'Enter' && key_event.ctrlKey) {
        key_event.preventDefault();
        await send();
    }
});

document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === 'visible') { unread_message = 0; }
    $('title').text(`WebSocket Chat Room`);
});