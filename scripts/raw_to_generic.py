import json
import sys

if __name__ == "__main__":
  if len(sys.argv) < 2:
    print("Usage: python raw_to_generic.py <input_file>")
    sys.exit(1)
  with open(sys.argv[1], "r") as f:
    data = json.load(f)

  generic_data = []
  for item in data:
    generic_item = {
        "date": item["date"].replace("/", "-"),
        "description": item["description"],
        "amount": item["amount"],
        "currency": "CAD",
        "account": item["source"],
        "tags": item["tags"],
    }
    generic_data.append(generic_item)

  json.dump(generic_data, sys.stdout, indent=2)
