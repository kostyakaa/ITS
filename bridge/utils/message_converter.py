def convert_msg_to_dict(msg: str):
    splited = msg.split(" ")

    if len(splited) < 3:
        return {
            "type": "unknown",
            "meta": msg
        }

    return {
        "type": splited[0],
        "action": splited[1],
        "id": splited[2],
        "meta": splited[3:] if len(splited) > 3 else ""
    }
