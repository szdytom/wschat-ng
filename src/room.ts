const room_list = new Array();

export function set_room(name: string) {
    if (!check_room(name)) {
        room_list.push(name);
    }
};

export function check_room(name: string) {
    return room_list.includes(name);
};

export function all_rooms() {
    return room_list;
};
