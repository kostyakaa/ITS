def convert_msg_to_dict(msg: str):
    splited = msg.split()

    if len(splited) < 2:
        return {
            "type": "invalid",
            "error": "Unknown message type",
            "meta": {"message": msg}
        }

    if len(splited) == 2:
        action, value = splited
        if action == "time":
            return {
                "type": "time",
                "time": value
            }
        return {
            "type": "invalid",
            "error": "Unknown message type",
            "meta": {"message": msg}
        }

    msg_type, action, object_id = splited[:3]

    try:
        object_id = int(object_id)
    except ValueError:
        return {
            "type": "invalid",
            "error": "Object id must be integer"
        }

    meta = splited[3:]

    if action == "move":
        if len(meta) not in (2, 3):
            return {
                "type": "invalid",
                "error": f"Expected 2 or 3 coordinates, got {len(meta)}"
            }

        try:
            coords = list(map(float, meta))
        except ValueError:
            return {
                "type": "invalid",
                "error": "Coordinates must be numbers"
            }

        return {
            "type": msg_type,
            "action": action,
            "id": object_id,
            "meta": {
                "x": coords[0],
                "y": coords[1],
                "theta": coords[2] if len(coords) == 3 else 0.0
            }
        }

    if meta:
        return {
            "type": "invalid",
            "error": f"Unexpected extra data for action '{action}'",
            "meta": {"data": meta}
        }

    return {
        "type": msg_type,
        "action": action,
        "id": object_id,
        "meta": {}
    }
