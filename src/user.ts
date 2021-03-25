import { Socket } from 'socket.io';

export interface User {
    socket: Socket

    id: string
    name: string
    is_administrator: boolean
};

let username_to_id_map = new Map<string, string>();

export function register_username(name: string, id: string) {
    if (!validate_username(name)) {
        return false;
    }

    username_to_id_map.set(name, id);
    return true;
};

export function kill_username(name: string) {
    username_to_id_map.delete(name);
}

export function validate_username(name: string) {
    return !username_to_id_map.has(name) && /^[a-zA-Z0-9_][a-zA-Z0-9_\@\-\.\#]{2,}$/.test(name);
};

export function find_user_by_name(name: string) {
    return username_to_id_map.get(name);
};

function splite_toplevel_concat(filter_string: string) {
    let matched = 0;
    let buf = '';
    let res: string[] = [];
    for (let c of filter_string) {
        if (c === '(') {
            matched += 1;
        } else if (c === ')') {
            matched -= 1;
        } 
        
        if (c === '+' && matched === 0) {
            res.push(buf);
            buf = '';
        } else {
            buf += c;
        }
    }

    if (buf !== '') { res.push(buf); }
    return res;
}

export function find_user(filter_string_raw: string, users: Map<string, User>, owner_id: string): string[] {
    const parse_lower = (filter: string) => {
        return find_user(filter, users, owner_id);  
    };
    
    // trim spaces (start and end)
    const filter_string = filter_string_raw.replace(/(^\s*)|(\s*$)/g, '');

    const arrayed_map = Array.from(username_to_id_map);
    const id_list = arrayed_map.map(v => v[1]);

    const toplevel_concated = splite_toplevel_concat(filter_string);
    if (toplevel_concated.length > 1) {
        return toplevel_concated.reduce((acc: string[], sub_filter: string): string[] => {
            return acc.concat(parse_lower(sub_filter));
        }, []);
    }

    if (!filter_string.startsWith('@')) {
        const res = find_user_by_name(filter_string);
        if (res) { return [res]; }
        return [];
    }

    if (filter_string === '@1') { return parse_lower('@1(@a)'); }
    if (filter_string === '@A') { return parse_lower('@A(@a)'); }

    if (filter_string === '@a') {
        return id_list;
    }

    if (filter_string === '@o') {
        return id_list.filter(id => id !== owner_id);
    }

    if (filter_string === '@i') {
        return [owner_id];
    }

    if (/^\@1\(.*\)$/.test(filter_string)) {
        const sub_filter = filter_string.match(/^\@1\((.*)\)$/)[1];
        const res = parse_lower(sub_filter);
        return [res[Math.floor(res.length * Math.random())]];
    }

    if (/^\@I\(.*\)$/.test(filter_string)) {
        const sub_filter = filter_string.match(/^\@I\((.*)\)$/)[1];
        if (users.get(sub_filter)) { return [sub_filter]; }
        return [];
    }

    if (/^\@A\(.*\)$/.test(filter_string)) {
        const sub_filter = filter_string.match(/^\@A\((.*)\)$/)[1];
        const res = parse_lower(sub_filter);
        return res.filter(id => users.get(id).is_administrator);
    }

    if (/^\@R\([^\&]*\)\&\(.*\)$/.test(filter_string)) {
        const [, regex_filter, sub_filter] = filter_string.match(/^\@R\(([^\&]*)\)\&\((.*)\)$/);
        const target_regex = new RegExp(regex_filter);
        const sub_res = parse_lower(sub_filter);
        return sub_res
            .map(id => [users.get(id).name, id])
            .filter(([name,]) => target_regex.test(name))
            .map(([,id]) => id);
    }

    if (/^\@r\([^\&]*\)\&\(.*\)$/.test(filter_string)) {
        const [, regex_filter, sub_filter] = filter_string.match(/^\@r\(([^\&]*)\)\&\((.*)\)$/);
        return parse_lower(`@R(^${regex_filter}$)&(${sub_filter})`);
    }

    if (/^\@r\(.*\)$/.test(filter_string)) {
        return parse_lower(`${filter_string}&(@a)`);
    }

    if (/^\@R\(.*\)$/.test(filter_string)) {
        return parse_lower(`${filter_string}&(@a)`);
    }


    if (/^\@-\([^\&]*\)\&\(.*\)$/.test(filter_string)) {
        const [, full_expr, sub_expr] = filter_string.match(/^\@-\(([^\&]*)\)\&\((.*)\)$/);
        const full_res = parse_lower(full_expr);
        const sub_res = parse_lower(sub_expr);
        return full_res.filter(id => !sub_res.includes(id));
    }

    return [];
}


let admin_passcode: string;
function refreash_admin_passcode() {
    admin_passcode = Math.random().toString();
    console.log('Admin passcode is:', admin_passcode);
    return admin_passcode;
}
refreash_admin_passcode();

export function grant_access(user: User, code: string) {
    if (admin_passcode === code) {
        user.is_administrator = true;
    }
};

