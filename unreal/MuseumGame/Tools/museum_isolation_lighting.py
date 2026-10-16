"""Author editable native lighting for the existing Room of Isolation.

The export owns room and performer coordinates. This script owns only actors
tagged MuseumIsolationLighting, so rerunning the import is deterministic.
"""

import math
import unreal as u


TAG = u.Name("MuseumIsolationLighting")
TILE_CM = 50.0


def _owned(actor):
    return any(str(tag) == str(TAG) for tag in actor.get_editor_property("tags"))


def _mark(actor, label):
    actor.set_actor_label(label)
    actor.set_editor_property("tags", [TAG])
    return actor


def _component(actor, kind):
    matches = actor.get_components_by_class(kind)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {kind} on {actor.get_actor_label()}")
    return matches[0]


def _display_mount(station):
    """Physical case and stand for the shared 70 x 99 cm score surface."""
    cube = u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")
    case = u.EditorAssetLibrary.load_asset("/Game/MuseumGame/Materials/M_Display")
    stand = u.EditorAssetLibrary.load_asset("/Game/MuseumGame/Materials/M_Wall")
    if not cube or not case or not stand:
        raise RuntimeError("Museum display mounting materials are missing")
    scale = float(station.get("scale", 1))
    yaw = 90 if station["facing"] == "north" else -90
    angle = math.radians(yaw)
    foot_z = 30 + float(station.get("elevation", 0)) * 100
    floor_z = foot_z - 30

    def place(label, local_x, local_y, z, dimensions, material):
        x = station["tileX"] * TILE_CM + (local_x * math.cos(angle) - local_y * math.sin(angle)) * scale
        y = station["tileY"] * TILE_CM + (local_x * math.sin(angle) + local_y * math.cos(angle)) * scale
        actor = _mark(u.EditorLevelLibrary.spawn_actor_from_class(
            u.StaticMeshActor, u.Vector(x, y, z), u.Rotator(yaw=yaw)
        ), f"Isolation | {station['id']} | {label}")
        mesh = _component(actor, u.StaticMeshComponent)
        mesh.set_static_mesh(cube)
        mesh.set_material(0, material)
        actor.set_actor_scale3d(u.Vector(*(value / 100 for value in dimensions)))
    panel_z = foot_z + 155 * scale
    case_bottom = panel_z - 51.5 * scale
    stand_height = case_bottom - floor_z
    place("score case", 11, -180, panel_z, (6 * scale, 75 * scale, 103 * scale), case)
    place("score stand", 11, -180, floor_z + stand_height / 2, (7 * scale, 7 * scale, stand_height), stand)
    place("score base", 11, -180, floor_z + 3, (35 * scale, 50 * scale, 6), stand)


def create_isolation_lighting(data):
    room = next((r for r in data["rooms"] if r["id"] == "isolation"), None)
    stations = sorted(
        (p for p in data["performers"] if p["id"].startswith("iso-") and p["id"][4:].isdigit()),
        key=lambda p: p["id"],
    )
    if room is None or len(stations) != 6:
        raise RuntimeError("The approved six-station Isolation room is missing")

    for actor in u.EditorLevelLibrary.get_all_level_actors():
        if _owned(actor):
            u.EditorLevelLibrary.destroy_actor(actor)

    bounds = room["bounds"]
    center_x = (bounds["x"] + bounds["width"] / 2) * TILE_CM
    center_y = (bounds["y"] + bounds["height"] / 2) * TILE_CM

    # Aim each key at the face and upper torso from the front quarter. Unreal
    # Python Rotator arguments are roll, pitch, yaw, so use named angles.
    for station in stations:
        _display_mount(station)
        facing = 1 if station["facing"] == "north" else -1
        foot_z = 30 + float(station.get("elevation", 0)) * 100
        location = u.Vector(station["tileX"] * TILE_CM - 120,
                            station["tileY"] * TILE_CM + facing * 180,
                            foot_z + 290)
        target = u.Vector(station["tileX"] * TILE_CM,
                          station["tileY"] * TILE_CM,
                          foot_z + 145 * float(station.get("scale", 1)))
        direction = target - location
        rotation = u.Rotator(
            pitch=math.degrees(math.atan2(direction.z, math.hypot(direction.x, direction.y))),
            yaw=math.degrees(math.atan2(direction.y, direction.x)),
        )
        actor = _mark(u.EditorLevelLibrary.spawn_actor_from_class(
            u.SpotLight, location, rotation
        ), f"Isolation | {station['id']} | shadowed key")
        light = _component(actor, u.SpotLightComponent)
        light.set_mobility(u.ComponentMobility.MOVABLE)
        light.set_editor_property("intensity_units", u.LightUnits.LUMENS)
        light.set_editor_property("intensity", 4000.0)
        light.set_editor_property("attenuation_radius", 650.0)
        light.set_editor_property("inner_cone_angle", 16.0)
        light.set_editor_property("outer_cone_angle", 32.0)
        light.set_source_radius(25.0)
        light.set_editor_property("cast_shadows", True)
        light.set_light_color(u.LinearColor(0.72, 0.83, 1.0, 1.0))

    # Broad low fill holds the walking route and partition silhouettes.
    fill = _mark(u.EditorLevelLibrary.spawn_actor_from_class(
        u.PointLight, u.Vector(center_x, center_y, 380), u.Rotator()
    ), "Isolation | room fill")
    fill_light = _component(fill, u.PointLightComponent)
    fill_light.set_mobility(u.ComponentMobility.MOVABLE)
    fill_light.set_editor_property("intensity_units", u.LightUnits.LUMENS)
    fill_light.set_editor_property("intensity", 2500.0)
    fill_light.set_editor_property("attenuation_radius", max(bounds["width"], bounds["height"]) * TILE_CM)
    fill_light.set_editor_property("cast_shadows", False)
    fill_light.set_light_color(u.LinearColor(0.9, 0.87, 0.8, 1.0))

    # Bound the exposure treatment to this room. The volume is a native map
    # actor: artists can adjust its bounds and exposure in the Details panel.
    volume = _mark(u.EditorLevelLibrary.spawn_actor_from_class(
        u.PostProcessVolume, u.Vector(center_x, center_y, 200), u.Rotator()
    ), "Isolation | controlled exposure")
    volume.set_editor_property("unbound", False)
    volume.set_editor_property("priority", 10.0)
    volume.set_editor_property("blend_radius", 75.0)
    _, extent = volume.get_actor_bounds(False)
    if min(extent.x, extent.y, extent.z) <= 0:
        raise RuntimeError("PostProcessVolume has no editable brush bounds")
    volume.set_actor_scale3d(u.Vector(
        bounds["width"] * TILE_CM / (2 * extent.x),
        bounds["height"] * TILE_CM / (2 * extent.y),
        400.0 / extent.z,
    ))
    settings = volume.get_editor_property("settings")
    # Renderer config enables extended luminance, so these values are EV100.
    # A narrow adaptive range handles a visitor crossing a dim partition or
    # looking straight into the brighter performer pool without flash pumping.
    for name, value in (("auto_exposure_min_brightness", 3.0),
                        ("auto_exposure_max_brightness", 5.0)):
        settings.set_editor_property(name, value)
        settings.set_editor_property("override_" + name, True)
    volume.set_editor_property("settings", settings)
    u.log("MUSEUM_ISOLATION_LIGHTING_OK 6 movable shadowed keys, 1 movable fill, 1 EV100 exposure volume")
