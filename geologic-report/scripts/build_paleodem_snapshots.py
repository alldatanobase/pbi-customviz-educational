"""Convert PALEOMAP PaleoDEM CSV grids into compact D3-ready GeoJSON.

The source grids contain longitude, latitude, and paleoelevation at one-degree
spacing. This script interpolates the zero-elevation coastline between samples
with marching squares, then simplifies the resulting polygons while preserving
topology. Interpolating the contour avoids the one-degree stair steps produced
by tracing the cells of a binary land mask.

Dependencies: contourpy, numpy, shapely
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import contourpy
import numpy as np
from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping
from shapely.geometry.polygon import orient
from shapely.ops import unary_union


AGE_PATTERN = re.compile(r"_(\d{3})Ma\.csv$", re.IGNORECASE)
WORLD_BOUNDS = box(-180, -90, 180, 90)


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    default_source = project_root / "data" / "source" / "paleodem"
    default_output = project_root / "data" / "processed" / "land-snapshots"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=default_source)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--step", type=int, default=10, help="Snapshot interval in millions of years.")
    parser.add_argument("--max-age", type=int, default=540)
    parser.add_argument("--sea-level", type=float, default=0.0)
    parser.add_argument(
        "--simplify",
        type=float,
        default=0.08,
        help="Topology-preserving simplification tolerance in degrees.",
    )
    parser.add_argument(
        "--min-area",
        type=float,
        default=0.15,
        help="Remove polygon pieces smaller than this many square degrees.",
    )
    return parser.parse_args()


def age_from_path(path: Path) -> int | None:
    match = AGE_PATTERN.search(path.name)
    return int(match.group(1)) if match else None


def discover_sources(source_root: Path, step: int, max_age: int) -> list[tuple[int, Path]]:
    by_age: dict[int, Path] = {}
    for path in source_root.rglob("*.csv"):
        age = age_from_path(path)
        if age is not None and age <= max_age and age % step == 0:
            by_age[age] = path

    expected = set(range(0, max_age + 1, step))
    missing = sorted(expected - set(by_age))
    if missing:
        raise RuntimeError(f"Missing PaleoDEM source files for ages: {missing}")

    return sorted(by_age.items())


def load_elevation_grid(path: Path) -> np.ndarray:
    with path.open("r", encoding="utf-8", errors="replace") as source_file:
        first_line = source_file.readline()
    skiprows = 0 if first_line.lstrip().startswith("#") else 1
    rows = np.loadtxt(
        path, delimiter=",", comments="#", skiprows=skiprows, dtype=np.float32
    )
    if rows.shape[1] != 3:
        raise ValueError(f"Expected lon,lat,elev columns in {path}")

    # Keep both -180 and +180. They describe the same meridian, and including
    # both closes the contouring domain cleanly at the antimeridian.
    grid = np.full((181, 361), np.nan, dtype=np.float32)
    lon_index = np.rint(rows[:, 0] + 180).astype(np.int16)
    lat_index = np.rint(90 - rows[:, 1]).astype(np.int16)
    grid[lat_index, lon_index] = rows[:, 2]

    # Some source files omit the duplicate +180 column. Copy whichever side
    # of the seam is present before checking the rest of the grid.
    left_missing = np.isnan(grid[:, 0])
    right_missing = np.isnan(grid[:, -1])
    grid[left_missing, 0] = grid[left_missing, -1]
    grid[right_missing, -1] = grid[right_missing, 0]

    # A few source maps omit one of the poles. Longitude is undefined at a
    # pole, so extend the nearest complete latitude row into the missing row.
    complete_rows = np.flatnonzero(~np.isnan(grid).any(axis=1))
    for row_index in np.flatnonzero(np.isnan(grid).all(axis=1)):
        nearest = complete_rows[np.argmin(np.abs(complete_rows - row_index))]
        grid[row_index, :] = grid[nearest, :]

    if np.isnan(grid).any():
        raise ValueError(f"The PaleoDEM grid is incomplete: {path}")

    # Make the duplicate seam samples identical. This prevents tiny open gaps
    # where rounding in the source gives -180 and +180 different values.
    seam = (grid[:, 0] + grid[:, -1]) / 2
    grid[:, 0] = seam
    grid[:, -1] = seam
    return grid


def polygon_parts(geometry) -> list[Polygon]:
    if geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, GeometryCollection):
        parts: list[Polygon] = []
        for child in geometry.geoms:
            parts.extend(polygon_parts(child))
        return parts
    return []


def elevation_to_geometry(
    elevation: np.ndarray, sea_level: float, simplify: float, min_area: float
):
    """Interpolate the sea-level contour and return polygons above it."""
    longitudes = np.arange(-180, 181, dtype=np.float64)
    latitudes = np.arange(90, -91, -1, dtype=np.float64)
    contour_generator = contourpy.contour_generator(
        x=longitudes,
        y=latitudes,
        z=elevation,
        fill_type="OuterOffset",
        line_type="Separate",
        corner_mask=False,
        quad_as_tri=True,
    )

    # OuterOffset returns one point array per polygon. Its offsets split that
    # array into the exterior ring followed by any interior rings (lakes/seas).
    point_groups, offset_groups = contour_generator.filled(
        sea_level, float(np.max(elevation)) + 1.0
    )
    raw_parts: list[Polygon] = []
    for points, offsets in zip(point_groups, offset_groups):
        rings = [points[start:end] for start, end in zip(offsets[:-1], offsets[1:])]
        if rings:
            raw_parts.extend(polygon_parts(make_valid(Polygon(rings[0], rings[1:]))))

    merged = make_valid(unary_union(raw_parts).intersection(WORLD_BOUNDS))
    simplified = make_valid(merged.simplify(simplify, preserve_topology=True))
    retained = [part for part in polygon_parts(simplified) if part.area >= min_area]
    if not retained:
        raise RuntimeError("No land polygons remained after simplification.")

    result = make_valid(unary_union(retained))

    # D3's spherical polygon convention expects clockwise exterior rings.
    if isinstance(result, Polygon):
        return orient(result, sign=-1.0)
    return MultiPolygon([orient(part, sign=-1.0) for part in polygon_parts(result)])


def count_vertices(geometry) -> int:
    total = 0
    for polygon in polygon_parts(geometry):
        total += len(polygon.exterior.coords)
        total += sum(len(ring.coords) for ring in polygon.interiors)
    return total


def write_snapshot(output_dir: Path, age: int, source: Path, geometry) -> dict:
    filename = f"land-{age:03d}Ma.geojson"
    destination = output_dir / filename
    feature = {
        "type": "Feature",
        "properties": {"ageMa": age},
        "geometry": mapping(geometry),
    }
    payload = {"type": "FeatureCollection", "features": [feature]}
    destination.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=True), encoding="utf-8"
    )
    return {
        "ageMa": age,
        "file": filename,
        "source": source.name,
        "polygons": len(polygon_parts(geometry)),
        "vertices": count_vertices(geometry),
        "bytes": destination.stat().st_size,
    }


def main() -> None:
    args = parse_args()
    sources = discover_sources(args.source, args.step, args.max_age)
    args.output.mkdir(parents=True, exist_ok=True)

    snapshots = []
    for age, source in sources:
        elevation = load_elevation_grid(source)
        geometry = elevation_to_geometry(
            elevation, args.sea_level, args.simplify, args.min_area
        )
        record = write_snapshot(args.output, age, source, geometry)
        snapshots.append(record)
        print(
            f"{age:3d} Ma: {record['polygons']:3d} polygons, "
            f"{record['vertices']:5d} vertices, {record['bytes'] / 1024:6.1f} KiB"
        )

    manifest = {
        "format": "GeoJSON",
        "source": "Scotese and Wright (2018) PALEOMAP PaleoDEM, 1-degree CSV grids",
        "coastlineMethod": "linearly interpolated zero-elevation contour (marching squares)",
        "license": "CC BY 4.0",
        "seaLevelMeters": args.sea_level,
        "stepMa": args.step,
        "simplifyToleranceDegrees": args.simplify,
        "minimumPolygonAreaSquareDegrees": args.min_area,
        "snapshots": snapshots,
    }
    manifest_path = args.output / "snapshots.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    total_bytes = sum(item["bytes"] for item in snapshots)
    print(f"Wrote {len(snapshots)} snapshots and {manifest_path}")
    print(f"Total GeoJSON size: {total_bytes / 1024 / 1024:.2f} MiB")


if __name__ == "__main__":
    main()
