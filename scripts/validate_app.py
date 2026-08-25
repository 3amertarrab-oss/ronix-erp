import ast
import json
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def validate_python():
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def validate_toml():
    with (ROOT / "pyproject.toml").open("rb") as handle:
        data = tomllib.load(handle)
    if data.get("project", {}).get("name") != "ronix_erp":
        raise ValueError("pyproject.toml must define project.name = ronix_erp")


def validate_doctype_json():
    doctypes = {}
    table_names = set()
    table_options = []

    for path in ROOT.rglob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("doctype") != "DocType":
            continue

        name = data.get("name")
        if not name:
            raise ValueError(f"Missing DocType name: {path}")
        if name in doctypes:
            raise ValueError(f"Duplicate DocType name: {name}")
        doctypes[name] = path

        fields = data.get("fields", [])
        fieldnames = [field["fieldname"] for field in fields]
        if len(fieldnames) != len(set(fieldnames)):
            raise ValueError(f"Duplicate fieldname in {path}")
        if set(data.get("field_order", [])) != set(fieldnames):
            raise ValueError(f"field_order mismatch in {path}")

        if data.get("istable"):
            table_names.add(name)
        elif not data.get("permissions"):
            raise ValueError(f"Missing permissions in {path}")

        for field in fields:
            if field.get("fieldtype") == "Table":
                table_options.append((path, field.get("options")))

    for path, option in table_options:
        if option not in table_names:
            raise ValueError(f"Unknown child table {option!r} referenced by {path}")


def main():
    validate_python()
    validate_toml()
    validate_doctype_json()
    print("RONIX ERP static validation passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"RONIX ERP validation failed: {exc}", file=sys.stderr)
        raise

