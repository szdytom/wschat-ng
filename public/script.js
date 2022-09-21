import io from 'socket.io-client';
import $ from 'jquery';
import {Remarkable} from 'remarkable';
import DOMPurify from 'dompurify';
import rkatex from 'remarkable-katex';
import hljs from 'highlightjs';
import 'highlightjs/styles/tomorrow.css';
import 'katex/dist/katex.min.css'


let username;
let is_reconnection = false;
let last_command = null;

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

function render_chess(msg) {
    if (!msg.toUpperCase().includes("!{LC}")) {
        return msg;
    }

    url = msg.substring(msg.indexOf("(") + 1, msg.indexOf(")"));
    if (url.length == 0) {
        return msg;
    }

    if (url.toUpperCase() == "TV") {
        return '<iframe src="https://lichess.org/tv/frame?theme=brown&pieceSet=staunty&bg=light" style="width: 400px; height: 444px;" allowtransparency="true" frameborder="0"></iframe>';
    }
    if (url.toUpperCase() == "TRAINING" || url.toUpperCase() == "PUZZLE") {
        return `<iframe src="https://lichess.org/training/frame?theme=brown&pieceSet=staunty&bg=light" style="width: 400px; height: 444px;" allowtransparency="true" frameborder="0"></iframe>`;
    }
    return `<iframe src="https://lichess.org/embed/${url}?theme=brown&pieceSet=staunty&bg=light" width=600 height=397 frameborder=0></iframe>`;
}

function render_bilibili(msg) {
    if (!msg.toUpperCase().includes("!{BI}")) {
        return msg;
    }

    url = msg.substring(msg.indexOf("(") + 1, msg.indexOf(")"));
    if (url.length == 0) {
        return msg;
    }

    return `<iframe src="//player.bilibili.com/player.html?bvid=${url}&page=1&as_wide=1&high_quality=1&danmaku=0" allowfullscreen="allowfullscreen" width="600" height="397" scrolling="no" frameborder="0" sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts"></iframe>`
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

    rendered_message = render_chess(rendered_message);
    rendered_message = render_bilibili(rendered_message);

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
        msg: 'Notification permission are use to get you informated. Please allow it.',
        is_private: true,
        plain: true,
    });
    await Notification.requestPermission();

    await login_name();

    md = new Remarkable({
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
    
    md.use(rkatex);
    md.inline.ruler.enable(['mark', 'sup', 'sub']);

    const ws = new io();

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
    $('#prompt-background').show();

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

async function get_url_query(query_name) {
    return new Promise(resolve => {
        var reg = new RegExp("(^|&)" + query_name + "=([^&]*)(&|$)", "i");
        var r = window.location.search.substr(1).match(reg);
        var context = "";
        if (r != null)
            context = r[2];
        reg = null;
        r = null;
        resolve(context == null || context == "" || context == "undefined" ? "" : context);
    });
}

async function login_name() {
    username = await get_url_query("name")

    if (username === undefined || username.length == 0) {
        username = await open_prompt('[Login] Input your name');
    }
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

document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === 'visible') { unread_message = 0; }
    $('title').text(`WebSocket Chat Room`);
});
